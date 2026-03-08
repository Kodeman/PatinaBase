'use client'

import * as React from 'react'
import { cn } from '../../utils/cn'

export interface ImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  /**
   * Image source URL
   */
  src: string
  /**
   * Alt text for accessibility
   */
  alt: string
  /**
   * Aspect ratio (e.g., "16/9", "4/3", "1/1")
   */
  aspectRatio?: string
  /**
   * Object fit behavior
   * @default 'cover'
   */
  fit?: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down'
  /**
   * Loading strategy
   * @default 'lazy'
   */
  loading?: 'lazy' | 'eager'
  /**
   * Fallback image URL
   */
  fallback?: string
  /**
   * Callback when image fails to load
   */
  onError?: (event: React.SyntheticEvent<HTMLImageElement, Event>) => void
  /**
   * Callback when image successfully loads
   */
  onLoad?: (event: React.SyntheticEvent<HTMLImageElement, Event>) => void
  /**
   * Show loading skeleton
   * @default true
   */
  showSkeleton?: boolean
}

/**
 * Image component with lazy loading, aspect ratio, and fallback support
 *
 * @example
 * ```tsx
 * <Image src="/product.jpg" alt="Product" aspectRatio="4/3" />
 * <Image src="/image.jpg" alt="Image" fit="contain" fallback="/placeholder.jpg" />
 * ```
 */
export const Image = React.forwardRef<HTMLImageElement, ImageProps>(
  (
    {
      src,
      alt,
      aspectRatio,
      fit = 'cover',
      loading = 'lazy',
      fallback,
      onError,
      onLoad,
      showSkeleton = true,
      className,
      style,
      ...props
    },
    ref
  ) => {
    const [isLoading, setIsLoading] = React.useState(true)
    const [hasError, setHasError] = React.useState(false)
    const [currentSrc, setCurrentSrc] = React.useState(src)

    React.useEffect(() => {
      setCurrentSrc(src)
      setHasError(false)
      setIsLoading(true)
    }, [src])

    const handleLoad = (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
      setIsLoading(false)
      onLoad?.(event)
    }

    const handleError = (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
      setIsLoading(false)
      setHasError(true)

      if (fallback && currentSrc !== fallback) {
        setCurrentSrc(fallback)
        setHasError(false)
        setIsLoading(true)
      }

      onError?.(event)
    }

    const objectFitClass = {
      contain: 'object-contain',
      cover: 'object-cover',
      fill: 'object-fill',
      none: 'object-none',
      'scale-down': 'object-scale-down',
    }[fit]

    const containerStyle: React.CSSProperties | undefined = aspectRatio
      ? { aspectRatio, ...style }
      : style

    return (
      <div className={cn('relative overflow-hidden', className)} style={containerStyle}>
        {showSkeleton && isLoading && (
          <div className="absolute inset-0 bg-muted animate-pulse" />
        )}

        {!hasError && (
          <img
            ref={ref}
            src={currentSrc}
            alt={alt}
            loading={loading}
            onLoad={handleLoad}
            onError={handleError}
            className={cn(
              'w-full h-full transition-opacity duration-300',
              objectFitClass,
              isLoading ? 'opacity-0' : 'opacity-100'
            )}
            {...props}
          />
        )}

        {hasError && !fallback && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted">
            <div className="text-center text-muted-foreground p-4">
              <svg
                className="mx-auto h-12 w-12 mb-2"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              <p className="text-sm">Failed to load image</p>
            </div>
          </div>
        )}
      </div>
    )
  }
)

Image.displayName = 'Image'

/**
 * ImageGallery component for multiple images
 */
export interface ImageGalleryProps {
  images: Array<{ src: string; alt: string; id?: string }>
  columns?: number
  gap?: number
  aspectRatio?: string
  className?: string
}

export const ImageGallery: React.FC<ImageGalleryProps> = ({
  images,
  columns = 3,
  gap = 4,
  aspectRatio = '1/1',
  className,
}) => {
  const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: `repeat(${columns}, 1fr)`,
    gap: `${gap * 0.25}rem`,
  }

  return (
    <div className={cn('w-full', className)} style={gridStyle}>
      {images.map((image, index) => (
        <Image
          key={image.id || index}
          src={image.src}
          alt={image.alt}
          aspectRatio={aspectRatio}
        />
      ))}
    </div>
  )
}

ImageGallery.displayName = 'ImageGallery'
