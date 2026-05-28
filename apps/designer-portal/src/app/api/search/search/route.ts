import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@patina/supabase/server';

const TIER_VALUES = ['maker_piece', 'designers_pick', 'sourced'] as const;

function snakeToCamel(product: Record<string, unknown>) {
  const tags = (product.tags ?? []) as string[];
  const tier = tags.find((t) => (TIER_VALUES as readonly string[]).includes(t)) ?? null;

  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    brand: product.brand,
    description: product.description,
    shortDescription: product.short_description,
    category: product.category,
    status: product.status,
    sku: product.sku,
    price: product.price_retail ? (product.price_retail as number) / 100 : null,
    priceRetail: product.price_retail,
    tradePrice: product.price_trade ? (product.price_trade as number) / 100 : null,
    mapPrice: product.price_map ? (product.price_map as number) / 100 : null,
    tier,
    finish: product.finish,
    sourceUrl: product.source_url,
    capturedBy: product.captured_by,
    images: product.images ?? [],
    materials: product.materials ?? [],
    dimensions: product.dimensions,
    tags,
    styleTags: product.style_tags ?? [],
    vendorId: product.vendor_id,
    createdAt: product.created_at,
    updatedAt: product.updated_at,
  };
}

// Parse the `filters` param. Accepts a JSON object string (preferred) and
// falls back to an empty object. Supported keys: category, brand, status,
// minPrice, maxPrice (dollars).
function parseFilters(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

// GET /api/search/search - Full-text product search.
export async function GET(request: NextRequest) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generated types not yet updated for new columns
    const supabase: any = await createServerClient();
    const { searchParams } = new URL(request.url);

    const q = searchParams.get('q')?.trim() || '';
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10) || 20, 100);
    const cursorParam = searchParams.get('cursor');
    const offset = cursorParam ? Math.max(0, parseInt(cursorParam, 10) || 0) : 0;
    const sort = searchParams.get('sort') || 'relevance';
    const filters = parseFilters(searchParams.get('filters'));

    let query = supabase
      .from('products')
      .select('*', { count: 'exact' })
      .eq('status', (filters.status as string) || 'published');

    // Full-text search via the generated search_vector tsvector column,
    // falling back to ilike on name for short/partial tokens.
    if (q) {
      query = query.or(
        `name.ilike.%${q}%,brand.ilike.%${q}%,description.ilike.%${q}%`
      );
    }

    if (filters.category) query = query.eq('category', filters.category as string);
    if (filters.brand) query = query.ilike('brand', `%${filters.brand}%`);
    if (filters.minPrice !== undefined && filters.minPrice !== null) {
      query = query.gte('price_retail', Math.round(Number(filters.minPrice) * 100));
    }
    if (filters.maxPrice !== undefined && filters.maxPrice !== null) {
      query = query.lte('price_retail', Math.round(Number(filters.maxPrice) * 100));
    }

    // Sorting
    if (sort === 'price_asc') query = query.order('price_retail', { ascending: true });
    else if (sort === 'price_desc') query = query.order('price_retail', { ascending: false });
    else query = query.order('created_at', { ascending: false });

    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const results = (data ?? []).map(snakeToCamel);
    const total = count ?? results.length;
    const nextOffset = offset + results.length;
    const nextCursor = nextOffset < total ? String(nextOffset) : undefined;

    return NextResponse.json({
      data: {
        results,
        total,
        limit,
        cursor: cursorParam ?? undefined,
        nextCursor,
        facets: {},
      },
    });
  } catch (error) {
    console.error('[API] GET /search error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
