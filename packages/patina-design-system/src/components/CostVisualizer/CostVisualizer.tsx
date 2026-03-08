import * as React from 'react'
import { motion } from 'framer-motion'
import { TrendingUp, TrendingDown, DollarSign, Calendar, PiggyBank, CreditCard } from 'lucide-react'
import { cn } from '../../utils/cn'
import { Card } from '../Card'

export interface CostBreakdownItem {
  id: string
  label: string
  amount: number
  percentage?: number
  category?: 'materials' | 'labor' | 'design' | 'shipping' | 'other'
  description?: string
}

export interface PaymentSchedule {
  id: string
  label: string
  amount: number
  dueDate: Date
  status: 'paid' | 'pending' | 'upcoming'
}

export interface CostVisualizerProps {
  totalBudget: number
  currentCost: number
  projectedCost?: number
  currency?: string
  breakdown?: CostBreakdownItem[]
  paymentSchedule?: PaymentSchedule[]
  savings?: number
  roi?: {
    percentage: number
    years: number
    description?: string
  }
  showComparison?: boolean
  className?: string
}

/**
 * CostVisualizer - Budget impact visualization component
 *
 * Displays cost breakdowns, budget status, payment schedules, and ROI
 * with clear visual indicators and animations.
 *
 * @example
 * ```tsx
 * <CostVisualizer
 *   totalBudget={50000}
 *   currentCost={42000}
 *   currency="$"
 *   breakdown={costBreakdown}
 *   paymentSchedule={schedule}
 *   savings={8000}
 * />
 * ```
 */
export const CostVisualizer = React.forwardRef<HTMLDivElement, CostVisualizerProps>(
  ({
    totalBudget,
    currentCost,
    projectedCost,
    currency = '$',
    breakdown = [],
    paymentSchedule = [],
    savings,
    roi,
    showComparison = true,
    className,
    ...props
  }, ref) => {
    const budgetUsedPercentage = (currentCost / totalBudget) * 100
    const isOverBudget = currentCost > totalBudget
    const projectedPercentage = projectedCost ? (projectedCost / totalBudget) * 100 : 0

    const getCategoryColor = (category?: string) => {
      switch (category) {
        case 'materials':
          return 'bg-blue-500'
        case 'labor':
          return 'bg-violet-500'
        case 'design':
          return 'bg-pink-500'
        case 'shipping':
          return 'bg-amber-500'
        default:
          return 'bg-gray-500'
      }
    }

    const formatCurrency = (amount: number) => {
      return `${currency}${amount.toLocaleString()}`
    }

    const getPaymentStatusColor = (status: string) => {
      switch (status) {
        case 'paid':
          return 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950'
        case 'pending':
          return 'text-amber-600 bg-amber-50 dark:bg-amber-950'
        case 'upcoming':
          return 'text-gray-600 bg-gray-50 dark:bg-gray-950'
        default:
          return 'text-gray-600 bg-gray-50'
      }
    }

    return (
      <div ref={ref} className={cn('space-y-6', className)} {...props}>
        {/* Budget Overview */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Budget Overview</h3>
            {savings !== undefined && savings > 0 && (
              <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                <PiggyBank className="h-5 w-5" />
                <span className="font-semibold">{formatCurrency(savings)} saved</span>
              </div>
            )}
          </div>

          <div className="space-y-4">
            {/* Budget Progress Bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Budget Used</span>
                <span className={cn(
                  'font-semibold',
                  isOverBudget ? 'text-red-600' : 'text-foreground'
                )}>
                  {budgetUsedPercentage.toFixed(1)}%
                </span>
              </div>

              <div className="relative h-4 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(budgetUsedPercentage, 100)}%` }}
                  transition={{ duration: 1, ease: [0.4, 0, 0.2, 1] }}
                  className={cn(
                    'h-full rounded-full',
                    isOverBudget
                      ? 'bg-gradient-to-r from-red-500 to-red-600'
                      : budgetUsedPercentage > 90
                      ? 'bg-gradient-to-r from-amber-500 to-amber-600'
                      : 'bg-gradient-to-r from-indigo-500 to-violet-500'
                  )}
                />

                {projectedCost && projectedPercentage > budgetUsedPercentage && (
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(projectedPercentage, 100)}%` }}
                    transition={{ duration: 1, delay: 0.3, ease: [0.4, 0, 0.2, 1] }}
                    className="absolute top-0 left-0 h-full bg-indigo-300 dark:bg-indigo-700 opacity-50 rounded-full"
                  />
                )}

                {/* Shimmer effect */}
                <motion.div
                  animate={{
                    x: ['-100%', '200%'],
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    repeatDelay: 1,
                  }}
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent"
                />
              </div>
            </div>

            {/* Cost Stats */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Current Cost</p>
                <p className="text-2xl font-bold">{formatCurrency(currentCost)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Total Budget</p>
                <p className="text-2xl font-bold">{formatCurrency(totalBudget)}</p>
              </div>
            </div>

            {projectedCost && showComparison && (
              <div className="pt-4 border-t">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Projected Final Cost</span>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-semibold">{formatCurrency(projectedCost)}</span>
                    {projectedCost > totalBudget ? (
                      <TrendingUp className="h-4 w-4 text-red-500" />
                    ) : (
                      <TrendingDown className="h-4 w-4 text-emerald-500" />
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Cost Breakdown */}
        {breakdown.length > 0 && (
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Cost Breakdown</h3>
            <div className="space-y-3">
              {breakdown.map((item, index) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="flex items-center gap-3"
                >
                  <div
                    className={cn(
                      'w-2 h-2 rounded-full',
                      getCategoryColor(item.category)
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium truncate">{item.label}</span>
                      <span className="text-sm font-semibold ml-2">{formatCurrency(item.amount)}</span>
                    </div>
                    {item.description && (
                      <p className="text-xs text-muted-foreground mt-1">{item.description}</p>
                    )}
                  </div>
                  {item.percentage !== undefined && (
                    <span className="text-xs text-muted-foreground">{item.percentage}%</span>
                  )}
                </motion.div>
              ))}
            </div>
          </Card>
        )}

        {/* ROI Visualization */}
        {roi && (
          <Card className="p-6 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950 dark:to-teal-950 border-emerald-200 dark:border-emerald-800">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-emerald-100 dark:bg-emerald-900 rounded-lg">
                <TrendingUp className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-emerald-900 dark:text-emerald-100 mb-1">
                  Return on Investment
                </h3>
                <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400 mb-2">
                  {roi.percentage}% ROI
                </p>
                <p className="text-sm text-emerald-700 dark:text-emerald-300">
                  Expected over {roi.years} {roi.years === 1 ? 'year' : 'years'}
                </p>
                {roi.description && (
                  <p className="text-sm text-emerald-600 dark:text-emerald-400 mt-2">
                    {roi.description}
                  </p>
                )}
              </div>
            </div>
          </Card>
        )}

        {/* Payment Schedule */}
        {paymentSchedule.length > 0 && (
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Payment Schedule
            </h3>
            <div className="space-y-3">
              {paymentSchedule.map((payment, index) => (
                <motion.div
                  key={payment.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="flex items-center justify-between p-3 rounded-lg border"
                >
                  <div className="flex items-center gap-3">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{payment.label}</p>
                      <p className="text-xs text-muted-foreground">
                        Due: {payment.dueDate.toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold">{formatCurrency(payment.amount)}</span>
                    <span className={cn(
                      'text-xs px-2 py-1 rounded-full capitalize',
                      getPaymentStatusColor(payment.status)
                    )}>
                      {payment.status}
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>
          </Card>
        )}
      </div>
    )
  }
)

CostVisualizer.displayName = 'CostVisualizer'
