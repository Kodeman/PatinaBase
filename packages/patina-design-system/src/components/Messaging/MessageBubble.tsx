'use client'

import { AlertCircle, Check, CheckCheck, Clock, Pin } from 'lucide-react'
import * as React from 'react'

import { cn } from '../../utils/cn'
import { Avatar } from '../Avatar/Avatar'
import { Badge } from '../Badge/Badge'
import { Button } from '../Button/Button'

import { MessageAttachment, MessageBubbleProps } from './types'

const roleTone: Record<string, string> = {
  admin: 'bg-slate-900 text-white',
  designer: 'bg-indigo-600 text-white',
  client: 'bg-emerald-600 text-white',
  system: 'bg-slate-300 text-slate-900',
  automation: 'bg-amber-500 text-slate-900',
}

const statusIcon: Record<string, React.ReactNode> = {
  queued: <Clock className="h-3.5 w-3.5" />,
  sent: <Check className="h-3.5 w-3.5" />,
  delivered: <CheckCheck className="h-3.5 w-3.5" />,
  read: <CheckCheck className="h-3.5 w-3.5 text-emerald-500" />,
  error: <AlertCircle className="h-3.5 w-3.5 text-rose-500" />,
}

const roleBadgeCopy: Record<string, string> = {
  admin: 'Admin',
  designer: 'Designer',
  client: 'Client',
  system: 'System',
  automation: 'Automation',
}

const bubbleBase = 'max-w-[640px] rounded-3xl px-4 py-3 text-sm shadow-sm border bg-white dark:bg-slate-900/70'

const attachmentTone: Record<NonNullable<MessageAttachment['type']> | 'default', string> = {
  image: 'border-indigo-100 bg-indigo-50/40 text-indigo-900',
  file: 'border-slate-200 bg-slate-50 text-slate-900',
  link: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  default: 'border-slate-200 bg-slate-50 text-slate-900',
}

const formatTimestamp = (value: Date) =>
  value.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

export const MessageBubble = React.forwardRef<HTMLDivElement, MessageBubbleProps>(
  (
    {
      id,
      author,
      timestamp,
      body,
      variant = 'incoming',
      status = 'sent',
      attachments,
      highlights,
      pinned,
      className,
      onRetry,
      onAttachmentClick,
      accentColor,
      ...rest
    },
    ref
  ) => {
    const isSystem = variant === 'system' || author.role === 'system'
    const isOwn = variant === 'outgoing'
    const tone = roleTone[author.role ?? 'designer']

    const bubbleClasses = cn(
      bubbleBase,
      isSystem && 'mx-auto text-center',
      isOwn && 'ml-auto bg-indigo-600 text-white border-indigo-500 shadow-indigo-100',
      pinned && 'ring-2 ring-amber-300',
      className
    )

    const renderAttachment = (attachment: MessageAttachment) => {
      const toneKey = attachment.type ?? 'default'
      const palette = attachmentTone[toneKey] ?? attachmentTone.default
      return (
        <button
          key={attachment.id}
          type="button"
          onClick={() => onAttachmentClick?.(attachment)}
          className={cn(
            'flex w-full items-center justify-between rounded-2xl border px-3 py-2 text-left text-xs transition hover:scale-[1.01]',
            palette,
            onAttachmentClick ? 'cursor-pointer' : 'cursor-default'
          )}
        >
          <div className="min-w-0 pr-3">
            <p className="truncate font-medium">{attachment.name}</p>
            {attachment.size && <p className="text-[11px] opacity-80">{attachment.size}</p>}
          </div>
          <span className="text-[11px] font-semibold uppercase tracking-wide">{attachment.type}</span>
        </button>
      )
    }

    return (
      <div
        ref={ref}
        className={cn('flex w-full gap-3', isSystem ? 'justify-center' : isOwn ? 'flex-row-reverse' : 'flex-row')}
        {...rest}
      >
        {!isSystem && (
          <Avatar
            src={author.avatarUrl}
            name={author.name}
            alt={author.name}
            size="sm"
            className={cn(author.isOnline && 'ring-2 ring-emerald-400')}
          />
        )}

        <div className="space-y-2">
          <div className={cn('flex items-center gap-2 text-xs text-muted-foreground', isOwn && 'justify-end')}>
            {!isSystem && (
              <div className="flex items-center gap-1">
                <span className="font-medium text-slate-900 dark:text-white">{author.name}</span>
                {author.role && (
                  <Badge
                    variant="outline"
                    className={cn('border-transparent px-2 py-0.5 text-[10px] uppercase tracking-wide', tone)}
                  >
                    {roleBadgeCopy[author.role] ?? author.role}
                  </Badge>
                )}
              </div>
            )}
            <span>{timestamp ? formatTimestamp(timestamp) : ''}</span>
            {pinned && (
              <span className="inline-flex items-center gap-1 text-amber-600">
                <Pin className="h-3 w-3" /> Pinned
              </span>
            )}
          </div>

          <div className={bubbleClasses} style={accentColor ? { borderColor: accentColor } : undefined}>
            {body && (
              <div className="space-y-2">
                {highlights?.length ? (
                  <div className="space-y-1">
                    {highlights.map((highlight) => (
                      <p key={highlight} className="text-xs font-semibold uppercase tracking-wide text-indigo-400">
                        {highlight}
                      </p>
                    ))}
                  </div>
                ) : null}
                <p className="whitespace-pre-line leading-relaxed">{body}</p>
              </div>
            )}

            {attachments && attachments.length > 0 && (
              <div className="mt-3 space-y-2">
                {attachments.map((attachment) => renderAttachment(attachment))}
              </div>
            )}
          </div>

          <div className={cn('flex items-center gap-2 text-[11px] text-muted-foreground', isOwn && 'justify-end')}>
            {status !== 'sent' && statusIcon[status]}
            {status === 'error' && (
              <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => onRetry?.(id)}>
                Retry
              </Button>
            )}
            {status === 'read' && <span>Read</span>}
          </div>
        </div>
      </div>
    )
  }
)

MessageBubble.displayName = 'MessageBubble'
