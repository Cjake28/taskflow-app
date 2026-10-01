import { renderEmail, type EmailContent } from './layout';
import { textWithFooter, unsubscribeBlock, type NotificationFooter } from './task-reminder';

export interface DigestItem {
  title: string;
  /** e.g. "Overdue · was due Tue, Sep 29" or "Today, 2:00 PM". */
  when: string;
  url: string;
  overdue: boolean;
}

/** The daily summary at the user's chosen time: what is due today and what is overdue. */
export function dailyDigestEmail(params: {
  firstName: string;
  day: string;
  dueToday: number;
  overdue: number;
  items: DigestItem[];
  moreCount: number;
  dashboardUrl: string;
  footer: NotificationFooter;
}): EmailContent {
  const greeting = params.firstName ? `Hi ${params.firstName},` : 'Hi,';
  const counts = [
    params.dueToday > 0
      ? `${params.dueToday} ${params.dueToday === 1 ? 'task' : 'tasks'} due today`
      : null,
    params.overdue > 0 ? `${params.overdue} overdue` : null,
  ]
    .filter(Boolean)
    .join(' and ');
  const summary = `You have ${counts}.`;
  const more = params.moreCount > 0 ? [`And ${params.moreCount} more in TaskFlow.`] : [];

  return {
    subject: `Your day in TaskFlow: ${counts}`,
    html: renderEmail({
      preheader: summary,
      heading: `Your day · ${params.day}`,
      paragraphs: [greeting, summary],
      items: params.items.map((item) => ({
        title: item.title,
        meta: item.when,
        url: item.url,
        urgent: item.overdue,
      })),
      button: { label: 'Open your dashboard', url: params.dashboardUrl },
      ...(more.length > 0 ? { footnote: more[0] } : {}),
      unsubscribe: unsubscribeBlock(params.footer),
    }),
    text: textWithFooter(
      [
        greeting,
        '',
        summary,
        '',
        ...params.items.map((item) => `- ${item.title} (${item.when}): ${item.url}`),
        ...more,
        '',
        `Open your dashboard: ${params.dashboardUrl}`,
      ],
      params.footer,
    ),
  };
}
