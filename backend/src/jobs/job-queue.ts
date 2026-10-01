import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import {
  JOB_QUEUES,
  QUEUE_NAMES,
  type JobName,
  type JobPayloads,
  type JobProcessor,
  type JobProcessors,
  type QueueName,
} from './job-types';

export const BULL_PREFIX = 'tf:bull';

export interface JobQueue {
  enqueue<N extends JobName>(name: N, payload: JobPayloads[N]): Promise<void>;
  close(): Promise<void>;
}

const QUEUE_ATTEMPTS: Record<QueueName, number> = {
  email: 5,
  media: 5,
  maintenance: 1,
  // A failed tick is simply picked up by the next one a minute later.
  notifications: 1,
};
const JOB_ATTEMPTS: Partial<Record<JobName, number>> = { 'avatar.import': 3 };

/** Production queue backed by Redis. Jobs are retried with exponential backoff. */
export class BullJobQueue implements JobQueue {
  private readonly queues: Map<QueueName, Queue>;

  constructor(connection: Redis) {
    this.queues = new Map(
      QUEUE_NAMES.map((name) => [
        name,
        new Queue(name, {
          connection,
          prefix: BULL_PREFIX,
          defaultJobOptions: {
            attempts: QUEUE_ATTEMPTS[name],
            backoff: { type: 'exponential', delay: 5_000 },
            removeOnComplete: true,
            // Failed email jobs may carry a reset link; it expires in 30 minutes anyway.
            removeOnFail: { age: 60 * 60 },
          },
        }),
      ]),
    );
  }

  queue(name: QueueName): Queue {
    const queue = this.queues.get(name);
    if (!queue) throw new Error(`Unknown queue "${name}"`);
    return queue;
  }

  async enqueue<N extends JobName>(name: N, payload: JobPayloads[N]): Promise<void> {
    const attempts = JOB_ATTEMPTS[name];
    await this.queue(JOB_QUEUES[name]).add(name, payload, attempts ? { attempts } : undefined);
  }

  async close(): Promise<void> {
    await Promise.all([...this.queues.values()].map((queue) => queue.close()));
  }
}

/** Runs jobs synchronously in the calling process — used by tests. */
export class InlineJobQueue implements JobQueue {
  readonly enqueued: Array<{ name: JobName; payload: unknown }> = [];
  private processors: JobProcessors = {};

  setProcessors(processors: JobProcessors): void {
    this.processors = processors;
  }

  async enqueue<N extends JobName>(name: N, payload: JobPayloads[N]): Promise<void> {
    this.enqueued.push({ name, payload });
    const processor = this.processors[name] as JobProcessor<N> | undefined;
    if (processor) await processor(payload);
  }

  async close(): Promise<void> {}
}
