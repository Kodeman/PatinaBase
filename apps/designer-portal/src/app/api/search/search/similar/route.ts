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
    tier,
    images: product.images ?? [],
    materials: product.materials ?? [],
    tags,
    styleTags: product.style_tags ?? [],
    vendorId: product.vendor_id,
    createdAt: product.created_at,
    updatedAt: product.updated_at,
  };
}

// GET /api/search/search/similar - Products related to a given product.
// v1 heuristic: same category, excluding the source product. (Vector
// similarity lives in a deferred service; this keeps real data flowing.)
export async function GET(request: NextRequest) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generated types not yet updated for new columns
    const supabase: any = await createServerClient();
    const { searchParams } = new URL(request.url);

    const productId = searchParams.get('productId');
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10) || 20, 50);

    if (!productId) {
      return NextResponse.json({ data: { products: [] } });
    }

    const { data: target, error: targetError } = await supabase
      .from('products')
      .select('id, category')
      .eq('id', productId)
      .maybeSingle();

    if (targetError) {
      return NextResponse.json({ error: targetError.message }, { status: 500 });
    }
    if (!target) {
      return NextResponse.json({ data: { products: [] } });
    }

    let query = supabase
      .from('products')
      .select('*')
      .eq('status', 'published')
      .neq('id', productId)
      .limit(limit);

    if (target.category) query = query.eq('category', target.category);

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: { products: (data ?? []).map(snakeToCamel) } });
  } catch (error) {
    console.error('[API] GET /search/similar error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
