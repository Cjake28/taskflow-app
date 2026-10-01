import {
  useImperativeHandle,
  useRef,
  type ClipboardEvent,
  type KeyboardEvent,
  type Ref,
} from 'react';

import { cn } from '@/lib/utils';

export interface OtpInputHandle {
  /** Focuses the first box (e.g. after a wrong code). */
  focus: () => void;
}

export interface OtpInputProps {
  ref?: Ref<OtpInputHandle>;
  value: string;
  onChange: (value: string) => void;
  /** Called once every box is filled. */
  onComplete?: (value: string) => void;
  length?: number;
  disabled?: boolean;
  invalid?: boolean;
  autoFocus?: boolean;
  /** Accessible name of the group, e.g. "Verification code". */
  label: string;
  describedBy?: string;
}

/**
 * One box per digit. Typing moves forward, Backspace moves back, arrows move freely,
 * and pasting (or the browser's one-time-code autofill) fills every box at once.
 */
export function OtpInput({
  ref,
  value,
  onChange,
  onComplete,
  length = 6,
  disabled = false,
  invalid = false,
  autoFocus = false,
  label,
  describedBy,
}: OtpInputProps) {
  const inputs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length }, (_, index) => value[index] ?? '');

  const focus = (index: number) => {
    const target = inputs.current[Math.max(0, Math.min(length - 1, index))];
    target?.focus();
    target?.select();
  };

  useImperativeHandle(ref, () => ({ focus: () => focus(0) }));

  const commit = (next: string, focusIndex: number) => {
    const clean = next.replace(/\D/g, '').slice(0, length);
    onChange(clean);
    if (clean.length === length) onComplete?.(clean);
    else focus(focusIndex);
  };

  const handleInput = (index: number, raw: string) => {
    const typed = raw.replace(/\D/g, '');
    if (!typed) return;
    // Several digits at once (autofill or a fast typist): spread them from this box on.
    const next = (value.slice(0, index) + typed + value.slice(index + typed.length)).slice(
      0,
      length,
    );
    commit(next, index + typed.length);
  };

  const handleKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace') {
      event.preventDefault();
      if (digits[index]) {
        onChange(value.slice(0, index) + value.slice(index + 1));
        focus(index);
      } else if (index > 0) {
        onChange(value.slice(0, index - 1) + value.slice(index));
        focus(index - 1);
      }
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      focus(index - 1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      focus(index + 1);
    }
  };

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '');
    if (!pasted) return;
    event.preventDefault();
    commit(pasted, pasted.length);
  };

  return (
    <div
      role="group"
      aria-label={label}
      aria-describedby={describedBy}
      className="flex justify-between gap-2 sm:gap-2.5"
    >
      {digits.map((digit, index) => (
        <input
          // Positions never reorder, so the index is a stable key.
          key={index}
          ref={(element) => {
            inputs.current[index] = element;
          }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={length}
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          // The code is the only task on this screen.
          autoFocus={autoFocus && index === 0}
          aria-label={`Digit ${index + 1} of ${length}`}
          aria-invalid={invalid || undefined}
          disabled={disabled}
          value={digit}
          onChange={(event) => handleInput(index, event.target.value)}
          onKeyDown={(event) => handleKeyDown(index, event)}
          onPaste={handlePaste}
          onFocus={(event) => event.target.select()}
          className={cn(
            'h-14 w-full min-w-0 rounded-input border-[1.5px] border-transparent bg-fill text-center text-2xl font-extrabold text-foreground tabular-nums caret-primary transition-[background-color,border-color,box-shadow] duration-150 outline-none sm:h-16',
            'focus:border-primary focus:bg-card focus:shadow-[0_0_0_4px_color-mix(in_oklab,var(--primary)_16%,transparent)]',
            invalid &&
              'border-danger bg-[color-mix(in_oklab,var(--danger)_6%,var(--card))] focus:border-danger focus:shadow-[0_0_0_4px_color-mix(in_oklab,var(--danger)_14%,transparent)]',
            disabled && 'opacity-60',
          )}
        />
      ))}
    </div>
  );
}
