import { useId, useState, type CSSProperties, type ReactNode } from 'react';
import {
  DUE_SOON_LEAD_OPTIONS,
  NOTIFICATION_TYPE_LABELS,
  type NotificationChannel,
  type NotificationPreferencesDto,
  type NotificationType,
  type UpdateNotificationPreferencesInput,
} from '@taskflow/shared';
import { Clock3, Globe2, Hourglass } from 'lucide-react';

import { ErrorState } from '@/components/common/error-state';
import { FormField } from '@/components/common/form-field';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { formatClock, timeOptions } from '@/features/tasks/format';
import {
  useNotificationPreferences,
  useUpdateNotificationPreferences,
} from '@/features/notifications/hooks';
import { NOTIFICATION_META } from '@/features/notifications/lib/notification-meta';
import {
  deviceTimeZone,
  formatTimeZone,
  timeZoneOptions,
} from '@/features/notifications/lib/time-zones';
import { formatBefore } from '@/lib/offsets';

import { ProfileCard } from './profile-card';

/** The preference group for each notification type. */
const GROUPS: Record<NotificationType, 'taskReminder' | 'dueSoon' | 'dailyDigest' | 'newSignIn'> = {
  TASK_REMINDER: 'taskReminder',
  DUE_SOON: 'dueSoon',
  DAILY_DIGEST: 'dailyDigest',
  NEW_SIGN_IN: 'newSignIn',
};

const ROWS: NotificationType[] = ['TASK_REMINDER', 'DUE_SOON', 'DAILY_DIGEST', 'NEW_SIGN_IN'];

const CHANNEL_LABELS: Record<NotificationChannel, string> = { inApp: 'In app', email: 'Email' };
const CHANNELS: NotificationChannel[] = ['inApp', 'email'];

type Save = (input: UpdateNotificationPreferencesInput) => void;

function SettingsSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="grid items-start gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]"
    >
      <div className="rounded-card bg-card p-5 shadow-card sm:p-[22px]">
        <Skeleton className="mb-5 h-4 w-32 rounded-full" />
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="flex items-center gap-4 border-t border-border py-4">
            <div className="flex-1">
              <Skeleton className="h-3.5 w-32 rounded-full" />
              <Skeleton className="mt-2 h-3 w-3/4 rounded-full" />
            </div>
            <Skeleton className="h-6 w-10 rounded-full" />
            <Skeleton className="h-6 w-10 rounded-full" />
          </div>
        ))}
      </div>
      <div className="rounded-card bg-card p-5 shadow-card sm:p-[22px]">
        <Skeleton className="mb-4 h-4 w-24 rounded-full" />
        <Skeleton className="h-10 w-full rounded-input" />
      </div>
    </div>
  );
}

function TypeRow({
  type,
  preferences,
  save,
  extra,
}: {
  type: NotificationType;
  preferences: NotificationPreferencesDto;
  save: Save;
  extra?: ReactNode;
}) {
  const meta = NOTIFICATION_META[type];
  const Icon = meta.icon;
  const group = GROUPS[type];
  const label = NOTIFICATION_TYPE_LABELS[type];
  const descriptionId = useId();

  return (
    <li className="flex items-start gap-3 border-t border-border py-4 first:border-t-0 first:pt-1 sm:gap-4">
      <span
        aria-hidden="true"
        style={{ '--tint': meta.tint } as CSSProperties}
        className="mt-0.5 hidden size-9 shrink-0 place-items-center rounded-full bg-tint-soft text-tint min-[400px]:grid"
      >
        <Icon className="size-[17px]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold">{label}</p>
        <p id={descriptionId} className="mt-0.5 text-[13px] leading-normal text-muted-foreground">
          {meta.description}
        </p>
        {extra ? <div className="mt-2.5">{extra}</div> : null}
      </div>
      {CHANNELS.map((channel) => (
        <div key={channel} className="flex w-14 shrink-0 justify-center pt-1.5">
          <Switch
            checked={preferences[group][channel]}
            onCheckedChange={(checked) => save({ [group]: { [channel]: checked } })}
            aria-label={`${label}: ${CHANNEL_LABELS[channel]}`}
            aria-describedby={descriptionId}
          />
        </div>
      ))}
    </li>
  );
}

/** Free-text zone picker with suggestions; only a known zone is saved. */
function TimeZonePicker({ value, save }: { value: string; save: Save }) {
  const [text, setText] = useState(value.replaceAll('_', ' '));
  const [error, setError] = useState<string | undefined>();
  const listId = useId();
  const zones = timeZoneOptions();

  const commit = (raw: string) => {
    const zone = zones.find(
      (candidate) => candidate.toLowerCase() === raw.trim().replaceAll(' ', '_').toLowerCase(),
    );
    if (!zone) {
      setError('Choose a time zone from the list, e.g. Asia/Manila');
      return false;
    }
    setError(undefined);
    if (zone !== value) save({ timezone: zone });
    return true;
  };

  return (
    <FormField
      label="Time zone"
      error={error}
      hint={error ? undefined : formatTimeZone(value)}
      after={
        <datalist id={listId}>
          {zones.map((zone) => (
            <option key={zone} value={zone.replaceAll('_', ' ')} />
          ))}
        </datalist>
      }
    >
      <Input
        startIcon={<Globe2 />}
        list={listId}
        value={text}
        autoComplete="off"
        spellCheck={false}
        placeholder="Search, e.g. Manila"
        onChange={(event) => {
          setText(event.target.value);
          // Picking a suggestion fills in the whole name: save it right away.
          if (zones.includes(event.target.value.replaceAll(' ', '_'))) commit(event.target.value);
        }}
        onBlur={() => {
          if (text.trim()) commit(text);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit(text);
          }
        }}
      />
    </FormField>
  );
}

function TimeZoneCard({
  preferences,
  save,
}: {
  preferences: NotificationPreferencesDto;
  save: Save;
}) {
  const device = deviceTimeZone();
  const switchId = useId();
  return (
    <ProfileCard
      title="Time zone"
      description="Used for your daily summary and for reminders on tasks without a time."
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <label htmlFor={switchId} className="cursor-pointer text-sm font-bold">
            Use this device&apos;s time zone
          </label>
          <p className="mt-0.5 text-[13px] text-muted-foreground">{formatTimeZone(device)}</p>
        </div>
        <Switch
          id={switchId}
          checked={preferences.timezoneAuto}
          onCheckedChange={(checked) =>
            save(checked ? { timezoneAuto: true, timezone: device } : { timezoneAuto: false })
          }
        />
      </div>
      {preferences.timezoneAuto ? null : (
        <div className="mt-4">
          <TimeZonePicker key={preferences.timezone} value={preferences.timezone} save={save} />
        </div>
      )}
    </ProfileCard>
  );
}

/** Profile → Notifications: where each kind of notification goes, and the time zone. */
export function NotificationSettings() {
  const preferences = useNotificationPreferences();
  const update = useUpdateNotificationPreferences();
  const leadId = useId();
  const digestTimeId = useId();

  if (preferences.isPending) return <SettingsSkeleton />;
  if (preferences.isError) {
    return (
      <ErrorState
        title="Couldn't load your notification settings"
        error={preferences.error}
        retrying={preferences.isFetching}
        onRetry={() => void preferences.refetch()}
      />
    );
  }

  const data = preferences.data;
  const save: Save = (input) => update.mutate(input);

  const extras: Partial<Record<NotificationType, ReactNode>> = {
    DUE_SOON: (
      <div className="flex max-w-60 flex-col gap-1">
        <label htmlFor={leadId} className="text-xs font-bold text-muted-foreground">
          Remind me
        </label>
        <NativeSelect
          id={leadId}
          compact
          startIcon={<Hourglass />}
          value={data.dueSoon.leadMinutes}
          onChange={(event) => save({ dueSoon: { leadMinutes: Number(event.target.value) } })}
        >
          {DUE_SOON_LEAD_OPTIONS.map((minutes) => (
            <option key={minutes} value={minutes}>
              {formatBefore(minutes)}
            </option>
          ))}
        </NativeSelect>
      </div>
    ),
    DAILY_DIGEST: (
      <div className="flex max-w-60 flex-col gap-1">
        <label htmlFor={digestTimeId} className="text-xs font-bold text-muted-foreground">
          Send at
        </label>
        <NativeSelect
          id={digestTimeId}
          compact
          startIcon={<Clock3 />}
          value={data.dailyDigest.time}
          onChange={(event) => save({ dailyDigest: { time: event.target.value } })}
        >
          {timeOptions(data.dailyDigest.time).map((slot) => (
            <option key={slot} value={slot}>
              {formatClock(slot)}
            </option>
          ))}
        </NativeSelect>
      </div>
    ),
  };

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <ProfileCard
        title="Notifications"
        description="Choose what TaskFlow tells you about, and where. Changes are saved right away."
      >
        <div
          aria-hidden="true"
          className="flex justify-end border-b border-border pb-2 text-[11.5px] font-bold tracking-[0.06em] text-muted-foreground uppercase"
        >
          {CHANNELS.map((channel) => (
            <span key={channel} className="w-14 text-center">
              {CHANNEL_LABELS[channel]}
            </span>
          ))}
        </div>
        <ul aria-label="Notification types" className="flex flex-col pt-3">
          {ROWS.map((type) => (
            <TypeRow key={type} type={type} preferences={data} save={save} extra={extras[type]} />
          ))}
        </ul>
      </ProfileCard>
      <TimeZoneCard preferences={data} save={save} />
    </div>
  );
}
