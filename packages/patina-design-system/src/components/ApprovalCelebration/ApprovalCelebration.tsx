'use client'

import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CheckCircle,
  Sparkles,
  ArrowRight,
  Calendar,
  Download,
  Share2,
  PartyPopper
} from 'lucide-react'
import { cn } from '../../utils/cn'
import { Button } from '../Button'

export interface CelebrationType {
  type: 'confetti' | 'sparkle' | 'pulse' | 'minimal'
  duration?: number // in ms
  intensity?: 'low' | 'medium' | 'high'
}

export interface NextStep {
  id: string
  title: string
  description: string
  icon?: React.ReactNode
  action?: () => void
  estimatedTime?: string
}

export interface ApprovalCelebrationProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  approvalTitle: string
  approvalType?: string
  celebration?: CelebrationType
  nextSteps?: NextStep[]
  timelineUpdate?: {
    previousDate?: Date
    newDate?: Date
    daysAhead?: number
  }
  confirmationReceipt?: {
    receiptNumber: string
    timestamp: Date
    downloadUrl?: string
  }
  onContinue?: () => void
  onShareSuccess?: () => void
  className?: string
}

/**
 * ApprovalCelebration - Post-approval celebration and next steps
 *
 * Shows success animations, timeline updates, confirmation receipts,
 * and guides clients to next steps with celebration effects.
 *
 * @example
 * ```tsx
 * <ApprovalCelebration
 *   open={showCelebration}
 *   onOpenChange={setShowCelebration}
 *   approvalTitle="Living Room Design"
 *   celebration={{ type: 'confetti', intensity: 'high' }}
 *   nextSteps={nextSteps}
 *   timelineUpdate={{ daysAhead: 2 }}
 * />
 * ```
 */
export const ApprovalCelebration = React.forwardRef<HTMLDivElement, ApprovalCelebrationProps>(
  ({
    open,
    onOpenChange,
    approvalTitle,
    approvalType = 'design',
    celebration = { type: 'confetti', intensity: 'medium', duration: 3000 },
    nextSteps = [],
    timelineUpdate,
    confirmationReceipt,
    onContinue,
    onShareSuccess,
    className,
    ...props
  }, ref) => {
    const [showConfetti, setShowConfetti] = React.useState(false)
    const [currentStep, setCurrentStep] = React.useState(0)

    React.useEffect(() => {
      if (open && celebration.type !== 'minimal') {
        setShowConfetti(true)
        const timer = setTimeout(() => {
          setShowConfetti(false)
        }, celebration.duration || 3000)
        return () => clearTimeout(timer)
      }
      return undefined
    }, [open, celebration])

    const handleContinue = () => {
      onContinue?.()
      onOpenChange(false)
    }

    const handleShare = async () => {
      if (navigator.share) {
        try {
          await navigator.share({
            title: `${approvalTitle} - Approved!`,
            text: `I just approved ${approvalTitle} for my project!`,
          })
          onShareSuccess?.()
        } catch (error) {
          console.error('Error sharing:', error)
        }
      }
    }

    if (!open) return null

    return (
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => onOpenChange(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />

            {/* Confetti Effect */}
            {showConfetti && celebration.type === 'confetti' && (
              <div className="absolute inset-0 pointer-events-none overflow-hidden">
                {Array.from({ length: celebration.intensity === 'high' ? 50 : celebration.intensity === 'medium' ? 30 : 15 }).map((_, i) => (
                  <motion.div
                    key={i}
                    initial={{
                      x: Math.random() * window.innerWidth,
                      y: -20,
                      rotate: 0,
                      opacity: 1,
                    }}
                    animate={{
                      y: window.innerHeight + 20,
                      rotate: 360 * (Math.random() > 0.5 ? 1 : -1),
                      opacity: 0,
                    }}
                    transition={{
                      duration: 2 + Math.random() * 2,
                      ease: 'linear',
                    }}
                    className={cn(
                      'absolute w-3 h-3 rounded-sm',
                      [
                        'bg-red-500',
                        'bg-blue-500',
                        'bg-green-500',
                        'bg-yellow-500',
                        'bg-purple-500',
                        'bg-pink-500',
                      ][i % 6]
                    )}
                  />
                ))}
              </div>
            )}

            {/* Content */}
            <motion.div
              ref={ref}
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: 'spring', duration: 0.5 }}
              className={cn(
                'relative bg-background rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden',
                className
              )}
              {...props}
            >
              {/* Success Header */}
              <div className="p-8 text-center bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950 dark:to-teal-950">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', delay: 0.2, duration: 0.6 }}
                  className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-emerald-100 dark:bg-emerald-900 mb-4"
                >
                  <CheckCircle className="h-10 w-10 text-emerald-600 dark:text-emerald-400" />
                </motion.div>

                <motion.h2
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="text-3xl font-bold text-emerald-900 dark:text-emerald-100 mb-2"
                >
                  Approval Confirmed!
                </motion.h2>

                <motion.p
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  className="text-emerald-700 dark:text-emerald-300"
                >
                  {approvalTitle} has been approved and your project is moving forward
                </motion.p>
              </div>

              {/* Content Area */}
              <div className="p-6 space-y-6">
                {/* Timeline Update */}
                {timelineUpdate && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                    className="p-4 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800"
                  >
                    <div className="flex items-center gap-3">
                      <Calendar className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                      <div className="flex-1">
                        <h3 className="font-semibold text-blue-900 dark:text-blue-100">
                          Timeline Updated
                        </h3>
                        <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                          {timelineUpdate.daysAhead && timelineUpdate.daysAhead > 0 ? (
                            <>Your project is now <span className="font-semibold">{timelineUpdate.daysAhead} days ahead of schedule!</span></>
                          ) : timelineUpdate.newDate ? (
                            <>New completion date: <span className="font-semibold">{timelineUpdate.newDate.toLocaleDateString()}</span></>
                          ) : (
                            'Your project timeline has been updated'
                          )}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Confirmation Receipt */}
                {confirmationReceipt && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.6 }}
                    className="p-4 rounded-lg border bg-muted/50"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Confirmation Receipt</p>
                        <p className="font-mono font-semibold">#{confirmationReceipt.receiptNumber}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {confirmationReceipt.timestamp.toLocaleString()}
                        </p>
                      </div>
                      {confirmationReceipt.downloadUrl && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(confirmationReceipt.downloadUrl, '_blank')}
                        >
                          <Download className="h-4 w-4 mr-2" />
                          Download
                        </Button>
                      )}
                    </div>
                  </motion.div>
                )}

                {/* Next Steps */}
                {nextSteps.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.7 }}
                  >
                    <h3 className="font-semibold mb-3 flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-amber-500" />
                      What's Next
                    </h3>
                    <div className="space-y-3">
                      {nextSteps.map((step, index) => (
                        <motion.div
                          key={step.id}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.8 + index * 0.1 }}
                          className={cn(
                            'p-4 rounded-lg border transition-all cursor-pointer',
                            currentStep === index
                              ? 'border-primary bg-primary/5'
                              : 'hover:border-primary/50'
                          )}
                          onClick={() => {
                            setCurrentStep(index)
                            step.action?.()
                          }}
                        >
                          <div className="flex items-start gap-3">
                            <div className="p-2 rounded-lg bg-primary/10">
                              {step.icon || <ArrowRight className="h-4 w-4 text-primary" />}
                            </div>
                            <div className="flex-1">
                              <h4 className="font-medium">{step.title}</h4>
                              <p className="text-sm text-muted-foreground mt-1">
                                {step.description}
                              </p>
                              {step.estimatedTime && (
                                <p className="text-xs text-muted-foreground mt-2">
                                  Est. {step.estimatedTime}
                                </p>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </div>

              {/* Footer Actions */}
              <div className="p-6 border-t bg-muted/30">
                <div className="flex gap-3 justify-between">
                  <Button
                    variant="outline"
                    onClick={handleShare}
                    className="gap-2"
                  >
                    <Share2 className="h-4 w-4" />
                    Share Success
                  </Button>

                  <Button
                    onClick={handleContinue}
                    className="gap-2 bg-emerald-600 hover:bg-emerald-700"
                  >
                    Continue to Project
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    )
  }
)

ApprovalCelebration.displayName = 'ApprovalCelebration'
