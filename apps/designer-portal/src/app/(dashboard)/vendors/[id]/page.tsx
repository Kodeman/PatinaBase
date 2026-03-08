'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowLeft,
  Bookmark,
  MapPin,
  Calendar,
  Building2,
  Clock,
  Award,
  Star,
  ChevronLeft,
  ChevronRight,
  PenLine,
  ExternalLink,
  Users,
  CheckCircle,
} from 'lucide-react';
import {
  useVendor,
  useVendorProducts,
  useVendorReviews,
  useToggleVendorSave,
} from '@patina/supabase';
import type { MarketPosition, AccountStatus } from '@patina/types';
import {
  VendorLogo,
  VendorRatingBadge,
  TradeTierIndicator,
  LeadTimeDisplay,
  CertificationBadge,
  ReputationBar,
  SpecializationBadge,
  TierProgressBar,
  ReviewModal,
} from '@/components/vendors';

// ============================================================================
// TYPE DEFINITIONS - Database row types (snake_case)
// ============================================================================

type TabKey = 'overview' | 'products' | 'story' | 'reviews';

interface TabButtonProps {
  tabKey: TabKey;
  label: string;
  activeTab: TabKey;
  onClick: (tab: TabKey) => void;
}

// Database row types (snake_case from Supabase)
interface DbPricingTier {
  id: string;
  tier_name: string;
  tier_order: number;
  discount_percent: number;
  discount_display: string;
  minimum_volume: number | null;
}

interface DbSpecialization {
  id: string;
  category: string;
  rating: number;
  vote_count: number;
}

interface DbCertification {
  id: string;
  certification_type: string;
  level: string | null;
  is_verified: boolean;
}

interface DbCertificationWrapper {
  certification: DbCertification;
}

interface DbTimelineEvent {
  year: number;
  title: string;
  description: string | null;
}

interface DbMakerSpotlight {
  name: string;
  role: string;
  image_url: string | null;
  bio: string | null;
}

interface DbVendorStory {
  narrative: string | null;
  hero_image_url: string | null;
}

interface DbDesigner {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface DbReview {
  id: string;
  overall_rating: number;
  rating_quality: number;
  rating_finish: number;
  rating_delivery: number;
  rating_service: number;
  rating_value: number;
  written_review: string | null;
  lead_time_accuracy: string | null;
  lead_time_weeks_over: number | null;
  vendor_response: string | null;
  created_at: string;
  designer: DbDesigner | null;
}

interface DbProduct {
  id: string;
  name: string;
  images: string[];
  price_retail: number | null;
}

// ============================================================================
// MARKET POSITION BADGE
// ============================================================================

const MARKET_POSITION_STYLES: Record<MarketPosition, { bg: string; text: string }> = {
  entry: { bg: 'bg-gray-100', text: 'text-gray-700' },
  mid: { bg: 'bg-blue-100', text: 'text-blue-700' },
  premium: { bg: 'bg-purple-100', text: 'text-purple-700' },
  luxury: { bg: 'bg-amber-100', text: 'text-amber-700' },
  'ultra-luxury': { bg: 'bg-rose-100', text: 'text-rose-700' },
};

const MARKET_POSITION_LABELS: Record<MarketPosition, string> = {
  entry: 'Entry',
  mid: 'Mid-Market',
  premium: 'Premium',
  luxury: 'Luxury',
  'ultra-luxury': 'Ultra-Luxury',
};

function MarketPositionBadge({ position }: { position: MarketPosition }) {
  const styles = MARKET_POSITION_STYLES[position] || MARKET_POSITION_STYLES.mid;
  const label = MARKET_POSITION_LABELS[position] || position;

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles.bg} ${styles.text}`}
    >
      {label}
    </span>
  );
}

// ============================================================================
// TAB BUTTON COMPONENT
// ============================================================================

function TabButton({ tabKey, label, activeTab, onClick }: TabButtonProps) {
  const isActive = activeTab === tabKey;
  return (
    <button
      type="button"
      onClick={() => onClick(tabKey)}
      className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
        isActive
          ? 'border-patina-mocha-brown text-patina-charcoal'
          : 'border-transparent text-patina-mocha-brown hover:text-patina-charcoal hover:border-patina-clay-beige'
      }`}
      aria-selected={isActive}
      role="tab"
    >
      {label}
    </button>
  );
}

// ============================================================================
// SKELETON COMPONENTS
// ============================================================================

function HeaderSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="flex items-start gap-6">
        <div className="w-24 h-24 bg-patina-clay-beige/30 rounded-lg" />
        <div className="flex-1 space-y-3">
          <div className="h-8 bg-patina-clay-beige/30 rounded w-1/3" />
          <div className="h-4 bg-patina-clay-beige/30 rounded w-1/4" />
          <div className="flex items-center gap-4">
            <div className="h-6 bg-patina-clay-beige/30 rounded w-20" />
            <div className="h-6 bg-patina-clay-beige/30 rounded w-32" />
          </div>
        </div>
      </div>
    </div>
  );
}

function ContentSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg border border-patina-clay-beige/30 p-6">
          <div className="h-5 bg-patina-clay-beige/30 rounded w-1/3 mb-4" />
          <div className="space-y-3">
            <div className="h-4 bg-patina-clay-beige/30 rounded w-full" />
            <div className="h-4 bg-patina-clay-beige/30 rounded w-full" />
            <div className="h-4 bg-patina-clay-beige/30 rounded w-3/4" />
          </div>
        </div>
        <div className="bg-white rounded-lg border border-patina-clay-beige/30 p-6">
          <div className="h-5 bg-patina-clay-beige/30 rounded w-1/3 mb-4" />
          <div className="space-y-3">
            <div className="h-4 bg-patina-clay-beige/30 rounded w-full" />
            <div className="h-4 bg-patina-clay-beige/30 rounded w-full" />
            <div className="h-4 bg-patina-clay-beige/30 rounded w-3/4" />
          </div>
        </div>
      </div>
    </div>
  );
}

function ProductCardSkeleton() {
  return (
    <div className="animate-pulse bg-white rounded-lg overflow-hidden border border-patina-clay-beige/30">
      <div className="aspect-square bg-patina-clay-beige/30" />
      <div className="p-4 space-y-2">
        <div className="h-4 bg-patina-clay-beige/30 rounded w-3/4" />
        <div className="h-4 bg-patina-clay-beige/30 rounded w-1/2" />
      </div>
    </div>
  );
}

function ReviewCardSkeleton() {
  return (
    <div className="animate-pulse bg-white rounded-lg border border-patina-clay-beige/30 p-6">
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 bg-patina-clay-beige/30 rounded-full" />
        <div className="flex-1 space-y-3">
          <div className="h-4 bg-patina-clay-beige/30 rounded w-1/4" />
          <div className="h-4 bg-patina-clay-beige/30 rounded w-full" />
          <div className="h-4 bg-patina-clay-beige/30 rounded w-full" />
          <div className="h-4 bg-patina-clay-beige/30 rounded w-2/3" />
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// PAGINATION COMPONENT
// ============================================================================

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

function Pagination({ currentPage, totalPages, total, pageSize, onPageChange }: PaginationProps) {
  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, total);
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between gap-4 pt-6 border-t border-patina-clay-beige/30">
      <p className="text-sm text-patina-mocha-brown">Showing {startItem}-{endItem} of {total}</p>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => onPageChange(currentPage - 1)} disabled={currentPage === 1} className="p-2 rounded-lg border border-patina-clay-beige/30 hover:border-patina-mocha-brown hover:bg-patina-off-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed" aria-label="Previous page">
          <ChevronLeft className="w-4 h-4 text-patina-mocha-brown" />
        </button>
        <span className="text-sm text-patina-mocha-brown px-2">Page {currentPage} of {totalPages}</span>
        <button type="button" onClick={() => onPageChange(currentPage + 1)} disabled={currentPage === totalPages} className="p-2 rounded-lg border border-patina-clay-beige/30 hover:border-patina-mocha-brown hover:bg-patina-off-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed" aria-label="Next page">
          <ChevronRight className="w-4 h-4 text-patina-mocha-brown" />
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// OVERVIEW TAB CONTENT
// ============================================================================

interface DesignerRelationship {
  accountStatus: AccountStatus;
  currentTier: string | null;
  currentVolume: number;
  nextTierName: string | null;
  nextTierVolume: number | null;
  isSaved: boolean;
}

interface OverviewTabProps {
  vendor: Record<string, unknown>;
  designerRelationship: DesignerRelationship | null;
}

function OverviewTab({ vendor, designerRelationship }: OverviewTabProps) {
  const pricingTiers = (vendor.vendor_pricing_tiers as DbPricingTier[] | undefined) || [];
  const specializations = (vendor.vendor_specializations as DbSpecialization[] | undefined) || [];
  const certifications = (vendor.vendor_certifications as DbCertificationWrapper[] | undefined) || [];

  const hasActiveAccount = designerRelationship?.accountStatus === 'active';
  const hasTierProgress = hasActiveAccount && designerRelationship?.currentTier && designerRelationship?.nextTierVolume;

  const dimensions = {
    quality: (vendor.rating_quality as number) || 0,
    finish: (vendor.rating_finish as number) || 0,
    delivery: (vendor.rating_delivery as number) || 0,
    service: (vendor.rating_service as number) || 0,
    value: (vendor.rating_value as number) || 0,
  };

  const leadTimes = {
    quickShip: vendor.lead_time_quick_ship as string | null,
    madeToOrder: (vendor.lead_time_mto as string) || 'Contact for details',
    custom: vendor.lead_time_custom as string | null,
  };

  const onTimePercentages = {
    quickShip: vendor.on_time_quick_ship as number | undefined,
    madeToOrder: vendor.on_time_mto as number | undefined,
    custom: vendor.on_time_custom as number | undefined,
  };

  return (
    <div className="space-y-8">
      {pricingTiers.length > 0 && (
        <div className="bg-white rounded-lg border border-patina-clay-beige/30 p-6">
          <h3 className="text-lg font-semibold text-patina-charcoal mb-4 flex items-center gap-2">
            <Award className="w-5 h-5 text-patina-mocha-brown" />
            Trade Terms
          </h3>
          {hasTierProgress && (
            <div className="mb-6 p-4 rounded-lg bg-patina-off-white/50 border border-patina-clay-beige/20">
              <h4 className="text-sm font-medium text-patina-charcoal mb-3">Your Tier Progress</h4>
              <TierProgressBar
                currentVolume={designerRelationship.currentVolume}
                targetVolume={designerRelationship.nextTierVolume!}
                currentTier={designerRelationship.currentTier!}
                nextTier={designerRelationship.nextTierName}
                showAmount={true}
              />
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[...pricingTiers].sort((a, b) => (a.tier_order ?? 0) - (b.tier_order ?? 0)).map((tier) => (
              <div key={tier.id} className="p-4 rounded-lg bg-patina-off-white/50 border border-patina-clay-beige/20">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-patina-charcoal">{tier.tier_name}</span>
                  <span className="text-sm font-semibold text-green-600">{tier.discount_display}</span>
                </div>
                {tier.minimum_volume && (
                  <p className="text-xs text-patina-mocha-brown">Min. ${(tier.minimum_volume / 100).toLocaleString()} annual volume</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg border border-patina-clay-beige/30 p-6">
        <h3 className="text-lg font-semibold text-patina-charcoal mb-4 flex items-center gap-2">
          <Star className="w-5 h-5 text-amber-400" />
          Reputation
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <ReputationBar dimension="Quality" rating={dimensions.quality} />
          <ReputationBar dimension="Finish" rating={dimensions.finish} />
          <ReputationBar dimension="Delivery" rating={dimensions.delivery} />
          <ReputationBar dimension="Service" rating={dimensions.service} />
          <ReputationBar dimension="Value" rating={dimensions.value} />
        </div>
      </div>

      {specializations.length > 0 && (
        <div className="bg-white rounded-lg border border-patina-clay-beige/30 p-6">
          <h3 className="text-lg font-semibold text-patina-charcoal mb-4">Specializations</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {specializations.map((spec) => (
              <SpecializationBadge key={spec.id} name={spec.category} rating={spec.rating} voteCount={spec.vote_count} isConfirmedByUser={false} />
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg border border-patina-clay-beige/30 p-6">
        <h3 className="text-lg font-semibold text-patina-charcoal mb-4 flex items-center gap-2">
          <Clock className="w-5 h-5 text-patina-mocha-brown" />
          Lead Times
        </h3>
        <LeadTimeDisplay leadTimes={leadTimes} onTimePercentages={onTimePercentages} variant="detailed" />
      </div>

      {certifications.length > 0 && (
        <div className="bg-white rounded-lg border border-patina-clay-beige/30 p-6">
          <h3 className="text-lg font-semibold text-patina-charcoal mb-4 flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-600" />
            Certifications
          </h3>
          <div className="flex flex-wrap gap-2">
            {certifications.map((item) => {
              const cert = item.certification;
              const certType = cert.certification_type?.toLowerCase() || 'custom';
              const mappedType = ['fsc', 'greenguard', 'bcorp', 'fairtrade'].includes(certType)
                ? (certType as 'fsc' | 'greenguard' | 'bcorp' | 'fairtrade')
                : 'custom';
              return (
                <CertificationBadge key={cert.id} certification={mappedType} level={cert.level ?? undefined} isVerified={cert.is_verified} size="md" />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// PRODUCTS TAB CONTENT
// ============================================================================

function ProductsTab({ vendorId }: { vendorId: string }) {
  const [page, setPage] = useState(1);
  const pageSize = 12;
  const { data, isLoading } = useVendorProducts(vendorId, {}, { page, pageSize });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (<ProductCardSkeleton key={i} />))}
      </div>
    );
  }

  const products = (data?.data || []) as DbProduct[];

  if (products.length === 0) {
    return (
      <div className="text-center py-12 bg-white rounded-lg border border-patina-clay-beige/30">
        <Building2 className="w-12 h-12 mx-auto text-patina-clay-beige mb-4" />
        <h3 className="text-lg font-medium text-patina-charcoal mb-2">No products available</h3>
        <p className="text-patina-mocha-brown">Products from this vendor will appear here once added.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {products.map((product) => {
          const images = product.images || [];
          const primaryImage = images[0];
          const priceRetail = product.price_retail;
          const formattedPrice = priceRetail ? `$${(priceRetail / 100).toLocaleString()}` : null;

          return (
            <Link key={product.id} href={`/products/${product.id}`} className="group bg-white rounded-lg overflow-hidden border border-patina-clay-beige/30 hover:border-patina-mocha-brown/50 hover:shadow-md transition-all">
              <div className="aspect-square relative bg-patina-off-white">
                {primaryImage ? (
                  <Image src={primaryImage} alt={product.name} fill className="object-cover group-hover:scale-105 transition-transform duration-300" sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-patina-clay-beige">
                    <Building2 className="w-12 h-12" />
                  </div>
                )}
              </div>
              <div className="p-4">
                <h4 className="font-medium text-patina-charcoal line-clamp-2 group-hover:text-patina-mocha-brown transition-colors">{product.name}</h4>
                {formattedPrice && <p className="mt-1 text-lg font-medium text-patina-charcoal">{formattedPrice}</p>}
              </div>
            </Link>
          );
        })}
      </div>
      {data?.pagination && (
        <Pagination currentPage={data.pagination.page} totalPages={data.pagination.totalPages} total={data.pagination.total} pageSize={data.pagination.pageSize} onPageChange={setPage} />
      )}
    </div>
  );
}

// ============================================================================
// STORY TAB CONTENT
// ============================================================================

function StoryTab({ vendor }: { vendor: Record<string, unknown> }) {
  const story = vendor.vendor_story as DbVendorStory | null;
  const timeline = (vendor.vendor_timeline_events as DbTimelineEvent[] | undefined) || [];
  const makerSpotlights = (vendor.vendor_maker_spotlights as DbMakerSpotlight[] | undefined) || [];
  const foundedYear = vendor.founded_year as number | null;
  const ownershipType = vendor.ownership_type as string | null;
  const narrative = story?.narrative;
  const heroImageUrl = story?.hero_image_url;

  const ownershipLabels: Record<string, string> = {
    family: 'Family-Owned',
    corporate: 'Corporate',
    private: 'Private Equity',
    'employee-owned': 'Employee-Owned',
    cooperative: 'Cooperative',
  };

  return (
    <div className="space-y-8">
      <div className="bg-white rounded-lg border border-patina-clay-beige/30 overflow-hidden">
        {heroImageUrl && (
          <div className="relative h-64 sm:h-80 bg-patina-clay-beige/20">
            <Image src={heroImageUrl} alt={`${vendor.trade_name || vendor.name} story`} fill className="object-cover" sizes="(max-width: 1024px) 100vw, 80vw" />
          </div>
        )}
        <div className="p-6">
          <h3 className="text-xl font-serif text-patina-charcoal mb-4">Our Story</h3>
          {narrative ? (
            <p className="text-patina-mocha-brown leading-relaxed whitespace-pre-line">{narrative}</p>
          ) : (
            <p className="text-patina-mocha-brown/60 italic">No brand story available yet.</p>
          )}
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        {foundedYear && (
          <div className="bg-white rounded-lg border border-patina-clay-beige/30 p-6">
            <div className="flex items-center gap-3 mb-2">
              <Calendar className="w-5 h-5 text-patina-mocha-brown" />
              <h4 className="font-medium text-patina-charcoal">Founded</h4>
            </div>
            <p className="text-2xl font-serif text-patina-charcoal">{foundedYear}</p>
            <p className="text-sm text-patina-mocha-brown">{new Date().getFullYear() - foundedYear} years of craftsmanship</p>
          </div>
        )}
        {ownershipType && (
          <div className="bg-white rounded-lg border border-patina-clay-beige/30 p-6">
            <div className="flex items-center gap-3 mb-2">
              <Building2 className="w-5 h-5 text-patina-mocha-brown" />
              <h4 className="font-medium text-patina-charcoal">Ownership</h4>
            </div>
            <p className="text-2xl font-serif text-patina-charcoal">{ownershipLabels[ownershipType] || ownershipType}</p>
          </div>
        )}
      </div>

      {timeline.length > 0 && (
        <div className="bg-white rounded-lg border border-patina-clay-beige/30 p-6">
          <h3 className="text-lg font-semibold text-patina-charcoal mb-6">Timeline</h3>
          <div className="relative">
            <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-patina-clay-beige/50" />
            <div className="space-y-6">
              {[...timeline].sort((a, b) => (a.year ?? 0) - (b.year ?? 0)).map((event, index) => (
                <div key={index} className="relative pl-10">
                  <div className="absolute left-2.5 w-3 h-3 rounded-full bg-patina-mocha-brown border-2 border-white" />
                  <div>
                    <span className="text-sm font-medium text-patina-mocha-brown">{event.year}</span>
                    <h4 className="font-medium text-patina-charcoal">{event.title}</h4>
                    {event.description && <p className="text-sm text-patina-mocha-brown mt-1">{event.description}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {makerSpotlights.length > 0 && (
        <div className="bg-white rounded-lg border border-patina-clay-beige/30 p-6">
          <h3 className="text-lg font-semibold text-patina-charcoal mb-6 flex items-center gap-2">
            <Users className="w-5 h-5 text-patina-mocha-brown" />
            Meet the Makers
          </h3>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {makerSpotlights.map((maker, index) => (
              <div key={index} className="flex gap-4">
                <div className="relative w-16 h-16 rounded-full overflow-hidden bg-patina-clay-beige/20 flex-shrink-0">
                  {maker.image_url ? (
                    <Image src={maker.image_url} alt={maker.name} fill className="object-cover" sizes="64px" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-patina-clay-beige">
                      <Users className="w-8 h-8" />
                    </div>
                  )}
                </div>
                <div>
                  <h4 className="font-medium text-patina-charcoal">{maker.name}</h4>
                  <p className="text-sm text-patina-mocha-brown">{maker.role}</p>
                  {maker.bio && <p className="text-sm text-patina-mocha-brown/80 mt-1 line-clamp-2">{maker.bio}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// REVIEWS TAB CONTENT
// ============================================================================

function ReviewsTab({ vendorId, vendor }: { vendorId: string; vendor: Record<string, unknown> }) {
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const { data, isLoading } = useVendorReviews(vendorId, { page, pageSize });

  const overallRating = (vendor.overall_rating as number) || 0;
  const reviewCount = (vendor.review_count as number) || 0;
  const dimensions = {
    quality: (vendor.rating_quality as number) || 0,
    finish: (vendor.rating_finish as number) || 0,
    delivery: (vendor.rating_delivery as number) || 0,
    service: (vendor.rating_service as number) || 0,
    value: (vendor.rating_value as number) || 0,
  };

  return (
    <div className="space-y-8">
      <div className="bg-white rounded-lg border border-patina-clay-beige/30 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-6">
          <div className="text-center sm:text-left sm:pr-6 sm:border-r sm:border-patina-clay-beige/30">
            <div className="flex items-center justify-center sm:justify-start gap-2 mb-1">
              <Star className="w-8 h-8 text-amber-400 fill-amber-400" />
              <span className="text-4xl font-semibold text-patina-charcoal">{overallRating.toFixed(1)}</span>
            </div>
            <p className="text-sm text-patina-mocha-brown">{reviewCount.toLocaleString()} {reviewCount === 1 ? 'review' : 'reviews'}</p>
          </div>
          <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {Object.entries(dimensions).map(([key, value]) => (
              <div key={key} className="text-center">
                <p className="text-lg font-medium text-patina-charcoal">{value.toFixed(1)}</p>
                <p className="text-xs text-patina-mocha-brown capitalize">{key}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (<ReviewCardSkeleton key={i} />))}
        </div>
      ) : data?.data && data.data.length > 0 ? (
        <div className="space-y-4">
          {(data.data as DbReview[]).map((review) => {
            const designer = review.designer;
            const createdAt = new Date(review.created_at);
            const reviewOverall = review.overall_rating || 0;

            return (
              <div key={review.id} className="bg-white rounded-lg border border-patina-clay-beige/30 p-6">
                <div className="flex items-start gap-4">
                  <div className="relative w-10 h-10 rounded-full overflow-hidden bg-patina-clay-beige/20 flex-shrink-0">
                    {designer?.avatar_url ? (
                      <Image src={designer.avatar_url} alt={designer.display_name || 'Designer'} fill className="object-cover" sizes="40px" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-patina-mocha-brown font-medium">
                        {designer?.display_name?.charAt(0).toUpperCase() || 'D'}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-4 mb-2">
                      <div>
                        <p className="font-medium text-patina-charcoal">{designer?.display_name || 'Anonymous Designer'}</p>
                        <p className="text-xs text-patina-mocha-brown">
                          {createdAt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                        </p>
                      </div>
                      <VendorRatingBadge rating={reviewOverall} reviewCount={0} size="sm" showCount={false} />
                    </div>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {(['quality', 'finish', 'delivery', 'service', 'value'] as const).map((dim) => {
                        const dimKey = `rating_${dim}` as keyof DbReview;
                        const dimValue = review[dimKey] as number;
                        return dimValue ? (
                          <span key={dim} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-patina-clay-beige/20 text-patina-mocha-brown">
                            {dim}: {dimValue.toFixed(1)}
                          </span>
                        ) : null;
                      })}
                    </div>
                    {review.written_review && <p className="text-patina-charcoal whitespace-pre-line">{review.written_review}</p>}
                    {review.lead_time_accuracy && (
                      <p className="mt-2 text-sm text-patina-mocha-brown">
                        Lead time: <span className="font-medium">
                          {review.lead_time_accuracy === 'on-time' ? 'On time' : review.lead_time_accuracy === 'early' ? 'Early' : `${review.lead_time_weeks_over || '?'} weeks late`}
                        </span>
                      </p>
                    )}
                    {review.vendor_response && (
                      <div className="mt-4 pl-4 border-l-2 border-patina-clay-beige/50">
                        <p className="text-sm font-medium text-patina-charcoal mb-1">Vendor Response</p>
                        <p className="text-sm text-patina-mocha-brown">{review.vendor_response}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {data?.pagination && (
            <Pagination currentPage={data.pagination.page} totalPages={data.pagination.totalPages} total={data.pagination.total} pageSize={data.pagination.pageSize} onPageChange={setPage} />
          )}
        </div>
      ) : (
        <div className="text-center py-12 bg-white rounded-lg border border-patina-clay-beige/30">
          <PenLine className="w-12 h-12 mx-auto text-patina-clay-beige mb-4" />
          <h3 className="text-lg font-medium text-patina-charcoal mb-2">No reviews yet</h3>
          <p className="text-patina-mocha-brown">Be the first to share your experience with this vendor.</p>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MAIN PAGE COMPONENT
// ============================================================================

export default function VendorProfilePage() {
  const params = useParams();
  const router = useRouter();
  const vendorId = params.id as string;

  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);

  const { data: vendor, isLoading, error } = useVendor(vendorId);
  const toggleSave = useToggleVendorSave();

  const handleSaveToggle = () => { toggleSave.mutate({ vendorId }); };
  const handleWriteReview = () => { setIsReviewModalOpen(true); };
  const handleApplyForTradeAccount = () => { router.push(`/vendors/${vendorId}/apply`); };

  if (error) {
    return (
      <div className="min-h-screen bg-patina-off-white flex items-center justify-center">
        <div className="text-center">
          <Building2 className="w-16 h-16 mx-auto text-patina-clay-beige mb-4" />
          <h1 className="text-2xl font-serif text-patina-charcoal mb-2">Vendor Not Found</h1>
          <p className="text-patina-mocha-brown mb-6">The vendor you are looking for does not exist or has been removed.</p>
          <Link href="/vendors" className="inline-flex items-center gap-2 px-4 py-2 bg-patina-mocha-brown text-white rounded-lg hover:bg-patina-charcoal transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back to Vendors
          </Link>
        </div>
      </div>
    );
  }

  if (isLoading || !vendor) {
    return (
      <div className="min-h-screen bg-patina-off-white">
        <div className="max-w-5xl mx-auto px-4 py-8">
          <Link href="/vendors" className="inline-flex items-center gap-2 text-patina-mocha-brown hover:text-patina-charcoal transition-colors mb-6">
            <ArrowLeft className="w-4 h-4" />
            Back to Vendors
          </Link>
          <div className="bg-white rounded-xl border border-patina-clay-beige/30 p-6 mb-6"><HeaderSkeleton /></div>
          <ContentSkeleton />
        </div>
      </div>
    );
  }

  const tradeName = (vendor.trade_name as string) || (vendor.name as string);
  const legalName = vendor.name as string;
  const logoUrl = vendor.logo_url as string | null;
  const marketPosition = (vendor.market_position as MarketPosition) || 'mid';
  const city = vendor.headquarters_city as string;
  const state = vendor.headquarters_state as string;
  const location = [city, state].filter(Boolean).join(', ');
  const overallRating = (vendor.overall_rating as number) || 0;
  const reviewCount = (vendor.review_count as number) || 0;
  const productCount = (vendor.productCount as number) || 0;
  const designerRelationship = vendor.designerRelationship as {
    accountStatus: AccountStatus;
    currentTier: string | null;
    currentVolume: number;
    nextTierName: string | null;
    nextTierVolume: number | null;
    isSaved: boolean;
  } | null;

  const accountStatus = designerRelationship?.accountStatus || 'none';
  const currentTier = designerRelationship?.currentTier;
  const isSaved = designerRelationship?.isSaved || false;

  return (
    <div className="min-h-screen bg-patina-off-white">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <Link href="/vendors" className="inline-flex items-center gap-2 text-patina-mocha-brown hover:text-patina-charcoal transition-colors mb-6">
          <ArrowLeft className="w-4 h-4" />
          Back to Vendors
        </Link>

        <div className="bg-white rounded-xl border border-patina-clay-beige/30 p-6 mb-6">
          <div className="flex flex-col sm:flex-row gap-6">
            <VendorLogo logoUrl={logoUrl} vendorName={tradeName} size="xl" className="flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div>
                  <h1 className="text-2xl sm:text-3xl font-serif text-patina-charcoal mb-1">{tradeName}</h1>
                  {legalName !== tradeName && <p className="text-sm text-patina-mocha-brown mb-2">{legalName}</p>}
                  <div className="flex flex-wrap items-center gap-3 mb-3">
                    <MarketPositionBadge position={marketPosition} />
                    {location && (
                      <span className="inline-flex items-center gap-1 text-sm text-patina-mocha-brown">
                        <MapPin className="w-4 h-4" />
                        {location}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4">
                    <VendorRatingBadge rating={overallRating} reviewCount={reviewCount} size="md" />
                    <span className="text-sm text-patina-mocha-brown">{productCount.toLocaleString()} products</span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={handleSaveToggle} disabled={toggleSave.isPending}
                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${isSaved ? 'border-patina-mocha-brown bg-patina-mocha-brown text-white' : 'border-patina-clay-beige/50 bg-white text-patina-mocha-brown hover:border-patina-mocha-brown'}`}
                  >
                    <Bookmark className={`w-4 h-4 ${isSaved ? 'fill-current' : ''}`} />
                    {isSaved ? 'Saved' : 'Save'}
                  </button>
                  <button type="button" onClick={handleWriteReview} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-patina-clay-beige/50 bg-white text-patina-mocha-brown hover:border-patina-mocha-brown transition-colors">
                    <PenLine className="w-4 h-4" />
                    Write Review
                  </button>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-patina-clay-beige/30">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <TradeTierIndicator status={accountStatus} tierName={currentTier ?? undefined} variant="inline" />
                  {accountStatus === 'none' && (
                    <button type="button" onClick={handleApplyForTradeAccount} className="inline-flex items-center gap-2 px-4 py-2 bg-patina-mocha-brown text-white rounded-lg hover:bg-patina-charcoal transition-colors">
                      <ExternalLink className="w-4 h-4" />
                      Apply for Trade Account
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-patina-clay-beige/30 overflow-hidden">
          <div className="flex border-b border-patina-clay-beige/30 overflow-x-auto" role="tablist">
            <TabButton tabKey="overview" label="Overview" activeTab={activeTab} onClick={setActiveTab} />
            <TabButton tabKey="products" label={`Products (${productCount})`} activeTab={activeTab} onClick={setActiveTab} />
            <TabButton tabKey="story" label="Story" activeTab={activeTab} onClick={setActiveTab} />
            <TabButton tabKey="reviews" label={`Reviews (${reviewCount})`} activeTab={activeTab} onClick={setActiveTab} />
          </div>
          <div className="p-6" role="tabpanel">
            {activeTab === 'overview' && <OverviewTab vendor={vendor} designerRelationship={designerRelationship as DesignerRelationship | null} />}
            {activeTab === 'products' && <ProductsTab vendorId={vendorId} />}
            {activeTab === 'story' && <StoryTab vendor={vendor} />}
            {activeTab === 'reviews' && <ReviewsTab vendorId={vendorId} vendor={vendor} />}
          </div>
        </div>

        <ReviewModal
          vendorId={vendorId}
          vendorName={tradeName}
          specializations={(vendor.vendor_specializations as DbSpecialization[] | undefined)?.map(s => ({ id: s.id, name: s.category })) || []}
          isOpen={isReviewModalOpen}
          onClose={() => setIsReviewModalOpen(false)}
          onSuccess={() => { setActiveTab('reviews'); }}
        />
      </div>
    </div>
  );
}
