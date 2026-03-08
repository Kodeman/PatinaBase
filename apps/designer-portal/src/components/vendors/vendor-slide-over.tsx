'use client';

import { Fragment, useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  X,
  Bookmark,
  BookmarkCheck,
  PenLine,
  UserPlus,
  ExternalLink,
  MapPin,
  Building2,
  Calendar,
  Package,
  Loader2,
} from 'lucide-react';
import { useVendor, useToggleVendorSave } from '@patina/supabase';
import { useVendorSlideOver, useVendorsStore } from '../../stores/vendors-store';
import { VendorLogo } from './vendor-logo';
import { VendorRatingBadge } from './vendor-rating-badge';
import { TradeTierIndicator } from './trade-tier-indicator';
import { LeadTimeDisplay } from './lead-time-display';
import { ReputationBar } from './reputation-bar';
import { CertificationBadge } from './certification-badge';
import { SpecializationBadge } from './specialization-badge';

type TabId = 'overview' | 'products' | 'story';

interface TabButtonProps {
  id: TabId;
  label: string;
  isActive: boolean;
  onClick: (id: TabId) => void;
}

function TabButton({ id, label, isActive, onClick }: TabButtonProps) {
  return (
    <button
      type="button"
      onClick={() => onClick(id)}
      className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
        isActive
          ? 'border-patina-mocha-brown text-patina-charcoal'
          : 'border-transparent text-patina-mocha-brown hover:text-patina-charcoal hover:border-patina-clay-beige'
      }`}
      role="tab"
      aria-selected={isActive}
    >
      {label}
    </button>
  );
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 text-patina-mocha-brown animate-spin" />
    </div>
  );
}

function ErrorState({ error }: { error: Error }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 px-6 text-center">
      <p className="text-patina-mocha-brown mb-2">Unable to load vendor details</p>
      <p className="text-sm text-patina-mocha-brown/70">{error.message}</p>
    </div>
  );
}

export function VendorSlideOver() {
  const slideOverVendorId = useVendorsStore((state) => state.slideOverVendorId);
  const closeSlideOver = useVendorsStore((state) => state.closeSlideOver);
  const openReviewModal = useVendorsStore((state) => state.openReviewModal);
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  const isOpen = slideOverVendorId !== null;
  const vendorId = slideOverVendorId;
  const close = closeSlideOver;

  // Only fetch vendor data when slide-over is open
  const shouldFetch = isOpen && vendorId;
  const { data: vendor, isLoading, error } = useVendor(shouldFetch ? vendorId : 'skip');
  const toggleSaveMutation = useToggleVendorSave();

  // Reset to overview tab when vendor changes
  useEffect(() => {
    if (vendorId) {
      setActiveTab('overview');
    }
  }, [vendorId]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        close();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, close]);

  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const handleSave = useCallback(() => {
    if (vendorId) {
      toggleSaveMutation.mutate({ vendorId });
    }
  }, [vendorId, toggleSaveMutation]);

  const handleWriteReview = useCallback(() => {
    if (vendorId) {
      openReviewModal(vendorId);
    }
  }, [vendorId, openReviewModal]);

  // Map certification type to badge type
  const mapCertificationType = (
    type: string
  ): 'fsc' | 'greenguard' | 'bcorp' | 'fairtrade' | 'custom' => {
    const normalized = type.toLowerCase();
    if (normalized.includes('fsc')) return 'fsc';
    if (normalized.includes('greenguard')) return 'greenguard';
    if (normalized.includes('bcorp') || normalized.includes('b corp')) return 'bcorp';
    if (normalized.includes('fairtrade') || normalized.includes('fair trade')) return 'fairtrade';
    return 'custom';
  };

  if (!isOpen) return null;

  return (
    <Fragment>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40 transition-opacity md:bg-black/20"
        onClick={close}
        aria-hidden="true"
      />

      {/* Slide-over panel */}
      <div
        className="fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-white shadow-xl flex flex-col transform transition-transform duration-300 ease-out"
        style={{ transform: isOpen ? 'translateX(0)' : 'translateX(100%)' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="slide-over-title"
      >
        {isLoading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState error={error as Error} />
        ) : vendor ? (
          <>
            {/* Header */}
            <div className="flex-shrink-0 border-b border-patina-clay-beige/30 bg-patina-off-white/50">
              <div className="flex items-start gap-4 p-4 sm:p-6">
                <VendorLogo
                  logoUrl={vendor.logo_url}
                  vendorName={vendor.trade_name ?? vendor.name}
                  size="lg"
                />
                <div className="flex-1 min-w-0">
                  <h2
                    id="slide-over-title"
                    className="text-lg font-semibold text-patina-charcoal truncate sm:text-xl"
                  >
                    {vendor.trade_name ?? vendor.name}
                  </h2>
                  <p className="text-sm text-patina-mocha-brown mt-0.5">
                    {vendor.primary_category}
                  </p>
                  <div className="flex items-center gap-3 mt-2 flex-wrap">
                    <VendorRatingBadge
                      rating={vendor.overall_rating ?? 0}
                      reviewCount={vendor.review_count ?? 0}
                      size="sm"
                    />
                    <TradeTierIndicator
                      status={vendor.designerRelationship?.accountStatus ?? 'none'}
                      tierName={vendor.designerRelationship?.currentTier ?? undefined}
                      variant="badge"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={close}
                  className="flex-shrink-0 p-2 -mr-2 -mt-1 rounded-full hover:bg-patina-clay-beige/30 transition-colors focus:outline-none focus:ring-2 focus:ring-patina-mocha-brown"
                  aria-label="Close panel"
                >
                  <X className="w-5 h-5 text-patina-charcoal" />
                </button>
              </div>

              {/* Quick Actions */}
              <div className="flex items-center gap-2 px-4 pb-4 sm:px-6">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={toggleSaveMutation.isPending}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-patina-mocha-brown focus:ring-offset-2 ${
                    vendor.designerRelationship?.isSaved
                      ? 'bg-patina-mocha-brown text-white'
                      : 'bg-patina-clay-beige/30 text-patina-charcoal hover:bg-patina-clay-beige/50'
                  }`}
                >
                  {vendor.designerRelationship?.isSaved ? (
                    <BookmarkCheck className="w-4 h-4" />
                  ) : (
                    <Bookmark className="w-4 h-4" />
                  )}
                  {vendor.designerRelationship?.isSaved ? 'Saved' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={handleWriteReview}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-patina-clay-beige/30 text-patina-charcoal hover:bg-patina-clay-beige/50 transition-colors focus:outline-none focus:ring-2 focus:ring-patina-mocha-brown focus:ring-offset-2"
                >
                  <PenLine className="w-4 h-4" />
                  Write Review
                </button>
                {vendor.designerRelationship?.accountStatus === 'none' && (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-patina-mocha-brown text-white hover:bg-patina-charcoal transition-colors focus:outline-none focus:ring-2 focus:ring-patina-mocha-brown focus:ring-offset-2"
                  >
                    <UserPlus className="w-4 h-4" />
                    Apply for Account
                  </button>
                )}
              </div>
            </div>

            {/* Key Info Cards */}
            <div className="flex-shrink-0 px-4 py-4 border-b border-patina-clay-beige/30 sm:px-6">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {/* Trade Terms Card */}
                <div className="bg-patina-off-white/50 rounded-lg p-3">
                  <h3 className="text-xs font-medium text-patina-mocha-brown mb-2">
                    Trade Terms
                  </h3>
                  <TradeTierIndicator
                    status={vendor.designerRelationship?.accountStatus ?? 'none'}
                    tierName={vendor.designerRelationship?.currentTier ?? undefined}
                    discount={
                      vendor.vendor_pricing_tiers?.[0]?.discount_display ?? undefined
                    }
                    variant="inline"
                  />
                </div>

                {/* Reputation Card */}
                <div className="bg-patina-off-white/50 rounded-lg p-3">
                  <h3 className="text-xs font-medium text-patina-mocha-brown mb-2">
                    Reputation
                  </h3>
                  <div className="space-y-1.5">
                    <ReputationBar
                      dimension="Quality"
                      rating={vendor.rating_quality ?? 0}
                      showLabel={true}
                      showValue={true}
                    />
                    <ReputationBar
                      dimension="Delivery"
                      rating={vendor.rating_delivery ?? 0}
                      showLabel={true}
                      showValue={true}
                    />
                  </div>
                </div>

                {/* Lead Times Card */}
                <div className="bg-patina-off-white/50 rounded-lg p-3">
                  <h3 className="text-xs font-medium text-patina-mocha-brown mb-2">
                    Lead Times
                  </h3>
                  <LeadTimeDisplay
                    leadTimes={{
                      quickShip: vendor.lead_time_quick_ship,
                      madeToOrder: vendor.lead_time_mto ?? 'Contact for details',
                    }}
                    variant="compact"
                  />
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex-shrink-0 border-b border-patina-clay-beige/30">
              <nav className="flex px-4 sm:px-6" role="tablist">
                <TabButton
                  id="overview"
                  label="Overview"
                  isActive={activeTab === 'overview'}
                  onClick={setActiveTab}
                />
                <TabButton
                  id="products"
                  label={`Products (${vendor.productCount ?? 0})`}
                  isActive={activeTab === 'products'}
                  onClick={setActiveTab}
                />
                <TabButton
                  id="story"
                  label="Story"
                  isActive={activeTab === 'story'}
                  onClick={setActiveTab}
                />
              </nav>
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto">
              {activeTab === 'overview' && (
                <div className="p-4 space-y-6 sm:p-6">
                  {/* About */}
                  <section>
                    <h3 className="text-sm font-semibold text-patina-charcoal mb-3">
                      About
                    </h3>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      {vendor.headquarters_city && vendor.headquarters_state && (
                        <div className="flex items-start gap-2">
                          <MapPin className="w-4 h-4 text-patina-mocha-brown flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="text-patina-charcoal">
                              {vendor.headquarters_city}, {vendor.headquarters_state}
                            </p>
                            <p className="text-xs text-patina-mocha-brown">Headquarters</p>
                          </div>
                        </div>
                      )}
                      {vendor.founded_year && (
                        <div className="flex items-start gap-2">
                          <Calendar className="w-4 h-4 text-patina-mocha-brown flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="text-patina-charcoal">Est. {vendor.founded_year}</p>
                            <p className="text-xs text-patina-mocha-brown">Founded</p>
                          </div>
                        </div>
                      )}
                      {vendor.production_model && (
                        <div className="flex items-start gap-2">
                          <Building2 className="w-4 h-4 text-patina-mocha-brown flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="text-patina-charcoal capitalize">
                              {vendor.production_model.replace(/-/g, ' ')}
                            </p>
                            <p className="text-xs text-patina-mocha-brown">Production</p>
                          </div>
                        </div>
                      )}
                      {vendor.productCount !== undefined && (
                        <div className="flex items-start gap-2">
                          <Package className="w-4 h-4 text-patina-mocha-brown flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="text-patina-charcoal">
                              {vendor.productCount.toLocaleString()}
                            </p>
                            <p className="text-xs text-patina-mocha-brown">Products</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </section>

                  {/* Certifications */}
                  {vendor.vendor_certifications?.length > 0 && (
                    <section>
                      <h3 className="text-sm font-semibold text-patina-charcoal mb-3">
                        Certifications
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {vendor.vendor_certifications.map(
                          (vc: { certification: { id: string; certification_type: string; level?: string; is_verified: boolean } }) => (
                            <CertificationBadge
                              key={vc.certification.id}
                              certification={mapCertificationType(
                                vc.certification.certification_type
                              )}
                              level={vc.certification.level ?? undefined}
                              isVerified={vc.certification.is_verified}
                              size="sm"
                            />
                          )
                        )}
                      </div>
                    </section>
                  )}

                  {/* Specializations */}
                  {vendor.vendor_specializations?.length > 0 && (
                    <section>
                      <h3 className="text-sm font-semibold text-patina-charcoal mb-3">
                        Specializations
                      </h3>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {vendor.vendor_specializations.slice(0, 6).map(
                          (spec: { id: string; category: string; rating: number; vote_count: number }) => (
                            <SpecializationBadge
                              key={spec.id}
                              name={spec.category}
                              rating={spec.rating}
                              voteCount={spec.vote_count}
                              isConfirmedByUser={false}
                            />
                          )
                        )}
                      </div>
                    </section>
                  )}

                  {/* Full Reputation */}
                  <section>
                    <h3 className="text-sm font-semibold text-patina-charcoal mb-3">
                      Reputation Scores
                    </h3>
                    <div className="space-y-3">
                      <ReputationBar
                        dimension="Quality"
                        rating={vendor.rating_quality ?? 0}
                      />
                      <ReputationBar
                        dimension="Finish"
                        rating={vendor.rating_finish ?? 0}
                      />
                      <ReputationBar
                        dimension="Delivery"
                        rating={vendor.rating_delivery ?? 0}
                      />
                      <ReputationBar
                        dimension="Service"
                        rating={vendor.rating_service ?? 0}
                      />
                      <ReputationBar
                        dimension="Value"
                        rating={vendor.rating_value ?? 0}
                      />
                    </div>
                  </section>

                  {/* Lead Times Detailed */}
                  <section>
                    <h3 className="text-sm font-semibold text-patina-charcoal mb-3">
                      Lead Time Details
                    </h3>
                    <LeadTimeDisplay
                      leadTimes={{
                        quickShip: vendor.lead_time_quick_ship,
                        madeToOrder: vendor.lead_time_mto ?? 'Contact for details',
                        custom: vendor.lead_time_custom,
                      }}
                      onTimePercentages={{
                        quickShip: vendor.on_time_quick_ship,
                        madeToOrder: vendor.on_time_mto,
                        custom: vendor.on_time_custom,
                      }}
                      variant="detailed"
                    />
                  </section>
                </div>
              )}

              {activeTab === 'products' && (
                <div className="p-4 sm:p-6">
                  {vendor.featuredProducts?.length > 0 ? (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {vendor.featuredProducts.map(
                        (product: { id: string; name: string; images?: string[]; price_retail?: number; price_trade?: number }) => (
                          <Link
                            key={product.id}
                            href={`/catalog/${product.id}`}
                            className="group block rounded-lg border border-patina-clay-beige/30 overflow-hidden hover:border-patina-mocha-brown/50 hover:shadow-sm transition-all"
                          >
                            <div className="aspect-square bg-patina-clay-beige/10 relative">
                              {product.images?.[0] ? (
                                <Image
                                  src={product.images[0]}
                                  alt={product.name}
                                  fill
                                  className="object-cover"
                                  sizes="(max-width: 640px) 50vw, 33vw"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-patina-mocha-brown/30">
                                  <Package className="w-8 h-8" />
                                </div>
                              )}
                            </div>
                            <div className="p-2">
                              <p className="text-sm font-medium text-patina-charcoal line-clamp-1 group-hover:text-patina-mocha-brown transition-colors">
                                {product.name}
                              </p>
                              {product.price_trade && (
                                <p className="text-xs text-patina-mocha-brown mt-0.5">
                                  ${(product.price_trade / 100).toLocaleString()}
                                </p>
                              )}
                            </div>
                          </Link>
                        )
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <Package className="w-12 h-12 text-patina-clay-beige mx-auto mb-3" />
                      <p className="text-sm text-patina-mocha-brown">
                        No featured products available
                      </p>
                    </div>
                  )}
                  {vendor.productCount > 6 && (
                    <div className="mt-4 text-center">
                      <Link
                        href={`/vendors/${vendor.id}/products`}
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-patina-mocha-brown hover:text-patina-charcoal transition-colors"
                      >
                        View all {vendor.productCount} products
                        <ExternalLink className="w-4 h-4" />
                      </Link>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'story' && (
                <div className="p-4 space-y-6 sm:p-6">
                  {/* Hero Image */}
                  {vendor.vendor_story?.hero_image_url && (
                    <div className="aspect-video rounded-lg overflow-hidden bg-patina-clay-beige/20 relative">
                      <Image
                        src={vendor.vendor_story.hero_image_url}
                        alt={`${vendor.trade_name ?? vendor.name} story`}
                        fill
                        className="object-cover"
                        sizes="(max-width: 640px) 100vw, 480px"
                      />
                    </div>
                  )}

                  {/* Narrative */}
                  {vendor.vendor_story?.narrative && (
                    <section>
                      <h3 className="text-sm font-semibold text-patina-charcoal mb-2">
                        Our Story
                      </h3>
                      <p className="text-sm text-patina-mocha-brown leading-relaxed">
                        {vendor.vendor_story.narrative}
                      </p>
                    </section>
                  )}

                  {/* Timeline */}
                  {vendor.vendor_timeline_events?.length > 0 && (
                    <section>
                      <h3 className="text-sm font-semibold text-patina-charcoal mb-3">
                        Timeline
                      </h3>
                      <div className="space-y-3">
                        {vendor.vendor_timeline_events.map(
                          (event: { year: number; title: string; description?: string }, index: number) => (
                            <div key={index} className="flex gap-3">
                              <div className="flex-shrink-0 w-12 text-sm font-medium text-patina-mocha-brown">
                                {event.year}
                              </div>
                              <div className="flex-1">
                                <p className="text-sm font-medium text-patina-charcoal">
                                  {event.title}
                                </p>
                                {event.description && (
                                  <p className="text-xs text-patina-mocha-brown mt-0.5">
                                    {event.description}
                                  </p>
                                )}
                              </div>
                            </div>
                          )
                        )}
                      </div>
                    </section>
                  )}

                  {/* Maker Spotlights */}
                  {vendor.vendor_maker_spotlights?.length > 0 && (
                    <section>
                      <h3 className="text-sm font-semibold text-patina-charcoal mb-3">
                        Meet the Makers
                      </h3>
                      <div className="grid gap-3 grid-cols-2">
                        {vendor.vendor_maker_spotlights.map(
                          (maker: { name: string; role: string; image_url?: string; bio?: string }, index: number) => (
                            <div
                              key={index}
                              className="bg-patina-off-white/50 rounded-lg p-3"
                            >
                              {maker.image_url && (
                                <div className="w-12 h-12 rounded-full overflow-hidden bg-patina-clay-beige/30 mb-2 relative">
                                  <Image
                                    src={maker.image_url}
                                    alt={maker.name}
                                    fill
                                    className="object-cover"
                                    sizes="48px"
                                  />
                                </div>
                              )}
                              <p className="text-sm font-medium text-patina-charcoal">
                                {maker.name}
                              </p>
                              <p className="text-xs text-patina-mocha-brown">
                                {maker.role}
                              </p>
                              {maker.bio && (
                                <p className="text-xs text-patina-mocha-brown/80 mt-1 line-clamp-2">
                                  {maker.bio}
                                </p>
                              )}
                            </div>
                          )
                        )}
                      </div>
                    </section>
                  )}

                  {/* Process Gallery */}
                  {vendor.vendor_process_gallery?.length > 0 && (
                    <section>
                      <h3 className="text-sm font-semibold text-patina-charcoal mb-3">
                        Our Process
                      </h3>
                      <div className="grid grid-cols-2 gap-2">
                        {vendor.vendor_process_gallery.map(
                          (item: { image_url: string; caption?: string }, index: number) => (
                            <div
                              key={index}
                              className="aspect-square rounded-lg overflow-hidden bg-patina-clay-beige/20 relative"
                            >
                              <Image
                                src={item.image_url}
                                alt={item.caption ?? `Process image ${index + 1}`}
                                fill
                                className="object-cover"
                                sizes="(max-width: 640px) 50vw, 200px"
                              />
                              {item.caption && (
                                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                                  <p className="text-xs text-white line-clamp-1">
                                    {item.caption}
                                  </p>
                                </div>
                              )}
                            </div>
                          )
                        )}
                      </div>
                    </section>
                  )}

                  {/* Empty State */}
                  {!vendor.vendor_story?.narrative &&
                    !vendor.vendor_timeline_events?.length &&
                    !vendor.vendor_maker_spotlights?.length && (
                      <div className="text-center py-8">
                        <Building2 className="w-12 h-12 text-patina-clay-beige mx-auto mb-3" />
                        <p className="text-sm text-patina-mocha-brown">
                          No story content available yet
                        </p>
                      </div>
                    )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex-shrink-0 border-t border-patina-clay-beige/30 p-4 bg-patina-off-white/30 sm:p-6">
              <Link
                href={`/vendors/${vendor.id}`}
                className="flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-lg bg-patina-charcoal text-white font-medium hover:bg-patina-mocha-brown transition-colors focus:outline-none focus:ring-2 focus:ring-patina-mocha-brown focus:ring-offset-2"
              >
                View Full Profile
                <ExternalLink className="w-4 h-4" />
              </Link>
            </div>
          </>
        ) : null}
      </div>
    </Fragment>
  );
}
