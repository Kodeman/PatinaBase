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
// Primary path: pgvector similarity via find_products_similar_to (migration
// 00008). Embeddings are unpopulated until the Aesthete jobs pipeline lands
// (docs/prds/AE/aesthete-engine-system-design.md §16), so we fall back to the
// v1 same-category heuristic whenever the RPC yields no rows — preserving
// today's behavior. Response shape is unchanged.
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

    // ── Primary: vector similarity (00008) ─────────────────────────────────
    // Returns thin rows (id, name, images, price_retail, similarity) ordered
    // by similarity; empty when the source product has no embedding yet.
    const { data: similarRows, error: rpcError } = await supabase.rpc('find_products_similar_to', {
      product_id: productId,
      match_count: limit,
    });

    if (!rpcError && Array.isArray(similarRows) && similarRows.length > 0) {
      const ids = similarRows.map((row: { id: string }) => row.id);

      const { data: fullRows, error: fetchError } = await supabase
        .from('products')
        .select('*')
        .in('id', ids)
        .eq('status', 'published');

      if (!fetchError && fullRows && fullRows.length > 0) {
        // Preserve the RPC's similarity ordering.
        const byId = new Map(
          (fullRows as Record<string, unknown>[]).map((row) => [row.id as string, row])
        );
        const ordered = ids
          .map((id: string) => byId.get(id))
          .filter((row: Record<string, unknown> | undefined): row is Record<string, unknown> =>
            Boolean(row)
          );

        if (ordered.length > 0) {
          return NextResponse.json({ data: { products: ordered.map(snakeToCamel) } });
        }
      }
      // Similarity hits existed but none were published/fetchable — fall
      // through to the heuristic rather than returning an empty set.
    }

    // ── Fallback: same-category heuristic (pre-embedding behavior) ─────────
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
