'use client'

import React from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
} from '@patina/design-system'

export interface HealthScoreTrendDataPoint {
  date: string
  score: number
  riskTier: 'low' | 'medium' | 'high' | 'critical'
  mlScore?: number
  churnProbability?: number
}

interface HealthScoreTrendChartProps {
  clientId: string
  period?: '7d' | '30d' | '90d'
}

/**
 * HealthScoreTrendChart displays the health score trend over time for a client
 * with risk zone indicators and ML predictions
 *
 * @example
 * ```tsx
 * <HealthScoreTrendChart clientId="client-123" period="30d" />
 * ```
 */
export const HealthScoreTrendChart: React.FC<HealthScoreTrendChartProps> = ({
  clientId,
  period = '30d',
}) => {
  const { data: trendData, isLoading } = useQuery({
    queryKey: ['health-score-trend', clientId, period],
    queryFn: async () => {
      const response = await fetch(`/api/clients/${clientId}/health-score-trend?period=${period}`)
      if (!response.ok) {
        throw new Error('Failed to fetch health score trend')
      }
      return response.json() as Promise<HealthScoreTrendDataPoint[]>
    },
    staleTime: 10 * 60 * 1000, // 10 minutes
  })

  if (isLoading) {
    return <Skeleton className="h-64 w-full" />
  }

  if (!trendData || trendData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Health Score Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-64 text-gray-500">
            No trend data available
          </div>
        </CardContent>
      </Card>
    )
  }

  // Get latest score and risk
  const latestPoint = trendData[trendData.length - 1]
  const previousPoint = trendData[trendData.length - 2] || trendData[0]
  const scoreChange = latestPoint.score - previousPoint.score

  const getRiskColor = (score: number) => {
    if (score >= 80) return 'bg-green-100 text-green-800'
    if (score >= 60) return 'bg-yellow-100 text-yellow-800'
    if (score >= 40) return 'bg-orange-100 text-orange-800'
    return 'bg-red-100 text-red-800'
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Health Score Trend</CardTitle>
          <div className="flex items-baseline gap-2">
            <span className={`text-2xl font-bold ${
              latestPoint.score >= 80 ? 'text-green-600' :
              latestPoint.score >= 60 ? 'text-yellow-600' :
              latestPoint.score >= 40 ? 'text-orange-600' :
              'text-red-600'
            }`}>
              {Math.round(latestPoint.score)}
            </span>
            <span className={scoreChange >= 0 ? 'text-green-600' : 'text-red-600'}>
              {scoreChange >= 0 ? '+' : ''}{Math.round(scoreChange)}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Simple ASCII-style chart representation since recharts might not be available */}
        <div className="space-y-4">
          {/* Score progression */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-3">Score Progression</p>
            <div className="space-y-2">
              {trendData.slice(-7).map((point, idx) => (
                <div key={idx} className="flex items-center gap-3">
                  <span className="w-12 text-sm text-gray-600">{formatDate(point.date)}</span>
                  <div className="flex-1 h-8 bg-gray-100 rounded flex items-center overflow-hidden">
                    <div
                      className={`h-full flex items-center justify-end px-2 text-xs font-semibold text-white ${
                        point.score >= 80 ? 'bg-green-500' :
                        point.score >= 60 ? 'bg-yellow-500' :
                        point.score >= 40 ? 'bg-orange-500' :
                        'bg-red-500'
                      }`}
                      style={{ width: `${point.score}%` }}
                    >
                      {Math.round(point.score)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Risk zones legend */}
          <div className="grid grid-cols-4 gap-2 pt-4 border-t">
            <div className="text-center">
              <div className="h-6 bg-green-500 rounded mb-1" />
              <p className="text-xs text-gray-600">Healthy</p>
              <p className="text-xs font-semibold text-gray-900">80+</p>
            </div>
            <div className="text-center">
              <div className="h-6 bg-yellow-500 rounded mb-1" />
              <p className="text-xs text-gray-600">Warning</p>
              <p className="text-xs font-semibold text-gray-900">60-79</p>
            </div>
            <div className="text-center">
              <div className="h-6 bg-orange-500 rounded mb-1" />
              <p className="text-xs text-gray-600">At Risk</p>
              <p className="text-xs font-semibold text-gray-900">40-59</p>
            </div>
            <div className="text-center">
              <div className="h-6 bg-red-500 rounded mb-1" />
              <p className="text-xs text-gray-600">Critical</p>
              <p className="text-xs font-semibold text-gray-900">&lt;40</p>
            </div>
          </div>

          {/* Latest metrics */}
          <div className="grid grid-cols-3 gap-4 pt-4 border-t">
            <div className="text-center">
              <p className="text-xs uppercase tracking-wide text-gray-600 mb-1">Current Score</p>
              <p className={`text-2xl font-bold rounded px-2 py-1 ${getRiskColor(latestPoint.score)}`}>
                {Math.round(latestPoint.score)}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs uppercase tracking-wide text-gray-600 mb-1">7-Day Trend</p>
              <p className={`text-2xl font-bold ${scoreChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {scoreChange >= 0 ? '↑' : '↓'} {Math.abs(Math.round(scoreChange))}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs uppercase tracking-wide text-gray-600 mb-1">Status</p>
              <p className="text-lg font-semibold text-gray-900">
                {latestPoint.riskTier.charAt(0).toUpperCase() + latestPoint.riskTier.slice(1)}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
