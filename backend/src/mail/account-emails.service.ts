import type { Db } from '../database/prisma';
import type { MailTransport } from './mail.transport';
import { passwordChangedEmail } from './templates/password-changed';
import { passwordResetEmail } from './templates/password-reset';
import { signupCodeEmail } from './templates/signup-code';
import { verifyEmailEmail } from './templates/verify-email';

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

  async sendEmailVerification(
    user: { email: string; firstName: string },
    verifyUrl: string,
    ttlHours: number,
  ): Promise<void> {
    const content = verifyEmailEmail({ firstName: user.firstName, verifyUrl, ttlHours });
    await this.transport.send({ to: user.email, ...content });
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
