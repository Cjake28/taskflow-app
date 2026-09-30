import type { TaskDto } from '@taskflow/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { dashboardApi } from '../api';
import { AgendaCard } from './agenda-card';

vi.mock('../api', () => ({ dashboardApi: { tasks: vi.fn() } }));

const at = (day: number, hour: number, minute = 0) =>
  new Date(2026, 9, day, hour, minute).toISOString();
const endOf = (day: number) => new Date(2026, 9, day, 23, 59, 59, 999).toISOString();

function task(overrides: Partial<TaskDto>): TaskDto {
  return {
    id: overrides.title ?? 'id',
    title: 'Task',
    description: null,
    status: 'TODO',
    priority: 'MEDIUM',
    dueDate: null,
    hasDueTime: false,
    completedAt: null,
    position: 0,
    isOverdue: false,
    imageCount: 0,
    coverThumbUrl: null,
    createdAt: at(1, 8),
    updatedAt: at(1, 8),
    ...overrides,
  };
}

const WEEK: TaskDto[] = [
  task({ title: 'Standup notes', dueDate: at(1, 9), hasDueTime: true, status: 'COMPLETED' }),
  task({ title: 'Ship the agenda', dueDate: at(1, 14), hasDueTime: true, priority: 'HIGH' }),
  task({ title: 'Write the README', dueDate: endOf(1) }),
  task({ title: 'Deploy preview', dueDate: endOf(2), status: 'IN_PROGRESS' }),
];

function renderAgenda() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AgendaCard />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AgendaCard', () => {
  beforeEach(() => {
    // Thursday, October 1, 2026, 10:00 local time. Only Date is faked so Testing Library timers work.
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 1, 10, 0) });
    vi.mocked(dashboardApi.tasks).mockResolvedValue({ data: WEEK });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("requests the local week and shows today's timeline with the next task highlighted", async () => {
    renderAgenda();

    const panel = await screen.findByRole('tabpanel');
    const items = await within(panel).findAllByRole('heading', { level: 3 });
    expect(items.map((item) => item.textContent)).toEqual([
      'Standup notes',
      'Ship the agenda',
      'Write the README',
    ]);
    expect(within(panel).getByText('Up next')).toBeInTheDocument();
    expect(within(panel).getByText('End of day')).toBeInTheDocument();

    const [params] = vi.mocked(dashboardApi.tasks).mock.calls[0] ?? [];
    expect(params).toMatchObject({ sortBy: 'dueDate', sortOrder: 'asc', pageSize: 100 });
    expect(new Date(String(params?.dueFrom)).getDate()).toBe(28); // Monday
    expect(new Date(String(params?.dueTo)).getDate()).toBe(4); // Sunday

    const today = screen.getByRole('tab', { selected: true });
    expect(today).toHaveAccessibleName('Thursday, October 1 (today): 3 tasks due');
  });

  it('switches days by click and with the arrow keys', async () => {
    const events = userEvent.setup();
    renderAgenda();
    await screen.findByText('Ship the agenda');

    await events.click(screen.getByRole('tab', { name: /^Friday, October 2/ }));
    expect(await screen.findByText('Deploy preview')).toBeInTheDocument();
    expect(screen.queryByText('Ship the agenda')).not.toBeInTheDocument();

    await events.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { selected: true })).toHaveAccessibleName(
      /^Saturday, October 3/,
    );
    expect(await screen.findByText('Nothing due on Saturday')).toBeInTheDocument();
  });
});
