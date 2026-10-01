import { z } from 'zod';
import {
  DUE_SOON_LEAD_OPTIONS,
  NOTIFICATION_LIMITS,
  REMINDER_LIMITS,
} from '../constants/notification';

const TIME_OF_DAY_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** True for IANA zone names this runtime knows, e.g. `Asia/Manila`. */
export function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export const timeZoneSchema = z
  .string({ error: 'Choose a time zone' })
  .trim()
  .min(1, { error: 'Choose a time zone', abort: true })
  .max(64, 'Choose a valid time zone')
  .refine(isValidTimeZone, 'Choose a valid time zone');

/** `HH:mm`, 24-hour. */
export const timeOfDaySchema = z
  .string({ error: 'Choose a time' })
  .regex(TIME_OF_DAY_PATTERN, 'Choose a valid time');

/** Empty or whitespace-only messages are stored as null. */
const reminderMessageSchema = z
  .string()
  .trim()
  .max(
    REMINDER_LIMITS.message,
    `A reminder message must be at most ${REMINDER_LIMITS.message} characters`,
  )
  .transform((value) => (value.length === 0 ? null : value))
  .nullable()
  .optional();

/**
 * One reminder on a task. `relative` counts back from the due time (and follows it when the due
 * date changes); `absolute` fires at a fixed moment. `id` keeps an existing reminder (and whether
 * it was already sent) when a task is edited.
 */
export const reminderInputSchema = z.discriminatedUnion(
  'kind',
  [
    z.strictObject({
      id: z.uuid('Invalid reminder id').optional(),
      kind: z.literal('relative'),
      offsetMinutes: z
        .number({ error: 'Choose when to be reminded' })
        .int('Choose when to be reminded')
        .min(0, 'Choose when to be reminded')
        .max(REMINDER_LIMITS.maxOffsetMinutes, 'A reminder can be at most 30 days before'),
      message: reminderMessageSchema,
    }),
    z.strictObject({
      id: z.uuid('Invalid reminder id').optional(),
      kind: z.literal('absolute'),
      remindAt: z.iso.datetime({ offset: true, error: 'Enter a valid reminder time' }),
      message: reminderMessageSchema,
    }),
  ],
  { error: 'Choose a reminder type' },
);

export type ReminderInput = z.input<typeof reminderInputSchema>;
export type ReminderData = z.output<typeof reminderInputSchema>;

const reminderKey = (reminder: ReminderData) =>
  reminder.kind === 'relative'
    ? `relative:${reminder.offsetMinutes}`
    : `absolute:${new Date(reminder.remindAt).getTime()}`;

/** The full set of a task's reminders; on update it replaces the current set. */
export const remindersSchema = z
  .array(reminderInputSchema)
  .max(REMINDER_LIMITS.perTask, `A task can have at most ${REMINDER_LIMITS.perTask} reminders`)
  .superRefine((reminders, ctx) => {
    const seen = new Set<string>();
    reminders.forEach((reminder, index) => {
      const key = reminderKey(reminder);
      if (seen.has(key)) {
        ctx.addIssue({ code: 'custom', path: [index], message: 'This reminder is already set' });
      }
      seen.add(key);
    });
  });

const channelPatchSchema = z.strictObject({
  inApp: z.boolean().optional(),
  email: z.boolean().optional(),
});

const leadMinutesSchema = z
  .number()
  .int()
  .refine(
    (value) => (DUE_SOON_LEAD_OPTIONS as readonly number[]).includes(value),
    'Choose a valid lead time',
  );

/** `PATCH /notifications/preferences`: any subset of the settings. */
export const updateNotificationPreferencesSchema = z
  .strictObject({
    timezone: timeZoneSchema.optional(),
    /** Follow the time zone of the device the user is on. */
    timezoneAuto: z.boolean().optional(),
    taskReminder: channelPatchSchema.optional(),
    dueSoon: z
      .strictObject({
        inApp: z.boolean().optional(),
        email: z.boolean().optional(),
        leadMinutes: leadMinutesSchema.optional(),
      })
      .optional(),
    dailyDigest: z
      .strictObject({
        inApp: z.boolean().optional(),
        email: z.boolean().optional(),
        time: timeOfDaySchema.optional(),
      })
      .optional(),
    newSignIn: channelPatchSchema.optional(),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    path: [],
    message: 'Provide at least one setting to update',
  });

export type UpdateNotificationPreferencesInput = z.input<
  typeof updateNotificationPreferencesSchema
>;
export type UpdateNotificationPreferencesData = z.output<
  typeof updateNotificationPreferencesSchema
>;

/** `GET /notifications`: newest first, paged by cursor (the last id of the previous page). */
export const listNotificationsQuerySchema = z.object({
  cursor: z.uuid('Invalid cursor').optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(NOTIFICATION_LIMITS.pageSizeMax)
    .default(NOTIFICATION_LIMITS.pageSizeDefault),
  unread: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});

export type ListNotificationsQuery = z.output<typeof listNotificationsQuerySchema>;

/** `POST /notifications/read`: the given ids, or every notification when `ids` is left out. */
export const markNotificationsReadSchema = z.strictObject({
  ids: z
    .array(z.uuid('Invalid notification id'))
    .min(1, 'Provide at least one notification id')
    .max(NOTIFICATION_LIMITS.markReadMax)
    .optional(),
});

export type MarkNotificationsReadData = z.output<typeof markNotificationsReadSchema>;

/** `POST /notifications/unsubscribe`: the signed token from an email's unsubscribe link. */
export const unsubscribeSchema = z.strictObject({
  token: z.string({ error: 'Missing token' }).min(16, 'Invalid token').max(512, 'Invalid token'),
});

export type UnsubscribeData = z.output<typeof unsubscribeSchema>;
