import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  type TaskPriority,
  type TaskStatus,
} from '@taskflow/shared';
import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  ChevronDown,
  ListFilter,
  Search,
  SignalHigh,
  TriangleAlert,
  X,
} from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PRIORITY_META, STATUS_META } from '@/lib/task-meta';
import { cn } from '@/lib/utils';

import {
  DEFAULT_ORDER,
  hasActiveFilters,
  LIST_SORT_FIELDS,
  ORDER_LABELS,
  SORT_LABELS,
  type ListSortField,
  type SortOrder,
  type TaskSearchPatch,
  type TaskSearchState,
  toggleFilterValue,
} from '../url-state';
import { PriorityBars } from './priority-bars';

export interface TasksToolbarProps {
  state: TaskSearchState;
  onChange: (patch: TaskSearchPatch, options?: { replace?: boolean }) => void;
  onClear: () => void;
}

const chip =
  'inline-flex h-10 shrink-0 cursor-pointer items-center gap-[7px] rounded-full bg-card px-3.5 text-[13px] font-semibold whitespace-nowrap text-foreground shadow-card transition-[background-color,color,box-shadow] duration-150 outline-none hover:bg-[color-mix(in_oklab,var(--fill)_60%,var(--card))] focus-visible:ring-4 focus-visible:ring-ring/30 data-[state=open]:ring-4 data-[state=open]:ring-ring/20 [&_svg]:size-[15px] [&_svg]:shrink-0';

const chipOn =
  'bg-tint-soft text-[color-mix(in_oklab,var(--tint)_88%,var(--foreground))] shadow-none hover:bg-tint-strong';

/** Search, filters and sort (spec §16). Writes everything to the URL through `onChange`. */
export function TasksToolbar({ state, onChange, onClear }: TasksToolbarProps) {
  const board = state.view === 'board';
  const filtered = hasActiveFilters(state);

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center lg:gap-2.5">
      <SearchInput
        value={state.search}
        onCommit={(search) => onChange({ search }, { replace: true })}
      />
      <div
        role="group"
        aria-label="Filters"
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:-mx-6 sm:px-6 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0 lg:pb-0 [&::-webkit-scrollbar]:hidden"
      >
        {board ? null : (
          <MultiFilter
            label="Status"
            icon={<ListFilter aria-hidden="true" />}
            tint="var(--primary)"
            options={TASK_STATUSES.map((status) => ({
              value: status,
              label: STATUS_META[status].label,
              icon: (
                <span
                  aria-hidden="true"
                  className="size-2 rounded-full bg-(--dot)"
                  style={{ '--dot': STATUS_META[status].tint } as CSSProperties}
                />
              ),
            }))}
            selected={state.status}
            onToggle={(value: TaskStatus, checked) =>
              onChange((current) => ({
                status: toggleFilterValue(current.status, value, checked, TASK_STATUSES),
              }))
            }
            onReset={() => onChange({ status: [] })}
          />
        )}
        <MultiFilter
          label="Priority"
          icon={<SignalHigh aria-hidden="true" />}
          tint="var(--primary)"
          options={TASK_PRIORITIES.map((priority) => ({
            value: priority,
            label: PRIORITY_META[priority].label,
            icon: (
              <PriorityBars
                priority={priority}
                className={priority === 'HIGH' ? 'text-danger' : 'text-muted-foreground'}
              />
            ),
          }))}
          selected={state.priority}
          onToggle={(value: TaskPriority, checked) =>
            onChange((current) => ({
              priority: toggleFilterValue(current.priority, value, checked, TASK_PRIORITIES),
            }))
          }
          onReset={() => onChange({ priority: [] })}
        />
        <button
          type="button"
          aria-pressed={state.overdue}
          onClick={() => onChange((current) => ({ overdue: !current.overdue }))}
          style={{ '--tint': 'var(--danger)' } as CSSProperties}
          className={cn(chip, state.overdue && chipOn)}
        >
          <TriangleAlert
            aria-hidden="true"
            className={state.overdue ? 'text-danger' : 'text-muted-foreground'}
          />
          Overdue only
        </button>
        {board ? null : (
          <SortMenu
            sortBy={state.sortBy}
            sortOrder={state.sortOrder}
            onChange={(sortBy, sortOrder) => onChange({ sortBy, sortOrder })}
          />
        )}
        {filtered ? (
          <button
            type="button"
            onClick={onClear}
            className={cn(
              chip,
              'bg-transparent text-muted-foreground shadow-none hover:bg-fill hover:text-foreground',
            )}
          >
            <X aria-hidden="true" />
            Clear all
          </button>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ search */

function SearchInput({ value, onCommit }: { value: string; onCommit: (value: string) => void }) {
  const [text, setText] = useState(value);
  const [synced, setSynced] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  // The URL changed from elsewhere (Clear all, back button): show it, unless it is just the
  // trimmed version of what is being typed.
  if (value !== synced) {
    setSynced(value);
    if (value !== text.trim()) setText(value);
  }

  useEffect(() => {
    if (text.trim() === value) return;
    const timer = setTimeout(() => onCommit(text.trim()), 300);
    return () => clearTimeout(timer);
  }, [text, value, onCommit]);

  return (
    <div className="flex h-11 w-full items-center gap-2.5 rounded-full bg-card px-4 text-sm shadow-card transition-shadow duration-150 focus-within:shadow-[0_0_0_4px_color-mix(in_oklab,var(--primary)_18%,transparent),var(--shadow-card)] lg:w-auto lg:max-w-[360px] lg:min-w-[260px] lg:flex-1">
      <Search aria-hidden="true" className="size-[18px] shrink-0 text-muted-foreground" />
      <input
        ref={inputRef}
        type="search"
        data-hotkey-search=""
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            onCommit(text.trim());
          } else if (event.key === 'Escape') {
            event.preventDefault();
            if (text) {
              setText('');
              onCommit('');
            } else {
              inputRef.current?.blur();
            }
          }
        }}
        placeholder="Search by title…"
        aria-label="Search tasks by title"
        autoComplete="off"
        spellCheck={false}
        className="peer h-full w-full min-w-0 bg-transparent text-base outline-none placeholder:text-muted-foreground sm:text-sm [&::-webkit-search-cancel-button]:appearance-none"
      />
      {text ? (
        <button
          type="button"
          onClick={() => {
            setText('');
            onCommit('');
            inputRef.current?.focus();
          }}
          aria-label="Clear search"
          className="-mr-1.5 grid size-7 shrink-0 cursor-pointer place-items-center rounded-full text-muted-foreground transition-colors hover:bg-fill hover:text-foreground focus-visible:ring-4 focus-visible:ring-ring/30 focus-visible:outline-none"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      ) : (
        <kbd
          aria-hidden="true"
          className="hidden rounded-md border border-border px-1.5 font-sans text-[11px] leading-5 font-semibold text-muted-foreground peer-focus:invisible lg:block"
        >
          /
        </kbd>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ multi-filter */

interface FilterOption<T extends string> {
  value: T;
  label: string;
  icon: ReactNode;
}

function MultiFilter<T extends string>({
  label,
  icon,
  tint,
  options,
  selected,
  onToggle,
  onReset,
}: {
  label: string;
  icon: ReactNode;
  tint: string;
  options: FilterOption<T>[];
  selected: T[];
  onToggle: (value: T, checked: boolean) => void;
  onReset: () => void;
}) {
  const active = selected.length > 0;
  const summary = active
    ? options
        .filter((option) => selected.includes(option.value))
        .map((option) => option.label)
        .join(', ')
    : 'All';

  return (
    <div
      style={{ '--tint': tint } as CSSProperties}
      className={cn('inline-flex shrink-0 items-center rounded-full', active && 'bg-tint-soft')}
    >
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(chip, active && cn(chipOn, 'bg-transparent pr-2 hover:bg-transparent'))}
        >
          {active ? null : <span className="text-muted-foreground">{icon}</span>}
          <span>
            {label}: {summary}
          </span>
          {active ? null : <ChevronDown aria-hidden="true" className="text-muted-foreground" />}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-52">
          <DropdownMenuLabel>{label}</DropdownMenuLabel>
          {options.map((option) => (
            <DropdownMenuCheckboxItem
              key={option.value}
              checked={selected.includes(option.value)}
              onCheckedChange={(checked) => onToggle(option.value, checked === true)}
              onSelect={(event) => event.preventDefault()}
            >
              <span className="grid w-4 place-items-center">{option.icon}</span>
              {option.label}
            </DropdownMenuCheckboxItem>
          ))}
          {active ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem
                checked={false}
                onCheckedChange={onReset}
                className="text-muted-foreground"
              >
                <X aria-hidden="true" />
                Show all
              </DropdownMenuCheckboxItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {active ? (
        <button
          type="button"
          onClick={onReset}
          aria-label={`Clear ${label.toLowerCase()} filter`}
          className="mr-1.5 grid size-7 cursor-pointer place-items-center rounded-full text-[color-mix(in_oklab,var(--tint)_88%,var(--foreground))] transition-colors hover:bg-tint-strong focus-visible:ring-4 focus-visible:ring-ring/30 focus-visible:outline-none"
        >
          <X aria-hidden="true" className="size-[15px]" />
        </button>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------- sort */

function SortMenu({
  sortBy,
  sortOrder,
  onChange,
}: {
  sortBy: ListSortField;
  sortOrder: SortOrder;
  onChange: (sortBy: ListSortField, sortOrder: SortOrder) => void;
}) {
  const OrderIcon = sortOrder === 'asc' ? ArrowUpNarrowWide : ArrowDownWideNarrow;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={chip} aria-label={`Sort: ${SORT_LABELS[sortBy]}, ${ORDER_LABELS[sortBy][sortOrder]}`}>
        <OrderIcon aria-hidden="true" className="text-muted-foreground" />
        Sort: {SORT_LABELS[sortBy]} {sortOrder === 'asc' ? '↑' : '↓'}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-56">
        <DropdownMenuLabel>Sort by</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={sortBy}
          onValueChange={(value) => {
            const field = value as ListSortField;
            onChange(field, DEFAULT_ORDER[field]);
          }}
        >
          {LIST_SORT_FIELDS.map((field) => (
            <DropdownMenuRadioItem key={field} value={field} onSelect={(e) => e.preventDefault()}>
              {SORT_LABELS[field]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Order</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={sortOrder}
          onValueChange={(value) => onChange(sortBy, value as SortOrder)}
        >
          {(DEFAULT_ORDER[sortBy] === 'asc' ? (['asc', 'desc'] as const) : (['desc', 'asc'] as const))
            .map((order) => (
              <DropdownMenuRadioItem key={order} value={order}>
                {ORDER_LABELS[sortBy][order]}
              </DropdownMenuRadioItem>
            ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
