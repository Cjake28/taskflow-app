const WEEK = 7 * 24 * 60;
const DAY = 24 * 60;
const HOUR = 60;

const plural = (count: number, unit: string) => `${count} ${unit}${count === 1 ? '' : 's'}`;

/** A whole number of minutes in the largest unit that divides it: "10 minutes", "2 hours", "1 week". */
export function formatDuration(minutes: number): string {
  if (minutes > 0 && minutes % WEEK === 0) return plural(minutes / WEEK, 'week');
  if (minutes > 0 && minutes % DAY === 0) return plural(minutes / DAY, 'day');
  if (minutes > 0 && minutes % HOUR === 0) return plural(minutes / HOUR, 'hour');
  return plural(minutes, 'minute');
}

/** How far before the due time something happens: "At due time", "1 hour before". */
export function formatBefore(minutes: number): string {
  return minutes === 0 ? 'At due time' : `${formatDuration(minutes)} before`;
}
