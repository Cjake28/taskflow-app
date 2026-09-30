import { useState } from 'react';
import { Eye, EyeOff, LockKeyhole } from 'lucide-react';

import { Input, type InputProps } from '@/components/ui/input';

export type PasswordInputProps = Omit<InputProps, 'type' | 'endSlot'> & {
  /** Hide the leading lock icon. */
  plain?: boolean;
};

/** Password field with a show/hide toggle (spec §14.7). */
export function PasswordInput({ plain = false, startIcon, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  return (
    <Input
      {...props}
      type={visible ? 'text' : 'password'}
      spellCheck={false}
      autoCapitalize="none"
      startIcon={plain ? undefined : (startIcon ?? <LockKeyhole />)}
      endSlot={
        <button
          type="button"
          onClick={() => setVisible((value) => !value)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          aria-controls={props.id}
          className="grid size-9 cursor-pointer place-items-center rounded-full text-muted-foreground transition-colors hover:bg-card hover:text-foreground focus-visible:ring-4 focus-visible:ring-ring/30 focus-visible:outline-none [&_svg]:size-[18px]"
        >
          {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        </button>
      }
    />
  );
}
