export type QueueName = 'email' | 'media' | 'maintenance' | 'notifications';

export const QUEUE_NAMES: readonly QueueName[] = ['email', 'media', 'maintenance', 'notifications'];

/** Every background job and the payload it carries. */
export interface JobPayloads {
  'email.password-reset-request': { email: string };
  'email.password-changed': { userId: string };
  'email.email-change-otp': { userId: string };
  'email.email-changed': { userId: string; previousEmail: string };
  'email.signup-otp': { registrationId: string };
  'email.notification': { notificationId: string };
  'avatar.import': { userId: string; url: string };
  'storage.delete': { keys: string[] };
  'images.purge': Record<string, never>;
  'storage.orphan-sweep': Record<string, never>;
  'auth.cleanup': Record<string, never>;
  'notifications.tick': Record<string, never>;
  'notifications.cleanup': Record<string, never>;
}

export type JobName = keyof JobPayloads;

export const JOB_QUEUES: Record<JobName, QueueName> = {
  'email.password-reset-request': 'email',
  'email.password-changed': 'email',
  'email.email-change-otp': 'email',
  'email.email-changed': 'email',
  'email.signup-otp': 'email',
  'email.notification': 'email',
  'avatar.import': 'media',
  'storage.delete': 'media',
  'images.purge': 'maintenance',
  'storage.orphan-sweep': 'maintenance',
  'auth.cleanup': 'maintenance',
  // Its own queue, so a long maintenance job never delays the per-minute tick.
  'notifications.tick': 'notifications',
  'notifications.cleanup': 'maintenance',
};

export type JobProcessor<N extends JobName> = (payload: JobPayloads[N]) => Promise<void>;
export type JobProcessors = { [N in JobName]?: JobProcessor<N> };
