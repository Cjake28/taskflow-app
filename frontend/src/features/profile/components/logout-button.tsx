import { useState } from 'react';
import { LogOut } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/use-auth';
import { cn } from '@/lib/utils';

/** Signs this browser out (other open tabs follow). Shown in the profile header. */
export function LogoutButton({ className }: { className?: string }) {
  const { logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);

  return (
    <Button
      variant="destructive-soft"
      loading={loggingOut}
      className={cn('shrink-0', className)}
      onClick={() => {
        setLoggingOut(true);
        void logout();
      }}
    >
      {!loggingOut && <LogOut aria-hidden="true" />}
      {loggingOut ? 'Logging out…' : 'Log out'}
    </Button>
  );
}
