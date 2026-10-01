import type { BullJobQueue } from './job-queue';
import { JOB_QUEUES, type JobName } from './job-types';

/** Cron patterns use seconds precision: `sec min hour day month weekday`. */
export const SCHEDULES: Array<{ job: JobName; pattern: string }> = [
  { job: 'images.purge', pattern: '0 0 3 * * *' },
  { job: 'storage.orphan-sweep', pattern: '0 30 3 * * *' },
  { job: 'auth.cleanup', pattern: '0 0 4 * * *' },
  { job: 'notifications.cleanup', pattern: '0 15 4 * * *' },
  { job: 'notifications.tick', pattern: '0 * * * * *' },
];

export async function registerSchedules(queue: BullJobQueue): Promise<void> {
  for (const { job, pattern } of SCHEDULES) {
    await queue
      .queue(JOB_QUEUES[job])
      .upsertJobScheduler(job, { pattern }, { name: job, data: {} });
  }
}
