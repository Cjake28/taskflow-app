import { LayoutDashboard, ListTodo } from 'lucide-react';
import { Link } from 'react-router';

import { EmptyState } from '@/components/common/empty-state';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { useCurrentUser } from '@/features/auth/use-auth';

function greeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/** Placeholder: the real dashboard (stats, agenda, activity) arrives with the tasks API. */
export function DashboardPage() {
  const user = useCurrentUser();
  return (
    <>
      <title>Dashboard · TaskFlow</title>
      <PageHeader eyebrow={`${greeting()}, ${user.firstName} 👋`} title="Dashboard" />
      <EmptyState
        icon={LayoutDashboard}
        sparkles
        title="Your dashboard is on its way"
        description="Stats, your week's agenda and recent activity will appear here once you start adding tasks."
        action={
          <Button asChild>
            <Link to="/tasks">
              <ListTodo aria-hidden="true" />
              Go to tasks
            </Link>
          </Button>
        }
      />
    </>
  );
}
