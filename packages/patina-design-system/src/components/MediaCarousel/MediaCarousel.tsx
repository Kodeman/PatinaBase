'use client'

import * as React from 'react'
import { cn } from '../../utils/cn'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '../Button/Button'

export interface MediaItem {
  id: string
  type: 'image' | 'video'
  url: string
  alt?: string
  caption?: string
  thumbnail?: string
}

export interface MediaCarouselProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Media items to display */
  items: MediaItem[]
  /** Auto play interval in ms (0 to disable) */
  autoPlay?: number
  /** Show navigation arrows */
  showNavigation?: boolean
  /** Show pagination dots */
  showPagination?: boolean
  /** Show thumbnails */
  showThumbnails?: boolean
  /** Loop carousel */
  loop?: boolean
  /** Aspect ratio */
  aspectRatio?: 'video' | 'square' | 'wide'
  /** Callback when item changes */
  onItemChange?: (index: number) => void
}

/**
 * MediaCarousel - Carousel component for displaying images and videos
 *
 * @example
 * ```tsx
 * <MediaCarousel
 *   items={mediaItems}
 *   autoPlay={5000}
 *   showThumbnails
 *   aspectRatio="video"
 * />
 * ```
 */
export const MediaCarousel: React.FC<MediaCarouselProps> = ({
  className,
  items,
  autoPlay = 0,
  showNavigation = true,
  showPagination = true,
  showThumbnails = false,
  loop = true,
  aspectRatio = 'video',
  onItemChange,
  ...props
}) => {
  const [currentIndex, setCurrentIndex] = React.useState(0)
  const [touchStart, setTouchStart] = React.useState(0)
  const [touchEnd, setTouchEnd] = React.useState(0)
  const autoPlayRef = React.useRef<NodeJS.Timeout | undefined>(undefined)

  const aspectRatioClasses = {
    video: 'aspect-video',
    square: 'aspect-square',
    wide: 'aspect-[21/9]',
  }

  const goToSlide = React.useCallback((index: number) => {
    setCurrentIndex(index)
    onItemChange?.(index)
  }, [onItemChange])

  const goToPrevious = React.useCallback(() => {
    const newIndex = currentIndex === 0 ? (loop ? items.length - 1 : 0) : currentIndex - 1
    goToSlide(newIndex)
  }, [currentIndex, loop, items.length, goToSlide])

  const goToNext = React.useCallback(() => {
    const newIndex = currentIndex === items.length - 1 ? (loop ? 0 : currentIndex) : currentIndex + 1
    goToSlide(newIndex)
  }, [currentIndex, loop, items.length, goToSlide])

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.targetTouches[0].clientX)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX)
  }

  const handleTouchEnd = () => {
    if (touchStart - touchEnd > 75) {
      goToNext()
    }
    if (touchStart - touchEnd < -75) {
      goToPrevious()
    }
  }

  React.useEffect(() => {
    if (autoPlay > 0) {
      autoPlayRef.current = setInterval(goToNext, autoPlay)
      return () => {
        if (autoPlayRef.current) {
          clearInterval(autoPlayRef.current)
        }
      }
    }
    return undefined
  }, [currentIndex, autoPlay, goToNext])

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goToPrevious()
      if (e.key === 'ArrowRight') goToNext()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [goToPrevious, goToNext])

  if (items.length === 0) {
    return (
      <div className={cn('rounded-lg bg-muted flex items-center justify-center', aspectRatioClasses[aspectRatio])}>
        <p className="text-muted-foreground">No media available</p>
      </div>
    )
  }

  return (
    <div className={cn('relative', className)} {...props}>
      {/* Main carousel */}
      <div
        className={cn('relative rounded-lg overflow-hidden bg-black', aspectRatioClasses[aspectRatio])}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div
          className="flex h-full transition-transform duration-500 ease-out"
          style={{ transform: `translateX(-${currentIndex * 100}%)` }}
        >
          {items.map((item, index) => (
            <div key={item.id} className="flex-shrink-0 w-full h-full">
              {item.type === 'image' ? (
                <img
                  src={item.url}
                  alt={item.alt || `Slide ${index + 1}`}
                  className="w-full h-full object-cover"
                />
              ) : (
                <video
                  src={item.url}
                  controls
                  className="w-full h-full object-contain"
                  poster={item.thumbnail}
                />
              )}
            </div>
          ))}
        </div>

        {/* Caption */}
        {items[currentIndex].caption && (
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-4">
            <p className="text-white text-sm font-medium">{items[currentIndex].caption}</p>
          </div>
        )}

        {/* Navigation arrows */}
        {showNavigation && items.length > 1 && (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="absolute left-2 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-white/90 hover:bg-white text-black shadow-lg"
              onClick={goToPrevious}
              disabled={!loop && currentIndex === 0}
            >
              <ChevronLeft className="h-6 w-6" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-white/90 hover:bg-white text-black shadow-lg"
              onClick={goToNext}
              disabled={!loop && currentIndex === items.length - 1}
            >
              <ChevronRight className="h-6 w-6" />
            </Button>
          </>
        )}
      </div>

      {/* Pagination dots */}
      {showPagination && items.length > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          {items.map((_, index) => (
            <button
              key={index}
              className={cn(
                'h-2 rounded-full transition-all',
                currentIndex === index ? 'w-8 bg-primary' : 'w-2 bg-muted-foreground/30 hover:bg-muted-foreground/50'
              )}
              onClick={() => goToSlide(index)}
              aria-label={`Go to slide ${index + 1}`}
            />
          ))}
        </div>
      )}

      {/* Thumbnails */}
      {showThumbnails && items.length > 1 && (
        <div className="flex gap-2 mt-4 overflow-x-auto pb-2">
          {items.map((item, index) => (
            <button
              key={item.id}
              className={cn(
                'flex-shrink-0 w-20 h-20 rounded-md overflow-hidden border-2 transition-all',
                currentIndex === index ? 'border-primary scale-105' : 'border-transparent opacity-60 hover:opacity-100'
              )}
              onClick={() => goToSlide(index)}
            >
              <img
                src={item.thumbnail || item.url}
                alt={item.alt || `Thumbnail ${index + 1}`}
                className="w-full h-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
