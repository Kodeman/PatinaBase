'use client';

import { Star } from 'lucide-react';

interface VendorRatingBadgeProps {
  rating: number;
  reviewCount: number;
  size?: 'sm' | 'md';
  showCount?: boolean;
}

const SIZE_STYLES = {
  sm: {
    container: 'gap-1',
    star: 'w-3 h-3',
    rating: 'text-xs',
    count: 'text-xs',
  },
  md: {
    container: 'gap-1.5',
    star: 'w-4 h-4',
    rating: 'text-sm',
    count: 'text-sm',
  },
} as const;

export function VendorRatingBadge({
  rating,
  reviewCount,
  size = 'md',
  showCount = true,
}: VendorRatingBadgeProps) {
  const styles = SIZE_STYLES[size];
  const clampedRating = Math.min(5, Math.max(0, rating));
  const displayRating = clampedRating.toFixed(1);

  return (
    <div className={`inline-flex items-center ${styles.container}`}>
      <Star
        className={`${styles.star} text-amber-400 fill-amber-400`}
        aria-hidden="true"
      />
      <span className={`${styles.rating} font-medium text-patina-charcoal`}>
        {displayRating}
      </span>
      {showCount && (
        <span className={`${styles.count} text-patina-mocha-brown`}>
          ({reviewCount.toLocaleString()})
        </span>
      )}
    </div>
  );
}
