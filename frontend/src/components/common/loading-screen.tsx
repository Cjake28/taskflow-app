import { RotateCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { getErrorMessage } from '@/lib/api-client';
import { cn } from '@/lib/utils';

import { LogoMark } from './logo';

export interface LoadingScreenProps {
  label?: string;
  /** Full viewport (boot splash) or fill the parent (route transitions). */
  fullScreen?: boolean;
  className?: string;
}

/** Boot splash: pulsing logo, indeterminate bar and a status line (spec §16 system states). */
export function LoadingScreen({
  label = 'Checking your session…',
  fullScreen = true,
  className,
}: LoadingScreenProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex flex-col items-center justify-center gap-3.5 bg-background px-6 text-center',
        fullScreen ? 'min-h-dvh' : 'min-h-[50vh]',
        className,
      )}
    >
      <LogoMark size="lg" className="animate-logo-pulse" />
      <p className="text-xl font-extrabold tracking-tight">TaskFlow</p>
      <div className="h-[5px] w-[140px] overflow-hidden rounded-full bg-fill" aria-hidden="true">
        <span className="block h-full w-2/5 animate-loadbar rounded-full bg-[linear-gradient(90deg,var(--primary),var(--primary-2))]" />
      </div>
      <p className="text-[13px] text-muted-foreground">{label}</p>
    </div>
  );
}

/** While the first lazy route chunk downloads. */
export function RouteFallback() {
  return <LoadingScreen label="Loading…" />;
}

/** Shown instead of the splash when the boot check failed for a non-auth reason. */
export function BootErrorScreen({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3.5 bg-background px-6 text-center">
      <LogoMark size="lg" />
      <p className="text-xl font-extrabold tracking-tight">TaskFlow</p>
      <p role="alert" className="max-w-xs text-sm leading-relaxed text-muted-foreground">
        {getErrorMessage(error)}
      </p>
      <Button onClick={onRetry} className="mt-1">
        <RotateCw aria-hidden="true" />
        Try again
      </Button>
    </div>
  );
}
