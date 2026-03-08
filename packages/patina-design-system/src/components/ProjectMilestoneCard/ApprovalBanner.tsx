'use client'

import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertCircle, Check, MessageSquare, X } from 'lucide-react'
import { cn } from '../../utils/cn'
import { Button } from '../Button/Button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../Dialog/Dialog'
import type { ApprovalRequest } from './types'

export interface ApprovalBannerProps {
  approval: ApprovalRequest
  onApprove: (comment?: string) => Promise<void>
  onRequestChanges: (reason: string) => Promise<void>
  isSubmitting?: boolean
  className?: string
}

/**
 * ApprovalBanner - Prominent approval workflow UI
 *
 * Displays approval request with Approve/Request Changes actions.
 * Shows confirmation modals and handles submission states.
 *
 * @example
 * ```tsx
 * <ApprovalBanner
 *   approval={approvalData}
 *   onApprove={handleApprove}
 *   onRequestChanges={handleRequestChanges}
 * />
 * ```
 */
export const ApprovalBanner = React.forwardRef<HTMLDivElement, ApprovalBannerProps>(
  ({ approval, onApprove, onRequestChanges, isSubmitting = false, className }, ref) => {
    const [showApproveModal, setShowApproveModal] = React.useState(false)
    const [showChangesModal, setShowChangesModal] = React.useState(false)
    const [approvalComment, setApprovalComment] = React.useState('')
    const [changesReason, setChangesReason] = React.useState('')
    const [hasReviewed, setHasReviewed] = React.useState(false)

    const handleApproveClick = () => {
      setShowApproveModal(true)
    }

    const handleConfirmApprove = async () => {
      try {
        await onApprove(approvalComment || undefined)
        setShowApproveModal(false)
        setApprovalComment('')
        setHasReviewed(false)
      } catch (error) {
        console.error('Approval failed:', error)
      }
    }

    const handleRequestChangesClick = () => {
      setShowChangesModal(true)
    }

    const handleSubmitChanges = async () => {
      if (changesReason.trim().length < 20) {
        return // Validation handled by UI
      }

      try {
        await onRequestChanges(changesReason.trim())
        setShowChangesModal(false)
        setChangesReason('')
      } catch (error) {
        console.error('Request changes failed:', error)
      }
    }

    // Determine banner style based on status
    const isApproved = approval.status === 'approved'
    const isRejected = approval.status === 'changes-requested'
    const isPending = approval.status === 'pending'

    if (isApproved) {
      return (
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            'rounded-lg border-2 border-green-500 bg-gradient-to-br from-green-50 to-green-100 p-5',
            className
          )}
        >
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-500">
              <Check className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1">
              <h4 className="font-serif text-lg font-semibold text-green-900">
                Approved
              </h4>
              <p className="mt-1 text-sm text-green-800">
                {approval.approvedBy
                  ? `Approved by ${approval.approvedBy} on ${approval.approvedAt?.toLocaleDateString()}`
                  : `Approved on ${approval.approvedAt?.toLocaleDateString()}`}
              </p>
            </div>
          </div>
        </motion.div>
      )
    }

    if (isRejected) {
      return (
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            'rounded-lg border-2 border-red-500 bg-gradient-to-br from-red-50 to-red-100 p-5',
            className
          )}
        >
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-500">
              <AlertCircle className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1">
              <h4 className="font-serif text-lg font-semibold text-red-900">
                Changes Requested
              </h4>
              {approval.rejectionReason && (
                <p className="mt-2 text-sm text-red-800">{approval.rejectionReason}</p>
              )}
            </div>
          </div>
        </motion.div>
      )
    }

    // Pending approval state
    return (
      <>
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            'rounded-lg border-2 border-[#F18F01] bg-gradient-to-br from-[#FFF4E6] to-[#FFE8CC] p-5',
            className
          )}
          data-testid="approval-banner"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#FF6B35]">
              <AlertCircle className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1">
              <h4 className="font-serif text-lg font-semibold text-amber-900">
                Approval Required
              </h4>
              <h5 className="mt-1 font-medium text-amber-900">{approval.title}</h5>
              <p className="mt-2 text-sm text-amber-800">{approval.description}</p>

              {/* Value display if monetary approval */}
              {approval.value && (
                <p className="mt-3 font-serif text-xl font-semibold text-amber-900">
                  Total:{' '}
                  {new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: approval.currency || 'USD',
                  }).format(approval.value)}
                </p>
              )}

              {/* Action buttons */}
              <div className="mt-4 flex flex-wrap gap-3">
                <Button
                  onClick={handleApproveClick}
                  disabled={isSubmitting}
                  className="flex-1 sm:flex-none bg-green-600 hover:bg-green-700 text-white"
                  size="lg"
                  data-testid="approve-button"
                >
                  <Check className="mr-2 h-5 w-5" />
                  Approve
                </Button>
                <Button
                  onClick={handleRequestChangesClick}
                  disabled={isSubmitting}
                  variant="outline"
                  className="flex-1 sm:flex-none border-2 border-[#FF6B35] text-[#FF6B35] hover:bg-[#FF6B35] hover:text-white"
                  size="lg"
                >
                  <MessageSquare className="mr-2 h-5 w-5" />
                  Request Changes
                </Button>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Approve Confirmation Modal */}
        <Dialog open={showApproveModal} onOpenChange={setShowApproveModal}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirm Approval</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              You're approving <strong>{approval.title}</strong>. This will notify your
              designer and move the project forward.
            </p>

            {/* Review checkbox */}
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={hasReviewed}
                onChange={(e) => setHasReviewed(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-gray-300"
              />
              <span className="text-sm">
                I have reviewed all documents and designs
              </span>
            </label>

            {/* Optional comment */}
            <div>
              <label className="block text-sm font-medium mb-1">
                Add comment (optional)
              </label>
              <textarea
                value={approvalComment}
                onChange={(e) => setApprovalComment(e.target.value)}
                placeholder="Any additional comments..."
                className="w-full rounded-lg border border-gray-300 p-3 text-sm resize-none"
                rows={3}
              />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="ghost"
                onClick={() => setShowApproveModal(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                onClick={handleConfirmApprove}
                disabled={!hasReviewed || isSubmitting}
                className="bg-green-600 hover:bg-green-700 text-white"
                data-testid="confirm-approval"
              >
                {isSubmitting ? 'Approving...' : 'Confirm Approval'}
              </Button>
            </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Request Changes Modal */}
        <Dialog open={showChangesModal} onOpenChange={setShowChangesModal}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Request Changes</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Please describe what needs to change. Your feedback will help the team
              deliver exactly what you envision.
            </p>

            {/* Reason textarea */}
            <div>
              <label className="block text-sm font-medium mb-1">
                What needs to change? <span className="text-red-500">*</span>
              </label>
              <textarea
                value={changesReason}
                onChange={(e) => setChangesReason(e.target.value)}
                placeholder="Please be as specific as possible..."
                className="w-full rounded-lg border border-gray-300 p-3 text-sm resize-none"
                rows={4}
                required
              />
              <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                <span>Minimum 20 characters</span>
                <span>{changesReason.length}/500</span>
              </div>
              {changesReason.length > 0 && changesReason.length < 20 && (
                <p className="mt-1 text-xs text-red-500">
                  Please provide more detail (at least 20 characters)
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="ghost"
                onClick={() => setShowChangesModal(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmitChanges}
                disabled={changesReason.trim().length < 20 || isSubmitting}
                className="bg-[#FF6B35] hover:bg-[#FF5722] text-white"
              >
                {isSubmitting ? 'Submitting...' : 'Submit Request'}
              </Button>
            </div>
            </div>
          </DialogContent>
        </Dialog>
      </>
    )
  }
)

ApprovalBanner.displayName = 'ApprovalBanner'
