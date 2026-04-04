import type { ProductTier } from '@patina/types';

interface TierBadgeProps {
  tier: ProductTier;
  className?: string;
}

const tierConfig: Record<ProductTier, { label: string; icon: string; color: string }> = {
  maker_piece: {
    label: 'Maker',
    icon: '★',
    color: 'text-[var(--color-clay)]',
  },
  designers_pick: {
    label: 'Pick',
    icon: '✓',
    color: 'text-[var(--color-sage)]',
  },
  sourced: {
    label: 'Sourced',
    icon: '○',
    color: 'text-[var(--color-dusty-blue)]',
  },
};

export function TierBadge({ tier, className = '' }: TierBadgeProps) {
  const config = tierConfig[tier];
  return (
    <span
      className={`type-meta-small inline-flex items-center gap-1 ${config.color} ${className}`}
    >
      {config.icon} {config.label}
    </span>
  );
}
