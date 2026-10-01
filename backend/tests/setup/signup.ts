import type { RegisterInput } from '@taskflow/shared';
import type supertest from 'supertest';
import type { MailMessage } from '../../src/mail/mail.transport';
import type { Harness } from './harness';

/** The 6-digit code in a sign-up email. */
export function otpFrom(message: MailMessage | undefined): string {
  const match = message?.text.match(/^\s*(\d{6})\s*$/m);
  if (!match?.[1]) throw new Error('No verification code found in the email');
  return match[1];
}

export function lastCodeFor(h: Harness, email: string): string {
  const messages = h.mail.sent.filter(
    (message) => message.to === email && /verification code/.test(message.subject),
  );
  return otpFrom(messages.at(-1));
}

/** Full sign-up: details → emailed code → verified account with a session. */
export async function registerAndVerify(
  h: Harness,
  input: RegisterInput,
): Promise<supertest.Response> {
  const started = await h.post('/api/v1/auth/register').send(input);
  if (started.status !== 202) {
    throw new Error(`Sign-up failed: ${started.status} ${JSON.stringify(started.body)}`);
  }
  return h.post('/api/v1/auth/register/verify').send({
    registrationId: started.body.data.registrationId,
    code: lastCodeFor(h, started.body.data.email),
  });
}
