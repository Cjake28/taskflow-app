import type { CSSProperties, ReactNode } from 'react';
import { CircleCheck, Info, TriangleAlert, type LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

export type AlertVariant = 'info' | 'success' | 'warning' | 'danger';

const VARIANTS: Record<AlertVariant, { tint: string; icon: LucideIcon }> = {
  info: { tint: 'var(--primary)', icon: Info },
  success: { tint: 'var(--status-done)', icon: CircleCheck },
  warning: { tint: 'var(--status-progress)', icon: TriangleAlert },
  danger: { tint: 'var(--danger)', icon: TriangleAlert },
};

export interface AlertProps {
  variant?: AlertVariant;
  title?: ReactNode;
  children?: ReactNode;
  /** Override the variant's default icon. */
  icon?: LucideIcon;
  className?: string;
  /**
   * Danger and warning alerts are announced immediately (role="alert");
   * info and success politely (role="status").
   */
  role?: 'alert' | 'status';
  id?: string;
}

/** Tinted inline banner (login banners, form errors, notices). */
export function Alert({
  variant = 'info',
  title,
  children,
  icon,
  className,
  role,
  id,
}: AlertProps) {
  const meta = VARIANTS[variant];
  const Icon = icon ?? meta.icon;
  return (
    <div
      id={id}
      role={role ?? (variant === 'danger' || variant === 'warning' ? 'alert' : 'status')}
      data-variant={variant}
      style={{ '--tint': meta.tint } as CSSProperties}
      className={cn(
        'flex items-start gap-2.5 rounded-input bg-[color-mix(in_oklab,var(--tint)_11%,var(--card))] px-3.5 py-3 text-[13px] leading-normal font-semibold text-[color-mix(in_oklab,var(--tint)_78%,var(--foreground))]',
        className,
      )}
    >
      <Icon aria-hidden="true" className="mt-px size-[17px] shrink-0 text-(--tint)" />
      <div className="min-w-0">
        {title ? <p className="font-extrabold">{title}</p> : null}
        {children ? <div>{children}</div> : null}
      </div>
    </div>
  );
}
