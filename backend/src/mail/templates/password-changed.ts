import { renderEmail, type EmailContent } from './layout';

export function passwordChangedEmail(params: {
  firstName: string;
  loginUrl: string;
}): EmailContent {
  const greeting = params.firstName ? `Hi ${params.firstName},` : 'Hi,';
  const body =
    'The password for your TaskFlow account was just changed, and every other device was signed out.';
  const footnote =
    'If this wasn\'t you, reset your password right away using "Forgot password?" on the login page.';

  return {
    subject: 'Your TaskFlow password was changed',
    html: renderEmail({
      preheader: 'Your password was changed.',
      heading: 'Your password was changed',
      paragraphs: [greeting, body],
      button: { label: 'Go to TaskFlow', url: params.loginUrl },
      footnote,
    }),
    text: [greeting, '', body, '', `Log in: ${params.loginUrl}`, '', footnote].join('\n'),
  };
}
