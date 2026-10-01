import type { Db } from '../database/prisma';
import type { MailTransport } from './mail.transport';
import { emailChangeCodeEmail } from './templates/email-change-code';
import { emailChangedEmail } from './templates/email-changed';
import { passwordChangedEmail } from './templates/password-changed';
import { passwordResetEmail } from './templates/password-reset';
import { signupCodeEmail } from './templates/signup-code';

export class AccountEmailsService {
  constructor(
    private readonly prisma: Db,
    private readonly transport: MailTransport,
    private readonly config: { frontendUrl: string; resetTtlMinutes: number },
  ) {}

  async sendPasswordReset(
    user: { email: string; firstName: string },
    resetUrl: string,
  ): Promise<void> {
    const content = passwordResetEmail({
      firstName: user.firstName,
      resetUrl,
      ttlMinutes: this.config.resetTtlMinutes,
    });
    await this.transport.send({ to: user.email, ...content });
  }

  async sendSignupCode(
    user: { email: string; firstName: string },
    code: string,
    ttlMinutes: number,
  ): Promise<void> {
    const content = signupCodeEmail({ firstName: user.firstName, code, ttlMinutes });
    await this.transport.send({ to: user.email, ...content });
  }

  async sendEmailChangeCode(
    user: { email: string; firstName: string },
    code: string,
    ttlMinutes: number,
  ): Promise<void> {
    const content = emailChangeCodeEmail({ firstName: user.firstName, code, ttlMinutes });
    await this.transport.send({ to: user.email, ...content });
  }

  /** Tells the previous address that the account email moved. */
  async sendEmailChanged(userId: string, previousEmail: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, firstName: true },
    });
    if (!user) return;
    const loginUrl = new URL('/login', this.config.frontendUrl).toString();
    const content = emailChangedEmail({
      firstName: user.firstName,
      newEmail: user.email,
      loginUrl,
    });
    await this.transport.send({ to: previousEmail, ...content });
  }

  async sendPasswordChanged(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, firstName: true },
    });
    if (!user) return;
    const loginUrl = new URL('/login', this.config.frontendUrl).toString();
    const content = passwordChangedEmail({ firstName: user.firstName, loginUrl });
    await this.transport.send({ to: user.email, ...content });
  }
}
