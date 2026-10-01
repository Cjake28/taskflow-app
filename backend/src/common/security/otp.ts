import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

/** A uniformly random numeric code, e.g. "042917". */
export function generateOtp(length: number): string {
  return randomInt(0, 10 ** length)
    .toString()
    .padStart(length, '0');
}

/**
 * Keyed hash of a code, bound to its purpose (e.g. `signup:<id>`): a leaked hash
 * cannot be brute-forced offline or replayed for another flow.
 */
export function hashOtp(secret: string, scope: string, code: string): string {
  return createHmac('sha256', secret).update(`${scope}:${code}`).digest('hex');
}

export function otpHashesMatch(expected: string, actual: string): boolean {
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(actual, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}
