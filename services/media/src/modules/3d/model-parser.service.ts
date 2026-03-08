import { Injectable, Logger } from '@nestjs/common';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import * as THREE from 'three';
import * as OBJParser from 'obj-file-parser';
import {
  ModelData,
  BoundingBox,
  MeshInfo,
  MaterialInfo,
  TextureInfo,
  AnimationInfo,
  ModelMetrics,
  Vector3,
} from './types';

/**
 * Model Parser Service
 * Parses 3D models from various formats and extracts metadata
 */
@Injectable()
export class ModelParserService {
  private readonly logger = new Logger(ModelParserService.name);
  private readonly io: NodeIO;

  constructor() {
    // Initialize glTF-Transform IO with all extensions
    this.io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  }

  /**
   * Parse model from buffer based on format
   */
  async parseModel(buffer: Buffer, format: string): Promise<ModelData> {
    this.logger.log(`Parsing ${format} model (${buffer.length} bytes)`);

    switch (format.toUpperCase()) {
      case 'GLB':
      case 'GLTF':
        return this.parseGLTF(buffer);
      case 'OBJ':
        return this.parseOBJ(buffer);
      case 'FBX':
        return this.parseFBX(buffer);
      case 'STL':
        return this.parseSTL(buffer);
      case 'DAE':
        return this.parseDAE(buffer);
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }

  /**
   * Parse GLTF/GLB format
   */
  private async parseGLTF(buffer: Buffer): Promise<ModelData> {
    try {
      const document = await this.io.readBinary(new Uint8Array(buffer));
      const root = document.getRoot();

      // Extract meshes
      const meshes: MeshInfo[] = [];
      let totalVertices = 0;
      let totalTriangles = 0;

      for (const mesh of root.listMeshes()) {
        for (const primitive of mesh.listPrimitives()) {
          const indices = primitive.getIndices();
          const position = primitive.getAttribute('POSITION');

          const vertexCount = position ? position.getCount() : 0;
          const triangleCount = indices ? indices.getCount() / 3 : vertexCount / 3;

          totalVertices += vertexCount;
          totalTriangles += triangleCount;

          const bbox = this.calculateBoundingBox(position);

          meshes.push({
            name: mesh.getName() || `Mesh_${meshes.length}`,
            primitiveCount: mesh.listPrimitives().length,
            vertexCount,
            triangleCount: Math.floor(triangleCount),
            materialIndex: primitive.getMaterial()
              ? root.listMaterials().indexOf(primitive.getMaterial()!)
              : undefined,
            boundingBox: bbox,
          });
        }
      }

      // Extract materials
      const materials: MaterialInfo[] = root.listMaterials().map((mat, idx) => {
        const baseColorTexture = mat.getBaseColorTexture();
        const normalTexture = mat.getNormalTexture();
        const metallicRoughnessTexture = mat.getMetallicRoughnessTexture();
        const occlusionTexture = mat.getOcclusionTexture();
        const emissiveTexture = mat.getEmissiveTexture();

        return {
          name: mat.getName() || `Material_${idx}`,
          type: 'PBR_METALLIC_ROUGHNESS' as const,
          baseColor: {
            r: mat.getBaseColorFactor()[0],
            g: mat.getBaseColorFactor()[1],
            b: mat.getBaseColorFactor()[2],
            a: mat.getBaseColorFactor()[3],
          },
          metallicFactor: mat.getMetallicFactor(),
          roughnessFactor: mat.getRoughnessFactor(),
          emissiveFactor: {
            r: mat.getEmissiveFactor()[0],
            g: mat.getEmissiveFactor()[1],
            b: mat.getEmissiveFactor()[2],
          },
          doubleSided: mat.getDoubleSided(),
          alphaMode: mat.getAlphaMode().toUpperCase() as any,
          alphaCutoff: mat.getAlphaCutoff(),
          textures: {
            baseColor: baseColorTexture ? this.extractTextureInfo(baseColorTexture) : undefined,
            normal: normalTexture ? this.extractTextureInfo(normalTexture) : undefined,
            metallicRoughness: metallicRoughnessTexture
              ? this.extractTextureInfo(metallicRoughnessTexture)
              : undefined,
            occlusion: occlusionTexture ? this.extractTextureInfo(occlusionTexture) : undefined,
            emissive: emissiveTexture ? this.extractTextureInfo(emissiveTexture) : undefined,
          },
        };
      });

      // Extract textures
      const textures: TextureInfo[] = root.listTextures().map((tex, idx) => {
        const image = tex.getImage();
        return {
          name: tex.getName() || `Texture_${idx}`,
          width: tex.getSize()?.[0] || 0,
          height: tex.getSize()?.[1] || 0,
          format: tex.getMimeType()?.split('/')[1] || 'unknown',
          mimeType: tex.getMimeType() || 'image/png',
          sizeBytes: image ? image.byteLength : 0,
          uri: tex.getURI() || undefined,
        };
      });

      // Extract animations
      const animations: AnimationInfo[] = root.listAnimations().map((anim, idx) => {
        return {
          name: anim.getName() || `Animation_${idx}`,
          duration: this.calculateAnimationDuration(anim),
          channels: anim.listChannels().length,
          samplers: anim.listSamplers().length,
        };
      });

      // Calculate overall bounding box
      const overallBBox = this.calculateOverallBoundingBox(meshes.map((m) => m.boundingBox));

      const metrics: ModelMetrics = {
        totalVertices,
        totalTriangles: Math.floor(totalTriangles),
        totalNodes: root.listNodes().length,
        totalMeshes: meshes.length,
        totalMaterials: materials.length,
        totalTextures: textures.length,
        totalAnimations: animations.length,
        fileSizeBytes: buffer.length,
        complexityScore: this.calculateComplexityScore({
          totalVertices,
          totalTriangles: Math.floor(totalTriangles),
          totalNodes: root.listNodes().length,
          totalMeshes: meshes.length,
          totalMaterials: materials.length,
          totalTextures: textures.length,
          totalAnimations: animations.length,
          fileSizeBytes: buffer.length,
          complexityScore: 0,
        }),
      };

      return {
        format: '3D_MODEL_FORMAT',
        version: '2.0',
        generator: 'glTF-Transform',
        upAxis: 'Y',
        unitScale: 1.0,
        boundingBox: overallBBox,
        meshes,
        materials,
        textures,
        animations,
        metrics,
        hasAnimations: animations.length > 0,
        hasSkins: root.listSkins().length > 0,
        hasMorphTargets: meshes.some((m) => m.primitiveCount > 1),
      };
    } catch (error) {
      this.logger.error(`Failed to parse GLTF: ${error.message}`, error.stack);
      throw new Error(`GLTF parsing failed: ${error.message}`);
    }
  }

  /**
   * Parse OBJ format
   */
  private async parseOBJ(buffer: Buffer): Promise<ModelData> {
    try {
      const text = buffer.toString('utf-8');
      const OBJParserClass = OBJParser as any;
      const parser = new OBJParserClass(text);
      const output = parser.parse();

      let totalVertices = 0;
      let totalTriangles = 0;
      const meshes: MeshInfo[] = [];

      for (const model of output.models) {
        totalVertices += model.vertices.length;
        totalTriangles += model.faces.length;

        const bbox = this.calculateBoundingBoxFromVertices(
          model.vertices.map((v: any) => ({ x: v.x, y: v.y, z: v.z })),
        );

        meshes.push({
          name: model.name || `Mesh_${meshes.length}`,
          primitiveCount: 1,
          vertexCount: model.vertices.length,
          triangleCount: model.faces.length,
          boundingBox: bbox,
        });
      }

      const overallBBox = this.calculateOverallBoundingBox(meshes.map((m) => m.boundingBox));

      const metrics: ModelMetrics = {
        totalVertices,
        totalTriangles,
        totalNodes: output.models.length,
        totalMeshes: meshes.length,
        totalMaterials: 0,
        totalTextures: 0,
        totalAnimations: 0,
        fileSizeBytes: buffer.length,
        complexityScore: this.calculateComplexityScore({
          totalVertices,
          totalTriangles,
          totalNodes: output.models.length,
          totalMeshes: meshes.length,
          totalMaterials: 0,
          totalTextures: 0,
          totalAnimations: 0,
          fileSizeBytes: buffer.length,
          complexityScore: 0,
        }),
      };

      return {
        format: '3D_MODEL_FORMAT',
        version: 'OBJ',
        upAxis: 'Y',
        unitScale: 1.0,
        boundingBox: overallBBox,
        meshes,
        materials: [],
        textures: [],
        animations: [],
        metrics,
        hasAnimations: false,
        hasSkins: false,
        hasMorphTargets: false,
      };
    } catch (error) {
      this.logger.error(`Failed to parse OBJ: ${error.message}`, error.stack);
      throw new Error(`OBJ parsing failed: ${error.message}`);
    }
  }

  /**
   * Parse FBX format (placeholder - requires external library)
   */
  private async parseFBX(buffer: Buffer): Promise<ModelData> {
    this.logger.warn('FBX parsing not fully implemented - using basic analysis');
    // TODO: Implement FBX parsing using fbx2gltf or similar converter
    throw new Error('FBX format not yet supported - convert to GLTF first');
  }

  /**
   * Parse STL format (placeholder)
   */
  private async parseSTL(buffer: Buffer): Promise<ModelData> {
    this.logger.warn('STL parsing not fully implemented');
    throw new Error('STL format not yet supported - convert to GLTF first');
  }

  /**
   * Parse DAE (Collada) format (placeholder)
   */
  private async parseDAE(buffer: Buffer): Promise<ModelData> {
    this.logger.warn('DAE parsing not fully implemented');
    throw new Error('DAE format not yet supported - convert to GLTF first');
  }

  /**
   * Extract texture information from glTF texture
   */
  private extractTextureInfo(texture: any): TextureInfo {
    const image = texture.getImage();
    return {
      name: texture.getName() || 'Unnamed',
      width: texture.getSize()?.[0] || 0,
      height: texture.getSize()?.[1] || 0,
      format: texture.getMimeType()?.split('/')[1] || 'unknown',
      mimeType: texture.getMimeType() || 'image/png',
      sizeBytes: image ? image.byteLength : 0,
      uri: texture.getURI() || undefined,
    };
  }

  /**
   * Calculate bounding box from position accessor
   */
  private calculateBoundingBox(accessor: any): BoundingBox {
    if (!accessor) {
      return this.createEmptyBoundingBox();
    }

    const min = accessor.getMin([0, 0, 0]);
    const max = accessor.getMax([0, 0, 0]);

    return {
      min: { x: min[0], y: min[1], z: min[2] },
      max: { x: max[0], y: max[1], z: max[2] },
      center: {
        x: (min[0] + max[0]) / 2,
        y: (min[1] + max[1]) / 2,
        z: (min[2] + max[2]) / 2,
      },
      size: {
        x: max[0] - min[0],
        y: max[1] - min[1],
        z: max[2] - min[2],
      },
    };
  }

  /**
   * Calculate bounding box from array of vertices
   */
  private calculateBoundingBoxFromVertices(vertices: Vector3[]): BoundingBox {
    if (vertices.length === 0) {
      return this.createEmptyBoundingBox();
    }

    const min = { x: Infinity, y: Infinity, z: Infinity };
    const max = { x: -Infinity, y: -Infinity, z: -Infinity };

    for (const v of vertices) {
      min.x = Math.min(min.x, v.x);
      min.y = Math.min(min.y, v.y);
      min.z = Math.min(min.z, v.z);
      max.x = Math.max(max.x, v.x);
      max.y = Math.max(max.y, v.y);
      max.z = Math.max(max.z, v.z);
    }

    return {
      min,
      max,
      center: {
        x: (min.x + max.x) / 2,
        y: (min.y + max.y) / 2,
        z: (min.z + max.z) / 2,
      },
      size: {
        x: max.x - min.x,
        y: max.y - min.y,
        z: max.z - min.z,
      },
    };
  }

  /**
   * Calculate overall bounding box from multiple bounding boxes
   */
  private calculateOverallBoundingBox(boxes: BoundingBox[]): BoundingBox {
    if (boxes.length === 0) {
      return this.createEmptyBoundingBox();
    }

    const min = { x: Infinity, y: Infinity, z: Infinity };
    const max = { x: -Infinity, y: -Infinity, z: -Infinity };

    for (const box of boxes) {
      min.x = Math.min(min.x, box.min.x);
      min.y = Math.min(min.y, box.min.y);
      min.z = Math.min(min.z, box.min.z);
      max.x = Math.max(max.x, box.max.x);
      max.y = Math.max(max.y, box.max.y);
      max.z = Math.max(max.z, box.max.z);
    }

    return {
      min,
      max,
      center: {
        x: (min.x + max.x) / 2,
        y: (min.y + max.y) / 2,
        z: (min.z + max.z) / 2,
      },
      size: {
        x: max.x - min.x,
        y: max.y - min.y,
        z: max.z - min.z,
      },
    };
  }

  /**
   * Create empty bounding box
   */
  private createEmptyBoundingBox(): BoundingBox {
    return {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 0, y: 0, z: 0 },
      center: { x: 0, y: 0, z: 0 },
      size: { x: 0, y: 0, z: 0 },
    };
  }

  /**
   * Calculate animation duration
   */
  private calculateAnimationDuration(animation: any): number {
    let maxTime = 0;

    for (const sampler of animation.listSamplers()) {
      const input = sampler.getInput();
      if (input) {
        const times = input.getArray();
        if (times && times.length > 0) {
          maxTime = Math.max(maxTime, times[times.length - 1]);
        }
      }
    }

    return maxTime;
  }

  /**
   * Calculate complexity score (0-100)
   */
  private calculateComplexityScore(metrics: ModelMetrics): number {
    const weights = {
      triangles: 0.4,
      textures: 0.2,
      materials: 0.15,
      nodes: 0.15,
      fileSize: 0.1,
    };

    // Normalize scores (0-100 scale)
    const triangleScore = Math.min((metrics.totalTriangles / 500000) * 100, 100);
    const textureScore = Math.min((metrics.totalTextures / 8) * 100, 100);
    const materialScore = Math.min((metrics.totalMaterials / 10) * 100, 100);
    const nodeScore = Math.min((metrics.totalNodes / 500) * 100, 100);
    const fileSizeScore = Math.min((metrics.fileSizeBytes / (25 * 1024 * 1024)) * 100, 100);

    const score =
      triangleScore * weights.triangles +
      textureScore * weights.textures +
      materialScore * weights.materials +
      nodeScore * weights.nodes +
      fileSizeScore * weights.fileSize;

    return Math.round(score);
  }
}
