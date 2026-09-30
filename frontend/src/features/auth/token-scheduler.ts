/** Refresh this long before the access token expires (spec §7.5). */
export const REFRESH_LEAD_MS = 60_000;
/** Back-off after a refresh that failed for a non-auth reason (offline, 5xx). */
export const RETRY_DELAY_MS = 30_000;
const MAX_TIMEOUT_MS = 2_147_483_647;

export interface TokenSchedulerOptions {
  /** Performs the refresh and resolves with the new expiry (ISO string). */
  refresh: () => Promise<string>;
  /** Called when a refresh proves the session is gone (401). */
  onExpired: () => void;
  /** Distinguishes "session gone" from transient failures. */
  isAuthFailure: (error: unknown) => boolean;
  now?: () => number;
  doc?: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>;
}

export interface TokenScheduler {
  /** (Re)arms the timer for a token that expires at `expiresAt`. */
  schedule: (expiresAt: string) => void;
  stop: () => void;
}

/**
 * Keeps the access cookie fresh while the app is open: refreshes 60 s before expiry and
 * immediately when a hidden tab becomes visible after that point. This matters for <img>
 * requests, which cannot refresh-and-retry on their own.
 */
export function createTokenScheduler(options: TokenSchedulerOptions): TokenScheduler {
  const now = options.now ?? (() => Date.now());
  const doc = options.doc ?? document;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let dueAt = Number.POSITIVE_INFINITY;
  let running = false;
  let stopped = true;

  const clear = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };

  const arm = (delay: number) => {
    clear();
    dueAt = now() + delay;
    timer = setTimeout(run, Math.min(Math.max(0, delay), MAX_TIMEOUT_MS));
  };

  const run = async () => {
    if (running || stopped) return;
    running = true;
    clear();
    try {
      const expiresAt = await options.refresh();
      if (!stopped) schedule(expiresAt);
    } catch (error) {
      if (stopped) return;
      if (options.isAuthFailure(error)) {
        stop();
        options.onExpired();
      } else {
        arm(RETRY_DELAY_MS);
      }
    } finally {
      running = false;
    }
  };

  const onVisibilityChange = () => {
    if (doc.visibilityState === 'visible' && now() >= dueAt) void run();
  };

  function schedule(expiresAt: string) {
    const expiry = Date.parse(expiresAt);
    if (Number.isNaN(expiry)) return;
    if (stopped) {
      stopped = false;
      doc.addEventListener('visibilitychange', onVisibilityChange);
    }
    arm(expiry - REFRESH_LEAD_MS - now());
  }

  function stop() {
    stopped = true;
    clear();
    dueAt = Number.POSITIVE_INFINITY;
    doc.removeEventListener('visibilitychange', onVisibilityChange);
  }

  return { schedule, stop };
}
