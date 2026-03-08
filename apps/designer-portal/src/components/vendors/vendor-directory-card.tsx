'use client';

import { Bookmark, MapPin } from 'lucide-react';
import type { VendorSummary } from '@patina/types';
import { VendorLogo } from './vendor-logo';
import { VendorRatingBadge } from './vendor-rating-badge';
import { TradeTierIndicator } from './trade-tier-indicator';
import { LeadTimeDisplay } from './lead-time-display';

interface VendorDirectoryCardProps {
  vendor: VendorSummary;
  variant: 'list' | 'card';
  onSaveToggle: () => void;
  onClick: () => void;
}

function mapAccountStatusToTierStatus(
  status: 'none' | 'pending' | 'active'
): 'none' | 'pending' | 'active' {
  return status;
}

export function VendorDirectoryCard({
  vendor,
  variant,
  onSaveToggle,
  onClick,
}: VendorDirectoryCardProps) {
  const {
    tradeName,
    logoUrl,
    primaryCategory,
    headquarters,
    designerRelationship,
    reputation,
    leadTimes,
  } = vendor;

  const tierStatus = mapAccountStatusToTierStatus(
    designerRelationship.accountStatus
  );
  const isSaved = designerRelationship.isSaved;
  const locationText = `${headquarters.city}, ${headquarters.state}`;

  const handleSaveClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSaveToggle();
  };

  // List variant: horizontal row layout
  if (variant === 'list') {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick();
          }
        }}
        className="flex items-center gap-4 p-4 rounded-2xl bg-white shadow-patina-sm hover:shadow-patina-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-patina-mocha-brown focus:ring-offset-2"
      >
        {/* Logo */}
        <VendorLogo logoUrl={logoUrl} vendorName={tradeName} size="md" />

        {/* Main Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-base font-semibold text-patina-charcoal truncate">
              {tradeName}
            </h3>
            <TradeTierIndicator
              status={tierStatus}
              tierName={designerRelationship.currentTier ?? undefined}
              variant="badge"
            />
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-patina-mocha-brown">
            <span>{primaryCategory}</span>
            <span className="inline-flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
              {locationText}
            </span>
          </div>
        </div>

        {/* Rating */}
        <div className="hidden sm:block">
          <VendorRatingBadge
            rating={reputation.overallScore}
            reviewCount={reputation.reviewCount}
            size="sm"
          />
        </div>

        {/* Lead Times */}
        <div className="hidden md:block">
          <LeadTimeDisplay
            leadTimes={{
              quickShip: leadTimes.quickShip,
              madeToOrder: leadTimes.madeToOrder ?? 'Contact for details',
            }}
            variant="compact"
          />
        </div>

        {/* Save Button */}
        <button
          type="button"
          onClick={handleSaveClick}
          className="flex-shrink-0 p-2 rounded-full hover:bg-patina-clay-beige/20 transition-colors focus:outline-none focus:ring-2 focus:ring-patina-mocha-brown"
          aria-label={isSaved ? 'Remove from saved vendors' : 'Save vendor'}
        >
          <Bookmark
            className={`w-5 h-5 ${
              isSaved
                ? 'text-patina-mocha-brown fill-patina-mocha-brown'
                : 'text-patina-mocha-brown'
            }`}
          />
        </button>
      </div>
    );
  }

  // Card variant: vertical card layout
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      className="flex flex-col rounded-2xl bg-white shadow-patina-sm hover:shadow-patina-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer overflow-hidden focus:outline-none focus:ring-2 focus:ring-patina-mocha-brown focus:ring-offset-2"
    >
      {/* Header with Logo and Save */}
      <div className="flex items-start justify-between p-4 pb-3">
        <VendorLogo logoUrl={logoUrl} vendorName={tradeName} size="lg" />
        <button
          type="button"
          onClick={handleSaveClick}
          className="flex-shrink-0 p-2 -mr-1 -mt-1 rounded-full hover:bg-patina-clay-beige/20 transition-colors focus:outline-none focus:ring-2 focus:ring-patina-mocha-brown"
          aria-label={isSaved ? 'Remove from saved vendors' : 'Save vendor'}
        >
          <Bookmark
            className={`w-5 h-5 ${
              isSaved
                ? 'text-patina-mocha-brown fill-patina-mocha-brown'
                : 'text-patina-mocha-brown'
            }`}
          />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 px-4 pb-4 space-y-3">
        {/* Name and Tier */}
        <div>
          <h3 className="text-lg font-semibold text-patina-charcoal mb-1 line-clamp-1">
            {tradeName}
          </h3>
          <TradeTierIndicator
            status={tierStatus}
            tierName={designerRelationship.currentTier ?? undefined}
            variant="badge"
          />
        </div>

        {/* Category and Location */}
        <div className="space-y-1 text-sm text-patina-mocha-brown">
          <p>{primaryCategory}</p>
          <p className="inline-flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
            {locationText}
          </p>
        </div>

        {/* Rating */}
        <VendorRatingBadge
          rating={reputation.overallScore}
          reviewCount={reputation.reviewCount}
          size="sm"
        />

        {/* Specializations */}
        {reputation.topSpecializations.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {reputation.topSpecializations.slice(0, 3).map((spec) => (
              <span
                key={spec}
                className="px-2 py-0.5 rounded-full text-xs bg-patina-clay-beige/30 text-patina-mocha-brown"
              >
                {spec}
              </span>
            ))}
          </div>
        )}

        {/* Lead Times */}
        <div className="pt-2 border-t border-patina-clay-beige/30">
          <LeadTimeDisplay
            leadTimes={{
              quickShip: leadTimes.quickShip,
              madeToOrder: leadTimes.madeToOrder ?? 'Contact for details',
            }}
            variant="compact"
          />
        </div>
      </div>
    </div>
  );
}
