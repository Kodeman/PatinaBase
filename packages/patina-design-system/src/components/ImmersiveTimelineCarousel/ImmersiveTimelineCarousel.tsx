'use client'

import * as React from 'react'
import { motion, useTransform, useMotionValue, useMotionTemplate } from 'framer-motion'
import { cn } from '../../utils/cn'
import { Card } from '../Card'
import type { MilestoneDetail } from '../ProjectMilestoneCard/types'
import { useScrollSnap } from './useScrollSnap'
import { useResponsiveConfig } from './useResponsiveConfig'

const CARD_MAX_HEIGHT_RATIO = 0.8
const NEIGHBOR_VISIBLE_PORTION = 0.5
const OFFSCREEN_MULTIPLIER = 1.2

export interface ImmersiveTimelineCarouselProps {
  /** Array of milestones to display */
  milestones: MilestoneDetail[]
  /** Currently active milestone ID */
  activeMilestoneId?: string
  /** Callback when active milestone changes */
  onMilestoneChange?: (id: string) => void
  /** Enable keyboard navigation */
  enableKeyboardNav?: boolean
  /** Custom render function for milestone content */
  renderMilestone?: (milestone: MilestoneDetail, isActive: boolean) => React.ReactNode
  /** Hero section element (renders at top) */
  heroSection?: React.ReactNode
  /** Additional className */
  className?: string
}

/**
 * ImmersiveTimelineCarousel - Full-screen 3D carousel timeline
 *
 * Features:
 * - Full-screen carousel with one milestone visible at a time
 * - 3D depth effects with cards emerging from background
 * - Hybrid scroll mechanics with magnetic snap zones
 * - Background fade to black for immersive mode
 * - Header fade-out for complete focus
 * - Keyboard navigation and accessibility
 *
 * @example
 * ```tsx
 * <ImmersiveTimelineCarousel
 *   milestones={projectMilestones}
 *   activeMilestoneId={activeMilestone}
 *   onMilestoneChange={handleMilestoneChange}
 *   heroSection={<ProjectHero />}
 *   renderMilestone={(milestone, isActive) => (
 *     <MilestoneContent milestone={milestone} expanded={isActive} />
 *   )}
 * />
 * ```
 */
export const ImmersiveTimelineCarousel = React.forwardRef<
  HTMLDivElement,
  ImmersiveTimelineCarouselProps
>(
  (
    {
      milestones,
      activeMilestoneId,
      onMilestoneChange,
      enableKeyboardNav = true,
      renderMilestone,
      heroSection,
      className,
    },
    ref
  ) => {
    const containerRef = React.useRef<HTMLDivElement>(null)
    const scrollY = useMotionValue(0)
    const [activeIndex, setActiveIndex] = React.useState(0)
    const [heroHeight, setHeroHeight] = React.useState(1000)

    // Get responsive configuration
    const config = useResponsiveConfig()

    // Update heroHeight on client after mount (avoids hydration mismatch)
    React.useEffect(() => {
      setHeroHeight(window.innerHeight)
    }, [])

    // Manually track scroll position (useScroll has issues with app router + fixed layouts)
    React.useEffect(() => {
      if (typeof window === 'undefined') return

      const handleScroll = () => {
        scrollY.set(window.scrollY)
      }

      // Initialize with current scroll position
      handleScroll()

      window.addEventListener('scroll', handleScroll, { passive: true })
      return () => window.removeEventListener('scroll', handleScroll)
    }, [scrollY])

    // Calculate scroll positions
    const cardSpacing = heroHeight * (config.cardSpacing / 100)
    const magnetRangePx = React.useMemo(() => {
      return Math.max(config.magnetRange, heroHeight * 0.8)
    }, [config.magnetRange, heroHeight])

    const milestoneSnapPoints = React.useMemo(() => {
      return milestones.map((_, index) => heroHeight + index * cardSpacing)
    }, [milestones, heroHeight, cardSpacing])

    const snapPoints = React.useMemo(() => {
      return [0, ...milestoneSnapPoints]
    }, [milestoneSnapPoints])

    // Magnetic snap zones
    useScrollSnap(snapPoints, magnetRangePx)

    // Background fade to black
    const blackOverlayOpacity = useTransform(scrollY, [0, 200], [0, 0.95])

    // Header fade out
    const headerOpacity = useTransform(scrollY, [100, 200], [1, 0])
    const headerPointerEvents = useTransform(headerOpacity, (latest) =>
      latest > 0.1 ? 'auto' : 'none'
    )

    // Track active milestone based on scroll
    React.useEffect(() => {
      const unsubscribe = scrollY.on('change', (latest) => {
        const currentScroll = latest
        const newIndex = milestoneSnapPoints.findIndex((point, index) => {
          const nextPoint = milestoneSnapPoints[index + 1]
          return currentScroll >= point - cardSpacing / 2 && (!nextPoint || currentScroll < nextPoint - cardSpacing / 2)
        })

        if (newIndex !== -1 && newIndex !== activeIndex) {
          setActiveIndex(newIndex)
          onMilestoneChange?.(milestones[newIndex]?.id || '')
        }
      })

      return () => unsubscribe()
    }, [scrollY, milestoneSnapPoints, activeIndex, milestones, onMilestoneChange, cardSpacing])

    // Keyboard navigation
    React.useEffect(() => {
      if (!enableKeyboardNav) return

      const handleKeyDown = (e: KeyboardEvent) => {
        const currentIndex = activeIndex

        switch (e.key) {
          case 'ArrowDown':
          case 'j':
            e.preventDefault()
            if (currentIndex < milestones.length - 1) {
              const nextSnapPoint = milestoneSnapPoints[currentIndex + 1]
              window.scrollTo({ top: nextSnapPoint, behavior: 'smooth' })
            }
            break
          case 'ArrowUp':
          case 'k':
            e.preventDefault()
            if (currentIndex > 0) {
              const prevSnapPoint = milestoneSnapPoints[currentIndex - 1]
              window.scrollTo({ top: prevSnapPoint, behavior: 'smooth' })
            } else {
              window.scrollTo({ top: 0, behavior: 'smooth' })
            }
            break
          case 'Home':
            e.preventDefault()
            window.scrollTo({ top: 0, behavior: 'smooth' })
            break
          case 'End':
            e.preventDefault()
            window.scrollTo({
              top: milestoneSnapPoints[milestoneSnapPoints.length - 1] ?? 0,
              behavior: 'smooth',
            })
            break
          case 'Escape':
            e.preventDefault()
            window.scrollTo({ top: 0, behavior: 'smooth' })
            break
        }
      }

      window.addEventListener('keydown', handleKeyDown)
      return () => window.removeEventListener('keydown', handleKeyDown)
    }, [enableKeyboardNav, activeIndex, milestones.length, snapPoints])

    // Calculate total scroll height
    const cardsToScroll = Math.max(milestones.length - 1, 0)
    const totalScrollHeight = heroHeight + cardsToScroll * cardSpacing + heroHeight

    return (
      <div ref={ref} className={cn('relative', className)}>
        {/* Hero section */}
        {heroSection && (
          <div className="relative min-h-screen">
            {heroSection}
          </div>
        )}

        {/* Black background overlay */}
        <motion.div
          className="fixed inset-0 bg-black pointer-events-none z-0"
          style={{ opacity: blackOverlayOpacity }}
        />

        {/* Header overlay (passed from parent, controlled by opacity) */}
        <motion.div
          className="fixed top-0 left-0 right-0 z-50"
          style={{
            opacity: headerOpacity,
            pointerEvents: headerPointerEvents as any,
          }}
        >
          {/* Header content would be passed from parent */}
        </motion.div>

        {/* Scroll spacer - creates scroll height for animations */}
        <div
          ref={containerRef}
          style={{ height: totalScrollHeight }}
          className="relative"
          role="region"
          aria-label="Project timeline"
        />

        {/* 3D Card Stage - fixed viewport where cards animate */}
        <div className="fixed inset-0 pointer-events-none z-10">
          {milestones.map((milestone, index) => (
            <TimelineCard3D
              key={milestone.id}
              milestone={milestone}
              index={index}
              scrollY={scrollY}
              heroHeight={heroHeight}
              cardSpacing={cardSpacing}
              config={config}
              isActive={index === activeIndex}
              renderContent={renderMilestone}
            />
          ))}
        </div>

        {/* Screen reader announcement */}
        <div className="sr-only" aria-live="polite" aria-atomic="true">
          Milestone {activeIndex + 1} of {milestones.length}:{' '}
          {milestones[activeIndex]?.title}
        </div>
      </div>
    )
  }
)

ImmersiveTimelineCarousel.displayName = 'ImmersiveTimelineCarousel'

/**
 * Individual 3D Timeline Card Component
 */
interface TimelineCard3DProps {
  milestone: MilestoneDetail
  index: number
  scrollY: any
  heroHeight: number
  cardSpacing: number
  config: any
  isActive: boolean
  renderContent?: (milestone: MilestoneDetail, isActive: boolean) => React.ReactNode
}

const TimelineCard3D: React.FC<TimelineCard3DProps> = ({
  milestone,
  index,
  scrollY,
  heroHeight,
  cardSpacing,
  config,
  isActive,
  renderContent,
}) => {
  // Calculate scroll positions for this card
  const cardScrollStart = heroHeight + index * cardSpacing - heroHeight * 1.5
  const cardScrollCenter = heroHeight + index * cardSpacing
  const cardScrollEnd = heroHeight + index * cardSpacing + heroHeight

  const neighborVisibilityStart = cardScrollCenter - cardSpacing
  const neighborVisibilityEnd = cardScrollCenter + cardSpacing
  const farBefore = neighborVisibilityStart - heroHeight
  const farAfter = neighborVisibilityEnd + heroHeight
  const cardHalfHeightOffset = heroHeight * CARD_MAX_HEIGHT_RATIO * NEIGHBOR_VISIBLE_PORTION
  const offscreenOffset = heroHeight * OFFSCREEN_MULTIPLIER
  const visibilityRange = [
    farBefore,
    neighborVisibilityStart,
    cardScrollCenter,
    neighborVisibilityEnd,
    farAfter,
  ]

  // Transform mappings
  const y = useTransform(
    scrollY,
    visibilityRange,
    [offscreenOffset, cardHalfHeightOffset, 0, -cardHalfHeightOffset, -offscreenOffset]
  )

  const scale = useTransform(
    scrollY,
    [cardScrollStart, cardScrollCenter, cardScrollEnd],
    config.scaleRange
  )

  const z = useTransform(
    scrollY,
    [cardScrollStart, cardScrollCenter, cardScrollEnd],
    [-500, 0, -300]
  )

  const opacity = useTransform(
    scrollY,
    visibilityRange,
    [0, 0.45, 1, 0.45, 0]
  )

  const blur = useTransform(
    scrollY,
    [cardScrollStart, cardScrollCenter, cardScrollEnd],
    [10, 0, 5]
  )

  // Combined transform
  const transform = useMotionTemplate`
    translate(-50%, -50%)
    translateY(${y}px)
    translateZ(${z}px)
    scale(${scale as any})
  `

  const filter = useMotionTemplate`blur(${blur}px)`

  return (
    <motion.div
      className="absolute top-1/2 left-1/2 pointer-events-auto"
      style={{
        width: config.cardWidth,
        maxHeight: '80vh',
        transform,
        opacity,
        filter,
        transformOrigin: 'center center',
        willChange: 'transform, opacity',
        backfaceVisibility: 'hidden',
        perspective: 1000,
      }}
      role="article"
      aria-label={`Milestone ${index + 1}: ${milestone.title}`}
      tabIndex={isActive ? 0 : -1}
    >
      <Card className="overflow-hidden shadow-2xl">
        {renderContent ? (
          renderContent(milestone, isActive)
        ) : (
          <div className="p-6">
            <h3 className="text-2xl font-bold mb-4">{milestone.title}</h3>
            <p className="text-muted-foreground">{milestone.description}</p>
          </div>
        )}
      </Card>
    </motion.div>
  )
}
