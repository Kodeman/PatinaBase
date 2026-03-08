# Media Management - Quick Start Guide

## Installation Complete

All dependencies installed:
- ✅ `@dnd-kit/core` - Drag and drop core
- ✅ `@dnd-kit/sortable` - Sortable items
- ✅ `@dnd-kit/utilities` - DnD utilities
- ✅ `yet-another-react-lightbox` - Image lightbox
- ✅ `react-dropzone` - Already installed

## Files Created

### Components
- ✅ `/src/components/catalog/media-uploader.tsx` - Drag & drop uploader
- ✅ `/src/components/catalog/image-gallery.tsx` - Sortable gallery with lightbox
- ✅ `/src/components/products/tabs/media-tab-enhanced.tsx` - Enhanced Media tab

### Services & Hooks
- ✅ `/src/services/media.ts` - Updated with upload methods
- ✅ `/src/hooks/use-media-upload.ts` - Custom React Query hooks

### Tests
- ✅ `/src/components/catalog/__tests__/media-uploader.test.tsx` - Unit tests
- ✅ `/e2e/media-upload.spec.ts` - E2E tests

### Documentation
- ✅ `MEDIA_MANAGEMENT_GUIDE.md` - Complete usage guide
- ✅ `MEDIA_MANAGEMENT_QUICK_START.md` - This file

## Quick Integration

### Option 1: Use Enhanced Media Tab (Recommended)

Replace the existing Media tab in your product edit page:

```tsx
// In /src/app/(dashboard)/catalog/[productId]/page.tsx
import { MediaTabEnhanced } from '@/components/products/tabs/media-tab-enhanced';

// Replace MediaTab with MediaTabEnhanced
<TabsContent value="media">
  <MediaTabEnhanced
    product={product}
    productId={productId}
    onChange={handleProductChange}
  />
</TabsContent>
```

### Option 2: Use Individual Components

```tsx
import { MediaUploader, ImageGallery } from '@/components/catalog';
import { useMediaBatchUpload, useProductMedia } from '@/hooks/use-media-upload';

function MyMediaTab({ productId }: { productId: string }) {
  const { data: media } = useProductMedia(productId);
  const upload = useMediaBatchUpload({ productId });

  return (
    <>
      <MediaUploader onUpload={async (files) => {
        await upload.mutateAsync({
          files: files.map(f => f.file),
        });
      }} />

      <ImageGallery
        images={media || []}
        onReorder={/* ... */}
        onSetPrimary={/* ... */}
        onDelete={/* ... */}
      />
    </>
  );
}
```

## Key Features

### MediaUploader
- Drag & drop files
- Multiple file upload
- Progress tracking
- File validation (size, type)
- Image preview
- Error handling

### ImageGallery
- Drag to reorder
- Set primary/hero image
- Lightbox view (click to zoom)
- Delete with confirmation
- Bulk select & delete
- Keyboard navigation

### Custom Hooks
- `useMediaUpload` - Single file upload
- `useMediaBatchUpload` - Multiple files
- `useProductMedia` - Fetch product assets
- `useDeleteMedia` - Delete single asset
- `useBulkDeleteMedia` - Bulk delete
- `useReorderMedia` - Reorder assets

## Testing

```bash
# Unit tests
pnpm test src/components/catalog/__tests__/media-uploader.test.tsx

# E2E tests
pnpm test:e2e e2e/media-upload.spec.ts

# All tests
pnpm test
```

## API Endpoints Required

Ensure these endpoints exist in the media service:

- `POST /v1/media/upload` - Upload files
- `GET /v1/media/assets?productId={id}` - Get product assets
- `DELETE /v1/media/assets/{id}` - Delete asset
- `POST /v1/media/assets/bulk-delete` - Bulk delete
- `POST /v1/media/assets/{productId}/reorder` - Reorder

## Configuration

### File Size Limits

```tsx
<MediaUploader
  maxSizeMB={10}  // Default: 10MB
  maxFiles={20}   // Default: 20 files
/>
```

### Accepted File Types

```tsx
<MediaUploader
  acceptedTypes={[
    'image/jpeg',
    'image/png',
    'image/webp',
  ]}
/>
```

## Common Use Cases

### 1. Product Hero Image Upload

```tsx
const upload = useMediaUpload({
  productId: 'product-123',
  role: 'HERO',
  onSuccess: (assetId) => {
    toast.success('Hero image uploaded!');
  },
});
```

### 2. Batch Upload Product Images

```tsx
const batchUpload = useMediaBatchUpload({
  productId: 'product-123',
});

await batchUpload.mutateAsync({
  files: [file1, file2, file3],
  onFileProgress: (fileIndex, progress) => {
    console.log(`File ${fileIndex}: ${progress}%`);
  },
});
```

### 3. Reorder Images

```tsx
const reorder = useReorderMedia('product-123');

await reorder.mutateAsync({
  assetIds: ['asset-1', 'asset-3', 'asset-2'], // New order
});
```

### 4. Delete Multiple Images

```tsx
const bulkDelete = useBulkDeleteMedia();

await bulkDelete.mutateAsync({
  assetIds: ['asset-1', 'asset-2'],
  softDelete: true, // Soft delete (can be restored)
});
```

## Troubleshooting

### Issue: Upload fails
**Solution**: Check media service is running and endpoints are accessible

### Issue: Images don't appear
**Solution**: Verify query invalidation is working, check network tab

### Issue: Drag and drop not working
**Solution**: Ensure @dnd-kit packages are installed

### Issue: Lightbox not opening
**Solution**: Ensure yet-another-react-lightbox is installed

## Next Steps

1. ✅ Install dependencies - **DONE**
2. ✅ Create components - **DONE**
3. ✅ Update services - **DONE**
4. ✅ Create hooks - **DONE**
5. ✅ Write tests - **DONE**
6. ✅ Add documentation - **DONE**
7. ⏭️ Integrate into product edit page
8. ⏭️ Test with real media service
9. ⏭️ Deploy to staging

## Support

See `MEDIA_MANAGEMENT_GUIDE.md` for complete documentation.

---

**Feature Status**: ✅ Complete and ready for integration
**Last Updated**: 2025-10-19
