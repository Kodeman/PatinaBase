'use client';

import { useState, useEffect } from 'react';
import Image, { ImageProps } from 'next/image';
import { ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ImageWithFallbackProps extends Omit<ImageProps, 'onError'> {
  src: string;
  fallbackSrc?: string;
  alt: string;
  className?: string;
  containerClassName?: string;
  showPlaceholder?: boolean;
  onError?: (error: Error) => void;
}

/**
 * Image component with fallback support and error handling
 * Features:
 * - Automatic fallback to placeholder on error
 * - Optional custom fallback image
 * - Loading state with skeleton
 * - Blur-up effect
 */
export function ImageWithFallback({
  src,
  fallbackSrc,
  alt,
  className,
  containerClassName,
  showPlaceholder = true,
  onError,
  ...props
}: ImageWithFallbackProps) {
  const [imgSrc, setImgSrc] = useState<string>(src);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [hasError, setHasError] = useState<boolean>(false);

  // Update image source when prop changes
  useEffect(() => {
    setImgSrc(src);
    setHasError(false);
    setIsLoading(true);
  }, [src]);

  const handleError = () => {
    if (hasError) return; // Prevent infinite loop

    setHasError(true);
    setIsLoading(false);

    // Try fallback image first
    if (fallbackSrc && imgSrc !== fallbackSrc) {
      setImgSrc(fallbackSrc);
      return;
    }

    // Call error callback if provided
    if (onError) {
      onError(new Error(`Failed to load image: ${src}`));
    }
  };

  const handleLoad = () => {
    setIsLoading(false);
  };

  // Show placeholder if error and no fallback
  if (hasError && (!fallbackSrc || imgSrc === fallbackSrc) && showPlaceholder) {
    return (
      <div
        className={cn(
          'flex items-center justify-center bg-muted rounded-lg',
          containerClassName
        )}
      >
        <ImageIcon className="h-12 w-12 text-muted-foreground/50" />
      </div>
    );
  }

  return (
    <div className={cn('relative overflow-hidden', containerClassName)}>
      {isLoading && (
        <div className="absolute inset-0 bg-muted animate-pulse rounded-lg" />
      )}
      <Image
        {...props}
        src={imgSrc}
        alt={alt}
        className={cn(
          'transition-opacity duration-300',
          isLoading ? 'opacity-0' : 'opacity-100',
          className
        )}
        onError={handleError}
        onLoad={handleLoad}
      />
    </div>
  );
}

/**
 * Simple image with fallback (non-Next.js Image)
 * Use when you need standard img tag behavior
 */
export function ImgWithFallback({
  src,
  fallbackSrc,
  alt,
  className,
  containerClassName,
  showPlaceholder = true,
  onError,
  ...props
}: Omit<ImageWithFallbackProps, 'fill' | 'priority' | 'quality' | 'placeholder'> &
   React.ImgHTMLAttributes<HTMLImageElement>) {
  const [imgSrc, setImgSrc] = useState<string>(src);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [hasError, setHasError] = useState<boolean>(false);

  useEffect(() => {
    setImgSrc(src);
    setHasError(false);
    setIsLoading(true);
  }, [src]);

  const handleError = () => {
    if (hasError) return;

    setHasError(true);
    setIsLoading(false);

    if (fallbackSrc && imgSrc !== fallbackSrc) {
      setImgSrc(fallbackSrc);
      return;
    }

    if (onError) {
      onError(new Error(`Failed to load image: ${src}`));
    }
  };

  const handleLoad = () => {
    setIsLoading(false);
  };

  if (hasError && (!fallbackSrc || imgSrc === fallbackSrc) && showPlaceholder) {
    return (
      <div
        className={cn(
          'flex items-center justify-center bg-muted rounded-lg',
          containerClassName
        )}
      >
        <ImageIcon className="h-12 w-12 text-muted-foreground/50" />
      </div>
    );
  }

  return (
    <div className={cn('relative overflow-hidden', containerClassName)}>
      {isLoading && (
        <div className="absolute inset-0 bg-muted animate-pulse rounded-lg" />
      )}
      <img
        {...props}
        src={imgSrc}
        alt={alt}
        className={cn(
          'transition-opacity duration-300',
          isLoading ? 'opacity-0' : 'opacity-100',
          className
        )}
        onError={handleError}
        onLoad={handleLoad}
      />
    </div>
  );
}
