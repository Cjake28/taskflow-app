import { ErrorCode, type ApiErrorBody } from '@taskflow/shared';
import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '../../generated/prisma/client';
import {
  BadRequestException,
  HttpException,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
  TooManyRequestsException,
  ValidationException,
} from '../exceptions';
import { zodIssuesToFieldErrors } from '../utils/zod';

interface BodyParserError {
  type: string;
  status: number;
}

function isBodyParserError(err: unknown): err is BodyParserError {
  return typeof err === 'object' && err !== null && 'type' in err && 'status' in err;
}

export function normalizeError(err: unknown): HttpException {
  if (err instanceof HttpException) return err;
  if (err instanceof ZodError) return new ValidationException(zodIssuesToFieldErrors(err));
  if (isBodyParserError(err)) {
    if (err.type === 'entity.parse.failed') {
      return new BadRequestException('Request body is not valid JSON.', ErrorCode.INVALID_JSON);
    }
    if (err.type === 'entity.too.large') return new PayloadTooLargeException();
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2025') return new NotFoundException();
    if (err.code === 'P2002') {
      return new HttpException(409, ErrorCode.CONFLICT, 'This value is already in use.');
    }
    if (err.code === 'P1001' || err.code === 'P1002') return new ServiceUnavailableException();
  }
  if (err instanceof Prisma.PrismaClientInitializationError) {
    return new ServiceUnavailableException();
  }
  return new HttpException(
    500,
    ErrorCode.INTERNAL_ERROR,
    'Something went wrong. Please try again.',
  );
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const error = normalizeError(err);

  if (error.status >= 500) req.log?.error({ err }, 'Request failed');
  else req.log?.warn({ code: error.code }, error.message);

  if (res.headersSent) return;
  if (error instanceof TooManyRequestsException) {
    res.setHeader('Retry-After', String(error.retryAfterSeconds));
  }

  const body: ApiErrorBody = {
    error: {
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
      requestId: typeof req.id === 'string' ? req.id : String(req.id ?? ''),
    },
  };
  res.status(error.status).json(body);
};
