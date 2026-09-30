/** Smallest gap between neighbours before the column is renumbered. */
export const POSITION_EPSILON = 1e-6;

/**
 * Kanban ordering with fractional positions: a card dropped between two others
 * takes the midpoint, so only the moved card is written.
 */
export function positionBetween(prev: number | null, next: number | null): number {
  if (prev !== null && next !== null) return (prev + next) / 2;
  if (prev !== null) return prev + 1;
  if (next !== null) return next - 1;
  return 0;
}

export function needsRenumber(prev: number | null, next: number | null): boolean {
  return prev !== null && next !== null && Math.abs(next - prev) < POSITION_EPSILON;
}
