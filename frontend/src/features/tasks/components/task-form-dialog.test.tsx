import type { TaskDetailsDto, TaskDto } from '@taskflow/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { toDueDateIso } from '@/lib/due-date';

import { tasksApi } from '../api';
import { TaskFormDialog } from './task-form-dialog';

vi.mock('../api', () => ({
  tasksApi: { create: vi.fn(), update: vi.fn(), get: vi.fn() },
}));

const summary: TaskDto = {
  id: 'task-1',
  title: 'Renew the passport',
  description: null,
  status: 'TODO',
  priority: 'MEDIUM',
  dueDate: toDueDateIso('2099-10-05', '14:00'),
  hasDueTime: true,
  completedAt: null,
  position: 0,
  isOverdue: false,
  imageCount: 0,
  coverThumbUrl: null,
  reminderCount: 0,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

const details: TaskDetailsDto = {
  ...summary,
  images: [],
  reminders: [
    {
      id: '01900000-0000-7000-8000-000000000009',
      kind: 'relative',
      offsetMinutes: 1440,
      remindAt: toDueDateIso('2099-10-04', '14:00'),
      message: 'Photos ready?',
      sentAt: '2026-10-01T01:00:00.000Z',
      status: 'sent',
    },
  ],
};

function renderDialog(task?: TaskDto) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <TaskFormDialog open task={task ?? null} onOpenChange={() => undefined} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('TaskFormDialog reminders', () => {
  beforeEach(() => {
    vi.mocked(tasksApi.create)
      .mockReset()
      .mockResolvedValue({ ...details, reminders: [] });
    vi.mocked(tasksApi.update).mockReset().mockResolvedValue(details);
    vi.mocked(tasksApi.get).mockReset().mockResolvedValue(details);
  });

  it('creates a task with a reminder before its due time', async () => {
    const events = userEvent.setup();
    renderDialog();
    await events.type(screen.getByLabelText('Title'), 'Renew the passport');
    await events.type(screen.getByLabelText(/Due date/), '2099-10-05');

    await events.click(screen.getByRole('button', { name: 'Add reminder' }));
    const row = screen.getByRole('listitem', { name: 'Reminder 1' });
    await events.selectOptions(within(row).getByLabelText('When'), '60');
    expect(within(row).getByText(/Goes out .*8:00 AM/)).toBeInTheDocument();
    await events.type(within(row).getByLabelText(/Message/), 'Bring the old one');

    await events.click(screen.getByRole('button', { name: 'Create task' }));
    await waitFor(() => expect(tasksApi.create).toHaveBeenCalled());
    expect(vi.mocked(tasksApi.create).mock.calls[0]?.[0].reminders).toEqual([
      { kind: 'relative', offsetMinutes: 60, message: 'Bring the old one' },
    ]);
  });

  it('offers a custom time when the task has no due date', async () => {
    const events = userEvent.setup();
    renderDialog();
    expect(screen.getByText(/Add a due date to be reminded before it/)).toBeInTheDocument();
    await events.click(screen.getByRole('button', { name: 'Add reminder' }));
    const row = screen.getByRole('listitem', { name: 'Reminder 1' });
    expect(within(row).getByLabelText('When')).toHaveValue('custom');
    expect(within(row).getByRole('option', { name: '1 hour before' })).toBeDisabled();
    expect(within(row).getByLabelText('Date')).not.toHaveValue('');
  });

  it('loads the reminders of a task from a list before editing it', async () => {
    const events = userEvent.setup();
    renderDialog(summary);
    const row = await screen.findByRole('listitem', { name: 'Reminder 1' });
    expect(tasksApi.get).toHaveBeenCalledWith('task-1', expect.anything());
    expect(within(row).getByLabelText('When')).toHaveValue('1440');
    expect(within(row).getByText('Sent')).toBeInTheDocument();

    await events.click(screen.getByRole('button', { name: 'Remove reminder 1' }));
    await events.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(tasksApi.update).toHaveBeenCalledWith('task-1', { reminders: [] }));
  });
});
