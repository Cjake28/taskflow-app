import { useEffect, useId, useState, type ComponentProps } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import {
  IMAGE_LIMITS,
  TASK_LIMITS,
  type ImageDto,
  type TaskDetailsDto,
  type TaskDto,
  type TaskReminderDto,
  type TaskStatus,
} from '@taskflow/shared';
import { CalendarDays, Check, ChevronDown, Clock3, ExternalLink, Plus, X } from 'lucide-react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';

import { ImageDropzone } from '@/components/images/image-dropzone';
import { UploadQueue } from '@/components/images/upload-queue';
import { useUploadQueue } from '@/components/images/use-upload-queue';
import { Alert } from '@/components/common/alert';
import { ErrorState } from '@/components/common/error-state';
import { FormField } from '@/components/common/form-field';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { applyServerErrors } from '@/lib/form-errors';
import { invalidateTaskData } from '@/lib/query-keys';
import { STATUS_META } from '@/lib/task-meta';
import { cn } from '@/lib/utils';

import { setTaskImages } from '../cache';
import { formatClock, timeOptions } from '../format';
import { useCreateTask, useTask, useUpdateTask } from '../hooks';
import { remapReminderErrors } from '../reminders';
import {
  taskFormSchema,
  toCreateInput,
  toFormValues,
  toUpdateInput,
  type TaskFormInput,
  type TaskFormValues,
} from '../task-form';
import { PriorityPicker, StatusPicker } from './option-picker';
import { RemindersField } from './reminders-field';

export interface TaskFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The task to edit; omit to create a new one. Its reminders are loaded when not included. */
  task?: TaskDto | TaskDetailsDto | null;
  /** Pre-selected status when creating (board quick add). */
  defaultStatus?: TaskStatus;
  /** Pre-filled due date (`yyyy-MM-dd`) when creating, e.g. from the calendar. */
  defaultDueDate?: string;
}

const fieldShell =
  'flex min-h-12 w-full items-center gap-2.5 rounded-input border-[1.5px] border-transparent bg-fill px-3.5 text-sm text-foreground transition-[background-color,border-color,box-shadow] duration-150';

const textareaClass =
  'block min-h-24 w-full resize-y rounded-input border-[1.5px] border-transparent bg-fill px-3.5 py-3 text-base leading-relaxed text-foreground transition-[background-color,border-color,box-shadow] duration-150 outline-none placeholder:text-muted-foreground focus-visible:border-primary focus-visible:bg-card focus-visible:shadow-[0_0_0_4px_color-mix(in_oklab,var(--primary)_16%,transparent)] disabled:opacity-60 aria-invalid:border-danger aria-invalid:bg-[color-mix(in_oklab,var(--danger)_6%,var(--card))] sm:text-sm';

type Phase = 'form' | 'uploading' | 'partial';

type EditableTask = TaskDto & { reminders: TaskReminderDto[] };

const withReminders = (task: TaskDto | TaskDetailsDto): task is TaskDetailsDto =>
  'reminders' in task && Array.isArray(task.reminders);

/**
 * Create / edit dialog (spec §16). One component for both; images can be attached when creating
 * and upload right after the task exists.
 */
export function TaskFormDialog({
  open,
  onOpenChange,
  task,
  defaultStatus,
  defaultDueDate,
}: TaskFormDialogProps) {
  // A fresh form (and upload queue) every time the dialog opens; the close animation keeps the
  // last state on screen.
  const [session, setSession] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setSession((value) => value + 1);
  }
  // Keep editing the same task while the dialog animates out (the parent clears it on close).
  const [shownTask, setShownTask] = useState(task ?? null);
  if (task && task !== shownTask) setShownTask(task);
  const current = task ?? (open ? null : shownTask);

  // Lists only carry a summary: load the task's reminders before editing it.
  const needsDetails = current !== null && !withReminders(current);
  const details = useTask(current?.id ?? '', open && needsDetails);
  const editable: EditableTask | null =
    current === null ? null : withReminders(current) ? current : (details.data ?? null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {current !== null && editable === null ? (
        <TaskFormLoading
          error={details.isError ? details.error : null}
          retrying={details.isFetching}
          onRetry={() => void details.refetch()}
        />
      ) : (
        <TaskFormContent
          key={`${editable?.id ?? 'new'}-${session}`}
          task={editable}
          defaultStatus={defaultStatus}
          defaultDueDate={defaultDueDate}
          onClose={() => onOpenChange(false)}
        />
      )}
    </Dialog>
  );
}

/** Shown for the moment it takes to load a task's reminders before editing. */
function TaskFormLoading({
  error,
  retrying,
  onRetry,
}: {
  error: unknown;
  retrying: boolean;
  onRetry: () => void;
}) {
  return (
    <DialogContent className="sm:max-w-[560px]" aria-busy={error ? undefined : true}>
      <DialogHeader>
        <DialogTitle>Edit task</DialogTitle>
        <DialogDescription className="sr-only">Loading the task.</DialogDescription>
      </DialogHeader>
      {error ? (
        <ErrorState
          bare
          title="Couldn't load this task"
          error={error}
          retrying={retrying}
          onRetry={onRetry}
        />
      ) : (
        <div aria-hidden="true" className="flex flex-col gap-4">
          <Skeleton className="h-12 w-full rounded-input" />
          <Skeleton className="h-24 w-full rounded-input" />
          <Skeleton className="h-11 w-full rounded-input" />
          <Skeleton className="h-11 w-full rounded-input" />
        </div>
      )}
    </DialogContent>
  );
}

function TaskFormContent({
  task,
  defaultStatus,
  defaultDueDate,
  onClose,
}: {
  task: EditableTask | null;
  defaultStatus?: TaskStatus;
  defaultDueDate?: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const [phase, setPhase] = useState<Phase>('form');
  const [created, setCreated] = useState<TaskDetailsDto | null>(null);

  const statusLabelId = useId();
  const priorityLabelId = useId();
  const imagesLabelId = useId();
  const counterId = useId();

  const form = useForm<TaskFormInput, unknown, TaskFormValues>({
    resolver: zodResolver(taskFormSchema),
    mode: 'onTouched',
    defaultValues: toFormValues(task, { status: defaultStatus, dueDate: defaultDueDate }),
  });
  const { errors, isSubmitting } = form.formState;
  const description = useWatch({ control: form.control, name: 'description' }) ?? '';
  const dueDate = useWatch({ control: form.control, name: 'dueDate' }) ?? '';
  const dueTime = useWatch({ control: form.control, name: 'dueTime' }) ?? '';

  const queue = useUploadQueue({
    concurrency: 2,
    onUploaded: (images: ImageDto[], _item, taskId) =>
      setTaskImages(queryClient, taskId, (current) => [...current, ...images]),
  });

  const editing = task !== null;
  const busy = isSubmitting || phase === 'uploading';
  const locked = isSubmitting || phase !== 'form';
  const descriptionLength = description.trim().length;

  // Once every retried upload has settled, bring lists and counts up to date.
  const { isUploading } = queue;
  useEffect(() => {
    if (phase === 'partial' && !isUploading) void invalidateTaskData(queryClient);
  }, [phase, isUploading, queryClient]);

  const announceCreated = (saved: TaskDetailsDto, imageCount: number) => {
    const images =
      imageCount > 0 ? ` with ${imageCount} ${imageCount === 1 ? 'image' : 'images'}` : '';
    toast.success('Task created', {
      description: `“${saved.title}” was added to ${STATUS_META[saved.status].label}${images}.`,
      action: { label: 'View', onClick: () => void navigate(`/tasks/${saved.id}`) },
    });
  };

  const onSubmit = form.handleSubmit(async (values) => {
    if (task) {
      const input = toUpdateInput(values, task);
      if (!input) {
        onClose();
        return;
      }
      try {
        await updateTask.mutateAsync({ id: task.id, input });
        toast.success('Changes saved', { description: `“${values.title.trim()}” was updated.` });
        onClose();
      } catch (error) {
        applyServerErrors(form, remapReminderErrors(error));
      }
      return;
    }

    let saved: TaskDetailsDto;
    try {
      saved = await createTask.mutateAsync(toCreateInput(values));
    } catch (error) {
      applyServerErrors(form, remapReminderErrors(error));
      return;
    }

    if (queue.readyCount === 0) {
      announceCreated(saved, 0);
      onClose();
      return;
    }

    setCreated(saved);
    setPhase('uploading');
    const summary = await queue.store.uploadAll(saved.id);
    void invalidateTaskData(queryClient);
    if (summary.failed === 0) {
      announceCreated(saved, summary.succeeded);
      onClose();
    } else {
      setPhase('partial');
    }
  });

  const title = phase === 'partial' ? 'Task created' : editing ? 'Edit task' : 'New task';
  const submitLabel = editing ? 'Save changes' : 'Create task';

  return (
    <DialogContent
      showCloseButton={false}
      className="flex flex-col gap-0 overflow-hidden p-0 sm:max-w-[560px]"
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        form.setFocus('title');
      }}
      onEscapeKeyDown={(event) => busy && event.preventDefault()}
      onInteractOutside={(event) => busy && event.preventDefault()}
    >
      <DialogHeader className="flex-row items-center px-6 pt-6 pb-5 pr-6">
        <DialogTitle className="flex-1">{title}</DialogTitle>
        <DialogDescription className="sr-only">
          {editing ? 'Change the details of this task.' : 'Add a task. Only the title is required.'}
        </DialogDescription>
        <DialogClose
          disabled={busy}
          className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-full bg-fill text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-4 focus-visible:ring-ring/30 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        >
          <X aria-hidden="true" className="size-[18px]" />
          <span className="sr-only">Close</span>
        </DialogClose>
      </DialogHeader>

      <form
        noValidate
        onSubmit={onSubmit}
        aria-label={title}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 pt-1 pb-3 [scrollbar-width:thin]">
          {errors.root?.server ? (
            <Alert variant="danger">{errors.root.server.message}</Alert>
          ) : null}
          {phase === 'partial' ? (
            <Alert variant="warning" title="Some images didn't upload">
              Retry them below, or add images later from the task page.
            </Alert>
          ) : null}

          <fieldset disabled={locked} className="flex min-w-0 flex-col gap-4">
            <FormField label="Title" error={errors.title?.message}>
              <Input
                placeholder="What needs to be done?"
                autoComplete="off"
                maxLength={TASK_LIMITS.title}
                {...form.register('title')}
              />
            </FormField>

            <FormField
              label="Description"
              labelHint="Optional"
              error={errors.description?.message}
              describedBy={counterId}
              after={
                <p
                  id={counterId}
                  aria-live="polite"
                  className={cn(
                    'mt-1.5 text-right text-xs font-semibold tabular-nums',
                    descriptionLength > TASK_LIMITS.description
                      ? 'text-danger'
                      : 'text-muted-foreground',
                  )}
                >
                  {descriptionLength} / {TASK_LIMITS.description}
                </p>
              }
            >
              <textarea
                rows={3}
                placeholder="Add notes, links or acceptance criteria…"
                className={textareaClass}
                {...form.register('description')}
              />
            </FormField>

            <div className="flex flex-col">
              <Label id={statusLabelId} className="mb-[7px]">
                Status
              </Label>
              <Controller
                control={form.control}
                name="status"
                render={({ field }) => (
                  <StatusPicker
                    value={field.value}
                    onChange={field.onChange}
                    labelledBy={statusLabelId}
                    disabled={locked}
                  />
                )}
              />
            </div>

            <div className="flex flex-col">
              <Label id={priorityLabelId} className="mb-[7px]">
                Priority
              </Label>
              <Controller
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <PriorityPicker
                    value={field.value}
                    onChange={field.onChange}
                    labelledBy={priorityLabelId}
                    disabled={locked}
                  />
                )}
              />
            </div>

            <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
              <FormField label="Due date" labelHint="Optional" error={errors.dueDate?.message}>
                <Input
                  type="date"
                  startIcon={<CalendarDays />}
                  endSlot={
                    dueDate ? (
                      <button
                        type="button"
                        onClick={() => {
                          form.setValue('dueDate', '', { shouldDirty: true, shouldValidate: true });
                          form.setValue('dueTime', '', { shouldDirty: true });
                        }}
                        aria-label="Clear due date"
                        className="grid size-8 cursor-pointer place-items-center rounded-full text-muted-foreground transition-colors hover:bg-card hover:text-foreground focus-visible:ring-4 focus-visible:ring-ring/30 focus-visible:outline-none"
                      >
                        <X aria-hidden="true" className="size-4" />
                      </button>
                    ) : null
                  }
                  {...form.register('dueDate', {
                    onChange: (event: { target: { value: string } }) => {
                      if (!event.target.value) form.setValue('dueTime', '');
                    },
                  })}
                />
              </FormField>

              <FormField
                label="Time"
                labelHint="Optional"
                error={errors.dueTime?.message}
                hint={dueDate && !dueTime ? 'Due at the end of the day' : undefined}
              >
                <TimeSelect
                  disabled={!dueDate || locked}
                  {...form.register('dueTime')}
                  value={dueTime}
                />
              </FormField>
            </div>

            <RemindersField form={form} locked={locked} dueDate={dueDate} dueTime={dueTime} />

            {!editing ? (
              <div className="flex flex-col">
                <div className="mb-[7px] flex items-center justify-between">
                  <Label id={imagesLabelId}>
                    Images <span className="font-medium text-muted-foreground">Optional</span>
                  </Label>
                  {queue.slotsUsed > 0 ? (
                    <span className="text-xs font-semibold text-muted-foreground tabular-nums">
                      {queue.slotsUsed} / {IMAGE_LIMITS.perTask}
                    </span>
                  ) : null}
                </div>
                <ImageDropzone
                  compact
                  slotsLeft={IMAGE_LIMITS.perTask - queue.slotsUsed}
                  disabled={locked}
                  onFiles={(files) => queue.store.add(files, IMAGE_LIMITS.perTask)}
                />
              </div>
            ) : null}
          </fieldset>

          {!editing ? (
            <UploadQueue
              items={queue.items}
              locked={phase === 'uploading'}
              onRetry={(id) => void queue.store.retry(id)}
              onRemove={(id) => queue.store.remove(id)}
            />
          ) : null}
        </div>

        <DialogFooter className="border-t border-border px-6 pt-4 pb-6">
          {phase === 'partial' && created ? (
            <>
              <Button variant="outline" asChild>
                <Link to={`/tasks/${created.id}`} onClick={onClose}>
                  <ExternalLink aria-hidden="true" />
                  Open task
                </Link>
              </Button>
              <Button type="button" onClick={onClose} disabled={queue.isUploading}>
                <Check aria-hidden="true" />
                Done
              </Button>
            </>
          ) : (
            <>
              <DialogClose asChild>
                <Button type="button" variant="secondary" disabled={busy}>
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" loading={busy}>
                {busy ? null : editing ? <Check aria-hidden="true" /> : <Plus aria-hidden="true" />}
                {phase === 'uploading'
                  ? `Uploading ${queue.uploadingCount} ${queue.uploadingCount === 1 ? 'image' : 'images'}…`
                  : submitLabel}
              </Button>
            </>
          )}
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

type TimeSelectProps = Omit<ComponentProps<'select'>, 'children'> & { value: string };

/** "End of day" or a half-hour slot; styled like the other inputs. */
function TimeSelect({ value, disabled, className, ...props }: TimeSelectProps) {
  return (
    <div
      className={cn(
        fieldShell,
        'relative has-[select:focus-visible]:border-primary has-[select:focus-visible]:bg-card has-[select:focus-visible]:shadow-[0_0_0_4px_color-mix(in_oklab,var(--primary)_16%,transparent)] has-[select[aria-invalid=true]]:border-danger',
        disabled && 'opacity-60',
      )}
    >
      <Clock3 aria-hidden="true" className="size-[17px] shrink-0 text-muted-foreground" />
      <select
        value={value}
        disabled={disabled}
        className={cn(
          'h-11 w-full min-w-0 cursor-pointer appearance-none bg-transparent pr-6 text-base outline-none disabled:cursor-not-allowed sm:text-sm',
          value === '' && 'text-muted-foreground',
          className,
        )}
        {...props}
      >
        <option value="">End of day</option>
        {timeOptions(value || null).map((slot) => (
          <option key={slot} value={slot}>
            {formatClock(slot)}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-3.5 size-4 text-muted-foreground"
      />
    </div>
  );
}
