import type { NotificationPreferencesDto } from '@taskflow/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { notificationsApi } from '@/features/notifications/api';
import { ApiError } from '@/lib/api-client';

import { NotificationSettings } from './notification-settings';

vi.mock('@/features/notifications/api', () => ({
  notificationsApi: { preferences: vi.fn(), updatePreferences: vi.fn() },
}));

const PREFERENCES: NotificationPreferencesDto = {
  timezone: 'Asia/Manila',
  timezoneAuto: true,
  taskReminder: { inApp: true, email: true },
  dueSoon: { inApp: true, email: true, leadMinutes: 60 },
  dailyDigest: { inApp: true, email: true, time: '08:00' },
  newSignIn: { inApp: true, email: true },
};

function renderSettings() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <NotificationSettings />
    </QueryClientProvider>,
  );
}

describe('NotificationSettings', () => {
  beforeEach(() => {
    vi.mocked(notificationsApi.preferences).mockReset().mockResolvedValue(PREFERENCES);
    vi.mocked(notificationsApi.updatePreferences)
      .mockReset()
      .mockImplementation(async (input) => ({
        ...PREFERENCES,
        ...(input as Partial<NotificationPreferencesDto>),
      }));
  });

  it('saves a channel switch right away', async () => {
    const events = userEvent.setup();
    renderSettings();
    const email = await screen.findByRole('switch', { name: 'Daily summary: Email' });
    expect(email).toBeChecked();

    await events.click(email);
    expect(notificationsApi.updatePreferences).toHaveBeenCalledWith({
      dailyDigest: { email: false },
    });
    expect(screen.getByRole('switch', { name: 'Daily summary: Email' })).not.toBeChecked();
  });

  it('saves the due-soon lead time and the summary time', async () => {
    const events = userEvent.setup();
    renderSettings();
    await events.selectOptions(await screen.findByLabelText('Remind me'), '15');
    expect(notificationsApi.updatePreferences).toHaveBeenCalledWith({
      dueSoon: { leadMinutes: 15 },
    });
    await events.selectOptions(screen.getByLabelText('Send at'), '07:30');
    expect(notificationsApi.updatePreferences).toHaveBeenLastCalledWith({
      dailyDigest: { time: '07:30' },
    });
  });

  it('reverts the switch when saving fails', async () => {
    vi.mocked(notificationsApi.updatePreferences).mockRejectedValue(
      new ApiError({ status: 500, code: 'INTERNAL_ERROR', message: 'Boom' }),
    );
    const events = userEvent.setup();
    renderSettings();
    const inApp = await screen.findByRole('switch', { name: 'New sign-in: In app' });
    await events.click(inApp);
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'New sign-in: In app' })).toBeChecked(),
    );
  });

  it('lets you pick a time zone when not following the device', async () => {
    const events = userEvent.setup();
    renderSettings();
    await events.click(await screen.findByRole('switch', { name: "Use this device's time zone" }));
    expect(notificationsApi.updatePreferences).toHaveBeenCalledWith({ timezoneAuto: false });

    const zone = await screen.findByLabelText('Time zone', { selector: 'input' });
    expect(zone).toHaveValue('Asia/Manila');
    await events.clear(zone);
    await events.type(zone, 'Mars/Base{Enter}');
    expect(await screen.findByText(/Choose a time zone from the list/)).toBeInTheDocument();

    await events.clear(zone);
    await events.type(zone, 'Europe/London{Enter}');
    expect(notificationsApi.updatePreferences).toHaveBeenLastCalledWith({
      timezone: 'Europe/London',
    });
  });
});
