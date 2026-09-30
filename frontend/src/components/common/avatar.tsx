import { useState } from 'react';
import type { UserDto } from '@taskflow/shared';

import { useGeneratedAvatar } from '@/hooks/use-generated-avatar';
import { initialsOf } from '@/lib/avatar';
import { cn } from '@/lib/utils';

const SIZES = {
  sm: 'size-8 text-xs',
  md: 'size-[38px] text-sm',
  lg: 'size-[46px] text-base rounded-2xl',
  xl: 'size-[84px] text-2xl rounded-[28px]',
} as const;

export interface AvatarProps {
  user: Pick<UserDto, 'id' | 'firstName' | 'lastName' | 'avatarUrl'>;
  size?: keyof typeof SIZES;
  className?: string;
  /** Decorative by default; pass a label when the avatar stands alone. */
  alt?: string;
}

/**
 * Uploaded/imported avatar (served by our API) → DiceBear from the user id → initials
 * (spec §14.8). Each step falls back to the next when an image fails to load; initials also
 * show while the DiceBear generator is being loaded.
 */
export function Avatar({ user, size = 'md', className, alt = '' }: AvatarProps) {
  // Failures are tracked per URL so a newly uploaded avatar gets a fresh chance.
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());
  const uploaded = user.avatarUrl && !failed.has(user.avatarUrl) ? user.avatarUrl : null;
  // Only generate the fallback when there is no usable uploaded avatar.
  const generated = useGeneratedAvatar(uploaded ? null : user.id);
  const src = uploaded ?? (generated && !failed.has(generated) ? generated : null);

  return (
    <span
      className={cn(
        'relative inline-grid shrink-0 place-items-center overflow-hidden rounded-full bg-[#ffd9c2] font-bold text-[#7a3e1d] select-none',
        SIZES[size],
        className,
      )}
    >
      {src ? (
        <img
          key={src}
          src={src}
          alt={alt}
          className="size-full object-cover"
          draggable={false}
          onError={() => setFailed((prev) => new Set(prev).add(src))}
        />
      ) : (
        <span {...(alt ? { role: 'img', 'aria-label': alt } : { 'aria-hidden': true })}>
          {initialsOf(user.firstName, user.lastName)}
        </span>
      )}
    </span>
  );
}
