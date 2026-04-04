/**
 * Cloudflare R2 Storage Provider
 * S3-compatible storage with zero egress fees
 *
 * R2 uses the S3 API but has key differences:
 * - No storage class / tiering support (all objects are standard)
 * - Lifecycle rules managed via Cloudflare dashboard/API, not S3 lifecycle commands
 * - Region is always 'auto' (Cloudflare handles placement)
 * - Endpoint format: https://<account_id>.r2.cloudflarestorage.com
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CopyObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'stream';
import {
  IStorageProvider,
  StorageTier,
  StorageOptions,
  StorageObject,
  MultipartUpload,
  UploadPart,
  LifecycleRule,
} from '../storage-provider.interface';

@Injectable()
export class R2StorageProvider implements IStorageProvider {
  private readonly logger = new Logger(R2StorageProvider.name);
  private s3Client: S3Client;

  constructor(private configService: ConfigService) {
    const accountId = this.configService.get('R2_ACCOUNT_ID');

    this.s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: this.configService.get('R2_ACCESS_KEY_ID') || '',
        secretAccessKey: this.configService.get('R2_SECRET_ACCESS_KEY') || '',
      },
    });
  }

  async putObject(
    bucket: string,
    key: string,
    data: Buffer | NodeJS.ReadableStream,
    options?: StorageOptions,
  ): Promise<{ etag: string; versionId?: string }> {
    try {
      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: data as any,
        ContentType: options?.contentType,
        CacheControl: options?.cacheControl,
        Metadata: options?.metadata,
        // R2 ignores StorageClass — omit it
      });

      const response = await this.s3Client.send(command);
      this.logger.log(`Uploaded object to R2: ${bucket}/${key}`);

      return {
        etag: response.ETag || '',
        versionId: response.VersionId,
      };
    } catch (error) {
      this.logger.error(`Failed to upload to R2: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getObject(bucket: string, key: string): Promise<Buffer> {
    try {
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      });

      const response = await this.s3Client.send(command);
      const stream = response.Body as Readable;

      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.from(chunk));
      }

      return Buffer.concat(chunks);
    } catch (error) {
      this.logger.error(`Failed to get object from R2: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getObjectStream(bucket: string, key: string): Promise<NodeJS.ReadableStream> {
    try {
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      });

      const response = await this.s3Client.send(command);
      return response.Body as NodeJS.ReadableStream;
    } catch (error) {
      this.logger.error(`Failed to get object stream from R2: ${error.message}`, error.stack);
      throw error;
    }
  }

  async deleteObject(bucket: string, key: string): Promise<void> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
      });

      await this.s3Client.send(command);
      this.logger.log(`Deleted object from R2: ${bucket}/${key}`);
    } catch (error) {
      this.logger.error(`Failed to delete from R2: ${error.message}`, error.stack);
      throw error;
    }
  }

  async copyObject(
    sourceBucket: string,
    sourceKey: string,
    destBucket: string,
    destKey: string,
    _options?: StorageOptions,
  ): Promise<void> {
    try {
      const command = new CopyObjectCommand({
        CopySource: `${sourceBucket}/${sourceKey}`,
        Bucket: destBucket,
        Key: destKey,
        MetadataDirective: _options?.metadata ? 'REPLACE' : 'COPY',
        Metadata: _options?.metadata,
      });

      await this.s3Client.send(command);
      this.logger.log(`Copied object in R2: ${sourceBucket}/${sourceKey} -> ${destBucket}/${destKey}`);
    } catch (error) {
      this.logger.error(`Failed to copy in R2: ${error.message}`, error.stack);
      throw error;
    }
  }

  async changeStorageTier(_bucket: string, _key: string, _tier: StorageTier): Promise<void> {
    // R2 does not support storage classes — all objects use standard storage.
    // This is intentionally a no-op.
    this.logger.debug('changeStorageTier is a no-op on R2 (no storage class support)');
  }

  async headObject(bucket: string, key: string): Promise<StorageObject> {
    try {
      const command = new HeadObjectCommand({
        Bucket: bucket,
        Key: key,
      });

      const response = await this.s3Client.send(command);

      return {
        key,
        size: response.ContentLength || 0,
        etag: response.ETag || '',
        lastModified: response.LastModified || new Date(),
        contentType: response.ContentType,
        metadata: response.Metadata,
        tier: StorageTier.HOT, // R2 has no storage classes
      };
    } catch (error) {
      this.logger.error(`Failed to head object in R2: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getPresignedUrl(bucket: string, key: string, expiresIn: number): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      });

      return await getSignedUrl(this.s3Client, command, { expiresIn });
    } catch (error) {
      this.logger.error(`Failed to generate presigned URL: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getPresignedUploadUrl(
    bucket: string,
    key: string,
    expiresIn: number,
    options?: StorageOptions,
  ): Promise<string> {
    try {
      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: options?.contentType,
      });

      return await getSignedUrl(this.s3Client, command, { expiresIn });
    } catch (error) {
      this.logger.error(`Failed to generate presigned upload URL: ${error.message}`, error.stack);
      throw error;
    }
  }

  async listObjects(
    bucket: string,
    prefix?: string,
    maxKeys: number = 1000,
  ): Promise<StorageObject[]> {
    try {
      const command = new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        MaxKeys: maxKeys,
      });

      const response = await this.s3Client.send(command);

      return (response.Contents || []).map((obj) => ({
        key: obj.Key || '',
        size: obj.Size || 0,
        etag: obj.ETag || '',
        lastModified: obj.LastModified || new Date(),
        tier: StorageTier.HOT, // R2 has no storage classes
      }));
    } catch (error) {
      this.logger.error(`Failed to list objects in R2: ${error.message}`, error.stack);
      throw error;
    }
  }

  async objectExists(bucket: string, key: string): Promise<boolean> {
    try {
      await this.headObject(bucket, key);
      return true;
    } catch (error) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw error;
    }
  }

  async createMultipartUpload(
    bucket: string,
    key: string,
    options?: StorageOptions,
  ): Promise<MultipartUpload> {
    try {
      const command = new CreateMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        ContentType: options?.contentType,
        Metadata: options?.metadata,
      });

      const response = await this.s3Client.send(command);

      return {
        uploadId: response.UploadId || '',
        key,
        partSize: 5 * 1024 * 1024, // 5MB default
      };
    } catch (error) {
      this.logger.error(`Failed to create multipart upload: ${error.message}`, error.stack);
      throw error;
    }
  }

  async uploadPart(
    bucket: string,
    key: string,
    uploadId: string,
    partNumber: number,
    data: Buffer,
  ): Promise<UploadPart> {
    try {
      const command = new UploadPartCommand({
        Bucket: bucket,
        Key: key,
        UploadId: uploadId,
        PartNumber: partNumber,
        Body: data,
      });

      const response = await this.s3Client.send(command);

      return {
        partNumber,
        etag: response.ETag || '',
      };
    } catch (error) {
      this.logger.error(`Failed to upload part: ${error.message}`, error.stack);
      throw error;
    }
  }

  async completeMultipartUpload(
    bucket: string,
    key: string,
    uploadId: string,
    parts: UploadPart[],
  ): Promise<{ etag: string }> {
    try {
      const command = new CompleteMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: parts.map((p) => ({
            PartNumber: p.partNumber,
            ETag: p.etag,
          })),
        },
      });

      const response = await this.s3Client.send(command);

      return {
        etag: response.ETag || '',
      };
    } catch (error) {
      this.logger.error(`Failed to complete multipart upload: ${error.message}`, error.stack);
      throw error;
    }
  }

  async abortMultipartUpload(bucket: string, key: string, uploadId: string): Promise<void> {
    try {
      const command = new AbortMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        UploadId: uploadId,
      });

      await this.s3Client.send(command);
      this.logger.log(`Aborted multipart upload: ${uploadId}`);
    } catch (error) {
      this.logger.error(`Failed to abort multipart upload: ${error.message}`, error.stack);
      throw error;
    }
  }

  async setLifecyclePolicy(_bucket: string, _rules: LifecycleRule[]): Promise<void> {
    // R2 lifecycle rules are managed via the Cloudflare dashboard or API,
    // not through S3 lifecycle configuration commands.
    this.logger.warn(
      'R2 lifecycle policies must be configured via the Cloudflare dashboard or API. ' +
      'S3 PutBucketLifecycleConfiguration is not supported.',
    );
  }

  async getStorageMetrics(
    bucket: string,
    prefix?: string,
  ): Promise<{
    totalSize: number;
    objectCount: number;
    tierDistribution: Record<StorageTier, { size: number; count: number }>;
  }> {
    try {
      const objects = await this.listObjects(bucket, prefix);

      let totalSize = 0;
      const objectCount = objects.length;

      for (const obj of objects) {
        totalSize += obj.size;
      }

      // R2 only has one tier (HOT equivalent)
      return {
        totalSize,
        objectCount,
        tierDistribution: {
          [StorageTier.HOT]: { size: totalSize, count: objectCount },
          [StorageTier.WARM]: { size: 0, count: 0 },
          [StorageTier.COLD]: { size: 0, count: 0 },
          [StorageTier.ARCHIVE]: { size: 0, count: 0 },
        },
      };
    } catch (error) {
      this.logger.error(`Failed to get storage metrics: ${error.message}`, error.stack);
      throw error;
    }
  }
}
