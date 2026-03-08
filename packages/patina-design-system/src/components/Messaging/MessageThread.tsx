'use client'

import { Loader2 } from 'lucide-react'
import * as React from 'react'

import { cn } from '../../utils/cn'
import { Button } from '../Button/Button'
import { ScrollArea } from '../ScrollArea/ScrollArea'

import { MessageBubble } from './MessageBubble'
import { MessageThreadProps, ThreadMessage } from './types'

const formatDaySeparator = (date: Date) =>
  date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })

const groupByDay = (messages: ThreadMessage[]) => {
  return messages.reduce<Record<string, ThreadMessage[]>>((acc, message) => {
    const key = message.timestamp.toDateString()
    if (!acc[key]) acc[key] = []
    acc[key].push(message)
    return acc
  }, {})
}

export const MessageThread = React.forwardRef<HTMLDivElement, MessageThreadProps>(
  (
    {
      messages,
      currentUserId,
      showDaySeparators = true,
      hasMore,
      onLoadMore,
      typingIndicators,
      emptyState,
      renderMessageActions,
      onRetry,
      onAttachmentClick,
      className,
      ...rest
    },
    ref
  ) => {
    const [isLoadingMore, setLoadingMore] = React.useState(false)

    const handleLoadMore = async () => {
      if (!onLoadMore) return
      setLoadingMore(true)
      await onLoadMore()
      setLoadingMore(false)
    }

    const renderedMessages = messages.map((message) => ({
      ...message,
      variant: message.variant ?? (message.author.id === currentUserId ? 'outgoing' : 'incoming'),
    }))

    const grouped = showDaySeparators ? groupByDay(renderedMessages) : { all: renderedMessages }
    const groupKeys = Object.keys(grouped).sort(
      (a, b) => new Date(a).getTime() - new Date(b).getTime()
    )

    return (
      <div ref={ref} className={cn('flex h-full flex-col rounded-3xl border bg-white/80', className)} {...rest}>
        {hasMore && (
          <div className="flex items-center justify-center border-b p-3">
            <Button variant="ghost" size="sm" disabled={isLoadingMore} onClick={handleLoadMore}>
              {isLoadingMore ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Load earlier messages'}
            </Button>
          </div>
        )}

        <ScrollArea className="flex-1 px-4 py-6">
          {messages.length === 0 && emptyState}
          {groupKeys.map((key) => (
            <div key={key} className="space-y-4">
              {showDaySeparators && (
                <div className="sticky top-2 z-10 flex justify-center">
                  <span className="rounded-full bg-white/80 px-4 py-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground shadow-sm">
                    {formatDaySeparator(new Date(key))}
                  </span>
                </div>
              )}
              {grouped[key].map((message) => (
                <div key={message.id} className="space-y-1">
                  <MessageBubble
                    {...message}
                    variant={message.variant}
                    onRetry={onRetry}
                    onAttachmentClick={(attachment) => onAttachmentClick?.(attachment, message)}
                  />
                  {renderMessageActions && (
                    <div className="ml-14 text-xs text-muted-foreground">
                      {renderMessageActions(message)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}

          {typingIndicators && typingIndicators.length > 0 && (
            <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
              {typingIndicators.map((indicator) => indicator.name).join(', ')} is typing…
            </div>
          )}
        </ScrollArea>
      </div>
    )
  }
)

MessageThread.displayName = 'MessageThread'
