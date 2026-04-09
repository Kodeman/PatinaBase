/**
 * /api/rooms/:id/designer-lead
 *
 * POST — assemble a Designer Lead Package from a room:
 *        - the most recent `room_scans` row (→ leads.room_scan_id)
 *        - the homeowner's style profile (from `profiles`)
 *        - all `saved_items` for the room
 *        - optional budget / timeline / project_type from the body
 *
 *        Creates a new `leads` row in status 'pending' OR updates an
 *        existing draft lead for the same (homeowner, room). Returns
 *        the full package so iOS can confirm the handoff.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@patina/supabase/server';
import { createAdminClient } from '@patina/supabase/client';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id: roomId } = await context.params;
  const body = await request.json().catch(() => ({}));

  const admin = createAdminClient();

  // 1. Verify room ownership
  const { data: room } = await admin
    .from('rooms')
    .select('id, name, type, style_signals, user_id')
    .eq('id', roomId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!room) return NextResponse.json({ error: 'room_not_found' }, { status: 404 });

  // 2. Gather the package pieces in parallel
  const [scanRes, itemsRes, profileRes] = await Promise.all([
    admin
      .from('room_scans')
      .select('id, model_url, hero_frame_url, dimensions, style_signals, created_at')
      .eq('room_id', roomId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from('saved_items')
      .select('id, product_id, name, price_in_cents, image_url')
      .eq('room_id', roomId)
      .eq('user_id', user.id),
    admin
      .from('profiles')
      .select('id, location_city, location_state, location_zip')
      .eq('id', user.id)
      .maybeSingle(),
  ]);

  const savedItems = itemsRes.data ?? [];
  const totalCents = savedItems.reduce(
    (sum, i) => sum + (i.price_in_cents ?? 0),
    0,
  );

  // 3. Derive a project description so the designer has context without
  //    having to click into every saved item.
  const description =
    body.project_description ??
    `Homeowner is furnishing their ${room.type ?? 'room'} ("${room.name}"). ` +
      `${savedItems.length} saved items, approx $${Math.round(totalCents / 100)} total.`;

  // 4. Upsert the lead — one draft per (homeowner, room_scan) at a time.
  const leadRow: Record<string, unknown> = {
    homeowner_id: user.id,
    project_type: body.project_type ?? room.type ?? 'other',
    project_description: description,
    budget_range: body.budget_range ?? null,
    timeline: body.timeline ?? null,
    location_city: profileRes.data?.location_city ?? null,
    location_state: profileRes.data?.location_state ?? null,
    location_zip: profileRes.data?.location_zip ?? null,
    room_scan_id: scanRes.data?.id ?? null,
    status: 'pending',
    match_reasons: {
      source: 'room_package',
      room_id: roomId,
      room_name: room.name,
      saved_item_count: savedItems.length,
      total_cents: totalCents,
      style_signals: room.style_signals ?? null,
    },
    updated_at: new Date().toISOString(),
  };

  // Look for an existing pending lead for this room_scan
  let leadId: string | null = null;
  if (scanRes.data?.id) {
    const { data: existing } = await admin
      .from('leads')
      .select('id')
      .eq('homeowner_id', user.id)
      .eq('room_scan_id', scanRes.data.id)
      .eq('status', 'pending')
      .maybeSingle();
    leadId = existing?.id ?? null;
  }

  let lead;
  if (leadId) {
    const { data, error } = await admin
      .from('leads')
      .update(leadRow)
      .eq('id', leadId)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    lead = data;
  } else {
    const { data, error } = await admin
      .from('leads')
      .insert(leadRow)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    lead = data;
  }

  return NextResponse.json({
    lead,
    package: {
      room,
      scan: scanRes.data,
      saved_items: savedItems,
      total_cents: totalCents,
      profile: profileRes.data,
    },
  });
}
