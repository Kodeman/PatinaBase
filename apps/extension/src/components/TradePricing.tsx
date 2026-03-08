/**
 * Trade pricing display component.
 * Shows retail price + trade price (if designer has an active trade account),
 * pending status, or "Apply for trade" CTA.
 */

import { useTradeAccount } from '../hooks/use-trade-account';
import { calculateTradePrice, formatPrice } from '../lib/trade-pricing';

interface TradePricingProps {
  retailPriceCents: number | null;
  vendorId: string | null;
  vendorName: string;
  userId: string | null;
}

export function TradePricing({
  retailPriceCents,
  vendorId,
  vendorName,
  userId,
}: TradePricingProps) {
  const { tradeAccount, isLoading } = useTradeAccount(userId, vendorId);

  // Don't show if no price or no vendor selected
  if (!retailPriceCents || !vendorId) return null;

  // Loading state
  if (isLoading) {
    return (
      <div className="p-3 bg-patina-clay-beige/10 rounded-lg border border-patina-clay-beige/30 animate-pulse">
        <div className="h-4 bg-patina-clay-beige/30 rounded w-1/3 mb-2" />
        <div className="h-3 bg-patina-clay-beige/20 rounded w-2/3" />
      </div>
    );
  }

  // No trade program for this vendor — don't show anything
  if (!tradeAccount) return null;

  // Active trade account — show both prices
  if (tradeAccount.accountStatus === 'active' && tradeAccount.discountPercent) {
    const tradePriceCents = calculateTradePrice(
      retailPriceCents,
      tradeAccount.discountPercent
    );
    const savings = retailPriceCents - tradePriceCents;

    return (
      <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200">
        <div className="flex items-baseline justify-between">
          <div>
            <span className="text-sm text-patina-mocha-brown/70 line-through">
              {formatPrice(retailPriceCents)} retail
            </span>
          </div>
          <div className="text-right">
            <span className="text-sm font-medium text-emerald-700">
              {formatPrice(tradePriceCents)}
            </span>
            <span className="text-xs text-emerald-600 ml-1">
              your price
            </span>
          </div>
        </div>
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-xs text-emerald-600">
            {tradeAccount.currentTierName}{' '}
            {tradeAccount.discountDisplay || `${tradeAccount.discountPercent}%`}
          </span>
          <span className="text-xs text-emerald-600/70">
            Save {formatPrice(savings)}
          </span>
        </div>
      </div>
    );
  }

  // Pending trade application
  if (tradeAccount.accountStatus === 'pending') {
    return (
      <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
        <div className="flex items-start gap-2">
          <svg
            className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <div>
            <p className="text-sm text-amber-800">
              {formatPrice(retailPriceCents)}{' '}
              <span className="text-amber-600">retail</span>
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              Trade application pending — typically 3-5 days
            </p>
          </div>
        </div>
      </div>
    );
  }

  // No trade account — show CTA to apply
  return (
    <div className="p-3 bg-patina-clay-beige/10 rounded-lg border border-patina-clay-beige/30">
      <p className="text-sm text-patina-mocha-brown">
        {formatPrice(retailPriceCents)}
      </p>
      <div className="flex items-center gap-1 mt-1">
        <svg
          className="w-3 h-3 text-patina-mocha-brown/50 flex-shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 7l5 5m0 0l-5 5m5-5H6"
          />
        </svg>
        {tradeAccount.applicationUrl ? (
          <a
            href={tradeAccount.applicationUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-patina-mocha-brown hover:text-patina-charcoal underline"
          >
            No trade account with {vendorName} — Apply for trade access
          </a>
        ) : tradeAccount.contactEmail ? (
          <a
            href={`mailto:${tradeAccount.contactEmail}?subject=Trade Account Application`}
            className="text-xs text-patina-mocha-brown hover:text-patina-charcoal underline"
          >
            No trade account with {vendorName} — Apply for trade access
          </a>
        ) : (
          <span className="text-xs text-patina-mocha-brown/70">
            No trade account with {vendorName}
          </span>
        )}
      </div>
    </div>
  );
}
