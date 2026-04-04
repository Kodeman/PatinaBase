'use client';

import { useState } from 'react';

interface GalleryImage {
  url: string;
  alt?: string;
}

interface ImageGalleryProps {
  images: GalleryImage[];
}

export function ImageGallery({ images }: ImageGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeImage = images[activeIndex];

  return (
    <div>
      {/* Hero image */}
      <div className="relative mb-3 flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg bg-[var(--color-pearl)]">
        {activeImage?.url ? (
          <img
            src={activeImage.url}
            alt={activeImage.alt || 'Product image'}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="type-meta">
            Hero Product Image
          </span>
        )}
      </div>

      {/* Thumbnails */}
      {images.length > 1 && (
        <div className="flex gap-2">
          {images.map((img, i) => (
            <button
              key={i}
              className={`h-12 w-16 cursor-pointer overflow-hidden rounded border-2 bg-[var(--color-pearl)] ${
                i === activeIndex
                  ? 'border-[var(--accent-primary)]'
                  : 'border-transparent'
              }`}
              onClick={() => setActiveIndex(i)}
            >
              {img.url ? (
                <img src={img.url} alt={img.alt || ''} className="h-full w-full object-cover" />
              ) : null}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
