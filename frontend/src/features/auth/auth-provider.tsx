import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  ErrorCode,
  type LoginData,
  type RegisterData,
  type SessionPayload,
  type UserDto,
} from '@taskflow/shared';

import { ApiError, refreshSession, setAuthHooks } from '@/lib/api-client';

import { authApi } from './api';
import {
  AuthContext,
  type AuthContextValue,
  type AuthState,
  type SignedOutReason,
} from './auth-context';
import { openSessionChannel, type SessionChannel } from './session-channel';
import { createTokenScheduler, type TokenScheduler } from './token-scheduler';

const LOADING: AuthState = {
  status: 'loading',
  user: null,
  accessTokenExpiresAt: null,
  reason: null,
};

function signedOut(reason: SignedOutReason): AuthState {
  return { status: 'unauthenticated', user: null, accessTokenExpiresAt: null, reason };
}

function signedIn(session: SessionPayload): AuthState {
  return {
    status: 'authenticated',
    user: session.user,
    accessTokenExpiresAt: session.accessTokenExpiresAt,
    reason: null,
  };
}

/** A failed boot refresh that simply means "nobody is signed in". */
function isNoSession(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 401 || error.code === ErrorCode.NOT_FOUND);
}

export interface AuthProviderProps {
  children: ReactNode;
}

/**
 * Session lifecycle (spec §7.5, §14.5): silent refresh on boot, proactive refresh before expiry,
 * reactive refresh via the API client, logout (+ cache clear), and cross-tab sync.
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>(LOADING);
  const [bootError, setBootError] = useState<unknown>(null);
  const [bootAttempt, setBootAttempt] = useState(0);

  const stateRef = useRef(state);
  const signingOutRef = useRef(false);
  const channelRef = useRef<SessionChannel | null>(null);
  const schedulerRef = useRef<TokenScheduler | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const signOutLocally = useCallback(
    (reason: SignedOutReason) => {
      schedulerRef.current?.stop();
      void queryClient.cancelQueries();
      queryClient.clear();
      setState(signedOut(reason));
    },
    [queryClient],
  );

  // API client hooks + the boot check. Runs before anything renders the router.
  useEffect(() => {
    const unregister = setAuthHooks({
      onRefreshed: (session) => {
        if (!signingOutRef.current) setState(signedIn(session));
      },
      onSessionInvalid: () => {
        if (stateRef.current.status === 'authenticated') signOutLocally('expired');
      },
    });

    let cancelled = false;
    refreshSession().then(
      () => {
        if (!cancelled) setBootError(null);
      },
      (error: unknown) => {
        if (cancelled) return;
        if (isNoSession(error)) {
          setBootError(null);
          setState((current) => (current.status === 'loading' ? signedOut('initial') : current));
        } else {
          setBootError(error);
        }
      },
    );

    return () => {
      cancelled = true;
      unregister();
    };
  }, [bootAttempt, signOutLocally]);

  // Proactive refresh 60 s before expiry and on returning to a stale tab.
  useEffect(() => {
    const scheduler = createTokenScheduler({
      refresh: async () => (await refreshSession()).accessTokenExpiresAt,
      isAuthFailure: (error) => error instanceof ApiError && error.status === 401,
      onExpired: () => {
        if (stateRef.current.status === 'authenticated') signOutLocally('expired');
      },
    });
    schedulerRef.current = scheduler;
    return () => {
      scheduler.stop();
      schedulerRef.current = null;
    };
  }, [signOutLocally]);

  useEffect(() => {
    if (state.status === 'authenticated')
      schedulerRef.current?.schedule(state.accessTokenExpiresAt);
    else schedulerRef.current?.stop();
  }, [state.status, state.accessTokenExpiresAt]);

  // Cross-tab sync.
  useEffect(() => {
    const channel = openSessionChannel((message) => {
      const current = stateRef.current.status;
      if (message.type === 'logout' && current === 'authenticated') {
        signOutLocally('logout');
      } else if (message.type === 'login' && current === 'unauthenticated') {
        // Another tab signed in; the cookies are shared, so pick the session up silently.
        refreshSession().catch(() => {});
      }
    });
    channelRef.current = channel;
    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, [signOutLocally]);

  const startSession = useCallback(
    (session: SessionPayload) => {
      signingOutRef.current = false;
      queryClient.clear();
      setState(signedIn(session));
      channelRef.current?.post({ type: 'login' });
      return session;
    },
    [queryClient],
  );

  const login = useCallback(
    async (input: LoginData) => startSession(await authApi.login(input)),
    [startSession],
  );

  const register = useCallback(
    async (input: RegisterData) => startSession(await authApi.register(input)),
    [startSession],
  );

  const logout = useCallback(async () => {
    signingOutRef.current = true;
    schedulerRef.current?.stop();
    try {
      await authApi.logout();
    } catch {
      // Logout always succeeds locally, even if the network call fails.
    } finally {
      signOutLocally('logout');
      channelRef.current?.post({ type: 'logout' });
      signingOutRef.current = false;
    }
  }, [signOutLocally]);

  const clearSession = useCallback(
    (reason: SignedOutReason = 'logout') => {
      if (stateRef.current.status !== 'authenticated') return;
      signOutLocally(reason);
      channelRef.current?.post({ type: 'logout' });
    },
    [signOutLocally],
  );

  const updateUser = useCallback((user: UserDto) => {
    setState((current) => (current.status === 'authenticated' ? { ...current, user } : current));
  }, []);

  const retryBoot = useCallback(() => {
    setBootError(null);
    setBootAttempt((attempt) => attempt + 1);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      status: state.status,
      user: state.user,
      login,
      register,
      logout,
      clearSession,
      updateUser,
      bootError,
      retryBoot,
    }),
    [state, login, register, logout, clearSession, updateUser, bootError, retryBoot],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}
