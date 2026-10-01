import { Worker } from 'bullmq';
import type { Redis } from 'ioredis';
import type { Logger } from '../common/utils/logger';
import { BULL_PREFIX } from './job-queue';
import { QUEUE_NAMES, type JobName, type JobProcessors, type QueueName } from './job-types';

const CONCURRENCY: Record<QueueName, number> = {
  email: 5,
  media: 4,
  maintenance: 1,
  // One tick at a time.
  notifications: 1,
};

export interface WorkerHandle {
  close(): Promise<void>;
}

export function startWorkers(
  connection: Redis,
  processors: JobProcessors,
  logger: Logger,
): WorkerHandle {
  const workers = QUEUE_NAMES.map((queueName) => {
    const worker = new Worker(
      queueName,
      async (job) => {
        const processor = processors[job.name as JobName] as
          ((payload: unknown) => Promise<void>) | undefined;
        if (!processor) throw new Error(`No processor registered for job "${job.name}"`);
        await processor(job.data);
      },
      { connection, prefix: BULL_PREFIX, concurrency: CONCURRENCY[queueName] },
    );
    // Job data is not logged: it can contain email addresses or reset links.
    worker.on('failed', (job, err) =>
      logger.warn({ err, job: job?.name, attempts: job?.attemptsMade }, 'Job failed'),
    );
    worker.on('error', (err) => logger.error({ err }, 'Worker error'));
    return worker;
  });

  logger.info({ queues: QUEUE_NAMES }, 'Background workers started');
  return {
    async close() {
      await Promise.all(workers.map((worker) => worker.close()));
    },
  };
}
