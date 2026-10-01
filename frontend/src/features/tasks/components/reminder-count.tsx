import { BellRing } from 'lucide-react';

import { cn } from '@/lib/utils';

/** Bell + number of reminders still to come, next to the 📎 count on cards and rows. */
export function ReminderCount({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  const label = `${count} ${count === 1 ? 'reminder' : 'reminders'} set`;
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex items-center gap-1 text-[12.5px] font-semibold text-muted-foreground',
        className,
      )}
    >
      <BellRing aria-hidden="true" className="size-3.5" />
      {count}
    </span>
  );
}
