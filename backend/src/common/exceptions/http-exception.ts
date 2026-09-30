import { ErrorCode, type FieldError } from '@taskflow/shared';
import { formatWait } from '../utils/format';

export class HttpException extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: FieldError[],
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class BadRequestException extends HttpException {
  constructor(
    message = 'Bad request',
    code: ErrorCode = ErrorCode.BAD_REQUEST,
    details?: FieldError[],
  ) {
    super(400, code, message, details);
  }
}

export class ValidationException extends HttpException {
  constructor(details: FieldError[], message = 'Please fix the highlighted fields.') {
    super(400, ErrorCode.VALIDATION_ERROR, message, details);
  }
}

export class UnauthorizedException extends HttpException {
  constructor(message = 'Please log in to continue.', code: ErrorCode = ErrorCode.UNAUTHENTICATED) {
    super(401, code, message);
  }
}

export class ForbiddenException extends HttpException {
  constructor(message = 'You are not allowed to do that.') {
    super(403, ErrorCode.FORBIDDEN, message);
  }
}

export class NotFoundException extends HttpException {
  constructor(resource = 'Resource') {
    super(404, ErrorCode.NOT_FOUND, `${resource} not found`);
  }
}

export class ConflictException extends HttpException {
  constructor(code: ErrorCode, field: string, message: string) {
    super(409, code, message, [{ field, message }]);
  }
}

export class PayloadTooLargeException extends HttpException {
  constructor(
    message = 'Request body is too large.',
    code: ErrorCode = ErrorCode.PAYLOAD_TOO_LARGE,
  ) {
    super(413, code, message);
  }
}

export class UnsupportedMediaTypeException extends HttpException {
  constructor(message = 'Unsupported content type.') {
    super(415, ErrorCode.UNSUPPORTED_MEDIA_TYPE, message);
  }
}

export class TooManyRequestsException extends HttpException {
  constructor(
    public readonly retryAfterSeconds: number,
    message = `Too many attempts. Try again in ${formatWait(retryAfterSeconds)}.`,
  ) {
    super(429, ErrorCode.RATE_LIMITED, message);
  }
}

export class ServiceUnavailableException extends HttpException {
  constructor(message = 'The service is temporarily unavailable. Please try again shortly.') {
    super(503, ErrorCode.SERVICE_UNAVAILABLE, message);
  }
}
