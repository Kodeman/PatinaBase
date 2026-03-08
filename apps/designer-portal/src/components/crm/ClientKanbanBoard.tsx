'use client'

import React from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { ChurnRiskIndicator, Badge, Card, Skeleton, Avatar } from '@patina/design-system'
import { DollarSign } from 'lucide-react'

export interface ClientWithPredictions {
  id: string
  name: string
  firstName?: string
  lastName?: string
  avatar?: string
  email: string
  stage: 'prospect' | 'lead' | 'active' | 'care' | 'inactive'
  totalSpent: number
  lastActivity?: string
  assignedDesigner?: string
  predictions?: {
    churn: {
      probability: number
      riskLevel: 'low' | 'medium' | 'high' | 'critical'
      confidence: number
    }
    nextAction?: {
      action: string
    }
    upsell?: {
      opportunities: Array<{
        id: string
        estimatedValue: number
        type: string
      }>
    }
  }
}

interface ClientKanbanBoardProps {
  clients?: ClientWithPredictions[]
  isLoading?: boolean
}

const STAGE_CONFIG = {
  prospect: { label: 'Prospects', color: 'bg-blue-50' },
  lead: { label: 'Leads', color: 'bg-yellow-50' },
  active: { label: 'Active', color: 'bg-green-50' },
  care: { label: 'Care Cycle', color: 'bg-purple-50' },
  inactive: { label: 'Inactive', color: 'bg-gray-50' },
}

const ClientCard: React.FC<{ client: ClientWithPredictions }> = ({ client }) => {
  const displayName = client.name || `${client.firstName} ${client.lastName}`.trim()
  const predictions = client.predictions

  return (
    <Link href={`/clients/${client.id}`}>
      <Card hoverable className="p-3 cursor-move transition-shadow">
        <div className="space-y-3">
          {/* Header with risk indicator */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <p className="font-medium text-sm truncate">{displayName}</p>
              <p className="text-xs text-gray-500 truncate">{client.email}</p>
            </div>

            {/* Churn Risk Indicator */}
            {predictions?.churn && (
              <ChurnRiskIndicator
                probability={predictions.churn.probability}
                riskLevel={predictions.churn.riskLevel}
                confidence={predictions.churn.confidence}
                showDetails={false}
              />
            )}
          </div>

          {/* Financial info */}
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-600">Total spent:</span>
            <span className="font-semibold">${(client.totalSpent / 1000).toFixed(1)}k</span>
          </div>

          {/* Suggested action */}
          {predictions?.nextAction && (
            <div className="rounded-lg bg-blue-50 px-2 py-1.5">
              <p className="text-xs font-medium text-blue-900">
                Suggested: {formatActionLabel(predictions.nextAction.action)}
              </p>
            </div>
          )}

          {/* Upsell opportunity indicator */}
          {predictions?.upsell?.opportunities && predictions.upsell.opportunities.length > 0 && (
            <div className="flex items-center gap-1 rounded-lg bg-green-50 px-2 py-1.5">
              <DollarSign className="h-3 w-3 text-green-600" />
              <p className="text-xs font-semibold text-green-700">
                ${Math.round(predictions.upsell.opportunities[0].estimatedValue / 1000)}k opportunity
              </p>
            </div>
          )}

          {/* Tags */}
          <div className="flex flex-wrap gap-1">
            {client.assignedDesigner && (
              <Badge size="sm" variant="subtle" color="info">
                {client.assignedDesigner}
              </Badge>
            )}
            {client.stage && (
              <Badge size="sm" variant="subtle" color="primary">
                {client.stage}
              </Badge>
            )}
          </div>
        </div>
      </Card>
    </Link>
  )
}

/**
 * ClientKanbanBoard displays clients in a kanban-style board with ML predictions
 * Useful for pipeline management and risk assessment at a glance
 *
 * @example
 * ```tsx
 * <ClientKanbanBoard clients={clients} isLoading={isLoading} />
 * ```
 */
export const ClientKanbanBoard: React.FC<ClientKanbanBoardProps> = ({
  clients = [],
  isLoading = false,
}) => {
  // Group clients by stage
  const groupedClients = React.useMemo(() => {
    const grouped: Record<string, ClientWithPredictions[]> = {
      prospect: [],
      lead: [],
      active: [],
      care: [],
      inactive: [],
    }

    clients.forEach((client) => {
      const stage = client.stage || 'prospect'
      if (stage in grouped) {
        grouped[stage].push(client)
      }
    })

    return grouped
  }, [clients])

  if (isLoading) {
    return (
      <div className="grid gap-6 md:grid-cols-5">
        {['prospect', 'lead', 'active', 'care', 'inactive'].map((stage) => (
          <div key={stage} className="space-y-3">
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="grid gap-6 md:grid-cols-5 overflow-x-auto">
      {Object.entries(STAGE_CONFIG).map(([stage, config]) => (
        <div key={stage} className="flex-1 min-w-80 md:min-w-0">
          {/* Column header */}
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold text-sm text-gray-900">{config.label}</h3>
            <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-gray-200 text-xs font-semibold text-gray-700">
              {groupedClients[stage as keyof typeof groupedClients].length}
            </span>
          </div>

          {/* Column content */}
          <div
            className={`${config.color} rounded-lg p-4 min-h-96 space-y-3 overflow-y-auto`}
          >
            {groupedClients[stage as keyof typeof groupedClients].length > 0 ? (
              groupedClients[stage as keyof typeof groupedClients].map((client) => (
                <ClientCard key={client.id} client={client} />
              ))
            ) : (
              <div className="flex items-center justify-center h-32 text-center">
                <p className="text-xs text-gray-500">No clients</p>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * Format action label from snake_case to Title Case
 */
function formatActionLabel(action: string): string {
  const labels: Record<string, string> = {
    schedule_consultation: 'Schedule Consultation',
    send_design_update: 'Send Design Update',
    request_approval: 'Request Approval',
    check_in_call: 'Check-in Call',
    present_upgrade: 'Present Upgrade',
    request_referral: 'Request Referral',
    send_email: 'Send Email',
    send_message: 'Send Message',
  }

  return labels[action] || action
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}
