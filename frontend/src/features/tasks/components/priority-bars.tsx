import { PRIORITY_META, type TaskPriority } from '@/lib/task-meta';
import { cn } from '@/lib/utils';

const BARS = [
  { x: 3, y: 14, height: 7 },
  { x: 9.75, y: 9, height: 12 },
  { x: 16.5, y: 4, height: 17 },
] as const;

/** The signal-bars glyph alone (decorative); pair it with a visible label. */
export function PriorityBars({
  priority,
  className,
}: {
  priority: TaskPriority;
  className?: string;
}) {
  const filled = PRIORITY_META[priority].bars;
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="currentColor"
      className={cn('size-[15px] shrink-0', className)}
    >
      {BARS.map((bar, index) => (
        <rect
          key={bar.x}
          x={bar.x}
          y={bar.y}
          width={4.5}
          height={bar.height}
          rx={1.5}
          opacity={index < filled ? 1 : 0.22}
        />
      ))}
    </svg>
  );
}
