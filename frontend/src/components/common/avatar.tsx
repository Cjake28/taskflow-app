import { useMemo, useState } from 'react';
import type { UserDto } from '@taskflow/shared';

import { generatedAvatarUri, initialsOf } from '@/lib/avatar';
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

type Source = 'uploaded' | 'generated';

/**
 * Uploaded/imported avatar (served by our API) → DiceBear from the user id → initials
 * (spec §14.8). Each step falls back to the next when the image fails to load.
 */
export function Avatar({ user, size = 'md', className, alt = '' }: AvatarProps) {
  // Failures are tracked per URL so a newly uploaded avatar gets a fresh chance.
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());
  const generated = useMemo(() => {
    try {
      return generatedAvatarUri(user.id);
    } catch {
      return null;
    }
  }, [user.id]);

  const candidates: Array<[Source, string | null]> = [
    ['uploaded', user.avatarUrl],
    ['generated', generated],
  ];
  const current = candidates.find(([, src]) => src && !failed.has(src));

  return (
    <span
      className={cn(
        'relative inline-grid shrink-0 place-items-center overflow-hidden rounded-full bg-[#ffd9c2] font-bold text-[#7a3e1d] select-none',
        SIZES[size],
        className,
      )}
    >
      {current ? (
        <img
          key={current[1]}
          src={current[1] ?? undefined}
          alt={alt}
          className="size-full object-cover"
          draggable={false}
          onError={() => setFailed((prev) => new Set(prev).add(current[1] ?? ''))}
        />
      ) : (
        <span {...(alt ? { role: 'img', 'aria-label': alt } : { 'aria-hidden': true })}>
          {initialsOf(user.firstName, user.lastName)}
        </span>
      )}
    </span>
  );
}
