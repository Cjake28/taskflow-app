import type { UnsubscribeResultDto } from '@taskflow/shared';
import { BadRequestException } from '../../common/exceptions';
import type { Db } from '../../database/prisma';
import { maskEmail } from './format';
import type { NotificationPreferencesService } from './notification-preferences.service';
import type { UnsubscribeTokens } from './unsubscribe-tokens';

export const INVALID_UNSUBSCRIBE_MESSAGE = 'This unsubscribe link is invalid or has expired.';

/** Email unsubscribe links: no sign-in needed, the signed token names the user and the type. */
export class UnsubscribeService {
  constructor(
    private readonly prisma: Db,
    private readonly preferences: NotificationPreferencesService,
    private readonly tokens: UnsubscribeTokens,
  ) {}

  async unsubscribe(token: string): Promise<UnsubscribeResultDto> {
    const claim = this.tokens.verify(token);
    if (!claim) throw new BadRequestException(INVALID_UNSUBSCRIBE_MESSAGE);
    const user = await this.prisma.user.findUnique({
      where: { id: claim.userId },
      select: { email: true },
    });
    if (!user) throw new BadRequestException(INVALID_UNSUBSCRIBE_MESSAGE);

    await this.preferences.disableEmail(claim.userId, claim.type);
    return { type: claim.type, email: maskEmail(user.email) };
  }
}
