import { Injectable, Logger } from '@nestjs/common';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import {
  dedup,
  prune,
  weld,
  reorder,
  simplify,
  draco,
  textureCompress,
  resample,
  flatten,
  center,
} from '@gltf-transform/functions';
import { ConversionOptions, OptimizationOptions } from './types';

/**
 * Model Converter Service
 * Converts between 3D formats and optimizes models for AR/VR
 */
@Injectable()
export class ModelConverterService {
  private readonly logger = new Logger(ModelConverterService.name);
  private readonly io: NodeIO;

  constructor() {
    this.io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  }

  /**
   * Convert model from one format to another
   */
  async convertModel(
    inputBuffer: Buffer,
    options: ConversionOptions,
  ): Promise<Buffer> {
    this.logger.log(`Converting from ${options.inputFormat} to ${options.outputFormat}`);

    // Parse input
    const document = await this.parseInput(inputBuffer, options.inputFormat);

    // Normalize if requested
    if (options.normalizeUnits || options.normalizeAxis || options.centerPivot) {
      await this.normalizeModel(document, options);
    }

    // Optimize if requested
    if (options.optimize) {
      await this.optimizeModel(document, options.optimize);
    }

    // Export to target format
    return this.exportOutput(document, options.outputFormat);
  }

  /**
   * Optimize existing GLB model
   */
  async optimizeGLB(
    inputBuffer: Buffer,
    options: OptimizationOptions,
  ): Promise<Buffer> {
    this.logger.log('Optimizing GLB model');

    const document = await this.io.readBinary(new Uint8Array(inputBuffer));
    await this.optimizeModel(document, options);

    const glb = await this.io.writeBinary(document);
    return Buffer.from(glb);
  }

  /**
   * Generate LOD (Level of Detail) version
   */
  async generateLOD(
    inputBuffer: Buffer,
    targetTriangleRatio: number,
  ): Promise<Buffer> {
    this.logger.log(`Generating LOD with ${targetTriangleRatio * 100}% triangle reduction`);

    const document = await this.io.readBinary(new Uint8Array(inputBuffer));

    // Apply simplification
    await document.transform(
      simplify({
        simplifier: require('@gltf-transform/functions').MeshoptSimplifier,
        ratio: targetTriangleRatio,
        error: 0.001,
      }),
    );

    const glb = await this.io.writeBinary(document);
    return Buffer.from(glb);
  }

  /**
   * Parse input buffer to glTF Document
   */
  private async parseInput(
    buffer: Buffer,
    format: string,
  ): Promise<Document> {
    switch (format.toUpperCase()) {
      case 'GLB':
      case 'GLTF':
        return this.io.readBinary(new Uint8Array(buffer));

      case 'OBJ':
        // Convert OBJ to glTF first (requires external converter)
        throw new Error('OBJ to glTF conversion requires external tool - preconvert to GLB');

      case 'FBX':
        throw new Error('FBX to glTF conversion requires external tool - preconvert to GLB');

      default:
        throw new Error(`Unsupported input format: ${format}`);
    }
  }

  /**
   * Normalize model (units, axis, pivot)
   */
  private async normalizeModel(
    document: Document,
    options: ConversionOptions,
  ): Promise<void> {
    this.logger.log('Normalizing model');

    // Center pivot
    if (options.centerPivot) {
      await document.transform(center({ pivot: 'below' }));
    }

    // TODO: Implement axis conversion (Y-up, Z-up, etc.)
    // TODO: Implement unit scale conversion

    this.logger.log('Model normalized');
  }

  /**
   * Optimize model with various techniques
   */
  private async optimizeModel(
    document: Document,
    options: OptimizationOptions,
  ): Promise<void> {
    this.logger.log('Optimizing model with options:', options);

    const transforms = [];

    // Remove duplicate vertices and materials
    if (options.weldVertices !== false) {
      transforms.push(weld());
      transforms.push(dedup());
    }

    // Remove unused data
    transforms.push(prune());

    // Simplify geometry if target triangle count specified
    if (options.targetTriangleCount) {
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

      if (totalTriangles > options.targetTriangleCount) {
        const ratio = options.targetTriangleCount / totalTriangles;
        this.logger.log(`Reducing triangles from ${totalTriangles} to ${options.targetTriangleCount} (ratio: ${ratio.toFixed(2)})`);
        transforms.push(
          simplify({
            simplifier: require('@gltf-transform/functions').MeshoptSimplifier,
            ratio,
            error: 0.001,
          }),
        );
      }
    }

    // Remove animations if requested
    if (options.removeAnimations) {
      const root = document.getRoot();
      for (const animation of root.listAnimations()) {
        animation.dispose();
      }
    }

    // Remove skins if requested
    if (options.removeSkins) {
      const root = document.getRoot();
      for (const skin of root.listSkins()) {
        skin.dispose();
      }
    }

    // Flatten scene hierarchy
    transforms.push(flatten());

    // Optimize draw order
    transforms.push(reorder({ encoder: 'meshopt' }));

    // Resample animations (if not removed)
    if (!options.removeAnimations) {
      transforms.push(resample());
    }

    // Apply all transforms
    await document.transform(...transforms);

    // Apply Draco compression if requested
    if (options.enableDracoCompression !== false) {
      await document.transform(
        draco({
          quantizePosition: 14,
          quantizeNormal: 10,
          quantizeTexcoord: 12,
          quantizeColor: 8,
          quantizeGeneric: 12,
          quantizationVolume: 'mesh',
        }),
      );
    }

    // TODO: Implement texture compression and resizing
    // if (options.enableTextureCompression) {
    //   await document.transform(
    //     textureCompress({
    //       encoder: ktx,
    //       format: 'uastc',
    //     }),
    //   );
    // }

    this.logger.log('Model optimization complete');
  }

  /**
   * Export document to target format
   */
  private async exportOutput(
    document: Document,
    format: string,
  ): Promise<Buffer> {
    switch (format.toUpperCase()) {
      case 'GLB':
        const glb = await this.io.writeBinary(document);
        return Buffer.from(glb);

      case 'GLTF':
        const gltf = await this.io.writeJSON(document);
        return Buffer.from(JSON.stringify(gltf.json));

      case 'USDZ':
        // USDZ export requires external tool or library
        this.logger.warn('USDZ export requires external converter - using Reality Converter or usdz_converter.py');
        throw new Error('USDZ export not yet implemented - use external converter');

      default:
        throw new Error(`Unsupported output format: ${format}`);
    }
  }

  /**
   * Convert GLB to USDZ (requires external tool)
   * This is a placeholder - actual implementation would shell out to usdz_converter
   */
  async convertToUSDZ(glbBuffer: Buffer): Promise<Buffer> {
    this.logger.warn('USDZ conversion requires external tool');
    // TODO: Implement actual USDZ conversion
    // Option 1: Shell out to Apple's usdz_converter (requires macOS)
    // Option 2: Use Reality Converter
    // Option 3: Use python USD library
    throw new Error('USDZ conversion not yet implemented');
  }
}
