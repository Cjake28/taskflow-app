import type { ErrorCode } from '../constants/error-codes';

export interface FieldError {
  field: string;
  message: string;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ApiSuccess<T> {
  data: T;
  meta?: PaginationMeta;
}

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: FieldError[];
    requestId: string;
  };
}
