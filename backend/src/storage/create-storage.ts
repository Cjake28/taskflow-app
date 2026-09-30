import type { Env } from '../config/env';
import { LocalDiskDriver } from './local.driver';
import { S3Driver } from './s3.driver';
import type { StorageDriver } from './storage.driver';

export function createStorageDriver(env: Env): StorageDriver {
  switch (env.STORAGE_DRIVER) {
    case 's3':
      return new S3Driver({
        name: 's3',
        bucket: env.S3_BUCKET,
        region: env.S3_REGION,
        endpoint: env.S3_ENDPOINT || undefined,
        forcePathStyle: env.S3_FORCE_PATH_STYLE,
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      });
    case 'r2':
      // Cloudflare R2 preset: account-specific endpoint and the special "auto" region.
      return new S3Driver({
        name: 'r2',
        bucket: env.R2_BUCKET,
        region: 'auto',
        endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      });
    default:
      return new LocalDiskDriver(env.STORAGE_LOCAL_ROOT);
  }
}
