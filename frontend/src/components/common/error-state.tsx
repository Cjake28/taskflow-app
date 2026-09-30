import type { ReactNode } from 'react';
import { RotateCw, TriangleAlert } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ApiError, getErrorMessage } from '@/lib/api-client';

import { EmptyState } from './empty-state';

export interface ErrorStateProps {
  title?: ReactNode;
  /** The failure; its request id is shown so users can report it. */
  error?: unknown;
  description?: ReactNode;
  onRetry?: () => void;
  retrying?: boolean;
  className?: string;
  bare?: boolean;
}

/** Failed load with "Try again" and the request id (spec §14.9). */
export function ErrorState({
  title = "Couldn't load this page",
  error,
  description,
  onRetry,
  retrying = false,
  className,
  bare,
}: ErrorStateProps) {
  const requestId = error instanceof ApiError ? error.requestId : null;
  return (
    <EmptyState
      icon={TriangleAlert}
      tint="var(--danger)"
      title={title}
      className={className}
      bare={bare}
      description={
        <>
          <p role="alert">{description ?? getErrorMessage(error)}</p>
          {requestId ? (
            <p className="mt-2">
              If it keeps happening, share this ID:{' '}
              <code className="rounded-md bg-fill px-1.5 py-0.5 text-xs font-semibold text-foreground">
                {requestId}
              </code>
            </p>
          ) : null}
        </>
      }
      action={
        onRetry ? (
          <Button onClick={onRetry} loading={retrying}>
            {!retrying && <RotateCw aria-hidden="true" />}
            Try again
          </Button>
        ) : null
      }
    />
  );
}
