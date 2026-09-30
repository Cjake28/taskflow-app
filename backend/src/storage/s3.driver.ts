import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  NoSuchKey,
  NotFound,
  paginateListObjectsV2,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { Readable } from 'node:stream';
import {
  StorageObjectNotFoundError,
  type StorageDriver,
  type StoredObject,
} from './storage.driver';

export interface S3DriverOptions {
  name: 's3' | 'r2';
  bucket: string;
  region: string;
  endpoint?: string;
  forcePathStyle?: boolean;
  accessKeyId: string;
  secretAccessKey: string;
}

const DELETE_CONCURRENCY = 8;

function isNotFound(err: unknown): boolean {
  if (err instanceof NoSuchKey || err instanceof NotFound) return true;
  return err instanceof S3ServiceException && err.$metadata.httpStatusCode === 404;
}

/** AWS S3 and S3-compatible services (Cloudflare R2, SeaweedFS, MinIO). Buckets stay private. */
export class S3Driver implements StorageDriver {
  readonly name: 's3' | 'r2';
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(options: S3DriverOptions) {
    this.name = options.name;
    this.bucket = options.bucket;
    this.client = new S3Client({
      region: options.region,
      ...(options.endpoint ? { endpoint: options.endpoint } : {}),
      forcePathStyle: options.forcePathStyle ?? false,
      credentials: {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      },
      // Newer SDKs add CRC checksums to every request; several S3-compatible
      // services reject them, so only send checksums where the API requires them.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        ContentLength: body.length,
      }),
    );
  }

  async getStream(key: string): Promise<Readable> {
    try {
      const result = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      if (!(result.Body instanceof Readable)) throw new Error('Unexpected S3 response body');
      return result.Body;
    } catch (err) {
      if (isNotFound(err)) throw new StorageObjectNotFoundError(key);
      throw err;
    }
  }

  async delete(keys: string[]): Promise<void> {
    // Single-object deletes: DeleteObjects needs a Content-MD5/CRC header that
    // not every S3-compatible service accepts. Missing keys still succeed (204).
    for (let i = 0; i < keys.length; i += DELETE_CONCURRENCY) {
      await Promise.all(
        keys
          .slice(i, i + DELETE_CONCURRENCY)
          .map((key) =>
            this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key })),
          ),
      );
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch (err) {
      if (isNotFound(err)) return false;
      throw err;
    }
  }

  async *list(prefix: string): AsyncIterable<StoredObject> {
    const pages = paginateListObjectsV2(
      { client: this.client, pageSize: 1000 },
      { Bucket: this.bucket, Prefix: prefix },
    );
    for await (const page of pages) {
      for (const object of page.Contents ?? []) {
        if (object.Key) yield { key: object.Key, lastModified: object.LastModified ?? new Date(0) };
      }
    }
  }

  async healthCheck(): Promise<void> {
    await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
  }

  close(): void {
    this.client.destroy();
  }
}
