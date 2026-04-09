'use client'

import * as React from 'react'
import * as DialogPrimitives from '@radix-ui/react-dialog'
import { X, Check, MessageSquare, Clock, ChevronLeft, ChevronRight } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '../../utils/cn'
import { Button } from '../Button'

export interface ApprovalItem {
  id: string
  title: string
  description: string
  type: 'design' | 'material' | 'timeline' | 'budget' | 'change-order'
  status: 'pending' | 'approved' | 'rejected' | 'discussion'

  // Visual content
  beforeImage?: string
  afterImage?: string
  images?: string[]

  // Decision details
  costImpact?: {
    amount: number
    currency: string
    breakdown?: Array<{ label: string; amount: number }>
  }
  timelineImpact?: {
    days: number
    newDeadline?: Date
    affectedMilestones?: string[]
  }
  alternatives?: Array<{
    id: string
    title: string
    description: string
    costDifference: number
    timelineDifference: number
  }>
  designerNote?: string
  recommendedAction?: 'approve' | 'discuss' | 'consider-alternative'
}

export interface ApprovalTheaterProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  approval: ApprovalItem
  mode?: 'fullscreen' | 'modal'
  backdrop?: 'blur' | 'dim' | 'none'
  onApprove?: (approvalId: string, signature?: string) => void
  onRequestChanges?: (approvalId: string, changes: any) => void
  onStartDiscussion?: (approvalId: string) => void
  onSaveForLater?: (approvalId: string) => void
  className?: string
}

/**
 * ApprovalTheater - Full-screen approval experience for client decisions
 *
 * Creates an immersive, focused environment for making important project decisions
 * with clear information presentation and smooth animations.
 *
 * @example
 * ```tsx
 * <ApprovalTheater
 *   open={isOpen}
 *   onOpenChange={setIsOpen}
 *   approval={approvalItem}
 *   mode="fullscreen"
 *   backdrop="blur"
 *   onApprove={handleApprove}
 *   onRequestChanges={handleRequestChanges}
 * />
 * ```
 */
export const ApprovalTheater = React.forwardRef<
  React.ElementRef<typeof DialogPrimitives.Content>,
  ApprovalTheaterProps
>(({
  open,
  onOpenChange,
  approval,
  mode = 'fullscreen',
  backdrop = 'blur',
  onApprove,
  onRequestChanges,
  onStartDiscussion,
  onSaveForLater,
  className,
  ...props
}, ref) => {
  const [currentView, setCurrentView] = React.useState<'overview' | 'compare' | 'cost' | 'timeline'>('overview')
  const [showSignature, setShowSignature] = React.useState(false)
  const [compareSlider, setCompareSlider] = React.useState(50)

  // Handle escape key
  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        onOpenChange(false)
      }
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [open, onOpenChange])

  // Prevent background scroll when the theater is open
  React.useEffect(() => {
    if (!open || typeof document === 'undefined') {
      return undefined
    }

    const { style } = document.body
    const initialOverflow = style.overflow
    const initialPaddingRight = style.paddingRight
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth

    style.overflow = 'hidden'
    if (scrollbarWidth > 0) {
      style.paddingRight = `${scrollbarWidth}px`
    }

    return () => {
      style.overflow = initialOverflow
      style.paddingRight = initialPaddingRight
    }
  }, [open])

  const backdropClass = {
    blur: 'bg-[#0b0805]/80 backdrop-blur-xl saturate-150',
    dim: 'bg-black/85',
    none: 'bg-transparent',
  }[backdrop]

  const basePositionClass = mode === 'fullscreen'
    ? 'fixed inset-0 z-50'
    : 'fixed left-1/2 top-1/2 z-50 translate-x-[-50%] translate-y-[-50%]'

  const sizeClass = mode === 'fullscreen'
    ? 'h-screen w-screen max-w-none rounded-none'
    : 'w-full max-w-6xl max-h-[90vh] rounded-[32px]'

  const surfaceClass = cn(
    'overflow-hidden focus:outline-none',
    'bg-[hsl(var(--card))]/95 dark:bg-[hsl(var(--background))]/98',
    'backdrop-blur-xl border border-white/20 dark:border-white/10',
    'shadow-[0_35px_90px_rgba(8,6,4,0.55)] dark:shadow-[0_35px_90px_rgba(0,0,0,0.65)]'
  )

  const getStatusColor = () => {
    switch (approval.recommendedAction) {
      case 'approve':
        return 'text-emerald-500'
      case 'discuss':
        return 'text-violet-500'
      case 'consider-alternative':
        return 'text-amber-500'
      default:
        return 'text-gray-500'
    }
  }

  const handleApprove = () => {
    if (showSignature) {
      // In real implementation, capture signature
      onApprove?.(approval.id)
      onOpenChange(false)
    } else {
      setShowSignature(true)
    }
  }

  return (
    <DialogPrimitives.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitives.Portal>
        <DialogPrimitives.Overlay forceMount asChild>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className={cn(
              'fixed inset-0 z-40 pointer-events-auto',
              'before:absolute before:inset-0 before:content-[\'\'] before:bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.08),_transparent_60%)]',
              backdropClass
            )}
          />
        </DialogPrimitives.Overlay>

        <DialogPrimitives.Content
          ref={ref}
          className={cn(
            basePositionClass,
            sizeClass,
            surfaceClass,
            className
          )}
          {...props}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            className="h-full flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b bg-gradient-to-r from-indigo-50 to-violet-50 dark:from-indigo-950 dark:to-violet-950">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <DialogPrimitives.Title className="text-2xl font-bold tracking-tight">{approval.title}</DialogPrimitives.Title>
                  {approval.recommendedAction && (
                    <span className={cn('text-sm font-medium', getStatusColor())}>
                      {approval.recommendedAction === 'approve' && '✓ Recommended'}
                      {approval.recommendedAction === 'discuss' && '💬 Discussion Suggested'}
                      {approval.recommendedAction === 'consider-alternative' && '⚡ Alternative Available'}
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{approval.description}</p>
              </div>

              <DialogPrimitives.Close asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-full"
                  aria-label="Close approval theater"
                >
                  <X className="h-4 w-4" />
                </Button>
              </DialogPrimitives.Close>
            </div>

            {/* Navigation Tabs */}
            <div className="flex gap-1 px-6 py-3 border-b bg-muted/30">
              {[
                { id: 'overview', label: 'Overview' },
                { id: 'compare', label: 'Before/After' },
                { id: 'cost', label: 'Cost Impact' },
                { id: 'timeline', label: 'Timeline' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setCurrentView(tab.id as any)}
                  className={cn(
                    'px-4 py-2 rounded-md text-sm font-medium transition-colors',
                    currentView === tab.id
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-auto p-6">
              <AnimatePresence mode="wait">
                {currentView === 'overview' && (
                  <motion.div
                    key="overview"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="space-y-6"
                  >
                    {approval.designerNote && (
                      <div className="p-4 bg-indigo-50 dark:bg-indigo-950 rounded-lg border border-indigo-200 dark:border-indigo-800">
                        <h3 className="font-semibold mb-2 text-indigo-900 dark:text-indigo-100">Designer's Note</h3>
                        <p className="text-sm text-indigo-700 dark:text-indigo-300">{approval.designerNote}</p>
                      </div>
                    )}

                    {approval.images && approval.images.length > 0 && (
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {approval.images.map((img, idx) => (
                          <motion.div
                            key={idx}
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: idx * 0.1 }}
                            className="aspect-square rounded-lg overflow-hidden shadow-md hover:shadow-xl transition-shadow"
                          >
                            <img src={img} alt={`Preview ${idx + 1}`} className="w-full h-full object-cover" />
                          </motion.div>
                        ))}
                      </div>
                    )}

                    <div className="grid md:grid-cols-2 gap-6">
                      {approval.costImpact && (
                        <div className="p-4 rounded-lg border">
                          <h3 className="font-semibold mb-3">Cost Impact</h3>
                          <p className="text-3xl font-bold">
                            {approval.costImpact.currency}{approval.costImpact.amount.toLocaleString()}
                          </p>
                        </div>
                      )}

                      {approval.timelineImpact && (
                        <div className="p-4 rounded-lg border">
                          <h3 className="font-semibold mb-3">Timeline Impact</h3>
                          <p className="text-3xl font-bold">
                            {approval.timelineImpact.days > 0 ? '+' : ''}{approval.timelineImpact.days} days
                          </p>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}

                {currentView === 'compare' && approval.beforeImage && approval.afterImage && (
                  <motion.div
                    key="compare"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="h-full"
                  >
                    <div className="relative h-[500px] rounded-lg overflow-hidden">
                      <div className="absolute inset-0 grid grid-cols-2">
                        <div className="relative">
                          <img src={approval.beforeImage} alt="Before" className="w-full h-full object-cover" />
                          <div className="absolute top-4 left-4 px-3 py-1 bg-black/70 text-white text-sm rounded-full">
                            Before
                          </div>
                        </div>
                        <div className="relative">
                          <img src={approval.afterImage} alt="After" className="w-full h-full object-cover" />
                          <div className="absolute top-4 right-4 px-3 py-1 bg-black/70 text-white text-sm rounded-full">
                            After
                          </div>
                        </div>
                      </div>
                      <div className="absolute inset-y-0 left-1/2 w-1 bg-white shadow-lg -translate-x-1/2" />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Footer Actions */}
            <div className="border-t bg-muted/30 p-6">
              <div className="flex flex-wrap gap-3 justify-between items-center">
                <Button
                  variant="ghost"
                  onClick={() => onSaveForLater?.(approval.id)}
                >
                  <Clock className="h-4 w-4 mr-2" />
                  Save for Later
                </Button>

                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={() => onStartDiscussion?.(approval.id)}
                  >
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Start Discussion
                  </Button>

                  <Button
                    variant="outline"
                    onClick={() => {
                      // Open change request form
                      onRequestChanges?.(approval.id, {})
                    }}
                  >
                    Request Changes
                  </Button>

                  <Button
                    variant="default"
                    size="lg"
                    onClick={handleApprove}
                    className="bg-emerald-600 hover:bg-emerald-700 px-8"
                  >
                    <Check className="h-5 w-5 mr-2" />
                    {showSignature ? 'Confirm & Sign' : 'Approve'}
                  </Button>
                </div>
              </div>

              {showSignature && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="mt-4 p-4 border rounded-lg bg-background"
                >
                  <p className="text-sm text-muted-foreground mb-2">
                    Digital signature required for approval
                  </p>
                  <div className="h-32 border-2 border-dashed rounded-md bg-muted/50 flex items-center justify-center">
                    <p className="text-sm text-muted-foreground">Signature pad (placeholder)</p>
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>
        </DialogPrimitives.Content>
      </DialogPrimitives.Portal>
    </DialogPrimitives.Root>
  )
})

ApprovalTheater.displayName = 'ApprovalTheater'
