import type { UploadedImage } from '../common/middleware/upload';

declare global {
  namespace Express {
    interface Request {
      /** Set by the `authenticate` middleware. */
      user?: { id: string; sessionId: string };
      /** Parsed output of the `validate` middleware. */
      valid: { body?: unknown; query?: unknown; params?: unknown };
      /** Set by the `imageUpload` middleware. */
      uploads?: UploadedImage[];
    }
  }
}
