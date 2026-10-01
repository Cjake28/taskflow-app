import { createHmac, timingSafeEqual } from 'node:crypto';
import { NOTIFICATION_TYPES, type NotificationType } from '@taskflow/shared';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Signed, stateless unsubscribe tokens: `base64url(userId.type).base64url(hmac)`. They name one
 * user and one notification type and only ever turn an email off, so they do not expire.
 */
export class UnsubscribeTokens {
  constructor(private readonly secret: string) {}

  sign(userId: string, type: NotificationType): string {
    const payload = Buffer.from(`${userId}.${type}`).toString('base64url');
    return `${payload}.${this.mac(payload)}`;
  }

  verify(token: string): { userId: string; type: NotificationType } | null {
    const [payload, signature, extra] = token.split('.');
    if (!payload || !signature || extra !== undefined) return null;

    const expected = Buffer.from(this.mac(payload));
    const presented = Buffer.from(signature);
    if (expected.length !== presented.length || !timingSafeEqual(expected, presented)) return null;

    const [userId, type] = Buffer.from(payload, 'base64url').toString('utf8').split('.');
    if (!userId || !UUID_PATTERN.test(userId)) return null;
    if (!(NOTIFICATION_TYPES as readonly string[]).includes(type ?? '')) return null;
    return { userId, type: type as NotificationType };
  }

  private mac(payload: string): string {
    return createHmac('sha256', this.secret).update(payload).digest('base64url');
  }
}
