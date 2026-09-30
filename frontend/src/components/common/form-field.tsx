import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react';
import { CircleAlert } from 'lucide-react';

import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface ControlProps {
  id?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}

export interface FormFieldProps {
  label: ReactNode;
  /** Right-aligned extra in the label row, e.g. a "Forgot password?" link. */
  labelAside?: ReactNode;
  /** "Optional" marker or similar next to the label. */
  labelHint?: ReactNode;
  error?: string;
  hint?: ReactNode;
  /** Extra content below the control (e.g. the password strength meter). */
  children: ReactElement<ControlProps>;
  after?: ReactNode;
  /** id of an element that further describes the control. */
  describedBy?: string;
  className?: string;
  id?: string;
}

/**
 * Label + control + error/hint wiring. The single child control receives `id`,
 * `aria-invalid` and `aria-describedby`, so every input is labelled and its error announced.
 */
export function FormField({
  label,
  labelAside,
  labelHint,
  error,
  hint,
  children,
  after,
  describedBy,
  className,
  id,
}: FormFieldProps) {
  const generatedId = useId();
  const controlId = id ?? children.props.id ?? generatedId;
  const errorId = `${controlId}-error`;
  const hintId = `${controlId}-hint`;
  const describedByIds =
    [error ? errorId : null, hint ? hintId : null, describedBy ?? null].filter(Boolean).join(' ') ||
    undefined;

  const control = isValidElement(children)
    ? cloneElement(children, {
        id: controlId,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedByIds,
      })
    : children;

  return (
    <div className={cn('flex flex-col', className)}>
      <div className="mb-[7px] flex items-center justify-between gap-3">
        <Label htmlFor={controlId}>
          {label}
          {labelHint ? (
            <span className="font-medium text-muted-foreground">{labelHint}</span>
          ) : null}
        </Label>
        {labelAside}
      </div>
      {control}
      {error ? (
        <p
          id={errorId}
          className="mt-[7px] flex items-center gap-1.5 text-[12.5px] font-semibold text-danger"
        >
          <CircleAlert aria-hidden="true" className="size-3.5 shrink-0" />
          {error}
        </p>
      ) : null}
      {hint && !error ? (
        <p id={hintId} className="mt-[7px] text-[12.5px] text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {after}
    </div>
  );
}
