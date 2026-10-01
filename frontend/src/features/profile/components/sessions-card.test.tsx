import type { SessionDto } from '@taskflow/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthContext, type AuthContextValue } from '@/features/auth/auth-context';

import { profileApi } from '../api';
import { SessionsCard } from './sessions-card';

vi.mock('../api', () => ({ profileApi: { sessions: vi.fn(), revokeSession: vi.fn() } }));

const recently = new Date(Date.now() - 60_000).toISOString();
const SESSIONS: SessionDto[] = [
  {
    id: 'phone',
    device: 'Safari on iOS',
    ipAddress: '10.0.0.2',
    createdAt: recently,
    lastUsedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    current: false,
  },
  {
    id: 'here',
    device: 'Chrome on Windows',
    ipAddress: '10.0.0.1',
    createdAt: recently,
    lastUsedAt: recently,
    current: true,
  },
  {
    id: 'laptop',
    device: 'Firefox on Ubuntu',
    ipAddress: null,
    createdAt: recently,
    lastUsedAt: recently,
    current: false,
  },
];

function renderCard() {
  const clearSession = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AuthContext value={{ clearSession } as unknown as AuthContextValue}>
        <SessionsCard />
      </AuthContext>
    </QueryClientProvider>,
  );
  return { clearSession };
}

describe('SessionsCard', () => {
  beforeEach(() => {
    vi.mocked(profileApi.sessions).mockReset().mockResolvedValue(SESSIONS);
    vi.mocked(profileApi.revokeSession).mockReset().mockResolvedValue(undefined);
  });

  it('lists this device first and labels it', async () => {
    renderCard();
    const list = await screen.findByRole('list', { name: 'Signed-in devices' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('Chrome on Windows');
    expect(rows[0]).toHaveTextContent('This device');
    expect(rows[0]).toHaveTextContent('Active now');
    expect(within(list).getByText(/Last active 2 days ago/)).toBeInTheDocument();
  });

  it('revokes every other session after confirmation', async () => {
    const events = userEvent.setup();
    renderCard();

    await events.click(await screen.findByRole('button', { name: 'Log out of all other devices' }));
    const dialog = await screen.findByRole('alertdialog', {
      name: 'Log out of all other devices?',
    });
    expect(dialog).toHaveAccessibleDescription(/2 other devices will be signed out/);

    vi.mocked(profileApi.sessions).mockResolvedValue(SESSIONS.filter((item) => item.current));
    await events.click(within(dialog).getByRole('button', { name: 'Log out others' }));

    await waitFor(() => expect(profileApi.revokeSession).toHaveBeenCalledTimes(2));
    expect(profileApi.revokeSession).toHaveBeenCalledWith('phone');
    expect(profileApi.revokeSession).toHaveBeenCalledWith('laptop');
    expect(profileApi.revokeSession).not.toHaveBeenCalledWith('here');
    expect(await screen.findByText("You're only signed in on this device.")).toBeInTheDocument();
  });

  it('signs out locally after revoking the current session', async () => {
    const events = userEvent.setup();
    const { clearSession } = renderCard();

    await events.click(await screen.findByRole('button', { name: 'Sign out of this device' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Sign out of this device?' });
    await events.click(within(dialog).getByRole('button', { name: 'Sign out' }));

    await waitFor(() => expect(clearSession).toHaveBeenCalledWith('logout'));
    expect(profileApi.revokeSession).toHaveBeenCalledWith('here');
  });
});
