'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../utils/cn'

const progressCircleVariants = cva(
  'relative flex items-center justify-center',
  {
    variants: {
      size: {
        sm: 'h-[24px] w-[24px]',
        md: 'h-[28px] w-[28px]',
        lg: 'h-[32px] w-[32px]',
      },
    },
    defaultVariants: {
      size: 'md',
    },
  }
)

type MilestoneStatus =
  | 'upcoming'
  | 'in-progress'
  | 'completed'
  | 'approval-needed'
  | 'changes-requested'

export interface ProgressCircleProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof progressCircleVariants> {
  /** Progress value from 0-100 */
  progress: number
  /** Milestone status for color coding */
  status?: MilestoneStatus
  /** Show percentage text in center */
  showPercentage?: boolean
  /** Animate progress on mount */
  animated?: boolean
}

/**
 * Get color based on progress percentage and status
 */
function getProgressColor(progress: number, status?: MilestoneStatus): string {
  if (status === 'completed') return '#10B981' // Success green
  if (status === 'approval-needed') return '#FF6B35' // Safety orange
  if (status === 'changes-requested') return '#EF4444' // Red

  // Color based on progress for in-progress/upcoming
  if (progress < 30) return '#D1C7B7' // Soft gray/beige
  if (progress < 70) return '#3B82F6' // Blue
  return '#F59E0B' // Warm amber
}

/**
 * ProgressCircle - Circular progress indicator with color-coded states
 *
 * @example
 * ```tsx
 * <ProgressCircle
 *   progress={78}
 *   status="in-progress"
 *   size="lg"
 *   showPercentage
 *   animated
 * />
 * ```
 */
export const ProgressCircle = React.forwardRef<HTMLDivElement, ProgressCircleProps>(
  (
    {
      className,
      size,
      progress,
      status,
      showPercentage = true,
      animated = true,
      ...props
    },
    ref
  ) => {
    // Ensure progress is between 0-100
    const clampedProgress = Math.min(100, Math.max(0, progress))

    // Calculate circle dimensions based on size (1/4 original size)
    const dimensions = {
      sm: { radius: 8, strokeWidth: 2, fontSize: '8px' },
      md: { radius: 10, strokeWidth: 2.5, fontSize: '9px' },
      lg: { radius: 12, strokeWidth: 3, fontSize: '10px' },
    }

    const { radius, strokeWidth, fontSize } = dimensions[size || 'md']
    const circumference = 2 * Math.PI * radius
    const strokeDashoffset = circumference - (clampedProgress / 100) * circumference

    const color = getProgressColor(clampedProgress, status)

    return (
      <div
        ref={ref}
        className={cn(progressCircleVariants({ size }), className)}
        role="progressbar"
        aria-valuenow={clampedProgress}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${clampedProgress}% complete`}
        {...props}
      >
        {/* SVG Circle */}
        <svg
          className="transform -rotate-90"
          width="100%"
          height="100%"
          viewBox={`0 0 ${(radius + strokeWidth) * 2} ${(radius + strokeWidth) * 2}`}
        >
          {/* Background circle (track) */}
          <circle
            cx={radius + strokeWidth}
            cy={radius + strokeWidth}
            r={radius}
            fill="none"
            stroke="#EDE9E4"
            strokeWidth={strokeWidth}
          />

          {/* Progress circle (animated with Apple-like spring) */}
          <motion.circle
            cx={radius + strokeWidth}
            cy={radius + strokeWidth}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={animated ? { strokeDashoffset: circumference } : undefined}
            animate={{ strokeDashoffset }}
            transition={{
              type: 'spring',
              stiffness: 100,
              damping: 20,
              mass: 0.8,
              delay: animated ? 0.1 : 0,
            }}
          />
        </svg>

        {/* Percentage text (centered with spring animation) */}
        {showPercentage && (
          <motion.div
            className="absolute inset-0 flex items-center justify-center"
            initial={animated ? { opacity: 0, scale: 0.6 } : undefined}
            animate={{ opacity: 1, scale: 1 }}
            transition={{
              type: 'spring',
              stiffness: 260,
              damping: 20,
              delay: animated ? 0.2 : 0,
            }}
          >
            <span
              className="font-serif font-bold"
              style={{ fontSize, color }}
            >
              {Math.round(clampedProgress)}%
            </span>
          </motion.div>
        )}

        {/* Pulse effect for approval-needed status */}
        {status === 'approval-needed' && (
          <motion.div
            className="absolute inset-0 rounded-full border-2"
            style={{ borderColor: color }}
            initial={{ opacity: 0.6, scale: 1 }}
            animate={{ opacity: 0, scale: 1.2 }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: 'easeOut',
            }}
          />
        )}
      </div>
    )
  }
)

ProgressCircle.displayName = 'ProgressCircle'
