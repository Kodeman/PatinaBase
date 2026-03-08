'use client';

import { useState, useRef, MouseEvent } from 'react';
import { ImgWithFallback } from './image-with-fallback';
import { cn } from '@/lib/utils';

interface ImageZoomProps {
  src: string;
  alt: string;
  className?: string;
  containerClassName?: string;
  zoomScale?: number;
  disabled?: boolean;
}

/**
 * Image component with zoom on hover effect
 * Features:
 * - Smooth zoom animation on hover
 * - Follow mouse cursor
 * - Configurable zoom scale
 * - Accessible and performant
 */
export function ImageZoom({
  src,
  alt,
  className,
  containerClassName,
  zoomScale = 1.5,
  disabled = false,
}: ImageZoomProps) {
  const [isZoomed, setIsZoomed] = useState(false);
  const [position, setPosition] = useState({ x: 50, y: 50 });
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseEnter = () => {
    if (!disabled) {
      setIsZoomed(true);
    }
  };

  const handleMouseLeave = () => {
    setIsZoomed(false);
    setPosition({ x: 50, y: 50 });
  };

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!disabled && isZoomed && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      setPosition({ x, y });
    }
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative overflow-hidden cursor-zoom-in',
        isZoomed && 'cursor-zoom-out',
        containerClassName
      )}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onMouseMove={handleMouseMove}
    >
      <ImgWithFallback
        src={src}
        alt={alt}
        className={cn(
          'w-full h-full object-cover transition-transform duration-300 ease-out',
          className
        )}
        style={{
          transform: isZoomed ? `scale(${zoomScale})` : 'scale(1)',
          transformOrigin: `${position.x}% ${position.y}%`,
        }}
      />
    </div>
  );
}

/**
 * Image zoom with lens effect (magnifying glass)
 */
export function ImageZoomLens({
  src,
  alt,
  className,
  containerClassName,
  lensSize = 150,
  zoomLevel = 2,
}: ImageZoomProps & { lensSize?: number; zoomLevel?: number }) {
  const [showLens, setShowLens] = useState(false);
  const [lensPosition, setLensPosition] = useState({ x: 0, y: 0 });
  const [backgroundPosition, setBackgroundPosition] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Calculate lens position (centered on cursor)
    const lensX = Math.max(0, Math.min(x - lensSize / 2, rect.width - lensSize));
    const lensY = Math.max(0, Math.min(y - lensSize / 2, rect.height - lensSize));

    // Calculate background position
    const bgX = (x / rect.width) * 100;
    const bgY = (y / rect.height) * 100;

    setLensPosition({ x: lensX, y: lensY });
    setBackgroundPosition({ x: bgX, y: bgY });
  };

  return (
    <div
      ref={containerRef}
      className={cn('relative overflow-hidden', containerClassName)}
      onMouseEnter={() => setShowLens(true)}
      onMouseLeave={() => setShowLens(false)}
      onMouseMove={handleMouseMove}
    >
      <ImgWithFallback
        src={src}
        alt={alt}
        className={cn('w-full h-full object-cover', className)}
      />

      {showLens && (
        <div
          className="absolute pointer-events-none border-2 border-white shadow-lg rounded-full"
          style={{
            width: `${lensSize}px`,
            height: `${lensSize}px`,
            left: `${lensPosition.x}px`,
            top: `${lensPosition.y}px`,
            backgroundImage: `url(${src})`,
            backgroundSize: `${100 * zoomLevel}%`,
            backgroundPosition: `${backgroundPosition.x}% ${backgroundPosition.y}%`,
            backgroundRepeat: 'no-repeat',
          }}
        />
      )}
    </div>
  );
}

/**
 * Image zoom with side-by-side zoomed view
 */
export function ImageZoomSideBySide({
  src,
  alt,
  className,
  containerClassName,
  zoomLevel = 2,
}: ImageZoomProps & { zoomLevel?: number }) {
  const [showZoom, setShowZoom] = useState(false);
  const [position, setPosition] = useState({ x: 50, y: 50 });
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    setPosition({ x, y });
  };

  return (
    <div className={cn('flex gap-4', containerClassName)}>
      <div
        ref={containerRef}
        className="relative flex-1 overflow-hidden cursor-crosshair"
        onMouseEnter={() => setShowZoom(true)}
        onMouseLeave={() => setShowZoom(false)}
        onMouseMove={handleMouseMove}
      >
        <ImgWithFallback
          src={src}
          alt={alt}
          className={cn('w-full h-full object-cover', className)}
        />
      </div>

      {showZoom && (
        <div className="flex-1 overflow-hidden rounded-lg border-2 border-primary">
          <div
            className="w-full h-full"
            style={{
              backgroundImage: `url(${src})`,
              backgroundSize: `${100 * zoomLevel}%`,
              backgroundPosition: `${position.x}% ${position.y}%`,
              backgroundRepeat: 'no-repeat',
            }}
          />
        </div>
      )}
    </div>
  );
}
