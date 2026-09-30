import { ErrorCode } from '@taskflow/shared';
import type { RequestHandler } from 'express';
import multer, { MulterError } from 'multer';
import {
  BadRequestException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
  ValidationException,
} from '../exceptions';

export interface UploadOptions {
  field: string;
  maxFiles: number;
  maxFileBytes: number;
}

export interface UploadedImage {
  buffer: Buffer;
  originalName: string;
}

/** Keeps only the base name, drops control characters and caps the length (display only). */
export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return cleaned.slice(0, 255);
}

/**
 * Parses `multipart/form-data` into memory with strict limits and exposes the
 * files as `req.uploads`. File type is NOT checked here — the image processor
 * decides by decoding the bytes.
 */
export function imageUpload(options: UploadOptions): RequestHandler {
  const maxMb = Math.round((options.maxFileBytes / (1024 * 1024)) * 10) / 10;
  const parser = multer({
    storage: multer.memoryStorage(),
    // Browsers send UTF-8 file names without declaring a charset.
    defParamCharset: 'utf8',
    limits: {
      fileSize: options.maxFileBytes,
      files: options.maxFiles,
      fields: 0,
      parts: options.maxFiles,
    },
  }).array(options.field, options.maxFiles);

  const tooMany = () =>
    new BadRequestException(
      options.maxFiles === 1
        ? 'Upload one image at a time.'
        : `You can upload up to ${options.maxFiles} images at a time.`,
      ErrorCode.TOO_MANY_IMAGES,
    );

  return (req, res, next) => {
    if (!req.is('multipart/form-data')) {
      next(new UnsupportedMediaTypeException('Send the image as multipart/form-data.'));
      return;
    }
    parser(req, res, (err: unknown) => {
      if (err instanceof MulterError) {
        switch (err.code) {
          case 'LIMIT_FILE_SIZE':
            next(
              new PayloadTooLargeException(
                `Each image must be ${maxMb} MB or smaller.`,
                ErrorCode.FILE_TOO_LARGE,
              ),
            );
            return;
          case 'LIMIT_FILE_COUNT':
          case 'LIMIT_PART_COUNT':
            next(tooMany());
            return;
          case 'LIMIT_UNEXPECTED_FILE':
            next(
              err.field === options.field
                ? tooMany()
                : new ValidationException([
                    { field: err.field ?? 'file', message: `Use the "${options.field}" field` },
                  ]),
            );
            return;
          default:
            next(new BadRequestException('The upload could not be read.'));
            return;
        }
      }
      if (err) {
        next(new BadRequestException('The upload could not be read.'));
        return;
      }

      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      if (files.length === 0) {
        next(new ValidationException([{ field: options.field, message: 'Choose an image' }]));
        return;
      }
      req.uploads = files.map((file) => ({
        buffer: file.buffer,
        originalName: sanitizeFileName(file.originalname),
      }));
      next();
    });
  };
}
