import type { MailMessage, MailTransport } from '../../src/mail/mail.transport';

/** Records outgoing email instead of sending it. */
export class MemoryMailTransport implements MailTransport {
  readonly sent: MailMessage[] = [];

  async send(message: MailMessage): Promise<void> {
    this.sent.push(message);
  }

  clear(): void {
    this.sent.length = 0;
  }
}

export function resetTokenFrom(message: MailMessage | undefined): string {
  const match = message?.text.match(/token=([A-Za-z0-9_-]+)/);
  if (!match?.[1]) throw new Error('No reset token found in the email');
  return match[1];
}
