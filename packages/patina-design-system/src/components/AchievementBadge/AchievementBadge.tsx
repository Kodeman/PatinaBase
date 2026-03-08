import * as React from 'react'
import { cn } from '../../utils/cn'
import { Trophy, Star, Award, Target, Zap, Heart } from 'lucide-react'
import { Sparkles } from '../Sparkles/Sparkles'

export interface AchievementBadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Achievement title */
  title: string
  /** Achievement description */
  description?: string
  /** Achievement type */
  type: 'milestone' | 'approval' | 'completion' | 'excellence' | 'speed' | 'collaboration'
  /** Badge size */
  size?: 'sm' | 'md' | 'lg'
  /** Achievement level/tier */
  tier?: 'bronze' | 'silver' | 'gold' | 'platinum'
  /** Date earned */
  earnedDate?: Date
  /** Show sparkle effect */
  showSparkles?: boolean
  /** Progress percentage (for in-progress achievements) */
  progress?: number
  /** Is unlocked */
  unlocked?: boolean
}

const achievementIcons = {
  milestone: Target,
  approval: Trophy,
  completion: Award,
  excellence: Star,
  speed: Zap,
  collaboration: Heart,
}

const tierColors = {
  bronze: 'from-amber-700 to-amber-900',
  silver: 'from-slate-400 to-slate-600',
  gold: 'from-yellow-400 to-yellow-600',
  platinum: 'from-purple-400 to-purple-600',
}

const tierGlow = {
  bronze: 'shadow-amber-500/50',
  silver: 'shadow-slate-500/50',
  gold: 'shadow-yellow-500/50',
  platinum: 'shadow-purple-500/50',
}

/**
 * AchievementBadge - Display achievement badges and progress
 *
 * @example
 * ```tsx
 * <AchievementBadge
 *   title="First Approval"
 *   description="Approved your first design"
 *   type="approval"
 *   tier="gold"
 *   unlocked
 *   showSparkles
 * />
 * ```
 */
export const AchievementBadge: React.FC<AchievementBadgeProps> = ({
  className,
  title,
  description,
  type,
  size = 'md',
  tier = 'gold',
  earnedDate,
  showSparkles = false,
  progress,
  unlocked = true,
  ...props
}) => {
  const Icon = achievementIcons[type]

  const sizeClasses = {
    sm: {
      container: 'p-3',
      icon: 'h-8 w-8',
      badge: 'h-12 w-12',
      title: 'text-sm',
      description: 'text-xs',
    },
    md: {
      container: 'p-4',
      icon: 'h-10 w-10',
      badge: 'h-16 w-16',
      title: 'text-base',
      description: 'text-sm',
    },
    lg: {
      container: 'p-6',
      icon: 'h-12 w-12',
      badge: 'h-20 w-20',
      title: 'text-lg',
      description: 'text-base',
    },
  }

  const content = (
    <div
      className={cn(
        'relative rounded-lg border bg-card transition-all duration-300',
        unlocked
          ? 'border-border hover:shadow-lg hover:-translate-y-1'
          : 'border-muted bg-muted/50 opacity-60',
        sizeClasses[size].container,
        className
      )}
      {...props}
    >
      <div className="flex items-start gap-4">
        {/* Badge icon */}
        <div className="flex-shrink-0">
          <div
            className={cn(
              'rounded-full flex items-center justify-center text-white transition-all',
              sizeClasses[size].badge,
              unlocked
                ? `bg-gradient-to-br ${tierColors[tier]} shadow-lg ${tierGlow[tier]}`
                : 'bg-muted-foreground/20'
            )}
          >
            <Icon className={sizeClasses[size].icon} />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h4 className={cn('font-semibold', sizeClasses[size].title)}>
            {title}
          </h4>
          {description && (
            <p className={cn('text-muted-foreground mt-1', sizeClasses[size].description)}>
              {description}
            </p>
          )}
          {earnedDate && unlocked && (
            <p className="text-xs text-muted-foreground mt-2">
              Earned {earnedDate.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </p>
          )}
          {progress !== undefined && !unlocked && (
            <div className="mt-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">Progress</span>
                <span className="text-xs font-medium">{progress}%</span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 to-indigo-600 transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Locked overlay */}
      {!unlocked && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/5 backdrop-blur-[1px] rounded-lg">
          <div className="text-4xl">🔒</div>
        </div>
      )}
    </div>
  )

  if (showSparkles && unlocked) {
    return (
      <Sparkles count={8} size="sm" continuous>
        {content}
      </Sparkles>
    )
  }

  return content
}
