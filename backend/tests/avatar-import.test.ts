import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AvatarImportService } from '../src/modules/images/avatar-import.service';
import { createUser } from './setup/factories';
import { createHarness, type Harness } from './setup/harness';
import { png } from './setup/images';

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
beforeEach(() => h.reset());
afterAll(() => h.close());

const GOOGLE_PHOTO = 'https://lh3.googleusercontent.com/a/photo';

function importer(fetchImpl: typeof fetch) {
  return new AvatarImportService(
    h.container.prisma,
    h.container.images,
    h.container.logger,
    fetchImpl,
  );
}

const imageResponse = async () =>
  new Response(new Uint8Array(await png(300, 300)), { headers: { 'content-type': 'image/png' } });

async function avatarOf(userId: string) {
  return (
    await h.container.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { avatarImageId: true },
    })
  ).avatarImageId;
}

describe('AvatarImportService', () => {
  it('downloads an allowed picture and sets it as the avatar', async () => {
    const { user } = await createUser(h.container.prisma);
    const fetchMock = vi.fn(imageResponse);

    expect(await importer(fetchMock as typeof fetch).import(user.id, GOOGLE_PHOTO)).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(await avatarOf(user.id)).not.toBeNull();
  });

  it('refuses non-HTTPS URLs and hosts outside the allowlist without fetching', async () => {
    const { user } = await createUser(h.container.prisma);
    const fetchMock = vi.fn(imageResponse);
    const service = importer(fetchMock as typeof fetch);

    for (const url of [
      'http://lh3.googleusercontent.com/a/photo',
      'https://169.254.169.254/latest/meta-data',
      'https://evil.example/avatar.png',
      'not a url',
    ]) {
      expect(await service.import(user.id, url)).toBe(false);
    }
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await avatarOf(user.id)).toBeNull();
  });

  it('does not follow redirects to other hosts', async () => {
    const { user } = await createUser(h.container.prisma);
    const fetchMock = vi.fn(
      async () =>
        new Response(null, { status: 302, headers: { location: 'http://127.0.0.1:6379/' } }),
    );
    expect(await importer(fetchMock as typeof fetch).import(user.id, GOOGLE_PHOTO)).toBe(false);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('caps the download size', async () => {
    const { user } = await createUser(h.container.prisma);
    const huge = vi.fn(async () => new Response(new Uint8Array(6 * 1024 * 1024)));
    expect(await importer(huge as typeof fetch).import(user.id, GOOGLE_PHOTO)).toBe(false);
  });

  it('skips files that are not images and users who already have an avatar', async () => {
    const { user } = await createUser(h.container.prisma);
    const html = vi.fn(async () => new Response('<html></html>'));
    expect(await importer(html as typeof fetch).import(user.id, GOOGLE_PHOTO)).toBe(false);

    await importer(vi.fn(imageResponse) as typeof fetch).import(user.id, GOOGLE_PHOTO);
    const first = await avatarOf(user.id);
    const again = vi.fn(imageResponse);
    expect(await importer(again as typeof fetch).import(user.id, GOOGLE_PHOTO)).toBe(false);
    expect(again).not.toHaveBeenCalled();
    expect(await avatarOf(user.id)).toBe(first);
  });

  it('lets transient host errors fail the job so it is retried', async () => {
    const { user } = await createUser(h.container.prisma);
    const down = vi.fn(async () => new Response('busy', { status: 503 }));
    await expect(importer(down as typeof fetch).import(user.id, GOOGLE_PHOTO)).rejects.toThrow(
      /503/,
    );
  });
});
