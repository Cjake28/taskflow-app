export const IMAGE_LIMITS = {
  /** Active images allowed on one task. */
  perTask: 10,
  /** Files accepted in one upload request. */
  perUpload: 5,
  /** Default per-file limit; the server's UPLOAD_MAX_FILE_MB can change it. */
  maxFileMb: 5,
} as const;

/** Formats the server can decode. Everything is stored as WebP. */
export const ACCEPTED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
] as const;

export const IMAGE_VARIANTS = ['display', 'thumb'] as const;
export type ImageVariant = (typeof IMAGE_VARIANTS)[number];
