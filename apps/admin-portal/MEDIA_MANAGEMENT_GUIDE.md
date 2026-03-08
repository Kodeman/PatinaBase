# Media Management Feature - Usage Guide

## Overview

The Media Management feature provides a complete solution for uploading, managing, and organizing product images in the Admin Portal. It includes drag-and-drop uploading, image reordering, lightbox viewing, and bulk operations.

## Components

### 1. MediaUploader

A production-ready file upload component with drag-and-drop support, validation, and progress tracking.

**Location**: `/apps/admin-portal/src/components/catalog/media-uploader.tsx`

#### Features

- Drag & drop interface
- File validation (size, type)
- Image preview before upload
- Progress indicators with percentage
- Multiple file upload
- Error handling for failed uploads
- Accessible keyboard navigation

#### Usage

```tsx
import { MediaUploader } from '@/components/catalog';

function MyComponent() {
  const handleUpload = async (files: UploadFile[]) => {
    // Handle upload logic
    console.log('Uploading files:', files);
  };

  return (
    <MediaUploader
      onUpload={handleUpload}
      maxSizeMB={10}
      maxFiles={20}
      acceptedTypes={['image/jpeg', 'image/png', 'image/webp']}
      multiple
    />
  );
}
```

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `onUpload` | `(files: UploadFile[]) => Promise<void>` | Required | Callback when files are ready to upload |
| `onUploadComplete` | `(fileId: string, assetId: string) => void` | Optional | Callback when upload completes |
| `onProgress` | `(fileId: string, progress: number) => void` | Optional | Callback for progress updates |
| `onRemove` | `(fileId: string) => void` | Optional | Callback when file is removed |
| `maxSizeMB` | `number` | `10` | Maximum file size in MB |
| `maxFiles` | `number` | `20` | Maximum number of files |
| `acceptedTypes` | `string[]` | `['image/jpeg', 'image/png', 'image/webp']` | Accepted MIME types |
| `multiple` | `boolean` | `true` | Allow multiple files |
| `disabled` | `boolean` | `false` | Disable the uploader |

### 2. ImageGallery

A sortable image gallery with drag-to-reorder, lightbox viewing, and bulk operations.

**Location**: `/apps/admin-portal/src/components/catalog/image-gallery.tsx`

#### Features

- Grid view with thumbnails
- Drag to reorder images
- Mark primary/hero image
- Click to zoom/lightbox view
- Delete with confirmation dialog
- Bulk delete option
- Selection with checkboxes
- Keyboard navigation (arrow keys, escape)
- Accessible ARIA labels

#### Usage

```tsx
import { ImageGallery } from '@/components/catalog';

function MyComponent() {
  const [images, setImages] = useState<GalleryImage[]>([...]);

  const handleReorder = (reorderedImages: GalleryImage[]) => {
    setImages(reorderedImages);
    // Save to backend
  };

  const handleSetPrimary = (imageId: string) => {
    // Set as hero image
  };

  const handleDelete = (imageId: string) => {
    // Delete single image
  };

  const handleBulkDelete = (imageIds: string[]) => {
    // Delete multiple images
  };

  return (
    <ImageGallery
      images={images}
      onReorder={handleReorder}
      onSetPrimary={handleSetPrimary}
      onDelete={handleDelete}
      onBulkDelete={handleBulkDelete}
    />
  );
}
```

#### Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `images` | `GalleryImage[]` | Yes | Array of images to display |
| `onReorder` | `(images: GalleryImage[]) => void` | Yes | Callback when images are reordered |
| `onSetPrimary` | `(imageId: string) => void` | Yes | Callback to set primary image |
| `onDelete` | `(imageId: string) => void` | Yes | Callback to delete single image |
| `onBulkDelete` | `(imageIds: string[]) => void` | No | Callback for bulk delete |
| `readonly` | `boolean` | No | Disable editing features |

### 3. Custom Hooks

#### useMediaUpload

Upload single files with progress tracking.

```tsx
import { useMediaUpload } from '@/hooks/use-media-upload';

function MyComponent() {
  const uploadMutation = useMediaUpload({
    productId: 'product-123',
    onSuccess: (assetId) => {
      console.log('Upload successful:', assetId);
    },
    onProgress: (progress) => {
      console.log('Upload progress:', progress);
    },
  });

  const handleUpload = async (file: File) => {
    await uploadMutation.mutateAsync({
      file,
      onProgress: (p) => console.log(p),
    });
  };
}
```

#### useMediaBatchUpload

Upload multiple files with batch tracking.

```tsx
import { useMediaBatchUpload } from '@/hooks/use-media-upload';

function MyComponent() {
  const batchUpload = useMediaBatchUpload({
    productId: 'product-123',
  });

  const handleBatchUpload = async (files: File[]) => {
    const results = await batchUpload.mutateAsync({
      files,
      onFileProgress: (fileIndex, progress) => {
        console.log(`File ${fileIndex}: ${progress}%`);
      },
    });

    console.log('Upload results:', results);
  };
}
```

#### useProductMedia

Fetch product media assets with caching.

```tsx
import { useProductMedia } from '@/hooks/use-media-upload';

function MyComponent({ productId }: { productId: string }) {
  const { data: media, isLoading, error } = useProductMedia(productId);

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error loading media</div>;

  return <div>{media?.length} images</div>;
}
```

#### useDeleteMedia

Delete single media asset.

```tsx
import { useDeleteMedia } from '@/hooks/use-media-upload';

function MyComponent() {
  const deleteMutation = useDeleteMedia();

  const handleDelete = async (assetId: string) => {
    await deleteMutation.mutateAsync({
      assetId,
      hardDelete: false, // Soft delete by default
    });
  };
}
```

#### useBulkDeleteMedia

Delete multiple media assets.

```tsx
import { useBulkDeleteMedia } from '@/hooks/use-media-upload';

function MyComponent() {
  const bulkDeleteMutation = useBulkDeleteMedia();

  const handleBulkDelete = async (assetIds: string[]) => {
    const result = await bulkDeleteMutation.mutateAsync({
      assetIds,
      softDelete: true,
    });

    console.log(`Deleted: ${result.success}, Failed: ${result.failed}`);
  };
}
```

#### useReorderMedia

Reorder media assets for a product.

```tsx
import { useReorderMedia } from '@/hooks/use-media-upload';

function MyComponent({ productId }: { productId: string }) {
  const reorderMutation = useReorderMedia(productId);

  const handleReorder = async (assetIds: string[]) => {
    await reorderMutation.mutateAsync({ assetIds });
  };
}
```

## Media Service API

### Upload Methods

#### createUploadIntent

Create an upload intent and get Pre-Authenticated Request URL (for OCI Object Storage).

```tsx
import { mediaService } from '@/services/media';

const intent = {
  fileName: 'product-image.jpg',
  mimeType: 'image/jpeg',
  kind: 'IMAGE' as const,
  productId: 'product-123',
  role: 'HERO' as const,
};

const response = await mediaService.createUploadIntent(intent, 'idempotency-key-123');
// Returns: { assetId, uploadSessionId, parUrl, expiresAt, ... }
```

#### uploadFile

Upload file directly (multipart/form-data).

```tsx
import { mediaService } from '@/services/media';

const file = new File(['...'], 'image.jpg', { type: 'image/jpeg' });

const response = await mediaService.uploadFile(
  file,
  {
    fileName: file.name,
    mimeType: file.type,
    kind: 'IMAGE',
    productId: 'product-123',
  },
  (progress) => {
    console.log(`Upload progress: ${progress}%`);
  }
);
```

#### uploadToPAR

Upload to Pre-Authenticated Request URL (for OCI Object Storage).

```tsx
import { mediaService } from '@/services/media';

const file = new File(['...'], 'image.jpg', { type: 'image/jpeg' });

await mediaService.uploadToPAR(
  'https://objectstorage.../par-url',
  file,
  { 'x-content-type': 'image/jpeg' },
  (progress) => console.log(`${progress}%`)
);
```

### Asset Management

#### getProductAssets

Get all media assets for a product.

```tsx
import { mediaService } from '@/services/media';

const response = await mediaService.getProductAssets('product-123');
const assets = response.data; // MediaAsset[]
```

#### deleteAsset

Delete a single asset.

```tsx
import { mediaService } from '@/services/media';

await mediaService.deleteAsset('asset-123', false); // soft delete
await mediaService.deleteAsset('asset-123', true); // hard delete
```

#### bulkDeleteAssets

Delete multiple assets.

```tsx
import { mediaService } from '@/services/media';

const result = await mediaService.bulkDeleteAssets(
  ['asset-1', 'asset-2', 'asset-3'],
  true // soft delete
);

console.log(`Success: ${result.data.success}, Failed: ${result.data.failed}`);
```

#### reorderAssets

Reorder product assets.

```tsx
import { mediaService } from '@/services/media';

await mediaService.reorderAssets('product-123', {
  assetIds: ['asset-1', 'asset-2', 'asset-3'], // New order
});
```

## Integration Example

Here's a complete example of integrating media management into a product edit page:

```tsx
import { MediaUploader, ImageGallery } from '@/components/catalog';
import {
  useMediaBatchUpload,
  useProductMedia,
  useDeleteMedia,
  useReorderMedia,
} from '@/hooks/use-media-upload';

function ProductMediaTab({ productId }: { productId: string }) {
  // Fetch existing media
  const { data: mediaAssets, isLoading } = useProductMedia(productId);

  // Mutations
  const batchUpload = useMediaBatchUpload({ productId });
  const deleteMedia = useDeleteMedia();
  const reorderMedia = useReorderMedia(productId);

  // Convert to gallery format
  const galleryImages = mediaAssets?.map((asset, index) => ({
    id: asset.id,
    url: asset.url,
    thumbnailUrl: asset.thumbnailUrl,
    alt: asset.altText,
    isPrimary: index === 0,
    order: index,
    width: asset.dimensions?.width,
    height: asset.dimensions?.height,
  })) || [];

  const handleUpload = async (files: UploadFile[]) => {
    await batchUpload.mutateAsync({
      files: files.map(f => f.file),
    });
  };

  const handleReorder = (images: GalleryImage[]) => {
    reorderMedia.mutate({
      assetIds: images.map(img => img.id),
    });
  };

  const handleSetPrimary = (imageId: string) => {
    const reordered = [...galleryImages];
    const idx = reordered.findIndex(img => img.id === imageId);
    if (idx > 0) {
      const [moved] = reordered.splice(idx, 1);
      reordered.unshift(moved);
      handleReorder(reordered.map((img, i) => ({ ...img, order: i })));
    }
  };

  return (
    <div className="space-y-8">
      <MediaUploader
        onUpload={handleUpload}
        maxSizeMB={10}
        maxFiles={20}
      />

      <ImageGallery
        images={galleryImages}
        onReorder={handleReorder}
        onSetPrimary={handleSetPrimary}
        onDelete={(id) => deleteMedia.mutate({ assetId: id })}
      />
    </div>
  );
}
```

## File Validation

The media uploader includes comprehensive file validation:

```tsx
import { validateFile } from '@/lib/media-utils';

const file = new File(['...'], 'image.jpg', { type: 'image/jpeg' });
const validation = validateFile(file);

if (!validation.valid) {
  console.error(validation.error);
  // Error: "File size exceeds 500MB limit"
  // Error: "File type image/gif is not supported"
}
```

### Validation Rules

- **Max file size**: 500MB (configurable)
- **Supported types**:
  - Images: `image/jpeg`, `image/png`, `image/gif`, `image/webp`, `image/svg+xml`
  - Videos: `video/mp4`, `video/webm`, `video/quicktime`
  - 3D: `model/gltf-binary`, `model/gltf+json`, `model/obj`, `model/stl`

## Utility Functions

### formatFileSize

Format bytes to human-readable size.

```tsx
import { formatFileSize } from '@/lib/media-utils';

formatFileSize(1024); // "1 KB"
formatFileSize(1048576); // "1 MB"
formatFileSize(1073741824); // "1 GB"
```

### getImageDimensions

Get image dimensions from file.

```tsx
import { getImageDimensions } from '@/lib/media-utils';

const file = new File(['...'], 'image.jpg', { type: 'image/jpeg' });
const { width, height } = await getImageDimensions(file);
console.log(`${width}x${height}`);
```

### generateThumbnail

Generate thumbnail preview.

```tsx
import { generateThumbnail } from '@/lib/media-utils';

const file = new File(['...'], 'image.jpg', { type: 'image/jpeg' });
const thumbnailDataUrl = await generateThumbnail(file, 300, 300);
```

## Testing

### Unit Tests

Run unit tests for media components:

```bash
pnpm --filter @patina/admin-portal test src/components/catalog/__tests__/media-uploader.test.tsx
```

### E2E Tests

Run end-to-end tests for complete upload flow:

```bash
pnpm --filter @patina/admin-portal test:e2e e2e/media-upload.spec.ts
```

## Accessibility

All media management components follow WCAG 2.1 AA guidelines:

- **Keyboard Navigation**: Full keyboard support for all interactions
- **Screen Readers**: ARIA labels and roles for assistive technologies
- **Focus Management**: Proper focus indicators and tab order
- **Color Contrast**: Meets WCAG AA contrast requirements
- **Alternative Text**: All images have descriptive alt text

### Keyboard Shortcuts

- **Tab**: Navigate between elements
- **Enter/Space**: Activate buttons and checkboxes
- **Escape**: Close lightbox or cancel drag
- **Arrow Keys**: Navigate in lightbox

## Performance Optimization

- **Lazy Loading**: Images loaded on-demand
- **Thumbnail Generation**: Client-side thumbnails for previews
- **Optimistic Updates**: Immediate UI feedback with rollback on error
- **Query Caching**: TanStack Query caches media assets (5 min stale time)
- **Image Compression**: Automatic compression for large images (planned)

## Backend Requirements

Ensure these media service endpoints are available:

- `POST /v1/media/upload` - Create upload intent or upload directly
- `GET /v1/media/assets?productId={id}` - Get product assets
- `DELETE /v1/media/assets/{id}` - Delete asset
- `POST /v1/media/assets/bulk-delete` - Bulk delete
- `POST /v1/media/assets/{productId}/reorder` - Reorder assets

## Troubleshooting

### Upload fails with CORS error

Ensure the media service allows requests from the admin portal origin.

### Images don't appear after upload

Check that the media service returns valid asset IDs and URLs. Verify the query invalidation is working.

### Drag-and-drop not working

Ensure @dnd-kit packages are installed:

```bash
pnpm add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

### Lightbox not opening

Ensure yet-another-react-lightbox is installed:

```bash
pnpm add yet-another-react-lightbox
```

## Future Enhancements

- Image cropping and editing
- 3D model upload and preview
- Video upload support
- Batch image optimization
- AI-powered alt text generation
- Duplicate image detection
- Cloud storage integration (AWS S3, Azure Blob)

## Support

For issues or questions, please:

1. Check this documentation
2. Review the component source code
3. Run the test suite
4. Contact the development team
