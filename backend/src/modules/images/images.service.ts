import { ErrorCode, IMAGE_LIMITS, type ImageDto, type ImageVariant } from '@taskflow/shared';
import type { Readable } from 'node:stream';
import {
  BadRequestException,
  NotFoundException,
  PayloadTooLargeException,
} from '../../common/exceptions';
import type { UploadedImage } from '../../common/middleware/upload';
import type { Clock } from '../../common/utils/clock';
import { uuidv7 } from '../../common/utils/ids';
import type { Logger } from '../../common/utils/logger';
import type { Db, Tx } from '../../database/prisma';
import { ActivityAction, ImageKind } from '../../generated/prisma/client';
import type { JobQueue } from '../../jobs/job-queue';
import {
  IMAGE_PREFIX,
  imageKeys,
  StorageObjectNotFoundError,
  type StorageDriver,
} from '../../storage/storage.driver';
import type { ActivityService } from '../activities/activity.service';
import type { ImageProcessor, ProcessedImage } from './image-processor';
import { toImageResponse } from './images.mapper';

export interface ImagesConfig {
  quotaBytes: number;
  retentionDays: number;
  orphanGraceHours: number;
}

interface PendingObject {
  key: string;
  buffer: Buffer;
}

interface PreparedImage {
  id: string;
  originalName: string | null;
  keys: ReturnType<typeof imageKeys>;
  processed: ProcessedImage;
  sizeBytes: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const WEBP = 'image/webp';
const BATCH_SIZE = 200;

const tooManyImages = () =>
  new BadRequestException(
    `A task can have up to ${IMAGE_LIMITS.perTask} images.`,
    ErrorCode.TOO_MANY_IMAGES,
  );

/**
 * Task images and avatars. Ordering rule (database and object storage cannot
 * share a transaction): uploads write objects before rows and delete the
 * objects if the rows fail; deletes soft-delete rows first and remove objects
 * later, so a row never points at a missing object.
 */
export class ImagesService {
  constructor(
    private readonly prisma: Db,
    private readonly storage: StorageDriver,
    private readonly processor: ImageProcessor,
    private readonly activities: ActivityService,
    private readonly jobs: JobQueue,
    private readonly clock: Clock,
    private readonly logger: Logger,
    private readonly config: ImagesConfig,
  ) {}

  async addTaskImages(
    userId: string,
    taskId: string,
    uploads: UploadedImage[],
  ): Promise<ImageDto[]> {
    // Fail fast before doing any image work.
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, userId },
      select: { id: true },
    });
    if (!task) throw new NotFoundException('Task');
    if (
      (await this.activeTaskImages(this.prisma, taskId)) + uploads.length >
      IMAGE_LIMITS.perTask
    ) {
      throw tooManyImages();
    }

    const prepared: PreparedImage[] = [];
    for (const upload of uploads) {
      const processed = await this.processor.process(upload.buffer, 'task');
      const id = uuidv7(this.clock.now().getTime());
      const keys = imageKeys(userId, id);
      prepared.push({
        id,
        originalName: upload.originalName || null,
        keys,
        processed,
        sizeBytes: processed.display.buffer.length + (processed.thumb?.buffer.length ?? 0),
      });
    }
    const newBytes = prepared.reduce((sum, image) => sum + image.sizeBytes, 0);
    await this.assertQuota(this.prisma, userId, newBytes);

    const objects: PendingObject[] = prepared.flatMap((image) => [
      { key: image.keys.display, buffer: image.processed.display.buffer },
      ...(image.processed.thumb
        ? [{ key: image.keys.thumb, buffer: image.processed.thumb.buffer }]
        : []),
    ]);
    await this.writeObjects(objects);

    try {
      const rows = await this.prisma.$transaction(async (tx) => {
        await this.lockUser(tx, userId);
        // Re-check under the lock: concurrent uploads must not exceed the limits.
        const current = await tx.task.findFirst({
          where: { id: taskId, userId },
          select: { title: true },
        });
        if (!current) throw new NotFoundException('Task');
        if ((await this.activeTaskImages(tx, taskId)) + prepared.length > IMAGE_LIMITS.perTask) {
          throw tooManyImages();
        }
        await this.assertQuota(tx, userId, newBytes);

        const now = this.clock.now();
        await tx.image.createMany({
          data: prepared.map((image, index) => ({
            id: image.id,
            ownerId: userId,
            taskId,
            kind: ImageKind.TASK,
            storageKey: image.keys.display,
            thumbKey: image.keys.thumb,
            originalName: image.originalName,
            sizeBytes: image.sizeBytes,
            width: image.processed.display.width,
            height: image.processed.display.height,
            // Distinct timestamps keep the upload order stable when sorting by createdAt.
            createdAt: new Date(now.getTime() + index),
          })),
        });
        await this.activities.record(tx, {
          userId,
          taskId,
          taskTitle: current.title,
          action: ActivityAction.IMAGE_ADDED,
          changes: { images: { count: prepared.length } },
        });
        return tx.image.findMany({
          where: { id: { in: prepared.map((image) => image.id) } },
          orderBy: { createdAt: 'asc' },
        });
      });
      return rows.map(toImageResponse);
    } catch (err) {
      await this.discardObjects(objects.map((object) => object.key));
      throw err;
    }
  }

  async removeTaskImage(userId: string, taskId: string, imageId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const image = await tx.image.findFirst({
        where: { id: imageId, taskId, ownerId: userId, kind: ImageKind.TASK, deletedAt: null },
        select: { id: true, originalName: true, task: { select: { title: true } } },
      });
      if (!image?.task) throw new NotFoundException('Image');

      await tx.image.update({ where: { id: image.id }, data: { deletedAt: this.clock.now() } });
      await this.activities.record(tx, {
        userId,
        taskId,
        taskTitle: image.task.title,
        action: ActivityAction.IMAGE_REMOVED,
        changes: { image: { name: image.originalName ?? 'Image' } },
      });
    });
    await this.afterSoftDelete();
  }

  async restoreTaskImage(userId: string, taskId: string, imageId: string): Promise<ImageDto> {
    const restored = await this.prisma.$transaction(async (tx) => {
      await this.lockUser(tx, userId);
      const image = await tx.image.findFirst({
        where: {
          id: imageId,
          taskId,
          ownerId: userId,
          kind: ImageKind.TASK,
          deletedAt: { not: null, gt: this.retentionCutoff() },
        },
        include: { task: { select: { title: true } } },
      });
      if (!image?.task) throw new NotFoundException('Image');
      if ((await this.activeTaskImages(tx, taskId)) >= IMAGE_LIMITS.perTask) throw tooManyImages();
      await this.assertQuota(tx, userId, image.sizeBytes);

      const saved = await tx.image.update({ where: { id: image.id }, data: { deletedAt: null } });
      await this.activities.record(tx, {
        userId,
        taskId,
        taskTitle: image.task.title,
        action: ActivityAction.IMAGE_ADDED,
        changes: { images: { count: 1 } },
      });
      return saved;
    });
    return toImageResponse(restored);
  }

  /** Replaces the user's avatar; the previous one is soft-deleted in the same transaction. */
  async setAvatar(userId: string, upload: UploadedImage): Promise<void> {
    const processed = await this.processor.process(upload.buffer, 'avatar');
    const id = uuidv7(this.clock.now().getTime());
    const key = imageKeys(userId, id).display;
    await this.writeObjects([{ key, buffer: processed.display.buffer }]);

    try {
      await this.prisma.$transaction(async (tx) => {
        await this.lockUser(tx, userId);
        const user = await tx.user.findUniqueOrThrow({
          where: { id: userId },
          select: { avatarImageId: true },
        });
        await tx.image.create({
          data: {
            id,
            ownerId: userId,
            kind: ImageKind.AVATAR,
            storageKey: key,
            originalName: upload.originalName || null,
            sizeBytes: processed.display.buffer.length,
            width: processed.display.width,
            height: processed.display.height,
          },
        });
        await tx.user.update({ where: { id: userId }, data: { avatarImageId: id } });
        if (user.avatarImageId) {
          await tx.image.update({
            where: { id: user.avatarImageId },
            data: { deletedAt: this.clock.now() },
          });
        }
      });
    } catch (err) {
      await this.discardObjects([key]);
      throw err;
    }
    await this.afterSoftDelete();
  }

  async removeAvatar(userId: string): Promise<void> {
    const removed = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { avatarImageId: true },
      });
      if (!user.avatarImageId) return false;
      await tx.user.update({ where: { id: userId }, data: { avatarImageId: null } });
      await tx.image.update({
        where: { id: user.avatarImageId },
        data: { deletedAt: this.clock.now() },
      });
      return true;
    });
    if (removed) await this.afterSoftDelete();
  }

  /** Owner-only lookup. Missing, deleted and foreign images all look the same (404). */
  async findForOwner(
    userId: string,
    imageId: string,
    variant: ImageVariant,
  ): Promise<{ key: string; etag: string }> {
    const image = await this.prisma.image.findFirst({
      where: { id: imageId, ownerId: userId, deletedAt: null },
      select: { id: true, storageKey: true, thumbKey: true },
    });
    if (!image) throw new NotFoundException('Image');
    const useThumb = variant === 'thumb' && image.thumbKey !== null;
    return {
      key: useThumb ? image.thumbKey! : image.storageKey,
      // An image id's bytes never change, so the id and variant make a strong validator.
      etag: `"${image.id}-${useThumb ? 'thumb' : 'display'}"`,
    };
  }

  async open(key: string): Promise<Readable> {
    try {
      return await this.storage.getStream(key);
    } catch (err) {
      if (err instanceof StorageObjectNotFoundError) {
        this.logger.error({ key }, 'Image row points to a missing object');
        throw new NotFoundException('Image');
      }
      throw err;
    }
  }

  /** Deletes objects and rows of images soft-deleted longer than the retention period. */
  async purgeExpired(): Promise<number> {
    const cutoff = this.retentionCutoff();
    let purged = 0;
    for (;;) {
      const batch = await this.prisma.image.findMany({
        where: { deletedAt: { lte: cutoff } },
        select: { id: true, storageKey: true, thumbKey: true },
        take: BATCH_SIZE,
      });
      if (batch.length === 0) break;
      // Objects first: if storage fails the rows stay and the next run retries.
      await this.storage.delete(
        batch.flatMap((image) => [image.storageKey, ...(image.thumbKey ? [image.thumbKey] : [])]),
      );
      const { count } = await this.prisma.image.deleteMany({
        where: { id: { in: batch.map((image) => image.id) } },
      });
      purged += count;
      if (batch.length < BATCH_SIZE) break;
    }
    return purged;
  }

  /** Removes stored objects that no image row references (e.g. left behind by a crash). */
  async sweepOrphans(): Promise<number> {
    const cutoff = new Date(
      this.clock.now().getTime() - this.config.orphanGraceHours * 60 * 60 * 1000,
    );
    let deleted = 0;
    let batch: string[] = [];

    const flush = async () => {
      if (batch.length === 0) return;
      const keys = batch;
      batch = [];
      const known = await this.prisma.image.findMany({
        where: { OR: [{ storageKey: { in: keys } }, { thumbKey: { in: keys } }] },
        select: { storageKey: true, thumbKey: true },
      });
      const referenced = new Set(known.flatMap((image) => [image.storageKey, image.thumbKey]));
      const orphans = keys.filter((key) => !referenced.has(key));
      if (orphans.length > 0) {
        await this.storage.delete(orphans);
        deleted += orphans.length;
      }
    };

    for await (const object of this.storage.list(IMAGE_PREFIX)) {
      if (object.lastModified > cutoff) continue;
      batch.push(object.key);
      if (batch.length >= BATCH_SIZE) await flush();
    }
    await flush();
    return deleted;
  }

  private retentionCutoff(): Date {
    return new Date(this.clock.now().getTime() - this.config.retentionDays * DAY_MS);
  }

  /** With IMAGE_RETENTION_DAYS=0 there is no undo window, so purge right away. */
  private async afterSoftDelete(): Promise<void> {
    if (this.config.retentionDays === 0) await this.jobs.enqueue('images.purge', {});
  }

  private activeTaskImages(db: Db | Tx, taskId: string): Promise<number> {
    return db.image.count({ where: { taskId, deletedAt: null } });
  }

  private async assertQuota(db: Db | Tx, userId: string, extraBytes: number): Promise<void> {
    const usage = await db.image.aggregate({
      where: { ownerId: userId, deletedAt: null },
      _sum: { sizeBytes: true },
    });
    if ((usage._sum.sizeBytes ?? 0) + extraBytes > this.config.quotaBytes) {
      const quotaMb = Math.round(this.config.quotaBytes / (1024 * 1024));
      throw new PayloadTooLargeException(
        `You have reached your ${quotaMb} MB image storage limit. Remove some images and try again.`,
        ErrorCode.STORAGE_QUOTA_EXCEEDED,
      );
    }
  }

  /** Serialises a user's image changes so count and quota checks cannot race. */
  private async lockUser(tx: Tx, userId: string): Promise<void> {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
  }

  private async writeObjects(objects: PendingObject[]): Promise<void> {
    const results = await Promise.allSettled(
      objects.map((object) => this.storage.put(object.key, object.buffer, WEBP)),
    );
    const failure = results.find((result) => result.status === 'rejected');
    if (failure) {
      await this.discardObjects(objects.map((object) => object.key));
      throw failure.reason;
    }
  }

  /** Compensating delete; if it fails too, the orphan sweep removes the objects later. */
  private async discardObjects(keys: string[]): Promise<void> {
    try {
      await this.storage.delete(keys);
    } catch (err) {
      this.logger.warn(
        { err, count: keys.length },
        'Could not delete objects after a failed upload',
      );
    }
  }
}
