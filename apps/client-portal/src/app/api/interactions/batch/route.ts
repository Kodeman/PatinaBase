/**
 * POST /api/interactions/batch
 *
 * Receives batched Daily Room telemetry events from the iOS app (emitted
 * every ~30s by the InteractionBatchQueue). Bulk-inserts into `interactions`
 * and updates the `product_user_dwell` + `user_room_engagement` aggregates
 * in-session so dashboards reflect near-real-time activity without waiting
 * for the nightly pipeline.
 *
 * Contract lives in docs/specs/Data Tracking/patina-data-architecture.md
 * (Appendix: API Contracts).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@patina/supabase/server';
import { createAdminClient } from '@patina/supabase/client';

type IncomingEvent = {
  event_type: string;
  product_id?: string | null;
  room_id?: string | null;
  metadata?: Record<string, unknown>;
  timestamp?: string;
};

type BatchPayload = {
  session_id: string;
  events: IncomingEvent[];
};

// Allowed event types (must match the CHECK constraint in migration 00069)
const ALLOWED_EVENT_TYPES = new Set([
  'view', 'save', 'skip', 'ar_place', 'dwell', 'share',
  'story_viewed', 'story_tapped', 'story_scroll_depth',
  'story_product_viewed', 'story_product_added', 'story_scrolled_past',
  'room_channel_viewed', 'room_channel_switched', 'room_channel_dwell',
  'feed_filter_applied', 'new_picks_viewed',
  'product_dwell', 'product_add_initiated', 'product_added_to_room',
  'product_add_cancelled', 'product_saved', 'product_material_viewed',
  'product_swiped_right', 'product_swiped_left', 'product_detail_opened',
  'product_insight_viewed', 'product_pairing_tapped', 'product_shared',
  'feed_loaded', 'feed_exhausted', 'feed_scroll_depth', 'feed_refreshed',
]);

export async function POST(request: NextRequest) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: BatchPayload;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  if (!body?.session_id || !Array.isArray(body.events)) {
    return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
  }

  const valid = body.events.filter((e) => e && ALLOWED_EVENT_TYPES.has(e.event_type));
  if (valid.length === 0) {
    return NextResponse.json({ received: body.events.length, processed: 0 });
  }

  const admin = createAdminClient();

  // 1. Bulk insert raw events
  const rows = valid.map((e) => ({
    user_id: user.id,
    product_id: e.product_id ?? null,
    room_id: e.room_id ?? null,
    session_id: body.session_id,
    event_type: e.event_type,
    metadata: e.metadata ?? {},
    created_at: e.timestamp ?? new Date().toISOString(),
  }));

  const { error: insertError } = await admin.from('interactions').insert(rows);
  if (insertError) {
    console.error('[interactions/batch] insert failed', insertError);
    return NextResponse.json({ error: 'insert_failed' }, { status: 500 });
  }

  // 2. In-session aggregate updates (best-effort; nightly pipeline authoritative)
  await Promise.all([
    updateDwellAggregates(admin, user.id, valid),
    updateRoomEngagement(admin, user.id, valid),
  ]);

  return NextResponse.json({ received: body.events.length, processed: valid.length });
}

async function updateDwellAggregates(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  events: IncomingEvent[],
) {
  // Aggregate dwell events by product_id for this batch
  const byProduct = new Map<
    string,
    { total_ms: number; count: number; max_ms: number; last_seen: string }
  >();

  for (const e of events) {
    if (e.event_type !== 'product_dwell' || !e.product_id) continue;
    const durationMs = Number((e.metadata as any)?.duration_ms ?? 0);
    if (!Number.isFinite(durationMs) || durationMs <= 0) continue;

    const existing = byProduct.get(e.product_id) ?? {
      total_ms: 0,
      count: 0,
      max_ms: 0,
      last_seen: e.timestamp ?? new Date().toISOString(),
    };
    existing.total_ms += durationMs;
    existing.count += 1;
    existing.max_ms = Math.max(existing.max_ms, durationMs);
    if (e.timestamp && e.timestamp > existing.last_seen) existing.last_seen = e.timestamp;
    byProduct.set(e.product_id, existing);
  }

  if (byProduct.size === 0) return;

  // Upsert each product's aggregate. We fetch-then-write so we can merge
  // the incoming delta with the existing total without a SQL function.
  const productIds = Array.from(byProduct.keys());
  const { data: existingRows } = await admin
    .from('product_user_dwell')
    .select('product_id, total_dwell_ms, view_count, max_single_dwell_ms')
    .eq('user_id', userId)
    .in('product_id', productIds);

  const existingById = new Map(
    (existingRows ?? []).map((r: any) => [r.product_id as string, r]),
  );

  const upserts = productIds.map((pid) => {
    const delta = byProduct.get(pid)!;
    const prev = existingById.get(pid);
    return {
      user_id: userId,
      product_id: pid,
      total_dwell_ms: Number(prev?.total_dwell_ms ?? 0) + delta.total_ms,
      view_count: Number(prev?.view_count ?? 0) + delta.count,
      max_single_dwell_ms: Math.max(Number(prev?.max_single_dwell_ms ?? 0), delta.max_ms),
      last_seen: delta.last_seen,
    };
  });

  const { error } = await admin
    .from('product_user_dwell')
    .upsert(upserts, { onConflict: 'user_id,product_id' });
  if (error) console.error('[interactions/batch] dwell upsert failed', error);
}

async function updateRoomEngagement(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  events: IncomingEvent[],
) {
  // Aggregate per-room counters for this batch
  const byRoom = new Map<
    string,
    {
      dwell_ms: number;
      products_viewed: number;
      products_added: number;
      products_saved: number;
      last_active: string;
    }
  >();

  for (const e of events) {
    if (!e.room_id) continue;
    const bucket = byRoom.get(e.room_id) ?? {
      dwell_ms: 0,
      products_viewed: 0,
      products_added: 0,
      products_saved: 0,
      last_active: e.timestamp ?? new Date().toISOString(),
    };

    if (e.event_type === 'room_channel_dwell' || e.event_type === 'product_dwell') {
      bucket.dwell_ms += Number((e.metadata as any)?.duration_ms ?? 0) || 0;
    }
    if (e.event_type === 'product_dwell') bucket.products_viewed += 1;
    if (e.event_type === 'product_added_to_room') bucket.products_added += 1;
    if (e.event_type === 'product_saved') bucket.products_saved += 1;

    if (e.timestamp && e.timestamp > bucket.last_active) bucket.last_active = e.timestamp;
    byRoom.set(e.room_id, bucket);
  }

  if (byRoom.size === 0) return;

  const roomIds = Array.from(byRoom.keys());
  const { data: existingRows } = await admin
    .from('user_room_engagement')
    .select('room_id, total_dwell_ms, session_count, products_viewed, products_added, products_saved')
    .eq('user_id', userId)
    .in('room_id', roomIds);

  const existingById = new Map(
    (existingRows ?? []).map((r: any) => [r.room_id as string, r]),
  );

  const upserts = roomIds.map((rid) => {
    const delta = byRoom.get(rid)!;
    const prev = existingById.get(rid);
    return {
      user_id: userId,
      room_id: rid,
      total_dwell_ms: Number(prev?.total_dwell_ms ?? 0) + delta.dwell_ms,
      session_count: Number(prev?.session_count ?? 0),
      products_viewed: Number(prev?.products_viewed ?? 0) + delta.products_viewed,
      products_added: Number(prev?.products_added ?? 0) + delta.products_added,
      products_saved: Number(prev?.products_saved ?? 0) + delta.products_saved,
      last_active: delta.last_active,
    };
  });

  const { error } = await admin
    .from('user_room_engagement')
    .upsert(upserts, { onConflict: 'user_id,room_id' });
  if (error) console.error('[interactions/batch] room engagement upsert failed', error);
}
