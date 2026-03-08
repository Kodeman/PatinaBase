'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import { cn } from '../../utils/cn'
import { ProjectMilestoneCard } from '../ProjectMilestoneCard'
import { useIntersectionAnimation } from './useIntersectionAnimation'
import { useHeaderFade } from './useHeaderFade'
import type { MilestoneDetail } from '../ProjectMilestoneCard/types'

export interface StoryTimelineProps {
  /** Array of milestones to display */
  milestones: MilestoneDetail[]
  /** Currently active/expanded milestone ID */
  activeMilestoneId?: string
  /** Callback when active milestone changes */
  onMilestoneChange?: (id: string) => void
  /** Show fixed progress indicator */
  showProgress?: boolean
  /** Enable keyboard navigation */
  enableKeyboardNav?: boolean
  /** Custom render function for milestone cards */
  renderMilestone?: (milestone: MilestoneDetail) => React.ReactNode
  /** Additional className */
  className?: string
}

/**
 * StoryTimeline - Scroll-driven timeline container
 *
 * Features:
 * - Vertical timeline with scroll animations
 * - Header fade-out effect (0-200px scroll range)
 * - Card entrance animations (Intersection Observer)
 * - Keyboard navigation (↑↓ or J/K)
 * - Single expanded milestone at a time
 *
 * @example
 * ```tsx
 * <StoryTimeline
 *   milestones={projectMilestones}
 *   activeMilestoneId={activeMilestone}
 *   onMilestoneChange={handleMilestoneChange}
 *   showProgress
 *   enableKeyboardNav
 * />
 * ```
 */
export const StoryTimeline = React.forwardRef<HTMLDivElement, StoryTimelineProps>(
  (
    {
      milestones,
      activeMilestoneId,
      onMilestoneChange,
      showProgress = true,
      enableKeyboardNav = true,
      renderMilestone,
      className,
    },
    ref
  ) => {
    const containerRef = React.useRef<HTMLDivElement>(null)
    const milestoneRefs = React.useRef<Map<string, HTMLDivElement>>(new Map())

    // Animation hooks
    const animation = useIntersectionAnimation({
      threshold: 0.25,
      once: true,
      staggerDelay: 100,
    })

    const headerFade = useHeaderFade({
      fadeRange: 200,
      darkMode: true,
      maxDarkOpacity: 0.7,
    })

    // Handle milestone expansion
    const handleMilestoneToggle = React.useCallback(
      (id: string) => {
        if (activeMilestoneId === id) {
          // Collapse if already active
          onMilestoneChange?.('')
        } else {
          // Expand new milestone
          onMilestoneChange?.(id)

          // Scroll to milestone (center in viewport)
          const element = milestoneRefs.current.get(id)
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' })
          }
        }
      },
      [activeMilestoneId, onMilestoneChange]
    )

    // Keyboard navigation
    React.useEffect(() => {
      if (!enableKeyboardNav) return

      const handleKeyDown = (e: KeyboardEvent) => {
        const currentIndex = milestones.findIndex((m) => m.id === activeMilestoneId)

        switch (e.key) {
          case 'ArrowDown':
          case 'j': {
            e.preventDefault()
            const nextIndex = Math.min(currentIndex + 1, milestones.length - 1)
            const nextMilestone = milestones[nextIndex]
            if (nextMilestone && nextMilestone.id !== activeMilestoneId) {
              handleMilestoneToggle(nextMilestone.id)
            }
            break
          }

          case 'ArrowUp':
          case 'k': {
            e.preventDefault()
            const prevIndex = Math.max(currentIndex - 1, 0)
            const prevMilestone = milestones[prevIndex]
            if (prevMilestone && prevMilestone.id !== activeMilestoneId) {
              handleMilestoneToggle(prevMilestone.id)
            }
            break
          }

          case ' ': {
            // Space toggles current milestone
            if (activeMilestoneId) {
              e.preventDefault()
              handleMilestoneToggle(activeMilestoneId)
            }
            break
          }

          case 'Escape': {
            // Escape collapses current milestone
            if (activeMilestoneId) {
              onMilestoneChange?.('')
            }
            break
          }
        }
      }

      window.addEventListener('keydown', handleKeyDown)
      return () => window.removeEventListener('keydown', handleKeyDown)
    }, [enableKeyboardNav, milestones, activeMilestoneId, handleMilestoneToggle, onMilestoneChange])

    // Set milestone ref callback
    const setMilestoneRef = React.useCallback(
      (id: string, element: HTMLDivElement | null) => {
        if (element) {
          milestoneRefs.current.set(id, element)
          animation.observeElement(id, element)
        } else {
          milestoneRefs.current.delete(id)
          animation.observeElement(id, null)
        }
      },
      [animation]
    )

    return (
      <div ref={containerRef} className="relative min-h-screen">
        {/* Dark overlay (appears as user scrolls) */}
        <div
          className="fixed inset-0 z-0"
          style={headerFade.overlayStyle}
          aria-hidden="true"
        />

        {/* Timeline content */}
        <div
          ref={ref}
          className={cn(
            'relative z-10 mx-auto max-w-4xl px-4 py-12',
            className
          )}
        >
          {/* Timeline line (left side) */}
          <div
            className="absolute left-[60px] top-0 bottom-0 w-0.5 bg-[#D1C7B7]"
            aria-hidden="true"
          />

          {/* Milestones */}
          <div className="space-y-8">
            {milestones.map((milestone, index) => {
              const isExpanded = milestone.id === activeMilestoneId
              const animationStyle = animation.getAnimationStyle(milestone.id) // USE INLINE STYLES!

              return (
                <div
                  key={milestone.id}
                  ref={(el) => setMilestoneRef(milestone.id, el)}
                  className="relative pl-24"
                  style={animationStyle}
                >
                  {/* Timeline marker */}
                  <div
                    className={cn(
                      'absolute left-[52px] top-6 flex h-4 w-4 items-center justify-center rounded-full border-2',
                      milestone.status === 'completed'
                        ? 'border-green-500 bg-green-500'
                        : milestone.status === 'in-progress'
                        ? 'border-blue-500 bg-blue-500'
                        : 'border-gray-300 bg-white'
                    )}
                    aria-hidden="true"
                  >
                    {milestone.status === 'completed' && (
                      <div className="h-2 w-2 rounded-full bg-white" />
                    )}
                    {milestone.status === 'in-progress' && (
                      <motion.div
                        className="h-2 w-2 rounded-full bg-white"
                        animate={{ scale: [1, 1.2, 1] }}
                        transition={{ duration: 1.5, repeat: Infinity }}
                      />
                    )}
                  </div>

                  {/* Milestone card */}
                  {renderMilestone ? (
                    renderMilestone(milestone)
                  ) : (
                    <ProjectMilestoneCard
                      milestone={milestone}
                      isExpanded={isExpanded}
                      onToggle={() => handleMilestoneToggle(milestone.id)}
                    />
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Keyboard navigation hint */}
        {enableKeyboardNav && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 2, duration: 0.5 }}
            className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2"
          >
            <div className="rounded-lg bg-slate-900/90 px-4 py-2 text-xs text-white shadow-lg backdrop-blur">
              <span className="flex items-center gap-2">
                <kbd className="rounded bg-slate-700 px-2 py-1">↑↓</kbd>
                or
                <kbd className="rounded bg-slate-700 px-2 py-1">J/K</kbd>
                to navigate
              </span>
            </div>
          </motion.div>
        )}
      </div>
    )
  }
)

StoryTimeline.displayName = 'StoryTimeline'
