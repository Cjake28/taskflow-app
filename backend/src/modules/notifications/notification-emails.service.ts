import type { NotificationType } from '@taskflow/shared';
import type { Db } from '../../database/prisma';
import type { Prisma } from '../../generated/prisma/client';
import type { MailTransport } from '../../mail/mail.transport';
import { dailyDigestEmail, type DigestItem } from '../../mail/templates/daily-digest';
import { dueSoonEmail } from '../../mail/templates/due-soon';
import type { EmailContent } from '../../mail/templates/layout';
import { newSignInEmail } from '../../mail/templates/new-sign-in';
import { taskReminderEmail, type NotificationFooter } from '../../mail/templates/task-reminder';
import { formatDay, formatDue, formatMoment, statusLabel } from './format';
import {
  channelsFor,
  type NotificationPreferencesService,
} from './notification-preferences.service';
import type { UnsubscribeTokens } from './unsubscribe-tokens';

const EMAIL_INCLUDE = {
  user: { select: { email: true, firstName: true } },
  task: { select: { id: true, title: true, status: true, dueDate: true, hasDueTime: true } },
} satisfies Prisma.NotificationInclude;

type NotificationWithContext = Prisma.NotificationGetPayload<{ include: typeof EMAIL_INCLUDE }>;

interface DigestData {
  date?: string;
  dueToday?: number;
  overdue?: number;
  tasks?: Array<{
    id: string;
    title: string;
    dueDate: string;
    hasDueTime: boolean;
    overdue: boolean;
  }>;
}

interface SignInData {
  device?: string;
  ip?: string | null;
  at?: string;
}

const REASONS: Record<NotificationType, string> = {
  TASK_REMINDER: 'You get this because task reminder emails are on.',
  DUE_SOON: 'You get this because "due soon" emails are on.',
  DAILY_DIGEST: 'You get this because the daily summary email is on.',
  NEW_SIGN_IN: 'You get this because new sign-in emails are on.',
};

/** Renders and sends the email for one stored notification (the `email.notification` job). */
export class NotificationEmailsService {
  constructor(
    private readonly prisma: Db,
    private readonly transport: MailTransport,
    private readonly preferences: NotificationPreferencesService,
    private readonly tokens: UnsubscribeTokens,
    private readonly config: { frontendUrl: string },
  ) {}

  async send(notificationId: string): Promise<void> {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
      include: EMAIL_INCLUDE,
    });
    if (!notification) return;

    const prefs = await this.preferences.get(notification.userId);
    // The user may have turned the email off after it was queued.
    if (!channelsFor(prefs, notification.type).email) return;

    const footer = this.footer(notification.userId, notification.type);
    const content = this.render(notification, prefs.timezone, footer);
    if (!content) return;

    await this.transport.send({
      to: notification.user.email,
      ...content,
      headers: {
        // One-click unsubscribe (RFC 8058) for mail clients that support it.
        'List-Unsubscribe': `<${this.url(`/api/v1/notifications/unsubscribe/one-click?token=${this.tokens.sign(notification.userId, notification.type)}`)}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    });
  }

  private render(
    notification: NotificationWithContext,
    timeZone: string,
    footer: NotificationFooter,
  ): EmailContent | null {
    const firstName = notification.user.firstName;
    const task = notification.task;
    switch (notification.type) {
      case 'TASK_REMINDER': {
        if (!task) return null;
        const data = (notification.data ?? {}) as { message?: string | null };
        return taskReminderEmail({
          firstName,
          taskTitle: task.title,
          message: data.message ?? null,
          due: formatDue(task, timeZone),
          status: statusLabel(task.status),
          taskUrl: this.url(`/tasks/${task.id}`),
          footer,
        });
      }
      case 'DUE_SOON': {
        if (!task?.dueDate) return null;
        return dueSoonEmail({
          firstName,
          taskTitle: task.title,
          due: formatDue(task, timeZone)!,
          status: statusLabel(task.status),
          taskUrl: this.url(`/tasks/${task.id}`),
          footer,
        });
      }
      case 'DAILY_DIGEST': {
        const data = (notification.data ?? {}) as DigestData;
        const tasks = data.tasks ?? [];
        const items: DigestItem[] = tasks.map((item) => {
          const due = { dueDate: new Date(item.dueDate), hasDueTime: item.hasDueTime };
          return {
            title: item.title,
            when: item.overdue
              ? `Overdue · was due ${formatDue(due, timeZone)}`
              : `Due ${formatDue(due, timeZone)}`,
            url: this.url(`/tasks/${item.id}`),
            overdue: item.overdue,
          };
        });
        const total = (data.dueToday ?? 0) + (data.overdue ?? 0);
        return dailyDigestEmail({
          firstName,
          day: formatDay(notification.createdAt, timeZone),
          dueToday: data.dueToday ?? 0,
          overdue: data.overdue ?? 0,
          items,
          moreCount: Math.max(0, total - items.length),
          dashboardUrl: this.url('/dashboard'),
          footer,
        });
      }
      case 'NEW_SIGN_IN': {
        const data = (notification.data ?? {}) as SignInData;
        return newSignInEmail({
          firstName,
          device: data.device ?? 'Unknown device',
          ip: data.ip ?? null,
          when: formatMoment(data.at ? new Date(data.at) : notification.createdAt, timeZone),
          securityUrl: this.url('/profile?tab=security'),
          footer,
        });
      }
    }
  }

  private footer(userId: string, type: NotificationType): NotificationFooter {
    return {
      reason: REASONS[type],
      unsubscribeUrl: this.url(`/unsubscribe?token=${this.tokens.sign(userId, type)}`),
      settingsUrl: this.url('/profile?tab=notifications'),
    };
  }

  private url(path: string): string {
    return new URL(path, this.config.frontendUrl).toString();
  }
}
