import type { Redis } from 'ioredis';
import { UnauthorizedException } from '../../common/exceptions';
import type { SessionMeta } from '../../common/http/request-meta';
import type { Clock } from '../../common/utils/clock';
import type { Logger } from '../../common/utils/logger';
import {
  generateSecret,
  safeEqualHex,
  sha256Hex,
  type AccessTokenService,
  type SignedToken,
} from '../../common/utils/tokens';
import type { Db } from '../../database/prisma';

export const SESSION_GRACE_MS = 30_000;
const DAY_MS = 86_400_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface SessionConfig {
  accessTtlMinutes: number;
  refreshTtlDays: number;
  rememberTtlDays: number;
}

export interface IssuedSession {
  sessionId: string;
  persistent: boolean;
  access: SignedToken;
  refresh: SignedToken;
  /** This browser's device token, to store in its device cookie. */
  deviceToken?: string;
}

/** Told about every new session (used for "new sign-in" alerts). */
export interface SignInRecorder {
  /** Returns the device token the browser should keep. */
  recordSignIn(userId: string, meta: SessionMeta): Promise<string>;
}

export type RefreshResult =
  | ({ kind: 'rotated'; userId: string } & IssuedSession)
  | { kind: 'grace'; userId: string; sessionId: string; access: SignedToken };

export const sessionCacheKey = (sessionId: string) => `tf:session:${sessionId}`;

export function parseRefreshToken(raw: unknown): { sessionId: string; secret: string } | null {
  if (typeof raw !== 'string') return null;
  const dot = raw.indexOf('.');
  if (dot <= 0) return null;
  const sessionId = raw.slice(0, dot);
  const secret = raw.slice(dot + 1);
  if (!UUID_PATTERN.test(sessionId) || secret.length < 32 || secret.length > 128) return null;
  return { sessionId, secret };
}

export class SessionsService {
  constructor(
    private readonly prisma: Db,
    private readonly redis: Redis,
    private readonly accessTokens: AccessTokenService,
    private readonly clock: Clock,
    private readonly logger: Logger,
    private readonly config: SessionConfig,
    private readonly signIns?: SignInRecorder,
  ) {}

  async create(
    userId: string,
    options: { persistent: boolean } & SessionMeta,
  ): Promise<IssuedSession> {
    const now = this.clock.now();
    const days = options.persistent ? this.config.rememberTtlDays : this.config.refreshTtlDays;
    const expiresAt = new Date(now.getTime() + days * DAY_MS);
    const secret = generateSecret();

    const session = await this.prisma.session.create({
      data: {
        userId,
        refreshTokenHash: sha256Hex(secret),
        persistent: options.persistent,
        userAgent: options.userAgent,
        ipAddress: options.ip,
        expiresAt,
        lastUsedAt: now,
      },
      select: { id: true },
    });

    const access = await this.accessTokens.sign({ userId, sessionId: session.id });
    return {
      sessionId: session.id,
      persistent: options.persistent,
      access,
      refresh: { token: `${session.id}.${secret}`, expiresAt },
      deviceToken: await this.recordSignIn(userId, options),
    };
  }

  /** A failing alert must never block signing in. */
  private async recordSignIn(userId: string, meta: SessionMeta): Promise<string | undefined> {
    if (!this.signIns) return undefined;
    try {
      return await this.signIns.recordSignIn(userId, meta);
    } catch (err) {
      this.logger.warn({ err, userId }, 'Could not record the sign-in device');
      return meta.deviceToken ?? undefined;
    }
  }

  async refresh(rawToken: unknown, meta: SessionMeta): Promise<RefreshResult> {
    const parsed = parseRefreshToken(rawToken);
    if (!parsed) throw new UnauthorizedException();

    const now = this.clock.now();
    let session = await this.prisma.session.findUnique({ where: { id: parsed.sessionId } });
    if (!session || session.revokedAt || session.expiresAt <= now) {
      throw new UnauthorizedException();
    }

    const presented = sha256Hex(parsed.secret);

    if (safeEqualHex(presented, session.refreshTokenHash)) {
      const secret = generateSecret();
      const rotated = await this.prisma.session.updateMany({
        where: { id: session.id, refreshTokenHash: presented, revokedAt: null },
        data: {
          refreshTokenHash: sha256Hex(secret),
          previousTokenHash: presented,
          rotatedAt: now,
          lastUsedAt: now,
          userAgent: meta.userAgent,
          ipAddress: meta.ip,
        },
      });
      if (rotated.count === 1) {
        const access = await this.accessTokens.sign({
          userId: session.userId,
          sessionId: session.id,
        });
        return {
          kind: 'rotated',
          userId: session.userId,
          sessionId: session.id,
          persistent: session.persistent,
          access,
          refresh: { token: `${session.id}.${secret}`, expiresAt: session.expiresAt },
        };
      }
      // Another request rotated this token a moment ago; evaluate it against the new state.
      session = await this.prisma.session.findUnique({ where: { id: parsed.sessionId } });
      if (!session || session.revokedAt) throw new UnauthorizedException();
    }

    const withinGrace =
      session.previousTokenHash !== null &&
      session.rotatedAt !== null &&
      safeEqualHex(presented, session.previousTokenHash) &&
      now.getTime() - session.rotatedAt.getTime() <= SESSION_GRACE_MS;

    if (withinGrace) {
      const access = await this.accessTokens.sign({
        userId: session.userId,
        sessionId: session.id,
      });
      return { kind: 'grace', userId: session.userId, sessionId: session.id, access };
    }

    await this.revoke(session.id);
    this.logger.warn(
      { sessionId: session.id, userId: session.userId },
      'Refresh token reuse detected; session revoked',
    );
    throw new UnauthorizedException();
  }

  async isActive(sessionId: string): Promise<boolean> {
    const key = sessionCacheKey(sessionId);
    try {
      if (await this.redis.get(key)) return true;
    } catch (err) {
      this.logger.warn({ err }, 'Session cache unavailable; checking the database');
    }

    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { revokedAt: true, expiresAt: true },
    });
    const now = this.clock.now();
    const active = session !== null && session.revokedAt === null && session.expiresAt > now;

    if (active) {
      const secondsLeft = Math.floor((session.expiresAt.getTime() - now.getTime()) / 1000);
      const ttl = Math.max(1, Math.min(this.config.accessTtlMinutes * 60, secondsLeft));
      try {
        await this.redis.set(key, '1', 'EX', ttl);
      } catch (err) {
        this.logger.warn({ err }, 'Could not cache session');
      }
    }
    return active;
  }

  async findSessionIdByRefreshToken(rawToken: unknown): Promise<string | null> {
    const parsed = parseRefreshToken(rawToken);
    if (!parsed) return null;
    const session = await this.prisma.session.findUnique({
      where: { id: parsed.sessionId },
      select: { refreshTokenHash: true, previousTokenHash: true },
    });
    if (!session) return null;
    const presented = sha256Hex(parsed.secret);
    const matches =
      safeEqualHex(presented, session.refreshTokenHash) ||
      (session.previousTokenHash !== null && safeEqualHex(presented, session.previousTokenHash));
    return matches ? parsed.sessionId : null;
  }

  async revoke(sessionId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: this.clock.now() },
    });
    await this.clearCache([sessionId]);
  }

  async revokeAllForUser(
    userId: string,
    options: { exceptSessionId?: string } = {},
  ): Promise<void> {
    const sessions = await this.prisma.session.findMany({
      where: {
        userId,
        revokedAt: null,
        ...(options.exceptSessionId ? { id: { not: options.exceptSessionId } } : {}),
      },
      select: { id: true },
    });
    if (sessions.length === 0) return;
    const ids = sessions.map((session) => session.id);
    await this.prisma.session.updateMany({
      where: { id: { in: ids } },
      data: { revokedAt: this.clock.now() },
    });
    await this.clearCache(ids);
  }

  async clearCache(sessionIds: string[]): Promise<void> {
    if (sessionIds.length === 0) return;
    try {
      await this.redis.del(...sessionIds.map(sessionCacheKey));
    } catch (err) {
      this.logger.warn({ err }, 'Could not clear the session cache');
    }
  }
}
