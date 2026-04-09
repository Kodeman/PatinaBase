/**
 * /api/rooms/:id/items
 *
 * GET  — list saved items for this room (joined with products for image/price).
 * POST — add a product to the room. Body: { product_id, source?, notes?, transform? }
 *        `source` ∈ 'manual' | 'ar_placement' | 'feed'
 *        `transform` is an optional JSON blob for AR placement pose.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@patina/supabase/server';
import { createAdminClient } from '@patina/supabase/client';

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await context.params;

  const admin = createAdminClient();
  const { data: room } = await admin
    .from('rooms')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!room) return NextResponse.json({ error: 'room_not_found' }, { status: 404 });

  const { data, error } = await admin
    .from('saved_items')
    .select('*, product:products(id, name, price_retail, images, dimensions)')
    .eq('room_id', id)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await context.params;
  const body = await request.json();

  if (!body?.product_id) {
    return NextResponse.json({ error: 'product_id_required' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: room } = await admin
    .from('rooms')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!room) return NextResponse.json({ error: 'room_not_found' }, { status: 404 });

  // Snapshot product info so saved_items stays populated even if the product row is later changed
  const { data: product } = await admin
    .from('products')
    .select('id, name, price_retail, images')
    .eq('id', body.product_id)
    .maybeSingle();
  if (!product) return NextResponse.json({ error: 'product_not_found' }, { status: 404 });

  const firstImage = Array.isArray(product.images)
    ? (product.images[0] as any)?.url ?? null
    : null;

  const notes =
    body.notes ??
    (body.transform ? `transform:${JSON.stringify(body.transform)}` : null);

  const { data: item, error } = await admin
    .from('saved_items')
    .insert({
      user_id: user.id,
      room_id: id,
      product_id: product.id,
      name: product.name,
      image_url: firstImage,
      price_in_cents: product.price_retail
        ? Math.round(Number(product.price_retail) * 100)
        : null,
      source: body.source ?? 'manual',
      notes,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Increment saved_item_count via RPC if available, else best-effort update
  const { error: rpcErr } = await admin.rpc('increment_room_saved_items', {
    p_room_id: id,
  } as any);
  if (rpcErr) {
    await admin
      .from('rooms')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', id);
  }

  return NextResponse.json({ item }, { status: 201 });
}
