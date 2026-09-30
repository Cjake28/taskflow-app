import type { ReactNode } from 'react';

import { Logo } from '@/components/common/logo';
import { cn } from '@/lib/utils';

export interface AuthLayoutProps {
  /** Big line on the brand panel. */
  heading: ReactNode;
  /** Supporting copy under the heading. */
  text: ReactNode;
  /**
   * Floating mini cards (placed above the heading) or a centred icon composition
   * (`visualPlacement="center"`).
   */
  visual: ReactNode;
  visualPlacement?: 'top' | 'center';
  children: ReactNode;
}

/**
 * Split auth layout (spec §15.6, §16): gradient brand panel with floating UI cards on the left,
 * the form on the right. The brand panel is hidden on small screens.
 */
export function AuthLayout({
  heading,
  text,
  visual,
  visualPlacement = 'top',
  children,
}: AuthLayoutProps) {
  return (
    <div className="min-h-dvh bg-background lg:grid lg:grid-cols-[1.05fr_1fr]">
      <aside
        aria-hidden="true"
        className="relative m-4 hidden flex-col overflow-hidden rounded-[28px] bg-[linear-gradient(150deg,var(--primary),var(--primary-2))] px-10 py-9 text-white lg:sticky lg:top-4 lg:flex lg:h-[calc(100dvh-2rem)] lg:min-h-[620px]"
      >
        <span className="pointer-events-none absolute -top-[140px] -right-[160px] size-[420px] rounded-full bg-white/8" />
        <span className="pointer-events-none absolute -bottom-[110px] -left-[90px] size-[260px] rounded-full bg-white/8" />

        <Logo onBrand className="relative z-10" />

        {visualPlacement === 'center' ? (
          <div className="relative z-10 grid flex-1 place-items-center">{visual}</div>
        ) : (
          <div className="relative z-10 mt-[26px] h-[300px] shrink-0">{visual}</div>
        )}

        <h2
          className={cn(
            'relative z-10 mb-3 max-w-[440px] text-[34px] leading-[1.15] font-extrabold tracking-[-0.02em]',
            visualPlacement === 'top' && 'mt-auto',
          )}
        >
          {heading}
        </h2>
        <p className="relative z-10 max-w-[400px] leading-relaxed text-white/85">{text}</p>
      </aside>

      <main className="flex min-h-dvh items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-[410px]">
          <Logo className="mb-9 lg:hidden" />
          {children}
        </div>
      </main>
    </div>
  );
}

/** Title + subtitle block shared by every auth form. */
export function AuthHeading({ title, subtitle }: { title: ReactNode; subtitle?: ReactNode }) {
  return (
    <div className="mb-6">
      <h1 className="text-[28px] leading-tight font-extrabold tracking-[-0.02em] sm:text-[30px]">
        {title}
      </h1>
      {subtitle ? <p className="mt-1.5 text-[14.5px] text-muted-foreground">{subtitle}</p> : null}
    </div>
  );
}
