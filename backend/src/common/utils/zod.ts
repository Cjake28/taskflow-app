import type { FieldError } from '@taskflow/shared';
import type { ZodError } from 'zod';

export function zodIssuesToFieldErrors(error: ZodError): FieldError[] {
  return error.issues.flatMap((issue): FieldError[] => {
    if (issue.code === 'unrecognized_keys') {
      return issue.keys.map((key) => ({
        field: [...issue.path, key].join('.'),
        message: 'Unknown field',
      }));
    }
    return [{ field: issue.path.join('.') || '_root', message: issue.message }];
  });
}
