import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { PrismaClient } from '../generated/prisma-client';
import { JobQueueService, JobResult } from '../modules/jobs/job-queue.service';
import { ImageTransformService } from '../modules/transform/image-transform.service';
import { ImageOptimizationService } from '../modules/transform/image-optimization.service';
import { DuplicateDetectionService } from '../modules/transform/duplicate-detection.service';
import { SmartCropService } from '../modules/transform/smart-crop.service';
import { ImageAnalysisService } from '../modules/transform/image-analysis.service';
import { MetadataExtractionService } from '../modules/assets/metadata-extraction.service';
import { OCIStorageService } from '../modules/storage/oci-storage.service';

export interface ImageProcessingJobData {
  jobId: string;
  assetId: string;
  rawKey: string;
  operations: ImageOperation[];
}

export interface ImageOperation {
  type:
    | 'optimize'
    | 'transform'
    | 'duplicate_check'
    | 'smart_crop'
    | 'analyze'
    | 'extract_metadata'
    | 'generate_renditions';
  params?: Record<string, any>;
}

@Injectable()
export class ImageProcessingWorker implements OnModuleInit {
  private readonly logger = new Logger(ImageProcessingWorker.name);

  constructor(
    private config: ConfigService,
    private prisma: PrismaClient,
    private jobQueue: JobQueueService,
    private transformService: ImageTransformService,
    private optimizationService: ImageOptimizationService,
    private duplicateService: DuplicateDetectionService,
    private smartCropService: SmartCropService,
    private analysisService: ImageAnalysisService,
    private metadataService: MetadataExtractionService,
    private storageService: OCIStorageService,
  ) {}

  async onModuleInit() {
    // Register worker with queue service
    const concurrency = this.config.get<number>('IMAGE_WORKER_CONCURRENCY', 5);

    this.jobQueue.registerWorker('IMAGE_PROCESS', this.processImage.bind(this), concurrency);
    this.jobQueue.registerWorker(
      'IMAGE_TRANSFORM',
      this.processTransform.bind(this),
      concurrency,
    );

    this.logger.log(`Image processing worker initialized with concurrency: ${concurrency}`);
  }

  /**
   * Main image processing job handler
   */
  async processImage(job: Job<ImageProcessingJobData>): Promise<JobResult> {
    const { assetId, rawKey, operations } = job.data;

    this.logger.log(`Processing image ${assetId} with ${operations.length} operation(s)`);

    try {
      // Fetch image from storage
      const buffer = await this.fetchImageFromStorage(rawKey);

      // Update job progress
      await job.updateProgress(10);

      const results: Record<string, any> = {};

      // Execute operations sequentially
      for (let i = 0; i < operations.length; i++) {
        const operation = operations[i];

        this.logger.log(`Executing operation ${i + 1}/${operations.length}: ${operation.type}`);

        try {
          const result = await this.executeOperation(assetId, buffer, operation);
          results[operation.type] = result;

          // Update progress
          const progress = 10 + ((i + 1) / operations.length) * 80;
          await job.updateProgress(Math.round(progress));
        } catch (error) {
          this.logger.error(`Operation ${operation.type} failed: ${error.message}`);
          results[operation.type] = { error: error.message };
        }
      }

      // Final progress update
      await job.updateProgress(100);

      this.logger.log(`Successfully processed image ${assetId}`);

      return {
        success: true,
        data: results,
      };
    } catch (error) {
      this.logger.error(`Failed to process image ${assetId}: ${error.message}`, error.stack);

      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Execute individual operation
   */
  private async executeOperation(
    assetId: string,
    buffer: Buffer,
    operation: ImageOperation,
  ): Promise<any> {
    switch (operation.type) {
      case 'optimize':
        return this.handleOptimization(assetId, buffer, operation.params);

      case 'transform':
        return this.handleTransform(assetId, buffer, operation.params);

      case 'duplicate_check':
        return this.handleDuplicateCheck(assetId, buffer);

      case 'smart_crop':
        return this.handleSmartCrop(assetId, buffer, operation.params);

      case 'analyze':
        return this.handleAnalysis(assetId, buffer);

      case 'extract_metadata':
        return this.handleMetadataExtraction(assetId, buffer);

      case 'generate_renditions':
        return this.handleRenditionGeneration(assetId, buffer, operation.params);

      default:
        throw new Error(`Unknown operation type: ${operation.type}`);
    }
  }

  /**
   * Handle image optimization
   */
  private async handleOptimization(
    assetId: string,
    buffer: Buffer,
    params?: Record<string, any>,
  ): Promise<any> {
    const format = params?.format || 'jpeg';
    const quality = params?.quality || 85;

    const result = await this.optimizationService.optimizeImage(buffer, format, {
      quality,
      progressive: true,
      stripMetadata: params?.stripMetadata !== false,
      optimizeForWeb: true,
    });

    // Store optimized image
    const optimizedKey = this.storageService.generateRenditionKey(assetId, 800, 600, format);
    await this.storageService.putObject(
      this.config.get('OCI_BUCKET_PROCESSED') || 'processed',
      optimizedKey,
      result.buffer,
    );

    return {
      originalSize: result.originalSize,
      optimizedSize: result.optimizedSize,
      savingsPercent: result.savingsPercent,
      rawKey: optimizedKey,
    };
  }

  /**
   * Handle image transformation
   */
  private async handleTransform(
    assetId: string,
    buffer: Buffer,
    params?: Record<string, any>,
  ): Promise<any> {
    const result = await this.transformService.createRendition(buffer, {
      width: params?.width,
      height: params?.height,
      format: params?.format || 'webp',
      quality: params?.quality || 85,
      fit: params?.fit || 'inside',
    });

    return {
      format: params?.format || 'webp',
      size: result.length,
    };
  }

  /**
   * Handle duplicate detection
   */
  private async handleDuplicateCheck(assetId: string, buffer: Buffer): Promise<any> {
    const result = await this.duplicateService.detectDuplicates(buffer, assetId);

    // Update asset with pHash
    await this.prisma.mediaAsset.update({
      where: { id: assetId },
      data: { phash: result.phash },
    });

    if (result.isDuplicate) {
      this.logger.warn(
        `Asset ${assetId} is a duplicate of ${result.exactMatches.length} existing image(s)`,
      );
    }

    return {
      isDuplicate: result.isDuplicate,
      exactMatches: result.exactMatches.length,
      similarMatches: result.similarMatches.length,
      phash: result.phash,
    };
  }

  /**
   * Handle smart cropping
   */
  private async handleSmartCrop(
    assetId: string,
    buffer: Buffer,
    params?: Record<string, any>,
  ): Promise<any> {
    const crops = params?.crops || [
      { name: 'square', width: 1024, height: 1024 },
      { name: 'landscape', width: 1600, height: 900 },
      { name: 'portrait', width: 900, height: 1600 },
    ];

    const results = await this.smartCropService.generateMultipleCrops(buffer, crops);

    const cropResults: Record<string, any> = {};

    for (const [name, result] of results.entries()) {
      // Store cropped image
      const cropKey = `${assetId}/crops/${name}.webp`;
      await this.storageService.putObject(
        this.config.get('OCI_BUCKET_PROCESSED') || 'processed',
        cropKey,
        result.buffer,
      );

      cropResults[name] = {
        rawKey: cropKey,
        focalPoint: result.focalPoint,
        region: result.region,
      };
    }

    return cropResults;
  }

  /**
   * Handle image analysis
   */
  private async handleAnalysis(assetId: string, buffer: Buffer): Promise<any> {
    const analysis = await this.analysisService.analyzeImage(buffer);

    // Update asset with analysis results - store in palette and qcIssues fields
    const currentAsset = await this.prisma.mediaAsset.findUnique({
      where: { id: assetId },
      select: { palette: true, qcIssues: true },
    });

    const existingPalette = (currentAsset?.palette as any) || {};
    const existingQcIssues = (currentAsset?.qcIssues as any) || [];

    await this.prisma.mediaAsset.update({
      where: { id: assetId },
      data: {
        palette: {
          ...existingPalette,
          dominantColors: analysis.colorAnalysis.dominantColors,
          colorTemperature: analysis.colorAnalysis.temperature,
        },
        qcIssues: {
          ...existingQcIssues,
          analysis: {
            classification: analysis.classification.type,
            confidence: analysis.classification.confidence,
            hasText: analysis.textDetection.hasText,
            hasFaces: analysis.faceDetection.hasFaces,
          },
        },
      },
    });

    return analysis;
  }

  /**
   * Handle metadata extraction
   */
  private async handleMetadataExtraction(assetId: string, buffer: Buffer): Promise<any> {
    const metadata = await this.metadataService.extractImageMetadata(buffer);

    // Update asset with metadata - use proper schema fields
    await this.prisma.mediaAsset.update({
      where: { id: assetId },
      data: {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
        phash: metadata.phash,
        blurhash: metadata.blurhash,
        palette: metadata.palette ? JSON.parse(JSON.stringify({
          colors: metadata.palette,
          colorSpace: metadata.colorSpace,
          hasAlpha: metadata.hasAlpha,
        })) : undefined,
      },
    });

    return metadata;
  }

  /**
   * Handle rendition generation
   */
  private async handleRenditionGeneration(
    assetId: string,
    buffer: Buffer,
    params?: Record<string, any>,
  ): Promise<any> {
    const format = params?.originalFormat || 'jpeg';
    const renditions = await this.transformService.generateRenditions(assetId, buffer, format);

    // Generate LQIP
    const lqipKey = await this.transformService.generateLQIP(assetId, buffer);

    return {
      renditionsCount: renditions.length,
      lqipKey,
    };
  }

  /**
   * Process transformation job
   */
  private async processTransform(job: Job): Promise<JobResult> {
    const { assetId, operation, params } = job.data;

    this.logger.log(`Processing transformation for asset ${assetId}: ${operation}`);

    try {
      const asset = await this.prisma.mediaAsset.findUnique({
        where: { id: assetId },
        select: { rawKey: true },
      });

      if (!asset) {
        throw new Error(`Asset ${assetId} not found`);
      }

      const buffer = await this.fetchImageFromStorage(asset.rawKey);

      await job.updateProgress(30);

      const result = await this.executeOperation(assetId, buffer, { type: operation, params });

      await job.updateProgress(100);

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      this.logger.error(
        `Failed to process transformation for asset ${assetId}: ${error.message}`,
      );

      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Fetch image from storage
   */
  private async fetchImageFromStorage(rawKey: string): Promise<Buffer> {
    const bucket = this.config.get('OCI_BUCKET_RAW') || 'raw';
    const data = await this.storageService.getObject(bucket, rawKey);

    if (!data) {
      throw new Error(`Failed to fetch image from storage: ${rawKey}`);
    }

    return data;
  }

  /**
   * Get asset metadata from appropriate fields (helper)
   * Note: MediaAsset no longer has a generic 'meta' field
   * Data is stored in specific fields: palette, qcIssues, scanResult
   */
  private async getAssetMetadata(assetId: string): Promise<any> {
    const asset = await this.prisma.mediaAsset.findUnique({
      where: { id: assetId },
      select: { palette: true, qcIssues: true, scanResult: true },
    });

    return {
      palette: asset?.palette || {},
      qcIssues: asset?.qcIssues || [],
      scanResult: asset?.scanResult || {},
    };
  }

  /**
   * Batch process multiple images
   */
  async batchProcessImages(
    assetIds: string[],
    operations: ImageOperation[],
  ): Promise<Map<string, string>> {
    const jobIds = new Map<string, string>();

    this.logger.log(`Queuing batch processing for ${assetIds.length} images`);

    for (const assetId of assetIds) {
      try {
        const asset = await this.prisma.mediaAsset.findUnique({
          where: { id: assetId },
          select: { rawKey: true },
        });

        if (!asset) {
          this.logger.error(`Asset ${assetId} not found`);
          continue;
        }

        const jobId = await this.jobQueue.addJob({
          assetId,
          type: 'IMAGE_PROCESS',
          priority: 5,
          meta: {
            rawKey: asset.rawKey,
            operations,
          },
        });

        jobIds.set(assetId, jobId);
      } catch (error) {
        this.logger.error(`Failed to queue job for asset ${assetId}: ${error.message}`);
      }
    }

    this.logger.log(`Queued ${jobIds.size} batch processing jobs`);

    return jobIds;
  }
}
