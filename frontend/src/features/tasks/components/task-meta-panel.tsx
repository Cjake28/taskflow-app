import type { ReactNode } from 'react';
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  type TaskDetailsDto,
  type TaskPriority,
  type TaskStatus,
} from '@taskflow/shared';
import { formatDistanceToNowStrict } from 'date-fns';
import {
  CalendarDays,
  ChevronDown,
  CircleCheck,
  ImageIcon,
  PencilLine,
  Plus,
  SignalHigh,
  Timer,
} from 'lucide-react';

import { PriorityIndicator } from '@/components/common/priority-indicator';
import { StatusBadge } from '@/components/common/status-badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PRIORITY_META, STATUS_META } from '@/lib/task-meta';
import { cn } from '@/lib/utils';

import { formatDateTime, formatDueDetail } from '../format';
import { PriorityBars } from './priority-bars';

function Row({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border py-[13px] text-sm first:border-t-0 first:pt-1">
      <dt className="flex items-center gap-2 text-[13px] font-semibold text-muted-foreground [&_svg]:size-[15px]">
        {icon}
        {label}
      </dt>
      <dd className="min-w-0 text-right font-bold">{children}</dd>
    </div>
  );
}

const menuTrigger =
  'inline-flex cursor-pointer items-center gap-1.5 rounded-full p-0.5 pr-1.5 outline-none transition-colors hover:bg-fill focus-visible:ring-4 focus-visible:ring-ring/30 data-[state=open]:bg-fill';

export interface TaskMetaPanelProps {
  task: TaskDetailsDto;
  onStatusChange: (status: TaskStatus) => void;
  onPriorityChange: (priority: TaskPriority) => void;
}

/** "Details" card (spec §16): status, priority, due, created, updated, completed. */
export function TaskMetaPanel({ task, onStatusChange, onPriorityChange }: TaskMetaPanelProps) {
  const due = formatDueDetail(task);
  return (
    <section
      aria-labelledby="task-details-heading"
      className="rounded-card bg-card p-[22px] shadow-card"
    >
      <h2 id="task-details-heading" className="mb-3.5 text-base font-extrabold">
        Details
      </h2>
      <dl className="flex flex-col">
        <Row icon={<Timer aria-hidden="true" />} label="Status">
          <DropdownMenu>
            <DropdownMenuTrigger
              className={menuTrigger}
              aria-label={`Status: ${STATUS_META[task.status].label}. Change status`}
            >
              <StatusBadge status={task.status} />
              <ChevronDown aria-hidden="true" className="size-[15px] text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-44">
              <DropdownMenuLabel>Status</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={task.status}
                onValueChange={(value) => {
                  if (value !== task.status) onStatusChange(value as TaskStatus);
                }}
              >
                {TASK_STATUSES.map((status) => (
                  <DropdownMenuRadioItem key={status} value={status}>
                    <span
                      aria-hidden="true"
                      className="size-2 rounded-full"
                      style={{ background: STATUS_META[status].tint }}
                    />
                    {STATUS_META[status].label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </Row>
        <Row icon={<SignalHigh aria-hidden="true" />} label="Priority">
          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(menuTrigger, 'pl-1.5')}
              aria-label={`Priority: ${PRIORITY_META[task.priority].label}. Change priority`}
            >
              <PriorityIndicator priority={task.priority} />
              <ChevronDown aria-hidden="true" className="size-[15px] text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-40">
              <DropdownMenuLabel>Priority</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={task.priority}
                onValueChange={(value) => {
                  if (value !== task.priority) onPriorityChange(value as TaskPriority);
                }}
              >
                {TASK_PRIORITIES.map((priority) => (
                  <DropdownMenuRadioItem key={priority} value={priority}>
                    <PriorityBars
                      priority={priority}
                      className={priority === 'HIGH' ? 'text-danger' : 'text-muted-foreground'}
                    />
                    {PRIORITY_META[priority].label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </Row>
        <Row icon={<CalendarDays aria-hidden="true" />} label="Due date">
          {due ? (
            <span className={cn(task.isOverdue && 'text-danger')}>{due}</span>
          ) : (
            <span className="font-semibold text-muted-foreground">No due date</span>
          )}
        </Row>
        <Row icon={<Plus aria-hidden="true" />} label="Created">
          {formatDateTime(task.createdAt)}
        </Row>
        <Row icon={<PencilLine aria-hidden="true" />} label="Last updated">
          <time dateTime={task.updatedAt} title={formatDateTime(task.updatedAt)}>
            {formatDistanceToNowStrict(new Date(task.updatedAt), { addSuffix: true })}
          </time>
        </Row>
        <Row icon={<CircleCheck aria-hidden="true" />} label="Completed">
          {task.completedAt ? (
            formatDateTime(task.completedAt)
          ) : (
            <span className="font-semibold text-muted-foreground">Not yet</span>
          )}
        </Row>
        <Row icon={<ImageIcon aria-hidden="true" />} label="Images">
          {task.images.length}
        </Row>
      </dl>
    </section>
  );
}
