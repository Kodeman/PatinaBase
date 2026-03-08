import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient, createBrowserClient } from '../client';
import type { AccountStatus } from '@patina/shared';
import type { Pagination, ProductFilter } from '@patina/shared/validation';

// Lazy client getter to avoid module-level initialization during SSR
const getSupabase = () => createClient();
// Browser client for authenticated queries
const getAuthSupabase = () => createBrowserClient();

// ═══════════════════════════════════════════════════════════════════════════
// VENDOR PRICING TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface VendorPricingInfo {
  id: string;
  name: string;
  tradeName: string | null;
  logoUrl: string | null;
  designerRatingAvg: number | null;
  reviewCount: number;
  accountStatus: AccountStatus;
  currentTier: string | null;
  tierDiscount: number | null;
  discountDisplay: string | null;
  leadTimeQuickShip: string | null;
  leadTimeMTO: string | null;
  certifications: Array<{
    id: string;
    type: 'fsc' | 'greenguard' | 'bcorp' | 'fairtrade' | 'custom';
    level: string | null;
    isVerified: boolean;
  }>;
}

export interface ProductWithVendorPricing {
  id: string;
  name: string;
  description: string | null;
  priceRetail: number | null;
  priceTrade: number | null;
  designerCost: number | null;
  images: string[];
  materials: string[];
  sourceUrl: string;
  sku: string | null;
  dimensions: Record<string, unknown> | null;
  leadTimeWeeks: number | null;
  vendorId: string | null;       // Manufacturer
  retailerId: string | null;     // Retailer - where captured/purchased
  capturedAt: string;
  capturedBy: string | null;
  vendor: VendorPricingInfo | null;       // Manufacturer info
  retailer: VendorPricingInfo | null;     // Retailer info
  styles?: Array<{ id: string; name: string; colorHex?: string | null }>;
}

// ═══════════════════════════════════════════════════════════════════════════
// PRODUCT HOOKS
// ═══════════════════════════════════════════════════════════════════════════

export interface ProductSort {
  field: 'name' | 'price' | 'dateAdded' | 'vendor';
  direction: 'asc' | 'desc';
}

const SORT_COLUMN_MAP: Record<ProductSort['field'], string> = {
  name: 'name',
  price: 'price_retail',
  dateAdded: 'created_at',
  vendor: 'vendor_id',
};

export function useProducts(filters?: ProductFilter, pagination?: Pagination, sort?: ProductSort) {
  return useQuery({
    queryKey: ['products', filters, pagination, sort],
    queryFn: async () => {
      const supabase = getSupabase();
      let query = supabase
        .from('products')
        .select('*, vendor:vendors!products_vendor_id_fkey(*), product_styles(style:styles(*))', { count: 'exact' });

      // Apply filters
      if (filters?.search) {
        query = query.ilike('name', `%${filters.search}%`);
      }
      if (filters?.vendorIds?.length) {
        query = query.in('vendor_id', filters.vendorIds);
      }
      if (filters?.priceMin) {
        query = query.gte('price_retail', filters.priceMin);
      }
      if (filters?.priceMax) {
        query = query.lte('price_retail', filters.priceMax);
      }
      if (filters?.materials?.length) {
        query = query.overlaps('materials', filters.materials);
      }

      // Style filter: need to first get product IDs matching the styles
      if (filters?.styleIds?.length) {
        const { data: styleMatches } = await supabase
          .from('product_styles')
          .select('product_id')
          .in('style_id', filters.styleIds);
        const productIds = [...new Set((styleMatches ?? []).map((m: { product_id: string }) => m.product_id))];
        if (productIds.length === 0) {
          return { data: [], pagination: { page: 1, pageSize: pagination?.pageSize ?? 20, total: 0, totalPages: 0 } };
        }
        query = query.in('id', productIds);
      }

      // Apply pagination
      const page = pagination?.page ?? 1;
      const pageSize = pagination?.pageSize ?? 20;
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      // Apply sort
      const sortColumn = sort ? SORT_COLUMN_MAP[sort.field] : 'created_at';
      const ascending = sort ? sort.direction === 'asc' : false;
      query = query.range(from, to).order(sortColumn, { ascending });

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
 * Fetch products with enriched vendor pricing data based on user's trade accounts
 * Includes designer cost calculation, tier info, certifications, and lead times
 */
export function useProductsWithVendorPricing(filters?: ProductFilter, pagination?: Pagination, sort?: ProductSort) {
  return useQuery({
    queryKey: ['products-with-vendor-pricing', filters, pagination, sort],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getAuthSupabase() as any;

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();

      // Fetch user's trade accounts to determine tier discounts
      let tradeAccountsMap: Map<string, { status: AccountStatus; tier: string | null; discount: number | null; discountDisplay: string | null }> = new Map();

      if (user) {
        const { data: tradeAccounts } = await supabase
          .from('trade_accounts')
          .select('vendor_id, status, current_tier, discount_percent, discount_display')
          .eq('designer_id', user.id);

        if (tradeAccounts) {
          tradeAccountsMap = new Map(
            tradeAccounts.map((ta: { vendor_id: string; status: string; current_tier: string | null; discount_percent: number | null; discount_display: string | null }) => [
              ta.vendor_id,
              {
                status: ta.status as AccountStatus,
                tier: ta.current_tier,
                discount: ta.discount_percent,
                discountDisplay: ta.discount_display,
              },
            ])
          );
        }
      }

      // Build product query with vendor (manufacturer) and retailer data
      let query = supabase
        .from('products')
        .select(`
          *,
          vendor:vendors!products_vendor_id_fkey(
            *,
            vendor_certifications(id, certification_type, certification_level, is_verified)
          ),
          retailer:vendors!products_retailer_id_fkey(
            *,
            vendor_certifications(id, certification_type, certification_level, is_verified)
          ),
          product_styles(style:styles(*))
        `, { count: 'exact' });

      // Apply filters
      if (filters?.search) {
        query = query.ilike('name', `%${filters.search}%`);
      }
      if (filters?.vendorIds?.length) {
        query = query.in('vendor_id', filters.vendorIds);
      }
      if (filters?.priceMin) {
        query = query.gte('price_retail', filters.priceMin);
      }
      if (filters?.priceMax) {
        query = query.lte('price_retail', filters.priceMax);
      }
      if (filters?.materials?.length) {
        query = query.overlaps('materials', filters.materials);
      }

      // Style filter: two-step query
      if (filters?.styleIds?.length) {
        const { data: styleMatches } = await supabase
          .from('product_styles')
          .select('product_id')
          .in('style_id', filters.styleIds);
        const productIds = [...new Set((styleMatches ?? []).map((m: { product_id: string }) => m.product_id))];
        if (productIds.length === 0) {
          return { data: [] as ProductWithVendorPricing[], pagination: { page: 1, pageSize: pagination?.pageSize ?? 20, total: 0, totalPages: 0 } };
        }
        query = query.in('id', productIds);
      }

      // Apply pagination
      const page = pagination?.page ?? 1;
      const pageSize = pagination?.pageSize ?? 20;
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      // Apply sort
      const sortColumn = sort ? SORT_COLUMN_MAP[sort.field] : 'created_at';
      const ascending = sort ? sort.direction === 'asc' : false;
      query = query.range(from, to).order(sortColumn, { ascending });

      const { data: products, error, count } = await query;

      if (error) throw error;

      // Define vendor data shape type (uses * select, matches actual DB columns)
      type VendorData = {
        id: string;
        name: string;
        logo_url: string | null;
        designer_rating_avg: number | null;
        review_count: number | null;
        lead_times: Record<string, string> | null;
        vendor_certifications: Array<{
          id: string;
          certification_type: string;
          certification_level: string | null;
          is_verified: boolean;
        }>;
        [key: string]: unknown; // Allow other columns from *
      } | null;

      // Helper to transform vendor data to VendorPricingInfo
      const transformVendor = (vendorData: VendorData, tradeAccount: { status: AccountStatus; tier: string | null; discount: number | null; discountDisplay: string | null } | null): VendorPricingInfo | null => {
        if (!vendorData) return null;
        return {
          id: vendorData.id,
          name: vendorData.name,
          tradeName: (vendorData as Record<string, unknown>).trade_name as string | null ?? null,
          logoUrl: vendorData.logo_url,
          designerRatingAvg: vendorData.designer_rating_avg,
          reviewCount: vendorData.review_count ?? 0,
          accountStatus: tradeAccount?.status ?? 'none',
          currentTier: tradeAccount?.tier ?? null,
          tierDiscount: tradeAccount?.discount ?? null,
          discountDisplay: tradeAccount?.discountDisplay ?? null,
          leadTimeQuickShip: (vendorData.lead_times as Record<string, string> | null)?.quick_ship ?? null,
          leadTimeMTO: (vendorData.lead_times as Record<string, string> | null)?.mto ?? null,
          certifications: (vendorData.vendor_certifications ?? []).map((cert) => ({
            id: cert.id,
            type: cert.certification_type as 'fsc' | 'greenguard' | 'bcorp' | 'fairtrade' | 'custom',
            level: cert.certification_level,
            isVerified: cert.is_verified,
          })),
        };
      };

      // Transform products with vendor and retailer pricing
      const enrichedProducts: ProductWithVendorPricing[] = (products ?? []).map((product: {
        id: string;
        name: string;
        description: string | null;
        price_retail: number | null;
        price_trade: number | null;
        dimensions: Record<string, unknown> | null;
        lead_time_weeks: number | null;
        images: string[];
        materials: string[];
        source_url: string;
        sku: string | null;
        vendor_id: string | null;
        retailer_id: string | null;
        captured_at: string;
        captured_by: string | null;
        vendor: VendorData;
        retailer: VendorData;
        product_styles: Array<{ style: { id: string; name: string; color_hex?: string | null } }>;
      }) => {
        const vendorId = product.vendor?.id;
        const retailerId = product.retailer?.id;
        const vendorTradeAccount = vendorId ? tradeAccountsMap.get(vendorId) : null;
        const retailerTradeAccount = retailerId ? tradeAccountsMap.get(retailerId) : null;

        // Calculate designer cost based on tier discount (prefer retailer account, then vendor)
        let designerCost: number | null = null;
        const activeAccount = retailerTradeAccount?.status === 'active' ? retailerTradeAccount
          : vendorTradeAccount?.status === 'active' ? vendorTradeAccount : null;

        if (product.price_retail && activeAccount?.discount) {
          designerCost = Math.round(product.price_retail * (1 - activeAccount.discount / 100));
        } else if (product.price_trade) {
          // Fall back to trade price if available
          designerCost = product.price_trade;
        }

        return {
          id: product.id,
          name: product.name,
          description: product.description,
          priceRetail: product.price_retail,
          priceTrade: product.price_trade,
          designerCost,
          images: product.images ?? [],
          materials: product.materials ?? [],
          sourceUrl: product.source_url,
          sku: product.sku,
          dimensions: product.dimensions ?? null,
          leadTimeWeeks: product.lead_time_weeks ?? null,
          vendorId: product.vendor_id,
          retailerId: product.retailer_id,
          capturedAt: product.captured_at,
          capturedBy: product.captured_by,
          vendor: transformVendor(product.vendor, vendorTradeAccount ?? null),
          retailer: transformVendor(product.retailer, retailerTradeAccount ?? null),
          styles: product.product_styles?.map((ps) => ({
            id: ps.style.id,
            name: ps.style.name,
            colorHex: ps.style.color_hex,
          })),
        };
      });

      return {
        data: enrichedProducts,
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

export function useProduct(id: string) {
  return useQuery({
    queryKey: ['product', id],
    queryFn: async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('products')
        .select('*, vendor:vendors!products_vendor_id_fkey(*), product_styles(style:styles(*))')
        .eq('id', id)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });
}

/**
 * Fetch single product with enriched vendor pricing data
 * Includes designer cost calculation, tier info, certifications, and lead times
 */
export function useProductWithVendorPricing(id: string) {
  return useQuery({
    queryKey: ['product-with-vendor-pricing', id],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getAuthSupabase() as any;

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();

      // Fetch product with vendor (manufacturer) and retailer data
      const { data: product, error } = await supabase
        .from('products')
        .select(`
          *,
          vendor:vendors!products_vendor_id_fkey(
            *,
            vendor_certifications(id, certification_type, certification_level, is_verified)
          ),
          retailer:vendors!products_retailer_id_fkey(
            *,
            vendor_certifications(id, certification_type, certification_level, is_verified)
          ),
          product_styles(style:styles(*))
        `)
        .eq('id', id)
        .single();

      if (error) throw error;

      // Fetch user's trade accounts with vendor and retailer if authenticated
      type TradeAccountInfo = { status: AccountStatus; tier: string | null; discount: number | null; discountDisplay: string | null };
      let vendorTradeAccount: TradeAccountInfo | null = null;
      let retailerTradeAccount: TradeAccountInfo | null = null;

      if (user) {
        // Fetch trade accounts for vendor and retailer in parallel
        const [vendorTaResult, retailerTaResult] = await Promise.all([
          product.vendor?.id
            ? supabase
                .from('trade_accounts')
                .select('status, current_tier, discount_percent, discount_display')
                .eq('designer_id', user.id)
                .eq('vendor_id', product.vendor.id)
                .maybeSingle()
            : Promise.resolve({ data: null }),
          product.retailer?.id
            ? supabase
                .from('trade_accounts')
                .select('status, current_tier, discount_percent, discount_display')
                .eq('designer_id', user.id)
                .eq('vendor_id', product.retailer.id)
                .maybeSingle()
            : Promise.resolve({ data: null }),
        ]);

        if (vendorTaResult.data) {
          const ta = vendorTaResult.data;
          vendorTradeAccount = {
            status: ta.status as AccountStatus,
            tier: ta.current_tier,
            discount: ta.discount_percent,
            discountDisplay: ta.discount_display,
          };
        }

        if (retailerTaResult.data) {
          const ta = retailerTaResult.data;
          retailerTradeAccount = {
            status: ta.status as AccountStatus,
            tier: ta.current_tier,
            discount: ta.discount_percent,
            discountDisplay: ta.discount_display,
          };
        }
      }

      // Calculate designer cost based on tier discount (prefer retailer account, then vendor)
      let designerCost: number | null = null;
      const activeAccount = retailerTradeAccount?.status === 'active' ? retailerTradeAccount
        : vendorTradeAccount?.status === 'active' ? vendorTradeAccount : null;

      if (product.price_retail && activeAccount?.discount) {
        designerCost = Math.round(product.price_retail * (1 - activeAccount.discount / 100));
      } else if (product.price_trade) {
        designerCost = product.price_trade;
      }

      // Helper to transform vendor data
      const transformVendorData = (vendorData: typeof product.vendor, tradeAccount: TradeAccountInfo | null): VendorPricingInfo | null => {
        if (!vendorData) return null;
        return {
          id: vendorData.id,
          name: vendorData.name,
          tradeName: vendorData.trade_name ?? null,
          logoUrl: vendorData.logo_url,
          designerRatingAvg: vendorData.designer_rating_avg,
          reviewCount: vendorData.review_count ?? 0,
          accountStatus: tradeAccount?.status ?? 'none',
          currentTier: tradeAccount?.tier ?? null,
          tierDiscount: tradeAccount?.discount ?? null,
          discountDisplay: tradeAccount?.discountDisplay ?? null,
          leadTimeQuickShip: (vendorData.lead_times as Record<string, string> | null)?.quick_ship ?? null,
          leadTimeMTO: (vendorData.lead_times as Record<string, string> | null)?.mto ?? null,
          certifications: (vendorData.vendor_certifications ?? []).map((cert: { id: string; certification_type: string; certification_level: string | null; is_verified: boolean }) => ({
            id: cert.id,
            type: cert.certification_type as 'fsc' | 'greenguard' | 'bcorp' | 'fairtrade' | 'custom',
            level: cert.certification_level,
            isVerified: cert.is_verified,
          })),
        };
      };

      const enrichedProduct: ProductWithVendorPricing = {
        id: product.id,
        name: product.name,
        description: product.description,
        priceRetail: product.price_retail,
        priceTrade: product.price_trade,
        designerCost,
        images: product.images ?? [],
        materials: product.materials ?? [],
        sourceUrl: product.source_url,
        sku: product.sku,
        dimensions: product.dimensions ?? null,
        leadTimeWeeks: product.lead_time_weeks ?? null,
        vendorId: product.vendor_id,
        retailerId: product.retailer_id,
        capturedAt: product.captured_at,
        capturedBy: product.captured_by,
        vendor: transformVendorData(product.vendor, vendorTradeAccount),
        retailer: transformVendorData(product.retailer, retailerTradeAccount),
        styles: product.product_styles?.map((ps: { style: { id: string; name: string; color_hex?: string | null } }) => ({
          id: ps.style.id,
          name: ps.style.name,
          colorHex: ps.style.color_hex,
        })),
      };

      return enrichedProduct;
    },
    enabled: !!id,
  });
}

export function useCreateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      name: string;
      source_url: string;
      images: string[];
      description?: string;
      price_retail?: number;
      price_trade?: number;
      dimensions?: unknown;
      materials?: string[];
      vendor_id?: string | null;    // Manufacturer
      retailer_id?: string | null;  // Retailer - where captured/purchased
      captured_by: string;
      style_ids?: string[];
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getAuthSupabase() as any;
      const { style_ids, ...productData } = input;

      // Insert the product
      const { data: product, error } = await supabase
        .from('products')
        .insert({
          ...productData,
          materials: productData.materials ?? [],
          captured_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;

      // Insert product styles if provided
      if (style_ids && style_ids.length > 0 && product) {
        const styleInserts = style_ids.map((styleId) => ({
          product_id: product.id,
          style_id: styleId,
          confidence: 1.0,
          assigned_by: input.captured_by,
        }));

        const { error: styleError } = await supabase
          .from('product_styles')
          .insert(styleInserts);

        if (styleError) {
          console.error('Failed to insert product styles:', styleError);
          // Don't throw - product was created successfully
        }
      }

      return product as { id: string };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['products-with-vendor-pricing'] });
    },
  });
}

export function useUpdateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; [key: string]: unknown }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getAuthSupabase() as any;
      const { data, error } = await supabase
        .from('products')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data: { id: string }) => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['products-with-vendor-pricing'] });
      queryClient.invalidateQueries({ queryKey: ['product', data.id] });
      queryClient.invalidateQueries({ queryKey: ['product-with-vendor-pricing', data.id] });
    },
  });
}
