import Bowser from 'bowser';

/** Turns a User-Agent string into a friendly label such as "Chrome on Windows". */
export function describeDevice(userAgent: string | null): string {
  if (!userAgent) return 'Unknown device';
  const parsed = Bowser.parse(userAgent);
  const browser = parsed.browser.name;
  const os = parsed.os.name;
  if (browser && os) return `${browser} on ${os}`;
  return browser ?? os ?? 'Unknown device';
}

/** Shows IPv4-mapped IPv6 addresses (::ffff:1.2.3.4) as plain IPv4. */
export function displayIp(ip: string | null): string | null {
  if (!ip) return null;
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}
