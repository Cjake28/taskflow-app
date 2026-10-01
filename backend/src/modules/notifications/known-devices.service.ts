import type { SessionMeta } from '../../common/http/request-meta';
import type { Clock } from '../../common/utils/clock';
import { describeDevice, displayIp } from '../../common/utils/device';
import { generateSecret, sha256Hex } from '../../common/utils/tokens';
import { isUniqueViolation, type Db } from '../../database/prisma';
import { describeSignIn } from './format';
import type { NotificationsService } from './notifications.service';

const DAY_MS = 86_400_000;

/** Recognises the browsers a user signs in from and raises a "new sign-in" notification. */
export class KnownDevicesService {
  constructor(
    private readonly prisma: Db,
    private readonly notifications: NotificationsService,
    private readonly clock: Clock,
  ) {}

  /**
   * Called after every sign-in. Returns the device token the browser should keep (its cookie,
   * or a new one). The first device of an account is recorded silently; any later unknown device
   * notifies the user.
   */
  async recordSignIn(userId: string, meta: SessionMeta): Promise<string> {
    const token = meta.deviceToken ?? generateSecret();
    const tokenHash = sha256Hex(token);
    const now = this.clock.now();
    const label = describeDevice(meta.userAgent).slice(0, 120);
    const ip = displayIp(meta.ip);

    const known = await this.prisma.knownDevice.updateMany({
      where: { userId, tokenHash },
      data: { lastSeenAt: now, lastIp: meta.ip, label },
    });
    if (known.count > 0) return token;

    const hadDevices = (await this.prisma.knownDevice.count({ where: { userId } })) > 0;
    try {
      await this.prisma.knownDevice.create({
        data: { userId, tokenHash, label, lastIp: meta.ip, firstSeenAt: now, lastSeenAt: now },
      });
    } catch (err) {
      // A parallel sign-in from the same browser recorded it first.
      if (isUniqueViolation(err)) return token;
      throw err;
    }

    if (hadDevices) {
      await this.notifications.notify({
        userId,
        type: 'NEW_SIGN_IN',
        title: `New sign-in from ${label}`,
        body: describeSignIn(label, ip),
        data: { device: label, ip, at: now.toISOString() },
      });
    }
    return token;
  }

  /** Forgets browsers not seen for `days` days (they would alert again on their next sign-in). */
  async removeStale(days: number): Promise<number> {
    const before = new Date(this.clock.now().getTime() - days * DAY_MS);
    const { count } = await this.prisma.knownDevice.deleteMany({
      where: { lastSeenAt: { lt: before } },
    });
    return count;
  }
}
