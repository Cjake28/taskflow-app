import { useState, type ReactNode } from 'react';
import { ErrorCode, type TaskDetailsDto } from '@taskflow/shared';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  FileQuestion,
  ListTodo,
  Pencil,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router';

import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { PriorityIndicator } from '@/components/common/priority-indicator';
import { StatusBadge } from '@/components/common/status-badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { isApiError } from '@/lib/api-client';
import { cn } from '@/lib/utils';

import { DeleteTaskDialog } from '../components/delete-task-dialog';
import { DueLabel } from '../components/due-label';
import { TaskActivityList } from '../components/task-activity-list';
import { TaskFormDialog } from '../components/task-form-dialog';
import { TaskImages } from '../components/task-images';
import { TaskMetaPanel } from '../components/task-meta-panel';
import { useTask, useToggleComplete, useUpdateTask } from '../hooks';
import { tasksListHref } from '../last-list';

function Crumbs({ title }: { title?: string }) {
  return (
    <nav
      aria-label="Breadcrumb"
      className="flex min-w-0 items-center gap-1.5 text-[13px] font-semibold text-muted-foreground"
    >
      <ChevronLeft className="size-3.5 shrink-0" aria-hidden="true" />
      <Link to={tasksListHref()} className="rounded-sm hover:text-foreground">
        Tasks
      </Link>
      <ChevronRight className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate text-foreground" aria-current="page">
        {title ?? 'Task details'}
      </span>
    </nav>
  );
}

function Card({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('rounded-card bg-card p-[22px] shadow-card', className)}>
      <h2 className="mb-3.5 text-base font-extrabold">{title}</h2>
      {children}
    </section>
  );
}

function DetailsSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-5">
      <div>
        <Skeleton className="mb-3 h-8 w-2/3 max-w-md rounded-full" />
        <div className="flex gap-3">
          <Skeleton className="h-6 w-24 rounded-full" />
          <Skeleton className="h-6 w-28 rounded-full" />
          <Skeleton className="h-6 w-32 rounded-full" />
        </div>
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-5">
          <div className="rounded-card bg-card p-[22px] shadow-card">
            <Skeleton className="mb-4 h-4 w-28 rounded-full" />
            <Skeleton className="mb-2 h-3 w-full rounded-full" />
            <Skeleton className="mb-2 h-3 w-11/12 rounded-full" />
            <Skeleton className="h-3 w-3/5 rounded-full" />
          </div>
          <div className="rounded-card bg-card p-[22px] shadow-card">
            <Skeleton className="mb-4 h-4 w-20 rounded-full" />
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
              {[0, 1, 2].map((index) => (
                <Skeleton key={index} className="aspect-square rounded-thumb" />
              ))}
            </div>
          </div>
        </div>
        <div className="rounded-card bg-card p-[22px] shadow-card">
          <Skeleton className="mb-4 h-4 w-20 rounded-full" />
          {[0, 1, 2, 3, 4].map((index) => (
            <div
              key={index}
              className="flex justify-between border-t border-border py-3.5 first:border-t-0"
            >
              <Skeleton className="h-3 w-20 rounded-full" />
              <Skeleton className="h-3 w-28 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TaskNotFound() {
  return (
    <>
      <title>Task not found · TaskFlow</title>
      <Crumbs title="Not found" />
      <EmptyState
        icon={FileQuestion}
        tint="var(--status-progress)"
        title="This task doesn't exist"
        description="It may have been deleted, or the link is wrong."
        action={
          <Button asChild>
            <Link to={tasksListHref()}>
              <ListTodo aria-hidden="true" />
              Back to tasks
            </Link>
          </Button>
        }
      />
    </>
  );
}

function Description({ text }: { text: string | null }) {
  if (!text) {
    return <p className="text-sm text-muted-foreground">No description yet.</p>;
  }
  return (
    <div className="flex flex-col gap-2.5 text-[14.5px] leading-[1.75] break-words">
      {text.split(/\n{2,}/).map((paragraph, index) => (
        <p key={index} className="whitespace-pre-line">
          {paragraph}
        </p>
      ))}
    </div>
  );
}

/** `/tasks/:id`: header, description, images, activity and details (spec §16). */
export function TaskDetailsPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [deleted, setDeleted] = useState(false);
  const task = useTask(id, !deleted);

  // Deleted from this page: render nothing while navigating back (no "not found" flash).
  if (deleted) return null;

  if (task.isPending) {
    return (
      <>
        <title>Task · TaskFlow</title>
        <Crumbs />
        <DetailsSkeleton />
      </>
    );
  }

  if (task.isError) {
    const error = task.error;
    const missing =
      isApiError(error, ErrorCode.NOT_FOUND) || isApiError(error, ErrorCode.VALIDATION_ERROR);
    if (missing) return <TaskNotFound />;
    return (
      <>
        <title>Task · TaskFlow</title>
        <Crumbs />
        <ErrorState
          title="Couldn't load this task"
          error={error}
          retrying={task.isFetching}
          onRetry={() => void task.refetch()}
        />
      </>
    );
  }

  return (
    <TaskDetails
      task={task.data}
      onDeleted={() => {
        setDeleted(true);
        void navigate(tasksListHref(), { replace: true });
      }}
    />
  );
}

function TaskDetails({ task, onDeleted }: { task: TaskDetailsDto; onDeleted: () => void }) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { toggle } = useToggleComplete();
  const updateTask = useUpdateTask();
  const done = task.status === 'COMPLETED';

  return (
    <>
      <title>{`${task.title} · TaskFlow`}</title>
      <Crumbs title={task.title} />

      <header className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1 basis-[320px]">
          <h1
            className={cn(
              'text-[26px] leading-tight font-extrabold tracking-[-0.02em] break-words sm:text-[28px]',
              done && 'text-muted-foreground',
            )}
          >
            {task.title}
          </h1>
          <div className="mt-2.5 flex flex-wrap items-center gap-3">
            <StatusBadge status={task.status} />
            <PriorityIndicator priority={task.priority} suffix=" priority" />
            <DueLabel task={task} sentence />
          </div>
        </div>
        <div className="grid w-full grid-cols-2 gap-2.5 sm:flex sm:w-auto sm:flex-wrap [&>*:first-child]:col-span-2">
          {done ? (
            <Button variant="outline" onClick={() => toggle(task)}>
              <RotateCcw aria-hidden="true" />
              Reopen
            </Button>
          ) : (
            <Button onClick={() => toggle(task)}>
              <Check aria-hidden="true" />
              Mark as completed
            </Button>
          )}
          <Button variant="outline" onClick={() => setEditing(true)}>
            <Pencil aria-hidden="true" />
            Edit
          </Button>
          <Button variant="destructive-soft" onClick={() => setDeleting(true)}>
            <Trash2 aria-hidden="true" />
            Delete
          </Button>
        </div>
      </header>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card title="Description" className="lg:col-start-1">
          <Description text={task.description} />
        </Card>
        <div className="lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:self-start">
          <TaskMetaPanel
            task={task}
            onStatusChange={(status) =>
              updateTask.mutate({ id: task.id, input: { status }, optimistic: true })
            }
            onPriorityChange={(priority) =>
              updateTask.mutate({ id: task.id, input: { priority }, optimistic: true })
            }
          />
        </div>
        <div className="lg:col-start-1">
          <TaskImages task={task} />
        </div>
        <Card title="Activity" className="lg:col-start-1">
          <TaskActivityList taskId={task.id} />
        </Card>
      </div>

      <TaskFormDialog open={editing} task={editing ? task : null} onOpenChange={setEditing} />
      <DeleteTaskDialog
        task={deleting ? task : null}
        onOpenChange={setDeleting}
        onDeleted={onDeleted}
      />
    </>
  );
}
