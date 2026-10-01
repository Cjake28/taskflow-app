import type {
  NotificationChannelPreferences,
  NotificationPreferencesDto,
  NotificationType,
  UpdateNotificationPreferencesData,
} from '@taskflow/shared';
import type { Db, Tx } from '../../database/prisma';
import type { NotificationPreference, Prisma } from '../../generated/prisma/client';

export type PreferenceRecord = Omit<NotificationPreference, 'updatedAt'>;
type PreferenceColumns = Omit<PreferenceRecord, 'userId' | 'lastDigestOn'>;

/** What a user without a saved row gets (same as the column defaults). */
export const DEFAULT_PREFERENCES: PreferenceColumns = {
  timezone: 'UTC',
  timezoneAuto: true,
  taskReminderInApp: true,
  taskReminderEmail: true,
  dueSoonInApp: true,
  dueSoonEmail: true,
  dueSoonLeadMinutes: 60,
  dailyDigestInApp: true,
  dailyDigestEmail: true,
  dailyDigestTime: '08:00',
  newSignInInApp: true,
  newSignInEmail: true,
};

const CHANNEL_COLUMNS = {
  TASK_REMINDER: { inApp: 'taskReminderInApp', email: 'taskReminderEmail' },
  DUE_SOON: { inApp: 'dueSoonInApp', email: 'dueSoonEmail' },
  DAILY_DIGEST: { inApp: 'dailyDigestInApp', email: 'dailyDigestEmail' },
  NEW_SIGN_IN: { inApp: 'newSignInInApp', email: 'newSignInEmail' },
} as const satisfies Record<
  NotificationType,
  { inApp: keyof PreferenceColumns; email: keyof PreferenceColumns }
>;

/** The patch keys of the API, by notification type. */
const PATCH_KEYS = {
  TASK_REMINDER: 'taskReminder',
  DUE_SOON: 'dueSoon',
  DAILY_DIGEST: 'dailyDigest',
  NEW_SIGN_IN: 'newSignIn',
} as const satisfies Record<NotificationType, keyof UpdateNotificationPreferencesData>;

export function channelsFor(
  prefs: PreferenceColumns,
  type: NotificationType,
): NotificationChannelPreferences {
  const columns = CHANNEL_COLUMNS[type];
  return { inApp: prefs[columns.inApp] as boolean, email: prefs[columns.email] as boolean };
}

/** Prisma filter: the user wants this type on at least one channel (or has no saved row). */
export function wantsType(type: NotificationType): Prisma.UserWhereInput {
  const columns = CHANNEL_COLUMNS[type];
  return {
    OR: [
      { notificationPreference: null },
      { notificationPreference: { [columns.inApp]: true } },
      { notificationPreference: { [columns.email]: true } },
    ],
  };
}

export function toPreferencesResponse(prefs: PreferenceColumns): NotificationPreferencesDto {
  return {
    timezone: prefs.timezone,
    timezoneAuto: prefs.timezoneAuto,
    taskReminder: channelsFor(prefs, 'TASK_REMINDER'),
    dueSoon: { ...channelsFor(prefs, 'DUE_SOON'), leadMinutes: prefs.dueSoonLeadMinutes },
    dailyDigest: { ...channelsFor(prefs, 'DAILY_DIGEST'), time: prefs.dailyDigestTime },
    newSignIn: channelsFor(prefs, 'NEW_SIGN_IN'),
  };
}

function toColumns(patch: UpdateNotificationPreferencesData): Partial<PreferenceColumns> {
  const data: Partial<PreferenceColumns> = {};
  if (patch.timezone !== undefined) data.timezone = patch.timezone;
  if (patch.timezoneAuto !== undefined) data.timezoneAuto = patch.timezoneAuto;
  for (const [type, key] of Object.entries(PATCH_KEYS) as Array<
    [NotificationType, (typeof PATCH_KEYS)[NotificationType]]
  >) {
    const channels = patch[key];
    if (!channels) continue;
    const columns = CHANNEL_COLUMNS[type];
    if (channels.inApp !== undefined) data[columns.inApp] = channels.inApp;
    if (channels.email !== undefined) data[columns.email] = channels.email;
  }
  if (patch.dueSoon?.leadMinutes !== undefined) data.dueSoonLeadMinutes = patch.dueSoon.leadMinutes;
  if (patch.dailyDigest?.time !== undefined) data.dailyDigestTime = patch.dailyDigest.time;
  return data;
}

export class NotificationPreferencesService {
  constructor(private readonly prisma: Db) {}

  /** The saved settings, or the defaults when the user never changed them. */
  async get(userId: string, db: Db | Tx = this.prisma): Promise<PreferenceRecord> {
    const row = await db.notificationPreference.findUnique({
      where: { userId },
      omit: { updatedAt: true },
    });
    return row ?? { userId, lastDigestOn: null, ...DEFAULT_PREFERENCES };
  }

  async timezoneOf(userId: string, db: Db | Tx = this.prisma): Promise<string> {
    const row = await db.notificationPreference.findUnique({
      where: { userId },
      select: { timezone: true },
    });
    return row?.timezone ?? DEFAULT_PREFERENCES.timezone;
  }

  async getResponse(userId: string): Promise<NotificationPreferencesDto> {
    return toPreferencesResponse(await this.get(userId));
  }

  async update(
    userId: string,
    patch: UpdateNotificationPreferencesData,
  ): Promise<NotificationPreferencesDto> {
    const data = toColumns(patch);
    const saved = await this.prisma.notificationPreference.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
    return toPreferencesResponse(saved);
  }

  /** Turns off email for one type (unsubscribe links). */
  async disableEmail(userId: string, type: NotificationType): Promise<void> {
    const column = CHANNEL_COLUMNS[type].email;
    await this.prisma.notificationPreference.upsert({
      where: { userId },
      create: { userId, [column]: false },
      update: { [column]: false },
    });
  }
}
