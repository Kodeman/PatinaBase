/**
 * /api/rooms
 *
 * GET  — list current user's rooms, newest first, with scan + saved-item counts.
 * POST — create a new room and invalidate any stale feed cache for the user.
 *        Body: { name, type?, length_meters?, width_meters?, height_meters?, style_signals? }
 */
import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@patina/supabase/server';
import { createAdminClient } from '@patina/supabase/client';

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('rooms')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rooms: data ?? [] });
}

export async function POST(request: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await request.json();
  if (!body?.name || typeof body.name !== 'string') {
    return NextResponse.json({ error: 'name_required' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Derive floor area / volume if dimensions provided
  const length = Number(body.length_meters) || null;
  const width = Number(body.width_meters) || null;
  const height = Number(body.height_meters) || null;
  const floor_area_sqm = length && width ? Number((length * width).toFixed(2)) : null;
  const volume_cbm =
    length && width && height ? Number((length * width * height).toFixed(2)) : null;

  const { data, error } = await admin
    .from('rooms')
    .insert({
      user_id: user.id,
      name: body.name.trim(),
      type: body.type ?? 'other',
      length_meters: length,
      width_meters: width,
      height_meters: height,
      floor_area_sqm,
      volume_cbm,
      style_signals: body.style_signals ?? null,
      has_active_emergence: true,
      emergence_count: 1,
      emergence_message: 'Room just created',
      last_emergence_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Invalidate any existing feed cache for this (user, room)
  await admin
    .from('feed_cache_meta')
    .delete()
    .eq('user_id', user.id)
    .eq('room_id', data.id);

  return NextResponse.json({ room: data }, { status: 201 });
}
