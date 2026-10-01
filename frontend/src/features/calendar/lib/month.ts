import {
  addDays,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  isValid,
  parse,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns';

const WEEK = { weekStartsOn: 1 } as const;

/** Every local day shown for `month`: whole weeks (Mon–Sun) covering the month. */
export function monthGrid(month: Date): Date[] {
  const first = startOfWeek(startOfMonth(month), WEEK);
  const last = endOfWeek(endOfMonth(month), WEEK);
  const days: Date[] = [];
  for (let day = first; day <= last; day = addDays(day, 1)) days.push(startOfDay(day));
  return days;
}

/** `dueFrom` / `dueTo` covering the visible grid (including the neighbouring months' days). */
export function gridRange(month: Date): { dueFrom: string; dueTo: string } {
  const days = monthGrid(month);
  return {
    dueFrom: days[0]!.toISOString(),
    dueTo: endOfDay(days[days.length - 1]!).toISOString(),
  };
}

export function formatMonthParam(date: Date): string {
  return format(date, 'yyyy-MM');
}

export function parseMonthParam(value: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) return null;
  const month = parse(value, 'yyyy-MM', new Date());
  return isValid(month) ? startOfMonth(month) : null;
}

export function parseDayParam(value: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const day = parse(value, 'yyyy-MM-dd', new Date());
  return isValid(day) ? startOfDay(day) : null;
}

export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
