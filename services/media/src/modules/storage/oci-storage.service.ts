/**
 * Object Storage Service
 *
 * Note: Class name `OCIStorageService` is retained for historical compatibility
 * with ~15 call sites across the media service. The implementation now uses the
 * S3-compatible API to talk to Cloudflare R2 (production) or MinIO (local dev),
 * selected via `STORAGE_PROVIDER`. OCI (Oracle) is no longer used.
 *
 * `createPAR` returns an S3 presigned PUT URL rather than an OCI PAR; the shape
 * of the result (`{ parUrl, fullUrl, expiresAt }`) is preserved so existing
 * callers continue to work.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CopyObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'stream';

export interface PAROptions {
  bucketName: string;
  objectName: string;
  accessType: 'ObjectRead' | 'ObjectWrite' | 'ObjectReadWrite';
  timeExpires: Date;
}

export interface PARResult {
  parUrl: string;
  fullUrl: string;
  expiresAt: Date;
}

@Injectable()
export class OCIStorageService {
  private readonly logger = new Logger(OCIStorageService.name);
  private s3Client: S3Client | null = null;
  private isConfigured = false;
  private initializationError: string | null = null;
  private provider: 'R2' | 'S3' = 'R2';

  constructor(private configService: ConfigService) {
    this.initializeClient();
  }

  private initializeClient() {
    const provider = (
      this.configService.get<string>('STORAGE_PROVIDER') || 'R2'
    ).toUpperCase();

    try {
      if (provider === 'R2') {
        const accountId = this.configService.get<string>('R2_ACCOUNT_ID');
        const accessKeyId = this.configService.get<string>('R2_ACCESS_KEY_ID');
        const secretAccessKey = this.configService.get<string>('R2_SECRET_ACCESS_KEY');

        if (!accountId || !accessKeyId || !secretAccessKey) {
          this.logger.warn(
            'R2 not fully configured (R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY missing). ' +
              'Object storage operations will fail until set.',
          );
          this.isConfigured = false;
          return;
        }

        this.s3Client = new S3Client({
          region: 'auto',
          endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
          credentials: { accessKeyId, secretAccessKey },
        });
        this.provider = 'R2';
      } else {
        // Local dev: MinIO (S3-compatible)
        const endpoint =
          this.configService.get<string>('MINIO_ENDPOINT') || 'http://localhost:9000';
        const accessKeyId = this.configService.get<string>('MINIO_ACCESS_KEY') || '';
        const secretAccessKey = this.configService.get<string>('MINIO_SECRET_KEY') || '';

        this.s3Client = new S3Client({
          region: 'us-east-1',
          endpoint,
          forcePathStyle: true,
          credentials: { accessKeyId, secretAccessKey },
        });
        this.provider = 'S3';
      }

      this.isConfigured = true;
      this.logger.log(`Object storage initialized (provider=${this.provider})`);
    } catch (error) {
      this.logger.warn(`Failed to initialize object storage: ${error.message}`);
      this.initializationError = error.message;
      this.isConfigured = false;
    }
  }

  isReady(): boolean {
    return this.isConfigured && this.s3Client != null;
  }

  private ensureConfigured(): void {
    if (!this.isReady()) {
      throw new Error(
        `Object storage is not configured. Error: ${this.initializationError || 'Unknown'}. ` +
          'Set STORAGE_PROVIDER and R2_* (production) or MINIO_* (local dev) env vars.',
      );
    }
  }

  /**
   * Generate a presigned PUT URL for direct upload.
   * Method name retained from OCI PAR API for caller compatibility.
   */
  async createPAR(options: PAROptions): Promise<PARResult> {
    this.ensureConfigured();

    const expiresInSeconds = Math.max(
      1,
      Math.floor((options.timeExpires.getTime() - Date.now()) / 1000),
    );

    try {
      const command =
        options.accessType === 'ObjectRead'
          ? new GetObjectCommand({ Bucket: options.bucketName, Key: options.objectName })
          : new PutObjectCommand({ Bucket: options.bucketName, Key: options.objectName });

      const url = await getSignedUrl(this.s3Client!, command as any, {
        expiresIn: expiresInSeconds,
      });

      this.logger.log(
        `Created presigned URL for ${options.objectName} in ${options.bucketName}, expires ${options.timeExpires.toISOString()}`,
      );

      return {
        parUrl: url,
        fullUrl: url,
        expiresAt: options.timeExpires,
      };
    } catch (error) {
      this.logger.error(`Failed to create presigned URL: ${error.message}`, error.stack);
      throw error;
    }
  }

  async putObject(
    bucketName: string,
    objectName: string,
    data: Buffer | NodeJS.ReadableStream,
  ) {
    this.ensureConfigured();
    try {
      await this.s3Client!.send(
        new PutObjectCommand({
          Bucket: bucketName,
          Key: objectName,
          Body: data as any,
        }),
      );
      this.logger.log(`Uploaded ${objectName} to ${bucketName}`);
    } catch (error) {
      this.logger.error(`Failed to upload object: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getObject(bucketName: string, objectName: string): Promise<Buffer> {
    this.ensureConfigured();
    try {
      const response = await this.s3Client!.send(
        new GetObjectCommand({ Bucket: bucketName, Key: objectName }),
      );
      const body = response.Body as Readable;
      const chunks: Buffer[] = [];
      return await new Promise<Buffer>((resolve, reject) => {
        body.on('data', (chunk: Buffer) => chunks.push(chunk));
        body.on('end', () => resolve(Buffer.concat(chunks)));
        body.on('error', reject);
      });
    } catch (error) {
      this.logger.error(`Failed to get object: ${error.message}`, error.stack);
      throw error;
    }
  }

  async deleteObject(bucketName: string, objectName: string) {
    this.ensureConfigured();
    try {
      await this.s3Client!.send(
        new DeleteObjectCommand({ Bucket: bucketName, Key: objectName }),
      );
      this.logger.log(`Deleted ${objectName} from ${bucketName}`);
    } catch (error) {
      this.logger.error(`Failed to delete object: ${error.message}`, error.stack);
      throw error;
    }
  }

  async copyObject(
    sourceBucket: string,
    sourceObject: string,
    destBucket: string,
    destObject: string,
  ) {
    this.ensureConfigured();
    try {
      await this.s3Client!.send(
        new CopyObjectCommand({
          Bucket: destBucket,
          Key: destObject,
          CopySource: `${sourceBucket}/${sourceObject}`,
        }),
      );
      this.logger.log(
        `Copied ${sourceBucket}/${sourceObject} to ${destBucket}/${destObject}`,
      );
    } catch (error) {
      this.logger.error(`Failed to copy object: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Generate public CDN URL for an object.
   * Reads CDN_DOMAIN (e.g. cdn.patina.cloud) and returns a direct URL.
   */
  getCDNUrl(objectKey: string): string {
    const cdnDomain =
      this.configService.get<string>('CDN_DOMAIN') ||
      this.configService.get<string>('R2_PUBLIC_BUCKET_URL') ||
      '';
    // Strip protocol if R2_PUBLIC_BUCKET_URL was used
    const host = cdnDomain.replace(/^https?:\/\//, '');
    return `https://${host}/${objectKey}`;
  }

  generateObjectKey(assetId: string, kind: 'image' | '3d', filename: string): string {
    const prefix = kind === 'image' ? 'raw/images' : 'raw/3d';
    return `${prefix}/${assetId}/${filename}`;
  }

  generateRenditionKey(
    assetId: string,
    width: number,
    height: number,
    format: string,
  ): string {
    return `processed/images/${assetId}/${width}x${height}.${format}`;
  }

  generate3DKey(assetId: string, format: 'glb' | 'usdz'): string {
    return `processed/3d/${assetId}/model.${format}`;
  }

  generatePreviewKey(assetId: string, kind: 'image' | '3d', variant?: string): string {
    if (kind === 'image') {
      return `previews/images/${assetId}/lqip.jpg`;
    }
    return `previews/3d/${assetId}/${variant || 'front'}.jpg`;
  }
}
