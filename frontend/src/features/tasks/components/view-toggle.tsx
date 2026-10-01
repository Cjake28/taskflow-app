import { Columns3, List, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

import type { TaskView } from '../url-state';

interface ViewOption {
  value: TaskView;
  label: string;
  icon: LucideIcon;
}

const LIST: ViewOption = { value: 'list', label: 'List', icon: List };
const BOARD: ViewOption = { value: 'board', label: 'Board', icon: Columns3 };
const OPTIONS = [LIST, BOARD];

export interface ViewToggleProps {
  view: TaskView;
  /** URL of each view with the current filters kept. */
  hrefFor: (view: TaskView) => string;
}

/** List / Board switch: segmented on wide screens, a round icon button on phones. */
export function ViewToggle({ view, hrefFor }: ViewToggleProps) {
  const other = view === 'board' ? LIST : BOARD;
  const OtherIcon = other.icon;
  return (
    <>
      <nav aria-label="Views" className="hidden rounded-full bg-fill p-1 sm:flex">
        {OPTIONS.map(({ value, label, icon: Icon }) => {
          const active = value === view;
          return (
            <Link
              key={value}
              to={hrefFor(value)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-bold transition-[background-color,color,box-shadow] duration-150 focus-visible:ring-4 focus-visible:ring-ring/30 focus-visible:outline-none',
                active
                  ? 'bg-card text-foreground shadow-card'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon aria-hidden="true" className="size-4" />
              {label}
            </Link>
          );
        })}
      </nav>
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            to={hrefFor(other.value)}
            aria-label={`Switch to ${other.label.toLowerCase()} view`}
            className="grid size-11 place-items-center rounded-full bg-card text-foreground shadow-card transition-transform focus-visible:ring-4 focus-visible:ring-ring/30 focus-visible:outline-none active:scale-95 sm:hidden"
          >
            <OtherIcon aria-hidden="true" className="size-[18px]" />
          </Link>
        </TooltipTrigger>
        <TooltipContent>{other.label} view</TooltipContent>
      </Tooltip>
    </>
  );
}
