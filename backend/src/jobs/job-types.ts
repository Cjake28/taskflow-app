export type QueueName = 'email' | 'media' | 'maintenance';

export const QUEUE_NAMES: readonly QueueName[] = ['email', 'media', 'maintenance'];

/** Every background job and the payload it carries. */
export interface JobPayloads {
  'email.password-reset-request': { email: string };
  'email.password-changed': { userId: string };
  'email.verify-email': { userId: string };
  'email.signup-otp': { registrationId: string };
  'avatar.import': { userId: string; url: string };
  'storage.delete': { keys: string[] };
  'images.purge': Record<string, never>;
  'storage.orphan-sweep': Record<string, never>;
  'auth.cleanup': Record<string, never>;
}

export type JobName = keyof JobPayloads;

export const JOB_QUEUES: Record<JobName, QueueName> = {
  'email.password-reset-request': 'email',
  'email.password-changed': 'email',
  'email.verify-email': 'email',
  'email.signup-otp': 'email',
  'avatar.import': 'media',
  'storage.delete': 'media',
  'images.purge': 'maintenance',
  'storage.orphan-sweep': 'maintenance',
  'auth.cleanup': 'maintenance',
};

export type JobProcessor<N extends JobName> = (payload: JobPayloads[N]) => Promise<void>;
export type JobProcessors = { [N in JobName]?: JobProcessor<N> };
