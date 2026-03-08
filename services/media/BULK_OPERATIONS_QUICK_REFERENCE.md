# Media Bulk Operations - Quick Reference

## Endpoints

### Asset Management

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/v1/media/assets/:id` | Get asset details |
| PATCH | `/v1/media/assets/:id` | Update single asset |
| DELETE | `/v1/media/assets/:id` | Delete single asset |

### Bulk Operations

| Method | Endpoint | Purpose | Async? |
|--------|----------|---------|--------|
| POST | `/v1/media/assets/bulk-update` | Update multiple assets | No |
| POST | `/v1/media/assets/bulk-delete` | Delete multiple assets | >10 assets |
| POST | `/v1/media/assets/move` | Move assets between products | No |
| POST | `/v1/media/assets/copy` | Copy assets to product | >5 assets |
| POST | `/v1/media/assets/:productId/reorder` | Reorder product images | No |

### CDN Management

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/v1/media/cdn/purge` | Purge CDN cache (flexible) |
| POST | `/v1/media/cdn/purge/:productId` | Purge product images |

## Common Operations

### Update Multiple Assets
```typescript
// Update role and visibility for multiple assets
POST /v1/media/assets/bulk-update
{
  "assetIds": ["uuid1", "uuid2", "uuid3"],
  "updates": {
    "role": "LIFESTYLE",
    "isPublic": true,
    "tags": ["modern", "2024"]
  }
}
```

### Soft Delete (Recoverable)
```typescript
POST /v1/media/assets/bulk-delete
{
  "assetIds": ["uuid1", "uuid2"],
  "softDelete": true,      // Mark as BLOCKED
  "purgeCdn": true         // Remove from CDN
}
```

### Hard Delete (Permanent)
```typescript
POST /v1/media/assets/bulk-delete
{
  "assetIds": ["uuid1", "uuid2"],
  "softDelete": false,     // Delete from storage + DB
  "purgeCdn": true
}

// Returns immediately if >10 assets, check job status
Response: { "jobId": "job-uuid", ... }
```

### Move Assets to New Product
```typescript
POST /v1/media/assets/move
{
  "assetIds": ["uuid1", "uuid2"],
  "fromProductId": "old-product",  // Optional, for validation
  "toProductId": "new-product",
  "toVariantId": "variant-1",      // Optional
  "preserveOrder": true
}
```

### Copy Assets (Reference)
```typescript
// Efficient: References same files in storage
POST /v1/media/assets/copy
{
  "assetIds": ["uuid1"],
  "toProductId": "product-2",
  "copyFiles": false,          // Don't duplicate files
  "copyRenditions": true       // Copy rendition records
}
```

### Copy Assets (Duplicate)
```typescript
// Duplicates files in storage (slower)
POST /v1/media/assets/copy
{
  "assetIds": ["uuid1"],
  "toProductId": "product-2",
  "copyFiles": true,           // Duplicate files
  "copyRenditions": true
}
```

### Reorder Product Images
```typescript
// Set display order by providing IDs in desired sequence
POST /v1/media/assets/product-123/reorder
{
  "assetIds": ["hero-uuid", "angle1-uuid", "angle2-uuid"]
}

// sortOrder will be: hero=0, angle1=1, angle2=2
```

### Purge CDN by Product
```typescript
// Purge all images for a product
POST /v1/media/cdn/purge
{
  "productId": "product-123",
  "includeRenditions": true
}

// Or use convenience endpoint
POST /v1/media/cdn/purge/product-123?includeRenditions=true
```

### Purge CDN by Assets
```typescript
POST /v1/media/cdn/purge
{
  "assetIds": ["uuid1", "uuid2"],
  "includeRenditions": true
}
```

### Purge CDN by Path Pattern
```typescript
POST /v1/media/cdn/purge
{
  "paths": [
    "/processed/images/product-123/*",
    "/thumbnails/product-123/*"
  ]
}
```

### Purge Entire CDN (Emergency)
```typescript
// Use with extreme caution!
POST /v1/media/cdn/purge
{
  "purgeAll": true
}
```

## Job Status

When operations return a `jobId`, check status:

```typescript
GET /v1/media/jobs/:jobId

Response:
{
  "id": "job-uuid",
  "type": "BULK_DELETE",
  "state": "RUNNING",  // QUEUED | RUNNING | SUCCEEDED | FAILED
  "progress": 45,      // Percentage
  "attempts": 1,
  "maxRetries": 3,
  "result": null,      // Available when SUCCEEDED
  "error": null,       // Available when FAILED
  "queuedAt": "2025-10-14T...",
  "startedAt": "2025-10-14T...",
  "finishedAt": null
}
```

## Response Formats

### Synchronous Operations
```typescript
{
  "success": 10,     // Number of successful operations
  "failed": 2,       // Number of failed operations
  "errors": [
    {
      "assetId": "uuid1",
      "error": "Asset not found"
    }
  ]
}
```

### Async Operations (Large Batches)
```typescript
{
  "success": 0,
  "failed": 0,
  "errors": [],
  "jobId": "job-uuid"  // Poll /v1/media/jobs/:jobId
}
```

### Delete Operations
```typescript
{
  "deletedAssets": 5,
  "deletedRenditions": 20,
  "cdnPurged": true,
  "jobId": "job-uuid"  // Only for async operations
}
```

### CDN Purge
```typescript
{
  "invalidationId": "I1234567890ABC",  // CloudFront invalidation ID
  "purgedPaths": [
    "/processed/images/asset-1/hero.jpg",
    "/thumbnails/thumb-1.webp",
    "/thumbnails/thumb-2.webp"
  ]
}
```

## Batch Size Guidelines

| Operation | Sync Threshold | Behavior |
|-----------|----------------|----------|
| Bulk Update | All | Always synchronous |
| Bulk Delete (soft) | All | Always synchronous |
| Bulk Delete (hard) | ≤10 | Sync if ≤10, else job |
| Copy Assets | ≤5 | Sync if ≤5 AND !copyFiles |
| Move Assets | All | Always synchronous |
| Reorder Assets | All | Always synchronous |

## Error Codes

| Error | Status | Description |
|-------|--------|-------------|
| Asset not found | 404 | Asset ID doesn't exist |
| Validation failed | 400 | Invalid request body |
| Unauthorized | 401 | Missing/invalid JWT |
| Forbidden | 403 | Insufficient permissions |

## Performance Tips

1. **Use Soft Delete** for fast deletion (status update only)
2. **Reference Files** when copying (copyFiles: false)
3. **Batch Operations** into chunks of 10-50 assets
4. **Monitor Job Queue** for large operations
5. **Schedule CDN Purge** during off-peak hours if possible

## Monitoring Events

Subscribe to these events for real-time updates:

- `media.asset.updated` - Single asset updated
- `media.asset.deleted` - Single asset deleted
- `media.assets.bulk_updated` - Bulk update completed
- `media.assets.bulk_deleted` - Bulk delete completed
- `media.assets.moved` - Assets moved
- `media.assets.copied` - Assets copied
- `media.assets.reordered` - Assets reordered
- `media.cdn.purged` - CDN cache purged
- `media.assets.bulk_delete_completed` - Async delete done
- `media.assets.bulk_copy_completed` - Async copy done

## Background Jobs

| Job Type | Purpose | Concurrency |
|----------|---------|-------------|
| ASSET_DELETE | Single asset hard delete | 3 |
| BULK_DELETE | Batch deletion | 2 |
| BULK_COPY | Batch copy with files | 2 |
| CLEANUP_ORPHANED | Clean up old BLOCKED assets | 1 |

## Cleanup Schedule

### Manual Cleanup
```typescript
// Trigger cleanup of assets BLOCKED >7 days
POST /v1/media/jobs
{
  "type": "CLEANUP_ORPHANED",
  "assetId": "dummy",  // Required but not used
  "meta": {}
}
```

### Automatic Cleanup (Suggested CRON)
- **Daily**: Clean up assets soft-deleted >7 days
- **Weekly**: Storage usage report
- **Monthly**: CDN analytics review

## Security

All endpoints require:
- JWT authentication (`Authorization: Bearer <token>`)
- Appropriate role (designer, admin)

Operations are audited via:
- Event emission
- Database timestamps
- Job history

## TypeScript Types

```typescript
import {
  BulkUpdateAssetsDto,
  BulkDeleteAssetsDto,
  MoveAssetsDto,
  CopyAssetsDto,
  ReorderAssetsDto,
  PurgeCdnDto,
} from '@patina/media/assets/dto';

import {
  BulkOperationResult,
  DeleteResult,
} from '@patina/media/assets/assets.service';
```

## Need Help?

- Review `/services/media/BULK_OPERATIONS_IMPLEMENTATION.md` for detailed docs
- Check test files for usage examples
- View Swagger UI at `http://localhost:3014/api`
- Monitor logs for error details
