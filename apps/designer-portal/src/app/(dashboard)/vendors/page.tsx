'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  Search,
  Grid,
  List,
  Filter,
  X,
  ChevronLeft,
  ChevronRight,
  Building2,
  Plus,
} from 'lucide-react';
import { useVendors, useToggleVendorSave } from '@patina/supabase';
import type { VendorSummary, MarketPosition, AccountStatus } from '@patina/types';
import { useVendorsStore, useVendorFilters, useVendorViewMode } from '@/stores/vendors-store';
import { VendorDirectoryCard } from '@/components/vendors';
import { vendorEvents } from '@/lib/analytics';

// ─── Filter Options ──────────────────────────────────────────────────────────

const CATEGORY_OPTIONS = [
  'Upholstery',
  'Case Goods',
  'Lighting',
  'Outdoor',
  'Textiles',
  'Accessories',
] as const;

const MARKET_POSITION_OPTIONS: { value: MarketPosition; label: string }[] = [
  { value: 'entry', label: 'Entry' },
  { value: 'mid', label: 'Mid' },
  { value: 'premium', label: 'Premium' },
  { value: 'luxury', label: 'Luxury' },
  { value: 'ultra-luxury', label: 'Ultra-Luxury' },
];

const ACCOUNT_STATUS_OPTIONS: { value: AccountStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All Vendors' },
  { value: 'active', label: 'Active Accounts' },
  { value: 'pending', label: 'Pending' },
  { value: 'none', label: 'Available' },
];

const RATING_OPTIONS = [
  { value: 4, label: '4+ Stars' },
  { value: 3, label: '3+ Stars' },
  { value: null, label: 'All Ratings' },
];

const CERTIFICATION_OPTIONS = [
  { value: 'fsc', label: 'FSC Certified' },
  { value: 'greenguard', label: 'GREENGUARD' },
  { value: 'bcorp', label: 'B Corp' },
  { value: 'fairtrade', label: 'Fair Trade' },
];

const LEAD_TIME_OPTIONS = [
  { value: 'any', label: 'Any lead time' },
  { value: 'quick-ship', label: 'Quick-ship available' },
  { value: 'under-8-weeks', label: 'Under 8 weeks' },
];

// ─── Skeleton Components ─────────────────────────────────────────────────────

function VendorCardSkeleton() {
  return (
    <div className="rounded-2xl shadow-patina-sm bg-white overflow-hidden">
      <div className="p-4 pb-3">
        <div className="w-16 h-16 shimmer-skeleton rounded-lg" />
      </div>
      <div className="px-4 pb-4 space-y-3">
        <div>
          <div className="h-5 bg-patina-clay-beige/30 rounded w-3/4 mb-2" />
          <div className="h-4 bg-patina-clay-beige/30 rounded w-1/3" />
        </div>
        <div className="space-y-1">
          <div className="h-3 bg-patina-clay-beige/30 rounded w-1/2" />
          <div className="h-3 bg-patina-clay-beige/30 rounded w-2/3" />
        </div>
        <div className="h-4 bg-patina-clay-beige/30 rounded w-1/4" />
      </div>
    </div>
  );
}

function VendorListSkeleton() {
  return (
    <div className="flex items-center gap-4 p-4 rounded-2xl shadow-patina-sm bg-white">
      <div className="w-12 h-12 bg-patina-clay-beige/30 rounded-lg flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="h-4 bg-patina-clay-beige/30 rounded w-1/3 mb-2" />
        <div className="h-3 bg-patina-clay-beige/30 rounded w-1/2" />
      </div>
      <div className="hidden sm:block w-20 h-4 bg-patina-clay-beige/30 rounded" />
      <div className="hidden md:block w-24 h-4 bg-patina-clay-beige/30 rounded" />
      <div className="w-8 h-8 bg-patina-clay-beige/30 rounded-full" />
    </div>
  );
}

// ─── Filter Panel Component ──────────────────────────────────────────────────

interface FilterPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

function FilterPanel({ isOpen, onClose }: FilterPanelProps) {
  const filters = useVendorFilters();
  const { setFilters, clearFilters } = useVendorsStore();

  const handleCategoryToggle = (category: string) => {
    const current = filters.categories || [];
    const updated = current.includes(category)
      ? current.filter((c) => c !== category)
      : [...current, category];
    setFilters({ ...filters, categories: updated.length > 0 ? updated : [] });
  };

  const handleMarketPositionToggle = (position: MarketPosition) => {
    const current = filters.marketPositions || [];
    const updated = current.includes(position)
      ? current.filter((p) => p !== position)
      : [...current, position];
    setFilters({
      ...filters,
      marketPositions: updated.length > 0 ? updated : [],
    });
  };

  const handleAccountStatusChange = (status: AccountStatus | 'all') => {
    setFilters({
      ...filters,
      accountStatus: status === 'all' ? null : status,
    });
  };

  const handleRatingChange = (rating: number | null) => {
    setFilters({
      ...filters,
      minRating: rating,
    });
  };

  const handleCertificationToggle = (certification: string) => {
    const current = filters.certifications || [];
    const updated = current.includes(certification)
      ? current.filter((c) => c !== certification)
      : [...current, certification];
    setFilters({ ...filters, certifications: updated.length > 0 ? updated : [] });
  };

  const handleLeadTimeFilterChange = (value: string) => {
    if (value === 'any') {
      setFilters({
        ...filters,
        hasQuickShip: null,
        maxLeadTimeWeeks: undefined,
      });
    } else if (value === 'quick-ship') {
      setFilters({
        ...filters,
        hasQuickShip: true,
        maxLeadTimeWeeks: undefined,
      });
    } else if (value === 'under-8-weeks') {
      setFilters({
        ...filters,
        hasQuickShip: null,
        maxLeadTimeWeeks: 8,
      });
    }
  };

  // Determine current lead time filter selection
  const currentLeadTimeFilter = filters.maxLeadTimeWeeks === 8
    ? 'under-8-weeks'
    : filters.hasQuickShip
      ? 'quick-ship'
      : 'any';

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-40 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Filter panel */}
      <aside
        className={`
          fixed inset-y-0 right-0 z-50 w-80 max-w-full bg-white shadow-xl transform transition-transform duration-300 ease-in-out
          lg:static lg:z-0 lg:shadow-none lg:transform-none lg:transition-none lg:border-l lg:border-patina-clay-beige/30
          ${isOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}
          ${!isOpen && 'lg:hidden'}
        `}
      >
        <div className="h-full flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-patina-clay-beige/30">
            <h2 className="text-lg font-semibold text-patina-charcoal">Filters</h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={clearFilters}
                className="text-sm text-patina-mocha-brown hover:text-patina-charcoal transition-colors"
              >
                Clear all
              </button>
              <button
                type="button"
                onClick={onClose}
                className="lg:hidden p-1 rounded-full hover:bg-patina-clay-beige/20 transition-colors"
                aria-label="Close filters"
              >
                <X className="w-5 h-5 text-patina-mocha-brown" />
              </button>
            </div>
          </div>

          {/* Filter sections */}
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {/* Category */}
            <div>
              <h3 className="text-sm font-medium text-patina-charcoal mb-3">Category</h3>
              <div className="space-y-2">
                {CATEGORY_OPTIONS.map((category) => (
                  <label
                    key={category}
                    className="flex items-center gap-2 cursor-pointer group"
                  >
                    <input
                      type="checkbox"
                      checked={filters.categories?.includes(category) || false}
                      onChange={() => handleCategoryToggle(category)}
                      className="w-4 h-4 rounded border-patina-clay-beige text-patina-mocha-brown focus:ring-patina-mocha-brown focus:ring-offset-0"
                    />
                    <span className="text-sm text-patina-mocha-brown group-hover:text-patina-charcoal transition-colors">
                      {category}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Market Position */}
            <div>
              <h3 className="text-sm font-medium text-patina-charcoal mb-3">
                Market Position
              </h3>
              <div className="space-y-2">
                {MARKET_POSITION_OPTIONS.map(({ value, label }) => (
                  <label
                    key={value}
                    className="flex items-center gap-2 cursor-pointer group"
                  >
                    <input
                      type="checkbox"
                      checked={filters.marketPositions?.includes(value) || false}
                      onChange={() => handleMarketPositionToggle(value)}
                      className="w-4 h-4 rounded border-patina-clay-beige text-patina-mocha-brown focus:ring-patina-mocha-brown focus:ring-offset-0"
                    />
                    <span className="text-sm text-patina-mocha-brown group-hover:text-patina-charcoal transition-colors">
                      {label}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* My Status */}
            <div>
              <h3 className="text-sm font-medium text-patina-charcoal mb-3">My Status</h3>
              <div className="space-y-2">
                {ACCOUNT_STATUS_OPTIONS.map(({ value, label }) => (
                  <label
                    key={value}
                    className="flex items-center gap-2 cursor-pointer group"
                  >
                    <input
                      type="radio"
                      name="accountStatus"
                      checked={
                        value === 'all'
                          ? filters.accountStatus === null
                          : filters.accountStatus === value
                      }
                      onChange={() => handleAccountStatusChange(value)}
                      className="w-4 h-4 border-patina-clay-beige text-patina-mocha-brown focus:ring-patina-mocha-brown focus:ring-offset-0"
                    />
                    <span className="text-sm text-patina-mocha-brown group-hover:text-patina-charcoal transition-colors">
                      {label}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Rating */}
            <div>
              <h3 className="text-sm font-medium text-patina-charcoal mb-3">Rating</h3>
              <div className="space-y-2">
                {RATING_OPTIONS.map(({ value, label }) => (
                  <label
                    key={label}
                    className="flex items-center gap-2 cursor-pointer group"
                  >
                    <input
                      type="radio"
                      name="rating"
                      checked={filters.minRating === value}
                      onChange={() => handleRatingChange(value)}
                      className="w-4 h-4 border-patina-clay-beige text-patina-mocha-brown focus:ring-patina-mocha-brown focus:ring-offset-0"
                    />
                    <span className="text-sm text-patina-mocha-brown group-hover:text-patina-charcoal transition-colors">
                      {label}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Lead Time */}
            <div>
              <h3 className="text-sm font-medium text-patina-charcoal mb-3">Lead Time</h3>
              <div className="space-y-2">
                {LEAD_TIME_OPTIONS.map(({ value, label }) => (
                  <label
                    key={value}
                    className="flex items-center gap-2 cursor-pointer group"
                  >
                    <input
                      type="radio"
                      name="leadTime"
                      checked={currentLeadTimeFilter === value}
                      onChange={() => handleLeadTimeFilterChange(value)}
                      className="w-4 h-4 border-patina-clay-beige text-patina-mocha-brown focus:ring-patina-mocha-brown focus:ring-offset-0"
                    />
                    <span className="text-sm text-patina-mocha-brown group-hover:text-patina-charcoal transition-colors">
                      {label}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Certifications */}
            <div>
              <h3 className="text-sm font-medium text-patina-charcoal mb-3">Certifications</h3>
              <div className="space-y-2">
                {CERTIFICATION_OPTIONS.map(({ value, label }) => (
                  <label
                    key={value}
                    className="flex items-center gap-2 cursor-pointer group"
                  >
                    <input
                      type="checkbox"
                      checked={filters.certifications?.includes(value) || false}
                      onChange={() => handleCertificationToggle(value)}
                      className="w-4 h-4 rounded border-patina-clay-beige text-patina-mocha-brown focus:ring-patina-mocha-brown focus:ring-offset-0"
                    />
                    <span className="text-sm text-patina-mocha-brown group-hover:text-patina-charcoal transition-colors">
                      {label}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

// ─── Filter Chips Component ──────────────────────────────────────────────────

function FilterChips() {
  const filters = useVendorFilters();
  const { setFilters } = useVendorsStore();
  const activeFilterCount = useVendorsStore((state) => state.getActiveFilterCount());

  if (activeFilterCount === 0) return null;

  const chips: { key: string; label: string; onRemove: () => void }[] = [];

  filters.categories?.forEach((category) => {
    chips.push({
      key: `category-${category}`,
      label: category,
      onRemove: () =>
        setFilters({
          ...filters,
          categories: filters.categories?.filter((c) => c !== category) || [],
        }),
    });
  });

  const positionLabels: Record<MarketPosition, string> = {
    entry: 'Entry',
    mid: 'Mid',
    premium: 'Premium',
    luxury: 'Luxury',
    'ultra-luxury': 'Ultra-Luxury',
  };
  filters.marketPositions?.forEach((position) => {
    chips.push({
      key: `position-${position}`,
      label: positionLabels[position],
      onRemove: () =>
        setFilters({
          ...filters,
          marketPositions: filters.marketPositions?.filter((p) => p !== position) || [],
        }),
    });
  });

  if (filters.accountStatus) {
    const statusLabels: Record<AccountStatus, string> = {
      none: 'Available',
      pending: 'Pending',
      active: 'Active Account',
    };
    chips.push({
      key: 'accountStatus',
      label: statusLabels[filters.accountStatus],
      onRemove: () => setFilters({ ...filters, accountStatus: null }),
    });
  }

  if (filters.minRating) {
    chips.push({
      key: 'rating',
      label: `${filters.minRating}+ Stars`,
      onRemove: () => setFilters({ ...filters, minRating: null }),
    });
  }

  if (filters.hasQuickShip) {
    chips.push({
      key: 'quickShip',
      label: 'Quick Ship',
      onRemove: () => setFilters({ ...filters, hasQuickShip: null }),
    });
  }

  if ((filters as { maxLeadTimeWeeks?: number }).maxLeadTimeWeeks === 8) {
    chips.push({
      key: 'leadTime',
      label: 'Under 8 weeks',
      onRemove: () => setFilters({ ...filters, maxLeadTimeWeeks: undefined } as typeof filters),
    });
  }

  const certificationLabels: Record<string, string> = {
    fsc: 'FSC Certified',
    greenguard: 'GREENGUARD',
    bcorp: 'B Corp',
    fairtrade: 'Fair Trade',
  };
  filters.certifications?.forEach((certification) => {
    chips.push({
      key: `cert-${certification}`,
      label: certificationLabels[certification] || certification,
      onRemove: () =>
        setFilters({
          ...filters,
          certifications: filters.certifications?.filter((c) => c !== certification) || [],
        }),
    });
  });

  return (
    <div className="flex flex-wrap gap-2">
      {chips.map(({ key, label, onRemove }) => (
        <span
          key={key}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm bg-patina-clay-beige/30 text-patina-mocha-brown"
        >
          {label}
          <button
            type="button"
            onClick={onRemove}
            className="p-0.5 rounded-full hover:bg-patina-mocha-brown/20 transition-colors"
            aria-label={`Remove ${label} filter`}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </span>
      ))}
    </div>
  );
}

// ─── Pagination Component ────────────────────────────────────────────────────

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
      <p className="text-sm text-patina-mocha-brown">
        Showing {startItem}-{endItem} of {total} vendors
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="p-2 rounded-lg border border-patina-clay-beige/30 hover:border-patina-mocha-brown hover:bg-patina-off-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="Previous page"
        >
          <ChevronLeft className="w-4 h-4 text-patina-mocha-brown" />
        </button>
        <span className="text-sm text-patina-mocha-brown px-2">
          Page {currentPage} of {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="p-2 rounded-lg border border-patina-clay-beige/30 hover:border-patina-mocha-brown hover:bg-patina-off-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="Next page"
        >
          <ChevronRight className="w-4 h-4 text-patina-mocha-brown" />
        </button>
      </div>
    </div>
  );
}

// ─── Empty State Component ───────────────────────────────────────────────────

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  const { clearFilters } = useVendorsStore();

  return (
    <div className="text-center py-16 bg-white rounded-2xl shadow-patina-sm">
      <Building2 className="w-16 h-16 mx-auto text-patina-clay-beige mb-4" />
      <h2 className="text-xl font-serif text-patina-charcoal mb-2">
        {hasFilters ? 'No vendors match your filters' : 'No vendors found'}
      </h2>
      <p className="text-patina-mocha-brown mb-4 max-w-md mx-auto">
        {hasFilters
          ? 'Try adjusting your filters to see more results.'
          : 'Vendors will appear here once they are added to the platform.'}
      </p>
      {hasFilters && (
        <button type="button" onClick={clearFilters} className="btn-primary">
          Clear filters
        </button>
      )}
    </div>
  );
}

// ─── Main Page Component ─────────────────────────────────────────────────────

export default function VendorsPage() {
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const filters = useVendorFilters();
  const viewMode = useVendorViewMode();
  const { setViewMode, openSlideOver } = useVendorsStore();
  const activeFilterCount = useVendorsStore((state) => state.getActiveFilterCount());
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);

  const toggleVendorSave = useToggleVendorSave();

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (debouncedSearch) {
      vendorEvents.search(debouncedSearch.length, vendors.length);
    }
  }, [debouncedSearch]);

  const vendorQueryFilters = useMemo(
    () => ({
      search: debouncedSearch || undefined,
      categories: filters.categories?.length ? filters.categories : undefined,
      marketPositions: filters.marketPositions?.length ? filters.marketPositions : undefined,
      accountStatus: filters.accountStatus || undefined,
      minRating: filters.minRating || undefined,
      hasQuickShip: filters.hasQuickShip || undefined,
      certifications: filters.certifications?.length ? filters.certifications : undefined,
      maxLeadTimeWeeks: filters.maxLeadTimeWeeks || undefined,
    }),
    [debouncedSearch, filters.categories, filters.marketPositions, filters.accountStatus, filters.minRating, filters.hasQuickShip, filters.certifications, filters.maxLeadTimeWeeks]
  );

  const { data, isLoading, error } = useVendors(vendorQueryFilters, { page, pageSize });

  const vendors: VendorSummary[] = useMemo(() => {
    if (!data?.data) return [];
    return data.data.map((vendor: Record<string, unknown>) => ({
      id: vendor.id as string,
      tradeName: (vendor.trade_name as string) || (vendor.name as string),
      logoUrl: vendor.logo_url as string | null,
      primaryCategory: (vendor.primary_category as string) || 'Uncategorized',
      marketPosition: (vendor.market_position as MarketPosition) || 'mid',
      headquarters: {
        city: (vendor.headquarters_city as string) || 'Unknown',
        state: (vendor.headquarters_state as string) || '',
      },
      designerRelationship: {
        accountStatus: 'none' as AccountStatus,
        currentTier: null,
        isSaved: false,
      },
      reputation: {
        overallScore: (vendor.overall_rating as number) || 0,
        reviewCount: (vendor.review_count as number) || 0,
        topSpecializations: [],
      },
      leadTimes: {
        quickShip: vendor.lead_time_quick_ship as string | null,
        madeToOrder: vendor.lead_time_mto as string | null,
      },
    }));
  }, [data?.data]);

  const handleSaveToggle = useCallback(
    (vendorId: string) => {
      toggleVendorSave.mutate({ vendorId });
      vendorEvents.save(vendorId);
    },
    [toggleVendorSave]
  );

  const handleVendorClick = useCallback(
    (vendorId: string) => {
      openSlideOver(vendorId);
      vendorEvents.view(vendorId);
    },
    [openSlideOver]
  );

  const hasFilters = activeFilterCount > 0 || Boolean(filters.search && filters.search.length > 0);

  if (error) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <h1 className="text-2xl font-serif text-patina-charcoal mb-2">Error Loading Vendors</h1>
          <p className="text-patina-mocha-brown">Please try again later.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-8 py-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-serif text-patina-charcoal">Vendors</h1>
          <p className="text-patina-mocha-brown mt-1">{data?.pagination.total ?? 0} vendors in directory</p>
        </div>
        <Link href="/vendors/new" className="btn-primary">
          <Plus className="w-5 h-5" />
          Add Vendor
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-patina-mocha-brown pointer-events-none" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search vendors..."
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-patina-clay-beige/30 bg-white text-patina-charcoal placeholder:text-patina-mocha-brown/50 focus:outline-none focus:ring-2 focus:ring-patina-mocha-brown focus:border-transparent transition-shadow"
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => setSearchInput('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-patina-clay-beige/20 transition-colors"
              aria-label="Clear search"
            >
              <X className="w-4 h-4 text-patina-mocha-brown" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border border-patina-clay-beige/30 bg-white p-1">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-md transition-colors ${viewMode === 'list' ? 'bg-patina-clay-beige/30 text-patina-charcoal' : 'text-patina-mocha-brown hover:text-patina-charcoal'}`}
              aria-label="List view"
              aria-pressed={viewMode === 'list'}
            >
              <List className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('card')}
              className={`p-2 rounded-md transition-colors ${viewMode === 'card' ? 'bg-patina-clay-beige/30 text-patina-charcoal' : 'text-patina-mocha-brown hover:text-patina-charcoal'}`}
              aria-label="Card view"
              aria-pressed={viewMode === 'card'}
            >
              <Grid className="w-4 h-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => { setIsFilterPanelOpen(!isFilterPanelOpen); vendorEvents.filterChange('toggle'); }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border transition-colors ${
              isFilterPanelOpen || activeFilterCount > 0
                ? 'border-patina-mocha-brown bg-patina-mocha-brown text-white'
                : 'border-patina-clay-beige/30 bg-white text-patina-mocha-brown hover:border-patina-mocha-brown hover:text-patina-charcoal'
            }`}
          >
            <Filter className="w-4 h-4" />
            <span className="hidden sm:inline">Filters</span>
            {activeFilterCount > 0 && (
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-white/20 text-xs font-medium">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>
      </div>

      <FilterChips />

      <div className="flex gap-6 mt-6">
        <div className="flex-1 min-w-0">
          {isLoading ? (
            viewMode === 'card' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from({ length: 9 }).map((_, i) => (<VendorCardSkeleton key={i} />))}
              </div>
            ) : (
              <div className="space-y-3">
                {Array.from({ length: 8 }).map((_, i) => (<VendorListSkeleton key={i} />))}
              </div>
            )
          ) : vendors.length === 0 ? (
            <EmptyState hasFilters={hasFilters} />
          ) : viewMode === 'card' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {vendors.map((vendor) => (
                <VendorDirectoryCard key={vendor.id} vendor={vendor} variant="card" onSaveToggle={() => handleSaveToggle(vendor.id)} onClick={() => handleVendorClick(vendor.id)} />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {vendors.map((vendor) => (
                <VendorDirectoryCard key={vendor.id} vendor={vendor} variant="list" onSaveToggle={() => handleSaveToggle(vendor.id)} onClick={() => handleVendorClick(vendor.id)} />
              ))}
            </div>
          )}

          {data?.pagination && (
            <Pagination currentPage={data.pagination.page} totalPages={data.pagination.totalPages} total={data.pagination.total} pageSize={data.pagination.pageSize} onPageChange={setPage} />
          )}
        </div>

        {isFilterPanelOpen && (
          <div className="hidden lg:block w-80 flex-shrink-0">
            <div className="sticky top-8">
              <FilterPanel isOpen={isFilterPanelOpen} onClose={() => setIsFilterPanelOpen(false)} />
            </div>
          </div>
        )}
      </div>

      <div className="lg:hidden">
        <FilterPanel isOpen={isFilterPanelOpen} onClose={() => setIsFilterPanelOpen(false)} />
      </div>
    </div>
  );
}
