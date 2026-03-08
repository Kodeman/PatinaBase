'use client'

import React from 'react'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../Card'
import { Button } from '../Button'
import { Badge } from '../Badge'
import { TrendingUp, DollarSign, Package, Zap } from 'lucide-react'

export interface UpsellOpportunityProduct {
  /** Product identifier */
  productId: string
  /** Product name/title */
  productName: string
  /** Why this product is recommended */
  reason?: string
}

export interface UpsellOpportunityProps {
  /** Type of upsell opportunity */
  type: 'room_expansion' | 'premium_materials' | 'additional_services' | 'new_project'
  /** Probability of successful upsell as decimal (0-1) */
  probability: number
  /** Estimated value in USD */
  estimatedValue: number
  /** Recommended products for this opportunity */
  recommendedProducts?: UpsellOpportunityProduct[]
  /** Callback when user presents opportunity */
  onPresent?: () => void | Promise<void>
  /** Callback when user dismisses opportunity */
  onDismiss?: () => void | Promise<void>
  /** Additional CSS classes */
  className?: string
}

/**
 * UpsellOpportunity displays growth and upsell opportunities for clients
 *
 * @example
 * ```tsx
 * <UpsellOpportunity
 *   type="premium_materials"
 *   probability={0.75}
 *   estimatedValue={5000}
 *   recommendedProducts={[
 *     {
 *       productId: '123',
 *       productName: 'Luxury Leather Sofa',
 *       reason: 'Matches style profile'
 *     }
 *   ]}
 *   onPresent={() => console.log('Presenting...')}
 *   onDismiss={() => console.log('Dismissed')}
 * />
 * ```
 */
const UpsellOpportunity = React.forwardRef<HTMLDivElement, UpsellOpportunityProps>(
  (
    {
      type,
      probability,
      estimatedValue,
      recommendedProducts = [],
      onPresent,
      onDismiss,
      className,
    },
    ref
  ) => {
    const [isLoading, setIsLoading] = React.useState(false)

    const getTypeLabel = () => {
      const labels = {
        room_expansion: 'Room Expansion',
        premium_materials: 'Premium Materials Upgrade',
        additional_services: 'Additional Services',
        new_project: 'New Project Opportunity',
      }
      return labels[type]
    }

    const getTypeIcon = () => {
      switch (type) {
        case 'room_expansion':
          return <Package className="h-5 w-5" />
        case 'premium_materials':
          return <TrendingUp className="h-5 w-5" />
        case 'additional_services':
          return <Zap className="h-5 w-5" />
        case 'new_project':
          return <DollarSign className="h-5 w-5" />
        default:
          return <DollarSign className="h-5 w-5" />
      }
    }

    const getProbabilityColor = () => {
      if (probability >= 0.7) return 'success'
      if (probability >= 0.4) return 'warning'
      return 'info'
    }

    const handlePresent = async () => {
      try {
        setIsLoading(true)
        await onPresent?.()
      } finally {
        setIsLoading(false)
      }
    }

    const handleDismiss = async () => {
      try {
        setIsLoading(true)
        await onDismiss?.()
      } finally {
        setIsLoading(false)
      }
    }

    return (
      <Card
        ref={ref}
        className={className}
        hoverable
        clickable={false}
      >
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-blue-100 p-2 text-blue-600">
                {getTypeIcon()}
              </div>
              <div className="flex-1">
                <CardTitle className="text-base">{getTypeLabel()}</CardTitle>
                <CardDescription>
                  Estimated value: ${estimatedValue.toLocaleString()}
                </CardDescription>
              </div>
            </div>
            <Badge
              variant="subtle"
              color={getProbabilityColor()}
              size="sm"
            >
              {Math.round(probability * 100)}% likely
            </Badge>
          </div>
        </CardHeader>

        {recommendedProducts.length > 0 && (
          <CardContent>
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                Recommended Products
              </p>
              <ul className="space-y-1.5">
                {recommendedProducts.slice(0, 3).map((product) => (
                  <li key={product.productId} className="text-sm text-gray-700">
                    <div className="font-medium">{product.productName}</div>
                    {product.reason && (
                      <div className="text-xs text-gray-500">
                        {product.reason}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
              {recommendedProducts.length > 3 && (
                <p className="text-xs text-gray-500 pt-1">
                  +{recommendedProducts.length - 3} more products
                </p>
              )}
            </div>
          </CardContent>
        )}

        <CardFooter className="flex gap-2">
          <Button
            size="sm"
            onClick={handlePresent}
            disabled={isLoading}
          >
            Present to Client
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleDismiss}
            disabled={isLoading}
          >
            Not Now
          </Button>
        </CardFooter>
      </Card>
    )
  }
)

UpsellOpportunity.displayName = 'UpsellOpportunity'

export { UpsellOpportunity }
