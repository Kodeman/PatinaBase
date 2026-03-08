/**
 * Image carousel for selecting primary product image
 */

import { useState } from 'react';
import type { ExtractedImage } from '@patina/shared';

interface ImageCarouselProps {
  images: ExtractedImage[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}

export function ImageCarousel({ images, selectedIndex, onSelect }: ImageCarouselProps) {
  const [loadErrors, setLoadErrors] = useState<Set<number>>(new Set());

  if (images.length === 0) {
    return (
      <div className="w-full aspect-square bg-patina-off-white rounded-lg flex items-center justify-center">
        <div className="text-patina-clay-beige text-center">
          <svg className="w-12 h-12 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          <p className="text-sm">No images found</p>
        </div>
      </div>
    );
  }

  const selectedImage = images[selectedIndex];
  const canGoLeft = selectedIndex > 0;
  const canGoRight = selectedIndex < images.length - 1;

  const handlePrev = () => {
    if (canGoLeft) onSelect(selectedIndex - 1);
  };

  const handleNext = () => {
    if (canGoRight) onSelect(selectedIndex + 1);
  };

  const handleImageError = (index: number) => {
    setLoadErrors(prev => new Set([...prev, index]));
  };

  return (
    <div className="space-y-3">
      {/* Main image */}
      <div className="relative w-full aspect-square bg-white rounded-lg overflow-hidden group shadow-patina-sm">
        {loadErrors.has(selectedIndex) ? (
          <div className="w-full h-full flex items-center justify-center text-patina-clay-beige">
            <p className="text-sm">Failed to load image</p>
          </div>
        ) : (
          <img
            src={selectedImage.url}
            alt={selectedImage.alt || 'Product image'}
            className="w-full h-full object-contain"
            onError={() => handleImageError(selectedIndex)}
          />
        )}

        {/* Navigation arrows */}
        {images.length > 1 && (
          <>
            <button
              onClick={handlePrev}
              disabled={!canGoLeft}
              className={`absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/80
                       flex items-center justify-center transition-opacity
                       ${canGoLeft ? 'opacity-0 group-hover:opacity-100 hover:bg-white' : 'opacity-30 cursor-not-allowed'}`}
            >
              <svg className="w-5 h-5 text-patina-charcoal" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={handleNext}
              disabled={!canGoRight}
              className={`absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/80
                       flex items-center justify-center transition-opacity
                       ${canGoRight ? 'opacity-0 group-hover:opacity-100 hover:bg-white' : 'opacity-30 cursor-not-allowed'}`}
            >
              <svg className="w-5 h-5 text-patina-charcoal" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </>
        )}

        {/* Image counter */}
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 px-2 py-1 bg-black/50 rounded-full text-white text-xs">
          {selectedIndex + 1} / {images.length}
        </div>
      </div>

      {/* Thumbnail strip */}
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {images.slice(0, 8).map((image, index) => (
            <button
              key={index}
              onClick={() => onSelect(index)}
              className={`flex-shrink-0 w-12 h-12 rounded overflow-hidden border-2 transition-all
                       ${index === selectedIndex ? 'border-patina-mocha-brown shadow-patina-sm' : 'border-transparent hover:border-patina-clay-beige'}`}
            >
              {loadErrors.has(index) ? (
                <div className="w-full h-full bg-patina-off-white" />
              ) : (
                <img
                  src={image.url}
                  alt=""
                  className="w-full h-full object-cover"
                  onError={() => handleImageError(index)}
                />
              )}
            </button>
          ))}
          {images.length > 8 && (
            <div className="flex-shrink-0 w-12 h-12 rounded bg-patina-off-white flex items-center justify-center text-patina-mocha-brown text-xs">
              +{images.length - 8}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
