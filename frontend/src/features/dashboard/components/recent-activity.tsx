import { History } from 'lucide-react';

import { EmptyState } from '@/components/common/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { ActivityItem } from '@/features/activity/components/activity-item';

import { useRecentActivity } from '../hooks';
import { CardError, DashboardCard } from './dashboard-card';

export function RecentActivity({ className }: { className?: string }) {
  const query = useRecentActivity();
  const now = new Date();

  return (
    <DashboardCard title="Recent activity" className={className}>
      {query.isPending ? (
        <ul aria-hidden="true" className="-my-[9px]">
          {Array.from({ length: 5 }, (_, index) => (
            <li key={index} className="flex items-center gap-3 py-[9px]">
              <Skeleton className="size-8 shrink-0 rounded-full" />
              <div className="flex-1">
                <Skeleton className="h-3 w-3/5" />
                <Skeleton className="mt-2 h-2.5 w-2/5" />
              </div>
            </li>
          ))}
        </ul>
      ) : query.isError ? (
        <CardError
          what="recent activity"
          error={query.error}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : query.data.length === 0 ? (
        <EmptyState
          bare
          size="sm"
          icon={History}
          headingLevel="h3"
          title="No activity yet"
          description="Changes to your tasks will show up here."
          className="py-4"
        />
      ) : (
        <ol className="-my-[9px]" aria-label="Latest changes, newest first">
          {query.data.map((activity) => (
            <ActivityItem key={activity.id} activity={activity} now={now} />
          ))}
        </ol>
      )}
    </DashboardCard>
  );
}
