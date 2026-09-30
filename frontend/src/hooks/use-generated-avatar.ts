import { useEffect, useState } from 'react';

const cache = new Map<string, string>();
let generator: Promise<(seed: string) => string> | null = null;

function loadGenerator() {
  generator ??= import('@/lib/generated-avatar').then((module) => module.generatedAvatarUri);
  return generator;
}

/**
 * Data URI of the DiceBear avatar for `seed`, or null while the generator loads (the caller
 * shows initials meanwhile). Results are cached for the lifetime of the page.
 */
export function useGeneratedAvatar(seed: string | null | undefined): string | null {
  const [loaded, setLoaded] = useState<{ seed: string; uri: string } | null>(null);
  const cached = seed ? cache.get(seed) : undefined;

  useEffect(() => {
    if (!seed || cache.has(seed)) return;
    let active = true;
    loadGenerator()
      .then((generate) => {
        const uri = generate(seed);
        cache.set(seed, uri);
        if (active) setLoaded({ seed, uri });
      })
      .catch(() => {
        // Initials remain as the fallback.
      });
    return () => {
      active = false;
    };
  }, [seed]);

  return cached ?? (loaded && loaded.seed === seed ? loaded.uri : null);
}
