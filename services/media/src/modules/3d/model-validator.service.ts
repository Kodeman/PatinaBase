import { Injectable, Logger } from '@nestjs/common';
import {
  ModelData,
  ThreeDValidation,
  ValidationIssue,
  MaterialInfo,
  TextureInfo,
} from './types';

/**
 * Model Validator Service
 * Validates 3D models against PRD requirements and AR/VR best practices
 */
@Injectable()
export class ModelValidatorService {
  private readonly logger = new Logger(ModelValidatorService.name);

  // Validation thresholds from PRD
  private readonly MAX_TRIANGLES = 500_000;
  private readonly RECOMMENDED_TRIANGLES = 100_000;
  private readonly MAX_NODES = 500;
  private readonly MAX_TEXTURES = 8;
  private readonly MAX_TEXTURE_SIZE = 4096;
  private readonly MIN_TEXTURE_SIZE = 512;
  private readonly RECOMMENDED_TEXTURE_SIZE = 2048;
  private readonly MAX_MATERIALS = 10;
  private readonly MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB
  private readonly RECOMMENDED_FILE_SIZE = 10 * 1024 * 1024; // 10MB

  /**
   * Validate 3D model comprehensively
   */
  async validate(modelData: ModelData): Promise<ThreeDValidation> {
    const issues: ValidationIssue[] = [];
    const recommendations: string[] = [];

    // Geometry validation
    this.validateGeometry(modelData, issues, recommendations);

    // Material validation
    this.validateMaterials(modelData, issues, recommendations);

    // Texture validation
    this.validateTextures(modelData, issues, recommendations);

    // Structure validation
    this.validateStructure(modelData, issues, recommendations);

    // File size validation
    this.validateFileSize(modelData, issues, recommendations);

    // AR/VR compatibility
    this.validateARCompatibility(modelData, issues, recommendations);

    // Performance validation
    this.validatePerformance(modelData, issues, recommendations);

    const valid = !issues.some((i) => i.severity === 'error');

    return {
      valid,
      issues,
      stats: modelData.metrics,
      recommendations,
    };
  }

  /**
   * Validate polygon count and geometry quality
   */
  private validateGeometry(
    modelData: ModelData,
    issues: ValidationIssue[],
    recommendations: string[],
  ): void {
    const { totalTriangles, totalVertices } = modelData.metrics;

    // Triangle count validation
    if (totalTriangles > this.MAX_TRIANGLES) {
      issues.push({
        severity: 'error',
        code: 'TRIANGLE_COUNT_EXCEEDED',
        message: `Triangle count ${totalTriangles.toLocaleString()} exceeds maximum ${this.MAX_TRIANGLES.toLocaleString()}`,
        details: { current: totalTriangles, maximum: this.MAX_TRIANGLES },
      });
    } else if (totalTriangles > this.RECOMMENDED_TRIANGLES) {
      issues.push({
        severity: 'warning',
        code: 'TRIANGLE_COUNT_HIGH',
        message: `Triangle count ${totalTriangles.toLocaleString()} exceeds recommended ${this.RECOMMENDED_TRIANGLES.toLocaleString()}`,
        details: { current: totalTriangles, recommended: this.RECOMMENDED_TRIANGLES },
      });
      recommendations.push(
        'Consider using mesh decimation to reduce triangle count for better mobile performance',
      );
    }

    // Check for degenerate geometry
    for (const mesh of modelData.meshes) {
      if (mesh.vertexCount === 0 || mesh.triangleCount === 0) {
        issues.push({
          severity: 'warning',
          code: 'EMPTY_MESH',
          message: `Mesh "${mesh.name}" is empty (no geometry)`,
          details: { meshName: mesh.name },
        });
      }

      // Check for excessively dense meshes
      if (mesh.triangleCount > 100000) {
        recommendations.push(
          `Mesh "${mesh.name}" has ${mesh.triangleCount.toLocaleString()} triangles - consider splitting or decimating`,
        );
      }
    }

    // Vertex to triangle ratio check (should be close to 2:1 for efficient geometry)
    const ratio = totalVertices / totalTriangles;
    if (ratio > 3) {
      issues.push({
        severity: 'info',
        code: 'INEFFICIENT_GEOMETRY',
        message: `High vertex-to-triangle ratio (${ratio.toFixed(2)}:1) suggests unoptimized geometry`,
        details: { ratio },
      });
      recommendations.push('Run vertex welding to merge duplicate vertices');
    }
  }

  /**
   * Validate material setup
   */
  private validateMaterials(
    modelData: ModelData,
    issues: ValidationIssue[],
    recommendations: string[],
  ): void {
    const { materials } = modelData;

    // Material count validation
    if (materials.length > this.MAX_MATERIALS) {
      issues.push({
        severity: 'warning',
        code: 'TOO_MANY_MATERIALS',
        message: `Material count ${materials.length} exceeds recommended maximum ${this.MAX_MATERIALS}`,
        details: { current: materials.length, maximum: this.MAX_MATERIALS },
      });
      recommendations.push('Consider consolidating materials to reduce draw calls');
    }

    // Material type validation
    for (const material of materials) {
      if (material.type !== 'PBR_METALLIC_ROUGHNESS') {
        issues.push({
          severity: 'warning',
          code: 'MATERIAL_TYPE_NOT_PBR',
          message: `Material "${material.name}" is ${material.type}, should be PBR_METALLIC_ROUGHNESS`,
          details: { materialName: material.name, type: material.type },
        });
        recommendations.push(
          `Convert material "${material.name}" to PBR metallic-roughness workflow`,
        );
      }

      // Check for transparency issues
      if (material.alphaMode === 'BLEND' || (material.baseColor && material.baseColor.a < 1)) {
        issues.push({
          severity: 'info',
          code: 'TRANSPARENCY_DETECTED',
          message: `Material "${material.name}" uses transparency, may impact performance`,
          details: { materialName: material.name },
        });
      }

      // Check for double-sided materials
      if (material.doubleSided) {
        issues.push({
          severity: 'info',
          code: 'DOUBLE_SIDED_MATERIAL',
          message: `Material "${material.name}" is double-sided, will double fragment shader cost`,
          details: { materialName: material.name },
        });
        recommendations.push(
          `Consider modeling proper backfaces instead of using double-sided rendering for "${material.name}"`,
        );
      }
    }
  }

  /**
   * Validate texture setup
   */
  private validateTextures(
    modelData: ModelData,
    issues: ValidationIssue[],
    recommendations: string[],
  ): void {
    const { textures } = modelData;

    // Texture count validation
    if (textures.length > this.MAX_TEXTURES) {
      issues.push({
        severity: 'error',
        code: 'TOO_MANY_TEXTURES',
        message: `Texture count ${textures.length} exceeds maximum ${this.MAX_TEXTURES}`,
        details: { current: textures.length, maximum: this.MAX_TEXTURES },
      });
    }

    // Individual texture validation
    for (const texture of textures) {
      // Size validation
      if (texture.width > this.MAX_TEXTURE_SIZE || texture.height > this.MAX_TEXTURE_SIZE) {
        issues.push({
          severity: 'error',
          code: 'TEXTURE_SIZE_EXCEEDED',
          message: `Texture "${texture.name}" (${texture.width}x${texture.height}) exceeds maximum ${this.MAX_TEXTURE_SIZE}px`,
          details: {
            textureName: texture.name,
            width: texture.width,
            height: texture.height,
            maximum: this.MAX_TEXTURE_SIZE,
          },
        });
      } else if (texture.width > this.RECOMMENDED_TEXTURE_SIZE || texture.height > this.RECOMMENDED_TEXTURE_SIZE) {
        issues.push({
          severity: 'warning',
          code: 'TEXTURE_SIZE_HIGH',
          message: `Texture "${texture.name}" (${texture.width}x${texture.height}) exceeds recommended ${this.RECOMMENDED_TEXTURE_SIZE}px`,
          details: {
            textureName: texture.name,
            width: texture.width,
            height: texture.height,
            recommended: this.RECOMMENDED_TEXTURE_SIZE,
          },
        });
      }

      if (texture.width < this.MIN_TEXTURE_SIZE || texture.height < this.MIN_TEXTURE_SIZE) {
        issues.push({
          severity: 'info',
          code: 'TEXTURE_SIZE_LOW',
          message: `Texture "${texture.name}" (${texture.width}x${texture.height}) is below recommended minimum ${this.MIN_TEXTURE_SIZE}px`,
          details: {
            textureName: texture.name,
            width: texture.width,
            height: texture.height,
          },
        });
      }

      // Power-of-two check
      if (!this.isPowerOfTwo(texture.width) || !this.isPowerOfTwo(texture.height)) {
        issues.push({
          severity: 'warning',
          code: 'TEXTURE_NOT_POT',
          message: `Texture "${texture.name}" (${texture.width}x${texture.height}) is not power-of-two`,
          details: {
            textureName: texture.name,
            width: texture.width,
            height: texture.height,
          },
        });
        recommendations.push(
          `Resize texture "${texture.name}" to power-of-two dimensions for better GPU compatibility`,
        );
      }

      // Format validation
      if (texture.format !== 'png' && texture.format !== 'jpeg' && texture.format !== 'jpg') {
        issues.push({
          severity: 'info',
          code: 'TEXTURE_FORMAT_UNUSUAL',
          message: `Texture "${texture.name}" uses format ${texture.format}, consider PNG or JPEG`,
          details: {
            textureName: texture.name,
            format: texture.format,
          },
        });
      }
    }
  }

  /**
   * Validate model structure
   */
  private validateStructure(
    modelData: ModelData,
    issues: ValidationIssue[],
    recommendations: string[],
  ): void {
    const { totalNodes, totalMeshes } = modelData.metrics;

    // Node count validation
    if (totalNodes > this.MAX_NODES) {
      issues.push({
        severity: 'error',
        code: 'TOO_MANY_NODES',
        message: `Node count ${totalNodes} exceeds maximum ${this.MAX_NODES}`,
        details: { current: totalNodes, maximum: this.MAX_NODES },
      });
    }

    // Check for empty nodes
    const emptyNodeCount = totalNodes - totalMeshes;
    if (emptyNodeCount > totalNodes * 0.5) {
      issues.push({
        severity: 'info',
        code: 'MANY_EMPTY_NODES',
        message: `${emptyNodeCount} empty nodes detected (${Math.round((emptyNodeCount / totalNodes) * 100)}% of total)`,
        details: { emptyNodes: emptyNodeCount, totalNodes },
      });
      recommendations.push('Consider flattening scene hierarchy to reduce empty nodes');
    }

    // Coordinate system check
    if (modelData.upAxis !== 'Y') {
      issues.push({
        severity: 'warning',
        code: 'NON_STANDARD_UP_AXIS',
        message: `Model uses ${modelData.upAxis}-up axis, standard is Y-up`,
        details: { upAxis: modelData.upAxis },
      });
      recommendations.push('Convert model to Y-up coordinate system for better compatibility');
    }

    // Animation check
    if (modelData.hasAnimations) {
      issues.push({
        severity: 'warning',
        code: 'ANIMATIONS_PRESENT',
        message: `Model contains ${modelData.metrics.totalAnimations} animations which may be stripped`,
        details: { animationCount: modelData.metrics.totalAnimations },
      });
      recommendations.push('Animations are not supported in MVP - they will be removed');
    }

    // Skinning check
    if (modelData.hasSkins) {
      issues.push({
        severity: 'warning',
        code: 'SKINNING_PRESENT',
        message: 'Model contains skeletal skinning data',
      });
      recommendations.push('Skinning data may be removed to reduce complexity');
    }
  }

  /**
   * Validate file size
   */
  private validateFileSize(
    modelData: ModelData,
    issues: ValidationIssue[],
    recommendations: string[],
  ): void {
    const { fileSizeBytes } = modelData.metrics;

    if (fileSizeBytes > this.MAX_FILE_SIZE) {
      issues.push({
        severity: 'error',
        code: 'FILE_SIZE_EXCEEDED',
        message: `File size ${this.formatBytes(fileSizeBytes)} exceeds maximum ${this.formatBytes(this.MAX_FILE_SIZE)}`,
        details: { current: fileSizeBytes, maximum: this.MAX_FILE_SIZE },
      });
    } else if (fileSizeBytes > this.RECOMMENDED_FILE_SIZE) {
      issues.push({
        severity: 'warning',
        code: 'FILE_SIZE_HIGH',
        message: `File size ${this.formatBytes(fileSizeBytes)} exceeds recommended ${this.formatBytes(this.RECOMMENDED_FILE_SIZE)}`,
        details: { current: fileSizeBytes, recommended: this.RECOMMENDED_FILE_SIZE },
      });
      recommendations.push('Enable Draco compression to reduce file size by 50-90%');
    }
  }

  /**
   * Validate AR/VR compatibility
   */
  private validateARCompatibility(
    modelData: ModelData,
    issues: ValidationIssue[],
    recommendations: string[],
  ): void {
    // Check bounding box size (AR models should be reasonably sized)
    const { size } = modelData.boundingBox;
    const maxDimension = Math.max(size.x, size.y, size.z);

    if (maxDimension > 10) {
      issues.push({
        severity: 'warning',
        code: 'MODEL_TOO_LARGE',
        message: `Model dimensions (${size.x.toFixed(2)}m x ${size.y.toFixed(2)}m x ${size.z.toFixed(2)}m) may be too large for AR`,
        details: { dimensions: size },
      });
      recommendations.push('Scale model to real-world dimensions for AR experiences');
    }

    if (maxDimension < 0.01) {
      issues.push({
        severity: 'warning',
        code: 'MODEL_TOO_SMALL',
        message: `Model dimensions (${size.x.toFixed(4)}m x ${size.y.toFixed(4)}m x ${size.z.toFixed(4)}m) may be too small for AR`,
        details: { dimensions: size },
      });
    }

    // Check for optimal complexity for mobile AR
    const { totalTriangles } = modelData.metrics;
    if (totalTriangles > 50000) {
      recommendations.push(
        'For optimal mobile AR performance, keep triangle count under 50,000',
      );
    }
  }

  /**
   * Validate performance characteristics
   */
  private validatePerformance(
    modelData: ModelData,
    issues: ValidationIssue[],
    recommendations: string[],
  ): void {
    const complexity = modelData.metrics.complexityScore;

    if (complexity > 80) {
      issues.push({
        severity: 'warning',
        code: 'HIGH_COMPLEXITY',
        message: `Model complexity score is ${complexity}/100 - may impact performance on mobile devices`,
        details: { score: complexity },
      });
      recommendations.push('Consider optimizing model for better mobile performance');
    }

    // Draw call estimation
    const estimatedDrawCalls = modelData.meshes.length * modelData.materials.length;
    if (estimatedDrawCalls > 50) {
      issues.push({
        severity: 'info',
        code: 'HIGH_DRAW_CALLS',
        message: `Estimated ${estimatedDrawCalls} draw calls may impact performance`,
        details: { drawCalls: estimatedDrawCalls },
      });
      recommendations.push('Merge meshes and consolidate materials to reduce draw calls');
    }
  }

  /**
   * Check if number is power of two
   */
  private isPowerOfTwo(value: number): boolean {
    return (value & (value - 1)) === 0 && value !== 0;
  }

  /**
   * Format bytes to human-readable string
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }
}
