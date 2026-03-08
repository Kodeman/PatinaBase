'use client'

import * as React from 'react'
import { cn } from '../../utils/cn'
import { useIntersectionReveal } from '../../hooks/useIntersectionReveal'

export interface LazyImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string
  alt: string
  placeholder?: string
  blurHash?: string
  aspectRatio?: number
  objectFit?: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down'
  onLoad?: () => void
  onError?: () => void
}

/**
 * LazyImage - Lazy loading image with intersection observer and placeholder
 *
 * @example
 * ```tsx
 * <LazyImage
 *   src="/path/to/image.jpg"
 *   alt="Description"
 *   placeholder="/path/to/placeholder.jpg"
 *   aspectRatio={16/9}
 *   objectFit="cover"
 * />
 * ```
 */
export const LazyImage = React.forwardRef<HTMLImageElement, LazyImageProps>(
  (
    {
      className,
      src,
      alt,
      placeholder,
      blurHash,
      aspectRatio,
      objectFit = 'cover',
      onLoad,
      onError,
      style,
      ...props
    },
    forwardedRef
  ) => {
    const [ref, isVisible] = useIntersectionReveal<HTMLDivElement>({
      triggerPoint: 'early',
      triggerOnce: true,
    })

    const [isLoaded, setIsLoaded] = React.useState(false)
    const [hasError, setHasError] = React.useState(false)
    const imgRef = React.useRef<HTMLImageElement>(null)

    // Merge refs
    React.useImperativeHandle(forwardedRef, () => imgRef.current as HTMLImageElement)

    React.useEffect(() => {
      if (!isVisible || isLoaded || hasError) return

      const img = new Image()
      img.src = src

      img.onload = () => {
        setIsLoaded(true)
        onLoad?.()
      }

      img.onerror = () => {
        setHasError(true)
        onError?.()
      }

      return () => {
        img.onload = null
        img.onerror = null
      }
    }, [isVisible, src, isLoaded, hasError, onLoad, onError])

    return (
      <div
        ref={ref}
        className={cn('relative overflow-hidden bg-slate-100 dark:bg-slate-800', className)}
        style={{
          ...style,
          paddingBottom: aspectRatio ? `${(1 / aspectRatio) * 100}%` : undefined,
        }}
      >
        {/* Placeholder */}
        {!isLoaded && placeholder && (
          <img
            src={placeholder}
            alt=""
            className={cn(
              'absolute inset-0 w-full h-full transition-opacity duration-300',
              isLoaded && 'opacity-0'
            )}
            style={{ objectFit }}
            aria-hidden="true"
          />
        )}

        {/* BlurHash placeholder (if provided) */}
        {!isLoaded && blurHash && !placeholder && (
          <div
            className="absolute inset-0 w-full h-full"
            style={{
              backgroundColor: blurHash,
              filter: 'blur(20px)',
              transform: 'scale(1.1)',
            }}
            aria-hidden="true"
          />
        )}

        {/* Skeleton loader */}
        {!isLoaded && !placeholder && !blurHash && (
          <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 dark:from-slate-700 dark:via-slate-600 dark:to-slate-700 animate-shimmer" />
        )}

        {/* Actual image */}
        {isVisible && !hasError && (
          <img
            ref={imgRef}
            src={src}
            alt={alt}
            className={cn(
              'absolute inset-0 w-full h-full transition-opacity duration-500',
              isLoaded ? 'opacity-100' : 'opacity-0'
            )}
            style={{ objectFit }}
            loading="lazy"
            {...props}
          />
        )}

        {/* Error state */}
        {hasError && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-100 dark:bg-slate-800">
            <div className="text-center text-slate-500 dark:text-slate-400">
              <svg
                className="w-12 h-12 mx-auto mb-2"
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

LazyImage.displayName = 'LazyImage'
