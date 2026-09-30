import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { ErrorCode } from '@taskflow/shared';
import { errors, jwtVerify, SignJWT } from 'jose';
import { UnauthorizedException } from '../exceptions';
import type { Clock } from './clock';

const ISSUER = 'taskflow-api';
const AUDIENCE = 'taskflow-web';

export interface SignedToken {
  token: string;
  expiresAt: Date;
}

export interface AccessTokenClaims {
  userId: string;
  sessionId: string;
}

export function generateSecret(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}

export class AccessTokenService {
  private readonly key: Uint8Array;

  constructor(
    secret: string,
    private readonly ttlMinutes: number,
    private readonly clock: Clock,
  ) {
    this.key = new TextEncoder().encode(secret);
  }

  async sign(claims: AccessTokenClaims): Promise<SignedToken> {
    const now = this.clock.now();
    const expiresAt = new Date(now.getTime() + this.ttlMinutes * 60_000);
    const token = await new SignJWT({ sid: claims.sessionId })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(claims.userId)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt(Math.floor(now.getTime() / 1000))
      .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
      .sign(this.key);
    return { token, expiresAt };
  }

  async verify(token: string): Promise<AccessTokenClaims> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        algorithms: ['HS256'],
        issuer: ISSUER,
        audience: AUDIENCE,
        currentDate: this.clock.now(),
      });
      if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') {
        throw new UnauthorizedException();
      }
      return { userId: payload.sub, sessionId: payload.sid };
    } catch (err) {
      if (err instanceof errors.JWTExpired) {
        throw new UnauthorizedException('Your session has expired.', ErrorCode.TOKEN_EXPIRED);
      }
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException();
    }
  }
}
