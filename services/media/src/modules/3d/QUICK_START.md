# 3D Asset Processing - Quick Start Guide

## Installation

Dependencies are already installed:
```bash
cd services/media
pnpm install
```

## Basic Usage

### 1. Process a 3D Model

```typescript
import { Model3DService } from './modules/3d';

// Inject via DI
constructor(private model3DService: Model3DService) {}

// Process asset
const metadata = await this.model3DService.process3DAsset(
  'asset-123',          // Asset ID
  glbBuffer,            // Buffer of GLB file
  'GLB'                 // Format
);

// Results available in metadata
console.log(metadata.glbKey);      // S3/OCI key for optimized GLB
console.log(metadata.triCount);    // Triangle count
console.log(metadata.arReady);     // AR compatibility
console.log(metadata.lods);        // LOD levels generated
```

### 2. Validate Only

```typescript
const validation = await this.model3DService.validate3DModel(
  buffer,
  'GLB'
);

if (validation.valid) {
  console.log('✅ Model is valid');
} else {
  validation.issues.forEach(issue => {
    console.log(`❌ ${issue.code}: ${issue.message}`);
  });
}
```

### 3. Check Format Support

```typescript
const formats = this.model3DService.getSupportedFormats();
// ['GLB', 'GLTF', 'OBJ', 'FBX', 'STL', 'DAE']

const isSupported = this.model3DService.isFormatSupported('GLB');
// true
```

## Supported Formats

### Input
- ✅ **GLB** - Recommended, best support
- ✅ **GLTF** - Full support
- ✅ **OBJ** - With material support
- 🔄 **FBX** - Requires pre-conversion
- 🔄 **STL** - Requires pre-conversion
- 🔄 **DAE** - Requires pre-conversion

### Output
- ✅ **GLB** - WebGL, ARCore, WebXR
- 🔄 **USDZ** - iOS AR Quick Look (requires external tool)

## What Gets Generated

For each processed model:

1. **Optimized GLB** - Draco compressed, optimized for web/AR
2. **LOD Levels** - 4 levels (100%, 50%, 25%, 10% triangles)
3. **Preview Images** - 6 angles (front, iso, top, back, left, right)
4. **Thumbnail** - 512x512 preview image
5. **Metadata** - Comprehensive JSON metadata
6. **Validation Report** - Issues and recommendations

## Processing Pipeline

```
Input Model
    ↓
Parse & Analyze
    ↓
Validate (check constraints)
    ↓
Convert to GLB (if needed)
    ↓
Optimize
  - Weld vertices
  - Remove duplicates
  - Draco compression
  - Mesh decimation
    ↓
AR Preparation
  - Scale normalization
  - Shadow plane
  - Material optimization
    ↓
Generate LODs
  - LOD0 (100%)
  - LOD1 (50%)
  - LOD2 (25%)
  - LOD3 (10%)
    ↓
Generate Previews
  - 6 angle snapshots
  - Thumbnail
    ↓
Upload to Storage
    ↓
Return Metadata
```

## Validation Rules

### ❌ Errors (Processing Fails)
- Triangle count > 500,000
- Texture size > 4096px
- Node count > 500
- File size > 25MB

### ⚠️ Warnings (Processing Continues)
- Triangle count > 100,000
- Texture size > 2048px
- Non-PBR materials
- Animations present

### 💡 Info (Recommendations)
- Non-power-of-two textures
- High complexity
- Double-sided materials

## Configuration

Set environment variables:

```bash
OCI_BUCKET_PROCESSED=patina-processed
OCI_BUCKET_PUBLIC=patina-public
OCI_REGION=us-ashburn-1
OCI_OBJECT_STORAGE_NAMESPACE=your-namespace
```

## Common Issues

### 1. "Model too large"
**Solution**: Enable aggressive optimization
```typescript
const options: OptimizationOptions = {
  targetTriangleCount: 50000,
  enableDracoCompression: true,
  dracoCompressionLevel: 10,
};
```

### 2. "USDZ not generated"
**Expected**: USDZ requires external converter
**Workaround**: Use Apple's usdz_converter or Reality Converter

### 3. "Preview images are placeholders"
**Expected**: Headless rendering requires WebGL context
**Workaround**: Deploy headless-gl or use GPU server

## Performance Tips

1. **For faster processing:**
   - Use GLB input format (skip conversion)
   - Disable LOD generation if not needed
   - Reduce LOD levels to 2

2. **For better quality:**
   - Use higher Draco compression levels
   - Generate more LOD levels
   - Use higher resolution previews

3. **For AR optimization:**
   - Target < 50,000 triangles
   - Use power-of-two textures
   - Enable aggressive compression

## Example Integration

```typescript
import { Module } from '@nestjs/common';
import { ThreeDModule } from './modules/3d';

@Module({
  imports: [ThreeDModule],
})
export class MediaModule {}

// In your controller/service
import { Model3DService } from './modules/3d';

@Injectable()
export class AssetService {
  constructor(private model3D: Model3DService) {}

  async processUpload(file: Express.Multer.File) {
    const metadata = await this.model3D.process3DAsset(
      generateAssetId(),
      file.buffer,
      this.getFormat(file.mimetype)
    );

    return {
      glbUrl: this.getCDNUrl(metadata.glbKey),
      previews: metadata.snapshots,
      dimensions: {
        width: metadata.widthM,
        height: metadata.heightM,
        depth: metadata.depthM,
      },
      arReady: metadata.arReady,
    };
  }
}
```

## Testing

```bash
# Run tests
pnpm test src/modules/3d

# With coverage
pnpm test:cov src/modules/3d

# Watch mode
pnpm test:watch src/modules/3d
```

## Next Steps

1. ✅ Basic processing works out of the box
2. 🔄 For USDZ: Integrate Apple's converter
3. 🔄 For rendering: Set up headless-gl
4. 💡 For production: Add error handling and retries

## Support

- Documentation: `README.md`
- Types: `types.ts`
- Tests: `*.spec.ts`
- Summary: `/TEAM_INDIA_3D_PROCESSING_SUMMARY.md`

---

**Quick start complete!** Start processing 3D assets in < 5 minutes. 🚀
