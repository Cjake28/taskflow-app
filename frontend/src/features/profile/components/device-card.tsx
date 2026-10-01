import { useState } from 'react';
import { LogOut } from 'lucide-react';

import { ThemeSwitcher } from '@/components/common/theme-switcher';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/use-auth';

import { ProfileCard } from './profile-card';

/** Theme and Log out for this browser (on phones, the only place to reach them). */
export function DeviceCard() {
  const { logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);

  return (
    <ProfileCard title="This device">
      <div className="flex flex-col divide-y divide-border">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 pb-4">
          <div className="min-w-0">
            <p className="text-sm font-bold">Appearance</p>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              Auto follows your device&apos;s light or dark setting.
            </p>
          </div>
          <ThemeSwitcher />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 pt-4">
          <div className="min-w-0">
            <p className="text-sm font-bold">Log out</p>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              Sign out of TaskFlow here. Other open tabs sign out too.
            </p>
          </div>
          <Button
            variant="destructive-soft"
            loading={loggingOut}
            onClick={() => {
              setLoggingOut(true);
              void logout();
            }}
          >
            {!loggingOut && <LogOut aria-hidden="true" />}
            Log out
          </Button>
        </div>
      </div>
    </ProfileCard>
  );
}
