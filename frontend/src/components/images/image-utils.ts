import type { ImageDto } from '@taskflow/shared';

/** Alt text: the original file name, or "Task image N" (spec §14.9). */
export function imageAlt(image: Pick<ImageDto, 'originalName'>, index: number): string {
  return image.originalName?.trim() || `Task image ${index + 1}`;
}

/** Appends a harmless query parameter so the browser re-requests a URL that just failed. */
export function withRetryParam(src: string): string {
  return `${src}${src.includes('?') ? '&' : '?'}r=1`;
}
