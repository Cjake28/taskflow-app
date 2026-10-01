import { useRef, useState, type KeyboardEvent } from 'react';
import type { ImageDto } from '@taskflow/shared';
import { ChevronLeft, ChevronRight, Trash2, X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';

import { Dialog, DialogOverlay, DialogPortal } from '@/components/ui/dialog';
import { formatFileSize } from '@/lib/upload';
import { cn } from '@/lib/utils';

import { imageAlt } from './image-utils';
import { SecureImage } from './secure-image';

export interface LightboxProps {
  images: readonly ImageDto[];
  /** Open image, or null when closed. */
  index: number | null;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  onRemove?: (image: ImageDto, index: number) => void;
  /** Where focus goes after closing (the lightbox opens programmatically, so there is no trigger). */
  onReturnFocus?: (index: number) => void;
}

const roundButton =
  'grid size-11 shrink-0 cursor-pointer place-items-center rounded-full bg-white/12 text-white backdrop-blur-md transition-colors hover:bg-white/22 focus-visible:ring-4 focus-visible:ring-white/40 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-30';

/**
 * Full-size viewer on the Radix Dialog (spec §14.8): ← / → to navigate, Esc to close, focus
 * trapped. Always dark so photos read well in either theme.
 */
export function Lightbox({
  images,
  index,
  onIndexChange,
  onClose,
  onRemove,
  onReturnFocus,
}: LightboxProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  // Keep the last image on screen while the lightbox fades out.
  const [shown, setShown] = useState(index ?? 0);
  if (index !== null && index !== shown) setShown(index);
  const open = index !== null && images.length > 0;
  const current = Math.max(0, Math.min(index ?? shown, images.length - 1));
  const image = images[current];
  const count = images.length;

  const go = (delta: number) => {
    if (count < 2) return;
    onIndexChange((current + delta + count) % count);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      go(-1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      go(1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      onIndexChange(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      onIndexChange(count - 1);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogPortal>
        <DialogOverlay className="bg-black/88 supports-backdrop-filter:backdrop-blur-md" />
        {image ? (
          <DialogPrimitive.Content
            onKeyDown={onKeyDown}
            aria-describedby={undefined}
            onOpenAutoFocus={(event) => {
              // Start on Close rather than the first button (Remove).
              event.preventDefault();
              closeRef.current?.focus();
            }}
            onCloseAutoFocus={(event) => {
              if (!onReturnFocus) return;
              event.preventDefault();
              onReturnFocus(current);
            }}
            className="fixed inset-0 z-50 flex flex-col text-white outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0"
          >
            <header className="flex items-center gap-3 px-4 pt-4 pb-2 sm:px-6">
              <span className="rounded-full bg-white/12 px-3 py-1 text-xs font-bold tabular-nums">
                {current + 1} / {count}
              </span>
              <div className="min-w-0 flex-1">
                <DialogPrimitive.Title className="truncate text-sm font-bold">
                  {imageAlt(image, current)}
                </DialogPrimitive.Title>
                <p className="text-xs text-white/65 tabular-nums">
                  {image.width} × {image.height} · {formatFileSize(image.sizeBytes)}
                </p>
              </div>
              {onRemove ? (
                <button
                  type="button"
                  className={cn(roundButton, 'hover:bg-danger')}
                  aria-label={`Remove ${imageAlt(image, current)}`}
                  onClick={() => onRemove(image, current)}
                >
                  <Trash2 aria-hidden="true" className="size-[18px]" />
                </button>
              ) : null}
              <DialogPrimitive.Close ref={closeRef} className={roundButton} aria-label="Close">
                <X aria-hidden="true" className="size-5" />
              </DialogPrimitive.Close>
            </header>

            <div className="relative flex min-h-0 flex-1 items-center justify-center px-3 py-3 sm:px-20">
              <SecureImage
                key={image.id}
                src={image.url}
                alt={imageAlt(image, current)}
                loading="eager"
                className="rounded-2xl bg-white/5 shadow-pop"
                imgClassName="object-contain"
                wrapperStyle={{
                  aspectRatio: `${image.width} / ${Math.max(1, image.height)}`,
                  width: `min(100%, calc((100dvh - ${count > 1 ? 13 : 8}rem) * ${image.width / Math.max(1, image.height)}))`,
                }}
              />
              {count > 1 ? (
                <>
                  <button
                    type="button"
                    className={cn(
                      roundButton,
                      'absolute top-1/2 left-3 -translate-y-1/2 sm:left-6',
                    )}
                    aria-label="Previous image"
                    onClick={() => go(-1)}
                  >
                    <ChevronLeft aria-hidden="true" className="size-6" />
                  </button>
                  <button
                    type="button"
                    className={cn(
                      roundButton,
                      'absolute top-1/2 right-3 -translate-y-1/2 sm:right-6',
                    )}
                    aria-label="Next image"
                    onClick={() => go(1)}
                  >
                    <ChevronRight aria-hidden="true" className="size-6" />
                  </button>
                </>
              ) : null}
            </div>

            {count > 1 ? (
              <nav
                aria-label="All images"
                className="flex justify-center gap-2 overflow-x-auto px-4 pt-1 pb-5"
              >
                {images.map((thumb, thumbIndex) => (
                  <button
                    key={thumb.id}
                    type="button"
                    onClick={() => onIndexChange(thumbIndex)}
                    aria-label={`Show ${imageAlt(thumb, thumbIndex)}`}
                    aria-current={thumbIndex === current ? 'true' : undefined}
                    className={cn(
                      'size-14 shrink-0 cursor-pointer overflow-hidden rounded-xl transition-[opacity,box-shadow] duration-150 focus-visible:outline-none',
                      thumbIndex === current
                        ? 'opacity-100 ring-2 ring-white ring-offset-2 ring-offset-black'
                        : 'opacity-55 hover:opacity-90 focus-visible:ring-2 focus-visible:ring-white/70',
                    )}
                  >
                    <SecureImage
                      src={thumb.thumbUrl}
                      alt=""
                      compactFallback
                      className="size-full"
                      imgClassName="object-cover"
                    />
                  </button>
                ))}
              </nav>
            ) : null}
          </DialogPrimitive.Content>
        ) : null}
      </DialogPortal>
    </Dialog>
  );
}
