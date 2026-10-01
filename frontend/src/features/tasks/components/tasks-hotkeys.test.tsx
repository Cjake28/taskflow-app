import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { describe, expect, it } from 'vitest';

import { TasksHotkeys } from './tasks-hotkeys';

function Location() {
  const { pathname, search } = useLocation();
  return <output aria-label="location">{`${pathname}${search}`}</output>;
}

function renderAt(path: string, extra?: ReactNode) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <TasksHotkeys />
      <Location />
      <Routes>
        <Route path="*" element={extra ?? null} />
      </Routes>
    </MemoryRouter>,
  );
}

const location = () => screen.getByRole('status', { name: 'location' }).textContent;

describe('TasksHotkeys', () => {
  it('N opens "New task" from another page', async () => {
    renderAt('/dashboard');
    await userEvent.keyboard('n');
    expect(location()).toBe('/tasks?new=1');
  });

  it('N keeps the current filters on the tasks page', async () => {
    renderAt('/tasks?status=TODO,IN_PROGRESS&view=board');
    await userEvent.keyboard('N');
    expect(location()).toBe('/tasks?status=TODO,IN_PROGRESS&view=board&new=1');
  });

  it('/ focuses the task search', async () => {
    renderAt('/tasks', <input aria-label="Search" data-hotkey-search="" />);
    await userEvent.keyboard('/');
    expect(screen.getByRole('textbox', { name: 'Search' })).toHaveFocus();
  });

  it('is ignored while typing and with modifier keys', async () => {
    renderAt('/dashboard', <input aria-label="Notes" />);
    await userEvent.click(screen.getByRole('textbox', { name: 'Notes' }));
    await userEvent.keyboard('n/');
    expect(location()).toBe('/dashboard');
    await userEvent.click(document.body);
    await userEvent.keyboard('{Control>}n{/Control}');
    expect(location()).toBe('/dashboard');
  });
});
