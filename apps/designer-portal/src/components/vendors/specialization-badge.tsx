'use client';

import { Star, CheckCircle, Users } from 'lucide-react';

interface SpecializationBadgeProps {
  name: string;
  rating: number;
  voteCount: number;
  isConfirmedByUser: boolean;
  onVote?: () => void;
}

export function SpecializationBadge({
  name,
  rating,
  voteCount,
  isConfirmedByUser,
  onVote,
}: SpecializationBadgeProps) {
  const clampedRating = Math.min(5, Math.max(0, rating));
  const isClickable = typeof onVote === 'function';

  const content = (
    <>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-patina-charcoal">{name}</span>
        {isConfirmedByUser && (
          <CheckCircle
            className="w-4 h-4 text-green-600"
            aria-label="You confirmed this specialization"
          />
        )}
      </div>
      <div className="flex items-center gap-1 mb-2">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`w-3.5 h-3.5 ${
              star <= Math.round(clampedRating)
                ? 'text-amber-400 fill-amber-400'
                : 'text-patina-clay-beige'
            }`}
            aria-hidden="true"
          />
        ))}
        <span className="ml-1 text-xs font-medium text-patina-mocha-brown">
          {clampedRating.toFixed(1)}
        </span>
      </div>
      <div className="flex items-center gap-1 text-xs text-patina-mocha-brown">
        <Users className="w-3 h-3" aria-hidden="true" />
        <span>
          {voteCount.toLocaleString()} {voteCount === 1 ? 'vote' : 'votes'}
        </span>
      </div>
    </>
  );

  const baseStyles =
    'block rounded-lg border border-patina-clay-beige/50 bg-patina-off-white/50 p-3';

  if (isClickable) {
    return (
      <button
        type="button"
        onClick={onVote}
        className={`${baseStyles} text-left hover:border-patina-mocha-brown hover:bg-patina-clay-beige/10 transition-colors focus:outline-none focus:ring-2 focus:ring-patina-mocha-brown focus:ring-offset-2`}
      >
        {content}
      </button>
    );
  }

  return <div className={baseStyles}>{content}</div>;
}
