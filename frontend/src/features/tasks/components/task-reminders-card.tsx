import type { CSSProperties } from 'react';
import type { TaskReminderDto } from '@taskflow/shared';
import { AlarmClock, CalendarClock, Pencil } from 'lucide-react';

import { Button } from '@/components/ui/button';

import { REMINDER_STATUS_META, describeReminder } from '../reminders';

function StatusChip({ status }: { status: TaskReminderDto['status'] }) {
  const meta = REMINDER_STATUS_META[status];
  return (
    <span
      style={{ '--tint': meta.tint } as CSSProperties}
      className="inline-flex shrink-0 items-center rounded-full bg-tint-soft px-2 py-0.5 text-[11.5px] font-bold whitespace-nowrap text-tint"
    >
      {meta.label}
    </span>
  );
}

/** "Reminders" card on the task page: each reminder's timing, status and message. */
export function TaskRemindersCard({
  reminders,
  onEdit,
}: {
  reminders: TaskReminderDto[];
  onEdit: () => void;
}) {
  return (
    <section
      aria-labelledby="task-reminders-heading"
      className="rounded-card bg-card p-[22px] shadow-card"
    >
      <div className="mb-3 flex items-center gap-2">
        <h2 id="task-reminders-heading" className="text-base font-extrabold">
          Reminders
        </h2>
        {reminders.length > 0 ? (
          <span className="text-xs font-semibold text-muted-foreground tabular-nums">
            {reminders.length}
          </span>
        ) : null}
        <Button variant="ghost" size="sm" className="ml-auto -mr-2" onClick={onEdit}>
          <Pencil aria-hidden="true" />
          {reminders.length > 0 ? 'Edit' : 'Add'}
          <span className="sr-only"> reminders</span>
        </Button>
      </div>
      {reminders.length === 0 ? (
        <p className="text-sm text-muted-foreground">No reminders. Add one with Edit.</p>
      ) : (
        <ul className="flex flex-col">
          {reminders.map((reminder) => {
            const { title, time } = describeReminder(reminder);
            const Icon = reminder.kind === 'relative' ? AlarmClock : CalendarClock;
            return (
              <li
                key={reminder.id}
                className="flex gap-3 border-t border-border py-3 first:border-t-0 first:pt-0.5 last:pb-0"
              >
                <Icon
                  aria-hidden="true"
                  className="mt-0.5 size-[17px] shrink-0 text-muted-foreground"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                    <p className="text-sm font-bold">{title}</p>
                    <StatusChip status={reminder.status} />
                  </div>
                  {time ? (
                    <p className="mt-0.5 text-[12.5px] font-semibold text-muted-foreground">
                      {time}
                    </p>
                  ) : null}
                  {reminder.message ? (
                    <p className="mt-1.5 rounded-input bg-fill px-2.5 py-1.5 text-[13px] leading-normal break-words whitespace-pre-line">
                      {reminder.message}
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
