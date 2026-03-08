'use client';

interface ReputationBarProps {
  dimension: string; // "Quality", "Delivery", etc.
  rating: number; // 1-5
  showLabel?: boolean;
  showValue?: boolean;
}

export function ReputationBar({
  dimension,
  rating,
  showLabel = true,
  showValue = true,
}: ReputationBarProps) {
  // Clamp rating between 0 and 5
  const clampedRating = Math.min(5, Math.max(0, rating));
  const percentage = (clampedRating / 5) * 100;

  return (
    <div className="space-y-1">
      {(showLabel || showValue) && (
        <div className="flex items-center justify-between text-sm">
          {showLabel && (
            <span className="text-patina-charcoal">{dimension}</span>
          )}
          {showValue && (
            <span className="font-medium text-patina-mocha-brown">
              {clampedRating.toFixed(1)}
            </span>
          )}
        </div>
      )}
      <div className="h-2 bg-patina-clay-beige/30 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full bg-patina-mocha-brown transition-all"
          style={{ width: `${percentage}%` }}
          role="progressbar"
          aria-valuenow={clampedRating}
          aria-valuemin={0}
          aria-valuemax={5}
          aria-label={`${dimension} rating: ${clampedRating.toFixed(1)} out of 5`}
        />
      </div>
    </div>
  );
}
