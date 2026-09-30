import { createAvatar } from '@dicebear/core';
import * as notionists from '@dicebear/notionists';

/*
 * Deterministic fallback avatars, generated locally (no network calls) from the user id.
 * Style: DiceBear "Notionists" by Zoish, licensed CC0 1.0 (design), MIT (code).
 */

const BACKGROUNDS = ['ffd9c2', 'ffd27a', 'c7d2fe', 'bbf7d0', 'fbcfe8', 'bae6fd', 'e9d5ff'];
const cache = new Map<string, string>();

export function generatedAvatarUri(seed: string): string {
  const cached = cache.get(seed);
  if (cached) return cached;
  const uri = createAvatar(notionists, { seed, backgroundColor: BACKGROUNDS }).toDataUri();
  if (cache.size > 200) cache.clear();
  cache.set(seed, uri);
  return uri;
}

export function initialsOf(firstName?: string | null, lastName?: string | null): string {
  const letters = [firstName, lastName]
    .map((part) => part?.trim().charAt(0) ?? '')
    .join('')
    .toUpperCase();
  return letters || '?';
}
