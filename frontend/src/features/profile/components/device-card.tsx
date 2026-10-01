import { ThemeSwitcher } from '@/components/common/theme-switcher';

import { ProfileCard } from './profile-card';

/** Theme for this browser (on phones, the only place to change it). */
export function DeviceCard() {
  return (
    <ProfileCard title="This device">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <p className="text-sm font-bold">Appearance</p>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Auto follows your device&apos;s light or dark setting.
          </p>
        </div>
        <ThemeSwitcher />
      </div>
    </ProfileCard>
  );
}
