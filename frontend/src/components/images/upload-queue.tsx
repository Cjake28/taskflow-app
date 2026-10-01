import { useState, type CSSProperties } from 'react';
import { CircleCheck, FileWarning, ImageIcon, Loader2, RotateCw, X } from 'lucide-react';

import { formatFileSize } from '@/lib/upload';
import { cn } from '@/lib/utils';

import type { UploadItem } from './upload-queue-store';

export interface UploadQueueProps {
  items: readonly UploadItem[];
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
  /** Hide the remove button while the owning form is busy. */
  locked?: boolean;
  className?: string;
}

function statusText(item: UploadItem): string {
  switch (item.status) {
    case 'ready':
      return 'Ready to upload';
    case 'queued':
      return 'Waiting…';
    case 'uploading':
      return item.progress > 0 ? `Uploading · ${Math.round(item.progress * 100)}%` : 'Uploading…';
    case 'processing':
      return 'Processing…';
    case 'done':
      return 'Uploaded';
    case 'error':
      return item.error ?? 'Upload failed';
  }
}

function tintOf(item: UploadItem): string {
  if (item.status === 'error') return 'var(--danger)';
  if (item.status === 'done') return 'var(--status-done)';
  return 'var(--primary)';
}

function QueueRow({
  item,
  onRetry,
  onRemove,
  locked,
}: {
  item: UploadItem;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
  locked: boolean;
}) {
  const busy = item.status === 'uploading' || item.status === 'processing';
  // Some files have an image type but do not decode (the server will reject them too).
  const [previewFailed, setPreviewFailed] = useState(false);
  // No progress event yet (or none at all, e.g. tiny files): show an indeterminate bar.
  const indeterminate = item.status === 'uploading' && item.progress === 0;
  const showBar = busy || item.status === 'queued' || item.status === 'done';
  const percent =
    item.status === 'done' || item.status === 'processing' ? 100 : Math.round(item.progress * 100);

  return (
    <li
      data-status={item.status}
      style={{ '--tint': tintOf(item) } as CSSProperties}
      className={cn(
        'flex items-center gap-3 rounded-2xl p-2 pr-2.5 transition-colors',
        item.status === 'error' ? 'bg-tint-faint' : 'bg-fill',
      )}
    >
      <span className="relative grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-card">
        {item.previewUrl && !previewFailed ? (
          <img
            src={item.previewUrl}
            alt=""
            className={cn('size-full object-cover', busy && 'opacity-70')}
            draggable={false}
            onError={() => setPreviewFailed(true)}
          />
        ) : item.previewUrl ? (
          <ImageIcon aria-hidden="true" className="size-5 text-muted-foreground" />
        ) : (
          <FileWarning aria-hidden="true" className="size-5 text-danger" />
        )}
        {item.status === 'done' ? (
          <span className="absolute inset-0 grid place-items-center bg-[color-mix(in_oklab,var(--status-done)_45%,transparent)] text-white">
            <CircleCheck aria-hidden="true" className="size-5" />
          </span>
        ) : null}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="truncate text-[13px] font-bold">{item.file.name}</span>
          <span className="shrink-0 text-[11.5px] font-semibold text-muted-foreground tabular-nums">
            {formatFileSize(item.file.size)}
          </span>
        </span>
        <span
          className={cn(
            'mt-0.5 flex items-center gap-1.5 text-[12px] font-semibold',
            item.status === 'error'
              ? 'text-danger'
              : item.status === 'done'
                ? 'text-tint'
                : 'text-muted-foreground',
          )}
        >
          {item.status === 'processing' ? (
            <Loader2 aria-hidden="true" className="size-3 animate-spin" />
          ) : null}
          <span className={cn(item.status === 'error' && 'line-clamp-2')}>{statusText(item)}</span>
        </span>
        {showBar ? (
          <span
            role="progressbar"
            aria-label={`Upload progress for ${item.file.name}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={indeterminate ? undefined : percent}
            className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-[color-mix(in_oklab,var(--muted-foreground)_18%,transparent)]"
          >
            <span
              className={cn(
                'block h-full rounded-full transition-[width] duration-200 ease-out',
                item.status === 'done' ? 'bg-status-done' : 'bg-primary',
                item.status === 'processing' && 'animate-pulse',
                indeterminate && 'w-2/5 animate-loadbar',
              )}
              style={indeterminate ? undefined : { width: `${percent}%` }}
            />
          </span>
        ) : null}
      </span>

      {item.status === 'error' && item.retryable ? (
        <button
          type="button"
          onClick={() => onRetry(item.id)}
          aria-label={`Retry uploading ${item.file.name}`}
          className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-full text-foreground transition-colors hover:bg-card focus-visible:ring-4 focus-visible:ring-ring/30 focus-visible:outline-none"
        >
          <RotateCw aria-hidden="true" className="size-4" />
        </button>
      ) : null}
      {!locked || item.status === 'error' ? (
        <button
          type="button"
          onClick={() => onRemove(item.id)}
          aria-label={
            busy || item.status === 'queued'
              ? `Cancel uploading ${item.file.name}`
              : `Remove ${item.file.name}`
          }
          className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-full text-muted-foreground transition-colors hover:bg-card hover:text-foreground focus-visible:ring-4 focus-visible:ring-ring/30 focus-visible:outline-none"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      ) : null}
    </li>
  );
}

/** Files being uploaded: local preview, per-file progress, error and retry (spec §14.8). */
export function UploadQueue({
  items,
  onRetry,
  onRemove,
  locked = false,
  className,
}: UploadQueueProps) {
  if (items.length === 0) return null;
  const active = items.filter(
    (item) =>
      item.status === 'queued' || item.status === 'uploading' || item.status === 'processing',
  ).length;

  return (
    <div className={className}>
      <p aria-live="polite" className="sr-only">
        {active > 0
          ? `Uploading ${active} ${active === 1 ? 'image' : 'images'}`
          : 'No uploads in progress'}
      </p>
      <ul className="flex flex-col gap-2" aria-label="Uploads">
        {items.map((item) => (
          <QueueRow
            key={item.id}
            item={item}
            onRetry={onRetry}
            onRemove={onRemove}
            locked={locked}
          />
        ))}
      </ul>
    </div>
  );
}
