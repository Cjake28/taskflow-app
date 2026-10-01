export const PROFILE_TABS = ['account', 'security', 'notifications', 'connected'] as const;
export type ProfileTab = (typeof PROFILE_TABS)[number];

/** `?tab=` value → a known tab (anything else falls back to Account). */
export function parseProfileTab(value: string | null): ProfileTab {
  return (PROFILE_TABS as readonly string[]).includes(value ?? '')
    ? (value as ProfileTab)
    : 'account';
}

export function profileTabHref(tab: ProfileTab): string {
  return `/profile?tab=${tab}`;
}
