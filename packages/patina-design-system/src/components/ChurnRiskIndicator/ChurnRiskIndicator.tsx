'use client'

import React from 'react'
import { cn } from '../../utils/cn'
import { AlertTriangle, TrendingDown, Shield, AlertCircle } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../Tooltip'

export interface ChurnRiskIndicatorProps {
  /** Churn probability as decimal (0-1) */
  probability: number
  /** Risk level classification */
  riskLevel: 'low' | 'medium' | 'high' | 'critical'
  /** Model confidence as decimal (0-1) */
  confidence?: number
  /** Top factors contributing to churn risk */
  topFactors?: Array<{ factor: string; impact: number }>
  /** Additional CSS classes */
  className?: string
  /** Show expanded details view */
  showDetails?: boolean
}

/**
 * ChurnRiskIndicator displays customer churn probability with visual risk levels
 *
 * @example
 * ```tsx
 * <ChurnRiskIndicator
 *   probability={0.65}
 *   riskLevel="high"
 *   confidence={0.82}
 *   topFactors={[
 *     { factor: 'No recent activity', impact: 0.4 },
 *     { factor: 'High support tickets', impact: 0.3 }
 *   ]}
 *   showDetails={true}
 * />
 * ```
 */
const ChurnRiskIndicator = React.forwardRef<HTMLDivElement, ChurnRiskIndicatorProps>(
  (
    {
      probability,
      riskLevel,
      confidence = 0,
      topFactors = [],
      className,
      showDetails = false,
    },
    ref
  ) => {
    const getRiskColor = () => {
      switch (riskLevel) {
        case 'critical':
          return 'bg-red-500 text-white'
        case 'high':
          return 'bg-orange-500 text-white'
        case 'medium':
          return 'bg-yellow-500 text-white'
        case 'low':
          return 'bg-green-500 text-white'
        default:
          return 'bg-gray-500 text-white'
      }
    }

    const getRiskIcon = () => {
      switch (riskLevel) {
        case 'critical':
          return <AlertTriangle className="h-4 w-4" />
        case 'high':
          return <TrendingDown className="h-4 w-4" />
        case 'medium':
          return <AlertCircle className="h-4 w-4" />
        case 'low':
          return <Shield className="h-4 w-4" />
        default:
          return null
      }
    }

    const formatProbability = (prob: number) => `${Math.round(prob * 100)}%`

    if (!showDetails) {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                ref={ref}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium',
                  getRiskColor(),
                  className
                )}
              >
                {getRiskIcon()}
                <span>{formatProbability(probability)}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs">
              <div className="space-y-2 p-1">
                <div className="font-semibold">Churn Risk: {riskLevel.toUpperCase()}</div>
                <div className="space-y-1 text-xs">
                  <div>Probability: {formatProbability(probability)}</div>
                  {confidence > 0 && <div>Confidence: {formatProbability(confidence)}</div>}
                  {topFactors.length > 0 && (
                    <div className="border-t border-white/20 pt-1">
                      <div className="font-medium mb-1">Top Factors:</div>
                      {topFactors.slice(0, 3).map((factor, i) => (
                        <div key={i}>• {factor.factor}</div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )
    }

    return (
      <div ref={ref} className={cn('space-y-4', className)}>
        <div className="rounded-lg border bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-sm font-medium text-gray-900">Churn Risk Analysis</h4>
            <div className={cn('rounded-full px-2 py-1 text-xs font-medium', getRiskColor())}>
              {riskLevel.toUpperCase()}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Probability</span>
              <span className="text-lg font-semibold">{formatProbability(probability)}</span>
            </div>

            {confidence > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Model Confidence</span>
                <span className="text-sm font-medium">{formatProbability(confidence)}</span>
              </div>
            )}

            {topFactors.length > 0 && (
              <div>
                <div className="mb-2 text-sm text-gray-600">Risk Factors</div>
                <div className="space-y-2">
                  {topFactors.map((factor, i) => (
                    <div key={i} className="flex items-center justify-between gap-2">
                      <span className="text-xs text-gray-700">{factor.factor}</span>
                      <div className="h-2 flex-1 rounded-full bg-gray-200">
                        <div
                          className="h-2 rounded-full bg-red-500"
                          style={{ width: `${factor.impact * 100}%` }}
                        />
                      </div>
                      <span className="text-xs font-medium text-gray-600">
                        {Math.round(factor.impact * 100)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Risk zone legend */}
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
          <div className="grid grid-cols-4 gap-2 text-xs">
            <div className="flex items-center gap-1">
              <div className="h-3 w-3 rounded bg-green-500" />
              <span className="text-gray-700">Low</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="h-3 w-3 rounded bg-yellow-500" />
              <span className="text-gray-700">Medium</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="h-3 w-3 rounded bg-orange-500" />
              <span className="text-gray-700">High</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="h-3 w-3 rounded bg-red-500" />
              <span className="text-gray-700">Critical</span>
            </div>
          </div>
        </div>
      </div>
    )
  }
)

ChurnRiskIndicator.displayName = 'ChurnRiskIndicator'

export { ChurnRiskIndicator }
