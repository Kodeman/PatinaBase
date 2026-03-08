'use client'

import * as React from 'react'
import { cn } from '../../utils/cn'
import { Confetti } from '../Confetti/Confetti'
import { Sparkles } from '../Sparkles/Sparkles'

export interface CelebrationSequenceProps {
  /** Type of celebration */
  type: 'approval' | 'completion' | 'achievement' | 'custom'
  /** Show the celebration */
  isActive: boolean
  /** Callback when sequence completes */
  onComplete?: () => void
  /** Message to display */
  message?: string
  /** Subtitle or additional context */
  subtitle?: string
  /** Custom content to render */
  children?: React.ReactNode
  /** Duration of the sequence in ms */
  duration?: number
  /** Enable confetti effect */
  showConfetti?: boolean
  /** Enable sparkles effect */
  showSparkles?: boolean
  /** Show backdrop */
  showBackdrop?: boolean
}

/**
 * CelebrationSequence - Orchestrates celebration moments with animations and messages
 *
 * @example
 * ```tsx
 * <CelebrationSequence
 *   type="approval"
 *   isActive={showCelebration}
 *   message="Design Approved!"
 *   subtitle="Great choice! Moving to the next phase."
 *   onComplete={() => setShowCelebration(false)}
 * />
 * ```
 */
export const CelebrationSequence: React.FC<CelebrationSequenceProps> = ({
  type,
  isActive,
  onComplete,
  message,
  subtitle,
  children,
  duration = 4000,
  showConfetti = true,
  showSparkles = true,
  showBackdrop = true,
}) => {
  const [stage, setStage] = React.useState<'enter' | 'active' | 'exit'>('enter')

  React.useEffect(() => {
    if (!isActive) return

    setStage('enter')

    const activeTimer = setTimeout(() => {
      setStage('active')
    }, 300)

    const exitTimer = setTimeout(() => {
      setStage('exit')
    }, duration - 500)

    const completeTimer = setTimeout(() => {
      onComplete?.()
    }, duration)

    return () => {
      clearTimeout(activeTimer)
      clearTimeout(exitTimer)
      clearTimeout(completeTimer)
    }
  }, [isActive, duration, onComplete])

  if (!isActive && stage === 'exit') return null

  const celebrationConfig = {
    approval: {
      color: 'from-violet-500 to-purple-500',
      icon: '✓',
      confettiColors: ['#8b5cf6', '#a78bfa', '#c4b5fd', '#ddd6fe'],
    },
    completion: {
      color: 'from-amber-500 to-orange-500',
      icon: '🎉',
      confettiColors: ['#f59e0b', '#fbbf24', '#fcd34d', '#fde68a'],
    },
    achievement: {
      color: 'from-emerald-500 to-green-500',
      icon: '⭐',
      confettiColors: ['#10b981', '#34d399', '#6ee7b7', '#a7f3d0'],
    },
    custom: {
      color: 'from-indigo-500 to-blue-500',
      icon: '✨',
      confettiColors: ['#6366f1', '#818cf8', '#a5b4fc', '#c7d2fe'],
    },
  }

  const config = celebrationConfig[type]

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex items-center justify-center transition-all duration-500',
        stage === 'enter' && 'opacity-0 scale-95',
        stage === 'active' && 'opacity-100 scale-100',
        stage === 'exit' && 'opacity-0 scale-105'
      )}
    >
      {/* Backdrop */}
      {showBackdrop && (
        <div
          className={cn(
            'absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300',
            stage === 'enter' && 'opacity-0',
            stage === 'active' && 'opacity-100',
            stage === 'exit' && 'opacity-0'
          )}
        />
      )}

      {/* Confetti */}
      {showConfetti && isActive && (
        <Confetti
          count={60}
          duration={duration - 500}
          colors={config.confettiColors}
          intensity="high"
        />
      )}

      {/* Main content */}
      <div className="relative z-10 text-center px-6">
        {showSparkles ? (
          <Sparkles count={15} size="lg" colors={config.confettiColors}>
            <div
              className={cn(
                'inline-flex flex-col items-center gap-4 p-8 rounded-2xl bg-white dark:bg-slate-900 shadow-2xl transition-all duration-500',
                stage === 'enter' && 'translate-y-8',
                stage === 'active' && 'translate-y-0',
                stage === 'exit' && '-translate-y-8'
              )}
            >
              {/* Icon */}
              <div className={cn(
                'flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br text-white text-4xl shadow-lg',
                config.color
              )}>
                {config.icon}
              </div>

              {/* Message */}
              {message && (
                <h2 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                  {message}
                </h2>
              )}

              {subtitle && (
                <p className="text-lg text-muted-foreground max-w-md">
                  {subtitle}
                </p>
              )}

              {children}
            </div>
          </Sparkles>
        ) : (
          <div
            className={cn(
              'inline-flex flex-col items-center gap-4 p-8 rounded-2xl bg-white dark:bg-slate-900 shadow-2xl transition-all duration-500',
              stage === 'enter' && 'translate-y-8',
              stage === 'active' && 'translate-y-0',
              stage === 'exit' && '-translate-y-8'
            )}
          >
            <div className={cn(
              'flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br text-white text-4xl shadow-lg',
              config.color
            )}>
              {config.icon}
            </div>

            {message && (
              <h2 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                {message}
              </h2>
            )}

            {subtitle && (
              <p className="text-lg text-muted-foreground max-w-md">
                {subtitle}
              </p>
            )}

            {children}
          </div>
        )}
      </div>
    </div>
  )
}
