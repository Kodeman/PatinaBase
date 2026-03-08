'use client'

import * as React from 'react'
import { cn } from '../../utils/cn'

export interface SparklesProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Number of sparkle particles */
  count?: number
  /** Size of sparkles */
  size?: 'sm' | 'md' | 'lg'
  /** Sparkle colors */
  colors?: string[]
  /** Animation speed */
  speed?: 'slow' | 'normal' | 'fast'
  /** Continuous animation */
  continuous?: boolean
  /** Duration of one cycle in ms */
  duration?: number
}

interface Sparkle {
  id: number
  x: number
  y: number
  size: number
  delay: number
  duration: number
  color: string
}

/**
 * Sparkles - Magical sparkle effect for achievement moments
 *
 * @example
 * ```tsx
 * <Sparkles count={20} size="lg" continuous>
 *   <div>Sparkly content</div>
 * </Sparkles>
 * ```
 */
export const Sparkles: React.FC<SparklesProps> = ({
  className,
  children,
  count = 12,
  size = 'md',
  colors = ['#fbbf24', '#f59e0b', '#fef3c7', '#ffffff'],
  speed = 'normal',
  continuous = true,
  duration = 2000,
  ...props
}) => {
  const [sparkles, setSparkles] = React.useState<Sparkle[]>([])

  const sizeMap = {
    sm: 4,
    md: 6,
    lg: 8,
  }

  const speedMap = {
    slow: 1.5,
    normal: 1,
    fast: 0.6,
  }

  React.useEffect(() => {
    const generateSparkles = () => {
      return Array.from({ length: count }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: sizeMap[size] * (0.5 + Math.random() * 0.5),
        delay: Math.random() * duration,
        duration: duration * speedMap[speed],
        color: colors[Math.floor(Math.random() * colors.length)],
      }))
    }

    setSparkles(generateSparkles())

    if (continuous) {
      const interval = setInterval(() => {
        setSparkles(generateSparkles())
      }, duration)

      return () => clearInterval(interval)
    }
    return undefined
  }, [count, size, colors, speed, continuous, duration])

  return (
    <div className={cn('relative', className)} {...props}>
      {children}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {sparkles.map((sparkle) => (
          <div
            key={sparkle.id}
            className="absolute"
            style={{
              left: `${sparkle.x}%`,
              top: `${sparkle.y}%`,
              width: `${sparkle.size}px`,
              height: `${sparkle.size}px`,
              animation: `sparkle ${sparkle.duration}ms ease-in-out ${sparkle.delay}ms infinite`,
            }}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              style={{ width: '100%', height: '100%' }}
            >
              <path
                d="M12 0L14.59 8.41L23 11L14.59 13.59L12 22L9.41 13.59L1 11L9.41 8.41L12 0Z"
                fill={sparkle.color}
              />
            </svg>
          </div>
        ))}
      </div>
      <style>{`
        @keyframes sparkle {
          0%, 100% {
            opacity: 0;
            transform: scale(0) rotate(0deg);
          }
          50% {
            opacity: 1;
            transform: scale(1) rotate(180deg);
          }
        }
      `}</style>
    </div>
  )
}
