import type { PendingRegistrationDto } from '@taskflow/shared';

/**
 * The sign-up waiting for its emailed code. Kept in sessionStorage so a reload of the
 * code screen keeps working; it never holds the password, only the registration id.
 */
export interface PendingSignup extends PendingRegistrationDto {
  firstName: string;
}

const KEY = 'tf-pending-signup';

export function savePendingSignup(pending: PendingSignup): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(pending));
  } catch {
    // Storage unavailable: the code screen falls back to router state.
  }
}

export function loadPendingSignup(): PendingSignup | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as PendingSignup) : null;
  } catch {
    return null;
  }
}

export function clearPendingSignup(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}
