'use client'

import * as React from 'react'
import useEmblaCarousel from 'embla-carousel-react'
import type { EmblaOptionsType, EmblaCarouselType } from 'embla-carousel'
import { cn } from '../../utils/cn'
import { Button } from '../Button'
import { Icon } from '../Icon'

export interface CarouselProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Carousel items
   */
  children: React.ReactNode
  /**
   * Embla carousel options
   */
  options?: EmblaOptionsType
  /**
   * Show navigation buttons
   * @default true
   */
  showNavigation?: boolean
  /**
   * Show dots indicator
   * @default true
   */
  showDots?: boolean
  /**
   * Auto-play interval in ms (0 to disable)
   * @default 0
   */
  autoPlay?: number
  /**
   * Orientation
   * @default 'horizontal'
   */
  orientation?: 'horizontal' | 'vertical'
  /**
   * Callback when slide changes
   */
  onSlideChange?: (index: number) => void
  /**
   * Gap between slides in pixels
   * @default 16
   */
  gap?: number
  /**
   * Enable loop
   * @default true
   */
  loop?: boolean
}

/**
 * Carousel component using Embla Carousel
 * Supports auto-play, navigation, dots, and custom options
 *
 * @example
 * ```tsx
 * <Carousel loop autoPlay={3000}>
 *   <div>Slide 1</div>
 *   <div>Slide 2</div>
 *   <div>Slide 3</div>
 * </Carousel>
 * ```
 */
export const Carousel = React.forwardRef<HTMLDivElement, CarouselProps>(
  (
    {
      children,
      options,
      showNavigation = true,
      showDots = true,
      autoPlay = 0,
      orientation = 'horizontal',
      onSlideChange,
      gap = 16,
      loop = true,
      className,
      ...props
    },
    ref
  ) => {
    const [emblaRef, emblaApi] = useEmblaCarousel({
      axis: orientation === 'horizontal' ? 'x' : 'y',
      loop,
      ...options,
    })

    const [selectedIndex, setSelectedIndex] = React.useState(0)
    const [scrollSnaps, setScrollSnaps] = React.useState<number[]>([])
    const [canScrollPrev, setCanScrollPrev] = React.useState(false)
    const [canScrollNext, setCanScrollNext] = React.useState(false)

    const scrollPrev = React.useCallback(() => {
      emblaApi?.scrollPrev()
    }, [emblaApi])

    const scrollNext = React.useCallback(() => {
      emblaApi?.scrollNext()
    }, [emblaApi])

    const scrollTo = React.useCallback(
      (index: number) => {
        emblaApi?.scrollTo(index)
      },
      [emblaApi]
    )

    const onSelect = React.useCallback(() => {
      if (!emblaApi) return

      const index = emblaApi.selectedScrollSnap()
      setSelectedIndex(index)
      setCanScrollPrev(emblaApi.canScrollPrev())
      setCanScrollNext(emblaApi.canScrollNext())
      onSlideChange?.(index)
    }, [emblaApi, onSlideChange])

    React.useEffect(() => {
      if (!emblaApi) return

      onSelect()
      setScrollSnaps(emblaApi.scrollSnapList())
      emblaApi.on('select', onSelect)
      emblaApi.on('reInit', onSelect)

      return () => {
        emblaApi.off('select', onSelect)
        emblaApi.off('reInit', onSelect)
      }
    }, [emblaApi, onSelect])

    // Auto-play
    React.useEffect(() => {
      if (!emblaApi || autoPlay <= 0) return

      const interval = setInterval(() => {
        if (!emblaApi.canScrollNext() && loop) {
          emblaApi.scrollTo(0)
        } else if (emblaApi.canScrollNext()) {
          emblaApi.scrollNext()
        }
      }, autoPlay)

      return () => clearInterval(interval)
    }, [emblaApi, autoPlay, loop])

    const isHorizontal = orientation === 'horizontal'

    return (
      <div ref={ref} className={cn('relative', className)} {...props}>
        <div ref={emblaRef} className="overflow-hidden">
          <div
            className={cn('flex', isHorizontal ? 'flex-row' : 'flex-col')}
            style={{ gap: `${gap}px` }}
          >
            {React.Children.map(children, (child, index) => (
              <div
                key={index}
                className={cn('flex-[0_0_100%] min-w-0', isHorizontal ? 'mr-4' : 'mb-4')}
                style={{
                  [isHorizontal ? 'marginRight' : 'marginBottom']: gap,
                }}
              >
                {child}
              </div>
            ))}
          </div>
        </div>

        {/* Navigation Buttons */}
        {showNavigation && (
          <>
            <Button
              variant="outline"
              size="icon"
              className={cn(
                'absolute z-10 rounded-full bg-white/90 hover:bg-white',
                isHorizontal
                  ? 'left-4 top-1/2 -translate-y-1/2'
                  : 'top-4 left-1/2 -translate-x-1/2'
              )}
              onClick={scrollPrev}
              disabled={!canScrollPrev}
              aria-label="Previous slide"
            >
              <Icon name={isHorizontal ? 'ChevronLeft' : 'ChevronUp'} size={20} />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className={cn(
                'absolute z-10 rounded-full bg-white/90 hover:bg-white',
                isHorizontal
                  ? 'right-4 top-1/2 -translate-y-1/2'
                  : 'bottom-4 left-1/2 -translate-x-1/2'
              )}
              onClick={scrollNext}
              disabled={!canScrollNext}
              aria-label="Next slide"
            >
              <Icon name={isHorizontal ? 'ChevronRight' : 'ChevronDown'} size={20} />
            </Button>
          </>
        )}

        {/* Dots Indicator */}
        {showDots && scrollSnaps.length > 1 && (
          <div
            className={cn(
              'absolute z-10 flex gap-2',
              isHorizontal
                ? 'bottom-4 left-1/2 -translate-x-1/2'
                : 'right-4 top-1/2 -translate-y-1/2 flex-col'
            )}
          >
            {scrollSnaps.map((_, index) => (
              <button
                key={index}
                className={cn(
                  'w-2 h-2 rounded-full transition-all',
                  index === selectedIndex
                    ? 'bg-primary w-8'
                    : 'bg-white/50 hover:bg-white/75'
                )}
                onClick={() => scrollTo(index)}
                aria-label={`Go to slide ${index + 1}`}
              />
            ))}
          </div>
        )}
      </div>
    )
  }
)

Carousel.displayName = 'Carousel'

/**
 * CarouselItem component for explicit item wrapping
 */
export interface CarouselItemProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
}

export const CarouselItem = React.forwardRef<HTMLDivElement, CarouselItemProps>(
  ({ children, className, ...props }, ref) => {
    return (
      <div ref={ref} className={cn('min-w-0 flex-[0_0_100%]', className)} {...props}>
        {children}
      </div>
    )
  }
)

CarouselItem.displayName = 'CarouselItem'

/**
 * Hook to control carousel from outside
 */
export const useCarousel = (): {
  emblaRef: (node: HTMLElement | null) => void
  emblaApi: EmblaCarouselType | undefined
  scrollPrev: () => void
  scrollNext: () => void
  scrollTo: (index: number) => void
  selectedIndex: number
} => {
  const [emblaRef, emblaApi] = useEmblaCarousel()

  const scrollPrev = React.useCallback(() => {
    emblaApi?.scrollPrev()
  }, [emblaApi])

  const scrollNext = React.useCallback(() => {
    emblaApi?.scrollNext()
  }, [emblaApi])

  const scrollTo = React.useCallback(
    (index: number) => {
      emblaApi?.scrollTo(index)
    },
    [emblaApi]
  )

  const [selectedIndex, setSelectedIndex] = React.useState(0)

  React.useEffect(() => {
    if (!emblaApi) return

    const onSelect = () => {
      setSelectedIndex(emblaApi.selectedScrollSnap())
    }

    emblaApi.on('select', onSelect)
    onSelect()

    return () => {
      emblaApi.off('select', onSelect)
    }
  }, [emblaApi])

  return {
    emblaRef,
    emblaApi,
    scrollPrev,
    scrollNext,
    scrollTo,
    selectedIndex,
  }
}
