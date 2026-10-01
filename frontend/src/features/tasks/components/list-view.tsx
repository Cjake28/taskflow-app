import { useEffect } from 'react';

import { ErrorState } from '@/components/common/error-state';

import { DESKTOP_QUERY, useMediaQuery, useTaskList } from '../hooks';
import {
  DEFAULT_ORDER,
  hasActiveFilters,
  toListQuery,
  type ListSortField,
  type TaskSearchPatch,
  type TaskSearchState,
} from '../url-state';
import { Pagination } from './pagination';
import { TaskCardList, TaskCardListSkeleton } from './task-card-list';
import { NoMatchState, NoTasksState } from './task-empty-states';
import type { TaskActions } from './task-row-menu';
import { TaskTable, TaskTableSkeleton } from './task-table';

export interface ListViewProps {
  state: TaskSearchState;
  actions: TaskActions;
  onChange: (patch: TaskSearchPatch, options?: { replace?: boolean }) => void;
  onCreate: () => void;
  onClearFilters: () => void;
}

/** List view: paginated table on desktop, cards on phones (spec §16). */
export function ListView({ state, actions, onChange, onCreate, onClearFilters }: ListViewProps) {
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const list = useTaskList(toListQuery(state));
  const totalPages = list.data?.meta.totalPages ?? 1;
  const total = list.data?.meta.total ?? 0;

  // A page past the end (e.g. after deleting the last task on it): go to the last page.
  const outOfRange = !list.isPlaceholderData && total > 0 && state.page > totalPages;
  useEffect(() => {
    if (outOfRange) onChange({ page: totalPages }, { replace: true });
  }, [outOfRange, totalPages, onChange]);

  if (list.isPending) return desktop ? <TaskTableSkeleton /> : <TaskCardListSkeleton />;

  if (list.isError && !list.data) {
    return (
      <ErrorState
        title="Couldn't load your tasks"
        error={list.error}
        retrying={list.isFetching}
        onRetry={() => void list.refetch()}
      />
    );
  }

  const { items, meta } = list.data;
  if (items.length === 0) {
    if (hasActiveFilters(state)) return <NoMatchState state={state} onClear={onClearFilters} />;
    if (state.page === 1 || total === 0) return <NoTasksState onCreate={onCreate} />;
    return desktop ? <TaskTableSkeleton /> : <TaskCardListSkeleton />;
  }

  const changePage = (page: number) => {
    onChange({ page });
    document.getElementById('main')?.scrollTo?.({ top: 0 });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const footer = (
    <Pagination
      page={meta.page}
      totalPages={meta.totalPages}
      total={meta.total}
      pageSize={meta.pageSize}
      onPageChange={changePage}
    />
  );

  const onSort = (field: ListSortField) =>
    onChange({
      sortBy: field,
      sortOrder:
        state.sortBy === field
          ? state.sortOrder === 'asc'
            ? 'desc'
            : 'asc'
          : DEFAULT_ORDER[field],
    });

  return desktop ? (
    <TaskTable
      tasks={items}
      actions={actions}
      sortBy={state.sortBy}
      sortOrder={state.sortOrder}
      onSort={onSort}
      stale={list.isPlaceholderData}
      footer={footer}
    />
  ) : (
    <TaskCardList tasks={items} actions={actions} stale={list.isPlaceholderData} footer={footer} />
  );
}
