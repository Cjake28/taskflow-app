import { ErrorCode } from '@taskflow/shared';
import sharp, { type Metadata, type Sharp } from 'sharp';
import { BadRequestException } from '../../common/exceptions';

export type ImagePreset = 'task' | 'avatar';

export interface EncodedImage {
  buffer: Buffer;
  width: number;
  height: number;
}

export interface ProcessedImage {
  display: EncodedImage;
  /** Task images only; avatars are a single small square. */
  thumb: EncodedImage | null;
}

/** Decompression-bomb guard: refuse anything that would decode to more than 40 megapixels. */
export const MAX_INPUT_PIXELS = 40_000_000;

const INVALID_IMAGE_MESSAGE =
  'This file is not a supported image. Use JPEG, PNG, WebP, GIF or AVIF.';

function invalidImage(): BadRequestException {
  return new BadRequestException(INVALID_IMAGE_MESSAGE, ErrorCode.INVALID_IMAGE);
}

/**
 * Converts an uploaded file into WebP variants. The client's content type and
 * file name are never trusted: the file is accepted only if libvips decodes it
 * as an allowed format, and the output is re-encoded from pixels, which also
 * strips EXIF/GPS metadata and neutralises polyglot files.
 */
export class ImageProcessor {
  async process(input: Buffer, preset: ImagePreset): Promise<ProcessedImage> {
    const source = () =>
      sharp(input, { failOn: 'warning', limitInputPixels: MAX_INPUT_PIXELS, animated: false });

    let metadata: Metadata;
    try {
      metadata = await source().metadata();
    } catch {
      throw invalidImage();
    }
    if (!isAllowedFormat(metadata)) throw invalidImage();

    try {
      if (preset === 'avatar') {
        return {
          display: await encode(
            source()
              .autoOrient()
              .resize(256, 256, { fit: 'cover', position: 'attention' })
              .webp({ quality: 85 }),
          ),
          thumb: null,
        };
      }

      const [display, thumb] = await Promise.all([
        encode(
          source()
            .autoOrient()
            .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 80 }),
        ),
        encode(
          source()
            .autoOrient()
            .resize(400, 400, { fit: 'cover', position: 'attention' })
            .webp({ quality: 70 }),
        ),
      ]);
      return { display, thumb };
    } catch {
      // Truncated or corrupt data often only fails once the pixels are decoded.
      throw invalidImage();
    }
  }
}

function isAllowedFormat(metadata: Metadata): boolean {
  switch (metadata.format) {
    case 'jpeg':
    case 'png':
    case 'webp':
    case 'gif':
      return true;
    case 'heif':
      // AVIF is AV1-in-HEIF; HEIC (HEVC) is rejected.
      return metadata.compression === 'av1';
    default:
      return false;
  }
}

async function encode(pipeline: Sharp): Promise<EncodedImage> {
  const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
  return { buffer: data, width: info.width, height: info.height };
}
