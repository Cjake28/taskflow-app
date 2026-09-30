import { renderEmail, type EmailContent } from './layout';

export function verifyEmailEmail(params: {
  firstName: string;
  verifyUrl: string;
  ttlHours: number;
}): EmailContent {
  const greeting = params.firstName ? `Hi ${params.firstName},` : 'Hi,';
  const intro =
    'Please confirm that this is your email address so we can reach you about your TaskFlow account.';
  const footnote = `This link expires in ${params.ttlHours} hours. If you didn't create a TaskFlow account, you can ignore this email.`;

  return {
    subject: 'Confirm your email for TaskFlow',
    html: renderEmail({
      preheader: 'Confirm your email address.',
      heading: 'Confirm your email',
      paragraphs: [greeting, intro],
      button: { label: 'Confirm email', url: params.verifyUrl },
      footnote,
    }),
    text: [greeting, '', intro, '', `Confirm your email: ${params.verifyUrl}`, '', footnote].join(
      '\n',
    ),
  };
}
