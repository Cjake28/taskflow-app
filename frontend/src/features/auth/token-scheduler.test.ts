import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { REFRESH_LEAD_MS, RETRY_DELAY_MS, createTokenScheduler } from './token-scheduler';

const NOW = new Date('2026-10-01T10:00:00.000Z').getTime();
const inMinutes = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();

function fakeDocument() {
  const listeners = new Set<() => void>();
  return {
    visibilityState: 'visible' as DocumentVisibilityState,
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
    fire() {
      listeners.forEach((listener) => listener());
    },
    listenerCount: () => listeners.size,
  };
}

class AuthFailure extends Error {}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

function setup(refresh: () => Promise<string>) {
  const doc = fakeDocument();
  const onExpired = vi.fn();
  const scheduler = createTokenScheduler({
    refresh,
    onExpired,
    isAuthFailure: (error) => error instanceof AuthFailure,
    doc: doc as unknown as Document,
  });
  return { scheduler, doc, onExpired };
}

describe('createTokenScheduler', () => {
  it('refreshes 60 seconds before the access token expires, then re-arms', async () => {
    const refresh = vi.fn(async () => inMinutes(15));
    const { scheduler } = setup(refresh);

    scheduler.schedule(inMinutes(15));
    await vi.advanceTimersByTimeAsync(15 * 60_000 - REFRESH_LEAD_MS - 1);
    expect(refresh).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(refresh).toHaveBeenCalledTimes(1);

    // The new expiry is scheduled in turn.
    await vi.advanceTimersByTimeAsync(15 * 60_000 - REFRESH_LEAD_MS);
    expect(refresh).toHaveBeenCalledTimes(2);
    scheduler.stop();
  });

  it('refreshes immediately when the token is already inside the lead window', async () => {
    const refresh = vi.fn(async () => inMinutes(15));
    const { scheduler } = setup(refresh);
    scheduler.schedule(inMinutes(0.5));
    await vi.advanceTimersByTimeAsync(0);
    expect(refresh).toHaveBeenCalledTimes(1);
    scheduler.stop();
  });

  it('signs out when the refresh proves the session is gone', async () => {
    const refresh = vi.fn(async () => {
      throw new AuthFailure('401');
    });
    const { scheduler, onExpired, doc } = setup(refresh);

    scheduler.schedule(inMinutes(2));
    await vi.advanceTimersByTimeAsync(60_000);

    expect(onExpired).toHaveBeenCalledTimes(1);
    expect(doc.listenerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('retries after a transient failure instead of signing out', async () => {
    const refresh = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue(inMinutes(15));
    const { scheduler, onExpired } = setup(refresh);

    scheduler.schedule(inMinutes(2));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(refresh).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS);
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(onExpired).not.toHaveBeenCalled();
    scheduler.stop();
  });

  it('refreshes when a hidden tab becomes visible after the refresh was due', async () => {
    const refresh = vi.fn(async () => inMinutes(15));
    const { scheduler, doc } = setup(refresh);

    scheduler.schedule(inMinutes(15));
    // Background tabs throttle timers: jump the clock without firing them.
    vi.setSystemTime(NOW + 20 * 60_000);
    doc.visibilityState = 'hidden';
    doc.fire();
    expect(refresh).not.toHaveBeenCalled();

    doc.visibilityState = 'visible';
    doc.fire();
    await vi.advanceTimersByTimeAsync(0);
    expect(refresh).toHaveBeenCalledTimes(1);
    scheduler.stop();
  });

  it('does nothing once stopped', async () => {
    const refresh = vi.fn(async () => inMinutes(15));
    const { scheduler, doc } = setup(refresh);
    scheduler.schedule(inMinutes(15));
    scheduler.stop();
    await vi.advanceTimersByTimeAsync(30 * 60_000);
    doc.fire();
    expect(refresh).not.toHaveBeenCalled();
    expect(doc.listenerCount()).toBe(0);
  });
});
