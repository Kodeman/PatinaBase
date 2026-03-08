'use client'

import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronDown,
  Calendar,
  CheckCircle,
  FileText,
  Camera,
  MessageSquare,
} from 'lucide-react'
import { cn } from '../../utils/cn'
import { Badge } from '../Badge/Badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../Tabs/Tabs'
import { Avatar } from '../Avatar/Avatar'
import { MediaCarousel } from '../MediaCarousel/MediaCarousel'
import { ProgressCircle } from './ProgressCircle'
import { ApprovalBanner } from './ApprovalBanner'
import type { MilestoneDetail } from './types'

export interface ProjectMilestoneCardProps {
  milestone: MilestoneDetail
  isExpanded?: boolean
  onToggle?: () => void
  onApprove?: (comment?: string) => Promise<void>
  onRequestChanges?: (reason: string) => Promise<void>
  onSendMessage?: (message: string) => Promise<void>
  isSubmitting?: boolean
  className?: string
}

/**
 * ProjectMilestoneCard - Rich milestone card with progress-first design
 *
 * Features:
 * - Large circular progress indicator
 * - Expand/collapse with smooth animation
 * - Tabbed content (Overview, Media, Documents, Messages)
 * - Integrated approval workflow
 * - Real-time message thread
 *
 * @example
 * ```tsx
 * <ProjectMilestoneCard
 *   milestone={milestoneData}
 *   isExpanded={expanded}
 *   onToggle={() => setExpanded(!expanded)}
 *   onApprove={handleApprove}
 *   onSendMessage={handleSendMessage}
 * />
 * ```
 */
export const ProjectMilestoneCard = React.forwardRef<
  HTMLDivElement,
  ProjectMilestoneCardProps
>(
  (
    {
      milestone,
      isExpanded = false,
      onToggle,
      onApprove,
      onRequestChanges,
      onSendMessage,
      isSubmitting = false,
      className,
    },
    ref
  ) => {
    const [messageText, setMessageText] = React.useState('')
    const [isSendingMessage, setIsSendingMessage] = React.useState(false)
    const contentRef = React.useRef<HTMLDivElement>(null)

    // Get status badge configuration
    const statusConfig = React.useMemo(() => {
      switch (milestone.status) {
        case 'completed':
          return { color: 'success' as const, label: 'Completed', icon: CheckCircle }
        case 'in-progress':
          return { color: 'info' as const, label: 'In Progress', icon: null }
        case 'approval-needed':
          return {
            color: 'warning' as const,
            label: '⚠️ Approval Needed',
            icon: null,
          }
        case 'changes-requested':
          return { color: 'error' as const, label: 'Changes Requested', icon: null }
        default:
          return { color: 'neutral' as const, label: 'Upcoming', icon: null }
      }
    }, [milestone.status])

    // Handle message send
    const handleSendMessage = async (e: React.FormEvent) => {
      e.preventDefault()
      if (!messageText.trim() || !onSendMessage) return

      setIsSendingMessage(true)
      try {
        await onSendMessage(messageText.trim())
        setMessageText('')
      } catch (error) {
        console.error('Failed to send message:', error)
      } finally {
        setIsSendingMessage(false)
      }
    }

    // Handle Ctrl+Enter in textarea
    const handleMessageKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && e.ctrlKey) {
        e.preventDefault()
        handleSendMessage(e as any)
      }
    }

    // Format date helper
    const formatDate = (date: Date) => {
      return new Intl.DateTimeFormat('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }).format(date)
    }

    // Format relative time helper
    const formatRelativeTime = (date: Date) => {
      const now = new Date()
      const diffMs = now.getTime() - date.getTime()
      const diffMins = Math.floor(diffMs / 60000)
      const diffHours = Math.floor(diffMs / 3600000)
      const diffDays = Math.floor(diffMs / 86400000)

      if (diffMins < 1) return 'Just now'
      if (diffMins < 60) return `${diffMins}m ago`
      if (diffHours < 24) return `${diffHours}h ago`
      if (diffDays < 7) return `${diffDays}d ago`
      return formatDate(date)
    }

    return (
      <motion.div
        ref={ref}
        className={cn(
          'group relative rounded-2xl border bg-white p-6 shadow-sm transition-all duration-300',
          'hover:shadow-md hover:-translate-y-1',
          isExpanded && 'ring-2 ring-blue-500/20 shadow-lg',
          className
        )}
        data-testid={`milestone-${milestone.id}`}
        data-expanded={isExpanded}
      >
        {/* Collapsed State - Compact Layout with Small Progress Circle */}
        <div
          className="flex items-center gap-4 cursor-pointer"
          onClick={onToggle}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onToggle?.()
            }
          }}
          aria-expanded={isExpanded}
          aria-controls={`milestone-content-${milestone.id}`}
        >
          {/* Milestone Identity */}
          <div className="flex-1 min-w-0">
            {/* Sequential label with progress circle inline */}
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground mb-1">
              <ProgressCircle
                progress={milestone.progress}
                status={milestone.status}
                size="md"
                showPercentage
                animated
              />
              <span>
                {milestone.phase && <span>{milestone.phase} • </span>}
                Milestone {milestone.sequenceNumber} of {milestone.totalMilestones}
              </span>
            </div>

            {/* Title */}
            <h3 className="font-serif text-2xl font-semibold leading-tight mb-2">
              {milestone.title}
            </h3>

            {/* Date */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>
                {milestone.status === 'completed' ? 'Completed ' : 'Due '}
                {formatDate(milestone.date)}
              </span>
            </div>
          </div>

          {/* Status Badge & Expand Indicator */}
          <div className="flex flex-col items-end gap-3 shrink-0">
            <Badge
              variant="subtle"
              color={statusConfig.color}
              icon={
                statusConfig.icon ? (
                  <statusConfig.icon className="h-3 w-3" />
                ) : undefined
              }
            >
              {statusConfig.label}
            </Badge>

            <motion.div
              animate={{ rotate: isExpanded ? 180 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <ChevronDown className="h-5 w-5 text-muted-foreground" />
            </motion.div>
          </div>
        </div>

        {/* Expanded Content */}
        <AnimatePresence initial={false}>
          {isExpanded && (
            <motion.div
              id={`milestone-content-${milestone.id}`}
              ref={contentRef}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              <div className="mt-6 space-y-6">
                {/* Approval Banner (if required) */}
                {milestone.approval && onApprove && onRequestChanges && (
                  <ApprovalBanner
                    approval={milestone.approval}
                    onApprove={onApprove}
                    onRequestChanges={onRequestChanges}
                    isSubmitting={isSubmitting}
                  />
                )}

                {/* Tabbed Content */}
                <Tabs defaultValue="overview" className="w-full">
                  <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="media">
                      Media
                      {milestone.media && milestone.media.length > 0 && (
                        <span className="ml-1 text-xs">({milestone.media.length})</span>
                      )}
                    </TabsTrigger>
                    <TabsTrigger value="documents">
                      Documents
                      {milestone.documents && milestone.documents.length > 0 && (
                        <span className="ml-1 text-xs">
                          ({milestone.documents.length})
                        </span>
                      )}
                    </TabsTrigger>
                    <TabsTrigger value="messages">
                      Messages
                      {milestone.messages && milestone.messages.length > 0 && (
                        <span className="ml-1 text-xs">
                          ({milestone.messages.length})
                        </span>
                      )}
                    </TabsTrigger>
                  </TabsList>

                  {/* Overview Tab */}
                  <TabsContent value="overview" className="mt-4 space-y-4">
                    {/* Description */}
                    {milestone.description && (
                      <p className="text-base leading-relaxed text-muted-foreground">
                        {milestone.description}
                      </p>
                    )}

                    {/* Checklist */}
                    {milestone.checklist && milestone.checklist.length > 0 && (
                      <div className="rounded-lg border bg-muted/30 p-4">
                        <h4 className="text-sm font-medium mb-3">
                          Progress Checklist
                          <span className="ml-2 text-muted-foreground">
                            ({milestone.checklist.filter((i) => i.completed).length} of{' '}
                            {milestone.checklist.length} completed)
                          </span>
                        </h4>
                        <div className="space-y-2">
                          {milestone.checklist.map((item) => (
                            <div
                              key={item.id}
                              className="flex items-center gap-3"
                            >
                              <div
                                className={cn(
                                  'flex h-5 w-5 items-center justify-center rounded-full border-2',
                                  item.completed
                                    ? 'border-green-500 bg-green-500'
                                    : 'border-gray-300'
                                )}
                              >
                                {item.completed && (
                                  <CheckCircle className="h-3 w-3 text-white" />
                                )}
                              </div>
                              <span
                                className={cn(
                                  'text-sm',
                                  item.completed &&
                                    'text-muted-foreground line-through'
                                )}
                              >
                                {item.title}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </TabsContent>

                  {/* Media Tab */}
                  <TabsContent value="media" className="mt-4">
                    {milestone.media && milestone.media.length > 0 ? (
                      <MediaCarousel
                        items={milestone.media}
                        autoPlay={0}
                        showThumbnails
                        className="rounded-lg"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center py-12 text-center">
                        <Camera className="h-12 w-12 text-muted-foreground/50 mb-3" />
                        <p className="text-sm text-muted-foreground">
                          No media available for this milestone
                        </p>
                      </div>
                    )}
                  </TabsContent>

                  {/* Documents Tab */}
                  <TabsContent value="documents" className="mt-4">
                    {milestone.documents && milestone.documents.length > 0 ? (
                      <div className="space-y-2">
                        {milestone.documents.map((doc) => (
                          <a
                            key={doc.id}
                            href={doc.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
                          >
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-muted">
                              <FileText className="h-5 w-5 text-muted-foreground" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium">{doc.title}</p>
                              {doc.description && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  {doc.description}
                                </p>
                              )}
                              {doc.uploadedAt && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  Uploaded {formatRelativeTime(doc.uploadedAt)}
                                </p>
                              )}
                            </div>
                          </a>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-12 text-center">
                        <FileText className="h-12 w-12 text-muted-foreground/50 mb-3" />
                        <p className="text-sm text-muted-foreground">
                          No documents available for this milestone
                        </p>
                      </div>
                    )}
                  </TabsContent>

                  {/* Messages Tab */}
                  <TabsContent value="messages" className="mt-4">
                    <div className="space-y-4">
                      {/* Message Thread */}
                      {milestone.messages && milestone.messages.length > 0 ? (
                        <div className="max-h-96 space-y-3 overflow-y-auto rounded-lg border p-4">
                          {milestone.messages.map((message) => {
                            const isClient = message.authorRole === 'client'
                            const isSystem = message.authorRole === 'system'

                            if (isSystem) {
                              return (
                                <div
                                  key={message.id}
                                  className="flex justify-center"
                                >
                                  <p className="text-center text-xs italic text-muted-foreground">
                                    {message.body}
                                  </p>
                                </div>
                              )
                            }

                            return (
                              <div
                                key={message.id}
                                className={cn(
                                  'flex gap-3',
                                  isClient && 'flex-row-reverse'
                                )}
                              >
                                <Avatar size="sm" className="shrink-0">
                                  {message.authorAvatar ? (
                                    <img
                                      src={message.authorAvatar}
                                      alt={message.authorName}
                                    />
                                  ) : (
                                    <span>{message.authorName[0]}</span>
                                  )}
                                </Avatar>
                                <div
                                  className={cn(
                                    'flex-1 min-w-0',
                                    isClient && 'flex flex-col items-end'
                                  )}
                                >
                                  <div
                                    className={cn(
                                      'mb-1 flex items-center gap-2 text-xs',
                                      isClient && 'flex-row-reverse'
                                    )}
                                  >
                                    <span className="font-medium">
                                      {message.authorName}
                                    </span>
                                    <span className="text-muted-foreground">
                                      {formatRelativeTime(message.createdAt)}
                                    </span>
                                  </div>
                                  <div
                                    className={cn(
                                      'inline-block rounded-lg px-3 py-2 text-sm',
                                      isClient
                                        ? 'bg-white border'
                                        : 'bg-[#EDE9E4]'
                                    )}
                                  >
                                    {message.body}
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      ) : (
                        <div className="flex items-center justify-center rounded-lg border py-8">
                          <p className="text-sm text-muted-foreground">
                            No messages yet. Start a conversation!
                          </p>
                        </div>
                      )}

                      {/* Message Composer */}
                      {onSendMessage && (
                        <form onSubmit={handleSendMessage} className="space-y-2">
                          <textarea
                            value={messageText}
                            onChange={(e) => setMessageText(e.target.value)}
                            onKeyDown={handleMessageKeyDown}
                            placeholder="Write a message..."
                            className="w-full resize-none rounded-lg border border-gray-300 p-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            rows={3}
                            disabled={isSendingMessage}
                          />
                          <div className="flex items-center justify-between">
                            <p className="text-xs text-muted-foreground">
                              Press Ctrl+Enter to send
                            </p>
                            <button
                              type="submit"
                              disabled={!messageText.trim() || isSendingMessage}
                              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <MessageSquare className="h-4 w-4" />
                              {isSendingMessage ? 'Sending...' : 'Send'}
                            </button>
                          </div>
                        </form>
                      )}
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    )
  }
)

ProjectMilestoneCard.displayName = 'ProjectMilestoneCard'
