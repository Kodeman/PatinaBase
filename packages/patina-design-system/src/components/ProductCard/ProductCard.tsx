import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../utils/cn'
import { Image } from '../Image'
import { PriceDisplay } from '../PriceDisplay'
import { Icon } from '../Icon'
import { Button } from '../Button'

const productCardVariants = cva(
  'group relative bg-card text-card-foreground rounded-lg overflow-hidden transition-all duration-200',
  {
    variants: {
      variant: {
        grid: 'flex flex-col shadow-sm hover:shadow-md',
        list: 'flex flex-row shadow-sm hover:shadow-md',
        compact: 'flex flex-col shadow-none hover:bg-accent/50',
      },
      interactive: {
        true: 'cursor-pointer',
        false: '',
      },
    },
    defaultVariants: {
      variant: 'grid',
      interactive: true,
    },
  }
)

export interface ProductBadge {
  label: string
  variant?: 'new' | 'sale' | 'featured' | 'low-stock' | 'custom'
  color?: string
}

export interface ProductCardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof productCardVariants> {
  /**
   * Product image URL
   */
  image: string
  /**
   * Product name
   */
  name: string
  /**
   * Product brand
   */
  brand?: string
  /**
   * Product price in cents
   */
  price: number
  /**
   * Original price for sale display
   */
  originalPrice?: number
  /**
   * Product currency
   */
  currency?: string
  /**
   * Product badges (new, sale, etc.)
   */
  badges?: ProductBadge[]
  /**
   * Whether product is favorited
   */
  isFavorited?: boolean
  /**
   * Callback when favorite is clicked
   */
  onFavoriteClick?: (event: React.MouseEvent) => void
  /**
   * Callback when add to proposal is clicked
   */
  onAddToProposal?: (event: React.MouseEvent) => void
  /**
   * Callback when card is clicked
   */
  onCardClick?: () => void
  /**
   * Show quick actions on hover
   */
  showQuickActions?: boolean
  /**
   * Custom quick actions
   */
  quickActions?: React.ReactNode
  /**
   * Product rating (0-5)
   */
  rating?: number
  /**
   * Number of reviews
   */
  reviewCount?: number
}

/**
 * ProductCard component for displaying products in designer portal
 * Supports grid, list, and compact variants with quick actions
 *
 * @example
 * ```tsx
 * <ProductCard
 *   image="/product.jpg"
 *   name="Modern Sofa"
 *   brand="Design Co"
 *   price={89900}
 *   originalPrice={129900}
 *   badges={[{ label: 'Sale', variant: 'sale' }]}
 *   onAddToProposal={() => {}}
 * />
 * ```
 */
export const ProductCard = React.forwardRef<HTMLDivElement, ProductCardProps>(
  (
    {
      image,
      name,
      brand,
      price,
      originalPrice,
      currency = 'USD',
      badges = [],
      isFavorited = false,
      onFavoriteClick,
      onAddToProposal,
      onCardClick,
      showQuickActions = true,
      quickActions,
      rating,
      reviewCount,
      variant,
      interactive,
      className,
      ...props
    },
    ref
  ) => {
    const badgeColors = {
      new: 'bg-blue-500 text-white',
      sale: 'bg-red-500 text-white',
      featured: 'bg-purple-500 text-white',
      'low-stock': 'bg-orange-500 text-white',
      custom: 'bg-gray-500 text-white',
    }

    const handleFavorite = (e: React.MouseEvent) => {
      e.stopPropagation()
      onFavoriteClick?.(e)
    }

    const handleAddToProposal = (e: React.MouseEvent) => {
      e.stopPropagation()
      onAddToProposal?.(e)
    }

    const isListVariant = variant === 'list'

    return (
      <div
        ref={ref}
        className={cn(productCardVariants({ variant, interactive }), className)}
        onClick={interactive ? onCardClick : undefined}
        {...props}
      >
        {/* Image Container */}
        <div className={cn('relative', isListVariant ? 'w-48 flex-shrink-0' : 'w-full')}>
          <Image
            src={image}
            alt={name}
            aspectRatio={isListVariant ? '1/1' : '4/5'}
            className="bg-muted"
          />

          {/* Badges */}
          {badges.length > 0 && (
            <div className="absolute top-2 left-2 flex flex-col gap-1">
              {badges.map((badge, index) => (
                <span
                  key={index}
                  className={cn(
                    'px-2 py-1 text-xs font-semibold rounded',
                    badge.variant ? badgeColors[badge.variant] : badgeColors.custom
                  )}
                  style={badge.color ? { backgroundColor: badge.color } : undefined}
                >
                  {badge.label}
                </span>
              ))}
            </div>
          )}

          {/* Favorite Button */}
          {onFavoriteClick && (
            <button
              onClick={handleFavorite}
              className="absolute top-2 right-2 p-2 bg-white/90 hover:bg-white rounded-full shadow-sm transition-all"
              aria-label={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
            >
              <Icon
                name="Heart"
                size={18}
                className={cn(
                  'transition-colors',
                  isFavorited ? 'fill-red-500 text-red-500' : 'text-gray-600'
                )}
              />
            </button>
          )}

          {/* Quick Actions */}
          {showQuickActions && (quickActions || onAddToProposal) && (
            <div
              className={cn(
                'absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/60 to-transparent',
                'opacity-0 group-hover:opacity-100 transition-opacity'
              )}
            >
              {quickActions || (
                <Button
                  size="sm"
                  className="w-full"
                  onClick={handleAddToProposal}
                >
                  <Icon name="Plus" size={16} className="mr-1" />
                  Add to Proposal
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Content */}
        <div className={cn('p-4 flex flex-col', isListVariant && 'flex-1')}>
          {brand && (
            <p className="text-sm text-muted-foreground mb-1 uppercase tracking-wide">
              {brand}
            </p>
          )}

          <h3 className={cn('font-semibold mb-2', isListVariant ? 'text-base' : 'text-lg')}>
            {name}
          </h3>

          {rating !== undefined && (
            <div className="flex items-center gap-1 mb-2">
              <div className="flex">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Icon
                    key={i}
                    name="Star"
                    size={14}
                    className={cn(
                      i < Math.floor(rating)
                        ? 'fill-yellow-400 text-yellow-400'
                        : 'text-gray-300'
                    )}
                  />
                ))}
              </div>
              {reviewCount !== undefined && (
                <span className="text-xs text-muted-foreground">({reviewCount})</span>
              )}
            </div>
          )}

          <div className="mt-auto">
            {originalPrice && originalPrice > price ? (
              <PriceDisplay
                amount={price}
                originalPrice={originalPrice}
                currency={currency}
                showSale
                size={isListVariant ? 'md' : 'lg'}
              />
            ) : (
              <PriceDisplay
                amount={price}
                currency={currency}
                size={isListVariant ? 'md' : 'lg'}
              />
            )}
          </div>
        </div>
      </div>
    )
  }
)

ProductCard.displayName = 'ProductCard'
