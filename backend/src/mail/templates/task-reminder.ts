import { renderEmail, type EmailContent } from './layout';

export interface NotificationFooter {
  reason: string;
  unsubscribeUrl: string;
  settingsUrl: string;
}

const footerText = (footer: NotificationFooter) =>
  `${footer.reason}\nUnsubscribe: ${footer.unsubscribeUrl}\nSettings: ${footer.settingsUrl}`;

export const unsubscribeBlock = (footer: NotificationFooter) => ({
  reason: footer.reason,
  url: footer.unsubscribeUrl,
  settingsUrl: footer.settingsUrl,
});

export function textWithFooter(lines: string[], footer: NotificationFooter): string {
  return [...lines, '', '—', footerText(footer)].join('\n');
}

/** A reminder the user set on a task, with their own message when there is one. */
export function taskReminderEmail(params: {
  firstName: string;
  taskTitle: string;
  message: string | null;
  due: string | null;
  status: string;
  taskUrl: string;
  footer: NotificationFooter;
}): EmailContent {
  const greeting = params.firstName ? `Hi ${params.firstName},` : 'Hi,';
  const intro = `This is your reminder for "${params.taskTitle}".`;
  const details = [
    ...(params.due ? [{ label: 'Due', value: params.due }] : []),
    { label: 'Status', value: params.status },
  ];

  return {
    subject: `Reminder: ${params.taskTitle}`,
    html: renderEmail({
      preheader: params.message ?? (params.due ? `Due ${params.due}` : intro),
      heading: params.taskTitle,
      paragraphs: [greeting, intro],
      ...(params.message ? { quote: params.message } : {}),
      details,
      button: { label: 'Open the task', url: params.taskUrl },
      unsubscribe: unsubscribeBlock(params.footer),
    }),
    text: textWithFooter(
      [
        greeting,
        '',
        intro,
        ...(params.message ? ['', `"${params.message}"`] : []),
        '',
        ...details.map((row) => `${row.label}: ${row.value}`),
        '',
        `Open the task: ${params.taskUrl}`,
      ],
      params.footer,
    ),
  };
}
