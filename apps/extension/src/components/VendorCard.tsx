/**
 * Display card for matched vendor with confidence indicator
 */

import type { VendorSummaryForCapture, VendorMatchConfidence } from '@patina/shared';

interface VendorCardProps {
  vendor: VendorSummaryForCapture;
  matchConfidence: VendorMatchConfidence;
  onChangeClick: () => void;
}

const CONFIDENCE_CONFIG: Record<VendorMatchConfidence, { bgColor: string; textColor: string; label: string }> = {
  exact: {
    bgColor: 'bg-sage/15',
    textColor: 'text-sage',
    label: 'Exact match',
  },
  high: {
    bgColor: 'bg-sage/15',
    textColor: 'text-sage',
    label: 'High match',
  },
  medium: {
    bgColor: 'bg-golden-hour/15',
    textColor: 'text-aged-oak',
    label: 'Possible match',
  },
  low: {
    bgColor: 'bg-terracotta/15',
    textColor: 'text-terracotta',
    label: 'Low match',
  },
};

const MARKET_POSITION_LABELS: Record<string, string> = {
  entry: 'Entry',
  mid: 'Mid-Market',
  premium: 'Premium',
  luxury: 'Luxury',
  'ultra-luxury': 'Ultra Luxury',
};

const PRODUCTION_MODEL_LABELS: Record<string, string> = {
  stock: 'Stock',
  mto: 'Made to Order',
  custom: 'Custom',
  mixed: 'Mixed',
};

function StarRating({ rating }: { rating: number }) {
  const fullStars = Math.floor(rating);
  const hasHalfStar = rating - fullStars >= 0.5;
  const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);

  return (
    <div className="flex items-center gap-0.5">
      {[...Array(fullStars)].map((_, i) => (
        <svg key={`full-${i}`} className="w-3 h-3 text-golden-hour" fill="currentColor" viewBox="0 0 20 20">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
      {hasHalfStar && (
        <svg className="w-3 h-3 text-golden-hour" fill="currentColor" viewBox="0 0 20 20">
          <defs>
            <linearGradient id="halfStar">
              <stop offset="50%" stopColor="currentColor" />
              <stop offset="50%" stopColor="#E5E2DD" />
            </linearGradient>
          </defs>
          <path fill="url(#halfStar)" d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      )}
      {[...Array(emptyStars)].map((_, i) => (
        <svg key={`empty-${i}`} className="w-3 h-3 text-pearl" fill="currentColor" viewBox="0 0 20 20">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  );
}

export function VendorCard({ vendor, matchConfidence, onChangeClick }: VendorCardProps) {
  const confidenceConfig = CONFIDENCE_CONFIG[matchConfidence];

  return (
    <div className="p-3 bg-surface border border-pearl rounded-md shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start gap-3">
        {/* Logo / Avatar */}
        <div className="flex-shrink-0 w-8 h-8 rounded-md overflow-hidden bg-off-white flex items-center justify-center">
          {vendor.logoUrl ? (
            <img
              src={vendor.logoUrl}
              alt={`${vendor.name} logo`}
              className="w-full h-full object-cover"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
                const fallback = target.nextElementSibling as HTMLElement;
                if (fallback) fallback.style.display = 'flex';
              }}
            />
          ) : null}
          <span
            className="w-full h-full flex items-center justify-center text-charcoal font-medium text-sm"
            style={{ display: vendor.logoUrl ? 'none' : 'flex' }}
          >
            {vendor.name.charAt(0).toUpperCase()}
          </span>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="font-display font-medium text-[1rem] text-charcoal truncate">
              {vendor.name}
            </h4>
            <span className={`px-1.5 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.06em] rounded-[3px] ${confidenceConfig.bgColor} ${confidenceConfig.textColor}`}>
              {confidenceConfig.label}
            </span>
          </div>

          {/* Details row */}
          <div className="flex items-center gap-2 mt-1 font-mono text-[0.62rem] uppercase tracking-[0.04em] text-aged-oak">
            {vendor.marketPosition && (
              <span>{MARKET_POSITION_LABELS[vendor.marketPosition] || vendor.marketPosition}</span>
            )}
            {vendor.marketPosition && vendor.productionModel && (
              <span className="text-pearl">|</span>
            )}
            {vendor.productionModel && (
              <span>{PRODUCTION_MODEL_LABELS[vendor.productionModel] || vendor.productionModel}</span>
            )}
          </div>

          {/* Rating */}
          {vendor.rating && (
            <div className="flex items-center gap-1.5 mt-1">
              <StarRating rating={vendor.rating} />
              {vendor.reviewCount > 0 && (
                <span className="font-mono text-[0.55rem] text-aged-oak">
                  ({vendor.reviewCount})
                </span>
              )}
            </div>
          )}
        </div>

        {/* Change button */}
        <button
          onClick={onChangeClick}
          className="flex-shrink-0 px-2 py-1 font-mono text-[0.72rem] uppercase tracking-[0.04em] text-aged-oak hover:text-charcoal
                   transition-colors"
        >
          Change
        </button>
      </div>
    </div>
  );
}
