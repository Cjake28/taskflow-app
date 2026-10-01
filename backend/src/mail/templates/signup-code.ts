import { renderEmail, type EmailContent } from './layout';

export function signupCodeEmail(params: {
  firstName: string;
  code: string;
  ttlMinutes: number;
}): EmailContent {
  const greeting = params.firstName ? `Hi ${params.firstName},` : 'Hi,';
  const intro = 'Use this code to confirm your email and finish creating your TaskFlow account:';
  const footnote = `The code expires in ${params.ttlMinutes} minutes. Never share it with anyone. If you didn't sign up for TaskFlow, you can ignore this email and no account will be created.`;

  return {
    subject: `${params.code} is your TaskFlow verification code`,
    html: renderEmail({
      preheader: `Your verification code is ${params.code}.`,
      heading: 'Confirm your email',
      paragraphs: [greeting, intro],
      code: params.code,
      footnote,
    }),
    text: [greeting, '', intro, '', params.code, '', footnote].join('\n'),
  };
}
