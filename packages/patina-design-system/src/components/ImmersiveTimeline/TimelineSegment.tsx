'use client'

import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../utils/cn'
import { ContentReveal } from './ContentReveal'

const segmentVariants = cva(
  'relative transition-all duration-500',
  {
    variants: {
      status: {
        completed: 'opacity-70 hover:opacity-100',
        active: 'opacity-100',
        upcoming: 'opacity-60',
        blocked: 'opacity-40 cursor-not-allowed',
      },
      size: {
        compact: 'py-4',
        standard: 'py-8',
        hero: 'py-16',
      },
    },
    defaultVariants: {
      status: 'upcoming',
      size: 'standard',
    },
  }
)

const markerVariants = cva(
  'flex items-center justify-center rounded-full border-4 transition-all duration-300',
  {
    variants: {
      status: {
        completed: 'border-emerald-500 bg-emerald-500 text-white shadow-lg shadow-emerald-500/30',
        active: 'border-indigo-500 bg-indigo-500 text-white shadow-2xl shadow-indigo-500/50 ring-4 ring-indigo-500/30 animate-pulse-soft',
        upcoming: 'border-indigo-100 bg-white text-indigo-300 dark:border-indigo-900 dark:bg-slate-800',
        blocked: 'border-slate-300 bg-slate-100 text-slate-400 dark:border-slate-700 dark:bg-slate-800',
      },
      size: {
        compact: 'w-8 h-8',
        standard: 'w-12 h-12',
        hero: 'w-16 h-16',
      },
    },
    defaultVariants: {
      status: 'upcoming',
      size: 'standard',
    },
  }
)

export interface MediaAsset {
  id: string
  url: string
  type: 'image' | 'video'
  thumbnail?: string
  alt?: string
  caption?: string
}

export interface TimelineSegmentData {
  id: string
  type: 'milestone' | 'task' | 'approval' | 'update'
  status: 'completed' | 'active' | 'upcoming' | 'blocked'
  title: string
  description?: string
  date?: Date | string
  media?: MediaAsset[]
  icon?: React.ReactNode
  metadata?: Record<string, any>
}

export interface TimelineSegmentProps
  extends React.ComponentPropsWithoutRef<'div'>,
    VariantProps<typeof segmentVariants> {
  segment: TimelineSegmentData
  size?: 'compact' | 'standard' | 'hero'
  expandable?: boolean
  expanded?: boolean
  onExpand?: (id: string) => void
  onToggleExpand?: () => void
  children?: React.ReactNode
  expansionStyles?: React.CSSProperties
  iconRotation?: string
}

/**
 * TimelineSegment - Individual timeline entry with status-based styling
 *
 * @example
 * ```tsx
 * <TimelineSegment
 *   segment={{
 *     id: '1',
 *     type: 'milestone',
 *     status: 'completed',
 *     title: 'Design Approved',
 *     description: 'Client approved the initial design concepts',
 *     date: new Date(),
 *   }}
 * />
 * ```
 */
export const TimelineSegment = React.forwardRef<HTMLDivElement, TimelineSegmentProps>(
  (
    {
      className,
      segment,
      size = 'standard',
      expandable = false,
      expanded,
      onExpand,
      onToggleExpand,
      children,
      expansionStyles,
      iconRotation,
      ...props
    },
    ref
  ) => {
    const [localExpanded, setLocalExpanded] = React.useState(false)
    const isExpanded = expanded !== undefined ? expanded : localExpanded
    const { id, status, title, description, date, icon, type } = segment

    const handleToggleExpand = () => {
      if (!expandable) return
      if (onToggleExpand) {
        onToggleExpand()
      } else {
        setLocalExpanded(!localExpanded)
        onExpand?.(id)
      }
    }

    const formattedDate = React.useMemo(() => {
      if (!date) return null
      const dateObj = typeof date === 'string' ? new Date(date) : date
      return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }).format(dateObj)
    }, [date])

    return (
      <ContentReveal
        ref={ref}
        animation="slideUp"
        triggerPoint="standard"
        className={cn(segmentVariants({ status, size }), className)}
        {...props}
      >
        <div className="flex gap-6">
          {/* Timeline marker and connector */}
          <div className="flex flex-col items-center">
            <div className={cn(markerVariants({ status, size }))}>
              {icon ? (
                <span className="inline-flex shrink-0">{icon}</span>
              ) : status === 'completed' ? (
                <svg
                  className="w-1/2 h-1/2"
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
              ) : status === 'active' ? (
                <div className="w-3 h-3 rounded-full bg-white" />
              ) : status === 'blocked' ? (
                <svg
                  className="w-1/2 h-1/2"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              ) : (
                <div className="w-2 h-2 rounded-full bg-current" />
              )}
            </div>

            {/* Connector line */}
            <div
              className={cn(
                'w-1 flex-1 min-h-[60px] transition-all duration-500',
                status === 'completed'
                  ? 'bg-gradient-to-b from-emerald-500 to-emerald-300'
                  : status === 'active'
                  ? 'bg-gradient-to-b from-indigo-500 to-indigo-200'
                  : 'bg-slate-200 dark:bg-slate-700'
              )}
            />
          </div>

          {/* Content */}
          <div className="flex-1 pb-8">
            <div className="flex items-start justify-between gap-4 mb-2">
              <div className="flex-1">
                {/* Type badge */}
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className={cn(
                      'inline-flex items-center px-2 py-1 rounded-full text-xs font-medium',
                      type === 'milestone' && 'bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300',
                      type === 'approval' && 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
                      type === 'task' && 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
                      type === 'update' && 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                    )}
                  >
                    {type}
                  </span>
                  {status === 'active' && (
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300">
                      In Progress
                    </span>
                  )}
                </div>

                {/* Title */}
                <h3
                  className={cn(
                    'font-semibold transition-colors',
                    size === 'compact' && 'text-lg',
                    size === 'standard' && 'text-xl',
                    size === 'hero' && 'text-3xl',
                    status === 'completed' && 'text-slate-600 dark:text-slate-400',
                    status === 'active' && 'text-slate-900 dark:text-white',
                    status === 'upcoming' && 'text-slate-700 dark:text-slate-300',
                    status === 'blocked' && 'text-slate-500 dark:text-slate-500'
                  )}
                >
                  {title}
                </h3>

                {/* Description */}
                {description && (
                  <p className="mt-2 text-slate-600 dark:text-slate-400">
                    {description}
                  </p>
                )}
              </div>

              {/* Date */}
              {formattedDate && (
                <time className="text-sm text-slate-500 dark:text-slate-400 whitespace-nowrap">
                  {formattedDate}
                </time>
              )}
            </div>

            {/* Expandable content */}
            {expandable && (
              <button
                type="button"
                onClick={handleToggleExpand}
                className="mt-2 text-sm font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 transition-colors"
              >
                {isExpanded ? 'Show less' : 'Show more'}
              </button>
            )}

            {/* Children (custom content) */}
            {children && (
              <div
                className={cn(
                  'mt-4 overflow-hidden transition-all duration-300',
                  expandable && !isExpanded && 'max-h-0',
                  expandable && isExpanded && 'max-h-[2000px]'
                )}
              >
                {children}
              </div>
            )}
          </div>
        </div>
      </ContentReveal>
    )
  }
)

TimelineSegment.displayName = 'TimelineSegment'
