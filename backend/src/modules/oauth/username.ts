import { randomInt } from 'node:crypto';
import { FIELD_LIMITS, USERNAME_PATTERN } from '@taskflow/shared';

const FALLBACK = 'user';

/** Turns an email local part or a login into a valid username base (a–z, 0–9, "." and "_"). */
export function usernameBase(source: string | null | undefined): string {
  const cleaned = (source ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9._]/g, '')
    .replace(/[._]{2,}/g, '_')
    .slice(0, FIELD_LIMITS.username.max - 5)
    .replace(/^[._]+|[._]+$/g, '');
  return cleaned.length >= FIELD_LIMITS.username.min ? cleaned : FALLBACK;
}

/** The base itself first, then the base with a random numeric suffix. */
export function usernameCandidates(base: string, count: number): string[] {
  const candidates = [base];
  while (candidates.length < count) candidates.push(`${base}${randomInt(1000, 100_000)}`);
  return candidates.filter((candidate) => USERNAME_PATTERN.test(candidate));
}
