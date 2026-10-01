import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TaskDto, TaskStatus } from '@taskflow/shared';
import { Plus } from 'lucide-react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';

import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

import { BoardView } from '../components/board-view';
import { DeleteTaskDialog } from '../components/delete-task-dialog';
import { ListView } from '../components/list-view';
import { TaskFormDialog } from '../components/task-form-dialog';
import type { TaskActions } from '../components/task-row-menu';
import { TasksToolbar } from '../components/tasks-toolbar';
import { ViewToggle } from '../components/view-toggle';
import { DESKTOP_QUERY, useMediaQuery, useTaskTotals, useToggleComplete } from '../hooks';
import { rememberTasksSearch } from '../last-list';
import {
  clearFilters,
  parseTaskSearch,
  toSearchString,
  updateTaskSearch,
  type TaskSearchPatch,
  type TaskView,
} from '../url-state';

/** `/tasks`: list (`?view=list`, default) and Kanban board (`?view=board`), state in the URL. */
export function TasksPage() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const state = useMemo(() => parseTaskSearch(searchParams), [searchParams]);
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const totals = useTaskTotals();
  const { toggle } = useToggleComplete();
  const board = state.view === 'board';

  // `?new=1` (the N shortcut, the mobile "+" tab, dashboard links) opens the create dialog once.
  const newRequested = searchParams.get('new') === '1';
  const [create, setCreate] = useState<{ open: boolean; status?: TaskStatus }>({ open: false });
  if (newRequested && !create.open) setCreate({ open: true });
  useEffect(() => {
    if (!newRequested) return;
    const next = new URLSearchParams(searchParams);
    next.delete('new');
    void navigate({ search: toSearchString(next) }, { replace: true });
  }, [newRequested, searchParams, navigate]);

  const [editing, setEditing] = useState<TaskDto | null>(null);
  const [deleting, setDeleting] = useState<TaskDto | null>(null);

  useEffect(() => {
    rememberTasksSearch(location.search);
  }, [location.search]);

  // The `/` shortcut pressed on another page lands here with the search focused.
  const focusSearch = (location.state as { focusSearch?: boolean } | null)?.focusSearch === true;
  useEffect(() => {
    if (focusSearch) document.querySelector<HTMLInputElement>('[data-hotkey-search]')?.focus();
  }, [focusSearch]);

  // Changes build on the newest URL, including one still being committed, so quick successive
  // edits (two filter toggles in a row) compose instead of overwriting each other.
  const latest = useRef(searchParams);
  useEffect(() => {
    latest.current = searchParams;
  }, [searchParams]);
  const go = useCallback(
    (next: URLSearchParams, replace?: boolean) => {
      latest.current = next;
      void navigate({ search: toSearchString(next) }, { replace });
    },
    [navigate],
  );
  const onChange = useCallback(
    (patch: TaskSearchPatch, options?: { replace?: boolean }) => {
      const base = latest.current;
      const resolved = typeof patch === 'function' ? patch(parseTaskSearch(base)) : patch;
      go(updateTaskSearch(base, resolved), options?.replace);
    },
    [go],
  );
  const onClearFilters = useCallback(() => go(clearFilters(latest.current)), [go]);
  const hrefFor = (view: TaskView) =>
    `/tasks${toSearchString(updateTaskSearch(searchParams, { view }))}`;

  const actions: TaskActions = {
    onToggleComplete: toggle,
    onEdit: setEditing,
    onDelete: setDeleting,
  };
  const openCreate = (status?: TaskStatus) => setCreate({ open: true, status });

  const eyebrow = board
    ? desktop
      ? 'Drag cards between columns to change status'
      : 'Tap ••• on a card to move it'
    : totals.total !== undefined && totals.open !== undefined
      ? `${totals.total} ${totals.total === 1 ? 'task' : 'tasks'} · ${totals.open} open`
      : 'All your tasks in one place';

  return (
    <>
      <title>{`${board ? 'Board' : 'Tasks'} · TaskFlow`}</title>
      <PageHeader
        eyebrow={eyebrow}
        title={board ? 'Board' : 'Tasks'}
        actions={
          <>
            <ViewToggle view={state.view} hrefFor={hrefFor} />
            {desktop ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button onClick={() => openCreate()}>
                    <Plus aria-hidden="true" />
                    Add Task
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  New task
                  <kbd className="rounded border border-background/30 px-1 font-sans text-[11px]">
                    N
                  </kbd>
                </TooltipContent>
              </Tooltip>
            ) : null}
          </>
        }
      />

      <TasksToolbar state={state} onChange={onChange} onClear={onClearFilters} />

      {board ? (
        <BoardView
          state={state}
          onAdd={openCreate}
          onEdit={setEditing}
          onDelete={setDeleting}
          onClearFilters={onClearFilters}
        />
      ) : (
        <ListView
          state={state}
          actions={actions}
          onChange={onChange}
          onCreate={() => openCreate()}
          onClearFilters={onClearFilters}
        />
      )}

      <TaskFormDialog
        open={create.open}
        defaultStatus={create.status}
        onOpenChange={(open) => setCreate((current) => ({ ...current, open }))}
      />
      <TaskFormDialog
        open={editing !== null}
        task={editing}
        onOpenChange={(open) => !open && setEditing(null)}
      />
      <DeleteTaskDialog task={deleting} onOpenChange={(open) => !open && setDeleting(null)} />
    </>
  );
}
