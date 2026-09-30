import type { BullJobQueue } from './job-queue';
import type { JobName } from './job-types';

/** Cron patterns use seconds precision: `sec min hour day month weekday`. */
export const SCHEDULES: Array<{ job: JobName; pattern: string }> = [
  { job: 'auth.cleanup', pattern: '0 0 4 * * *' },
];

export async function registerSchedules(queue: BullJobQueue): Promise<void> {
  for (const { job, pattern } of SCHEDULES) {
    await queue.queue('maintenance').upsertJobScheduler(job, { pattern }, { name: job, data: {} });
  }
}
