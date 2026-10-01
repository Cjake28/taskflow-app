import { useId, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

export interface ProfileCardProps {
  title: ReactNode;
  description?: ReactNode;
  /** Right side of the title row. */
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Settings card: h2 title, muted description, content (approved profile mockup). */
export function ProfileCard({ title, description, aside, children, className }: ProfileCardProps) {
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      className={cn('min-w-0 rounded-card bg-card p-5 shadow-card sm:p-[22px]', className)}
    >
      <div className="mb-3.5 flex items-center gap-2.5">
        <h2 id={titleId} className="text-base font-extrabold tracking-[-0.01em]">
          {title}
        </h2>
        {aside ? <div className="ml-auto flex items-center gap-2">{aside}</div> : null}
      </div>
      {description ? (
        <p className="-mt-1.5 mb-[18px] text-[13.5px] leading-normal text-muted-foreground">
          {description}
        </p>
      ) : null}
      {children}
    </section>
  );
}
