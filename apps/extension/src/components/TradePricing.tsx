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
      <div className="p-3 bg-off-white rounded-md border border-pearl animate-pulse">
        <div className="h-4 bg-pearl rounded-sm w-1/3 mb-2" />
        <div className="h-3 bg-pearl/70 rounded-sm w-2/3" />
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
      <div className="p-3 bg-sage/10 rounded-md border border-sage/30">
        <div className="flex items-baseline justify-between">
          <div>
            <span className="text-[0.82rem] text-aged-oak line-through">
              {formatPrice(retailPriceCents)} retail
            </span>
          </div>
          <div className="text-right">
            <span className="text-[0.85rem] font-medium text-sage">
              {formatPrice(tradePriceCents)}
            </span>
            <span className="font-mono text-[0.62rem] uppercase tracking-[0.06em] text-sage ml-1">
              your price
            </span>
          </div>
        </div>
        <div className="flex items-center justify-between mt-1.5">
          <span className="font-mono text-[0.62rem] uppercase tracking-[0.06em] text-sage">
            {tradeAccount.currentTierName}{' '}
            {tradeAccount.discountDisplay || `${tradeAccount.discountPercent}%`}
          </span>
          <span className="font-mono text-[0.62rem] uppercase tracking-[0.06em] text-sage/70">
            Save {formatPrice(savings)}
          </span>
        </div>
      </div>
    );
  }

  // Pending trade application
  if (tradeAccount.accountStatus === 'pending') {
    return (
      <div className="p-3 bg-surface border-l-[3px] border-golden-hour rounded-md shadow-sm">
        <div className="flex items-start gap-2">
          <svg
            className="w-4 h-4 text-golden-hour mt-0.5 flex-shrink-0"
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
            <p className="text-[0.85rem] text-charcoal">
              {formatPrice(retailPriceCents)}{' '}
              <span className="text-aged-oak">retail</span>
            </p>
            <p className="text-[0.82rem] text-aged-oak mt-0.5">
              Trade application pending — typically 3-5 days
            </p>
          </div>
        </div>
      </div>
    );
  }

  // No trade account — show CTA to apply
  return (
    <div className="p-3 bg-off-white rounded-md border border-pearl">
      <p className="text-[0.85rem] text-mocha">
        {formatPrice(retailPriceCents)}
      </p>
      <div className="flex items-center gap-1 mt-1">
        <svg
          className="w-3 h-3 text-aged-oak flex-shrink-0"
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
            className="text-[0.78rem] text-clay hover:text-mocha underline"
          >
            No trade account with {vendorName} — Apply for trade access
          </a>
        ) : tradeAccount.contactEmail ? (
          <a
            href={`mailto:${tradeAccount.contactEmail}?subject=Trade Account Application`}
            className="text-[0.78rem] text-clay hover:text-mocha underline"
          >
            No trade account with {vendorName} — Apply for trade access
          </a>
        ) : (
          <span className="text-[0.78rem] text-aged-oak">
            No trade account with {vendorName}
          </span>
        )}
      </div>
    </div>
  );
}
