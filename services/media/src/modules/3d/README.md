# 3D Asset Processing Module

Team India's comprehensive 3D asset processing system for AR/VR experiences in the Patina Product Catalog Phase 2.

## Overview

This module provides end-to-end 3D model processing capabilities including:
- Multi-format parsing and conversion
- Model validation and analysis
- Optimization for web and mobile
- AR/VR preparation (ARKit, ARCore, WebXR)
- Preview generation
- LOD (Level of Detail) generation

## Supported Formats

### Input Formats
- **GLB** (GLTF Binary) - Primary format
- **GLTF** (GLTF JSON + Binary)
- **OBJ** (Wavefront OBJ with MTL materials)
- **FBX** (Autodesk FBX) - Requires conversion
- **STL** (Stereolithography) - Requires conversion
- **DAE** (Collada) - Requires conversion

### Output Formats
- **GLB** - WebGL, ARCore, WebXR compatible
- **USDZ** - iOS AR Quick Look (requires external converter)
- **Draco-compressed GLB** - Optimized for web delivery

## Architecture

```
3D Processing Pipeline
├── Input (GLB/GLTF/OBJ/FBX/STL/DAE)
├── Parsing (ModelParserService)
│   ├── Format detection
│   ├── Metadata extraction
│   └── Bounding box calculation
├── Validation (ModelValidatorService)
│   ├── Polygon count checks
│   ├── Texture size validation
│   ├── Material type validation
│   └── AR compatibility checks
├── Conversion (ModelConverterService)
│   ├── Format conversion
│   ├── Geometry optimization
│   ├── Vertex welding
│   ├── Mesh decimation
│   └── Draco compression
├── AR Preparation (ARPreparationService)
│   ├── Scale normalization
│   ├── Shadow plane generation
│   ├── Material optimization
│   └── Environment lighting
├── Preview Generation (ModelRendererService)
│   ├── Multi-angle snapshots
│   ├── Thumbnail generation
│   └── 360° turntable (planned)
├── LOD Generation
│   ├── LOD0: 100% (original)
│   ├── LOD1: 50% triangles
│   ├── LOD2: 25% triangles
│   └── LOD3: 10% triangles
└── Output
    ├── Optimized GLB
    ├── USDZ (iOS)
    ├── Preview images
    └── Metadata
```

## Services

### Model3DService
Main orchestrator for 3D asset processing pipeline.

```typescript
import { Model3DService } from './model-3d.service';

// Process 3D asset
const metadata = await model3DService.process3DAsset(
  assetId,
  sourceBuffer,
  'GLB'
);

// Validate without processing
const validation = await model3DService.validate3DModel(
  buffer,
  'OBJ'
);
```

### ModelParserService
Parses 3D models and extracts comprehensive metadata.

**Capabilities:**
- GLTF/GLB parsing with gltf-transform
- OBJ parsing with material support
- Mesh and material analysis
- Texture information extraction
- Animation detection
- Bounding box calculation

### ModelValidatorService
Validates models against PRD requirements and AR best practices.

**Validation Rules:**
- Triangle count: Max 500,000 (Recommended: 100,000)
- Texture size: Max 4096px (Recommended: 2048px)
- Material count: Max 10
- Node count: Max 500
- File size: Max 25MB (Recommended: 10MB)
- Material type: PBR Metallic-Roughness preferred
- Coordinate system: Y-up standard

### ModelConverterService
Handles format conversion and model optimization.

**Features:**
- Multi-format conversion
- Draco mesh compression (50-90% size reduction)
- Vertex welding and deduplication
- Mesh decimation for triangle reduction
- Material simplification
- Texture optimization
- LOD generation

### ARPreparationService
Prepares models for AR/VR deployment.

**AR Optimizations:**
- Real-world scale normalization
- Shadow plane generation for ground shadows
- Mobile-optimized materials
- Environment lighting hints
- Camera setup for previews

**Platform Support:**
- ✅ ARKit (iOS AR Quick Look via USDZ)
- ✅ ARCore (Android via GLB)
- ✅ WebXR (Browser-based AR via GLB)

### ModelRendererService
Renders 3D models to 2D images for previews.

**Rendering Options:**
- Multiple camera angles (front, iso, top, back, left, right)
- Configurable lighting (studio, outdoor, neutral)
- Thumbnail generation
- 360° turntable animation (planned)

> **Note:** Headless rendering requires WebGL context (headless-gl or GPU server)

## Usage Examples

### Basic Processing

```typescript
import { Model3DService } from '@patina/media-service';

const model3DService = // inject via DI

// Process GLB file
const metadata = await model3DService.process3DAsset(
  'product-123',
  glbBuffer,
  'GLB'
);

console.log('GLB URL:', metadata.glbKey);
console.log('Triangle count:', metadata.triCount);
console.log('AR Ready:', metadata.arReady);
```

### Custom Optimization

```typescript
import { ModelConverterService, OptimizationOptions } from './model-converter.service';

const options: OptimizationOptions = {
  targetTriangleCount: 50000,
  targetTextureSizeMax: 2048,
  generateLODs: true,
  lodLevels: 3,
  enableDracoCompression: true,
  dracoCompressionLevel: 10,
  removeAnimations: true,
  weldVertices: true,
};

const optimizedGLB = await converterService.optimizeGLB(
  sourceBuffer,
  options
);
```

### Validation Only

```typescript
const validation = await model3DService.validate3DModel(
  modelBuffer,
  'GLB'
);

if (!validation.valid) {
  console.error('Validation issues:', validation.issues);
}

console.log('Recommendations:', validation.recommendations);
```

### LOD Generation

```typescript
// Automatically generates LODs during processing
const metadata = await model3DService.process3DAsset(
  assetId,
  buffer,
  'GLB'
);

// Access LOD files
metadata.lods.forEach(lod => {
  console.log(`LOD${lod.lod}: ${lod.triCount} triangles at ${lod.key}`);
});
```

## Validation Criteria

### Error-Level Issues (Processing Fails)
- Triangle count > 500,000
- Texture size > 4096px
- Texture count > 8
- Node count > 500
- File size > 25MB

### Warning-Level Issues (Processing Continues)
- Triangle count > 100,000
- Texture size > 2048px
- Non-PBR materials
- Non-Y-up coordinate system
- Animations present
- Double-sided materials

### Info-Level Issues (Recommendations)
- Non-power-of-two textures
- High vertex-to-triangle ratio
- Many empty nodes
- Transparency usage
- Model scale concerns

## AR/VR Best Practices

### Mobile Performance
- Target < 50,000 triangles for smooth mobile AR
- Use power-of-two textures (512, 1024, 2048)
- Enable Draco compression for faster loading
- Avoid transparency and double-sided materials
- Use PBR materials for realistic rendering

### Scale and Positioning
- Use real-world meters for units
- Center model at origin
- Place pivot at base for floor placement
- Y-up coordinate system

### Lighting
- Use PBR materials for accurate lighting
- Avoid baked lighting (AR frameworks provide environmental lighting)
- Keep materials simple (base color + normal + metallic/roughness)

## File Size Optimization

Typical compression results with Draco:

| Original | Optimized | Reduction |
|----------|-----------|-----------|
| 50 MB    | 5-15 MB   | 70-90%    |
| 10 MB    | 1-3 MB    | 70-90%    |
| 5 MB     | 500KB-1.5MB | 70-90% |

Additional optimizations:
- Texture compression (KTX2/Basis Universal) - planned
- Mesh decimation for LODs
- Material consolidation
- Node flattening

## Metadata Output

The processing pipeline returns comprehensive metadata:

```typescript
interface ThreeDMetadata {
  assetId: string;
  sourceFormat: string;
  glbKey: string;              // Optimized GLB
  usdzKey?: string;            // iOS USDZ
  triCount: number;
  nodeCount: number;
  materialCount: number;
  textureCount: number;
  widthM: number;              // Dimensions in meters
  heightM: number;
  depthM: number;
  volumeM3: number;
  arReady: boolean;
  arMetadata: {
    supportsARKit: boolean;
    supportsARCore: boolean;
    supportsWebXR: boolean;
    optimizedForMobile: boolean;
    fileSize: {
      glb: number;
      usdz?: number;
    };
  };
  lods: LODLevel[];
  snapshots: {
    front: string;
    iso: string;
    top: string;
    back: string;
    left: string;
    right: string;
  };
  preview: {
    webgl: string;
    thumbnail: string;
  };
  qcIssues: ValidationIssue[];
  processedAt: Date;
}
```

## Dependencies

### Core Libraries
- `three` ^0.180.0 - 3D mathematics and rendering
- `@gltf-transform/core` ^4.2.1 - GLTF processing
- `@gltf-transform/extensions` ^4.2.1 - GLTF extensions
- `@gltf-transform/functions` ^4.2.1 - Optimization functions
- `draco3dgltf` ^1.5.7 - Draco compression
- `gl-matrix` ^3.4.4 - Matrix operations
- `obj-file-parser` ^0.6.2 - OBJ parsing
- `sharp` ^0.33.1 - Image processing

## Limitations and Future Enhancements

### Current Limitations
1. **USDZ Export**: Requires external converter (Apple's usdz_converter or Reality Converter)
2. **Headless Rendering**: Requires WebGL context (headless-gl) for production
3. **FBX/STL/DAE**: Require pre-conversion to GLTF
4. **Turntable Animation**: Not yet implemented
5. **Texture Compression**: KTX2/Basis Universal not yet implemented

### Planned Enhancements
1. **Phase 2.1**
   - Integrated USDZ converter
   - Headless rendering with headless-gl
   - FBX to GLTF conversion pipeline

2. **Phase 2.2**
   - KTX2 texture compression
   - Texture atlas generation
   - Advanced LOD strategies

3. **Phase 2.3**
   - 360° turntable animations
   - Interactive WebGL previews
   - Real-time optimization preview

## Testing

Run tests:
```bash
cd services/media
pnpm test src/modules/3d
```

Test coverage:
```bash
pnpm test:cov src/modules/3d
```

## Performance Metrics

Typical processing times (M1 Mac):

| Model Size | Triangles | Processing Time |
|------------|-----------|-----------------|
| Small      | 10K       | 2-5 seconds     |
| Medium     | 50K       | 5-15 seconds    |
| Large      | 200K      | 15-45 seconds   |
| XLarge     | 500K      | 45-120 seconds  |

*Includes: parsing, validation, optimization, LOD generation, preview rendering*

## Integration

Import the module:

```typescript
import { ThreeDModule } from './modules/3d/3d.module';

@Module({
  imports: [ThreeDModule],
})
export class AppModule {}
```

Use in controllers:

```typescript
import { Model3DService } from '@patina/media-service';

@Controller('assets/3d')
export class ThreeDController {
  constructor(private model3DService: Model3DService) {}

  @Post('process')
  async processAsset(@Body() dto: Process3DDto) {
    return await this.model3DService.process3DAsset(
      dto.assetId,
      dto.buffer,
      dto.format
    );
  }
}
```

## Support

For issues or questions:
- Team India Lead: [Contact]
- Documentation: `/docs/3d-processing.md`
- PRD Reference: Product Catalog Phase 2 - 3D Asset Processing

---

**Team India** - Specializing in 3D Asset Processing for AR/VR Experiences
