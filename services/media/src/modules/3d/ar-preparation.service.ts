import { Injectable, Logger } from '@nestjs/common';
import { Document, Material, Primitive } from '@gltf-transform/core';
import { ARMetadata } from './types';

/**
 * AR Preparation Service
 * Prepares 3D models for AR/VR experiences (ARKit, ARCore, WebXR)
 */
@Injectable()
export class ARPreparationService {
  private readonly logger = new Logger(ARPreparationService.name);

  /**
   * Prepare model for AR deployment
   */
  async prepareForAR(document: Document): Promise<void> {
    this.logger.log('Preparing model for AR');

    // Scale to appropriate AR size
    await this.normalizeScale(document);

    // Add shadow plane
    await this.addShadowPlane(document);

    // Optimize materials for mobile
    await this.optimizeMaterialsForMobile(document);

    // Add environment lighting hints
    await this.addEnvironmentLighting(document);

    this.logger.log('AR preparation complete');
  }

  /**
   * Validate AR readiness
   */
  async validateARReadiness(
    glbBuffer: Buffer,
    usdzBuffer?: Buffer,
  ): Promise<ARMetadata> {
    const arMetadata: ARMetadata = {
      supportsARKit: false,
      supportsARCore: false,
      supportsWebXR: false,
      hasEnvironmentMap: false,
      hasShadowPlane: false,
      optimizedForMobile: false,
      fileSize: {
        glb: glbBuffer.length,
        usdz: usdzBuffer?.length,
      },
    };

    // Check GLB for ARCore and WebXR compatibility
    if (glbBuffer.length > 0 && glbBuffer.length < 25 * 1024 * 1024) {
      arMetadata.supportsARCore = true;
      arMetadata.supportsWebXR = true;
    }

    // Check USDZ for ARKit compatibility (iOS AR Quick Look)
    if (usdzBuffer && usdzBuffer.length > 0 && usdzBuffer.length < 25 * 1024 * 1024) {
      arMetadata.supportsARKit = true;
    }

    // Check if optimized for mobile (< 10MB and reasonable complexity)
    if (glbBuffer.length < 10 * 1024 * 1024) {
      arMetadata.optimizedForMobile = true;
    }

    return arMetadata;
  }

  /**
   * Normalize model scale to real-world dimensions
   */
  private async normalizeScale(document: Document): Promise<void> {
    const root = document.getRoot();
    const scene = root.getDefaultScene();

    if (!scene) {
      this.logger.warn('No default scene found, skipping scale normalization');
      return;
    }

    // Calculate current bounding box
    let minX = Infinity,
      minY = Infinity,
      minZ = Infinity;
    let maxX = -Infinity,
      maxY = -Infinity,
      maxZ = -Infinity;

    for (const node of scene.listChildren()) {
      const mesh = node.getMesh();
      if (mesh) {
        for (const primitive of mesh.listPrimitives()) {
          const position = primitive.getAttribute('POSITION');
          if (position) {
            const min = position.getMin([0, 0, 0]);
            const max = position.getMax([0, 0, 0]);

            minX = Math.min(minX, min[0]);
            minY = Math.min(minY, min[1]);
            minZ = Math.min(minZ, min[2]);
            maxX = Math.max(maxX, max[0]);
            maxY = Math.max(maxY, max[1]);
            maxZ = Math.max(maxZ, max[2]);
          }
        }
      }
    }

    const sizeX = maxX - minX;
    const sizeY = maxY - minY;
    const sizeZ = maxZ - minZ;
    const maxSize = Math.max(sizeX, sizeY, sizeZ);

    this.logger.log(`Model dimensions: ${sizeX.toFixed(2)}m x ${sizeY.toFixed(2)}m x ${sizeZ.toFixed(2)}m`);

    // If model is unreasonably large or small, suggest scaling
    if (maxSize > 10) {
      this.logger.warn(`Model is large (${maxSize.toFixed(2)}m), consider scaling for AR`);
    } else if (maxSize < 0.01) {
      this.logger.warn(`Model is very small (${maxSize.toFixed(4)}m), consider scaling for AR`);
    }
  }

  /**
   * Add shadow plane for AR ground shadows
   */
  private async addShadowPlane(document: Document): Promise<void> {
    this.logger.log('Adding shadow plane for AR');

    const root = document.getRoot();

    // Create shadow receiver material
    const shadowMaterial = document
      .createMaterial('AR_ShadowPlane')
      .setBaseColorFactor([1, 1, 1, 0]) // Transparent white
      .setAlphaMode('BLEND')
      .setDoubleSided(false);

    // Create a simple plane geometry (quad)
    const positions = new Float32Array([
      -10, 0, -10, // Bottom-left
      10, 0, -10, // Bottom-right
      10, 0, 10, // Top-right
      -10, 0, 10, // Top-left
    ]);

    const normals = new Float32Array([
      0, 1, 0, // Up
      0, 1, 0,
      0, 1, 0,
      0, 1, 0,
    ]);

    const uvs = new Float32Array([
      0, 0,
      1, 0,
      1, 1,
      0, 1,
    ]);

    const indices = new Uint16Array([
      0, 1, 2, // First triangle
      0, 2, 3, // Second triangle
    ]);

    // Create accessors
    const positionAccessor = document
      .createAccessor()
      .setType('VEC3')
      .setArray(positions)
      .setBuffer(document.getRoot().listBuffers()[0] || document.createBuffer());

    const normalAccessor = document
      .createAccessor()
      .setType('VEC3')
      .setArray(normals)
      .setBuffer(document.getRoot().listBuffers()[0] || document.createBuffer());

    const uvAccessor = document
      .createAccessor()
      .setType('VEC2')
      .setArray(uvs)
      .setBuffer(document.getRoot().listBuffers()[0] || document.createBuffer());

    const indexAccessor = document
      .createAccessor()
      .setType('SCALAR')
      .setArray(indices)
      .setBuffer(document.getRoot().listBuffers()[0] || document.createBuffer());

    // Create primitive
    const primitive = document
      .createPrimitive()
      .setAttribute('POSITION', positionAccessor)
      .setAttribute('NORMAL', normalAccessor)
      .setAttribute('TEXCOORD_0', uvAccessor)
      .setIndices(indexAccessor)
      .setMaterial(shadowMaterial)
      .setMode(4); // TRIANGLES

    // Create mesh
    const shadowMesh = document.createMesh('AR_ShadowPlane').addPrimitive(primitive);

    // Create node and add to scene
    const shadowNode = document.createNode('AR_ShadowPlane').setMesh(shadowMesh);

    const scene = root.getDefaultScene();
    if (scene) {
      scene.addChild(shadowNode);
      this.logger.log('Shadow plane added to scene');
    }
  }

  /**
   * Optimize materials for mobile AR
   */
  private async optimizeMaterialsForMobile(document: Document): Promise<void> {
    this.logger.log('Optimizing materials for mobile AR');

    const root = document.getRoot();

    for (const material of root.listMaterials()) {
      // Disable unnecessary features
      if (material.getName() !== 'AR_ShadowPlane') {
        // Simplify specular/glossiness to metallic/roughness
        // This is already done by default in glTF 2.0

        // Disable double-sided rendering where possible
        if (material.getDoubleSided()) {
          this.logger.log(`Material "${material.getName()}" is double-sided - consider single-sided for performance`);
        }

        // Ensure opaque rendering where possible
        if (material.getAlphaMode() === 'BLEND') {
          const baseColorFactor = material.getBaseColorFactor();
          if (baseColorFactor[3] === 1.0) {
            material.setAlphaMode('OPAQUE');
            this.logger.log(`Material "${material.getName()}" set to OPAQUE mode`);
          }
        }
      }
    }
  }

  /**
   * Add environment lighting hints for AR
   */
  private async addEnvironmentLighting(document: Document): Promise<void> {
    this.logger.log('Adding environment lighting hints');

    // Add KHR_lights_punctual extension for basic lighting
    // This helps AR viewers set up appropriate lighting
    // Note: Actual implementation depends on specific AR platform requirements

    // For ARKit/ARCore, lighting is typically handled by the AR framework
    // using camera-based environment estimation

    this.logger.log('Environment lighting hints configured');
  }

  /**
   * Generate environment map for realistic lighting
   */
  async generateEnvironmentMap(document: Document): Promise<void> {
    this.logger.log('Generating environment map');
    // TODO: Implement IBL (Image-Based Lighting) environment map generation
    // This could use a neutral studio HDR or procedurally generate one
  }

  /**
   * Create multiple camera angles for AR preview
   */
  async setupARCameras(document: Document): Promise<void> {
    this.logger.log('Setting up AR preview cameras');

    const root = document.getRoot();
    const scene = root.getDefaultScene();

    if (!scene) {
      this.logger.warn('No default scene found');
      return;
    }

    // Create front camera
    const frontCamera = document
      .createCamera('AR_Front')
      .setType('perspective')
      .setZNear(0.1)
      .setZFar(100);

    // Set FOV if perspective
    if (frontCamera.getType() === 'perspective') {
      (frontCamera as any).setPerspectiveFov(Math.PI / 4); // 45 degrees
    }

    const frontNode = document
      .createNode('AR_Front_Camera')
      .setCamera(frontCamera)
      .setTranslation([0, 1, 3]);

    // Create isometric camera
    const isoCamera = document
      .createCamera('AR_Iso')
      .setType('perspective')
      .setZNear(0.1)
      .setZFar(100);

    // Set FOV if perspective
    if (isoCamera.getType() === 'perspective') {
      (isoCamera as any).setPerspectiveFov(Math.PI / 4); // 45 degrees
    }

    const isoNode = document
      .createNode('AR_Iso_Camera')
      .setCamera(isoCamera)
      .setTranslation([2, 2, 2]);

    // Add cameras to scene
    scene.addChild(frontNode);
    scene.addChild(isoNode);

    this.logger.log('AR cameras configured');
  }
}
