import type { CSSProperties, ReactNode } from 'react';
import { addDays, format } from 'date-fns';
import { CalendarDays, ClipboardCheck, LockKeyhole, Timer, type LucideIcon } from 'lucide-react';

import { PriorityIndicator } from '@/components/common/priority-indicator';
import { StatusBadge } from '@/components/common/status-badge';
import { cn } from '@/lib/utils';

/*
 * Floating mini UI cards for the auth brand panel (spec §15.6), built from the same
 * StatusBadge / PriorityIndicator components as the app. Always light (`surface-light`).
 */

function FloatCard({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        'surface-light absolute rounded-[18px] bg-card px-4 py-3.5 text-[13px] text-foreground shadow-[0_24px_40px_-18px_rgb(10_10_40/0.45)]',
        className,
      )}
    >
      {children}
    </div>
  );
}

function StatCard({
  icon: Icon,
  tint,
  value,
  label,
}: {
  icon: LucideIcon;
  tint: string;
  value: string;
  label: string;
}) {
  return (
    <div className="flex items-center gap-3" style={{ '--tint': tint } as CSSProperties}>
      <span className="grid size-10 place-items-center rounded-full bg-(--tint) text-white shadow-[0_10px_18px_-10px_var(--tint)]">
        <Icon className="size-[18px]" />
      </span>
      <div>
        <p className="text-[22px] leading-none font-extrabold">{value}</p>
        <p className="mt-1 font-semibold text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

export function LoginFloats() {
  return (
    <>
      <FloatCard className="top-2.5 left-0 w-[260px] -rotate-3">
        <p className="mb-1.5 text-sm font-bold">Refresh token rotation</p>
        <div className="flex items-center gap-2.5">
          <StatusBadge status="IN_PROGRESS" />
          <PriorityIndicator priority="HIGH" />
        </div>
      </FloatCard>
      <FloatCard className="top-[70px] right-2.5 w-[220px] rotate-3">
        <StatCard icon={ClipboardCheck} tint="var(--status-done)" value="10" label="Completed" />
      </FloatCard>
      <FloatCard className="top-[176px] left-[70px] w-[250px]">
        <p className="mb-2 text-sm font-bold">Completion rate · 42%</p>
        <div className="h-2 overflow-hidden rounded-full bg-fill">
          <span className="block h-full w-[42%] rounded-full bg-[linear-gradient(90deg,var(--primary),var(--primary-2))]" />
        </div>
      </FloatCard>
    </>
  );
}

export function RegisterFloats() {
  const due = format(addDays(new Date(), 2), 'EEE, MMM d');
  return (
    <>
      <FloatCard className="top-2.5 left-0 w-[260px] -rotate-3">
        <p className="mb-1.5 text-sm font-bold">Password reset emails</p>
        <div className="flex items-center gap-2.5">
          <StatusBadge status="TODO" />
          <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-muted-foreground">
            <CalendarDays className="size-3.5" />
            {due}
          </span>
        </div>
      </FloatCard>
      <FloatCard className="top-[70px] right-2.5 w-[220px] rotate-3">
        <StatCard icon={Timer} tint="var(--status-progress)" value="6" label="In Progress" />
      </FloatCard>
      <FloatCard className="top-[176px] left-[70px] w-[250px]">
        <p className="mb-1 flex items-center gap-1.5 text-sm font-bold">
          <LockKeyhole className="size-4 text-primary" />
          Your data is yours
        </p>
        <p className="leading-snug text-muted-foreground">
          Every task is scoped to your account, enforced by the API.
        </p>
      </FloatCard>
    </>
  );
}
