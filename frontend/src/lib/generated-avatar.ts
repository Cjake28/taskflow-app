import { createAvatar } from '@dicebear/core';
import * as notionists from '@dicebear/notionists';

/*
 * Deterministic fallback avatars, generated locally (no network calls) from the user id.
 * Style: DiceBear "Notionists" by Zoish, licensed CC0 1.0 (design), MIT (code).
 * This module is loaded on demand: the style's SVG data is large and not needed for first paint.
 */

const BACKGROUNDS = ['ffd9c2', 'ffd27a', 'c7d2fe', 'bbf7d0', 'fbcfe8', 'bae6fd', 'e9d5ff'];

export function generatedAvatarUri(seed: string): string {
  return createAvatar(notionists, { seed, backgroundColor: BACKGROUNDS }).toDataUri();
}
