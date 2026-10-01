import {
  ErrorCode,
  FIELD_LIMITS,
  OAuthErrorCode,
  type LinkedAccountsDto,
  type OAuthProviderId,
} from '@taskflow/shared';
import type { Redis } from 'ioredis';
import { timingSafeEqual } from 'node:crypto';
import { BadRequestException, NotFoundException } from '../../common/exceptions';
import type { SessionMeta } from '../../common/http/request-meta';
import type { Clock } from '../../common/utils/clock';
import type { Logger } from '../../common/utils/logger';
import { isUniqueViolation, type Db } from '../../database/prisma';
import { OAuthProvider as DbProvider } from '../../generated/prisma/client';
import type { JobQueue } from '../../jobs/job-queue';
import type { IssuedSession, SessionsService } from '../auth/sessions.service';
import { generateCodeVerifier, generateState } from './providers/oauth2';
import type { NormalizedProfile, OAuthProvider } from './providers/oauth-provider';
import { usernameBase, usernameCandidates } from './username';

export type OAuthMode = 'login' | 'link';

export class OAuthFlowError extends Error {
  constructor(
    readonly code: OAuthErrorCode,
    readonly mode: OAuthMode,
  ) {
    super(code);
    this.name = 'OAuthFlowError';
  }
}

interface StoredState {
  provider: OAuthProviderId;
  codeVerifier: string;
  mode: OAuthMode;
  userId: string | null;
}

export type OAuthOutcome =
  | { mode: 'login'; session: IssuedSession; created: boolean }
  | { mode: 'link'; provider: OAuthProviderId };

export interface CallbackInput {
  code?: string;
  state?: string;
  cookieState?: string;
  error?: string;
}

const STATE_TTL_SECONDS = 10 * 60;
const stateKey = (state: string) => `tf:oauth:${state}`;
const toDb = (provider: OAuthProviderId): DbProvider =>
  provider === 'google' ? DbProvider.GOOGLE : DbProvider.GITHUB;
const fromDb = (provider: DbProvider): OAuthProviderId =>
  provider === DbProvider.GOOGLE ? 'google' : 'github';

function sameState(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Sign-in and account linking with Google/GitHub. Users are matched by the
 * provider account id, never by email, and an OAuth sign-in never attaches
 * itself to an existing password account (pre-account-takeover defence).
 */
export class OAuthService {
  private readonly providers: Map<OAuthProviderId, OAuthProvider>;

  constructor(
    private readonly prisma: Db,
    private readonly redis: Redis,
    providers: OAuthProvider[],
    private readonly sessions: SessionsService,
    private readonly jobs: JobQueue,
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {
    this.providers = new Map(providers.map((provider) => [provider.id, provider]));
  }

  enabledProviders(): OAuthProviderId[] {
    return [...this.providers.keys()];
  }

  async begin(
    providerId: OAuthProviderId,
    mode: OAuthMode,
    userId: string | null,
  ): Promise<{ url: URL; state: string }> {
    const provider = this.providers.get(providerId);
    if (!provider) throw new OAuthFlowError(OAuthErrorCode.OAUTH_PROVIDER_DISABLED, mode);
    // Linking needs a signed-in user; the login page is the right place to recover.
    if (mode === 'link' && !userId) throw new OAuthFlowError(OAuthErrorCode.OAUTH_FAILED, 'login');

    const state = generateState();
    const codeVerifier = generateCodeVerifier();
    const stored: StoredState = { provider: providerId, codeVerifier, mode, userId };
    await this.redis.set(stateKey(state), JSON.stringify(stored), 'EX', STATE_TTL_SECONDS);
    return { url: provider.createAuthorizationUrl(state, codeVerifier), state };
  }

  async complete(
    providerId: OAuthProviderId,
    input: CallbackInput,
    meta: SessionMeta,
  ): Promise<OAuthOutcome> {
    // The state must match the cookie set when the flow started (login CSRF defence)…
    if (!input.state || !input.cookieState || !sameState(input.state, input.cookieState)) {
      throw new OAuthFlowError(OAuthErrorCode.OAUTH_FAILED, 'login');
    }
    // …and can be used only once.
    const raw = await this.redis.getdel(stateKey(input.state));
    const stored = raw ? (JSON.parse(raw) as StoredState) : null;
    if (!stored || stored.provider !== providerId) {
      throw new OAuthFlowError(OAuthErrorCode.OAUTH_FAILED, 'login');
    }
    const { mode } = stored;
    if (input.error || !input.code) throw new OAuthFlowError(OAuthErrorCode.OAUTH_FAILED, mode);

    const provider = this.providers.get(providerId);
    if (!provider) throw new OAuthFlowError(OAuthErrorCode.OAUTH_PROVIDER_DISABLED, mode);

    let profile: NormalizedProfile;
    try {
      profile = await provider.exchangeCode(input.code, stored.codeVerifier);
    } catch (err) {
      this.logger.warn({ err, provider: providerId }, 'OAuth code exchange failed');
      throw new OAuthFlowError(OAuthErrorCode.OAUTH_FAILED, mode);
    }

    if (mode === 'link') {
      await this.link(stored.userId!, providerId, profile);
      return { mode: 'link', provider: providerId };
    }

    const { userId, created } = await this.findOrCreateUser(providerId, profile);
    const session = await this.sessions.create(userId, { persistent: true, ...meta });
    return { mode: 'login', session, created };
  }

  async listAccounts(userId: string): Promise<LinkedAccountsDto> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        passwordHash: true,
        oauthAccounts: {
          select: { provider: true, email: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    return {
      hasPassword: user.passwordHash !== null,
      providers: user.oauthAccounts.map((account) => ({
        provider: fromDb(account.provider),
        email: account.email,
        connectedAt: account.createdAt.toISOString(),
      })),
    };
  }

  async unlink(userId: string, providerId: OAuthProviderId): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { passwordHash: true, oauthAccounts: { select: { id: true, provider: true } } },
      });
      const account = user.oauthAccounts.find((entry) => entry.provider === toDb(providerId));
      if (!account) throw new NotFoundException('Connected account');
      if (user.passwordHash === null && user.oauthAccounts.length === 1) {
        throw new BadRequestException(
          'Set a password or connect another account before disconnecting this one.',
          ErrorCode.CANNOT_UNLINK_LAST_METHOD,
        );
      }
      await tx.oAuthAccount.delete({ where: { id: account.id } });
    });
  }

  private async link(
    userId: string,
    providerId: OAuthProviderId,
    profile: NormalizedProfile,
  ): Promise<void> {
    const provider = toDb(providerId);
    const existing = await this.prisma.oAuthAccount.findUnique({
      where: {
        provider_providerAccountId: { provider, providerAccountId: profile.providerAccountId },
      },
      select: { userId: true },
    });
    if (existing) {
      if (existing.userId === userId) return;
      throw new OAuthFlowError(OAuthErrorCode.ACCOUNT_ALREADY_LINKED, 'link');
    }
    try {
      await this.prisma.oAuthAccount.create({
        data: {
          userId,
          provider,
          providerAccountId: profile.providerAccountId,
          email: profile.email,
        },
      });
    } catch (err) {
      // The user already has a different account of this provider, or a race.
      if (isUniqueViolation(err)) {
        throw new OAuthFlowError(OAuthErrorCode.ACCOUNT_ALREADY_LINKED, 'link');
      }
      throw err;
    }
  }

  private async findOrCreateUser(
    providerId: OAuthProviderId,
    profile: NormalizedProfile,
  ): Promise<{ userId: string; created: boolean }> {
    const provider = toDb(providerId);
    const linked = await this.prisma.oAuthAccount.findUnique({
      where: {
        provider_providerAccountId: { provider, providerAccountId: profile.providerAccountId },
      },
      select: { userId: true },
    });
    if (linked) return { userId: linked.userId, created: false };

    if (!profile.email || !profile.emailVerified) {
      throw new OAuthFlowError(OAuthErrorCode.OAUTH_EMAIL_UNVERIFIED, 'login');
    }
    const email = profile.email.trim().toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email }, select: { id: true } })) {
      throw new OAuthFlowError(OAuthErrorCode.OAUTH_ACCOUNT_EXISTS, 'login');
    }

    const base = usernameBase(profile.usernameHint ?? email.split('@')[0]);
    const firstName = (profile.firstName.trim() || base).slice(0, FIELD_LIMITS.firstName.max);
    const lastName = profile.lastName.trim().slice(0, FIELD_LIMITS.lastName.max);

    for (const username of usernameCandidates(base, 6)) {
      const taken = await this.prisma.user.findUnique({
        where: { username },
        select: { id: true },
      });
      if (taken) continue;
      try {
        const user = await this.prisma.user.create({
          data: {
            firstName,
            lastName,
            username,
            email,
            emailVerifiedAt: this.clock.now(),
            oauthAccounts: {
              create: { provider, providerAccountId: profile.providerAccountId, email },
            },
          },
          select: { id: true },
        });
        await this.importAvatar(user.id, profile.avatarUrl);
        return { userId: user.id, created: true };
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
        // Email or provider account created concurrently: resolve like a fresh attempt.
        const winner = await this.prisma.oAuthAccount.findUnique({
          where: {
            provider_providerAccountId: { provider, providerAccountId: profile.providerAccountId },
          },
          select: { userId: true },
        });
        if (winner) return { userId: winner.userId, created: false };
        if (await this.prisma.user.findUnique({ where: { email }, select: { id: true } })) {
          throw new OAuthFlowError(OAuthErrorCode.OAUTH_ACCOUNT_EXISTS, 'login');
        }
        // Otherwise the username was taken in the meantime; try the next candidate.
      }
    }
    throw new OAuthFlowError(OAuthErrorCode.OAUTH_FAILED, 'login');
  }

  /** Sign-in never waits for (or fails because of) the avatar download. */
  private async importAvatar(userId: string, url: string | null): Promise<void> {
    if (!url) return;
    try {
      await this.jobs.enqueue('avatar.import', { userId, url });
    } catch (err) {
      this.logger.warn({ err }, 'Could not queue the avatar import');
    }
  }
}
