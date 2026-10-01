import { createContext } from 'react';
import type {
  LoginData,
  PendingRegistrationDto,
  RegisterData,
  SessionPayload,
  UserDto,
} from '@taskflow/shared';

/** Why the visitor is signed out; guards use it to pick the right login URL. */
export type SignedOutReason = 'initial' | 'logout' | 'expired';

export type AuthState =
  | { status: 'loading'; user: null; accessTokenExpiresAt: null; reason: null }
  | { status: 'authenticated'; user: UserDto; accessTokenExpiresAt: string; reason: null }
  | { status: 'unauthenticated'; user: null; accessTokenExpiresAt: null; reason: SignedOutReason };

export type AuthStatus = AuthState['status'];

export interface AuthContextValue {
  state: AuthState;
  status: AuthStatus;
  user: UserDto | null;
  login: (input: LoginData) => Promise<SessionPayload>;
  /** Starts a sign-up: the server emails a code (no account or session yet). */
  register: (input: RegisterData) => Promise<PendingRegistrationDto>;
  /** Confirms the emailed code; creates the account and signs the user in. */
  verifyRegistration: (registrationId: string, code: string) => Promise<SessionPayload>;
  /** Revokes the session server-side, clears cached data and signs every tab out. */
  logout: () => Promise<void>;
  /** Clears the local session without calling the API (e.g. after a password reset). */
  clearSession: (reason?: SignedOutReason) => void;
  /** Replace the cached user after a profile change. */
  updateUser: (user: UserDto) => void;
  /** Set when the boot check failed for a reason other than "no session" (offline, 5xx). */
  bootError: unknown;
  retryBoot: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
