import * as React from 'react'

export type MessageVariant = 'incoming' | 'outgoing' | 'system'

export type MessageStatus = 'queued' | 'sent' | 'delivered' | 'read' | 'error'

export type MessageRole = 'admin' | 'designer' | 'client' | 'system' | 'automation'

export type MessageAttachmentType = 'image' | 'file' | 'link'

export interface MessageAttachment {
  id: string
  name: string
  type?: MessageAttachmentType
  size?: string
  url?: string
  previewUrl?: string
}

export interface MessageAuthor {
  id: string
  name: string
  role?: MessageRole
  avatarUrl?: string
  isOnline?: boolean
}

export interface MessageBase {
  id: string
  author: MessageAuthor
  timestamp: Date
  body?: string
  variant?: MessageVariant
  status?: MessageStatus
  attachments?: MessageAttachment[]
  highlights?: string[]
  pinned?: boolean
  accentColor?: string
}

export interface MessageBubbleProps
  extends MessageBase,
    Omit<React.HTMLAttributes<HTMLDivElement>, 'id'> {
  onRetry?: (messageId: string) => void
  onAttachmentClick?: (attachment: MessageAttachment) => void
}

export interface ThreadMessage extends MessageBase {
  groupingKey?: string
}

export interface MessageThreadProps extends React.HTMLAttributes<HTMLDivElement> {
  messages: ThreadMessage[]
  currentUserId?: string
  showDaySeparators?: boolean
  onLoadMore?: () => void
  hasMore?: boolean
  typingIndicators?: MessageAuthor[]
  emptyState?: React.ReactNode
  renderMessageActions?: (message: ThreadMessage) => React.ReactNode
  onRetry?: (messageId: string) => void
  onAttachmentClick?: (attachment: MessageAttachment, message: ThreadMessage) => void
}

export interface MessageComposerAttachment extends MessageAttachment {
  file?: File
  progress?: number
}

export interface MessageComposerProps extends React.HTMLAttributes<HTMLDivElement> {
  placeholder?: string
  rows?: number
  maxLength?: number
  disabled?: boolean
  busy?: boolean
  recipients?: MessageAuthor[]
  attachments?: MessageComposerAttachment[]
  onSend: (payload: {
    body: string
    attachments: MessageComposerAttachment[]
  }) => Promise<void> | void
  onChangeText?: (value: string) => void
  onAddAttachment?: (files: FileList) => void
  onRemoveAttachment?: (attachmentId: string) => void
  leadingActions?: React.ReactNode
  trailingActions?: React.ReactNode
}
