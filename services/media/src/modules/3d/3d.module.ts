import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThreeDProcessingService } from './3d-processing.service';
import { Model3DService } from './model-3d.service';
import { ModelParserService } from './model-parser.service';
import { ModelValidatorService } from './model-validator.service';
import { ModelConverterService } from './model-converter.service';
import { ARPreparationService } from './ar-preparation.service';
import { ModelRendererService } from './model-renderer.service';
import { OCIStorageService } from '../storage/oci-storage.service';

/**
 * 3D Asset Processing Module
 * Provides comprehensive 3D model processing for AR/VR experiences
 *
 * Features:
 * - Multi-format support (GLB, GLTF, OBJ, FBX, STL, DAE)
 * - Model validation and analysis
 * - Format conversion and optimization
 * - AR/VR preparation (ARKit, ARCore, WebXR)
 * - LOD generation
 * - Preview rendering
 * - Draco compression
 * - USDZ export for iOS
 */
@Module({
  imports: [ConfigModule],
  providers: [
    // Core services
    ThreeDProcessingService,
    Model3DService,

    // Specialized services
    ModelParserService,
    ModelValidatorService,
    ModelConverterService,
    ARPreparationService,
    ModelRendererService,

    // Dependencies
    OCIStorageService,
  ],
  exports: [
    ThreeDProcessingService,
    Model3DService,
  ],
})
export class ThreeDModule {}
