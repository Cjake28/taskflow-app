import { ChevronRight, History } from 'lucide-react';
import { Link } from 'react-router';

import { EmptyState } from '@/components/common/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { ActivityItem } from '@/features/activity/components/activity-item';

import { useRecentActivity } from '../hooks';
import { CardError, DashboardCard } from './dashboard-card';

export function RecentActivity({ className }: { className?: string }) {
  const query = useRecentActivity();
  const now = new Date();

  return (
    <DashboardCard
      title="Recent activity"
      className={className}
      aside={
        <Link
          to="/activity"
          className="inline-flex items-center gap-0.5 rounded-full px-2 py-1 text-[13px] font-semibold text-muted-foreground transition-colors hover:bg-fill hover:text-foreground"
        >
          View all
          <ChevronRight aria-hidden="true" className="size-[15px]" />
        </Link>
      }
    >
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
        // Two newspaper-style columns while the card spans the full width (below xl).
        <ol
          className="-my-[9px] md:columns-2 md:gap-x-8 xl:columns-1"
          aria-label="Latest changes, newest first"
        >
          {query.data.map((activity) => (
            <ActivityItem
              key={activity.id}
              activity={activity}
              now={now}
              className="break-inside-avoid"
            />
          ))}
        </ol>
      )}
    </DashboardCard>
  );
}
