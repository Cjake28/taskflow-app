import { randomBytes } from 'node:crypto';
import sharp from 'sharp';

const solid = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: '#5B5BF0' } });

export const jpeg = (width = 640, height = 480) => solid(width, height).jpeg().toBuffer();
export const png = (width = 320, height = 240) => solid(width, height).png().toBuffer();

/** Random pixels compress badly, which makes predictable, larger WebP output. */
export const noisyPng = (width = 256, height = 256) =>
  sharp(randomBytes(width * height * 3), { raw: { width, height, channels: 3 } })
    .png()
    .toBuffer();

export const SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script><rect width="10" height="10"/></svg>',
);
