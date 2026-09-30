import { PRIORITY_META, type TaskPriority } from '@/lib/task-meta';
import { cn } from '@/lib/utils';

export interface PriorityIndicatorProps {
  priority: TaskPriority;
  /** Hide the text visually (it stays available to screen readers). */
  hideLabel?: boolean;
  /** Appended to the label, e.g. " priority" → "High priority". */
  suffix?: string;
  className?: string;
}

const BARS = [
  { x: 3, y: 14, height: 7 },
  { x: 9.75, y: 9, height: 12 },
  { x: 16.5, y: 4, height: 17 },
] as const;

/** Signal-bars icon: shape encodes priority; only High uses colour (coral). */
export function PriorityIndicator({
  priority,
  hideLabel = false,
  suffix = '',
  className,
}: PriorityIndicatorProps) {
  const meta = PRIORITY_META[priority];
  return (
    <span
      data-priority={priority}
      className={cn(
        'inline-flex items-center gap-1.5 text-[12.5px] font-semibold whitespace-nowrap',
        priority === 'HIGH' ? 'text-danger' : 'text-muted-foreground',
        className,
      )}
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="size-[15px] shrink-0"
        fill="currentColor"
      >
        {BARS.map((bar, index) => (
          <rect
            key={bar.x}
            x={bar.x}
            y={bar.y}
            width={4.5}
            height={bar.height}
            rx={1.5}
            opacity={index < meta.bars ? 1 : 0.22}
          />
        ))}
      </svg>
      <span className={cn(hideLabel && 'sr-only')}>
        {meta.label}
        {suffix}
      </span>
    </span>
  );
}
