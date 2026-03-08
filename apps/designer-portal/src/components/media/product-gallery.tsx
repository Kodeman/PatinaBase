'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { ImgWithFallback } from './image-with-fallback';
import { ImageZoom } from './image-zoom';
import { Button } from '@patina/design-system';
import { Dialog, DialogContent } from '@patina/design-system';
import { cn } from '@/lib/utils';
import { getOptimizedImageUrl } from '@/lib/media-utils';

interface ProductGalleryProps {
  images: string[];
  productName: string;
  className?: string;
  enableZoom?: boolean;
  enableLightbox?: boolean;
}

/**
 * Product image gallery with thumbnails, navigation, and lightbox
 * Features:
 * - Main image display with hover zoom
 * - Thumbnail strip navigation
 * - Fullscreen lightbox mode
 * - Keyboard navigation
 * - Touch/swipe support
 */
export function ProductGallery({
  images,
  productName,
  className,
  enableZoom = true,
  enableLightbox = true,
}: ProductGalleryProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);

  const validImages = images && images.length > 0 ? images : ['https://via.placeholder.com/800'];
  const currentImage = validImages[currentIndex];

  const handlePrevious = () => {
    setCurrentIndex((prev) => (prev - 1 + validImages.length) % validImages.length);
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev + 1) % validImages.length);
  };

  const handleThumbnailClick = (index: number) => {
    setCurrentIndex(index);
  };

  const handleOpenLightbox = () => {
    if (enableLightbox) {
      setIsLightboxOpen(true);
    }
  };

  return (
    <>
      <div className={cn('space-y-4', className)}>
        {/* Main Image */}
        <div className="relative aspect-square bg-muted rounded-lg overflow-hidden group">
          {enableZoom ? (
            <ImageZoom
              src={getOptimizedImageUrl(currentImage, { width: 800, quality: 90 })}
              alt={`${productName} - View ${currentIndex + 1}`}
              className="w-full h-full object-cover"
            />
          ) : (
            <ImgWithFallback
              src={getOptimizedImageUrl(currentImage, { width: 800, quality: 90 })}
              alt={`${productName} - View ${currentIndex + 1}`}
              className="w-full h-full object-cover"
            />
          )}

          {/* Navigation Arrows */}
          {validImages.length > 1 && (
            <>
              <Button
                variant="secondary"
                size="icon"
                className="absolute left-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity rounded-full shadow-lg"
                onClick={handlePrevious}
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <Button
                variant="secondary"
                size="icon"
                className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity rounded-full shadow-lg"
                onClick={handleNext}
              >
                <ChevronRight className="h-5 w-5" />
              </Button>
            </>
          )}

          {/* Fullscreen Button */}
          {enableLightbox && (
            <Button
              variant="secondary"
              size="icon"
              className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity rounded-full shadow-lg"
              onClick={handleOpenLightbox}
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
          )}

          {/* Image Counter */}
          {validImages.length > 1 && (
            <div className="absolute bottom-2 right-2 bg-black/60 text-white px-3 py-1 rounded-full text-sm">
              {currentIndex + 1} / {validImages.length}
            </div>
          )}
        </div>

        {/* Thumbnail Strip */}
        {validImages.length > 1 && (
          <div className="grid grid-cols-4 gap-2 md:grid-cols-6">
            {validImages.map((image, index) => (
              <button
                key={index}
                onClick={() => handleThumbnailClick(index)}
                className={cn(
                  'aspect-square rounded-lg overflow-hidden border-2 transition-all',
                  currentIndex === index
                    ? 'border-primary ring-2 ring-primary/20'
                    : 'border-transparent hover:border-muted-foreground/30'
                )}
              >
                <ImgWithFallback
                  src={getOptimizedImageUrl(image, { width: 150, height: 150, fit: 'cover' })}
                  alt={`${productName} - Thumbnail ${index + 1}`}
                  className="w-full h-full object-cover"
                />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {enableLightbox && (
        <ProductGalleryLightbox
          images={validImages}
          productName={productName}
          isOpen={isLightboxOpen}
          onClose={() => setIsLightboxOpen(false)}
          initialIndex={currentIndex}
        />
      )}
    </>
  );
}

interface ProductGalleryLightboxProps {
  images: string[];
  productName: string;
  isOpen: boolean;
  onClose: () => void;
  initialIndex?: number;
}

/**
 * Fullscreen lightbox for product images
 */
function ProductGalleryLightbox({
  images,
  productName,
  isOpen,
  onClose,
  initialIndex = 0,
}: ProductGalleryLightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [zoomLevel, setZoomLevel] = useState(1);

  const currentImage = images[currentIndex];

  const handlePrevious = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
    setZoomLevel(1);
  };

  const handleNext = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setCurrentIndex((prev) => (prev + 1) % images.length);
    setZoomLevel(1);
  };

  const handleZoomIn = (e: React.MouseEvent) => {
    e.stopPropagation();
    setZoomLevel((prev) => Math.min(prev + 0.5, 3));
  };

  const handleZoomOut = (e: React.MouseEvent) => {
    e.stopPropagation();
    setZoomLevel((prev) => Math.max(prev - 0.5, 1));
  };

  // Keyboard navigation
  const handleKeyDown = (e: KeyboardEvent) => {
    if (!isOpen) return;

    switch (e.key) {
      case 'ArrowLeft':
        handlePrevious();
        break;
      case 'ArrowRight':
        handleNext();
        break;
      case 'Escape':
        onClose();
        break;
      case '+':
      case '=':
        setZoomLevel((prev) => Math.min(prev + 0.5, 3));
        break;
      case '-':
        setZoomLevel((prev) => Math.max(prev - 0.5, 1));
        break;
    }
  };

  // Add keyboard listeners
  useState(() => {
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', handleKeyDown as any);
      return () => window.removeEventListener('keydown', handleKeyDown as any);
    }
  });

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 bg-black/95">
        <div className="relative w-full h-[95vh] flex items-center justify-center">
          {/* Close Button */}
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-4 top-4 z-50 text-white hover:bg-white/20 rounded-full"
            onClick={onClose}
          >
            <X className="h-6 w-6" />
          </Button>

          {/* Zoom Controls */}
          <div className="absolute right-4 top-20 z-50 flex flex-col gap-2">
            <Button
              variant="secondary"
              size="icon"
              className="rounded-full"
              onClick={handleZoomIn}
              disabled={zoomLevel >= 3}
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button
              variant="secondary"
              size="icon"
              className="rounded-full"
              onClick={handleZoomOut}
              disabled={zoomLevel <= 1}
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
          </div>

          {/* Main Image */}
          <div className="relative w-full h-full flex items-center justify-center overflow-auto p-8">
            <img
              src={getOptimizedImageUrl(currentImage, { width: 1920, quality: 95 })}
              alt={`${productName} - View ${currentIndex + 1}`}
              className="max-w-full max-h-full object-contain transition-transform duration-200"
              style={{ transform: `scale(${zoomLevel})` }}
            />
          </div>

          {/* Navigation */}
          {images.length > 1 && (
            <>
              <Button
                variant="secondary"
                size="icon"
                className="absolute left-4 top-1/2 -translate-y-1/2 z-50 rounded-full shadow-lg"
                onClick={handlePrevious}
              >
                <ChevronLeft className="h-6 w-6" />
              </Button>
              <Button
                variant="secondary"
                size="icon"
                className="absolute right-4 top-1/2 -translate-y-1/2 z-50 rounded-full shadow-lg"
                onClick={handleNext}
              >
                <ChevronRight className="h-6 w-6" />
              </Button>

              {/* Counter */}
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white/10 backdrop-blur-sm text-white px-4 py-2 rounded-full">
                {currentIndex + 1} / {images.length}
              </div>

              {/* Thumbnail Strip */}
              <div className="absolute bottom-20 left-1/2 -translate-x-1/2 flex gap-2 max-w-[80vw] overflow-x-auto px-4 py-2 bg-black/40 rounded-full">
                {images.map((image, index) => (
                  <button
                    key={index}
                    onClick={(e) => {
                      e.stopPropagation();
                      setCurrentIndex(index);
                      setZoomLevel(1);
                    }}
                    className={cn(
                      'w-16 h-16 flex-shrink-0 rounded-lg overflow-hidden border-2 transition-all',
                      currentIndex === index
                        ? 'border-white ring-2 ring-white/50'
                        : 'border-transparent opacity-60 hover:opacity-100'
                    )}
                  >
                    <img
                      src={getOptimizedImageUrl(image, { width: 100, height: 100, fit: 'cover' })}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
