import { createHash } from 'node:crypto';
import type { Logger } from '../utils/logger';

export const BREACHED_PASSWORD_MESSAGE =
  'This password has appeared in a data breach. Choose a different one.';

export interface PasswordBreachChecker {
  isBreached(password: string): Promise<boolean>;
}

export const noopBreachChecker: PasswordBreachChecker = {
  isBreached: async () => false,
};

/** Have I Been Pwned range API (k-anonymity): only the first 5 hex characters of the SHA-1 leave the server. */
export class HibpPasswordChecker implements PasswordBreachChecker {
  constructor(
    private readonly logger: Logger,
    private readonly fetchFn: typeof fetch = fetch,
    private readonly timeoutMs = 2_000,
  ) {}

  async isBreached(password: string): Promise<boolean> {
    const hash = createHash('sha1').update(password).digest('hex').toUpperCase();
    const prefix = hash.slice(0, 5);
    const suffix = hash.slice(5);
    try {
      const response = await this.fetchFn(`https://api.pwnedpasswords.com/range/${prefix}`, {
        headers: { 'Add-Padding': 'true', 'User-Agent': 'TaskFlow' },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!response.ok) throw new Error(`HIBP responded with ${response.status}`);
      const body = await response.text();
      return body.split('\n').some((line) => {
        const [candidate, count] = line.trim().split(':');
        return candidate === suffix && Number(count) > 0;
      });
    } catch (err) {
      this.logger.warn({ err }, 'Breached-password check unavailable; allowing the password');
      return false;
    }
  }
}
