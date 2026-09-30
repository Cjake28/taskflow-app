import { ClipboardList, Columns3 } from 'lucide-react';
import { useSearchParams } from 'react-router';

import { EmptyState } from '@/components/common/empty-state';
import { PageHeader } from '@/components/layout/page-header';

/** Placeholder for the list (`?view=list`) and board (`?view=board`) views. */
export function TasksPage() {
  const [searchParams] = useSearchParams();
  const board = searchParams.get('view') === 'board';

  return (
    <>
      <title>{`${board ? 'Board' : 'Tasks'} · TaskFlow`}</title>
      <PageHeader
        eyebrow={
          board ? 'Drag cards between columns to change status' : 'All your tasks in one place'
        }
        title={board ? 'Board' : 'Tasks'}
      />
      <EmptyState
        icon={board ? Columns3 : ClipboardList}
        sparkles
        title="No tasks yet"
        description={
          board
            ? 'Your Kanban board will show To Do, In Progress and Completed columns here.'
            : 'Create your first task and it will show up here, on your board and on your dashboard.'
        }
      />
    </>
  );
}
