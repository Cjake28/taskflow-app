import { z } from 'zod';
import { IMAGE_VARIANTS } from '../constants/image';

export const imageQuerySchema = z.object({
  variant: z
    .enum(IMAGE_VARIANTS, { error: 'Use variant=display or variant=thumb' })
    .default('display'),
});

export type ImageQuery = z.output<typeof imageQuerySchema>;

export const taskImageParamsSchema = z.object({
  id: z.uuid('Invalid id'),
  imageId: z.uuid('Invalid image id'),
});

export type TaskImageParams = z.output<typeof taskImageParamsSchema>;
