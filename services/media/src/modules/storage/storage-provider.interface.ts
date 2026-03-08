/**
 * Storage Provider Interface
 * Defines common interface for multi-cloud storage providers
 */

export enum StorageTier {
  HOT = 'HOT', // Frequently accessed data
  WARM = 'WARM', // Occasionally accessed data
  COLD = 'COLD', // Rarely accessed data
  ARCHIVE = 'ARCHIVE', // Long-term archival
}

export enum StorageProvider {
  S3 = 'S3',
  GCS = 'GCS',
  AZURE = 'AZURE',
  OCI = 'OCI',
}

export interface StorageOptions {
  tier?: StorageTier;
  contentType?: string;
  cacheControl?: string;
  metadata?: Record<string, string>;
  encryption?: boolean;
  redundancy?: 'STANDARD' | 'REDUCED';
}

export interface StorageObject {
  key: string;
  size: number;
  etag: string;
  lastModified: Date;
  contentType?: string;
  metadata?: Record<string, string>;
  tier?: StorageTier;
}

export interface MultipartUpload {
  uploadId: string;
  key: string;
  partSize: number;
}

export interface UploadPart {
  partNumber: number;
  etag: string;
}

export interface LifecycleRule {
  id: string;
  prefix: string;
  transitions: Array<{
    days: number;
    tier: StorageTier;
  }>;
  expiration?: {
    days: number;
  };
}

export interface IStorageProvider {
  /**
   * Upload object to storage
   */
  putObject(
    bucket: string,
    key: string,
    data: Buffer | NodeJS.ReadableStream,
    options?: StorageOptions,
  ): Promise<{ etag: string; versionId?: string }>;

  /**
   * Get object from storage
   */
  getObject(bucket: string, key: string): Promise<Buffer>;

  /**
   * Get object stream (for large files)
   */
  getObjectStream(bucket: string, key: string): Promise<NodeJS.ReadableStream>;

  /**
   * Delete object from storage
   */
  deleteObject(bucket: string, key: string): Promise<void>;

  /**
   * Copy object within or between buckets
   */
  copyObject(
    sourceBucket: string,
    sourceKey: string,
    destBucket: string,
    destKey: string,
    options?: StorageOptions,
  ): Promise<void>;

  /**
   * Move object to different storage tier
   */
  changeStorageTier(bucket: string, key: string, tier: StorageTier): Promise<void>;

  /**
   * Get object metadata without downloading
   */
  headObject(bucket: string, key: string): Promise<StorageObject>;

  /**
   * Generate presigned URL for temporary access
   */
  getPresignedUrl(bucket: string, key: string, expiresIn: number): Promise<string>;

  /**
   * Generate presigned URL for upload
   */
  getPresignedUploadUrl(
    bucket: string,
    key: string,
    expiresIn: number,
    options?: StorageOptions,
  ): Promise<string>;

  /**
   * List objects with prefix
   */
  listObjects(
    bucket: string,
    prefix?: string,
    maxKeys?: number,
  ): Promise<StorageObject[]>;

  /**
   * Check if object exists
   */
  objectExists(bucket: string, key: string): Promise<boolean>;

  /**
   * Initiate multipart upload
   */
  createMultipartUpload(
    bucket: string,
    key: string,
    options?: StorageOptions,
  ): Promise<MultipartUpload>;

  /**
   * Upload part for multipart upload
   */
  uploadPart(
    bucket: string,
    key: string,
    uploadId: string,
    partNumber: number,
    data: Buffer,
  ): Promise<UploadPart>;

  /**
   * Complete multipart upload
   */
  completeMultipartUpload(
    bucket: string,
    key: string,
    uploadId: string,
    parts: UploadPart[],
  ): Promise<{ etag: string }>;

  /**
   * Abort multipart upload
   */
  abortMultipartUpload(bucket: string, key: string, uploadId: string): Promise<void>;

  /**
   * Set lifecycle policies for bucket
   */
  setLifecyclePolicy(bucket: string, rules: LifecycleRule[]): Promise<void>;

  /**
   * Get storage analytics
   */
  getStorageMetrics(
    bucket: string,
    prefix?: string,
  ): Promise<{
    totalSize: number;
    objectCount: number;
    tierDistribution: Record<StorageTier, { size: number; count: number }>;
  }>;
}
