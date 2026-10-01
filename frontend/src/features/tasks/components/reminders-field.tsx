import { useId } from 'react';
import { DATE_ONLY_REMINDER_TIME, REMINDER_LIMITS } from '@taskflow/shared';
import { AlarmClock, BellPlus, CalendarDays, CircleCheck, Clock3, Trash2 } from 'lucide-react';
import { useFieldArray, useWatch, type UseFormReturn } from 'react-hook-form';

import { FormField } from '@/components/common/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { cn } from '@/lib/utils';

import { formatClock } from '../format';
import {
  CUSTOM_WHEN,
  formatReminderTime,
  newReminder,
  reminderKey,
  relativeRemindAt,
  whenOptions,
} from '../reminders';
import type { TaskFormInput, TaskFormValues } from '../task-form';

type TaskForm = UseFormReturn<TaskFormInput, unknown, TaskFormValues>;

/** Rows of reminders inside the task form: when, an optional message, remove. */
export function RemindersField({
  form,
  locked,
  dueDate,
  dueTime,
}: {
  form: TaskForm;
  locked: boolean;
  dueDate: string;
  dueTime: string;
}) {
  const labelId = useId();
  const hintId = useId();
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'reminders',
    keyName: 'fieldKey',
  });
  const rows = useWatch({ control: form.control, name: 'reminders' }) ?? [];
  const errors = form.formState.errors.reminders;
  const full = fields.length >= REMINDER_LIMITS.perTask;

  let hint: string | null = null;
  if (!dueDate) hint = 'Add a due date to be reminded before it, or pick a custom time.';
  else if (!dueTime) {
    hint = `Reminders for tasks without a time go out at ${formatClock(DATE_ONLY_REMINDER_TIME)}.`;
  }

  return (
    <div
      className="flex flex-col"
      role="group"
      aria-labelledby={labelId}
      aria-describedby={hint ? hintId : undefined}
    >
      <div className="mb-[7px] flex items-center justify-between">
        <Label id={labelId}>
          Reminders <span className="font-medium text-muted-foreground">Optional</span>
        </Label>
        {fields.length > 0 ? (
          <span className="text-xs font-semibold text-muted-foreground tabular-nums">
            {fields.length} / {REMINDER_LIMITS.perTask}
          </span>
        ) : null}
      </div>
      {hint ? (
        <p id={hintId} className="-mt-0.5 mb-2.5 text-[12.5px] text-muted-foreground">
          {hint}
        </p>
      ) : null}

      {fields.length > 0 ? (
        <ol className="mb-2.5 flex flex-col gap-2.5">
          {fields.map((field, index) => {
            const row = rows[index] ?? field;
            const rowErrors = errors?.[index];
            const custom = row.when === CUSTOM_WHEN;
            const offset = custom ? null : Number(row.when);
            const savedOffset = field.original?.startsWith('relative:')
              ? Number(field.original.slice(9))
              : null;
            const fires =
              offset !== null && dueDate ? relativeRemindAt(offset, dueDate, dueTime) : null;
            const sent = row.sentAt !== null && reminderKey(row) === row.original;
            return (
              <li
                key={field.fieldKey}
                aria-label={`Reminder ${index + 1}`}
                className="flex flex-col gap-2.5 rounded-item border border-border p-3"
              >
                <div className="flex items-end gap-2">
                  <FormField
                    label="When"
                    className="min-w-0 flex-1"
                    error={rowErrors?.when?.message}
                  >
                    <NativeSelect
                      compact
                      startIcon={<AlarmClock />}
                      {...form.register(`reminders.${index}.when`, {
                        onChange: (event: { target: { value: string } }) => {
                          if (event.target.value !== CUSTOM_WHEN || row.date) return;
                          const preset = newReminder([], false);
                          form.setValue(`reminders.${index}.date`, preset.date);
                          form.setValue(`reminders.${index}.time`, preset.time);
                        },
                      })}
                    >
                      {whenOptions(savedOffset).map((option) => (
                        <option
                          key={option.value}
                          value={option.value}
                          disabled={
                            option.value !== CUSTOM_WHEN && !dueDate && option.value !== row.when
                          }
                        >
                          {option.label}
                        </option>
                      ))}
                    </NativeSelect>
                  </FormField>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={locked}
                    aria-label={`Remove reminder ${index + 1}`}
                    onClick={() => remove(index)}
                    className="mb-0 shrink-0 hover:text-danger"
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>

                {custom ? (
                  <div className="grid grid-cols-1 gap-2.5 min-[400px]:grid-cols-2">
                    <FormField label="Date" error={rowErrors?.date?.message}>
                      <Input
                        type="date"
                        startIcon={<CalendarDays />}
                        {...form.register(`reminders.${index}.date`)}
                      />
                    </FormField>
                    <FormField label="Time" error={rowErrors?.time?.message}>
                      <Input
                        type="time"
                        startIcon={<Clock3 />}
                        {...form.register(`reminders.${index}.time`)}
                      />
                    </FormField>
                  </div>
                ) : (
                  <p
                    className={cn(
                      'text-[12.5px] font-semibold',
                      fires
                        ? 'text-muted-foreground'
                        : 'text-[color-mix(in_oklab,var(--status-progress)_80%,var(--foreground))]',
                    )}
                  >
                    {fires
                      ? `Goes out ${formatReminderTime(fires)}`
                      : 'Needs a due date: add one, or pick a custom time.'}
                  </p>
                )}

                <FormField label="Message" labelHint="Optional" error={rowErrors?.message?.message}>
                  <Input
                    autoComplete="off"
                    maxLength={REMINDER_LIMITS.message}
                    placeholder="e.g. Bring the signed contract"
                    {...form.register(`reminders.${index}.message`)}
                  />
                </FormField>

                {sent ? (
                  <p className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-[color-mix(in_oklab,var(--status-done)_80%,var(--foreground))]">
                    <CircleCheck aria-hidden="true" className="size-3.5" />
                    Sent
                  </p>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : null}

      {errors?.message || errors?.root?.message ? (
        <p role="alert" className="mb-2 text-[12.5px] font-semibold text-danger">
          {errors.message ?? errors.root?.message}
        </p>
      ) : null}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        disabled={locked || full}
        onClick={() => append(newReminder(rows, dueDate !== ''))}
      >
        <BellPlus aria-hidden="true" />
        {full ? `Up to ${REMINDER_LIMITS.perTask} reminders` : 'Add reminder'}
      </Button>
    </div>
  );
}
