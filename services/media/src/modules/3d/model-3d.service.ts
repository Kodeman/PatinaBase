import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OCIStorageService } from '../storage/oci-storage.service';
import { ModelParserService } from './model-parser.service';
import { ModelValidatorService } from './model-validator.service';
import { ModelConverterService } from './model-converter.service';
import { ARPreparationService } from './ar-preparation.service';
import { ModelRendererService } from './model-renderer.service';
import {
  ThreeDMetadata,
  ThreeDValidation,
  ConversionOptions,
  OptimizationOptions,
  LODLevel,
  SupportedInputFormat,
  SUPPORTED_INPUT_FORMATS,
} from './types';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

/**
 * Model3D Service
 * Comprehensive 3D asset processing service for AR/VR experiences
 * Handles GLB, GLTF, OBJ, FBX format processing and optimization
 */
@Injectable()
export class Model3DService {
  private readonly logger = new Logger(Model3DService.name);
  private readonly io: NodeIO;

  constructor(
    private config: ConfigService,
    private ociStorage: OCIStorageService,
    private parser: ModelParserService,
    private validator: ModelValidatorService,
    private converter: ModelConverterService,
    private arPrep: ARPreparationService,
    private renderer: ModelRendererService,
  ) {
    this.io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  }

  /**
   * Process 3D model through complete pipeline
   */
  async process3DAsset(
    assetId: string,
    sourceBuffer: Buffer,
    format: SupportedInputFormat,
  ): Promise<ThreeDMetadata> {
    this.logger.log(`[${assetId}] Starting 3D processing pipeline for ${format} format`);

    try {
      // Step 1: Parse and analyze model
      const modelData = await this.parser.parseModel(sourceBuffer, format);
      this.logger.log(`[${assetId}] Model parsed: ${modelData.metrics.totalTriangles} triangles, ${modelData.materials.length} materials`);

      // Step 2: Validate model
      const validation = await this.validator.validate(modelData);
      if (!validation.valid) {
        this.logger.warn(`[${assetId}] Validation failed with ${validation.issues.length} issues`);
      }

      // Step 3: Convert to GLB if needed
      let glbBuffer: Buffer;
      if (format === 'GLB') {
        glbBuffer = sourceBuffer;
      } else {
        const conversionOptions: ConversionOptions = {
          inputFormat: format,
          outputFormat: 'GLB',
          normalizeUnits: true,
          normalizeAxis: true,
          centerPivot: true,
        };
        glbBuffer = await this.converter.convertModel(sourceBuffer, conversionOptions);
      }

      // Step 4: Optimize model
      const optimizationOptions: OptimizationOptions = {
        targetTriangleCount: 100000,
        targetTextureSizeMax: 2048,
        generateLODs: true,
        lodLevels: 3,
        enableDracoCompression: true,
        dracoCompressionLevel: 7,
        removeAnimations: true,
        removeSkins: true,
        weldVertices: true,
        simplifyMaterials: true,
      };

      const optimizedGLB = await this.converter.optimizeGLB(glbBuffer, optimizationOptions);
      this.logger.log(`[${assetId}] Model optimized: ${sourceBuffer.length} -> ${optimizedGLB.length} bytes (${Math.round((1 - optimizedGLB.length / sourceBuffer.length) * 100)}% reduction)`);

      // Step 5: Prepare for AR
      const document = await this.io.readBinary(new Uint8Array(optimizedGLB));
      await this.arPrep.prepareForAR(document);
      const arReadyGLB = Buffer.from(await this.io.writeBinary(document));

      // Step 6: Upload GLB
      const glbKey = this.ociStorage.generate3DKey(assetId, 'glb');
      const bucket = this.config.get('OCI_BUCKET_PROCESSED') as string;
      await this.ociStorage.putObject(bucket, glbKey, arReadyGLB);
      this.logger.log(`[${assetId}] GLB uploaded to ${glbKey}`);

      // Step 7: Generate USDZ (iOS AR Quick Look)
      let usdzKey: string | undefined;
      try {
        // Note: USDZ generation requires external tool
        // const usdzBuffer = await this.converter.convertToUSDZ(arReadyGLB);
        // usdzKey = this.ociStorage.generate3DKey(assetId, 'usdz');
        // await this.ociStorage.putObject(bucket, usdzKey, usdzBuffer);
        this.logger.warn(`[${assetId}] USDZ generation skipped - requires external converter`);
      } catch (error) {
        this.logger.error(`[${assetId}] USDZ generation failed: ${error.message}`);
      }

      // Step 8: Generate LODs
      const lods = await this.generateLODs(assetId, arReadyGLB, optimizationOptions);
      this.logger.log(`[${assetId}] Generated ${lods.length} LOD levels`);

      // Step 9: Generate preview snapshots
      const snapshots = await this.generateSnapshots(assetId, arReadyGLB);
      this.logger.log(`[${assetId}] Generated ${Object.keys(snapshots).length} preview snapshots`);

      // Step 10: Generate WebGL preview and thumbnail
      const preview = await this.generatePreviews(assetId, arReadyGLB);

      // Step 11: Validate AR readiness
      const arMetadata = await this.arPrep.validateARReadiness(arReadyGLB, undefined);

      // Step 12: Compile metadata
      const metadata: ThreeDMetadata = {
        assetId,
        sourceFormat: format,
        glbKey,
        usdzKey,
        triCount: modelData.metrics.totalTriangles,
        nodeCount: modelData.metrics.totalNodes,
        materialCount: modelData.materials.length,
        textureCount: modelData.textures.length,
        widthM: modelData.boundingBox.size.x,
        heightM: modelData.boundingBox.size.y,
        depthM: modelData.boundingBox.size.z,
        volumeM3:
          modelData.boundingBox.size.x *
          modelData.boundingBox.size.y *
          modelData.boundingBox.size.z,
        arReady: validation.valid && arMetadata.supportsARCore,
        arMetadata,
        lods,
        snapshots,
        preview,
        qcIssues: validation.issues,
        processedAt: new Date(),
      };

      this.logger.log(`[${assetId}] 3D processing complete - AR ready: ${metadata.arReady}`);
      return metadata;
    } catch (error) {
      this.logger.error(`[${assetId}] 3D processing failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Validate 3D model without processing
   */
  async validate3DModel(buffer: Buffer, format: string): Promise<ThreeDValidation> {
    this.logger.log(`Validating ${format} model (${buffer.length} bytes)`);

    const modelData = await this.parser.parseModel(buffer, format);
    return this.validator.validate(modelData);
  }

  /**
   * Generate LOD levels
   */
  private async generateLODs(
    assetId: string,
    glbBuffer: Buffer,
    options: OptimizationOptions,
  ): Promise<LODLevel[]> {
    if (!options.generateLODs || !options.lodLevels) {
      return [];
    }

    const lods: LODLevel[] = [];
    const bucket = this.config.get('OCI_BUCKET_PROCESSED') as string;

    // LOD0: Original optimized (100%)
    const lod0Key = `processed/3d/${assetId}/lod0.glb`;
    await this.ociStorage.putObject(bucket, lod0Key, glbBuffer);

    const document = await this.io.readBinary(new Uint8Array(glbBuffer));
    const root = document.getRoot();
    let totalTriangles = 0;

    for (const mesh of root.listMeshes()) {
      for (const primitive of mesh.listPrimitives()) {
        const indices = primitive.getIndices();
        if (indices) {
          totalTriangles += indices.getCount() / 3;
        }
      }
    }

    lods.push({
      lod: 0,
      triCount: Math.floor(totalTriangles),
      key: lod0Key,
      compressionRatio: 1.0,
    });

    // Generate additional LOD levels
    const reductionFactors = options.lodReductionFactors || [0.5, 0.25, 0.1];

    for (let i = 0; i < Math.min(options.lodLevels - 1, reductionFactors.length); i++) {
      const ratio = reductionFactors[i];
      const lodBuffer = await this.converter.generateLOD(glbBuffer, ratio);
      const lodKey = `processed/3d/${assetId}/lod${i + 1}.glb`;

      await this.ociStorage.putObject(bucket, lodKey, lodBuffer);

      lods.push({
        lod: i + 1,
        triCount: Math.floor(totalTriangles * ratio),
        key: lodKey,
        compressionRatio: ratio,
      });

      this.logger.log(`LOD${i + 1} generated: ${Math.round(ratio * 100)}% triangles`);
    }

    return lods;
  }

  /**
   * Generate preview snapshots from multiple angles
   */
  private async generateSnapshots(
    assetId: string,
    glbBuffer: Buffer,
  ): Promise<ThreeDMetadata['snapshots']> {
    const bucket = this.config.get('OCI_BUCKET_PROCESSED') as string;
    const snapshotBuffers = await this.renderer.renderSnapshots(glbBuffer);

    const snapshots: ThreeDMetadata['snapshots'] = {
      front: '',
      iso: '',
      top: '',
      back: '',
      left: '',
      right: '',
    };

    for (const [angle, buffer] of Object.entries(snapshotBuffers)) {
      const key = this.ociStorage.generatePreviewKey(assetId, '3d', angle);
      await this.ociStorage.putObject(bucket, key, buffer);
      (snapshots as any)[angle] = key;
    }

    return snapshots;
  }

  /**
   * Generate WebGL preview and thumbnail
   */
  private async generatePreviews(
    assetId: string,
    glbBuffer: Buffer,
  ): Promise<ThreeDMetadata['preview']> {
    const bucket = this.config.get('OCI_BUCKET_PROCESSED') as string;

    // WebGL-compatible GLB (already done in main processing)
    const webglKey = `processed/3d/${assetId}/preview.glb`;
    await this.ociStorage.putObject(bucket, webglKey, glbBuffer);

    // Generate thumbnail
    const thumbnailBuffer = await this.renderer.generateThumbnail(glbBuffer, 512);
    const thumbnailKey = `previews/3d/${assetId}/thumbnail.jpg`;
    await this.ociStorage.putObject(bucket, thumbnailKey, thumbnailBuffer);

    return {
      webgl: webglKey,
      thumbnail: thumbnailKey,
    };
  }

  /**
   * Get supported input formats
   */
  getSupportedFormats(): readonly SupportedInputFormat[] {
    return SUPPORTED_INPUT_FORMATS;
  }

  /**
   * Check if format is supported
   */
  isFormatSupported(format: string): boolean {
    return SUPPORTED_INPUT_FORMATS.includes(format.toUpperCase() as any);
  }
}
