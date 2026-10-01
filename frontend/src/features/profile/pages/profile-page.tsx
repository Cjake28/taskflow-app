import { useEffect, useState } from 'react';
import { Link2, ShieldCheck, UserRound, X, type LucideIcon } from 'lucide-react';
import { Tabs } from 'radix-ui';
import { useSearchParams } from 'react-router';

import { Alert } from '@/components/common/alert';
import { Button } from '@/components/ui/button';
import { useCurrentUser } from '@/features/auth/use-auth';

import { AccountForm } from '../components/account-form';
import { AccountOverview } from '../components/account-overview';
import { ConnectedAccounts } from '../components/connected-accounts';
import { DeviceCard } from '../components/device-card';
import { PasswordForm } from '../components/password-form';
import { ProfileHeader } from '../components/profile-header';
import { SessionsCard } from '../components/sessions-card';
import {
  hasOAuthBannerParams,
  oauthBannerContent,
  parseOAuthBanner,
  withoutOAuthBannerParams,
  type OAuthBanner,
} from '../lib/oauth-banner';
import { parseProfileTab, type ProfileTab } from '../lib/profile-tabs';

const TABS: Array<{ value: ProfileTab; label: string; short: string; icon: LucideIcon }> = [
  { value: 'account', label: 'Account', short: 'Account', icon: UserRound },
  { value: 'security', label: 'Security', short: 'Security', icon: ShieldCheck },
  { value: 'connected', label: 'Connected accounts', short: 'Connected', icon: Link2 },
];

function OAuthBannerAlert({ banner, onDismiss }: { banner: OAuthBanner; onDismiss: () => void }) {
  const content = oauthBannerContent(banner);
  return (
    <div className="relative animate-in duration-200 fade-in-0 slide-in-from-top-1">
      <Alert
        variant={content.variant}
        title={content.title}
        icon={banner.kind === 'linked' ? Link2 : undefined}
        className="pr-12"
      >
        {content.body}
      </Alert>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Dismiss"
        className="absolute top-2 right-2 text-current hover:bg-card/60"
        onClick={onDismiss}
      >
        <X aria-hidden="true" />
      </Button>
    </div>
  );
}

/** Profile with URL-driven tabs (`?tab=account|security|connected`, spec §14.3–14.4). */
export function ProfilePage() {
  const user = useCurrentUser();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseProfileTab(searchParams.get('tab'));
  // Read once: the OAuth result parameters are removed from the URL right away.
  const [banner, setBanner] = useState(() => parseOAuthBanner(searchParams));

  useEffect(() => {
    if (hasOAuthBannerParams(searchParams)) {
      setSearchParams(withoutOAuthBannerParams(searchParams), { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const changeTab = (value: string) => {
    setBanner(null);
    setSearchParams(
      (previous) => {
        const next = withoutOAuthBannerParams(previous);
        next.set('tab', value);
        return next;
      },
      { preventScrollReset: true },
    );
  };

  const current = TABS.find((item) => item.value === tab) ?? TABS[0];

  return (
    <>
      <title>{`${current?.label ?? 'Profile'} · Profile · TaskFlow`}</title>
      <ProfileHeader user={user} />

      {banner ? <OAuthBannerAlert banner={banner} onDismiss={() => setBanner(null)} /> : null}

      <Tabs.Root value={tab} onValueChange={changeTab} className="flex flex-col gap-5">
        <Tabs.List
          aria-label="Profile sections"
          className="grid w-full grid-cols-3 gap-1 rounded-full bg-fill p-[5px] sm:flex sm:w-max"
        >
          {TABS.map(({ value, label, short, icon: Icon }) => (
            <Tabs.Trigger
              key={value}
              value={value}
              className="inline-flex cursor-pointer items-center justify-center gap-[7px] rounded-full px-2 py-[9px] text-[13px] font-bold whitespace-nowrap text-muted-foreground transition-[background-color,color,box-shadow] duration-150 hover:text-foreground focus-visible:ring-4 focus-visible:ring-ring/30 focus-visible:outline-none data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-card sm:px-4 sm:text-[13.5px]"
            >
              <Icon aria-hidden="true" className="size-4 shrink-0" />
              <span className="sm:hidden">{short}</span>
              <span className="hidden sm:inline">{label}</span>
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        <Tabs.Content value="account" className="outline-none">
          <div className="grid items-start gap-5 lg:grid-cols-2">
            {/* Remount after an email or password change so the schema sees the new account. */}
            <AccountForm key={`${user.email}:${user.hasPassword}`} user={user} />
            <AccountOverview user={user} />
          </div>
        </Tabs.Content>

        <Tabs.Content value="security" className="outline-none">
          <div className="grid items-start gap-5 lg:grid-cols-2">
            <PasswordForm key={String(user.hasPassword)} user={user} />
            <div className="flex min-w-0 flex-col gap-5">
              <SessionsCard />
              <DeviceCard />
            </div>
          </div>
        </Tabs.Content>

        <Tabs.Content value="connected" className="outline-none">
          <ConnectedAccounts user={user} />
        </Tabs.Content>
      </Tabs.Root>
    </>
  );
}
