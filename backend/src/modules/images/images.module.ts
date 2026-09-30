import {
  IMAGE_LIMITS,
  idParamSchema,
  imageQuerySchema,
  taskImageParamsSchema,
} from '@taskflow/shared';
import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate';
import { byUser, rateLimit } from '../../common/middleware/rate-limit';
import { imageUpload } from '../../common/middleware/upload';
import { validate } from '../../common/middleware/validate';
import type { Container } from '../../container';
import { AvatarController, ImagesController, TaskImagesController } from './images.controller';

const MB = 1024 * 1024;

/** `GET /images/:id` — authenticated, owner-only image bytes. */
export function imagesModule(c: Container): Router {
  const controller = new ImagesController(c.images);
  const router = Router();
  router.use(authenticate(c.accessTokens, c.sessions), rateLimit(c.limiters.imageRead, byUser));
  router.get(
    '/:id',
    validate({ params: idParamSchema, query: imageQuerySchema }),
    controller.serve,
  );
  return router;
}

/** Mounted at `/tasks/:id/images`. */
export function taskImagesModule(c: Container): Router {
  const controller = new TaskImagesController(c.images);
  const router = Router({ mergeParams: true });
  router.use(authenticate(c.accessTokens, c.sessions));

  router.post(
    '/',
    rateLimit(c.limiters.upload, byUser),
    validate({ params: idParamSchema }),
    imageUpload({
      field: 'images',
      maxFiles: IMAGE_LIMITS.perUpload,
      maxFileBytes: c.env.UPLOAD_MAX_FILE_MB * MB,
    }),
    controller.upload,
  );
  const apiLimit = rateLimit(c.limiters.api, byUser);
  const params = validate({ params: taskImageParamsSchema });
  router.delete('/:imageId', apiLimit, params, controller.remove);
  router.post('/:imageId/restore', apiLimit, params, controller.restore);
  return router;
}

/** Mounted at `/users/me/avatar`. */
export function avatarModule(c: Container): Router {
  const controller = new AvatarController(c.images, c.users);
  const router = Router();
  router.use(authenticate(c.accessTokens, c.sessions));
  router.put(
    '/',
    rateLimit(c.limiters.upload, byUser),
    imageUpload({ field: 'image', maxFiles: 1, maxFileBytes: c.env.UPLOAD_MAX_FILE_MB * MB }),
    controller.update,
  );
  router.delete('/', rateLimit(c.limiters.api, byUser), controller.remove);
  return router;
}
