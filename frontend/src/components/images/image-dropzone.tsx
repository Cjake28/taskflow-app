import { useEffect, useId, useRef, useState, type DragEvent } from 'react';
import { IMAGE_LIMITS } from '@taskflow/shared';
import { ImagePlus, ImageUp } from 'lucide-react';

import { ACCEPTED_IMAGE_LABEL, IMAGE_ACCEPT_ATTRIBUTE } from '@/lib/upload';
import { cn } from '@/lib/utils';

export interface ImageDropzoneProps {
  /** Every dropped, picked or pasted file (the caller runs the pre-checks). */
  onFiles: (files: File[]) => void;
  /** Free image slots on the task; 0 disables the zone. */
  slotsLeft: number;
  disabled?: boolean;
  /** Smaller layout for the create dialog. */
  compact?: boolean;
  /** Listen for pasted images while this zone is on screen (default true). */
  acceptPaste?: boolean;
  className?: string;
}

function hasFiles(event: DragEvent) {
  return Array.from(event.dataTransfer.types).includes('Files');
}

/** True when a modal other than the one containing `node` is open. */
function blockedByOtherDialog(node: HTMLElement | null) {
  const open = document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"]');
  return open !== null && !(node && open.contains(node));
}

/**
 * Drop zone for task images (spec §14.8): drag and drop, click to browse, and paste from the
 * clipboard anywhere on the page (not while typing into another dialog).
 */
export function ImageDropzone({
  onFiles,
  slotsLeft,
  disabled = false,
  compact = false,
  acceptPaste = true,
  className,
}: ImageDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const zoneRef = useRef<HTMLButtonElement>(null);
  const depth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const hintId = useId();
  const full = slotsLeft <= 0;
  const inactive = disabled || full;

  useEffect(() => {
    if (!acceptPaste || inactive) return;
    const onPaste = (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.files ?? []);
      if (files.length === 0 || blockedByOtherDialog(zoneRef.current)) return;
      event.preventDefault();
      onFiles(files);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [acceptPaste, inactive, onFiles]);

  const onDragEnter = (event: DragEvent) => {
    if (!hasFiles(event) || inactive) return;
    event.preventDefault();
    depth.current += 1;
    setDragging(true);
  };
  const onDragLeave = (event: DragEvent) => {
    if (!hasFiles(event)) return;
    depth.current = Math.max(0, depth.current - 1);
    if (depth.current === 0) setDragging(false);
  };
  const onDragOver = (event: DragEvent) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = inactive ? 'none' : 'copy';
  };
  const onDrop = (event: DragEvent) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    depth.current = 0;
    setDragging(false);
    if (inactive) return;
    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0) onFiles(files);
  };

  const Icon = dragging ? ImageUp : ImagePlus;

  return (
    <>
      <button
        ref={zoneRef}
        type="button"
        disabled={inactive}
        aria-describedby={hintId}
        onClick={() => inputRef.current?.click()}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
        data-dragging={dragging || undefined}
        className={cn(
          'group flex w-full cursor-pointer items-center gap-3.5 rounded-tile border-[1.5px] border-dashed border-[color-mix(in_oklab,var(--muted-foreground)_38%,transparent)] text-left transition-[background-color,border-color,box-shadow] duration-150 focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-ring/25 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60',
          compact ? 'px-3.5 py-3' : 'flex-col px-5 py-7 text-center sm:py-8',
          dragging
            ? 'border-solid border-primary bg-[color-mix(in_oklab,var(--primary)_9%,var(--card))] shadow-[0_0_0_4px_color-mix(in_oklab,var(--primary)_12%,transparent)]'
            : 'hover:border-primary/60 hover:bg-[color-mix(in_oklab,var(--primary)_4%,var(--card))]',
          className,
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            'grid shrink-0 place-items-center rounded-full bg-primary text-white transition-transform duration-200',
            compact ? 'size-10 [&_svg]:size-[18px]' : 'size-12 [&_svg]:size-[22px]',
            dragging && 'scale-110',
          )}
        >
          <Icon />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-bold">
            {full ? (
              `Image limit reached (${IMAGE_LIMITS.perTask} per task)`
            ) : dragging ? (
              'Drop to upload'
            ) : (
              <>
                Drop images here or <span className="text-primary">browse</span>
              </>
            )}
          </span>
          <span id={hintId} className="mt-0.5 block text-[12.5px] text-muted-foreground">
            {full
              ? 'Remove an image to add another.'
              : `${compact ? '' : 'You can also paste from the clipboard. '}${ACCEPTED_IMAGE_LABEL} · up to ${IMAGE_LIMITS.maxFileMb} MB each · ${slotsLeft} ${slotsLeft === 1 ? 'slot' : 'slots'} left`}
          </span>
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={IMAGE_ACCEPT_ATTRIBUTE}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          // Reset so picking the same file again still fires a change event.
          event.target.value = '';
          if (files.length > 0) onFiles(files);
        }}
      />
    </>
  );
}
