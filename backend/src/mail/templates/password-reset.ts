import { renderEmail, type EmailContent } from './layout';

export function passwordResetEmail(params: {
  firstName: string;
  resetUrl: string;
  ttlMinutes: number;
}): EmailContent {
  const greeting = params.firstName ? `Hi ${params.firstName},` : 'Hi,';
  const intro =
    'We received a request to reset the password for your TaskFlow account. Click the button below to choose a new one.';
  const footnote = `This link expires in ${params.ttlMinutes} minutes and can only be used once. If you didn't request this, you can safely ignore this email — your password won't change.`;

  return {
    subject: 'Reset your TaskFlow password',
    html: renderEmail({
      preheader: 'Use this link to choose a new password.',
      heading: 'Reset your password',
      paragraphs: [greeting, intro],
      button: { label: 'Reset password', url: params.resetUrl },
      footnote,
    }),
    text: [greeting, '', intro, '', `Reset your password: ${params.resetUrl}`, '', footnote].join(
      '\n',
    ),
  };
}
