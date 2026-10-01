import { useRef, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  type TaskPriority,
  type TaskStatus,
} from '@taskflow/shared';

import { PRIORITY_META, STATUS_META } from '@/lib/task-meta';
import { cn } from '@/lib/utils';

import { PriorityBars } from './priority-bars';

export interface PickerOption<T extends string> {
  value: T;
  label: string;
  /** CSS colour for the selected state. */
  tint: string;
  icon: ReactNode;
}

export interface OptionPickerProps<T extends string> {
  options: readonly PickerOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** id of the visible label. */
  labelledBy: string;
  disabled?: boolean;
  name?: string;
}

/** Segmented radio group (status and priority in the task dialog) with arrow-key navigation. */
export function OptionPicker<T extends string>({
  options,
  value,
  onChange,
  labelledBy,
  disabled = false,
  name,
}: OptionPickerProps<T>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const delta =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? -1
          : 0;
    if (delta === 0) return;
    event.preventDefault();
    const next = (index + delta + options.length) % options.length;
    const option = options[next];
    if (!option) return;
    onChange(option.value);
    refs.current[next]?.focus();
  };

  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className="grid grid-cols-3 gap-2">
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="radio"
            name={name}
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
            style={{ '--tint': option.tint } as CSSProperties}
            className={cn(
              // Phones stack the icon over the label so "In Progress" fits a third of the width.
              'flex min-h-11 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl px-1.5 py-2 text-[13px] font-bold transition-[background-color,box-shadow,color] duration-150 focus-visible:ring-4 focus-visible:ring-ring/30 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60 min-[440px]:flex-row min-[440px]:gap-2 min-[440px]:px-2 min-[440px]:py-0',
              selected
                ? 'bg-tint-soft text-[color-mix(in_oklab,var(--tint)_85%,var(--foreground))] shadow-[inset_0_0_0_1.5px_var(--tint)]'
                : 'bg-fill text-muted-foreground hover:text-foreground',
            )}
          >
            {option.icon}
            <span className="max-w-full truncate">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

const STATUS_OPTIONS: readonly PickerOption<TaskStatus>[] = TASK_STATUSES.map((status) => ({
  value: status,
  label: STATUS_META[status].label,
  tint: STATUS_META[status].tint,
  icon: <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-(--tint)" />,
}));

const PRIORITY_TINT: Record<TaskPriority, string> = {
  LOW: 'var(--muted-foreground)',
  MEDIUM: 'var(--primary)',
  HIGH: 'var(--danger)',
};

const PRIORITY_OPTIONS: readonly PickerOption<TaskPriority>[] = TASK_PRIORITIES.map((priority) => ({
  value: priority,
  label: PRIORITY_META[priority].label,
  tint: PRIORITY_TINT[priority],
  icon: <PriorityBars priority={priority} className="text-(--tint)" />,
}));

type PickerProps<T extends string> = Omit<OptionPickerProps<T>, 'options'>;

export function StatusPicker(props: PickerProps<TaskStatus>) {
  return <OptionPicker options={STATUS_OPTIONS} {...props} />;
}

export function PriorityPicker(props: PickerProps<TaskPriority>) {
  return <OptionPicker options={PRIORITY_OPTIONS} {...props} />;
}
