/** The time zone this browser reports, e.g. `Asia/Manila` (UTC when unavailable). */
export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** Every IANA zone the browser knows, always including UTC and the device's own zone. */
export function timeZoneOptions(): string[] {
  const supported =
    typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  return [...new Set([...supported, 'UTC', deviceTimeZone()])].sort((a, b) => a.localeCompare(b));
}

/** "GMT+8" for a zone at the given moment (empty when the zone is unknown). */
export function timeZoneOffset(timeZone: string, at: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'shortOffset',
    }).formatToParts(at);
    return parts.find((part) => part.type === 'timeZoneName')?.value ?? '';
  } catch {
    return '';
  }
}

/** "Asia/Manila (GMT+8)", with underscores shown as spaces. */
export function formatTimeZone(timeZone: string, at: Date = new Date()): string {
  const offset = timeZoneOffset(timeZone, at);
  const name = timeZone.replaceAll('_', ' ');
  return offset ? `${name} (${offset})` : name;
}
