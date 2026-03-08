/**
 * AWS S3 Storage Provider
 * Multi-provider storage implementation for S3
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
  PutBucketLifecycleConfigurationCommand,
  StorageClass,
  TransitionStorageClass,
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
export class S3StorageProvider implements IStorageProvider {
  private readonly logger = new Logger(S3StorageProvider.name);
  private s3Client: S3Client;

  constructor(private configService: ConfigService) {
    this.s3Client = new S3Client({
      region: this.configService.get('AWS_REGION', 'us-east-1'),
      credentials: {
        accessKeyId: this.configService.get('AWS_ACCESS_KEY_ID') || '',
        secretAccessKey: this.configService.get('AWS_SECRET_ACCESS_KEY') || '',
      },
    } as any);
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
        StorageClass: this.mapTierToS3Class(options?.tier),
        ServerSideEncryption: options?.encryption ? 'AES256' : undefined,
      });

      const response = await this.s3Client.send(command);
      this.logger.log(`Uploaded object to S3: ${bucket}/${key}`);

      return {
        etag: response.ETag || '',
        versionId: response.VersionId,
      };
    } catch (error) {
      this.logger.error(`Failed to upload to S3: ${error.message}`, error.stack);
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
      this.logger.error(`Failed to get object from S3: ${error.message}`, error.stack);
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
      this.logger.error(`Failed to get object stream from S3: ${error.message}`, error.stack);
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
      this.logger.log(`Deleted object from S3: ${bucket}/${key}`);
    } catch (error) {
      this.logger.error(`Failed to delete from S3: ${error.message}`, error.stack);
      throw error;
    }
  }

  async copyObject(
    sourceBucket: string,
    sourceKey: string,
    destBucket: string,
    destKey: string,
    options?: StorageOptions,
  ): Promise<void> {
    try {
      const command = new CopyObjectCommand({
        CopySource: `${sourceBucket}/${sourceKey}`,
        Bucket: destBucket,
        Key: destKey,
        StorageClass: this.mapTierToS3Class(options?.tier),
        MetadataDirective: options?.metadata ? 'REPLACE' : 'COPY',
        Metadata: options?.metadata,
      });

      await this.s3Client.send(command);
      this.logger.log(`Copied object in S3: ${sourceBucket}/${sourceKey} -> ${destBucket}/${destKey}`);
    } catch (error) {
      this.logger.error(`Failed to copy in S3: ${error.message}`, error.stack);
      throw error;
    }
  }

  async changeStorageTier(bucket: string, key: string, tier: StorageTier): Promise<void> {
    try {
      // S3 requires copy-to-self to change storage class
      await this.copyObject(bucket, key, bucket, key, { tier });
      this.logger.log(`Changed storage tier for ${bucket}/${key} to ${tier}`);
    } catch (error) {
      this.logger.error(`Failed to change storage tier: ${error.message}`, error.stack);
      throw error;
    }
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
        tier: this.mapS3ClassToTier(response.StorageClass),
      };
    } catch (error) {
      this.logger.error(`Failed to head object in S3: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getPresignedUrl(bucket: string, key: string, expiresIn: number): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      });

      const url = await getSignedUrl(this.s3Client, command, { expiresIn });
      return url;
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
        StorageClass: this.mapTierToS3Class(options?.tier),
      });

      const url = await getSignedUrl(this.s3Client, command, { expiresIn });
      return url;
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
        tier: this.mapS3ClassToTier(obj.StorageClass),
      }));
    } catch (error) {
      this.logger.error(`Failed to list objects in S3: ${error.message}`, error.stack);
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
        StorageClass: this.mapTierToS3Class(options?.tier),
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

  async setLifecyclePolicy(bucket: string, rules: LifecycleRule[]): Promise<void> {
    try {
      const command = new PutBucketLifecycleConfigurationCommand({
        Bucket: bucket,
        LifecycleConfiguration: {
          Rules: rules.map((rule) => ({
            ID: rule.id,
            Status: 'Enabled',
            Filter: { Prefix: rule.prefix },
            Transitions: rule.transitions.map((t) => ({
              Days: t.days,
              StorageClass: this.mapTierToS3Class(t.tier) as TransitionStorageClass,
            })),
            Expiration: rule.expiration ? { Days: rule.expiration.days } : undefined,
          })),
        },
      });

      await this.s3Client.send(command);
      this.logger.log(`Set lifecycle policy for bucket ${bucket}`);
    } catch (error) {
      this.logger.error(`Failed to set lifecycle policy: ${error.message}`, error.stack);
      throw error;
    }
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

      const tierDistribution: Record<StorageTier, { size: number; count: number }> = {
        [StorageTier.HOT]: { size: 0, count: 0 },
        [StorageTier.WARM]: { size: 0, count: 0 },
        [StorageTier.COLD]: { size: 0, count: 0 },
        [StorageTier.ARCHIVE]: { size: 0, count: 0 },
      };

      let totalSize = 0;

      for (const obj of objects) {
        totalSize += obj.size;
        const tier = obj.tier || StorageTier.HOT;
        tierDistribution[tier].size += obj.size;
        tierDistribution[tier].count++;
      }

      return {
        totalSize,
        objectCount: objects.length,
        tierDistribution,
      };
    } catch (error) {
      this.logger.error(`Failed to get storage metrics: ${error.message}`, error.stack);
      throw error;
    }
  }

  private mapTierToS3Class(tier?: StorageTier): StorageClass | undefined {
    if (!tier) return undefined;

    const mapping: Record<StorageTier, StorageClass> = {
      [StorageTier.HOT]: 'STANDARD',
      [StorageTier.WARM]: 'STANDARD_IA',
      [StorageTier.COLD]: 'GLACIER',
      [StorageTier.ARCHIVE]: 'DEEP_ARCHIVE',
    };

    return mapping[tier];
  }

  private mapS3ClassToTier(storageClass?: string): StorageTier {
    if (!storageClass) return StorageTier.HOT;

    const mapping: Record<string, StorageTier> = {
      STANDARD: StorageTier.HOT,
      STANDARD_IA: StorageTier.WARM,
      ONEZONE_IA: StorageTier.WARM,
      GLACIER: StorageTier.COLD,
      GLACIER_IR: StorageTier.COLD,
      DEEP_ARCHIVE: StorageTier.ARCHIVE,
    };

    return mapping[storageClass] || StorageTier.HOT;
  }
}
