'use client'

import { Image as ImageIcon, Loader2, Paperclip, Send, X } from 'lucide-react'
import * as React from 'react'

import { cn } from '../../utils/cn'
import { Avatar } from '../Avatar/Avatar'
import { Button } from '../Button/Button'
import { Textarea } from '../Textarea/Textarea'

import { MessageComposerProps } from './types'

export const MessageComposer = React.forwardRef<HTMLDivElement, MessageComposerProps>(
  (
    {
      placeholder = 'Type a message…',
      rows = 3,
      maxLength = 2000,
      disabled,
      busy,
      recipients,
      attachments = [],
      leadingActions,
      trailingActions,
      className,
      onSend,
      onChangeText,
      onAddAttachment,
      onRemoveAttachment,
      ...rest
    },
    ref
  ) => {
    const [value, setValue] = React.useState('')
    const fileInputRef = React.useRef<HTMLInputElement>(null)

    const handleSend = async () => {
      if (!value.trim() && attachments.length === 0) return
      await onSend({ body: value.trim(), attachments })
      setValue('')
    }

    const handleAttach = (acceptImages = false) => {
      const input = fileInputRef.current
      if (!input) return
      input.accept = acceptImages ? 'image/*' : '*/*'
      input.click()
    }

    const handleFilesSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files
      if (files && files.length > 0) {
        onAddAttachment?.(files)
        event.target.value = ''
      }
    }

    const remaining = maxLength - value.length

    return (
      <div
        ref={ref}
        className={cn('space-y-3 rounded-3xl border bg-white/80 p-4', className)}
        {...rest}
      >
        {recipients && recipients.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="font-semibold uppercase tracking-wide">To:</span>
            {recipients.map((recipient) => (
              <span key={recipient.id} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-1">
                <Avatar src={recipient.avatarUrl} name={recipient.name} size="xs" />
                {recipient.name}
              </span>
            ))}
          </div>
        )}

        <Textarea
          rows={rows}
          autoResize
          value={value}
          maxLength={maxLength}
          disabled={disabled || busy}
          placeholder={placeholder}
          onChange={(event) => {
            setValue(event.target.value)
            onChangeText?.(event.target.value)
          }}
        />
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              disabled={disabled || busy}
              onClick={() => handleAttach(false)}
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              disabled={disabled || busy}
              onClick={() => handleAttach(true)}
            >
              <ImageIcon className="h-4 w-4" />
            </Button>
            {leadingActions}
          </div>

          <div className="ml-auto flex items-center gap-3">
            {remaining < 200 && (
              <span>{remaining} characters</span>
            )}
            {trailingActions}
            <Button
              className="min-w-[96px]"
              disabled={disabled || busy || (!value.trim() && attachments.length === 0)}
              onClick={handleSend}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              {busy ? 'Sending' : 'Send'}
            </Button>
          </div>
        </div>

        {attachments.length > 0 && (
          <div className="space-y-2">
            {attachments.map((attachment) => (
              <div
                key={attachment.id}
                className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{attachment.name}</p>
                  {attachment.size && (
                    <p className="text-xs text-muted-foreground">{attachment.size}</p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {typeof attachment.progress === 'number' && attachment.progress < 1 && (
                    <span className="text-xs text-muted-foreground">
                      Uploading {(attachment.progress * 100).toFixed(0)}%
                    </span>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => onRemoveAttachment?.(attachment.id)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          multiple
          onChange={handleFilesSelected}
        />
      </div>
    )
  }
)

MessageComposer.displayName = 'MessageComposer'
