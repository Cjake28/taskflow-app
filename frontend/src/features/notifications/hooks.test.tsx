import type { ReactNode } from 'react';
import type { NotificationPreferencesDto } from '@taskflow/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { notificationsApi } from './api';
import { mergePreferences, useTimeZoneAutoSync } from './hooks';
import { deviceTimeZone } from './lib/time-zones';

vi.mock('./api', () => ({
  notificationsApi: { preferences: vi.fn(), updatePreferences: vi.fn() },
}));

const PREFERENCES: NotificationPreferencesDto = {
  timezone: 'Pacific/Chatham',
  timezoneAuto: true,
  taskReminder: { inApp: true, email: true },
  dueSoon: { inApp: true, email: false, leadMinutes: 60 },
  dailyDigest: { inApp: true, email: true, time: '08:00' },
  newSignIn: { inApp: true, email: true },
};

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('mergePreferences', () => {
  it('merges nested groups without dropping the other fields', () => {
    const merged = mergePreferences(PREFERENCES, { dueSoon: { email: true } });
    expect(merged.dueSoon).toEqual({ inApp: true, email: true, leadMinutes: 60 });
    expect(merged.dailyDigest).toEqual(PREFERENCES.dailyDigest);
  });
});

describe('useTimeZoneAutoSync', () => {
  beforeEach(() => {
    vi.mocked(notificationsApi.updatePreferences)
      .mockReset()
      .mockResolvedValue({ ...PREFERENCES, timezone: deviceTimeZone() });
  });

  it("saves the device's zone when following the device", async () => {
    vi.mocked(notificationsApi.preferences).mockReset().mockResolvedValue(PREFERENCES);
    renderHook(() => useTimeZoneAutoSync(), { wrapper });
    await waitFor(() =>
      expect(notificationsApi.updatePreferences).toHaveBeenCalledWith({
        timezone: deviceTimeZone(),
      }),
    );
    expect(notificationsApi.updatePreferences).toHaveBeenCalledTimes(1);
  });

  it('leaves a manually chosen zone alone', async () => {
    vi.mocked(notificationsApi.preferences)
      .mockReset()
      .mockResolvedValue({ ...PREFERENCES, timezoneAuto: false });
    renderHook(() => useTimeZoneAutoSync(), { wrapper });
    await waitFor(() => expect(notificationsApi.preferences).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(notificationsApi.updatePreferences).not.toHaveBeenCalled();
  });
});
