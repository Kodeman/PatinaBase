'use client';

import * as React from 'react';
import { Upload, Box, Eye, AlertCircle } from 'lucide-react';
import {
  Alert,
  AlertDescription,
  Button,
  Label,
  Skeleton
} from '@patina/design-system';
import { Switch } from './shared-components';
import { MediaUploader, type UploadFile } from '@/components/catalog/media-uploader';
import { ImageGallery, type GalleryImage } from '@/components/catalog/image-gallery';
import {
  useMediaBatchUpload,
  useProductMedia,
  useDeleteMedia,
  useBulkDeleteMedia,
  useReorderMedia,
} from '@/hooks/use-media-upload';
import { cn } from '@/lib/utils';
import type { Product } from '@patina/types';
import { ErrorBoundary } from '@/components/error-boundary';

interface MediaTabEnhancedProps {
  product?: Product;
  productId?: string;
  onChange: (updates: Partial<Product>) => void;
}

export function MediaTabEnhanced({ product, productId, onChange }: MediaTabEnhancedProps) {
  const [fileProgressMap, setFileProgressMap] = React.useState<Map<string, number>>(new Map());

  // Fetch existing media
  const {
    data: mediaAssets,
    isLoading: isLoadingMedia,
    error: mediaError,
  } = useProductMedia(productId);

  // Mutations
  const batchUpload = useMediaBatchUpload({
    productId,
    onSuccess: (assetId) => {
      console.log('Upload completed:', assetId);
    },
  });

  const deleteMedia = useDeleteMedia();
  const bulkDeleteMedia = useBulkDeleteMedia();
  const reorderMedia = useReorderMedia(productId);

  // Convert media assets to gallery images
  const galleryImages: GalleryImage[] = React.useMemo(() => {
    if (!mediaAssets || mediaAssets.length === 0) return [];

    return mediaAssets.map((asset: any, index) => ({
      id: asset.id,
      url: asset.cdnUrl || asset.originalUrl || asset.url || asset.thumbnailUrl || '',
      thumbnailUrl: asset.thumbnailUrl,
      alt: asset.filename || asset.altText || asset.name || '',
      isPrimary: index === 0, // First image is primary
      order: index,
      width: asset.width || asset.dimensions?.width,
      height: asset.height || asset.dimensions?.height,
    }));
  }, [mediaAssets]);

  // Handle file upload
  const handleUpload = async (files: UploadFile[]) => {
    const filesToUpload = files.map((f) => f.file);

    await batchUpload.mutateAsync({
      files: filesToUpload,
      onFileProgress: (fileIndex, progress) => {
        const file = files[fileIndex];
        if (file) {
          setFileProgressMap((prev) => new Map(prev).set(file.id, progress));
        }
      },
    });

    // Clear progress
    setFileProgressMap(new Map());
  };

  // Handle reorder
  const handleReorder = (reorderedImages: GalleryImage[]) => {
    const assetIds = reorderedImages.map((img) => img.id);
    reorderMedia.mutate({ assetIds });
  };

  // Handle set primary
  const handleSetPrimary = (imageId: string) => {
    const reorderedImages = [...galleryImages];
    const imageIndex = reorderedImages.findIndex((img) => img.id === imageId);

    if (imageIndex > 0) {
      // Move to first position
      const [movedImage] = reorderedImages.splice(imageIndex, 1);
      reorderedImages.unshift(movedImage);

      // Update order
      const updatedImages = reorderedImages.map((img, index) => ({
        ...img,
        order: index,
        isPrimary: index === 0,
      }));

      handleReorder(updatedImages);
    }
  };

  // Handle delete
  const handleDelete = (imageId: string) => {
    deleteMedia.mutate({ assetId: imageId });
  };

  // Handle bulk delete
  const handleBulkDelete = (imageIds: string[]) => {
    bulkDeleteMedia.mutate({ assetIds: imageIds });
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold mb-1">Product Media</h3>
        <p className="text-sm text-muted-foreground">
          Upload and manage product images. The first image will be used as the hero image.
        </p>
      </div>

      {/* Error Alert */}
      {mediaError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to load media assets. Please try refreshing the page.
          </AlertDescription>
        </Alert>
      )}

      {/* Upload Section */}
      <div className="space-y-4">
        <Label className="text-base font-semibold">Upload Images</Label>
        <ErrorBoundary
          fallback={
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Failed to load media uploader. Please refresh the page.
              </AlertDescription>
            </Alert>
          }
        >
          <MediaUploader
            onUpload={handleUpload}
            maxSizeMB={10}
            maxFiles={20}
            acceptedTypes={['image/jpeg', 'image/png', 'image/webp']}
            multiple
            disabled={batchUpload.isPending}
          />
        </ErrorBoundary>
      </div>

      {/* Gallery Section */}
      <div className="space-y-4">
        <Label className="text-base font-semibold">Image Gallery</Label>

        {isLoadingMedia ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="aspect-square rounded-lg" />
            ))}
          </div>
        ) : (
          <ImageGallery
            images={galleryImages}
            onReorder={handleReorder}
            onSetPrimary={handleSetPrimary}
            onDelete={handleDelete}
            onBulkDelete={handleBulkDelete}
            readonly={false}
          />
        )}
      </div>

      {/* 3D Assets Section */}
      <div className="space-y-4 pt-4 border-t border-border">
        <div>
          <h4 className="text-base font-semibold mb-3">3D Assets & AR</h4>
          <p className="text-sm text-muted-foreground">
            Upload 3D models for immersive product viewing and AR experiences.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* 3D Model Upload */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="has-3d">3D Model Available</Label>
              <Switch
                id="has-3d"
                checked={product?.has3D || false}
                onCheckedChange={(checked) => onChange({ has3D: checked })}
              />
            </div>

            {product?.has3D && (
              <div className="border border-border rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Box className="w-4 h-4" />
                  <span>Upload 3D model file</span>
                </div>
                <Button variant="outline" size="sm" className="w-full" disabled>
                  <Upload className="w-4 h-4 mr-2" />
                  Upload GLB/GLTF
                </Button>
                <p className="text-xs text-muted-foreground">
                  Supports GLB, GLTF formats (max 50MB)
                </p>
                <p className="text-xs text-amber-600">
                  3D model upload coming soon
                </p>
              </div>
            )}
          </div>

          {/* AR Support */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="ar-supported">AR Preview Enabled</Label>
              <Switch
                id="ar-supported"
                checked={product?.arSupported || false}
                onCheckedChange={(checked) => onChange({ arSupported: checked })}
                disabled={!product?.has3D}
              />
            </div>

            {product?.arSupported && (
              <div className="border border-border rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Eye className="w-4 h-4" />
                  <span>AR preview configuration</span>
                </div>
                <div className="bg-muted/50 rounded p-3 text-xs">
                  <p className="text-muted-foreground">
                    AR preview will be automatically enabled when a 3D model is uploaded.
                  </p>
                </div>
              </div>
            )}

            {!product?.has3D && (
              <p className="text-xs text-muted-foreground">
                Enable 3D model first to use AR preview
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Media Guidelines */}
      <div className="bg-muted/50 rounded-lg p-4 space-y-2">
        <h4 className="text-sm font-semibold">Image Guidelines</h4>
        <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
          <li>Use high-resolution images (minimum 1200x1200px recommended)</li>
          <li>Include multiple angles and detail shots</li>
          <li>Use consistent lighting and white/neutral backgrounds</li>
          <li>Show the product in context when relevant</li>
          <li>First image should be the main product view (hero image)</li>
          <li>Supported formats: JPG, PNG, WebP (max 10MB each)</li>
        </ul>
      </div>
    </div>
  );
}
