'use client'

import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../utils/cn'
import { Badge } from '../Badge/Badge'
import { Button } from '../Button/Button'
import { Check, Clock, Circle, Sparkles } from 'lucide-react'

const milestoneCardVariants = cva(
  'group relative rounded-lg border bg-card text-card-foreground transition-all duration-300',
  {
    variants: {
      size: {
        compact: 'p-4',
        standard: 'p-6',
        hero: 'p-8 md:p-10',
      },
      elevation: {
        subtle: 'shadow-sm hover:shadow-md',
        elevated: 'shadow-md hover:shadow-lg',
        floating: 'shadow-lg hover:shadow-xl hover:-translate-y-1',
      },
      status: {
        completed: 'border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-950/20',
        active: 'border-indigo-200 bg-indigo-50/50 dark:border-indigo-800 dark:bg-indigo-950/20 ring-2 ring-indigo-500/20',
        upcoming: 'border-slate-200 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-950/20',
        blocked: 'border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-950/20',
      },
    },
    defaultVariants: {
      size: 'standard',
      elevation: 'elevated',
      status: 'upcoming',
    },
  }
)

export interface MilestoneAction {
  label: string
  variant?: 'default' | 'outline' | 'ghost'
  onClick: () => void
  icon?: React.ReactNode
}

export interface MilestoneMetric {
  label: string
  value: string | number
  icon?: React.ReactNode
}

export interface DesignerNote {
  author: string
  avatar?: string
  message: string
  timestamp: Date
}

export interface Photo {
  id: string
  url: string
  alt: string
  caption?: string
  timestamp?: Date
}

export interface MilestoneCardProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'>,
    VariantProps<typeof milestoneCardVariants> {
  /** Card title */
  title: string
  /** Card description */
  description?: string
  /** Milestone date */
  date?: Date
  /** Status badge text */
  statusText?: string
  /** Header icon */
  icon?: React.ReactNode
  /** Main content/body */
  children?: React.ReactNode
  /** Progress photos */
  progressPhotos?: Photo[]
  /** Designer note */
  designerNote?: DesignerNote
  /** Metrics to display */
  metrics?: MilestoneMetric[]
  /** Primary action */
  primaryAction?: MilestoneAction
  /** Secondary actions */
  secondaryActions?: MilestoneAction[]
  /** Celebration effect type */
  celebrationType?: 'confetti' | 'sparkle' | 'pulse' | 'none'
  /** Trigger celebration on view */
  celebrateOnView?: boolean
  /** Custom celebration component */
  celebrationComponent?: React.ReactNode
  /** Completion percentage (0-100) */
  completionPercentage?: number
}

const statusIcons = {
  completed: Check,
  active: Clock,
  upcoming: Circle,
  blocked: Circle,
}

const statusColors = {
  completed: 'success',
  active: 'info',
  upcoming: 'neutral',
  blocked: 'error',
} as const

/**
 * MilestoneCard - A rich card component for displaying project milestones
 * with celebration effects and rich media integration.
 *
 * @example
 * ```tsx
 * <MilestoneCard
 *   title="Design Approval"
 *   description="Review and approve the final design concepts"
 *   status="active"
 *   size="hero"
 *   elevation="floating"
 *   date={new Date()}
 *   primaryAction={{
 *     label: "Approve Design",
 *     onClick: handleApprove
 *   }}
 *   celebrationType="confetti"
 * />
 * ```
 */
export const MilestoneCard = React.forwardRef<HTMLDivElement, MilestoneCardProps>(
  (
    {
      className,
      size,
      elevation,
      status,
      title,
      description,
      date,
      statusText,
      icon,
      children,
      progressPhotos,
      designerNote,
      metrics,
      primaryAction,
      secondaryActions,
      celebrationType = 'none',
      celebrateOnView = false,
      celebrationComponent,
      completionPercentage,
      ...props
    },
    ref
  ) => {
    const [showCelebration, setShowCelebration] = React.useState(false)
    const cardRef = React.useRef<HTMLDivElement>(null)

    React.useEffect(() => {
      if (!celebrateOnView || !cardRef.current) return

      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting && status === 'completed') {
              setShowCelebration(true)
            }
          })
        },
        { threshold: 0.5 }
      )

      observer.observe(cardRef.current)

      return () => observer.disconnect()
    }, [celebrateOnView, status])

    const StatusIcon = status ? statusIcons[status] : Circle
    const statusColor = status ? statusColors[status] : 'neutral'

    return (
      <div
        ref={(node) => {
          if (typeof ref === 'function') {
            ref(node)
          } else if (ref) {
            ref.current = node
          }
          if (node) {
            ;(cardRef as React.MutableRefObject<HTMLDivElement>).current = node
          }
        }}
        className={cn(milestoneCardVariants({ size, elevation, status }), className)}
        {...props}
      >
        {/* Celebration overlay */}
        {showCelebration && celebrationComponent}

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 flex-1">
            {icon && (
              <div className="flex-shrink-0 mt-1">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                  {icon}
                </div>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className={cn(
                  'font-semibold leading-tight',
                  size === 'hero' ? 'text-2xl md:text-3xl' : size === 'standard' ? 'text-xl' : 'text-lg'
                )}>
                  {title}
                </h3>
                {status === 'completed' && celebrationType === 'sparkle' && (
                  <Sparkles className="h-5 w-5 text-amber-500 animate-pulse" />
                )}
              </div>
              {date && (
                <p className="text-sm text-muted-foreground">
                  {date.toLocaleDateString('en-US', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </p>
              )}
            </div>
          </div>
          {(statusText || status) && (
            <Badge
              variant="subtle"
              color={statusColor}
              icon={<StatusIcon className="h-3 w-3" />}
              size="sm"
            >
              {statusText || status}
            </Badge>
          )}
        </div>

        {/* Description */}
        {description && (
          <p className={cn(
            'text-muted-foreground',
            size === 'compact' ? 'mt-2 text-sm' : 'mt-3',
            size === 'hero' ? 'text-lg' : 'text-base'
          )}>
            {description}
          </p>
        )}

        {/* Progress bar */}
        {completionPercentage !== undefined && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Progress</span>
              <span className="text-sm text-muted-foreground">{completionPercentage}%</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-indigo-600 transition-all duration-500 ease-out relative overflow-hidden"
                style={{ width: `${completionPercentage}%` }}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
              </div>
            </div>
          </div>
        )}

        {/* Metrics */}
        {metrics && metrics.length > 0 && (
          <div className={cn(
            'grid gap-4',
            metrics.length === 2 ? 'grid-cols-2' : metrics.length === 3 ? 'grid-cols-3' : 'grid-cols-2 md:grid-cols-4',
            size === 'compact' ? 'mt-3' : 'mt-4'
          )}>
            {metrics.map((metric, index) => (
              <div key={index} className="flex flex-col gap-1">
                <div className="flex items-center gap-1 text-muted-foreground">
                  {metric.icon}
                  <span className="text-xs">{metric.label}</span>
                </div>
                <p className="text-lg font-semibold">{metric.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Progress Photos */}
        {progressPhotos && progressPhotos.length > 0 && (
          <div className={cn('grid gap-2', size === 'compact' ? 'mt-3 grid-cols-3' : 'mt-4 grid-cols-4')}>
            {progressPhotos.slice(0, 4).map((photo) => (
              <div
                key={photo.id}
                className="relative aspect-square rounded-md overflow-hidden bg-muted group/photo cursor-pointer"
              >
                <img
                  src={photo.url}
                  alt={photo.alt}
                  className="object-cover w-full h-full transition-transform duration-300 group-hover/photo:scale-110"
                />
              </div>
            ))}
            {progressPhotos.length > 4 && (
              <div className="relative aspect-square rounded-md overflow-hidden bg-muted flex items-center justify-center">
                <span className="text-sm font-medium text-muted-foreground">
                  +{progressPhotos.length - 4}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Children content */}
        {children && <div className={size === 'compact' ? 'mt-3' : 'mt-4'}>{children}</div>}

        {/* Designer Note */}
        {designerNote && (
          <div className={cn(
            'rounded-lg border bg-background/50 p-4',
            size === 'compact' ? 'mt-3' : 'mt-4'
          )}>
            <div className="flex items-start gap-3">
              {designerNote.avatar && (
                <img
                  src={designerNote.avatar}
                  alt={designerNote.author}
                  className="h-8 w-8 rounded-full object-cover"
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-sm font-medium">{designerNote.author}</p>
                  <span className="text-xs text-muted-foreground">
                    {designerNote.timestamp.toLocaleDateString()}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">{designerNote.message}</p>
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        {(primaryAction || (secondaryActions && secondaryActions.length > 0)) && (
          <div className={cn(
            'flex flex-wrap items-center gap-2',
            size === 'compact' ? 'mt-3' : 'mt-6'
          )}>
            {primaryAction && (
              <Button
                onClick={primaryAction.onClick}
                variant={primaryAction.variant || 'default'}
                size={size === 'compact' ? 'sm' : 'default'}
                className="gap-2"
              >
                {primaryAction.icon}
                {primaryAction.label}
              </Button>
            )}
            {secondaryActions?.map((action, index) => (
              <Button
                key={index}
                onClick={action.onClick}
                variant={action.variant || 'outline'}
                size={size === 'compact' ? 'sm' : 'default'}
                className="gap-2"
              >
                {action.icon}
                {action.label}
              </Button>
            ))}
          </div>
        )}

        {/* Pulse animation for active status */}
        {status === 'active' && celebrationType === 'pulse' && (
          <div className="absolute inset-0 rounded-lg pointer-events-none">
            <div className="absolute inset-0 rounded-lg animate-pulse-glow" />
          </div>
        )}
      </div>
    )
  }
)

MilestoneCard.displayName = 'MilestoneCard'
