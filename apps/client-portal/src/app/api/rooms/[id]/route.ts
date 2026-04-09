/**
 * /api/rooms/:id
 *
 * GET    — single room + its scans + saved item count.
 * PATCH  — update name, type, dimensions, style_signals.
 * DELETE — remove room (scans/items cascade per FK rules).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@patina/supabase/server';
import { createAdminClient } from '@patina/supabase/client';

async function loadOwnedRoom(roomId: string, userId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('rooms')
    .select('*')
    .eq('id', roomId)
    .eq('user_id', userId)
    .maybeSingle();
  return { admin, room: data, error };
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await context.params;

  const { admin, room } = await loadOwnedRoom(id, user.id);
  if (!room) return NextResponse.json({ error: 'room_not_found' }, { status: 404 });

  const [scansRes, itemsRes] = await Promise.all([
    admin.from('room_scans').select('*').eq('room_id', id).order('created_at', { ascending: false }),
    admin.from('saved_items').select('id', { count: 'exact', head: true }).eq('room_id', id),
  ]);

  return NextResponse.json({
    room,
    scans: scansRes.data ?? [],
    saved_item_count: itemsRes.count ?? 0,
  });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await context.params;
  const body = await request.json();

  const { admin, room } = await loadOwnedRoom(id, user.id);
  if (!room) return NextResponse.json({ error: 'room_not_found' }, { status: 404 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of [
    'name',
    'type',
    'length_meters',
    'width_meters',
    'height_meters',
    'style_signals',
  ]) {
    if (body[key] !== undefined) patch[key] = body[key];
  }

  // Recompute derived fields if any dimension changed
  const length = (patch.length_meters ?? room.length_meters) as number | null;
  const width = (patch.width_meters ?? room.width_meters) as number | null;
  const height = (patch.height_meters ?? room.height_meters) as number | null;
  if (length && width) patch.floor_area_sqm = Number((length * width).toFixed(2));
  if (length && width && height)
    patch.volume_cbm = Number((length * width * height).toFixed(2));

  const { data, error } = await admin
    .from('rooms')
    .update(patch)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Invalidate feed cache — dimensions/style likely affect ranking
  await admin.from('feed_cache_meta').delete().eq('user_id', user.id).eq('room_id', id);

  return NextResponse.json({ room: data });
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await context.params;

  const { admin, room } = await loadOwnedRoom(id, user.id);
  if (!room) return NextResponse.json({ error: 'room_not_found' }, { status: 404 });

  const { error } = await admin.from('rooms').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await admin.from('feed_cache_meta').delete().eq('user_id', user.id).eq('room_id', id);
  return NextResponse.json({ ok: true });
}
