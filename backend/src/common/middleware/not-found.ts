import { ErrorCode } from '@taskflow/shared';
import type { RequestHandler } from 'express';
import { HttpException } from '../exceptions';

export const notFound: RequestHandler = (_req, _res, next) => {
  next(new HttpException(404, ErrorCode.NOT_FOUND, 'Route not found'));
};
