import type { Clock } from '../../common/utils/clock';
import type { Db } from '../../database/prisma';

const RETENTION_MS = 30 * 86_400_000;

/** Deletes revoked/expired sessions and used/expired tokens older than 30 days. */
export class AuthCleanupService {
  constructor(
    private readonly prisma: Db,
    private readonly clock: Clock,
  ) {}

  async run(): Promise<{ sessions: number; tokens: number }> {
    const cutoff = new Date(this.clock.now().getTime() - RETENTION_MS);
    const sessions = await this.prisma.session.deleteMany({
      where: { OR: [{ revokedAt: { lt: cutoff } }, { expiresAt: { lt: cutoff } }] },
    });
    const tokens = await this.prisma.verificationToken.deleteMany({
      where: { OR: [{ usedAt: { lt: cutoff } }, { expiresAt: { lt: cutoff } }] },
    });
    return { sessions: sessions.count, tokens: tokens.count };
  }
}
