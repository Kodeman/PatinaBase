'use client'

import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../utils/cn'
import { TimelineSegment, type TimelineSegmentData } from './TimelineSegment'
import { ScrollProgressIndicator, type TimelineSegmentMarker } from './ScrollProgressIndicator'
import { useScrollProgress } from '../../hooks/useScrollProgress'
import { useKeyPressCallback } from '../../hooks/useKeyPressCallback'
import type { ScrollAnimationConfig } from './types'
import {
  useHeaderFade,
  useBackgroundTransition,
  useCardAnimations,
  useExpansionAnimations,
} from './hooks'

const timelineVariants = cva(
  'relative w-full',
  {
    variants: {
      layout: {
        default: 'max-w-4xl mx-auto px-4',
        wide: 'max-w-6xl mx-auto px-6',
        full: 'w-full px-8',
      },
      spacing: {
        compact: 'space-y-2',
        comfortable: 'space-y-8',
        spacious: 'space-y-16',
      },
    },
    defaultVariants: {
      layout: 'default',
      spacing: 'comfortable',
    },
  }
)

export interface ImmersiveTimelineProps
  extends React.ComponentPropsWithoutRef<'div'>,
    VariantProps<typeof timelineVariants> {
  segments: TimelineSegmentData[]
  showProgress?: boolean
  progressPosition?: 'fixed-left' | 'fixed-right'
  enableKeyboardNav?: boolean
  onSegmentChange?: (segment: TimelineSegmentData) => void
  segmentSize?: 'compact' | 'standard' | 'hero'
  renderSegment?: (segment: TimelineSegmentData) => React.ReactNode
  scrollAnimations?: ScrollAnimationConfig
}

/**
 * ImmersiveTimeline - Scroll-driven timeline with progressive disclosure
 *
 * @example
 * ```tsx
 * <ImmersiveTimeline
 *   segments={projectSegments}
 *   showProgress
 *   enableKeyboardNav
 *   layout="wide"
 * />
 * ```
 */
export const ImmersiveTimeline = React.forwardRef<HTMLDivElement, ImmersiveTimelineProps>(
  (
    {
      className,
      layout,
      spacing,
      segments,
      showProgress = true,
      progressPosition = 'fixed-right',
      enableKeyboardNav = true,
      onSegmentChange,
      segmentSize = 'standard',
      renderSegment,
      scrollAnimations,
      ...props
    },
    ref
  ) => {
    const containerRef = React.useRef<HTMLDivElement>(null)
    const segmentRefs = React.useRef<Map<string, HTMLDivElement>>(new Map())
    const [activeSegmentId, setActiveSegmentId] = React.useState<string | null>(null)

    const { scrollPercentage } = useScrollProgress()

    // Initialize animation hooks
    const headerAnimation = useHeaderFade(scrollAnimations?.header)
    const backgroundAnimation = useBackgroundTransition(scrollAnimations?.background)
    const cardAnimation = useCardAnimations(scrollAnimations?.cards)
    const expansionAnimation = useExpansionAnimations(scrollAnimations?.expansion)

    // Generate progress markers from segments
    const progressMarkers = React.useMemo((): TimelineSegmentMarker[] => {
      return segments.map((segment, index) => ({
        id: segment.id,
        label: segment.title,
        percentage: (index / Math.max(segments.length - 1, 1)) * 100,
        status: segment.status,
      }))
    }, [segments])

    // Track active segment based on scroll position
    React.useEffect(() => {
      const observers: IntersectionObserver[] = []

      segments.forEach((segment) => {
        const element = segmentRefs.current.get(segment.id)
        if (!element) return

        const observer = new IntersectionObserver(
          ([entry]) => {
            if (entry.isIntersecting) {
              setActiveSegmentId(segment.id)
              onSegmentChange?.(segment)
            }
          },
          {
            threshold: 0.5, // Consider active when 50% visible
            rootMargin: '-20% 0px -20% 0px',
          }
        )

        observer.observe(element)
        observers.push(observer)
      })

      return () => {
        observers.forEach((observer) => observer.disconnect())
      }
    }, [segments, onSegmentChange])

    // Keyboard navigation
    const handleNavigateNext = React.useCallback(() => {
      const currentIndex = segments.findIndex((s) => s.id === activeSegmentId)
      const nextIndex = Math.min(currentIndex + 1, segments.length - 1)
      const nextSegment = segments[nextIndex]

      if (nextSegment) {
        const element = segmentRefs.current.get(nextSegment.id)
        element?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }, [activeSegmentId, segments])

    const handleNavigatePrevious = React.useCallback(() => {
      const currentIndex = segments.findIndex((s) => s.id === activeSegmentId)
      const prevIndex = Math.max(currentIndex - 1, 0)
      const prevSegment = segments[prevIndex]

      if (prevSegment) {
        const element = segmentRefs.current.get(prevSegment.id)
        element?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }, [activeSegmentId, segments])

    // Keyboard event handlers
    useKeyPressCallback('ArrowDown', handleNavigateNext, { enabled: enableKeyboardNav })
    useKeyPressCallback('ArrowUp', handleNavigatePrevious, { enabled: enableKeyboardNav })
    useKeyPressCallback('j', handleNavigateNext, { enabled: enableKeyboardNav })
    useKeyPressCallback('k', handleNavigatePrevious, { enabled: enableKeyboardNav })

    const setSegmentRef = React.useCallback((id: string, element: HTMLDivElement | null) => {
      if (element) {
        segmentRefs.current.set(id, element)
        // Also observe for card animations
        cardAnimation.observeElement(id, element)
      } else {
        segmentRefs.current.delete(id)
        cardAnimation.observeElement(id, null)
      }
    }, [cardAnimation])

    return (
      <div ref={containerRef} className="relative">
        {/* Background overlay for scroll animations */}
        {scrollAnimations?.background && (
          <div
            className="fixed inset-0 pointer-events-none z-0"
            style={{
              background: backgroundAnimation.gradient,
              opacity: backgroundAnimation.overlayOpacity,
              transition: backgroundAnimation.transition,
            }}
          />
        )}

        {/* Progress indicator */}
        {showProgress && (
          <ScrollProgressIndicator
            position={progressPosition}
            segments={progressMarkers}
            showPercentage
            style={
              scrollAnimations?.header
                ? {
                    opacity: headerAnimation.opacity,
                    transition: headerAnimation.transition,
                  }
                : undefined
            }
          />
        )}

        {/* Timeline content */}
        <div
          ref={ref}
          className={cn(
            timelineVariants({ layout, spacing }),
            'relative z-10',
            className
          )}
          {...props}
        >
          {segments.map((segment) => {
            const animationClass = cardAnimation.getAnimationClass(segment.id)
            const staggerDelay = cardAnimation.getStaggerDelay(segment.id)
            const isExpanded = expansionAnimation.isExpanded(segment.id)

            return (
              <div
                key={segment.id}
                ref={(el) => setSegmentRef(segment.id, el)}
                data-segment-id={segment.id}
                data-active={activeSegmentId === segment.id}
                className={animationClass}
                style={{
                  transitionDelay: staggerDelay ? `${staggerDelay}ms` : undefined,
                }}
              >
                {renderSegment ? (
                  renderSegment(segment)
                ) : (
                  <TimelineSegment
                    segment={segment}
                    size={segmentSize}
                    expandable={!!segment.metadata?.expandable}
                    expanded={isExpanded}
                    onToggleExpand={() => expansionAnimation.toggleExpanded(segment.id)}
                    expansionStyles={
                      scrollAnimations?.expansion
                        ? expansionAnimation.getExpansionStyles(segment.id, isExpanded)
                        : undefined
                    }
                    iconRotation={
                      scrollAnimations?.expansion
                        ? expansionAnimation.getIconRotation(segment.id, isExpanded)
                        : undefined
                    }
                  />
                )}
              </div>
            )
          })}
        </div>

        {/* Keyboard navigation hint */}
        {enableKeyboardNav && (
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 opacity-0 hover:opacity-100 transition-opacity">
            <div className="bg-slate-900/90 backdrop-blur text-white text-xs px-3 py-2 rounded-lg shadow-lg">
              <span className="flex items-center gap-2">
                <kbd className="px-2 py-1 bg-slate-700 rounded">↑↓</kbd>
                or
                <kbd className="px-2 py-1 bg-slate-700 rounded">J/K</kbd>
                to navigate
              </span>
            </div>
          </div>
        )}
      </div>
    )
  }
)

ImmersiveTimeline.displayName = 'ImmersiveTimeline'
