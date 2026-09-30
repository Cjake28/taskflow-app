import type { Logger } from '../common/utils/logger';
import type { AccountEmailsService } from '../mail/account-emails.service';
import type { AuthCleanupService } from '../modules/auth/auth-cleanup.service';
import type { PasswordResetService } from '../modules/auth/password-reset.service';
import type { JobProcessors } from './job-types';

export interface ProcessorDeps {
  logger: Logger;
  passwordReset: PasswordResetService;
  accountEmails: AccountEmailsService;
  authCleanup: AuthCleanupService;
}

export function createJobProcessors(deps: ProcessorDeps): JobProcessors {
  return {
    'email.password-reset-request': ({ email }) => deps.passwordReset.processResetRequest(email),
    'email.password-changed': ({ userId }) => deps.accountEmails.sendPasswordChanged(userId),
    'auth.cleanup': async () => {
      const removed = await deps.authCleanup.run();
      deps.logger.info(removed, 'Auth cleanup finished');
    },
  };
}
