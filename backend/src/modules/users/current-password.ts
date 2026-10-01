import { ErrorCode } from '@taskflow/shared';
import { BadRequestException, ValidationException } from '../../common/exceptions';
import { verifyPassword } from '../../common/utils/password';

const WRONG_CURRENT_PASSWORD = 'Current password is incorrect';

/** Re-authentication for sensitive changes (email, password). */
export async function assertCurrentPassword(
  passwordHash: string,
  currentPassword: string | undefined,
  action: 'email' | 'password',
): Promise<void> {
  if (!currentPassword) {
    throw new ValidationException([
      { field: 'currentPassword', message: `Enter your current password to change your ${action}` },
    ]);
  }
  // 400 (not 401): the client treats 401 as an expired session and would try to refresh.
  if (!(await verifyPassword(passwordHash, currentPassword))) {
    throw new BadRequestException(
      `${WRONG_CURRENT_PASSWORD}.`,
      ErrorCode.INVALID_CURRENT_PASSWORD,
      [{ field: 'currentPassword', message: WRONG_CURRENT_PASSWORD }],
    );
  }
}
