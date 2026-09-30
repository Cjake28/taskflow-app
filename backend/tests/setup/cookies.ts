export interface ParsedCookie {
  value: string;
  attributes: string;
}

export function setCookies(res: {
  headers: Record<string, unknown>;
}): Record<string, ParsedCookie> {
  const raw = res.headers['set-cookie'];
  const lines = Array.isArray(raw) ? (raw as string[]) : typeof raw === 'string' ? [raw] : [];
  const cookies: Record<string, ParsedCookie> = {};
  for (const line of lines) {
    const [pair = '', ...attributes] = line.split(';');
    const separator = pair.indexOf('=');
    cookies[pair.slice(0, separator).trim()] = {
      value: decodeURIComponent(pair.slice(separator + 1)),
      attributes: attributes.join(';').trim(),
    };
  }
  return cookies;
}

export function cookieHeader(cookies: Record<string, string>): string {
  return Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}
