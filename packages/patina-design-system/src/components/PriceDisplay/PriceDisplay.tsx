import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../utils/cn'

const priceDisplayVariants = cva('font-medium', {
  variants: {
    size: {
      sm: 'text-sm',
      md: 'text-base',
      lg: 'text-lg',
      xl: 'text-xl',
      '2xl': 'text-2xl',
    },
    variant: {
      default: 'text-foreground',
      muted: 'text-muted-foreground',
      primary: 'text-primary',
      success: 'text-green-600',
      sale: 'text-red-600',
    },
  },
  defaultVariants: {
    size: 'md',
    variant: 'default',
  },
})

export interface PriceDisplayProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof priceDisplayVariants> {
  /**
   * Price amount (in cents or smallest currency unit)
   */
  amount: number
  /**
   * Currency code (ISO 4217)
   * @default 'USD'
   */
  currency?: string
  /**
   * Locale for formatting
   * @default 'en-US'
   */
  locale?: string
  /**
   * Whether to show sale price styling
   */
  showSale?: boolean
  /**
   * Original price (for sale display)
   */
  originalPrice?: number
  /**
   * Show currency symbol
   * @default true
   */
  showCurrency?: boolean
  /**
   * Show decimal places
   * @default true
   */
  showDecimals?: boolean
}

/**
 * PriceDisplay component for formatting and displaying prices
 * Handles currency formatting, sale prices, and different display variants
 *
 * @example
 * ```tsx
 * <PriceDisplay amount={9999} /> // $99.99
 * <PriceDisplay amount={9999} currency="EUR" locale="de-DE" /> // 99,99 €
 * <PriceDisplay amount={5999} originalPrice={9999} showSale /> // $59.99 (with strikethrough $99.99)
 * ```
 */
export const PriceDisplay = React.forwardRef<HTMLSpanElement, PriceDisplayProps>(
  (
    {
      amount,
      currency = 'USD',
      locale = 'en-US',
      showSale = false,
      originalPrice,
      showCurrency = true,
      showDecimals = true,
      size,
      variant,
      className,
      ...props
    },
    ref
  ) => {
    const formatPrice = (value: number): string => {
      const actualValue = value / 100 // Convert from cents to dollars

      if (!showCurrency) {
        return showDecimals
          ? actualValue.toFixed(2)
          : Math.round(actualValue).toString()
      }

      const formatter = new Intl.NumberFormat(locale, {
        style: 'currency',
        currency,
        minimumFractionDigits: showDecimals ? 2 : 0,
        maximumFractionDigits: showDecimals ? 2 : 0,
      })

      return formatter.format(actualValue)
    }

    const displayVariant = showSale ? 'sale' : variant

    if (showSale && originalPrice && originalPrice > amount) {
      return (
        <span ref={ref} className={cn('inline-flex items-center gap-2', className)} {...props}>
          <span className={cn(priceDisplayVariants({ size, variant: displayVariant }))}>
            {formatPrice(amount)}
          </span>
          <span
            className={cn(
              priceDisplayVariants({ size, variant: 'muted' }),
              'line-through'
            )}
          >
            {formatPrice(originalPrice)}
          </span>
        </span>
      )
    }

    return (
      <span
        ref={ref}
        className={cn(priceDisplayVariants({ size, variant: displayVariant }), className)}
        {...props}
      >
        {formatPrice(amount)}
      </span>
    )
  }
)

PriceDisplay.displayName = 'PriceDisplay'

/**
 * Calculate discount percentage
 */
export const calculateDiscount = (originalPrice: number, salePrice: number): number => {
  if (originalPrice <= 0) return 0
  return Math.round(((originalPrice - salePrice) / originalPrice) * 100)
}

/**
 * Format price range
 */
export const formatPriceRange = (
  minPrice: number,
  maxPrice: number,
  currency = 'USD',
  locale = 'en-US'
): string => {
  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
  })

  const min = formatter.format(minPrice / 100)
  const max = formatter.format(maxPrice / 100)

  return `${min} - ${max}`
}
