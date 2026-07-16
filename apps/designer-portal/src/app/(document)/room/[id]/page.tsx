'use client';

/**
 * /room/[id] (R107) — the Room View. One viewer, two doors: opened from
 * The Rooms roster (`/rooms`, a card) or scoped back from a Document scan
 * reference (Discovery fold, the ceremony's "tap to walk it" preview, the
 * letterhead "The scan" instrument, the Folio — I74a: every Document scan
 * door converts to this view). The room always knows its Document.
 *
 * Room View program, W2-T3: wires the route to real geometry — the
 * `useRoomGeometry` hook (packages/supabase) + the `roomGeometryFromRows`
 * adapter (lib/room-view/from-rows.ts) feed `<RoomView>`, which owns every
 * rendering state (loading, still-being-drawn, the full Plan + facts rail).
 * This page itself does nothing but wire hook → adapter → shell — no
 * telemetry yet (W3-T7 wires `room_opened` etc., per R107 §7 / I74c).
 *
 * Two doors, one mechanic:
 *   · Rooms roster → RoomShell's normal origin-stash (rememberRoomOrigin at
 *     the card's click site / readRoomOrigin here) — same as Library/People.
 *     No wiring needed here; the mechanic is already generic.
 *   · A Document reference → `?from=document&doc=<documentId>` is the
 *     minimal signal: it feeds RoomShell an explicit backTo/backLabel,
 *     mirroring the exact phrasing room-origin's `originLabel` already uses
 *     for a `/doc/` origin ("the document") — no new state, the same
 *     backTo/backLabel mechanism piece-room.tsx uses for its own hardcoded
 *     back-reference to the Library. Real entry links land with Phase 2.4's
 *     entry paths (a later task); this route only honors the param shape.
 *
 * KNOWN GAP (I74b): the A3 deep-link fix has NOT landed. DocumentGate
 * (client-side, fail-closed on `the-document-pilot`) can bounce a
 * hard-refreshed /room/[id] to /portal while the flag resolves. In-app
 * navigation is the v1 path; this is a logged gap, not silently shipped —
 * do not "fix" DocumentGate to work around it here.
 */

import { use, useEffect, useMemo, useState } from 'react';
import { useRoomGeometry } from '@patina/supabase';
import { RoomShell } from '@/components/document/rooms/room-shell';
import { RoomView } from '@/components/document/rooms/room-view/room-view';
import { roomGeometryFromRows } from '@/lib/room-view/from-rows';

export default function RoomViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  // Read client-side (no useSearchParams → no Suspense boundary needed),
  // matching drafting-room.tsx's `arrivingFlagged` pattern.
  const [back, setBack] = useState<{ to: string; label: string } | null>(null);
  useEffect(() => {
    const qs = new URLSearchParams(window.location.search);
    const doc = qs.get('doc');
    if (qs.get('from') === 'document' && doc) {
      setBack({ to: `/doc/${doc}`, label: 'the document' });
    }
  }, []);

  const { data, isLoading } = useRoomGeometry(id);

  // Pure adapter — header/elements are already shaped to from-rows.ts's
  // input contract by the hook (see use-room-geometry.ts's own header note).
  const adapted = useMemo(() => {
    if (!data) return null;
    return roomGeometryFromRows(data.header, data.elements);
  }, [data]);

  return (
    <RoomShell title="A room" backTo={back?.to} backLabel={back?.label}>
      <RoomView
        doc={data?.document ?? null}
        geometry={adapted?.geometry ?? null}
        thicknessConvention={adapted?.thicknessConvention ?? false}
        isLoading={isLoading}
      />
    </RoomShell>
  );
}
