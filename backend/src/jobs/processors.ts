import type { Logger } from '../common/utils/logger';
import type { AccountEmailsService } from '../mail/account-emails.service';
import type { AuthCleanupService } from '../modules/auth/auth-cleanup.service';
import type { PasswordResetService } from '../modules/auth/password-reset.service';
import type { RegistrationService } from '../modules/auth/registration.service';
import type { AvatarImportService } from '../modules/images/avatar-import.service';
import type { ImagesService } from '../modules/images/images.service';
import type { KnownDevicesService } from '../modules/notifications/known-devices.service';
import type { NotificationEmailsService } from '../modules/notifications/notification-emails.service';
import type { NotificationScheduler } from '../modules/notifications/notification-scheduler';
import type { NotificationsService } from '../modules/notifications/notifications.service';
import type { EmailChangeService } from '../modules/users/email-change.service';
import type { StorageDriver } from '../storage/storage.driver';
import type { JobProcessors } from './job-types';

export interface ProcessorDeps {
  logger: Logger;
  passwordReset: PasswordResetService;
  accountEmails: AccountEmailsService;
  authCleanup: AuthCleanupService;
  emailChange: EmailChangeService;
  registration: RegistrationService;
  storage: StorageDriver;
  images: ImagesService;
  avatarImport: AvatarImportService;
  notifications: NotificationsService;
  notificationScheduler: NotificationScheduler;
  notificationEmails: NotificationEmailsService;
  knownDevices: KnownDevicesService;
}

/** Read notifications are kept this long. */
const NOTIFICATION_RETENTION_DAYS = 90;
/** Browsers not seen for this long are forgotten (cookies last at most 400 days anyway). */
const DEVICE_RETENTION_DAYS = 400;

export function createJobProcessors(deps: ProcessorDeps): JobProcessors {
  return {
    'email.password-reset-request': ({ email }) => deps.passwordReset.processResetRequest(email),
    'email.password-changed': ({ userId }) => deps.accountEmails.sendPasswordChanged(userId),
    'email.email-change-otp': ({ userId }) => deps.emailChange.sendCode(userId),
    'email.email-changed': ({ userId, previousEmail }) =>
      deps.accountEmails.sendEmailChanged(userId, previousEmail),
    'email.signup-otp': ({ registrationId }) => deps.registration.sendCode(registrationId),
    'email.notification': ({ notificationId }) => deps.notificationEmails.send(notificationId),
    'notifications.tick': async () => {
      const sent = await deps.notificationScheduler.tick();
      if (sent.reminders + sent.dueSoon + sent.digests > 0) {
        deps.logger.info(sent, 'Notifications sent');
      }
    },
    'notifications.cleanup': async () => {
      const notifications = await deps.notifications.removeOld(NOTIFICATION_RETENTION_DAYS);
      const devices = await deps.knownDevices.removeStale(DEVICE_RETENTION_DAYS);
      if (notifications + devices > 0) {
        deps.logger.info({ notifications, devices }, 'Notification cleanup finished');
      }
    },
    'auth.cleanup': async () => {
      const removed = await deps.authCleanup.run();
      deps.logger.info(removed, 'Auth cleanup finished');
    },
    'avatar.import': async ({ userId, url }) => {
      await deps.avatarImport.import(userId, url);
    },
    'storage.delete': ({ keys }) => deps.storage.delete(keys),
    'images.purge': async () => {
      const purged = await deps.images.purgeExpired();
      if (purged > 0) deps.logger.info({ purged }, 'Expired images purged');
    },
    'storage.orphan-sweep': async () => {
      const deleted = await deps.images.sweepOrphans();
      if (deleted > 0) deps.logger.info({ deleted }, 'Orphaned objects removed');
    },
  };
}
