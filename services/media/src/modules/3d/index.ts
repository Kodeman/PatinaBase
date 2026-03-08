/**
 * 3D Asset Processing Module
 * Team India - AR/VR 3D Processing for Patina Product Catalog Phase 2
 *
 * @module 3d
 */

// Module
export { ThreeDModule } from './3d.module';

// Main Services
export { ThreeDProcessingService } from './3d-processing.service';
export { Model3DService } from './model-3d.service';

// Specialized Services
export { ModelParserService } from './model-parser.service';
export { ModelValidatorService } from './model-validator.service';
export { ModelConverterService } from './model-converter.service';
export { ARPreparationService } from './ar-preparation.service';
export { ModelRendererService } from './model-renderer.service';

// Types
export * from './types';
