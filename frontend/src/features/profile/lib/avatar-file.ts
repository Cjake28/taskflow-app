import { ACCEPTED_IMAGE_TYPES, IMAGE_LIMITS } from '@taskflow/shared';

const MB = 1024 * 1024;

/** `accept` attribute for the avatar file input. */
export const AVATAR_ACCEPT = ACCEPTED_IMAGE_TYPES.join(',');

/**
 * Instant client-side feedback using the shared limits. The server stays authoritative: it decodes
 * the bytes and may still reject a file with a matching extension.
 */
export function avatarFileProblem(file: Pick<File, 'type' | 'size'>): string | null {
  if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return 'Choose a JPEG, PNG, WebP, GIF or AVIF image.';
  }
  if (file.size > IMAGE_LIMITS.maxFileMb * MB) {
    return `Choose an image up to ${IMAGE_LIMITS.maxFileMb} MB.`;
  }
  return null;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < MB) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / MB).toFixed(1)} MB`;
}
