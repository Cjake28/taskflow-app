import type { SessionDto } from '@taskflow/shared';
import { differenceInMinutes } from 'date-fns';

import { formatRelativeTime } from '@/features/activity/relative-time';

export type DeviceKind = 'phone' | 'tablet' | 'desktop';

/** The API's friendly device name ("Safari on iOS") → which icon to show. */
export function deviceKind(device: string): DeviceKind {
  const name = device.toLowerCase();
  if (/ipad|tablet/.test(name)) return 'tablet';
  if (/iphone|ios|android|mobile|phone/.test(name)) return 'phone';
  return 'desktop';
}

/** Current session first, then the most recently used. */
export function sortSessions(sessions: readonly SessionDto[]): SessionDto[] {
  return [...sessions].sort((a, b) => {
    if (a.current !== b.current) return a.current ? -1 : 1;
    return Date.parse(b.lastUsedAt) - Date.parse(a.lastUsedAt);
  });
}

/** "Active now" for this device or anything used in the last 5 minutes. */
export function lastActiveLabel(session: SessionDto, now: Date = new Date()): string {
  if (session.current || differenceInMinutes(now, new Date(session.lastUsedAt)) < 5) {
    return 'Active now';
  }
  return `Last active ${formatRelativeTime(session.lastUsedAt, now)}`;
}
