'use client';

interface TierProgressBarProps {
  currentVolume: number; // In cents
  targetVolume: number; // In cents
  currentTier: string;
  nextTier: string | null;
  showAmount?: boolean;
}

function formatDollars(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function TierProgressBar({
  currentVolume,
  targetVolume,
  currentTier,
  nextTier,
  showAmount = true,
}: TierProgressBarProps) {
  // Handle top tier achieved
  if (nextTier === null) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-patina-charcoal">
            {currentTier}
          </span>
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700">
            Top Tier Achieved
          </span>
        </div>
        <div className="h-2 bg-patina-clay-beige/30 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-green-500 transition-all"
            style={{ width: '100%' }}
          />
        </div>
        {showAmount && (
          <p className="text-xs text-patina-mocha-brown">
            YTD Volume: {formatDollars(currentVolume)}
          </p>
        )}
      </div>
    );
  }

  // Calculate progress percentage (capped at 100%)
  const progress = targetVolume > 0
    ? Math.min(100, (currentVolume / targetVolume) * 100)
    : 0;
  const remaining = targetVolume - currentVolume;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-patina-charcoal">{currentTier}</span>
        <span className="text-patina-mocha-brown">{nextTier}</span>
      </div>
      <div className="h-2 bg-patina-clay-beige/30 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full bg-patina-mocha-brown transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>
      {showAmount && (
        <div className="flex items-center justify-between text-xs text-patina-mocha-brown">
          <span>{formatDollars(currentVolume)}</span>
          <span>{formatDollars(targetVolume)}</span>
        </div>
      )}
      {remaining > 0 && (
        <p className="text-xs text-patina-mocha-brown">
          {formatDollars(remaining)} more to reach {nextTier}
        </p>
      )}
    </div>
  );
}
