'use client'

import React from 'react'
import { cn } from '../../utils/cn'
import {
  Phone,
  Mail,
  Calendar,
  MessageSquare,
  FileText,
  Gift,
  User,
  CheckCircle,
  ChevronDown,
} from 'lucide-react'
import { Button } from '../Button'
import { Card } from '../Card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../DropdownMenu'

export interface NextActionWidgetContentProps {
  /** Type of content: template or custom */
  type: 'template' | 'custom'
  /** Template name if type is 'template' */
  template?: string
  /** Custom message if type is 'custom' */
  customMessage?: string
}

export interface NextActionWidgetProps {
  /** The recommended action */
  action: string
  /** Confidence level as decimal (0-1) */
  confidence: number
  /** Optional content for the action */
  content?: NextActionWidgetContentProps
  /** Alternative actions the user can choose */
  alternatives?: string[]
  /** Reasoning for the recommendation */
  reasoning?: string[]
  /** Callback when action is executed */
  onExecute?: (action: string) => void | Promise<void>
  /** Callback when alternative is chosen */
  onChooseAlternative?: (action: string) => void | Promise<void>
  /** Additional CSS classes */
  className?: string
}

const ACTION_LABELS: Record<string, string> = {
  schedule_consultation: 'Schedule Consultation',
  send_design_update: 'Send Design Update',
  request_approval: 'Request Approval',
  check_in_call: 'Check-in Call',
  present_upgrade: 'Present Upgrade',
  request_referral: 'Request Referral',
  send_email: 'Send Email',
  send_message: 'Send Message',
  follow_up: 'Follow Up',
  request_feedback: 'Request Feedback',
  create_proposal: 'Create Proposal',
  share_inspiration: 'Share Inspiration',
}

const ACTION_ICONS: Record<string, React.ReactNode> = {
  schedule_consultation: <Calendar className="h-4 w-4" />,
  send_design_update: <FileText className="h-4 w-4" />,
  request_approval: <CheckCircle className="h-4 w-4" />,
  check_in_call: <Phone className="h-4 w-4" />,
  present_upgrade: <Gift className="h-4 w-4" />,
  request_referral: <User className="h-4 w-4" />,
  send_email: <Mail className="h-4 w-4" />,
  send_message: <MessageSquare className="h-4 w-4" />,
  follow_up: <Phone className="h-4 w-4" />,
  request_feedback: <MessageSquare className="h-4 w-4" />,
  create_proposal: <FileText className="h-4 w-4" />,
  share_inspiration: <Gift className="h-4 w-4" />,
}

/**
 * NextActionWidget recommends the next action to take with a client
 *
 * @example
 * ```tsx
 * <NextActionWidget
 *   action="schedule_consultation"
 *   confidence={0.85}
 *   content={{
 *     type: 'template',
 *     template: 'follow_up_consultation'
 *   }}
 *   alternatives={['send_email', 'send_message']}
 *   reasoning={[
 *     'No interaction in 7 days',
 *     'High engagement history'
 *   ]}
 *   onExecute={(action) => handleAction(action)}
 * />
 * ```
 */
const NextActionWidget = React.forwardRef<HTMLDivElement, NextActionWidgetProps>(
  (
    {
      action,
      confidence,
      content,
      alternatives = [],
      reasoning = [],
      onExecute,
      onChooseAlternative,
      className,
    },
    ref
  ) => {
    const [isLoading, setIsLoading] = React.useState(false)

    const getActionIcon = (actionType: string) => {
      return ACTION_ICONS[actionType] || <MessageSquare className="h-5 w-5" />
    }

    const formatActionLabel = (actionType: string) => {
      return ACTION_LABELS[actionType] || actionType
        .split('_')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')
    }

    const getConfidenceColor = () => {
      if (confidence >= 0.8) return 'text-green-600'
      if (confidence >= 0.6) return 'text-yellow-600'
      return 'text-gray-600'
    }

    const handleExecute = async () => {
      try {
        setIsLoading(true)
        await onExecute?.(action)
      } finally {
        setIsLoading(false)
      }
    }

    const handleAlternative = async (alt: string) => {
      try {
        setIsLoading(true)
        await onChooseAlternative?.(alt)
      } finally {
        setIsLoading(false)
      }
    }

    return (
      <Card ref={ref} className={cn('overflow-hidden', className)}>
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-blue-100 p-2 text-blue-600">
                {getActionIcon(action)}
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Recommended Next Step</h3>
                <p className="text-sm text-gray-600">{formatActionLabel(action)}</p>
              </div>
            </div>
            <div className={cn('text-right')}>
              <span className={cn('text-sm font-semibold', getConfidenceColor())}>
                {Math.round(confidence * 100)}%
              </span>
              <p className="text-xs text-gray-500">confidence</p>
            </div>
          </div>
        </div>

        <div className="space-y-3 p-4">
          {reasoning.length > 0 && (
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-600 mb-2">
                Why:
              </p>
              <ul className="space-y-1">
                {reasoning.map((reason, i) => (
                  <li key={i} className="text-sm text-gray-700">
                    • {reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {content?.type === 'custom' && content.customMessage && (
            <div className="rounded-lg border-l-4 border-blue-500 bg-blue-50 p-3">
              <p className="text-sm text-gray-700">{content.customMessage}</p>
            </div>
          )}

          {content?.type === 'template' && content.template && (
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-600 mb-1">
                Template:
              </p>
              <p className="text-sm text-gray-700">{content.template}</p>
            </div>
          )}
        </div>

        <div className="flex gap-2 border-t bg-gray-50 p-4">
          <Button
            size="sm"
            onClick={handleExecute}
            disabled={isLoading}
            className="flex-1"
          >
            {getActionIcon(action)}
            <span className="ml-2">Execute</span>
          </Button>

          {alternatives.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" disabled={isLoading}>
                  <span>More</span>
                  <ChevronDown className="ml-1 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {alternatives.map((alt) => (
                  <DropdownMenuItem
                    key={alt}
                    onClick={() => handleAlternative(alt)}
                    className="flex items-center gap-2"
                  >
                    {getActionIcon(alt)}
                    {formatActionLabel(alt)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </Card>
    )
  }
)

NextActionWidget.displayName = 'NextActionWidget'

export { NextActionWidget }
