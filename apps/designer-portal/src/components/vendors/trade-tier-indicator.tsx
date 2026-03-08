'use client';

interface TradeTierIndicatorProps {
  status: 'none' | 'pending' | 'active';
  tierName?: string;
  discount?: string;
  variant: 'badge' | 'inline' | 'detailed';
}

const STATUS_COLORS = {
  none: {
    dot: 'bg-gray-400',
    bg: 'bg-gray-100',
    text: 'text-gray-600',
    border: 'border-gray-200',
  },
  pending: {
    dot: 'bg-amber-400',
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200',
  },
  active: {
    dot: 'bg-green-500',
    bg: 'bg-green-50',
    text: 'text-green-700',
    border: 'border-green-200',
  },
} as const;

const STATUS_LABELS = {
  none: 'No Trade Account',
  pending: 'Pending Approval',
  active: 'Active',
} as const;

export function TradeTierIndicator({
  status,
  tierName,
  discount,
  variant,
}: TradeTierIndicatorProps) {
  const colors = STATUS_COLORS[status];
  const statusLabel = STATUS_LABELS[status];

  if (variant === 'badge') {
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${colors.bg} ${colors.text}`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
        {status === 'active' && tierName ? tierName : statusLabel}
      </span>
    );
  }

  if (variant === 'inline') {
    return (
      <span className={`inline-flex items-center gap-2 text-sm ${colors.text}`}>
        <span className={`w-2 h-2 rounded-full ${colors.dot}`} />
        <span>
          {status === 'active' && tierName ? tierName : statusLabel}
          {status === 'active' && discount && (
            <span className="ml-1 font-medium">({discount} off)</span>
          )}
        </span>
      </span>
    );
  }

  // detailed variant
  return (
    <div
      className={`rounded-lg border p-3 ${colors.border} ${colors.bg} sm:p-4`}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className={`w-2.5 h-2.5 rounded-full ${colors.dot}`} />
        <span className={`text-sm font-medium ${colors.text}`}>
          {statusLabel}
        </span>
      </div>
      {status === 'active' && (
        <div className="space-y-1">
          {tierName && (
            <p className="text-sm text-patina-charcoal font-medium">{tierName}</p>
          )}
          {discount && (
            <p className="text-lg font-semibold text-patina-mocha-brown">
              {discount} <span className="text-sm font-normal">discount</span>
            </p>
          )}
        </div>
      )}
      {status === 'pending' && (
        <p className="text-xs text-amber-600">
          Your application is under review. We&apos;ll notify you once approved.
        </p>
      )}
      {status === 'none' && (
        <p className="text-xs text-gray-500">
          Apply for a trade account to access designer pricing.
        </p>
      )}
    </div>
  );
}
