import { renderEmail, type EmailContent } from './layout';

export function emailChangeCodeEmail(params: {
  firstName: string;
  code: string;
  ttlMinutes: number;
}): EmailContent {
  const greeting = params.firstName ? `Hi ${params.firstName},` : 'Hi,';
  const intro =
    'Someone asked to use this address for a TaskFlow account. Enter this code to confirm it:';
  const footnote = `The code expires in ${params.ttlMinutes} minutes. Never share it with anyone. If you didn't ask for this, ignore this email and nothing will change.`;

  return {
    subject: `${params.code} is your TaskFlow verification code`,
    html: renderEmail({
      preheader: `Your verification code is ${params.code}.`,
      heading: 'Confirm your new email',
      paragraphs: [greeting, intro],
      code: params.code,
      footnote,
    }),
    text: [greeting, '', intro, '', params.code, '', footnote].join('\n'),
  };
}
