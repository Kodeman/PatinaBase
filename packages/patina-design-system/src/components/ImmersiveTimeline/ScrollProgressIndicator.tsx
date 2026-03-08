'use client'

import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../utils/cn'
import { useScrollProgress } from '../../hooks/useScrollProgress'

const progressIndicatorVariants = cva(
  'fixed z-50 flex flex-col items-center gap-2',
  {
    variants: {
      position: {
        'fixed-left': 'left-4 top-1/2 -translate-y-1/2',
        'fixed-right': 'right-4 top-1/2 -translate-y-1/2',
      },
      size: {
        sm: 'w-2',
        md: 'w-3',
        lg: 'w-4',
      },
    },
    defaultVariants: {
      position: 'fixed-right',
      size: 'md',
    },
  }
)

export interface TimelineSegmentMarker {
  id: string
  label: string
  percentage: number
  status?: 'completed' | 'active' | 'upcoming' | 'blocked'
}

export interface ScrollProgressIndicatorProps
  extends VariantProps<typeof progressIndicatorVariants> {
  segments?: TimelineSegmentMarker[]
  showPercentage?: boolean
  height?: number // viewport percentage
  onSegmentClick?: (segment: TimelineSegmentMarker) => void
  onSegmentHover?: (segment: TimelineSegmentMarker | null) => void
  className?: string
  style?: React.CSSProperties
}

/**
 * ScrollProgressIndicator - Fixed position scroll progress tracker
 *
 * @example
 * ```tsx
 * <ScrollProgressIndicator
 *   position="fixed-right"
 *   segments={[
 *     { id: '1', label: 'Discovery', percentage: 0 },
 *     { id: '2', label: 'Design', percentage: 33 },
 *     { id: '3', label: 'Installation', percentage: 66 },
 *   ]}
 *   showPercentage
 * />
 * ```
 */
export const ScrollProgressIndicator = React.forwardRef<
  HTMLDivElement,
  ScrollProgressIndicatorProps
>(
  (
    {
      position,
      size,
      segments = [],
      showPercentage = false,
      height = 60,
      onSegmentClick,
      onSegmentHover,
      className,
      style,
    },
    ref
  ) => {
    const { scrollPercentage } = useScrollProgress()
    const [hoveredSegment, setHoveredSegment] = React.useState<string | null>(null)

    const handleSegmentClick = (segment: TimelineSegmentMarker) => {
      onSegmentClick?.(segment)

      // Scroll to segment
      const targetPercentage = segment.percentage / 100
      const scrollHeight = document.documentElement.scrollHeight - window.innerHeight
      const targetScroll = scrollHeight * targetPercentage

      window.scrollTo({
        top: targetScroll,
        behavior: 'smooth',
      })
    }

    const handleSegmentHover = (segment: TimelineSegmentMarker | null) => {
      setHoveredSegment(segment?.id || null)
      onSegmentHover?.(segment)
    }

    return (
      <div
        ref={ref}
        className={cn(progressIndicatorVariants({ position, size }), className)}
        style={{ ...style, height: `${height}vh` }}
      >
        {/* Progress bar track */}
        <div className="relative flex-1 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
          {/* Progress fill */}
          <div
            className="absolute top-0 left-0 w-full bg-gradient-to-b from-indigo-500 to-violet-500 transition-all duration-300 ease-out"
            style={{ height: `${scrollPercentage}%` }}
          >
            {/* Shimmer effect */}
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/30 to-transparent animate-shimmer" />
          </div>

          {/* Segment markers */}
          {segments.map((segment) => {
            const isActive = scrollPercentage >= segment.percentage
            const isHovered = hoveredSegment === segment.id

            return (
              <button
                key={segment.id}
                type="button"
                onClick={() => handleSegmentClick(segment)}
                onMouseEnter={() => handleSegmentHover(segment)}
                onMouseLeave={() => handleSegmentHover(null)}
                className={cn(
                  'absolute left-1/2 -translate-x-1/2 -translate-y-1/2 z-10',
                  'w-4 h-4 rounded-full border-2 transition-all duration-300',
                  'hover:scale-125 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2',
                  isActive
                    ? segment.status === 'completed'
                      ? 'bg-emerald-500 border-emerald-600'
                      : segment.status === 'active'
                      ? 'bg-indigo-500 border-indigo-600 ring-4 ring-indigo-500/30'
                      : 'bg-indigo-500 border-indigo-600'
                    : segment.status === 'blocked'
                    ? 'bg-slate-300 border-slate-400'
                    : 'bg-white border-slate-300',
                  isHovered && 'scale-125 ring-2 ring-indigo-400'
                )}
                style={{ top: `${segment.percentage}%` }}
                aria-label={segment.label}
              >
                {segment.status === 'completed' && (
                  <svg
                    className="w-full h-full text-white p-0.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={3}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                )}
              </button>
            )
          })}
        </div>

        {/* Percentage display */}
        {showPercentage && (
          <div className="text-xs font-semibold text-slate-600 dark:text-slate-300 tabular-nums">
            {Math.round(scrollPercentage)}%
          </div>
        )}

        {/* Segment label tooltip */}
        {hoveredSegment && (
          <div className="absolute left-full ml-4 px-3 py-2 bg-slate-900 text-white text-sm rounded-lg shadow-lg whitespace-nowrap pointer-events-none">
            {segments.find((s) => s.id === hoveredSegment)?.label}
            <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-slate-900" />
          </div>
        )}
      </div>
    )
  }
)

ScrollProgressIndicator.displayName = 'ScrollProgressIndicator'
