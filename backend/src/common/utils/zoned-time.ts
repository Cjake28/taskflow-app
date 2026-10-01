/*
 * Small time-zone helpers built on Intl (no extra dependency). Instants are plain `Date`s; local
 * calendar values are strings: `yyyy-MM-dd` for a day and `HH:mm` (24-hour) for a time.
 */

const MINUTE_MS = 60_000;
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** The wall-clock reading of `instant` in `timeZone`. */
export function zonedParts(instant: Date, timeZone: string): ZonedParts {
  const parts = Object.fromEntries(
    formatterFor(timeZone)
      .formatToParts(instant)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  ) as Record<string, number>;
  return {
    year: parts.year!,
    month: parts.month!,
    day: parts.day!,
    hour: parts.hour!,
    minute: parts.minute!,
    second: parts.second!,
  };
}

/** How far `timeZone` is ahead of UTC at `instant`, in milliseconds. */
function offsetMs(instant: Date, timeZone: string): number {
  const p = zonedParts(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

const pad = (value: number) => String(value).padStart(2, '0');

/** `yyyy-MM-dd` of `instant` in `timeZone`. */
export function localDateKey(instant: Date, timeZone: string): string {
  const p = zonedParts(instant, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** `HH:mm` of `instant` in `timeZone`. */
export function localTimeKey(instant: Date, timeZone: string): string {
  const p = zonedParts(instant, timeZone);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/**
 * The instant at which the clocks in `timeZone` read `dateKey` `timeKey`. A time skipped by a
 * daylight-saving jump resolves to the moment just after the jump.
 */
export function zonedTimeToUtc(dateKey: string, timeKey: string, timeZone: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number) as [number, number, number];
  const [hour, minute] = timeKey.split(':').map(Number) as [number, number];
  const wallClock = Date.UTC(year, month - 1, day, hour, minute);
  // Two passes settle the offset on either side of a daylight-saving change.
  const first = wallClock - offsetMs(new Date(wallClock), timeZone);
  const second = wallClock - offsetMs(new Date(first), timeZone);
  // If the clocks never show this time (spring-forward gap), the second pass lands an hour
  // early; the first pass is the moment just after the jump.
  if (localTimeKey(new Date(second), timeZone) !== timeKey)
    return new Date(Math.max(first, second));
  return new Date(second);
}

/** `dateKey` moved by `days` calendar days. */
export function addDaysToKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split('-').map(Number) as [number, number, number];
  const moved = new Date(Date.UTC(year, month - 1, day + days));
  return `${moved.getUTCFullYear()}-${pad(moved.getUTCMonth() + 1)}-${pad(moved.getUTCDate())}`;
}

/** The first instant of the local day containing `instant`, and of the next day. */
export function localDayBounds(instant: Date, timeZone: string): { start: Date; end: Date } {
  const key = localDateKey(instant, timeZone);
  return {
    start: zonedTimeToUtc(key, '00:00', timeZone),
    end: zonedTimeToUtc(addDaysToKey(key, 1), '00:00', timeZone),
  };
}

/** Minutes since local midnight for an `HH:mm` value. */
export function minutesOfDay(timeKey: string): number {
  const [hour, minute] = timeKey.split(':').map(Number) as [number, number];
  return hour * 60 + minute;
}

export const minutes = (count: number) => count * MINUTE_MS;
