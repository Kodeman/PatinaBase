/**
 * GET /api/feed/:roomId?limit=20&offset=0
 *
 * Returns the ranked product feed for a (user, room) pair. Reads from
 * `feed_cache_meta` (populated nightly by the aesthete-engine pipeline),
 * joins the product rows, and enriches each product with its
 * `spatial_context` entries so the iOS client can render "why it fits"
 * copy directly.
 *
 * If the cache is missing or expired, returns an empty `products` array
 * and `cache_generated_at: null` — a follow-up iteration will add a live
 * pgvector fallback.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@patina/supabase/server';
import { createAdminClient } from '@patina/supabase/client';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ roomId: string }> },
) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { roomId } = await context.params;
  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 20), 50);
  const offset = Math.max(Number(url.searchParams.get('offset') ?? 0), 0);

  const admin = createAdminClient();

  // 1. Load room context (verifies ownership)
  const { data: room } = await admin
    .from('rooms')
    .select('id, name, type, dimensions, user_id')
    .eq('id', roomId)
    .eq('user_id', user.id)
    .single();

  if (!room) return NextResponse.json({ error: 'room_not_found' }, { status: 404 });

  // 2. Load cached ranking
  const { data: cache } = await admin
    .from('feed_cache_meta')
    .select('products_ranked, new_since_last_view, generated_at, expires_at')
    .eq('user_id', user.id)
    .eq('room_id', roomId)
    .maybeSingle();

  const rankedIds: string[] = cache?.products_ranked ?? [];
  const pageIds = rankedIds.slice(offset, offset + limit);

  if (pageIds.length === 0) {
    return NextResponse.json({
      room,
      products: [],
      new_count: cache?.new_since_last_view ?? 0,
      total: rankedIds.length,
      cache_generated_at: cache?.generated_at ?? null,
    });
  }

  // 3. Load products + spatial context in parallel
  const [productsRes, spatialRes] = await Promise.all([
    admin
      .from('products')
      .select('id, name, price_retail, images, dimensions, vendor_id')
      .in('id', pageIds),
    admin
      .from('spatial_context')
      .select('product_id, context_type, context_text')
      .eq('room_id', roomId)
      .in('product_id', pageIds),
  ]);

  const spatialByProduct = new Map<
    string,
    Record<string, string>
  >();
  for (const row of spatialRes.data ?? []) {
    const existing = spatialByProduct.get((row as any).product_id) ?? {};
    existing[(row as any).context_type] = (row as any).context_text;
    spatialByProduct.set((row as any).product_id, existing);
  }

  // 4. Preserve ranking order
  const productsById = new Map((productsRes.data ?? []).map((p: any) => [p.id, p]));
  const products = pageIds
    .map((id) => productsById.get(id))
    .filter(Boolean)
    .map((p: any) => ({
      ...p,
      spatial_context: spatialByProduct.get(p.id) ?? {},
    }));

  return NextResponse.json({
    room,
    products,
    new_count: cache?.new_since_last_view ?? 0,
    total: rankedIds.length,
    cache_generated_at: cache?.generated_at ?? null,
  });
}
