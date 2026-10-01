import { renderEmail, type EmailContent } from './layout';
import { textWithFooter, unsubscribeBlock, type NotificationFooter } from './task-reminder';

/** Sent when an account signs in from a browser it has not used before. */
export function newSignInEmail(params: {
  firstName: string;
  device: string;
  ip: string | null;
  when: string;
  securityUrl: string;
  footer: NotificationFooter;
}): EmailContent {
  const greeting = params.firstName ? `Hi ${params.firstName},` : 'Hi,';
  const intro = 'Your TaskFlow account was just signed in from a new browser or device.';
  const footnote =
    "If this was you, there's nothing to do. If it wasn't, change your password and sign out the other devices from your security settings.";
  const details = [
    { label: 'Device', value: params.device },
    ...(params.ip ? [{ label: 'IP address', value: params.ip }] : []),
    { label: 'When', value: params.when },
  ];

  return {
    subject: `New sign-in to TaskFlow from ${params.device}`,
    html: renderEmail({
      preheader: `${params.device} · ${params.when}`,
      heading: 'New sign-in to your account',
      paragraphs: [greeting, intro],
      details,
      button: { label: 'Review your sessions', url: params.securityUrl },
      footnote,
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
        `Review your sessions: ${params.securityUrl}`,
        '',
        footnote,
      ],
      params.footer,
    ),
  };
}
