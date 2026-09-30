import { ChevronLeft, ChevronRight, FileSearch } from 'lucide-react';
import { Link } from 'react-router';

import { EmptyState } from '@/components/common/empty-state';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';

/** Placeholder: task details (description, images, activity) arrive with the tasks API. */
export function TaskDetailsPage() {
  return (
    <>
      <title>Task · TaskFlow</title>
      <PageHeader
        crumbs={
          <nav
            aria-label="Breadcrumb"
            className="flex items-center gap-1.5 text-[13px] font-semibold text-muted-foreground"
          >
            <ChevronLeft className="size-3.5" aria-hidden="true" />
            <Link to="/tasks" className="rounded-sm hover:text-foreground">
              Tasks
            </Link>
            <ChevronRight className="size-3.5" aria-hidden="true" />
            <span className="text-foreground" aria-current="page">
              Task details
            </span>
          </nav>
        }
        title="Task details"
      />
      <EmptyState
        icon={FileSearch}
        tint="var(--status-progress)"
        title="Task details are coming soon"
        description="The description, images and activity history of this task will appear here."
        action={
          <Button variant="outline" asChild>
            <Link to="/tasks">Back to tasks</Link>
          </Button>
        }
      />
    </>
  );
}
