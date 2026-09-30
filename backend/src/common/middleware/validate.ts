import type { FieldError } from '@taskflow/shared';
import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';
import { ValidationException } from '../exceptions';
import { zodIssuesToFieldErrors } from '../utils/zod';

type Target = 'params' | 'query' | 'body';
export type ValidationSchemas = Partial<Record<Target, ZodType>>;

const TARGETS: Target[] = ['params', 'query', 'body'];

export function validate(schemas: ValidationSchemas): RequestHandler {
  return (req, _res, next) => {
    const errors: FieldError[] = [];
    for (const target of TARGETS) {
      const schema = schemas[target];
      if (!schema) continue;
      const result = schema.safeParse(req[target] ?? {});
      if (result.success) req.valid[target] = result.data;
      else errors.push(...zodIssuesToFieldErrors(result.error));
    }
    if (errors.length > 0) {
      next(new ValidationException(errors));
      return;
    }
    next();
  };
}
