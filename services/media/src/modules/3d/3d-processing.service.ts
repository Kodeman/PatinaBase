import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OCIStorageService } from '../storage/oci-storage.service';
import { Model3DService } from './model-3d.service';
import sharp from 'sharp';
import {
  ThreeDValidation,
  ThreeDMetadata,
  LODLevel,
  SupportedInputFormat,
} from './types';

// Re-export for tests
export { ThreeDValidation } from './types';

/**
 * Legacy 3D Processing Service
 * Maintained for backward compatibility - delegates to Model3DService
 */
@Injectable()
export class ThreeDProcessingService {
  private readonly logger = new Logger(ThreeDProcessingService.name);

  // From PRD: validation constraints
  private readonly MAX_TRIANGLES = 500_000;
  private readonly MAX_NODES = 500;
  private readonly MAX_TEXTURES = 8;
  private readonly MAX_TEXTURE_SIZE = 4096;
  private readonly MIN_TEXTURE_SIZE = 1024;
  private readonly MAX_OUTPUT_SIZE = 25 * 1024 * 1024; // 25MB

  constructor(
    private config: ConfigService,
    private ociStorage: OCIStorageService,
    private model3DService: Model3DService,
  ) {}

  /**
   * Validate 3D model against PRD requirements
   * Delegates to Model3DService
   */
  async validate3DModel(buffer: Buffer, format: string): Promise<ThreeDValidation> {
    try {
      return await this.model3DService.validate3DModel(buffer, format);
    } catch (error) {
      this.logger.error(`Failed to validate 3D model: ${error.message}`, error.stack);
      return {
        valid: false,
        issues: [{
          severity: 'error',
          code: 'VALIDATION_FAILED',
          message: `Failed to validate model: ${error.message}`,
        }],
        stats: {
          totalVertices: 0,
          totalTriangles: 0,
          totalNodes: 0,
          totalMeshes: 0,
          totalMaterials: 0,
          totalTextures: 0,
          totalAnimations: 0,
          fileSizeBytes: buffer.length,
          complexityScore: 0,
        },
        recommendations: [],
      };
    }
  }

  /**
   * Process 3D model: normalize, optimize, convert formats
   * Delegates to Model3DService
   */
  async process3DModel(assetId: string, sourceBuffer: Buffer, format: string): Promise<ThreeDMetadata> {
    this.logger.log(`Processing 3D model for asset ${assetId}, format: ${format}`);

    return await this.model3DService.process3DAsset(
      assetId,
      sourceBuffer,
      format as SupportedInputFormat,
    );
  }

  /**
   * Parse model from buffer based on format
   */
  private async parseModel(buffer: Buffer, format: string): Promise<any> {
    // TODO: Implement actual parsing using libraries like:
    // - gltf-transform for GLB/GLTF
    // - assimp bindings for FBX, OBJ, DAE
    // - Custom parser for USDZ

    this.logger.log(`Parsing ${format} model`);

    // Mock implementation
    return {
      triangleCount: 150000,
      nodeCount: 45,
      materialCount: 5,
      textureCount: 6,
      hasAnimations: false,
      upAxis: 'Y',
      textures: [
        { name: 'baseColor', width: 2048, height: 2048 },
        { name: 'normal', width: 2048, height: 2048 },
      ],
      materials: [{ name: 'material_0', type: 'PBR_METALLIC_ROUGHNESS' }],
    };
  }

  /**
   * Normalize model: convert units to meters, Y-up axis, center pivot
   */
  private async normalizeModel(buffer: Buffer, format: string): Promise<any> {
    this.logger.log('Normalizing model: units to meters, Y-up axis, center pivot');

    // TODO: Implement normalization
    // - Convert units to meters
    // - Rotate to Y-up if needed
    // - Center pivot at base
    // - Zero out root rotations

    return buffer; // Return normalized model data
  }

  /**
   * Optimize geometry: weld vertices, remove degenerates, decimate if needed
   */
  private async optimizeGeometry(modelData: any): Promise<any> {
    this.logger.log('Optimizing geometry');

    // TODO: Implement optimization
    // - Weld/merge vertices
    // - Remove degenerate triangles
    // - Mesh decimation if tri count > target
    // - Apply Draco compression

    return {
      ...modelData,
      triangleCount: 120000, // After optimization
      qcIssues: [],
    };
  }

  /**
   * Optimize materials and textures
   */
  private async optimizeMaterialsAndTextures(modelData: any): Promise<any> {
    this.logger.log('Optimizing materials and textures');

    // TODO: Implement material optimization
    // - Convert to PBR metallic-roughness
    // - Pack ORM textures (Occlusion/Roughness/Metallic)
    // - Convert to KTX2 with Basis Universal
    // - Resize textures if > 4K

    return modelData;
  }

  /**
   * Generate LOD levels
   */
  private async generateLODs(modelData: any, assetId: string): Promise<LODLevel[]> {
    this.logger.log('Generating LOD levels');

    const lods: LODLevel[] = [];

    // LOD0: 100% (original optimized)
    const lod0Key = `processed/3d/${assetId}/lod0.glb`;
    lods.push({
      lod: 0,
      triCount: modelData.triangleCount,
      key: lod0Key,
    });

    // LOD1: 50%
    const lod1TriCount = Math.floor(modelData.triangleCount * 0.5);
    const lod1Key = `processed/3d/${assetId}/lod1.glb`;
    lods.push({
      lod: 1,
      triCount: lod1TriCount,
      key: lod1Key,
    });

    // LOD2: 25%
    const lod2TriCount = Math.floor(modelData.triangleCount * 0.25);
    const lod2Key = `processed/3d/${assetId}/lod2.glb`;
    lods.push({
      lod: 2,
      triCount: lod2TriCount,
      key: lod2Key,
    });

    return lods;
  }

  /**
   * Export optimized model as GLB
   */
  private async exportGLB(modelData: any): Promise<Buffer> {
    this.logger.log('Exporting GLB');

    // TODO: Implement GLB export with:
    // - Embedded textures or external KTX2
    // - Draco compression
    // - KHR_draco_mesh_compression extension

    return Buffer.from('GLB_PLACEHOLDER'); // Mock
  }

  /**
   * Export model as USDZ for AR Quick Look
   */
  private async exportUSDZ(modelData: any): Promise<Buffer> {
    this.logger.log('Exporting USDZ for AR Quick Look');

    // TODO: Implement USDZ export
    // - Bake materials where needed
    // - Embed textures (USDZ doesn't support KTX2)
    // - Ensure iOS compatibility

    return Buffer.from('USDZ_PLACEHOLDER'); // Mock
  }

  /**
   * Generate preview snapshots (front, iso, top views)
   */
  private async generateSnapshots(assetId: string, modelData: any): Promise<any> {
    this.logger.log('Generating preview snapshots');

    const snapshots = {
      front: '',
      iso: '',
      top: '',
    };

    // TODO: Implement 3D rendering for snapshots
    // - Render with neutral lighting
    // - White background
    // - 1600px width
    // - Save as JPEG

    for (const angle of ['front', 'iso', 'top']) {
      const snapshotKey = this.ociStorage.generatePreviewKey(assetId, '3d', angle);

      // Mock: create a simple placeholder image
      const placeholderBuffer = await sharp({
        create: {
          width: 1600,
          height: 1600,
          channels: 3,
          background: { r: 255, g: 255, b: 255 },
        },
      })
        .jpeg({ quality: 85 })
        .toBuffer();

      await this.ociStorage.putObject(
        this.config.get('OCI_BUCKET_PROCESSED') as string,
        snapshotKey,
        placeholderBuffer,
      );

      (snapshots as any)[angle] = snapshotKey;
    }

    return snapshots;
  }

  /**
   * Calculate physical dimensions in meters
   */
  private async calculateDimensions(modelData: any): Promise<{
    widthM: number;
    heightM: number;
    depthM: number;
    volumeM3: number;
  }> {
    // TODO: Calculate AABB (Axis-Aligned Bounding Box)

    return {
      widthM: 1.5,
      heightM: 0.8,
      depthM: 0.6,
      volumeM3: 1.5 * 0.8 * 0.6,
    };
  }

  /**
   * Validate AR readiness
   */
  private async validateARReadiness(glbBuffer: Buffer, usdzBuffer: Buffer): Promise<boolean> {
    try {
      // TODO: Validate that:
      // - GLB loads successfully
      // - USDZ loads successfully
      // - Materials are compatible
      // - File sizes within limits

      const glbValid = glbBuffer.length > 0 && glbBuffer.length < this.MAX_OUTPUT_SIZE;
      const usdzValid = usdzBuffer.length > 0 && usdzBuffer.length < this.MAX_OUTPUT_SIZE;

      return glbValid && usdzValid;
    } catch (error) {
      this.logger.error(`AR readiness validation failed: ${error.message}`);
      return false;
    }
  }
}
