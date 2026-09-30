import type { CSSProperties } from 'react';
import {
  FIELD_LIMITS,
  PASSWORD_STRENGTH_LABELS,
  checkPassword,
  passwordStrength,
  type PasswordCheckResult,
  type PasswordRuleId,
  type PasswordStrength as Strength,
} from '@taskflow/shared';
import { Check, X } from 'lucide-react';

import { cn } from '@/lib/utils';

const STRENGTH_TINT: Record<Strength, string> = {
  0: 'var(--muted-foreground)',
  1: 'var(--danger)',
  2: 'var(--status-progress)',
  3: 'var(--primary)',
  4: 'var(--status-done)',
};

const RULE_HINT: Record<PasswordRuleId, string> = {
  length: `Use at least ${FIELD_LIMITS.password.min} characters`,
  upper: 'Add an uppercase letter',
  lower: 'Add a lowercase letter',
  number: 'Add a number',
  symbol: 'Add a symbol',
};

interface ChecklistItem {
  key: string;
  label: string;
  passed: boolean;
}

/**
 * Presentation only: the shared policy's "upper" and "lower" rules read better as one
 * "Upper & lowercase" line (as in the approved mockup). Every other rule passes through.
 */
function toChecklist(results: PasswordCheckResult[]): ChecklistItem[] {
  const upper = results.find((rule) => rule.id === 'upper');
  const lower = results.find((rule) => rule.id === 'lower');
  const items: ChecklistItem[] = [];
  for (const rule of results) {
    if (rule.id === 'upper' && lower) {
      items.push({ key: 'case', label: 'Upper & lowercase', passed: rule.passed && lower.passed });
    } else if (rule.id === 'lower' && upper) {
      continue;
    } else {
      items.push({ key: rule.id, label: rule.label, passed: rule.passed });
    }
  }
  return items;
}

function hintFor(password: string, results: PasswordCheckResult[], strength: Strength): string {
  const missing = results.find((rule) => !rule.passed);
  if (missing) {
    return strength >= 2 ? `${RULE_HINT[missing.id]} to make it strong` : RULE_HINT[missing.id];
  }
  if (strength < 4) return password.length < 12 ? 'Use 12+ characters to make it strong' : '';
  return "Nice, that's a good one";
}

export interface PasswordStrengthProps {
  password: string;
  className?: string;
  /** id for aria-describedby on the password input. */
  id?: string;
}

/** 4-segment meter, label, hint and live checklist driven by the shared password policy. */
export function PasswordStrength({ password, className, id }: PasswordStrengthProps) {
  const results = checkPassword(password);
  const strength = passwordStrength(password);
  const label = PASSWORD_STRENGTH_LABELS[strength];
  const items = toChecklist(results);
  const tint = STRENGTH_TINT[strength];

  return (
    <div id={id} className={cn('mt-2.5', className)} style={{ '--tint': tint } as CSSProperties}>
      <div
        role="meter"
        aria-label="Password strength"
        aria-valuemin={0}
        aria-valuemax={4}
        aria-valuenow={strength}
        aria-valuetext={label || 'No password entered'}
        className="grid grid-cols-4 gap-1.5"
      >
        {[1, 2, 3, 4].map((segment) => (
          <span
            key={segment}
            data-filled={segment <= strength}
            className={cn(
              'h-1.5 rounded-full transition-colors duration-200',
              segment <= strength ? 'bg-(--tint)' : 'bg-fill',
            )}
          />
        ))}
      </div>
      {password.length > 0 ? (
        <div className="mt-2 flex items-center justify-between gap-3 text-xs font-bold">
          <span
            aria-live="polite"
            className="text-[color-mix(in_oklab,var(--tint)_85%,var(--foreground))]"
          >
            {label}
          </span>
          <span className="text-right text-muted-foreground">
            {hintFor(password, results, strength)}
          </span>
        </div>
      ) : null}
      <ul
        className="mt-2.5 grid grid-cols-2 gap-x-2.5 gap-y-1.5 text-[12.5px]"
        aria-label="Password requirements"
      >
        {items.map((item) => (
          <li
            key={item.key}
            data-passed={item.passed}
            className={cn(
              'flex items-center gap-1.5 font-semibold',
              item.passed
                ? 'text-[color-mix(in_oklab,var(--status-done)_88%,var(--foreground))]'
                : 'text-muted-foreground',
            )}
          >
            {item.passed ? (
              <Check aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={3} />
            ) : (
              <X aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={2.5} />
            )}
            {item.label}
            <span className="sr-only">{item.passed ? '(met)' : '(not met)'}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
