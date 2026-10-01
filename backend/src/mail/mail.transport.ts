import nodemailer, { type Transporter } from 'nodemailer';

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Extra headers, e.g. `List-Unsubscribe`. */
  headers?: Record<string, string>;
}

export interface MailTransport {
  send(message: MailMessage): Promise<void>;
}

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

/** Provider-agnostic SMTP delivery (Mailpit in development, any SMTP server in production). */
export class SmtpMailTransport implements MailTransport {
  private readonly transporter: Transporter;

  constructor(private readonly config: SmtpConfig) {
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      ...(config.user ? { auth: { user: config.user, pass: config.pass } } : {}),
    });
  }

  async send(message: MailMessage): Promise<void> {
    await this.transporter.sendMail({ from: this.config.from, ...message });
  }

  async verify(): Promise<void> {
    await this.transporter.verify();
  }
}
