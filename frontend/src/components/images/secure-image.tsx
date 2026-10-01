import { useState, type CSSProperties, type ImgHTMLAttributes } from 'react';
import { ImageOff } from 'lucide-react';

import { Skeleton } from '@/components/ui/skeleton';
import { refreshSession } from '@/lib/api-client';
import { cn } from '@/lib/utils';

import { withRetryParam } from './image-utils';

export interface SecureImageProps extends Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  'src' | 'alt' | 'onLoad' | 'onError'
> {
  /** Same-origin API URL, e.g. `/api/v1/images/<id>?variant=thumb` (sent with the auth cookie). */
  src: string;
  alt: string;
  /** Classes for the wrapper (size, radius). */
  className?: string;
  /** Classes for the <img> itself (object-fit…). */
  imgClassName?: string;
  /** Fallback text when the image cannot be shown (the alt text is used by default). */
  fallbackLabel?: string;
  /** Hide the "couldn't load" caption on small tiles. */
  compactFallback?: boolean;
  /** Inline styles for the wrapper (e.g. an aspect ratio while the image loads). */
  wrapperStyle?: CSSProperties;
}

type Phase = 'loading' | 'loaded' | 'retrying' | 'failed';

function SecureImageInner({
  src,
  alt,
  className,
  imgClassName,
  fallbackLabel,
  compactFallback = false,
  wrapperStyle,
  loading = 'lazy',
  ...rest
}: SecureImageProps) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [retried, setRetried] = useState(false);

  const handleError = () => {
    if (retried) {
      setPhase('failed');
      return;
    }
    // The access cookie may have expired between renders: refresh once, then retry the load.
    setPhase('retrying');
    void refreshSession()
      .catch(() => undefined)
      .finally(() => {
        setRetried(true);
        setPhase('loading');
      });
  };

  return (
    <span className={cn('relative block overflow-hidden bg-fill', className)} style={wrapperStyle}>
      {phase === 'loading' || phase === 'retrying' ? (
        <Skeleton className="absolute inset-0 rounded-none" />
      ) : null}
      {phase === 'failed' ? (
        <span
          role="img"
          aria-label={fallbackLabel ?? alt}
          className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 p-2 text-center text-muted-foreground"
        >
          <ImageOff aria-hidden="true" className="size-5 shrink-0" />
          {compactFallback ? null : (
            <span className="text-xs font-semibold">Couldn&apos;t load image</span>
          )}
        </span>
      ) : null}
      {phase !== 'retrying' && phase !== 'failed' ? (
        <img
          {...rest}
          key={retried ? 'retry' : 'first'}
          src={retried ? withRetryParam(src) : src}
          alt={alt}
          loading={loading}
          decoding="async"
          draggable={false}
          onLoad={() => setPhase('loaded')}
          onError={handleError}
          className={cn(
            'block size-full transition-opacity duration-200',
            phase === 'loaded' ? 'opacity-100' : 'opacity-0',
            imgClassName,
          )}
        />
      ) : null}
    </span>
  );
}

/**
 * Authenticated `<img>` (spec §14.8): lazy, a shimmer while loading, and on failure one silent
 * session refresh followed by a retry before showing a fallback.
 */
export function SecureImage(props: SecureImageProps) {
  // A new source starts over (fresh retry budget and skeleton).
  return <SecureImageInner key={props.src} {...props} />;
}
