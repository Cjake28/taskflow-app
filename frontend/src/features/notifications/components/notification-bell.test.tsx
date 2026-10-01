import type { NotificationDto } from '@taskflow/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { notificationsApi } from '../api';
import { NotificationBell } from './notification-bell';

vi.mock('../api', () => ({
  notificationsApi: { unreadCount: vi.fn(), list: vi.fn(), markRead: vi.fn() },
}));

beforeAll(() => {
  // Radix positions popovers with ResizeObserver, which jsdom lacks.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

const NOTIFICATIONS: NotificationDto[] = [
  {
    id: 'n1',
    type: 'TASK_REMINDER',
    title: 'Reminder: Submit the Q3 report',
    body: 'Bring the signed copy',
    taskId: 'task-1',
    data: null,
    readAt: null,
    createdAt: minutesAgo(5),
  },
  {
    id: 'n2',
    type: 'DAILY_DIGEST',
    title: 'Your day: 2 due today, 1 overdue',
    body: null,
    taskId: null,
    data: { date: '2026-10-01', dueToday: 2, overdue: 1 },
    readAt: minutesAgo(60),
    createdAt: minutesAgo(120),
  },
];

function Location() {
  const location = useLocation();
  return <p data-testid="location">{`${location.pathname}${location.search}`}</p>;
}

function renderBell() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/dashboard']}>
        <NotificationBell />
        <Routes>
          <Route path="*" element={<Location />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('NotificationBell', () => {
  beforeEach(() => {
    vi.mocked(notificationsApi.unreadCount).mockReset().mockResolvedValue({ count: 12 });
    vi.mocked(notificationsApi.list)
      .mockReset()
      .mockResolvedValue({ items: NOTIFICATIONS, meta: { nextCursor: null, unreadCount: 1 } });
    vi.mocked(notificationsApi.markRead).mockReset().mockResolvedValue({ unreadCount: 0 });
  });

  it('shows the unread count, capped at 9+', async () => {
    renderBell();
    const bell = await screen.findByRole('button', { name: 'Notifications, 12 unread' });
    expect(bell).toHaveTextContent('9+');
  });

  it('lists notifications and marks them all as read', async () => {
    const events = userEvent.setup();
    renderBell();
    await events.click(await screen.findByRole('button', { name: /Notifications, 12 unread/ }));

    const list = await screen.findByRole('list', { name: 'Notifications' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(within(list).getByText('Bring the signed copy')).toBeInTheDocument();
    // The feed brings the badge up to date.
    expect(await screen.findByText('1 new')).toBeInTheDocument();

    await events.click(screen.getByRole('button', { name: 'Mark all as read' }));
    expect(notificationsApi.markRead).toHaveBeenCalledWith(undefined);
    await waitFor(() => expect(screen.queryByText('1 new')).not.toBeInTheDocument());
    expect(within(list).queryByText('Unread')).not.toBeInTheDocument();
  });

  it('marks a notification read and opens its task', async () => {
    const events = userEvent.setup();
    renderBell();
    await events.click(await screen.findByRole('button', { name: /Notifications/ }));
    await events.click(await screen.findByRole('button', { name: /Submit the Q3 report/ }));

    expect(notificationsApi.markRead).toHaveBeenCalledWith(['n1']);
    expect(screen.getByTestId('location')).toHaveTextContent('/tasks/task-1');
    await waitFor(() =>
      expect(screen.queryByRole('list', { name: 'Notifications' })).not.toBeInTheDocument(),
    );
  });

  it('sends the daily summary to the overdue tasks', async () => {
    const events = userEvent.setup();
    renderBell();
    await events.click(await screen.findByRole('button', { name: /Notifications/ }));
    await events.click(await screen.findByRole('button', { name: /Your day/ }));

    // Already read: no request, just navigation.
    expect(notificationsApi.markRead).not.toHaveBeenCalled();
    expect(screen.getByTestId('location')).toHaveTextContent('/tasks?overdue=true');
  });
});
