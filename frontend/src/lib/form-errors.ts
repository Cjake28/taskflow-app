import { ErrorCode, type FieldError } from '@taskflow/shared';
import type { FieldPath, FieldValues, UseFormGetValues, UseFormSetError } from 'react-hook-form';

import { ApiError, getErrorMessage } from '@/lib/api-client';

/** Where non-field errors land: render with `formState.errors.root?.server`. */
export const ROOT_SERVER_ERROR = 'root.server' as const;

interface FormLike<T extends FieldValues> {
  setError: UseFormSetError<T>;
  getValues: UseFormGetValues<T>;
}

export interface ApplyServerErrorsOptions {
  /**
   * Fallback field for conflict codes when the server omits `details`
   * (e.g. `{ EMAIL_TAKEN: 'email' }`).
   */
  codeFields?: Partial<Record<string, string>>;
}

function isKnownField(values: FieldValues, field: string): boolean {
  const [head] = field.split('.');
  return head !== undefined && head !== '' && Object.prototype.hasOwnProperty.call(values, head);
}

/**
 * Maps an API error onto a React Hook Form instance (spec §14.7):
 * - `details[]` entries for fields the form has become field errors (the first one is focused);
 * - anything else becomes a single root error (`errors.root.server`) with a friendly message.
 *
 * Returns true when at least one field error was set.
 */
export function applyServerErrors<T extends FieldValues>(
  form: FormLike<T>,
  error: unknown,
  options: ApplyServerErrorsOptions = {},
): boolean {
  const values = form.getValues();
  const apiError = error instanceof ApiError ? error : null;

  const details: FieldError[] = [...(apiError?.details ?? [])];
  const codeField = apiError ? options.codeFields?.[apiError.code] : undefined;
  if (apiError && details.length === 0 && codeField) {
    details.push({ field: codeField, message: apiError.message });
  }

  const unmatched: string[] = [];
  let focused = false;
  const seen = new Set<string>();

  for (const detail of details) {
    if (!isKnownField(values, detail.field)) {
      unmatched.push(detail.message);
      continue;
    }
    if (seen.has(detail.field)) continue; // keep the first message per field
    seen.add(detail.field);
    form.setError(
      detail.field as FieldPath<T>,
      { type: 'server', message: detail.message },
      { shouldFocus: !focused },
    );
    focused = true;
  }

  if (!focused || unmatched.length > 0) {
    const message =
      unmatched.length > 0 && apiError?.code === ErrorCode.VALIDATION_ERROR
        ? unmatched.join(' ')
        : getErrorMessage(error);
    form.setError(ROOT_SERVER_ERROR, { type: apiError?.code ?? 'unknown', message });
  }

  return focused;
}
