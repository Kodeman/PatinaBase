/**
 * Multi-Provider Storage Service
 * Orchestrates storage operations across multiple providers with intelligent tiering
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  IStorageProvider,
  StorageProvider,
  StorageTier,
  StorageOptions,
  StorageObject,
} from './storage-provider.interface';
import { S3StorageProvider } from './providers/s3-storage.provider';
import { OCIStorageService } from './oci-storage.service';
import * as crypto from 'crypto';

export interface StorageConfig {
  defaultProvider: StorageProvider;
  buckets: {
    raw: string;
    processed: string;
    thumbnails: string;
    archive: string;
  };
  tiering: {
    enabled: boolean;
    rules: TieringRule[];
  };
  replication: {
    enabled: boolean;
    providers: StorageProvider[];
  };
}

export interface TieringRule {
  name: string;
  prefix: string;
  daysToWarm: number; // Days until moved to warm storage
  daysToCold: number; // Days until moved to cold storage
  daysToArchive: number; // Days until moved to archive
  daysToExpire?: number; // Days until deletion
}

export interface DeduplicationResult {
  isDuplicate: boolean;
  existingKey?: string;
  hash: string;
}

@Injectable()
export class MultiStorageService {
  private readonly logger = new Logger(MultiStorageService.name);
  private providers: Map<StorageProvider, IStorageProvider>;
  private config: StorageConfig;

  constructor(
    private configService: ConfigService,
    private s3Provider: S3StorageProvider,
    private ociProvider: OCIStorageService,
  ) {
    this.providers = new Map([
      [StorageProvider.S3, s3Provider],
      // [StorageProvider.OCI, ociProvider], // Wrapped separately
    ]);

    this.config = {
      defaultProvider: StorageProvider.S3,
      buckets: {
        raw: configService.get('STORAGE_BUCKET_RAW', 'patina-raw'),
        processed: configService.get('STORAGE_BUCKET_PROCESSED', 'patina-processed'),
        thumbnails: configService.get('STORAGE_BUCKET_THUMBNAILS', 'patina-thumbnails'),
        archive: configService.get('STORAGE_BUCKET_ARCHIVE', 'patina-archive'),
      },
      tiering: {
        enabled: configService.get('STORAGE_TIERING_ENABLED', 'true') === 'true',
        rules: this.loadTieringRules(),
      },
      replication: {
        enabled: configService.get('STORAGE_REPLICATION_ENABLED', 'false') === 'true',
        providers: [StorageProvider.S3], // Add more as needed
      },
    };
  }

  /**
   * Upload object with automatic provider selection and tiering
   */
  async upload(
    key: string,
    data: Buffer | NodeJS.ReadableStream,
    options?: StorageOptions & { bucket?: string; provider?: StorageProvider },
  ): Promise<{ key: string; etag: string; provider: StorageProvider }> {
    const provider = options?.provider || this.config.defaultProvider;
    const bucket = options?.bucket || this.determineBucket(key);
    const tier = options?.tier || this.determineInitialTier(key);

    const storageProvider = this.getProvider(provider);

    this.logger.log(`Uploading ${key} to ${provider}:${bucket} with tier ${tier}`);

    const result = await storageProvider.putObject(bucket, key, data, {
      ...options,
      tier,
    });

    // Replicate to backup providers if enabled
    if (this.config.replication.enabled) {
      await this.replicateToBackups(bucket, key, data, options);
    }

    return {
      key,
      etag: result.etag,
      provider,
    };
  }

  /**
   * Download object with automatic provider fallback
   */
  async download(
    key: string,
    options?: { bucket?: string; provider?: StorageProvider },
  ): Promise<Buffer> {
    const provider = options?.provider || this.config.defaultProvider;
    const bucket = options?.bucket || this.determineBucket(key);

    try {
      const storageProvider = this.getProvider(provider);
      return await storageProvider.getObject(bucket, key);
    } catch (error) {
      // Fallback to backup providers
      if (this.config.replication.enabled) {
        this.logger.warn(
          `Primary provider failed for ${key}, trying backup providers`,
          error.message,
        );
        return await this.downloadFromBackup(bucket, key);
      }
      throw error;
    }
  }

  /**
   * Check for duplicate content using content hashing
   */
  async checkDuplication(data: Buffer, prefix?: string): Promise<DeduplicationResult> {
    const hash = this.calculateContentHash(data);

    // Search for existing object with same hash
    const bucket = this.config.buckets.processed;
    const provider = this.getProvider(this.config.defaultProvider);

    try {
      const objects = await provider.listObjects(bucket, prefix);

      for (const obj of objects) {
        const metadata = await provider.headObject(bucket, obj.key);
        if (metadata.metadata?.contentHash === hash) {
          return {
            isDuplicate: true,
            existingKey: obj.key,
            hash,
          };
        }
      }
    } catch (error) {
      this.logger.warn(`Deduplication check failed: ${error.message}`);
    }

    return {
      isDuplicate: false,
      hash,
    };
  }

  /**
   * Move object to different storage tier based on access patterns
   */
  async optimizeStorageTier(key: string, lastAccessDays: number): Promise<void> {
    const rule = this.findApplicableRule(key);
    if (!rule) return;

    let targetTier: StorageTier;

    if (lastAccessDays >= rule.daysToArchive) {
      targetTier = StorageTier.ARCHIVE;
    } else if (lastAccessDays >= rule.daysToCold) {
      targetTier = StorageTier.COLD;
    } else if (lastAccessDays >= rule.daysToWarm) {
      targetTier = StorageTier.WARM;
    } else {
      targetTier = StorageTier.HOT;
    }

    const bucket = this.determineBucket(key);
    const provider = this.getProvider(this.config.defaultProvider);

    const current = await provider.headObject(bucket, key);

    if (current.tier !== targetTier) {
      this.logger.log(`Moving ${key} from ${current.tier} to ${targetTier}`);
      await provider.changeStorageTier(bucket, key, targetTier);
    }
  }

  /**
   * Archive unused assets
   */
  async archiveUnusedAssets(daysUnused: number, dryRun: boolean = true): Promise<string[]> {
    const archived: string[] = [];
    const provider = this.getProvider(this.config.defaultProvider);

    for (const bucket of Object.values(this.config.buckets)) {
      const objects = await provider.listObjects(bucket);

      for (const obj of objects) {
        const daysSinceModified =
          (Date.now() - obj.lastModified.getTime()) / (1000 * 60 * 60 * 24);

        if (daysSinceModified >= daysUnused) {
          if (!dryRun) {
            await this.moveToArchive(bucket, obj.key);
          }
          archived.push(`${bucket}/${obj.key}`);
        }
      }
    }

    this.logger.log(
      `${dryRun ? 'Would archive' : 'Archived'} ${archived.length} unused assets`,
    );

    return archived;
  }

  /**
   * Generate storage analytics report
   */
  async getStorageAnalytics(): Promise<{
    totalSize: number;
    totalObjects: number;
    costEstimate: number;
    tierDistribution: Record<StorageTier, { size: number; count: number; cost: number }>;
    bucketBreakdown: Array<{ bucket: string; size: number; count: number }>;
  }> {
    const provider = this.getProvider(this.config.defaultProvider);
    let totalSize = 0;
    let totalObjects = 0;

    const tierDistribution: Record<StorageTier, { size: number; count: number; cost: number }> =
      {
        [StorageTier.HOT]: { size: 0, count: 0, cost: 0 },
        [StorageTier.WARM]: { size: 0, count: 0, cost: 0 },
        [StorageTier.COLD]: { size: 0, count: 0, cost: 0 },
        [StorageTier.ARCHIVE]: { size: 0, count: 0, cost: 0 },
      };

    const bucketBreakdown: Array<{ bucket: string; size: number; count: number }> = [];

    for (const [name, bucket] of Object.entries(this.config.buckets)) {
      const metrics = await provider.getStorageMetrics(bucket);

      totalSize += metrics.totalSize;
      totalObjects += metrics.objectCount;

      bucketBreakdown.push({
        bucket: name,
        size: metrics.totalSize,
        count: metrics.objectCount,
      });

      // Aggregate tier distribution
      for (const [tier, data] of Object.entries(metrics.tierDistribution)) {
        tierDistribution[tier as StorageTier].size += data.size;
        tierDistribution[tier as StorageTier].count += data.count;
        tierDistribution[tier as StorageTier].cost += this.calculateStorageCost(
          tier as StorageTier,
          data.size,
        );
      }
    }

    const costEstimate = Object.values(tierDistribution).reduce(
      (sum, tier) => sum + tier.cost,
      0,
    );

    return {
      totalSize,
      totalObjects,
      costEstimate,
      tierDistribution,
      bucketBreakdown,
    };
  }

  /**
   * Compress object for storage optimization
   */
  async compressForStorage(
    key: string,
    data: Buffer,
    mimeType: string,
  ): Promise<{ data: Buffer; compressed: boolean }> {
    // Only compress if beneficial (images already compressed, videos too)
    if (
      mimeType.startsWith('image/') ||
      mimeType.startsWith('video/') ||
      mimeType === 'application/gzip'
    ) {
      return { data, compressed: false };
    }

    // For text-based files, compress with gzip
    const zlib = await import('zlib');
    const compressed = await new Promise<Buffer>((resolve, reject) => {
      zlib.gzip(data, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });

    // Only use compression if it actually reduces size
    if (compressed.length < data.length * 0.9) {
      this.logger.log(`Compressed ${key} from ${data.length} to ${compressed.length} bytes`);
      return { data: compressed, compressed: true };
    }

    return { data, compressed: false };
  }

  /**
   * Setup lifecycle policies for automatic tiering
   */
  async setupLifecyclePolicies(): Promise<void> {
    if (!this.config.tiering.enabled) {
      this.logger.log('Storage tiering is disabled');
      return;
    }

    const provider = this.getProvider(this.config.defaultProvider);

    for (const [name, bucket] of Object.entries(this.config.buckets)) {
      const lifecycleRules = this.config.tiering.rules
        .filter((rule) => this.bucketMatchesRule(name, rule))
        .map((rule) => ({
          id: rule.name,
          prefix: rule.prefix,
          transitions: [
            { days: rule.daysToWarm, tier: StorageTier.WARM },
            { days: rule.daysToCold, tier: StorageTier.COLD },
            { days: rule.daysToArchive, tier: StorageTier.ARCHIVE },
          ],
          expiration: rule.daysToExpire ? { days: rule.daysToExpire } : undefined,
        }));

      if (lifecycleRules.length > 0) {
        await provider.setLifecyclePolicy(bucket, lifecycleRules);
        this.logger.log(`Set ${lifecycleRules.length} lifecycle rules for ${bucket}`);
      }
    }
  }

  private getProvider(provider: StorageProvider): IStorageProvider {
    const instance = this.providers.get(provider);
    if (!instance) {
      throw new Error(`Storage provider ${provider} not configured`);
    }
    return instance;
  }

  private determineBucket(key: string): string {
    if (key.startsWith('raw/')) return this.config.buckets.raw;
    if (key.startsWith('archive/')) return this.config.buckets.archive;
    if (key.includes('thumbnail') || key.includes('preview'))
      return this.config.buckets.thumbnails;
    return this.config.buckets.processed;
  }

  private determineInitialTier(key: string): StorageTier {
    // Frequently accessed content starts hot
    if (key.includes('thumbnail') || key.includes('preview')) return StorageTier.HOT;
    // Raw uploads can start warm
    if (key.startsWith('raw/')) return StorageTier.WARM;
    // Processed content is hot
    return StorageTier.HOT;
  }

  private findApplicableRule(key: string): TieringRule | undefined {
    return this.config.tiering.rules.find((rule) => key.startsWith(rule.prefix));
  }

  private bucketMatchesRule(bucketName: string, rule: TieringRule): boolean {
    return rule.prefix.toLowerCase().includes(bucketName.toLowerCase());
  }

  private calculateContentHash(data: Buffer): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  private async replicateToBackups(
    bucket: string,
    key: string,
    data: Buffer | NodeJS.ReadableStream,
    options?: StorageOptions,
  ): Promise<void> {
    const backupProviders = this.config.replication.providers.filter(
      (p) => p !== this.config.defaultProvider,
    );

    for (const providerType of backupProviders) {
      try {
        const provider = this.getProvider(providerType);
        await provider.putObject(bucket, key, data, options);
        this.logger.log(`Replicated ${key} to backup provider ${providerType}`);
      } catch (error) {
        this.logger.error(`Failed to replicate to ${providerType}: ${error.message}`);
      }
    }
  }

  private async downloadFromBackup(bucket: string, key: string): Promise<Buffer> {
    for (const providerType of this.config.replication.providers) {
      try {
        const provider = this.getProvider(providerType);
        return await provider.getObject(bucket, key);
      } catch (error) {
        this.logger.warn(`Backup provider ${providerType} failed for ${key}`);
      }
    }

    throw new Error(`Unable to retrieve ${key} from any provider`);
  }

  private async moveToArchive(sourceBucket: string, key: string): Promise<void> {
    const provider = this.getProvider(this.config.defaultProvider);
    const archiveBucket = this.config.buckets.archive;
    const archiveKey = `archive/${new Date().getFullYear()}/${key}`;

    await provider.copyObject(sourceBucket, key, archiveBucket, archiveKey, {
      tier: StorageTier.ARCHIVE,
    });

    await provider.deleteObject(sourceBucket, key);

    this.logger.log(`Moved ${sourceBucket}/${key} to archive`);
  }

  private calculateStorageCost(tier: StorageTier, sizeBytes: number): number {
    // AWS S3 pricing per GB per month (approximate)
    const costPerGB: Record<StorageTier, number> = {
      [StorageTier.HOT]: 0.023,
      [StorageTier.WARM]: 0.0125,
      [StorageTier.COLD]: 0.004,
      [StorageTier.ARCHIVE]: 0.00099,
    };

    const sizeGB = sizeBytes / (1024 * 1024 * 1024);
    return sizeGB * costPerGB[tier];
  }

  private loadTieringRules(): TieringRule[] {
    return [
      {
        name: 'raw-assets',
        prefix: 'raw/',
        daysToWarm: 7,
        daysToCold: 30,
        daysToArchive: 90,
      },
      {
        name: 'processed-images',
        prefix: 'processed/images/',
        daysToWarm: 30,
        daysToCold: 90,
        daysToArchive: 365,
      },
      {
        name: 'thumbnails',
        prefix: 'thumbnails/',
        daysToWarm: 60,
        daysToCold: 180,
        daysToArchive: 365,
      },
      {
        name: 'temp-files',
        prefix: 'temp/',
        daysToWarm: 1,
        daysToCold: 3,
        daysToArchive: 7,
        daysToExpire: 14,
      },
    ];
  }
}
