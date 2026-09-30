import type { Logger } from '../../common/utils/logger';
import type { Db } from '../../database/prisma';
import type { ImagesService } from './images.service';

/** Hosts that serve Google and GitHub profile pictures. */
export const AVATAR_HOSTS = ['lh3.googleusercontent.com', 'avatars.githubusercontent.com'];

const TIMEOUT_MS = 5_000;
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 2;

/** A permanent problem with the URL or file: retrying would not help. */
export class AvatarImportRejected extends Error {}

/**
 * Downloads an OAuth profile picture and stores it as the user's avatar.
 * SSRF defences: HTTPS only, host allowlist checked on every redirect hop,
 * a timeout and a size cap.
 */
export class AvatarImportService {
  constructor(
    private readonly prisma: Db,
    private readonly images: ImagesService,
    private readonly logger: Logger,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly allowedHosts: readonly string[] = AVATAR_HOSTS,
  ) {}

  /** Returns false when the import was skipped or rejected; throws on transient errors. */
  async import(userId: string, url: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { avatarImageId: true },
    });
    if (!user || user.avatarImageId) return false;

    try {
      const buffer = await this.download(url);
      return await this.images.setAvatar(
        userId,
        { buffer, originalName: 'avatar' },
        { onlyIfMissing: true },
      );
    } catch (err) {
      if (err instanceof AvatarImportRejected || isClientError(err)) {
        this.logger.warn({ err: (err as Error).message }, 'Avatar import skipped');
        return false;
      }
      throw err;
    }
  }

  private async download(rawUrl: string): Promise<Buffer> {
    let url = this.checkUrl(rawUrl);
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      const response = await this.fetchImpl(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { Accept: 'image/*' },
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        await response.body?.cancel();
        if (!location) throw new AvatarImportRejected('Redirect without a location');
        url = this.checkUrl(new URL(location, url).toString());
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel();
        if (response.status >= 500) throw new Error(`Avatar host responded ${response.status}`);
        throw new AvatarImportRejected(`Avatar host responded ${response.status}`);
      }
      return readCapped(response);
    }
    throw new AvatarImportRejected('Too many redirects');
  }

  private checkUrl(value: string): URL {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new AvatarImportRejected('Invalid avatar URL');
    }
    if (url.protocol !== 'https:' || !this.allowedHosts.includes(url.hostname)) {
      throw new AvatarImportRejected(`Avatar host not allowed: ${url.hostname}`);
    }
    return url;
  }
}

async function readCapped(response: Response): Promise<Buffer> {
  const declared = Number(response.headers.get('content-length') ?? 0);
  if (declared > MAX_BYTES) {
    await response.body?.cancel();
    throw new AvatarImportRejected('Avatar is too large');
  }
  if (!response.body) throw new AvatarImportRejected('Empty avatar response');

  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of response.body) {
    total += chunk.byteLength;
    if (total > MAX_BYTES) throw new AvatarImportRejected('Avatar is too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function isClientError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'status' in err && err.status === 400;
}
