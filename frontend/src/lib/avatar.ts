/** Up to two initials for the last-resort avatar. */
export function initialsOf(firstName?: string | null, lastName?: string | null): string {
  const letters = [firstName, lastName]
    .map((part) => part?.trim().charAt(0) ?? '')
    .join('')
    .toUpperCase();
  return letters || '?';
}
