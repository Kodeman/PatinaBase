'use client';

import { Clock } from 'lucide-react';

interface LeadTimeDisplayProps {
  leadTimes: {
    quickShip?: string | null;
    madeToOrder: string;
    custom?: string | null;
  };
  onTimePercentages?: {
    quickShip?: number;
    madeToOrder?: number;
    custom?: number;
  };
  variant: 'compact' | 'detailed';
}

interface LeadTimeCardProps {
  label: string;
  time: string;
  onTimePercent?: number;
}

function LeadTimeCard({ label, time, onTimePercent }: LeadTimeCardProps) {
  const hasOnTime = typeof onTimePercent === 'number';
  const isGood = hasOnTime && onTimePercent >= 90;
  const isFair = hasOnTime && onTimePercent >= 75 && onTimePercent < 90;

  return (
    <div className="bg-patina-off-white/50 rounded-lg p-3 sm:p-4">
      <div className="flex items-center gap-2 mb-1.5">
        <Clock className="w-4 h-4 text-patina-mocha-brown" aria-hidden="true" />
        <span className="text-xs text-patina-mocha-brown font-medium">{label}</span>
      </div>
      <p className="text-sm font-medium text-patina-charcoal">{time}</p>
      {hasOnTime && (
        <div className="mt-2">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-patina-mocha-brown">On-time delivery</span>
            <span
              className={`font-medium ${
                isGood
                  ? 'text-green-600'
                  : isFair
                    ? 'text-amber-600'
                    : 'text-red-600'
              }`}
            >
              {onTimePercent}%
            </span>
          </div>
          <div className="h-1.5 bg-patina-clay-beige/30 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                isGood
                  ? 'bg-green-500'
                  : isFair
                    ? 'bg-amber-500'
                    : 'bg-red-500'
              }`}
              style={{ width: `${Math.min(100, onTimePercent)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export function LeadTimeDisplay({
  leadTimes,
  onTimePercentages,
  variant,
}: LeadTimeDisplayProps) {
  if (variant === 'compact') {
    const primary = leadTimes.quickShip || leadTimes.madeToOrder;
    const label = leadTimes.quickShip ? 'Quick Ship' : 'MTO';

    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-patina-mocha-brown">
        <Clock className="w-3.5 h-3.5" aria-hidden="true" />
        <span>
          {label}: {primary}
        </span>
      </span>
    );
  }

  // detailed variant
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {leadTimes.quickShip && (
        <LeadTimeCard
          label="Quick Ship"
          time={leadTimes.quickShip}
          onTimePercent={onTimePercentages?.quickShip}
        />
      )}
      <LeadTimeCard
        label="Made to Order"
        time={leadTimes.madeToOrder}
        onTimePercent={onTimePercentages?.madeToOrder}
      />
      {leadTimes.custom && (
        <LeadTimeCard
          label="Custom"
          time={leadTimes.custom}
          onTimePercent={onTimePercentages?.custom}
        />
      )}
    </div>
  );
}
