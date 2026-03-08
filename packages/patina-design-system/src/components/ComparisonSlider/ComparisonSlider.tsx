'use client'

import * as React from 'react'
import { cn } from '../../utils/cn'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export interface ComparisonSliderProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Before image URL */
  beforeImage: string
  /** After image URL */
  afterImage: string
  /** Alt text for before image */
  beforeAlt?: string
  /** Alt text for after image */
  afterAlt?: string
  /** Label for before state */
  beforeLabel?: string
  /** Label for after state */
  afterLabel?: string
  /** Initial slider position (0-100) */
  initialPosition?: number
  /** Aspect ratio */
  aspectRatio?: 'square' | 'video' | 'wide' | 'portrait'
  /** Show labels */
  showLabels?: boolean
  /** Orientation */
  orientation?: 'horizontal' | 'vertical'
}

/**
 * ComparisonSlider - Interactive before/after image comparison slider
 *
 * @example
 * ```tsx
 * <ComparisonSlider
 *   beforeImage="/before.jpg"
 *   afterImage="/after.jpg"
 *   beforeLabel="Before"
 *   afterLabel="After"
 *   initialPosition={50}
 * />
 * ```
 */
export const ComparisonSlider: React.FC<ComparisonSliderProps> = ({
  className,
  beforeImage,
  afterImage,
  beforeAlt = 'Before',
  afterAlt = 'After',
  beforeLabel = 'Before',
  afterLabel = 'After',
  initialPosition = 50,
  aspectRatio = 'video',
  showLabels = true,
  orientation = 'horizontal',
  ...props
}) => {
  const [sliderPosition, setSliderPosition] = React.useState(initialPosition)
  const [isDragging, setIsDragging] = React.useState(false)
  const containerRef = React.useRef<HTMLDivElement>(null)

  const aspectRatioClasses = {
    square: 'aspect-square',
    video: 'aspect-video',
    wide: 'aspect-[21/9]',
    portrait: 'aspect-[3/4]',
  }

  const handleMove = React.useCallback(
    (clientX: number, clientY: number) => {
      if (!containerRef.current) return

      const rect = containerRef.current.getBoundingClientRect()
      let position: number

      if (orientation === 'horizontal') {
        position = ((clientX - rect.left) / rect.width) * 100
      } else {
        position = ((clientY - rect.top) / rect.height) * 100
      }

      setSliderPosition(Math.max(0, Math.min(100, position)))
    },
    [orientation]
  )

  const handleMouseDown = () => {
    setIsDragging(true)
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return
    handleMove(e.clientX, e.clientY)
  }

  const handleTouchMove = (e: TouchEvent) => {
    if (!isDragging) return
    e.preventDefault()
    const touch = e.touches[0]
    handleMove(touch.clientX, touch.clientY)
  }

  React.useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
      window.addEventListener('touchmove', handleTouchMove, { passive: false })
      window.addEventListener('touchend', handleMouseUp)

      return () => {
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleMouseUp)
        window.removeEventListener('touchmove', handleTouchMove)
        window.removeEventListener('touchend', handleMouseUp)
      }
    }
    return undefined
  }, [isDragging, handleMouseMove])

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative overflow-hidden rounded-lg select-none',
        aspectRatioClasses[aspectRatio],
        className
      )}
      {...props}
    >
      {/* After image (background) */}
      <div className="absolute inset-0">
        <img
          src={afterImage}
          alt={afterAlt}
          className="w-full h-full object-cover"
          draggable={false}
        />
        {showLabels && (
          <div className="absolute top-4 right-4 bg-black/70 text-white px-3 py-1 rounded-full text-sm font-medium backdrop-blur-sm">
            {afterLabel}
          </div>
        )}
      </div>

      {/* Before image (clipped) */}
      <div
        className="absolute inset-0 overflow-hidden"
        style={
          orientation === 'horizontal'
            ? { clipPath: `inset(0 ${100 - sliderPosition}% 0 0)` }
            : { clipPath: `inset(0 0 ${100 - sliderPosition}% 0)` }
        }
      >
        <img
          src={beforeImage}
          alt={beforeAlt}
          className="w-full h-full object-cover"
          draggable={false}
        />
        {showLabels && (
          <div className="absolute top-4 left-4 bg-black/70 text-white px-3 py-1 rounded-full text-sm font-medium backdrop-blur-sm">
            {beforeLabel}
          </div>
        )}
      </div>

      {/* Slider handle */}
      <div
        className={cn(
          'absolute z-10 cursor-ew-resize',
          orientation === 'horizontal'
            ? 'top-0 bottom-0 -translate-x-1/2'
            : 'left-0 right-0 -translate-y-1/2 cursor-ns-resize'
        )}
        style={
          orientation === 'horizontal'
            ? { left: `${sliderPosition}%` }
            : { top: `${sliderPosition}%` }
        }
        onMouseDown={handleMouseDown}
        onTouchStart={(e) => {
          e.preventDefault()
          setIsDragging(true)
        }}
      >
        {/* Line */}
        <div
          className={cn(
            'bg-white shadow-lg',
            orientation === 'horizontal' ? 'w-1 h-full' : 'h-1 w-full'
          )}
        />

        {/* Handle circle */}
        <div
          className={cn(
            'absolute bg-white rounded-full shadow-lg flex items-center justify-center',
            orientation === 'horizontal'
              ? 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-12 w-12'
              : 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-12 w-12'
          )}
        >
          {orientation === 'horizontal' ? (
            <>
              <ChevronLeft className="h-5 w-5 absolute left-1" />
              <ChevronRight className="h-5 w-5 absolute right-1" />
            </>
          ) : (
            <>
              <ChevronLeft className="h-5 w-5 absolute top-1 rotate-90" />
              <ChevronRight className="h-5 w-5 absolute bottom-1 rotate-90" />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
