/**
 * /api/rooms/:id/timeline
 *
 * GET — returns a unified, chronologically-sorted event feed for a
 *       single room. Aggregates from:
 *         - `rooms.created_at`            → "room_created"
 *         - `room_scans.created_at`       → "scan_processed"
 *         - `saved_items.created_at`      → "item_added" (ar_placement / manual / feed)
 *         - `leads.created_at` (if the scan is referenced) → "designer_lead_sent"
 *
 *       The client renders this as the "Room Through Time" vertical
 *       event list under Room Detail.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@patina/supabase/server';
import { createAdminClient } from '@patina/supabase/client';

interface TimelineEvent {
  type:
    | 'room_created'
    | 'scan_processed'
    | 'item_added'
    | 'designer_lead_sent';
  at: string;
  label: string;
  meta?: Record<string, unknown>;
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id: roomId } = await context.params;

  const admin = createAdminClient();

  const { data: room } = await admin
    .from('rooms')
    .select('id, name, created_at, user_id')
    .eq('id', roomId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!room) return NextResponse.json({ error: 'room_not_found' }, { status: 404 });

  const [scansRes, itemsRes] = await Promise.all([
    admin
      .from('room_scans')
      .select('id, created_at, quality_grade, coverage_percentage')
      .eq('room_id', roomId),
    admin
      .from('saved_items')
      .select('id, created_at, name, source')
      .eq('room_id', roomId)
      .eq('user_id', user.id),
  ]);

  const scanIds = (scansRes.data ?? []).map((s) => s.id);
  const leadsRes = scanIds.length
    ? await admin
        .from('leads')
        .select('id, created_at, status, room_scan_id')
        .in('room_scan_id', scanIds)
        .eq('homeowner_id', user.id)
    : { data: [] as Array<{ id: string; created_at: string; status: string; room_scan_id: string }> };

  const events: TimelineEvent[] = [
    {
      type: 'room_created',
      at: room.created_at,
      label: `"${room.name}" was born`,
    },
    ...(scansRes.data ?? []).map<TimelineEvent>((s) => ({
      type: 'scan_processed',
      at: s.created_at,
      label: 'Scan processed',
      meta: {
        quality: s.quality_grade,
        coverage: s.coverage_percentage,
      },
    })),
    ...(itemsRes.data ?? []).map<TimelineEvent>((i) => ({
      type: 'item_added',
      at: i.created_at,
      label:
        i.source === 'ar_placement'
          ? `Placed "${i.name}" in AR`
          : `Saved "${i.name}"`,
      meta: { source: i.source },
    })),
    ...((leadsRes.data ?? []) as Array<{ id: string; created_at: string; status: string }>).map<TimelineEvent>(
      (l) => ({
        type: 'designer_lead_sent',
        at: l.created_at,
        label: 'Sent to designers',
        meta: { status: l.status },
      }),
    ),
  ];

  events.sort((a, b) => (a.at < b.at ? 1 : -1));

  return NextResponse.json({ room, events });
}
