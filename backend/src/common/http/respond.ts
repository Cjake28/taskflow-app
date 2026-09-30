import type { PaginationMeta } from '@taskflow/shared';
import type { Response } from 'express';

export function ok<T>(res: Response, data: T): void {
  res.status(200).json({ data });
}

export function created<T>(res: Response, data: T, location?: string): void {
  if (location) res.location(location);
  res.status(201).json({ data });
}

export function accepted<T>(res: Response, data: T): void {
  res.status(202).json({ data });
}

export function paginated<T>(res: Response, data: T[], meta: PaginationMeta): void {
  res.status(200).json({ data, meta });
}

export function noContent(res: Response): void {
  res.status(204).end();
}
