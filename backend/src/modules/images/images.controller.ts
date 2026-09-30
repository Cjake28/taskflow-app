import type { ImageQuery, TaskImageParams } from '@taskflow/shared';
import type { Request, Response } from 'express';
import { pipeline } from 'node:stream/promises';
import { created, noContent, ok } from '../../common/http/respond';
import { requireUser } from '../../common/middleware/authenticate';
import type { UploadedImage } from '../../common/middleware/upload';
import type { UsersService } from '../users/users.service';
import type { ImagesService } from './images.service';

/** True when an `If-None-Match` header lists the ETag (weak or strong) or `*`. */
export function etagMatches(header: string | undefined, etag: string): boolean {
  if (!header) return false;
  return header
    .split(',')
    .map((value) => value.trim().replace(/^W\//, ''))
    .some((value) => value === etag || value === '*');
}

const uploadsOf = (req: Request): UploadedImage[] => req.uploads ?? [];

export class ImagesController {
  constructor(private readonly images: ImagesService) {}

  serve = async (req: Request, res: Response) => {
    const user = requireUser(req);
    const { id } = req.valid.params as { id: string };
    const { variant } = req.valid.query as ImageQuery;
    const { key, etag } = await this.images.findForOwner(user.id, id, variant);

    res.set({
      ETag: etag,
      // Cached by the browser but revalidated (and re-authorised) on every use.
      'Cache-Control': 'private, no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cross-Origin-Resource-Policy': 'same-origin',
    });
    if (etagMatches(req.get('if-none-match'), etag)) {
      res.status(304).end();
      return;
    }

    const stream = await this.images.open(key);
    res.status(200).set({
      'Content-Type': 'image/webp',
      'Content-Disposition': `inline; filename="${id}.webp"`,
    });
    try {
      await pipeline(stream, res);
    } catch (err) {
      // The client went away or storage failed mid-stream; headers are already sent.
      req.log?.warn({ err }, 'Image stream ended early');
      res.destroy();
    }
  };
}

export class TaskImagesController {
  constructor(private readonly images: ImagesService) {}

  upload = async (req: Request, res: Response) => {
    const { id } = req.valid.params as { id: string };
    created(res, await this.images.addTaskImages(requireUser(req).id, id, uploadsOf(req)));
  };

  remove = async (req: Request, res: Response) => {
    const { id, imageId } = req.valid.params as TaskImageParams;
    await this.images.removeTaskImage(requireUser(req).id, id, imageId);
    noContent(res);
  };

  restore = async (req: Request, res: Response) => {
    const { id, imageId } = req.valid.params as TaskImageParams;
    ok(res, await this.images.restoreTaskImage(requireUser(req).id, id, imageId));
  };
}

export class AvatarController {
  constructor(
    private readonly images: ImagesService,
    private readonly users: UsersService,
  ) {}

  update = async (req: Request, res: Response) => {
    const userId = requireUser(req).id;
    const [upload] = uploadsOf(req);
    if (upload) await this.images.setAvatar(userId, upload);
    ok(res, await this.users.getProfile(userId));
  };

  remove = async (req: Request, res: Response) => {
    await this.images.removeAvatar(requireUser(req).id);
    noContent(res);
  };
}
