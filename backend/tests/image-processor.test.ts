import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { HttpException } from '../src/common/exceptions';
import { ImageProcessor } from '../src/modules/images/image-processor';
import { jpeg, png, SVG } from './setup/images';

const processor = new ImageProcessor();

async function expectInvalid(input: Buffer) {
  const error = await processor.process(input, 'task').catch((err: unknown) => err);
  expect(error).toBeInstanceOf(HttpException);
  expect(error).toMatchObject({ status: 400, code: 'INVALID_IMAGE' });
}

describe('ImageProcessor', () => {
  it('produces WebP display and thumbnail variants for task images', async () => {
    const result = await processor.process(await jpeg(3200, 1600), 'task');

    expect(result.display).toMatchObject({ width: 1600, height: 800 });
    expect(result.thumb).toMatchObject({ width: 400, height: 400 });
    expect((await sharp(result.display.buffer).metadata()).format).toBe('webp');
    expect((await sharp(result.thumb!.buffer).metadata()).format).toBe('webp');
  });

  it('never enlarges small images', async () => {
    const result = await processor.process(await png(120, 80), 'task');
    expect(result.display).toMatchObject({ width: 120, height: 80 });
  });

  it('makes a single 256px square for avatars', async () => {
    const result = await processor.process(await jpeg(900, 500), 'avatar');
    expect(result.display).toMatchObject({ width: 256, height: 256 });
    expect(result.thumb).toBeNull();
  });

  it('applies EXIF rotation and strips metadata such as GPS', async () => {
    const rotated = await sharp({
      create: { width: 300, height: 100, channels: 3, background: '#F28B22' },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();

    const result = await processor.process(rotated, 'task');
    expect(result.display).toMatchObject({ width: 100, height: 300 });
    const metadata = await sharp(result.display.buffer).metadata();
    expect(metadata.exif).toBeUndefined();
    expect(metadata.orientation).toBeUndefined();
  });

  it('accepts GIF (first frame) and AVIF', async () => {
    const gif = await sharp({
      create: { width: 40, height: 40, channels: 3, background: '#14B87F' },
    })
      .gif()
      .toBuffer();
    const avif = await sharp({
      create: { width: 40, height: 40, channels: 3, background: '#14B87F' },
    })
      .avif()
      .toBuffer();
    await expect(processor.process(gif, 'task')).resolves.toBeDefined();
    await expect(processor.process(avif, 'task')).resolves.toBeDefined();
  });

  it('rejects SVG, TIFF, text and truncated files whatever their name claims', async () => {
    await expectInvalid(SVG);
    await expectInvalid(
      await sharp({ create: { width: 20, height: 20, channels: 3, background: '#000' } })
        .tiff()
        .toBuffer(),
    );
    await expectInvalid(Buffer.from('<html><script>alert(1)</script></html>'));
    const full = await jpeg(800, 600);
    await expectInvalid(full.subarray(0, Math.floor(full.length / 3)));
  });

  it('rejects decompression bombs over 40 megapixels', async () => {
    const huge = await sharp({
      create: { width: 8000, height: 6000, channels: 3, background: '#000' },
    })
      .png({ compressionLevel: 9 })
      .toBuffer();
    await expectInvalid(huge);
  });
});
