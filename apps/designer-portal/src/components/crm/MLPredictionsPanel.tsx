'use client'

import React from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ChurnRiskIndicator,
  UpsellOpportunity,
  NextActionWidget,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Alert,
  AlertDescription,
  Skeleton,
} from '@patina/design-system'

export interface MLPredictionData {
  churn: {
    probability: number
    riskLevel: 'low' | 'medium' | 'high' | 'critical'
    confidence: number
    topFactors: Array<{ factor: string; impact: number }>
  }
  nextAction: {
    action: string
    confidence: number
    content?: {
      type: 'template' | 'custom'
      template?: string
      customMessage?: string
    }
    alternatives: string[]
    reasoning: string[]
  }
  upsell: {
    opportunities: Array<{
      id: string
      type: 'room_expansion' | 'premium_materials' | 'additional_services' | 'new_project'
      probability: number
      estimatedValue: number
      recommendedProducts: Array<{
        productId: string
        productName: string
        reason?: string
      }>
    }>
  }
}

interface MLPredictionsPanelProps {
  clientId: string
}

/**
 * MLPredictionsPanel displays ML-powered insights for a client including:
 * - Churn risk assessment
 * - Recommended next actions
 * - Upsell opportunities
 *
 * @example
 * ```tsx
 * <MLPredictionsPanel clientId="client-123" />
 * ```
 */
export const MLPredictionsPanel: React.FC<MLPredictionsPanelProps> = ({ clientId }) => {
  const { data: predictions, isLoading, error } = useQuery({
    queryKey: ['ml-predictions', clientId],
    queryFn: async () => {
      const response = await fetch(`/api/clients/${clientId}/ml-predictions`)
      if (!response.ok) {
        throw new Error('Failed to fetch ML predictions')
      }
      return response.json() as Promise<MLPredictionData>
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  })

  const handleExecuteAction = async (action: string) => {
    try {
      const response = await fetch(`/api/clients/${clientId}/execute-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (!response.ok) {
        throw new Error('Failed to execute action')
      }
      // Show success toast or refresh data
    } catch (error) {
      console.error('Error executing action:', error)
      // Show error toast
    }
  }

  const handlePresentUpsell = async (opportunity: (typeof predictions)['upsell']['opportunities'][0]) => {
    try {
      const response = await fetch(`/api/clients/${clientId}/present-opportunity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opportunityId: opportunity.id }),
      })
      if (!response.ok) {
        throw new Error('Failed to present opportunity')
      }
      // Navigate to proposal creation
    } catch (error) {
      console.error('Error presenting opportunity:', error)
      // Show error toast
    }
  }

  const handleDismissRecommendation = async (recommendationId: string) => {
    try {
      await fetch(`/api/clients/${clientId}/dismiss-recommendation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recommendationId }),
      })
      // Refresh predictions
    } catch (error) {
      console.error('Error dismissing recommendation:', error)
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (error || !predictions) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Failed to load ML predictions. Please try again later.
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue="risk" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="risk">Risk Assessment</TabsTrigger>
          <TabsTrigger value="actions">Recommended Actions</TabsTrigger>
          <TabsTrigger value="opportunities">Opportunities</TabsTrigger>
        </TabsList>

        {/* Risk Assessment Tab */}
        <TabsContent value="risk" className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold mb-4">Churn Risk Analysis</h3>
            <ChurnRiskIndicator
              probability={predictions.churn.probability}
              riskLevel={predictions.churn.riskLevel}
              confidence={predictions.churn.confidence}
              topFactors={predictions.churn.topFactors}
              showDetails={true}
            />

            {(predictions.churn.riskLevel === 'high' || predictions.churn.riskLevel === 'critical') && (
              <Alert className="mt-4">
                <AlertDescription>
                  <strong>Immediate attention required:</strong> This client has a high risk of churning.
                  Consider reaching out within the next 24-48 hours.
                </AlertDescription>
              </Alert>
            )}
          </div>
        </TabsContent>

        {/* Recommended Actions Tab */}
        <TabsContent value="actions" className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold mb-4">Recommended Next Step</h3>
            {predictions.nextAction && (
              <NextActionWidget
                action={predictions.nextAction.action}
                confidence={predictions.nextAction.confidence}
                content={predictions.nextAction.content}
                alternatives={predictions.nextAction.alternatives}
                reasoning={predictions.nextAction.reasoning}
                onExecute={() => handleExecuteAction(predictions.nextAction.action)}
                onChooseAlternative={(action) => handleExecuteAction(action)}
              />
            )}
          </div>
        </TabsContent>

        {/* Opportunities Tab */}
        <TabsContent value="opportunities" className="space-y-4">
          {predictions.upsell.opportunities && predictions.upsell.opportunities.length > 0 ? (
            <div>
              <h3 className="text-lg font-semibold mb-4">Growth Opportunities</h3>
              <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-2">
                {predictions.upsell.opportunities.map((opportunity) => (
                  <UpsellOpportunity
                    key={opportunity.id}
                    type={opportunity.type}
                    probability={opportunity.probability}
                    estimatedValue={opportunity.estimatedValue}
                    recommendedProducts={opportunity.recommendedProducts}
                    onPresent={() => handlePresentUpsell(opportunity)}
                    onDismiss={() => handleDismissRecommendation(opportunity.id)}
                  />
                ))}
              </div>
            </div>
          ) : (
            <Alert>
              <AlertDescription>
                No upsell opportunities identified at this time.
              </AlertDescription>
            </Alert>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
