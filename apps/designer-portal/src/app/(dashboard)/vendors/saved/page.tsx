'use client';

import { useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  Bookmark,
  Building2,
  Search,
  X,
  ArrowLeft,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { createBrowserClient } from '@patina/supabase';
import { useToggleVendorSave } from '@patina/supabase';
import type { VendorSummary, MarketPosition, AccountStatus } from '@patina/types';
import { VendorDirectoryCard } from '@/components/vendors';
import { useVendorsStore } from '@/stores/vendors-store';

// ─── Skeleton Component ─────────────────────────────────────────────────────

function VendorCardSkeleton() {
  return (
    <div className="animate-pulse rounded-lg border border-patina-clay-beige/30 bg-white overflow-hidden">
      <div className="p-4 pb-3">
        <div className="w-16 h-16 bg-patina-clay-beige/30 rounded-lg" />
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

// ─── Saved Vendors Hook ─────────────────────────────────────────────────────

interface SavedVendorRow {
  id: string;
  notes: string | null;
  saved_at: string;
  vendor: {
    id: string;
    name: string;
    trade_name: string | null;
    logo_url: string | null;
    primary_category: string | null;
    market_position: string | null;
    headquarters_city: string | null;
    headquarters_state: string | null;
    overall_rating: number | null;
    review_count: number | null;
    lead_time_quick_ship: string | null;
    lead_time_mto: string | null;
  } | null;
}

function useSavedVendors() {
  return useQuery({
    queryKey: ['saved-vendors'],
    queryFn: async (): Promise<SavedVendorRow[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = createBrowserClient() as any;

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return [];

      const { data, error } = await supabase
        .from('saved_vendors')
        .select(
          `
          id,
          notes,
          saved_at,
          vendor:vendors(
            id,
            name,
            trade_name,
            logo_url,
            primary_category,
            market_position,
            headquarters_city,
            headquarters_state,
            overall_rating,
            review_count,
            lead_time_quick_ship,
            lead_time_mto
          )
        `
        )
        .eq('designer_id', user.id)
        .order('saved_at', { ascending: false });

      if (error) throw error;
      return (data ?? []) as unknown as SavedVendorRow[];
    },
  });
}

// ─── Empty State Component ───────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="text-center py-16 bg-white rounded-xl border border-patina-clay-beige/20">
      <Bookmark className="w-16 h-16 mx-auto text-patina-clay-beige mb-4" />
      <h2 className="text-xl font-serif text-patina-charcoal mb-2">
        No saved vendors yet
      </h2>
      <p className="text-patina-mocha-brown mb-6 max-w-md mx-auto">
        Save vendors you want to work with or explore later. Browse the directory to find vendors.
      </p>
      <Link
        href="/vendors"
        className="inline-flex items-center gap-2 px-4 py-2 bg-patina-mocha-brown text-white rounded-lg hover:bg-patina-charcoal transition-colors"
      >
        Browse Vendors
      </Link>
    </div>
  );
}

// ─── Main Page Component ─────────────────────────────────────────────────────

export default function SavedVendorsPage() {
  const [searchInput, setSearchInput] = useState('');
  const { openSlideOver } = useVendorsStore();
  const toggleVendorSave = useToggleVendorSave();

  const { data: savedVendorsData, isLoading, error } = useSavedVendors();

  const vendors: VendorSummary[] = useMemo(() => {
    if (!savedVendorsData) return [];
    return savedVendorsData
      .filter((item) => item.vendor)
      .map((item) => {
        const vendor = item.vendor as Record<string, unknown>;
        return {
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
            isSaved: true,
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
        };
      });
  }, [savedVendorsData]);

  const filteredVendors = useMemo(() => {
    if (!searchInput) return vendors;
    const search = searchInput.toLowerCase();
    return vendors.filter(
      (v) =>
        v.tradeName.toLowerCase().includes(search) ||
        v.primaryCategory.toLowerCase().includes(search) ||
        v.headquarters.city.toLowerCase().includes(search)
    );
  }, [vendors, searchInput]);

  const handleSaveToggle = useCallback(
    (vendorId: string) => {
      toggleVendorSave.mutate({ vendorId });
    },
    [toggleVendorSave]
  );

  const handleVendorClick = useCallback(
    (vendorId: string) => {
      openSlideOver(vendorId);
    },
    [openSlideOver]
  );

  if (error) {
    return (
      <div className="min-h-screen bg-patina-off-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-serif text-patina-charcoal mb-2">
            Error Loading Saved Vendors
          </h1>
          <p className="text-patina-mocha-brown">Please try again later.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-patina-off-white">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <Link
          href="/vendors"
          className="inline-flex items-center gap-2 text-patina-mocha-brown hover:text-patina-charcoal transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to All Vendors
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-serif text-patina-charcoal flex items-center gap-3">
              <Bookmark className="w-8 h-8 text-patina-mocha-brown" />
              Saved Vendors
            </h1>
            <p className="text-patina-mocha-brown mt-1">
              {vendors.length} {vendors.length === 1 ? 'vendor' : 'vendors'} saved
            </p>
          </div>
        </div>

        {vendors.length > 0 && (
          <div className="mb-6">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-patina-mocha-brown pointer-events-none" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search saved vendors..."
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
          </div>
        )}

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <VendorCardSkeleton key={i} />
            ))}
          </div>
        ) : vendors.length === 0 ? (
          <EmptyState />
        ) : filteredVendors.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg border border-patina-clay-beige/30">
            <Building2 className="w-12 h-12 mx-auto text-patina-clay-beige mb-4" />
            <h3 className="text-lg font-medium text-patina-charcoal mb-2">
              No vendors match your search
            </h3>
            <p className="text-patina-mocha-brown mb-4">
              Try adjusting your search terms.
            </p>
            <button
              type="button"
              onClick={() => setSearchInput('')}
              className="text-patina-mocha-brown hover:text-patina-charcoal transition-colors underline"
            >
              Clear search
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredVendors.map((vendor) => (
              <VendorDirectoryCard
                key={vendor.id}
                vendor={vendor}
                variant="card"
                onSaveToggle={() => handleSaveToggle(vendor.id)}
                onClick={() => handleVendorClick(vendor.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
