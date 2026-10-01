import { renderEmail, type EmailContent } from './layout';

/** Sent to the PREVIOUS address after an email change. */
export function emailChangedEmail(params: {
  firstName: string;
  newEmail: string;
  loginUrl: string;
}): EmailContent {
  const greeting = params.firstName ? `Hi ${params.firstName},` : 'Hi,';
  const body = `The email for your TaskFlow account was changed to ${params.newEmail}. From now on, sign-in emails and password reset links go to that address.`;
  const footnote =
    "If this wasn't you, someone may have access to your account: sign in and change your password right away.";

  return {
    subject: 'Your TaskFlow email was changed',
    html: renderEmail({
      preheader: 'The email on your account was changed.',
      heading: 'Your email was changed',
      paragraphs: [greeting, body],
      button: { label: 'Go to TaskFlow', url: params.loginUrl },
      footnote,
    }),
    text: [greeting, '', body, '', `Log in: ${params.loginUrl}`, '', footnote].join('\n'),
  };
}
