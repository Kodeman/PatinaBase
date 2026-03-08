'use client'

import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Send,
  Paperclip,
  Mic,
  MicOff,
  Circle,
  File,
  Image as ImageIcon,
  X,
  ChevronDown,
  User
} from 'lucide-react'
import { cn } from '../../utils/cn'
import { Button } from '../Button'
import { Avatar } from '../Avatar'
import { Badge } from '../Badge'
import { ScrollArea } from '../ScrollArea'

export interface DiscussionMessage {
  id: string
  senderId: string
  senderName: string
  senderAvatar?: string
  senderRole: 'client' | 'designer' | 'system'
  content: string
  type: 'text' | 'voice' | 'file' | 'image'
  timestamp: Date
  attachments?: Array<{
    id: string
    name: string
    url: string
    type: string
    size: number
  }>
  replyTo?: string
  isRead?: boolean
}

export interface DesignerStatus {
  isOnline: boolean
  isTyping: boolean
  lastSeen?: Date
  averageResponseTime?: number // in minutes
}

export interface ApprovalDiscussionProps {
  approvalId: string
  approvalTitle?: string
  messages: DiscussionMessage[]
  currentUserId: string
  designerStatus?: DesignerStatus
  onSendMessage: (message: Omit<DiscussionMessage, 'id' | 'timestamp' | 'isRead'>) => void
  onSendVoice?: (audioBlob: Blob) => void
  onUploadFile?: (file: File) => void
  maxFileSize?: number // in MB
  enableVoice?: boolean
  enableThreading?: boolean
  className?: string
}

/**
 * ApprovalDiscussion - Real-time discussion interface for approvals
 *
 * Provides live chat with designer availability indicators, message threading,
 * file sharing, and voice message support for seamless communication.
 *
 * @example
 * ```tsx
 * <ApprovalDiscussion
 *   approvalId="approval-123"
 *   approvalTitle="Living Room Design"
 *   messages={messages}
 *   currentUserId="user-456"
 *   designerStatus={designerStatus}
 *   onSendMessage={handleSendMessage}
 * />
 * ```
 */
export const ApprovalDiscussion = React.forwardRef<HTMLDivElement, ApprovalDiscussionProps>(
  ({
    approvalId,
    approvalTitle,
    messages,
    currentUserId,
    designerStatus,
    onSendMessage,
    onSendVoice,
    onUploadFile,
    maxFileSize = 10,
    enableVoice = true,
    enableThreading = true,
    className,
    ...props
  }, ref) => {
    const [messageText, setMessageText] = React.useState('')
    const [isRecording, setIsRecording] = React.useState(false)
    const [replyingTo, setReplyingTo] = React.useState<DiscussionMessage | null>(null)
    const [attachments, setAttachments] = React.useState<File[]>([])
    const messagesEndRef = React.useRef<HTMLDivElement>(null)
    const fileInputRef = React.useRef<HTMLInputElement>(null)
    const mediaRecorderRef = React.useRef<MediaRecorder | null>(null)
    const audioChunksRef = React.useRef<Blob[]>([])

    // Auto-scroll to bottom on new messages
    React.useEffect(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    const handleSend = () => {
      if (!messageText.trim() && attachments.length === 0) return

      const message: Omit<DiscussionMessage, 'id' | 'timestamp' | 'isRead'> = {
        senderId: currentUserId,
        senderName: 'You',
        senderRole: 'client',
        content: messageText,
        type: 'text',
        replyTo: replyingTo?.id,
      }

      // Handle attachments separately in real implementation
      if (attachments.length > 0) {
        attachments.forEach(file => onUploadFile?.(file))
      }

      onSendMessage(message)
      setMessageText('')
      setAttachments([])
      setReplyingTo(null)
    }

    const handleKeyPress = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    }

    const startVoiceRecording = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        const mediaRecorder = new MediaRecorder(stream)
        mediaRecorderRef.current = mediaRecorder
        audioChunksRef.current = []

        mediaRecorder.ondataavailable = (event) => {
          audioChunksRef.current.push(event.data)
        }

        mediaRecorder.onstop = () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
          onSendVoice?.(audioBlob)
          stream.getTracks().forEach(track => track.stop())
        }

        mediaRecorder.start()
        setIsRecording(true)
      } catch (error) {
        console.error('Error accessing microphone:', error)
      }
    }

    const stopVoiceRecording = () => {
      if (mediaRecorderRef.current && isRecording) {
        mediaRecorderRef.current.stop()
        setIsRecording(false)
      }
    }

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []).filter(
        file => file.size <= maxFileSize * 1024 * 1024
      )
      setAttachments(prev => [...prev, ...files])
    }

    const removeAttachment = (index: number) => {
      setAttachments(prev => prev.filter((_, i) => i !== index))
    }

    const getMessageTimeDisplay = (date: Date) => {
      const now = new Date()
      const diff = now.getTime() - date.getTime()
      const minutes = Math.floor(diff / 60000)
      const hours = Math.floor(diff / 3600000)
      const days = Math.floor(diff / 86400000)

      if (minutes < 1) return 'Just now'
      if (minutes < 60) return `${minutes}m ago`
      if (hours < 24) return `${hours}h ago`
      if (days < 7) return `${days}d ago`
      return date.toLocaleDateString()
    }

    const renderMessage = (message: DiscussionMessage) => {
      const isOwnMessage = message.senderId === currentUserId
      const isSystemMessage = message.senderRole === 'system'

      if (isSystemMessage) {
        return (
          <div className="flex justify-center my-4">
            <div className="px-3 py-1 bg-muted rounded-full text-xs text-muted-foreground">
              {message.content}
            </div>
          </div>
        )
      }

      return (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            'flex gap-3 mb-4',
            isOwnMessage ? 'flex-row-reverse' : 'flex-row'
          )}
        >
          <Avatar
            src={message.senderAvatar}
            alt={message.senderName}
            name={message.senderName}
            className="h-8 w-8"
          />

          <div className={cn('flex-1 max-w-[70%]', isOwnMessage && 'flex flex-col items-end')}>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-medium">{message.senderName}</span>
              <span className="text-xs text-muted-foreground">
                {getMessageTimeDisplay(message.timestamp)}
              </span>
            </div>

            {message.replyTo && (
              <div className="px-3 py-2 mb-1 bg-muted/50 rounded-lg border-l-2 border-primary text-xs">
                <p className="text-muted-foreground">
                  Replying to message...
                </p>
              </div>
            )}

            <div
              className={cn(
                'px-4 py-2 rounded-lg',
                isOwnMessage
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted'
              )}
            >
              <p className="text-sm whitespace-pre-wrap">{message.content}</p>

              {message.attachments && message.attachments.length > 0 && (
                <div className="mt-2 space-y-1">
                  {message.attachments.map((attachment) => (
                    <div
                      key={attachment.id}
                      className={cn(
                        'flex items-center gap-2 p-2 rounded',
                        isOwnMessage ? 'bg-primary-foreground/10' : 'bg-background/50'
                      )}
                    >
                      <File className="h-4 w-4" />
                      <span className="text-xs flex-1 truncate">{attachment.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {enableThreading && (
              <button
                onClick={() => setReplyingTo(message)}
                className="text-xs text-muted-foreground hover:text-foreground mt-1"
              >
                Reply
              </button>
            )}
          </div>
        </motion.div>
      )
    }

    return (
      <div ref={ref} className={cn('flex flex-col h-full', className)} {...props}>
        {/* Header */}
        <div className="p-4 border-b">
          <div className="flex items-center justify-between">
            <div>
              {approvalTitle && (
                <h3 className="font-semibold mb-1">Discussion: {approvalTitle}</h3>
              )}
              <div className="flex items-center gap-2">
                {designerStatus?.isOnline ? (
                  <>
                    <Circle className="h-2 w-2 fill-emerald-500 text-emerald-500" />
                    <span className="text-sm text-muted-foreground">Designer online</span>
                  </>
                ) : (
                  <>
                    <Circle className="h-2 w-2 fill-gray-400 text-gray-400" />
                    <span className="text-sm text-muted-foreground">
                      {designerStatus?.lastSeen
                        ? `Last seen ${getMessageTimeDisplay(designerStatus.lastSeen)}`
                        : 'Offline'
                      }
                    </span>
                  </>
                )}
                {designerStatus?.averageResponseTime && (
                  <span className="text-xs text-muted-foreground">
                    • Avg response: {designerStatus.averageResponseTime}min
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 p-4">
          <div className="space-y-2">
            {messages.map((message) => (
              <div key={message.id}>{renderMessage(message)}</div>
            ))}

            {designerStatus?.isTyping && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex gap-3 mb-4"
              >
                <Avatar name="Designer" className="h-8 w-8" />
                <div className="px-4 py-2 bg-muted rounded-lg">
                  <div className="flex gap-1">
                    <motion.div
                      animate={{ opacity: [0.4, 1, 0.4] }}
                      transition={{ duration: 1, repeat: Infinity, delay: 0 }}
                      className="h-2 w-2 bg-muted-foreground rounded-full"
                    />
                    <motion.div
                      animate={{ opacity: [0.4, 1, 0.4] }}
                      transition={{ duration: 1, repeat: Infinity, delay: 0.2 }}
                      className="h-2 w-2 bg-muted-foreground rounded-full"
                    />
                    <motion.div
                      animate={{ opacity: [0.4, 1, 0.4] }}
                      transition={{ duration: 1, repeat: Infinity, delay: 0.4 }}
                      className="h-2 w-2 bg-muted-foreground rounded-full"
                    />
                  </div>
                </div>
              </motion.div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Reply Preview */}
        <AnimatePresence>
          {replyingTo && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="px-4 py-2 bg-muted/50 border-t border-b"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    Replying to {replyingTo.senderName}
                  </span>
                </div>
                <button
                  onClick={() => setReplyingTo(null)}
                  className="p-1 hover:bg-background rounded"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Attachments Preview */}
        <AnimatePresence>
          {attachments.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="px-4 py-2 border-t"
            >
              <div className="flex gap-2 flex-wrap">
                {attachments.map((file, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-2 px-2 py-1 bg-muted rounded text-sm"
                  >
                    <File className="h-3 w-3" />
                    <span className="truncate max-w-[100px]">{file.name}</span>
                    <button onClick={() => removeAttachment(index)}>
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Input */}
        <div className="p-4 border-t">
          <div className="flex items-end gap-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />

            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip className="h-4 w-4" />
            </Button>

            <div className="flex-1">
              <textarea
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Type your message..."
                className="w-full px-3 py-2 rounded-lg border bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                rows={1}
              />
            </div>

            {enableVoice && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={isRecording ? stopVoiceRecording : startVoiceRecording}
                className={cn(isRecording && 'text-red-500')}
              >
                {isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </Button>
            )}

            <Button
              onClick={handleSend}
              disabled={!messageText.trim() && attachments.length === 0}
              size="icon"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    )
  }
)

ApprovalDiscussion.displayName = 'ApprovalDiscussion'
