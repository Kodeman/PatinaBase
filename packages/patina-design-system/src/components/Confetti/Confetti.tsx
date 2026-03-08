'use client'

import * as React from 'react'
import { cn } from '../../utils/cn'

export interface ConfettiProps {
  /** Number of confetti pieces */
  count?: number
  /** Duration of the animation in ms */
  duration?: number
  /** Colors for the confetti */
  colors?: string[]
  /** Callback when animation completes */
  onComplete?: () => void
  /** Animation intensity */
  intensity?: 'low' | 'medium' | 'high'
}

interface ConfettiPiece {
  id: number
  x: number
  y: number
  rotation: number
  scale: number
  color: string
  duration: number
  delay: number
  shape: 'square' | 'circle' | 'triangle'
}

/**
 * Confetti - Celebratory confetti burst animation
 *
 * @example
 * ```tsx
 * <Confetti
 *   count={50}
 *   duration={3000}
 *   intensity="high"
 *   onComplete={() => console.log('Celebration complete!')}
 * />
 * ```
 */
export const Confetti: React.FC<ConfettiProps> = ({
  count = 50,
  duration = 3000,
  colors = ['#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#3b82f6', '#ec4899'],
  onComplete,
  intensity = 'medium',
}) => {
  const [pieces, setPieces] = React.useState<ConfettiPiece[]>([])
  const [isActive, setIsActive] = React.useState(true)

  const intensityMultiplier = {
    low: 0.5,
    medium: 1,
    high: 1.5,
  }

  React.useEffect(() => {
    const confettiPieces: ConfettiPiece[] = Array.from({ length: count }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: -10 - Math.random() * 20,
      rotation: Math.random() * 360,
      scale: 0.5 + Math.random() * 0.5,
      color: colors[Math.floor(Math.random() * colors.length)],
      duration: duration + (Math.random() - 0.5) * 1000,
      delay: Math.random() * 500,
      shape: ['square', 'circle', 'triangle'][Math.floor(Math.random() * 3)] as ConfettiPiece['shape'],
    }))

    setPieces(confettiPieces)

    const timer = setTimeout(() => {
      setIsActive(false)
      onComplete?.()
    }, duration + 500)

    return () => clearTimeout(timer)
  }, [count, duration, colors, onComplete])

  if (!isActive) return null

  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      {pieces.map((piece) => (
        <div
          key={piece.id}
          className="absolute"
          style={{
            left: `${piece.x}%`,
            top: `${piece.y}%`,
            animation: `confettiFall ${piece.duration}ms ease-in ${piece.delay}ms forwards`,
            transform: `rotate(${piece.rotation}deg) scale(${piece.scale})`,
          }}
        >
          {piece.shape === 'square' && (
            <div
              className="w-3 h-3"
              style={{
                backgroundColor: piece.color,
                animation: `confettiSpin ${1000 + Math.random() * 1000}ms linear infinite`,
              }}
            />
          )}
          {piece.shape === 'circle' && (
            <div
              className="w-3 h-3 rounded-full"
              style={{
                backgroundColor: piece.color,
                animation: `confettiSpin ${1000 + Math.random() * 1000}ms linear infinite`,
              }}
            />
          )}
          {piece.shape === 'triangle' && (
            <div
              className="w-0 h-0 border-l-[6px] border-r-[6px] border-b-[10px] border-l-transparent border-r-transparent"
              style={{
                borderBottomColor: piece.color,
                animation: `confettiSpin ${1000 + Math.random() * 1000}ms linear infinite`,
              }}
            />
          )}
        </div>
      ))}
      <style>{`
        @keyframes confettiFall {
          to {
            transform: translateY(${100 + Math.random() * 20}vh) translateX(${(Math.random() - 0.5) * 100 * intensityMultiplier[intensity]}px) rotate(${360 + Math.random() * 360}deg);
            opacity: 0;
          }
        }
        @keyframes confettiSpin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  )
}
