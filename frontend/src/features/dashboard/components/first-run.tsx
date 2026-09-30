import type { CSSProperties } from 'react';
import { CalendarDays, ClipboardList, Columns3, ImagePlus, Plus, Target } from 'lucide-react';
import { Link } from 'react-router';

import { IconArt } from '@/components/common/icon-art';
import { Button } from '@/components/ui/button';

import { NEW_TASK_HREF, tasksHref } from '../lib/links';

const HIGHLIGHTS = [
  {
    icon: CalendarDays,
    tint: 'var(--primary)',
    title: 'Plan your week',
    text: 'Give a task a due date and it lands on your agenda.',
  },
  {
    icon: Target,
    tint: 'var(--status-done)',
    title: 'Track progress',
    text: 'Your completion rate climbs as you finish tasks.',
  },
  {
    icon: ImagePlus,
    tint: 'var(--status-progress)',
    title: 'Attach images',
    text: 'Add screenshots or photos to any task.',
  },
];

/** Dashboard for a brand-new account: one clear action and what to expect afterwards. */
export function FirstRun() {
  return (
    <section
      aria-labelledby="first-run-title"
      className="relative isolate overflow-hidden rounded-card bg-card px-5 pt-10 pb-6 shadow-card sm:px-10 sm:pt-12 sm:pb-8"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -right-24 -z-10 size-72 rounded-full [--tint:var(--primary)] bg-tint-faint"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-28 -left-20 -z-10 size-64 rounded-full [--tint:var(--primary-2)] bg-tint-faint"
      />

      <div className="mx-auto flex max-w-[520px] flex-col items-center text-center">
        <IconArt icon={ClipboardList} sparkles className="mb-6" />
        <h2
          id="first-run-title"
          className="text-[22px] leading-tight font-extrabold tracking-[-0.02em] sm:text-[26px]"
        >
          No tasks yet
        </h2>
        <p className="mt-2.5 max-w-[400px] text-[14.5px] leading-relaxed text-muted-foreground">
          Create your first task and it&apos;ll show up here, on your board and on your dashboard.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2.5">
          <Button asChild size="lg">
            <Link to={NEW_TASK_HREF}>
              <Plus aria-hidden="true" />
              Add your first task
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to={tasksHref({ view: 'board' })}>
              <Columns3 aria-hidden="true" />
              Open the board
            </Link>
          </Button>
        </div>
        <p className="mt-4 text-[13px] text-muted-foreground">
          Tip: press{' '}
          <kbd className="rounded-md border border-border bg-fill px-1.5 py-0.5 font-sans text-xs font-bold text-foreground">
            N
          </kbd>{' '}
          anywhere to add a task.
        </p>
      </div>

      <ul className="mt-10 grid gap-3 sm:grid-cols-3">
        {HIGHLIGHTS.map(({ icon: Icon, tint, title, text }) => (
          <li
            key={title}
            style={{ '--tint': tint } as CSSProperties}
            className="flex items-start gap-3 rounded-tile bg-tint-faint p-4"
          >
            <span
              aria-hidden="true"
              className="grid size-10 shrink-0 place-items-center rounded-full bg-(--tint) text-card shadow-[0_10px_18px_-10px_var(--tint)]"
            >
              <Icon className="size-[18px]" strokeWidth={2.2} />
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-extrabold">{title}</h3>
              <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{text}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
