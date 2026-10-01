import { renderEmail, type EmailContent } from './layout';
import { textWithFooter, unsubscribeBlock, type NotificationFooter } from './task-reminder';

/** The default heads-up before a task without reminders of its own is due. */
export function dueSoonEmail(params: {
  firstName: string;
  taskTitle: string;
  due: string;
  status: string;
  taskUrl: string;
  footer: NotificationFooter;
}): EmailContent {
  const greeting = params.firstName ? `Hi ${params.firstName},` : 'Hi,';
  const intro = `"${params.taskTitle}" is due soon.`;
  const details = [
    { label: 'Due', value: params.due },
    { label: 'Status', value: params.status },
  ];

  return {
    subject: `Due soon: ${params.taskTitle}`,
    html: renderEmail({
      preheader: `Due ${params.due}`,
      heading: 'A task is due soon',
      paragraphs: [greeting, intro],
      details,
      button: { label: 'Open the task', url: params.taskUrl },
      unsubscribe: unsubscribeBlock(params.footer),
    }),
    text: textWithFooter(
      [
        greeting,
        '',
        intro,
        '',
        ...details.map((row) => `${row.label}: ${row.value}`),
        '',
        `Open the task: ${params.taskUrl}`,
      ],
      params.footer,
    ),
  };
}
