/**
 * /api/rooms/:id/scans
 *
 * GET  — list all scans attached to this room.
 * POST — attach a new scan row pointing at an already-uploaded mesh in storage.
 *        Body: { name, model_url?, model_url_gltf?, scan_data?, dimensions?,
 *                features?, floor_area?, hero_frame_url?, style_signals?,
 *                status?, room_type? }
 *
 * The iOS client is expected to upload the raw LiDAR mesh/USDZ/GLTF to the
 * `room-scans` Supabase storage bucket first, then call this endpoint with the
 * resulting public URL.
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
    .from('room_scans')
    .select('*')
    .eq('room_id', id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ scans: data ?? [] });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await context.params;
  const body = await request.json();

  const admin = createAdminClient();
  const { data: room } = await admin
    .from('rooms')
    .select('id, scan_count')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!room) return NextResponse.json({ error: 'room_not_found' }, { status: 404 });

  const now = new Date().toISOString();
  const { data: scan, error } = await admin
    .from('room_scans')
    .insert({
      user_id: user.id,
      room_id: id,
      name: body.name ?? 'Scan',
      room_type: body.room_type ?? null,
      model_url: body.model_url ?? null,
      model_url_gltf: body.model_url_gltf ?? null,
      scan_data: body.scan_data ?? null,
      dimensions: body.dimensions ?? null,
      features: body.features ?? null,
      floor_area: body.floor_area ?? null,
      hero_frame_url: body.hero_frame_url ?? null,
      style_signals: body.style_signals ?? null,
      status: body.status ?? 'processed',
      scanned_at: body.scanned_at ?? now,
      processed_at: body.status === 'processed' || !body.status ? now : null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Bump scan_count + emergence on the room
  await admin
    .from('rooms')
    .update({
      scan_count: (room.scan_count ?? 0) + 1,
      last_emergence_at: now,
      has_active_emergence: true,
      emergence_message: 'New scan processed',
    })
    .eq('id', id);

  // Invalidate feed cache — new scan affects recommendations
  await admin.from('feed_cache_meta').delete().eq('user_id', user.id).eq('room_id', id);

  return NextResponse.json({ scan }, { status: 201 });
}
