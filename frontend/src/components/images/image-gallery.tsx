import type { ImageDto } from '@taskflow/shared';
import { Maximize2, X } from 'lucide-react';

import { cn } from '@/lib/utils';

import { imageAlt } from './image-utils';
import { SecureImage } from './secure-image';

export interface ImageGalleryProps {
  images: readonly ImageDto[];
  onOpen: (index: number) => void;
  onRemove?: (image: ImageDto, index: number) => void;
  className?: string;
}

/** Thumbnail grid on task details; opens the lightbox, removes with confirmation (caller). */
export function ImageGallery({ images, onOpen, onRemove, className }: ImageGalleryProps) {
  if (images.length === 0) return null;
  return (
    <ul
      aria-label="Images"
      className={cn('grid grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-3', className)}
    >
      {images.map((image, index) => {
        const alt = imageAlt(image, index);
        return (
          <li key={image.id} className="group relative aspect-square">
            <button
              type="button"
              onClick={() => onOpen(index)}
              aria-label={`Open ${alt}`}
              className="block size-full cursor-zoom-in overflow-hidden rounded-thumb shadow-card transition-transform duration-200 focus-visible:ring-4 focus-visible:ring-ring/35 focus-visible:outline-none active:scale-[0.98]"
            >
              <SecureImage
                src={image.thumbUrl}
                alt={alt}
                compactFallback
                className="size-full rounded-thumb"
                imgClassName="object-cover transition-transform duration-300 group-hover:scale-[1.04]"
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-1.5 rounded-b-thumb bg-linear-to-t from-black/70 to-transparent px-2.5 pt-6 pb-2 text-left text-[11.5px] font-semibold text-white opacity-0 transition-opacity duration-200 group-focus-within:opacity-100 group-hover:opacity-100"
              >
                <Maximize2 className="size-3 shrink-0" />
                <span className="truncate">{alt}</span>
              </span>
            </button>
            {onRemove ? (
              <button
                type="button"
                onClick={() => onRemove(image, index)}
                aria-label={`Remove ${alt}`}
                className="absolute top-1.5 right-1.5 grid size-8 cursor-pointer place-items-center rounded-full bg-card/90 text-foreground opacity-0 shadow-card backdrop-blur-sm transition-[opacity,color,background-color] duration-150 group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-card hover:text-danger focus-visible:opacity-100 focus-visible:ring-4 focus-visible:ring-danger/30 focus-visible:outline-none pointer-coarse:opacity-100"
              >
                <X aria-hidden="true" className="size-4" strokeWidth={2.5} />
              </button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
