# Media Service Module

## Overview

The Media Service Module provides comprehensive media asset management for the Patina Product Catalog system. It handles upload, processing, storage, retrieval, and lifecycle management of all media types including images, videos, and 3D models.

## Architecture

### Core Components

1. **MediaService** - Central service for all media operations
2. **MediaController** - REST API endpoints for media management
3. **DTOs** - Data Transfer Objects for request/response validation
4. **Guards** - Security and access control
5. **Validators** - File validation and security checks
6. **Interceptors** - Security scanning and request processing

### Directory Structure

```
services/media/src/modules/media/
├── dto/
│   ├── upload-media.dto.ts
│   ├── process-media.dto.ts
│   ├── update-media-metadata.dto.ts
│   ├── media-query.dto.ts
│   └── index.ts
├── guards/
│   └── media-access.guard.ts
├── validators/
│   └── file-validation.pipe.ts
├── interceptors/
│   └── security.interceptor.ts
├── config/
│   └── cors.config.ts
├── media.service.ts
├── media.service.spec.ts
├── media.controller.ts
├── media.controller.spec.ts
├── media.module.ts
└── README.md
```

## Features

### 1. Upload Management

#### Single Upload
```typescript
POST /v1/media/upload
Content-Type: multipart/form-data

{
  "kind": "image",
  "filename": "modern-sofa.jpg",
  "fileSize": 2048576,
  "mimeType": "image/jpeg",
  "productId": "550e8400-e29b-41d4-a716-446655440000",
  "role": "hero",
  "tags": ["furniture", "modern"],
  "isPublic": true
}
```

#### Batch Upload
```typescript
POST /v1/media/upload/batch
Content-Type: multipart/form-data

{
  "uploads": [
    { "kind": "image", "filename": "hero.jpg", ... },
    { "kind": "image", "filename": "angle-1.jpg", ... }
  ]
}
```

### 2. Processing Queue

Media assets are automatically queued for processing with configurable priorities:

```typescript
POST /v1/media/:id/process

{
  "priority": "high",
  "forceReprocess": false,
  "options": {
    "generateThumbnails": true,
    "extractMetadata": true,
    "optimizeQuality": 85,
    "generateWebP": true,
    "extractColorPalette": true,
    "generatePerceptualHash": true,
    "runVirusScan": true
  }
}
```

**Processing Priorities:**
- `urgent` - Priority 1 (immediate processing)
- `high` - Priority 5
- `normal` - Priority 10 (default)
- `low` - Priority 20

### 3. Asset Retrieval

#### Get by ID
```typescript
GET /v1/media/:id?incrementViewCount=true
```

#### Search & Filter
```typescript
GET /v1/media?kind=image&productId=xxx&status=completed&tags=furniture&page=1&limit=20
```

**Supported Filters:**
- `kind` - image|video|model3d
- `productId` - Filter by product
- `variantId` - Filter by variant
- `role` - hero|angle|lifestyle|detail|ar-preview
- `status` - pending|processing|completed|failed|archived
- `tags` - Array of tags
- `uploadedBy` - User ID
- `isPublic` - true|false
- `search` - Full-text search
- `mimeType` - MIME type filter
- `minSize` / `maxSize` - File size range
- `processedOnly` - Only show processed assets

**Sorting:**
- `sortBy` - createdAt|updatedAt|sizeBytes|viewCount|downloadCount
- `sortOrder` - asc|desc

### 4. Metadata Management

```typescript
PUT /v1/media/:id/metadata

{
  "role": "hero",
  "tags": ["furniture", "modern", "living-room"],
  "isPublic": true,
  "licenseType": "commercial",
  "attribution": "Photo by John Doe",
  "meta": {
    "photographer": "John Doe",
    "location": "Studio A",
    "shootDate": "2025-10-01"
  },
  "permissions": {
    "users": ["user-id-1", "user-id-2"],
    "roles": ["designer", "admin"]
  }
}
```

### 5. Asset Deletion

#### Soft Delete (Archive)
```typescript
DELETE /v1/media/:id
```

#### Hard Delete
```typescript
DELETE /v1/media/:id?hardDelete=true
```

### 6. Download Management

```typescript
GET /v1/media/:id/download

Response:
{
  "assetId": "550e8400-e29b-41d4-a716-446655440000",
  "downloadUrl": "https://objectstorage.../presigned-url",
  "expiresAt": "2025-10-06T13:00:00Z"
}
```

### 7. Statistics

```typescript
GET /v1/media/stats/overview?productId=xxx

Response:
{
  "total": 150,
  "byKind": {
    "images": 100,
    "videos": 30,
    "models": 20
  },
  "byStatus": {
    "pending": 5,
    "processing": 10,
    "completed": 130,
    "failed": 5
  }
}
```

## Enhanced MediaAsset Model

The Prisma schema has been enhanced with:

### Processing Status Tracking
- `status` - pending|processing|completed|failed|archived
- `processingError` - Error message if failed
- `processingJobId` - BullMQ job reference
- `processedAt` - Completion timestamp

### Version Management
- `version` - Asset version number
- `originalAssetId` - Reference to original if versioned

### Tagging System
- `tags` - Searchable string array
- `aiTags` - AI-generated tags with confidence scores

### Usage Tracking
- `viewCount` - Number of views
- `downloadCount` - Number of downloads
- `lastAccessedAt` - Last access timestamp

### Security & Access Control
- `uploadedBy` - Uploader user ID
- `isPublic` - Public/private flag
- `permissions` - JSON access control list
- `checksum` - SHA-256 integrity verification

## Security Features

### 1. File Validation

**Size Limits:**
- Images: 50MB max
- Videos: 500MB max
- 3D Models: 500MB max

**Allowed MIME Types:**

*Images:*
- image/jpeg
- image/png
- image/webp
- image/avif
- image/heic

*Videos:*
- video/mp4
- video/webm
- video/quicktime

*3D Models:*
- model/gltf-binary
- model/gltf+json
- model/vnd.usdz+zip
- application/octet-stream

### 2. Virus Scanning

All uploaded files are automatically scanned for malware using the `VirusScannerService` before processing.

### 3. Access Control

The `MediaAccessGuard` enforces:
- Public assets: Open access
- Private assets: Require authentication
- Owner access: Uploader always has access
- Permission-based access: Configurable user/role permissions
- Admin override: Admin users have full access

### 4. Duplicate Detection

Uses perceptual hashing to detect and prevent duplicate uploads:

```typescript
// Automatically checks for duplicates during upload
{
  "duplicate": true,
  "existingAssetId": "existing-asset-id"
}
```

## CORS Configuration

Three CORS configurations are provided:

### 1. Standard API CORS (`corsConfig`)
- Configurable allowed origins
- Development mode: Allow localhost
- Production mode: Whitelist only
- Credentials enabled

### 2. Upload CORS (`uploadCorsConfig`)
- Allow all origins (secured by presigned URL)
- No credentials
- Permissive for direct uploads

### 3. CDN CORS (`cdnCorsConfig`)
- Public CDN access
- GET/HEAD only
- No credentials
- 7-day cache

## Integration Examples

### Upload Flow

```typescript
// 1. Create upload intent
const uploadIntent = await mediaService.uploadSingle(userId, {
  kind: MediaKind.IMAGE,
  filename: 'product-hero.jpg',
  fileSize: file.size,
  mimeType: file.type,
  productId: 'product-123',
  role: MediaRole.HERO,
  tags: ['furniture', 'sofa'],
  isPublic: true
});

// 2. Upload file to presigned URL
await fetch(uploadIntent.uploadUrl, {
  method: 'PUT',
  headers: uploadIntent.headers,
  body: file
});

// 3. Confirm upload
await uploadService.confirmUpload(uploadIntent.uploadSessionId);

// 4. Asset automatically queued for processing
```

### Search & Filter

```typescript
const results = await mediaService.search({
  productId: 'product-123',
  kind: MediaKind.IMAGE,
  status: MediaStatus.COMPLETED,
  tags: ['furniture'],
  sortBy: SortBy.CREATED_AT,
  sortOrder: SortOrder.DESC,
  page: 1,
  limit: 20
});

// Paginated response with metadata
console.log(results.pagination.total); // Total count
console.log(results.data); // Assets array
```

### Batch Processing

```typescript
await mediaService.processBatch({
  assetIds: ['asset-1', 'asset-2', 'asset-3'],
  priority: ProcessingPriority.HIGH,
  options: {
    generateThumbnails: true,
    extractMetadata: true,
    optimizeQuality: 85,
    generateWebP: true
  }
});
```

## Error Handling

The service provides detailed error responses:

### Validation Errors (400)
```json
{
  "error": {
    "code": "MEDIA.VALIDATION",
    "message": "File size exceeds maximum allowed",
    "details": { "maxSize": 52428800, "actualSize": 104857600 }
  }
}
```

### Not Found (404)
```json
{
  "error": {
    "code": "MEDIA.NOT_FOUND",
    "message": "Asset not found",
    "assetId": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

### Access Denied (403)
```json
{
  "error": {
    "code": "MEDIA.ACCESS_DENIED",
    "message": "You do not have permission to access this asset"
  }
}
```

## Events

The service emits events for integration:

- `media.uploaded` - New asset uploaded
- `media.processed` - Asset processing completed
- `media.metadata.updated` - Metadata changed
- `media.deleted` - Asset deleted
- `media.processing.failed` - Processing failed

Subscribe to events:

```typescript
@OnEvent('media.processed')
handleMediaProcessed(payload: { assetId: string; uri: string }) {
  // Handle processed asset
}
```

## Testing

Comprehensive test suites are provided:

```bash
# Run tests
npm run test services/media/src/modules/media

# Run with coverage
npm run test:cov services/media/src/modules/media
```

### Test Coverage

- **MediaService**: Upload, processing, retrieval, search, update, delete
- **MediaController**: All endpoints, error handling, validation
- **Guards**: Access control scenarios
- **Validators**: File validation edge cases

## Performance Considerations

1. **Caching**: Implement Redis caching for frequently accessed assets
2. **CDN**: Use CDN for processed assets distribution
3. **Pagination**: Always use pagination for search results
4. **Async Processing**: Heavy operations run in background queue
5. **Indexes**: Database indexes on frequently queried fields

## Future Enhancements

1. **AI Vision**: Automated tagging and categorization
2. **Smart Cropping**: Intelligent thumbnail generation
3. **Format Conversion**: Automatic format optimization
4. **Watermarking**: Dynamic watermark application
5. **Analytics**: Detailed usage analytics and insights

## Dependencies

- `@nestjs/common` - NestJS core
- `@nestjs/bullmq` - Queue management
- `@nestjs/event-emitter` - Event system
- `@prisma/client` - Database ORM
- `class-validator` - DTO validation
- `class-transformer` - DTO transformation
- `file-type` - File type detection

## License

Proprietary - Patina Platform
