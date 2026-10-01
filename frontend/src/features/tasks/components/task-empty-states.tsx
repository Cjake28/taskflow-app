import type { ReactNode } from 'react';
import { ClipboardList, Plus, SearchX, X } from 'lucide-react';

import { EmptyState } from '@/components/common/empty-state';
import { Button } from '@/components/ui/button';
import { PRIORITY_META, STATUS_META } from '@/lib/task-meta';

import type { TaskSearchState } from '../url-state';

function joinOr(words: string[]): string {
  if (words.length <= 1) return words.join('');
  return `${words.slice(0, -1).join(', ')} or ${words.at(-1)}`;
}

/** "Nothing matches “deploy” with status Completed and High priority." */
export function NoMatchDescription({ state }: { state: TaskSearchState }) {
  const search = state.search.trim();
  const parts: ReactNode[] = [];
  if (state.status.length > 0 && state.view === 'list') {
    parts.push(
      <span key="status">
        status{' '}
        <b className="text-foreground">{joinOr(state.status.map((s) => STATUS_META[s].label))}</b>
      </span>,
    );
  }
  if (state.priority.length > 0) {
    parts.push(
      <span key="priority">
        <b className="text-foreground">
          {joinOr(state.priority.map((p) => PRIORITY_META[p].label))}
        </b>{' '}
        priority
      </span>,
    );
  }
  if (state.overdue) parts.push(<span key="overdue">an overdue due date</span>);

  return (
    <>
      {search ? (
        <>
          Nothing matches “<b className="text-foreground">{search}</b>”
        </>
      ) : (
        'No tasks'
      )}
      {parts.length > 0 ? (
        <>
          {' '}
          with{' '}
          {parts.map((part, index) => (
            <span key={index}>
              {index > 0 ? (index === parts.length - 1 ? ' and ' : ', ') : null}
              {part}
            </span>
          ))}
        </>
      ) : null}
      . Try a different search or clear the filters.
    </>
  );
}

export function NoMatchState({ state, onClear }: { state: TaskSearchState; onClear: () => void }) {
  return (
    <EmptyState
      icon={SearchX}
      tint="var(--status-progress)"
      title="No tasks match your filters"
      description={<NoMatchDescription state={state} />}
      action={
        <Button variant="outline" onClick={onClear}>
          <X aria-hidden="true" />
          Clear filters
        </Button>
      }
    />
  );
}

export function NoTasksState({ onCreate }: { onCreate: () => void }) {
  return (
    <EmptyState
      icon={ClipboardList}
      title="No tasks yet"
      description="Create your first task and it'll show up here, on your board and on your dashboard."
      action={
        <Button onClick={onCreate}>
          <Plus aria-hidden="true" />
          Add your first task
        </Button>
      }
    />
  );
}
