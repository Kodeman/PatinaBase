/* eslint-disable @typescript-eslint/no-explicit-any */
// Note: This file uses type assertions (as any) because the database types
// haven't been regenerated yet to include the vendor management tables.
// Run `pnpm db:generate` after migrations are applied to get full type safety.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';
import type {
  Pagination,
  ProductFilter,
  VendorFilters,
  VendorReviewInput,
  SpecializationVote,
} from '@patina/shared/validation';

// Lazy client getter to avoid module-level initialization during SSR
// Uses createBrowserClient for proper cookie-based session handling
const getSupabase = () => createBrowserClient();

// ═══════════════════════════════════════════════════════════════════════════
// VENDOR QUERY HOOKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fetch paginated list of vendors with filtering
 */
export function useVendors(filters?: VendorFilters, pagination?: Pagination) {
  return useQuery({
    queryKey: ['vendors', filters, pagination],
    queryFn: async () => {
      const supabase = getSupabase() as any;

      // Build the base query with joins
      let query = supabase
        .from('vendors')
        .select(
          `
          *,
          vendor_certifications(*),
          vendor_specializations(*)
        `,
          { count: 'exact' }
        );

      // Apply filters
      if (filters?.search) {
        query = query.ilike('name', `%${filters.search}%`);
      }
      if (filters?.categories?.length) {
        query = query.in('primary_category', filters.categories);
      }
      if (filters?.marketPositions?.length) {
        query = query.in('market_position', filters.marketPositions);
      }
      if (filters?.minRating) {
        query = query.gte('overall_rating', filters.minRating);
      }
      if (filters?.productionModels?.length) {
        query = query.in('production_model', filters.productionModels);
      }
      if (filters?.hasQuickShip === true) {
        query = query.not('lead_time_quick_ship', 'is', null);
      }

      // Apply pagination
      const page = pagination?.page ?? 1;
      const pageSize = pagination?.pageSize ?? 20;
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      query = query.range(from, to).order('name', { ascending: true });

      const { data, error, count } = await query;

      if (error) throw error;

      return {
        data: data ?? [],
        pagination: {
          page,
          pageSize,
          total: count ?? 0,
          totalPages: Math.ceil((count ?? 0) / pageSize),
        },
      };
    },
  });
}

/**
 * Fetch single vendor profile with all related data
 */
export function useVendor(vendorId: string) {
  return useQuery({
    queryKey: ['vendor', vendorId],
    queryFn: async () => {
      const supabase = getSupabase() as any;

      // Get current user to check relationship
      const {
        data: { user },
      } = await supabase.auth.getUser();

      // Fetch vendor with all related data
      const { data: vendor, error: vendorError } = await supabase
        .from('vendors')
        .select(
          `
          *,
          vendor_certifications(*),
          vendor_specializations(*)
        `
        )
        .eq('id', vendorId)
        .single();

      if (vendorError) throw vendorError;

      // Fetch designer's relationship with this vendor if authenticated
      let designerRelationship = null;
      if (user) {
        const { data: tradeAccount } = await supabase
          .from('trade_accounts')
          .select('*')
          .eq('vendor_id', vendorId)
          .eq('designer_id', user.id)
          .single();

        const { data: savedVendor } = await supabase
          .from('saved_vendors')
          .select('id')
          .eq('vendor_id', vendorId)
          .eq('designer_id', user.id)
          .single();

        // Get pricing tiers to determine next tier
        let nextTierName = null;
        let nextTierVolume = null;
        if (tradeAccount?.status === 'active' && tradeAccount?.current_tier) {
          const { data: pricingTiers } = await supabase
            .from('vendor_pricing_tiers')
            .select('tier_name, tier_order, minimum_volume')
            .eq('vendor_id', vendorId)
            .order('tier_order', { ascending: true });

          if (pricingTiers) {
            const currentTierIndex = pricingTiers.findIndex(
              (t: { tier_name: string }) => t.tier_name === tradeAccount.current_tier
            );
            if (currentTierIndex !== -1 && currentTierIndex < pricingTiers.length - 1) {
              const nextTier = pricingTiers[currentTierIndex + 1] as {
                tier_name: string;
                minimum_volume: number | null;
              };
              nextTierName = nextTier.tier_name;
              nextTierVolume = nextTier.minimum_volume;
            }
          }
        }

        designerRelationship = {
          accountStatus: tradeAccount?.status ?? 'none',
          currentTier: tradeAccount?.current_tier ?? null,
          currentVolume: tradeAccount?.ytd_volume ?? 0,
          nextTierName,
          nextTierVolume,
          isSaved: !!savedVendor,
        };
      }

      // Fetch featured products
      const { data: featuredProducts } = await supabase
        .from('products')
        .select('id, name, images, price_retail, price_trade')
        .eq('vendor_id', vendorId)
        .eq('is_featured', true)
        .limit(6);

      // Fetch product count
      const { count: productCount } = await supabase
        .from('products')
        .select('id', { count: 'exact', head: true })
        .eq('vendor_id', vendorId);

      return {
        ...vendor,
        designerRelationship,
        featuredProducts: featuredProducts ?? [],
        productCount: productCount ?? 0,
      };
    },
    enabled: !!vendorId,
  });
}

/**
 * Fetch products for a specific vendor
 */
export function useVendorProducts(
  vendorId: string,
  filters?: ProductFilter,
  pagination?: Pagination
) {
  return useQuery({
    queryKey: ['vendor-products', vendorId, filters, pagination],
    queryFn: async () => {
      const supabase = getSupabase();
      let query = supabase
        .from('products')
        .select('*, product_styles(style:styles(*))', { count: 'exact' })
        .eq('vendor_id', vendorId);

      // Apply filters
      if (filters?.search) {
        query = query.ilike('name', `%${filters.search}%`);
      }
      if (filters?.priceMin) {
        query = query.gte('price_retail', filters.priceMin);
      }
      if (filters?.priceMax) {
        query = query.lte('price_retail', filters.priceMax);
      }

      // Apply pagination
      const page = pagination?.page ?? 1;
      const pageSize = pagination?.pageSize ?? 20;
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      query = query.range(from, to).order('created_at', { ascending: false });

      const { data, error, count } = await query;

      if (error) throw error;

      return {
        data: data ?? [],
        pagination: {
          page,
          pageSize,
          total: count ?? 0,
          totalPages: Math.ceil((count ?? 0) / pageSize),
        },
      };
    },
    enabled: !!vendorId,
  });
}

/**
 * Fetch designer's trade accounts with all vendors
 */
export function useTradeAccounts() {
  return useQuery({
    queryKey: ['trade-accounts'],
    queryFn: async () => {
      const supabase = getSupabase() as any;

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return { accounts: [], pendingApplications: [] };

      // Fetch active trade accounts
      const { data: accounts, error: accountsError } = await supabase
        .from('trade_accounts')
        .select(
          `
          *,
          vendor:vendors(id, name, trade_name, logo_url, market_position)
        `
        )
        .eq('designer_id', user.id)
        .in('status', ['active', 'pending']);

      if (accountsError) throw accountsError;

      // Fetch pending applications
      const { data: applications, error: applicationsError } = await supabase
        .from('trade_applications')
        .select(
          `
          *,
          vendor:vendors(id, name, trade_name, logo_url, market_position)
        `
        )
        .eq('designer_id', user.id)
        .in('status', ['submitted', 'under-review', 'documents-requested']);

      if (applicationsError) throw applicationsError;

      return {
        accounts: accounts ?? [],
        pendingApplications: applications ?? [],
      };
    },
  });
}

/**
 * Fetch reviews for a specific vendor
 */
export function useVendorReviews(vendorId: string, pagination?: Pagination) {
  return useQuery({
    queryKey: ['vendor-reviews', vendorId, pagination],
    queryFn: async () => {
      const supabase = getSupabase() as any;

      const page = pagination?.page ?? 1;
      const pageSize = pagination?.pageSize ?? 10;
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      const { data, error, count } = await supabase
        .from('vendor_reviews')
        .select(
          `
          *,
          designer:designers(id, display_name, avatar_url)
        `,
          { count: 'exact' }
        )
        .eq('vendor_id', vendorId)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;

      return {
        data: data ?? [],
        pagination: {
          page,
          pageSize,
          total: count ?? 0,
          totalPages: Math.ceil((count ?? 0) / pageSize),
        },
      };
    },
    enabled: !!vendorId,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// VENDOR MUTATION HOOKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Toggle save/unsave a vendor
 */
export function useToggleVendorSave() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ vendorId, notes }: { vendorId: string; notes?: string }) => {
      const supabase = getSupabase() as any;

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Check if already saved
      const { data: existing } = await supabase
        .from('saved_vendors')
        .select('id')
        .eq('vendor_id', vendorId)
        .eq('designer_id', user.id)
        .single();

      if (existing) {
        // Unsave - delete the record
        const { error } = await supabase
          .from('saved_vendors')
          .delete()
          .eq('vendor_id', vendorId)
          .eq('designer_id', user.id);

        if (error) throw error;
        return { saved: false };
      } else {
        // Save - insert new record
        const { error } = await supabase.from('saved_vendors').insert({
          vendor_id: vendorId,
          designer_id: user.id,
          notes: notes ?? null,
          saved_at: new Date().toISOString(),
        });

        if (error) throw error;
        return { saved: true };
      }
    },
    onSuccess: (_, { vendorId }) => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      queryClient.invalidateQueries({ queryKey: ['vendor', vendorId] });
      queryClient.invalidateQueries({ queryKey: ['saved-vendors'] });
    },
  });
}

/**
 * Submit a vendor review
 */
export function useSubmitVendorReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      vendorId,
      review,
    }: {
      vendorId: string;
      review: VendorReviewInput;
    }) => {
      const supabase = getSupabase() as any;

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Calculate overall rating from dimension ratings
      const { quality, finish, delivery, service, value } = review.ratings;
      const overallRating = (quality + finish + delivery + service + value) / 5;

      // Insert the review
      const { data, error } = await supabase
        .from('vendor_reviews')
        .insert({
          vendor_id: vendorId,
          designer_id: user.id,
          rating_quality: quality,
          rating_finish: finish,
          rating_delivery: delivery,
          rating_service: service,
          rating_value: value,
          overall_rating: overallRating,
          written_review: review.writtenReview ?? null,
          lead_time_accuracy: review.leadTimeAccuracy ?? null,
          lead_time_weeks_over: review.leadTimeWeeksOver ?? null,
          has_ordered_recently: review.hasOrderedRecently,
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;

      // Insert specialization votes from the review
      if (review.specializations?.length) {
        const specializationVotes = review.specializations.map((specializationId) => ({
          vendor_id: vendorId,
          designer_id: user.id,
          specialization_id: specializationId,
          created_at: new Date().toISOString(),
        }));

        await supabase.from('vendor_specialization_votes').upsert(specializationVotes);
      }

      return data;
    },
    onSuccess: (_, { vendorId }) => {
      queryClient.invalidateQueries({ queryKey: ['vendor', vendorId] });
      queryClient.invalidateQueries({ queryKey: ['vendor-reviews', vendorId] });
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
    },
  });
}

/**
 * Vote on a vendor specialization
 */
export function useVoteOnSpecialization() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      vendorId,
      vote,
    }: {
      vendorId: string;
      vote: SpecializationVote;
    }) => {
      const supabase = getSupabase() as any;

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('vendor_specialization_votes')
        .upsert({
          vendor_id: vendorId,
          designer_id: user.id,
          specialization_id: vote.specializationId,
          rating: vote.rating,
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, { vendorId }) => {
      queryClient.invalidateQueries({ queryKey: ['vendor', vendorId] });
      queryClient.invalidateQueries({ queryKey: ['vendor-specializations', vendorId] });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// VENDOR FIND OR CREATE
// ═══════════════════════════════════════════════════════════════════════════

export interface FindOrCreateVendorInput {
  name: string;
  website?: string;
  logoUrl?: string;
  primaryCategory?: string;
  marketPosition?: 'entry' | 'mid' | 'premium' | 'luxury' | 'ultra-luxury';
}

export interface FindOrCreateVendorResult {
  vendorId: string;
  isNew: boolean;
  vendor: {
    id: string;
    name: string;
    website: string | null;
    logo_url: string | null;
  };
}

/**
 * Find an existing vendor by name/website or create a new one
 * Used by the Chrome extension to link extracted manufacturers to vendor entities
 */
export function useFindOrCreateVendor() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: FindOrCreateVendorInput): Promise<FindOrCreateVendorResult> => {
      const supabase = getSupabase() as any;

      // Normalize the name for matching
      const normalizedName = input.name.trim().toLowerCase();

      // First, try to find by exact name match (case-insensitive)
      const { data: exactMatch } = await supabase
        .from('vendors')
        .select('id, name, website, logo_url')
        .ilike('name', normalizedName)
        .limit(1)
        .single();

      if (exactMatch) {
        return {
          vendorId: exactMatch.id,
          isNew: false,
          vendor: exactMatch,
        };
      }

      // Try to match by trade_name
      const { data: tradeMatch } = await supabase
        .from('vendors')
        .select('id, name, website, logo_url')
        .ilike('trade_name', normalizedName)
        .limit(1)
        .single();

      if (tradeMatch) {
        return {
          vendorId: tradeMatch.id,
          isNew: false,
          vendor: tradeMatch,
        };
      }

      // If website provided, try to match by domain
      if (input.website) {
        try {
          const domain = new URL(
            input.website.startsWith('http') ? input.website : `https://${input.website}`
          ).hostname.replace('www.', '');

          const { data: domainMatch } = await supabase
            .from('vendors')
            .select('id, name, website, logo_url')
            .ilike('website', `%${domain}%`)
            .limit(1)
            .single();

          if (domainMatch) {
            return {
              vendorId: domainMatch.id,
              isNew: false,
              vendor: domainMatch,
            };
          }
        } catch {
          // Invalid URL, skip domain matching
        }
      }

      // No match found - create new vendor
      const { data: newVendor, error } = await supabase
        .from('vendors')
        .insert({
          name: input.name.trim(),
          website: input.website || null,
          logo_url: input.logoUrl || null,
          primary_category: input.primaryCategory || null,
          market_position: input.marketPosition || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select('id, name, website, logo_url')
        .single();

      if (error) throw error;

      return {
        vendorId: newVendor.id,
        isNew: true,
        vendor: newVendor,
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
    },
  });
}

/**
 * Search for vendors by name (for autocomplete/typeahead)
 */
export function useSearchVendors(searchTerm: string, enabled = true) {
  return useQuery({
    queryKey: ['vendors-search', searchTerm],
    queryFn: async () => {
      if (!searchTerm || searchTerm.length < 2) return [];

      const supabase = getSupabase() as any;

      const { data, error } = await supabase
        .from('vendors')
        .select('id, name, trade_name, logo_url, website, market_position')
        .or(`name.ilike.%${searchTerm}%,trade_name.ilike.%${searchTerm}%`)
        .limit(10)
        .order('name');

      if (error) throw error;
      return data ?? [];
    },
    enabled: enabled && searchTerm.length >= 2,
  });
}
