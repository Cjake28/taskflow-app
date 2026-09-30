import type { ImageDto } from '@taskflow/shared';
import { imageUrl, thumbUrl } from '../tasks/tasks.mapper';

export interface ImageRecord {
  id: string;
  width: number;
  height: number;
  sizeBytes: number;
  originalName: string | null;
  thumbKey: string | null;
  createdAt: Date;
}

export function toImageResponse(image: ImageRecord): ImageDto {
  return {
    id: image.id,
    url: imageUrl(image.id),
    thumbUrl: image.thumbKey ? thumbUrl(image.id) : imageUrl(image.id),
    width: image.width,
    height: image.height,
    sizeBytes: image.sizeBytes,
    originalName: image.originalName,
    createdAt: image.createdAt.toISOString(),
  };
}
