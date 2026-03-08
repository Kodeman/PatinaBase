'use client';

import * as React from 'react';
import { Upload, X, Star, Image as ImageIcon, Box, Eye } from 'lucide-react';
import {
  Badge,
  Button,
  Label
} from '@patina/design-system';
import { Switch } from './shared-components';
import { cn } from '@patina/utils';
import type { Product, ProductImage } from '@patina/types';

interface MediaTabProps {
  product?: Product;
  onChange: (updates: Partial<Product>) => void;
}

export function MediaTab({ product, onChange }: MediaTabProps) {
  const [images, setImages] = React.useState<ProductImage[]>(
    product?.images || []
  );
  const [dragActive, setDragActive] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Handle drag events
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  // Handle drop
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFiles(e.dataTransfer.files);
    }
  };

  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFiles(e.target.files);
    }
  };

  // Process files
  const handleFiles = (files: FileList) => {
    const newImages: ProductImage[] = [];

    Array.from(files).forEach((file, index) => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const newImage: ProductImage = {
            id: `temp-${Date.now()}-${index}`,
            url: e.target?.result as string,
            alt: file.name,
            order: images.length + newImages.length,
            isPrimary: images.length === 0 && newImages.length === 0,
          };
          newImages.push(newImage);

          if (newImages.length === files.length) {
            const updatedImages = [...images, ...newImages];
            setImages(updatedImages);
            onChange({ images: updatedImages });
          }
        };
        reader.readAsDataURL(file);
      }
    });
  };

  // Set primary image
  const handleSetPrimary = (imageId: string) => {
    const updatedImages = images.map((img) => ({
      ...img,
      isPrimary: img.id === imageId,
    }));
    setImages(updatedImages);
    onChange({ images: updatedImages });
  };

  // Remove image
  const handleRemoveImage = (imageId: string) => {
    const updatedImages = images.filter((img) => img.id !== imageId);

    // If we removed the primary image, make the first remaining image primary
    if (updatedImages.length > 0 && !updatedImages.some((img) => img.isPrimary)) {
      updatedImages[0].isPrimary = true;
    }

    setImages(updatedImages);
    onChange({ images: updatedImages });
  };

  // Update image order
  const handleReorder = (fromIndex: number, toIndex: number) => {
    const updatedImages = [...images];
    const [movedImage] = updatedImages.splice(fromIndex, 1);
    updatedImages.splice(toIndex, 0, movedImage);

    // Update order values
    updatedImages.forEach((img, index) => {
      img.order = index;
    });

    setImages(updatedImages);
    onChange({ images: updatedImages });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold mb-1">Product Media</h3>
        <p className="text-sm text-muted-foreground">
          Upload product images and 3D assets. The first image will be used as the cover image.
        </p>
      </div>

      {/* Upload Area */}
      <div
        className={cn(
          'border-2 border-dashed rounded-lg p-8 transition-colors',
          dragActive
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-primary/50'
        )}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <div className="flex flex-col items-center justify-center text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Upload className="w-6 h-6 text-primary" />
          </div>

          <div>
            <p className="text-sm font-medium mb-1">
              Drag and drop images here, or click to browse
            </p>
            <p className="text-xs text-muted-foreground">
              Supports JPG, PNG, WebP (max 5MB each)
            </p>
          </div>

          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="w-4 h-4 mr-2" />
            Choose Files
          </Button>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>
      </div>

      {/* Image Gallery */}
      {images.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-base font-semibold">
              Uploaded Images ({images.length})
            </Label>
            <p className="text-xs text-muted-foreground">
              Click the star to set as primary image
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {images.map((image, index) => (
              <div
                key={image.id}
                className={cn(
                  'relative group rounded-lg overflow-hidden border-2 transition-all',
                  image.isPrimary
                    ? 'border-primary shadow-md'
                    : 'border-border hover:border-primary/50'
                )}
              >
                {/* Image */}
                <div className="aspect-square bg-muted">
                  <img
                    src={image.url}
                    alt={image.alt}
                    className="w-full h-full object-cover"
                  />
                </div>

                {/* Overlay Controls */}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <Button
                    size="sm"
                    variant={image.isPrimary ? 'default' : 'secondary'}
                    onClick={() => handleSetPrimary(image.id)}
                    className="h-8 w-8 p-0"
                    title="Set as primary"
                  >
                    <Star
                      className={cn(
                        'w-4 h-4',
                        image.isPrimary && 'fill-current'
                      )}
                    />
                  </Button>

                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleRemoveImage(image.id)}
                    className="h-8 w-8 p-0"
                    title="Remove image"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>

                {/* Primary Badge */}
                {image.isPrimary && (
                  <div className="absolute top-2 left-2">
                    <Badge variant="default" className="text-xs">
                      Primary
                    </Badge>
                  </div>
                )}

                {/* Order Badge */}
                <div className="absolute top-2 right-2">
                  <Badge variant="secondary" className="text-xs">
                    {index + 1}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3D Assets Section */}
      <div className="space-y-4 pt-4 border-t border-border">
        <div>
          <h4 className="text-base font-semibold mb-3">3D Assets & AR</h4>
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
                <Button variant="outline" size="sm" className="w-full">
                  <Upload className="w-4 h-4 mr-2" />
                  Upload GLB/GLTF
                </Button>
                <p className="text-xs text-muted-foreground">
                  Supports GLB, GLTF formats (max 50MB)
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
                onCheckedChange={(checked) =>
                  onChange({ arSupported: checked })
                }
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
                    AR preview will be automatically enabled when a 3D model is
                    uploaded.
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
          <li>Use high-resolution images (minimum 1200x1200px)</li>
          <li>Include multiple angles and detail shots</li>
          <li>Use consistent lighting and white/neutral backgrounds</li>
          <li>Show the product in context when relevant</li>
          <li>First image should be the main product view</li>
        </ul>
      </div>
    </div>
  );
}
