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
 * This page itself wires hook → adapter → shell, plus the `room_opened`
 * mount telemetry (W3-T7, per R107 §7 / I74c — see lib/analytics/room-events.ts).
 *
 * Two doors, one mechanic:
 *   · Rooms roster → RoomShell's normal origin-stash (rememberRoomOrigin at
 *     the card's click site / readRoomOrigin here) — same as Library/People.
 *     No wiring needed here; the mechanic is already generic.
 *   · A Document scan door (W2-T5, I74a) → `?from=document` is the minimal
 *     signal. Unlike the roster's origin-stash, the doors don't carry a
 *     document/engagement id of their own to pass along — so rather than
 *     round-trip one through the URL, the scoped-back reads it off the SAME
 *     `useRoomGeometry` fetch this page already makes for the Plan
 *     (`data.document.engagementId` / `.activeSection`, room_scan_documents
 *     — 00339). That produces the phase-qualified leave affordance
 *     ("← the Document · Brief") the doc-link at the top of RoomView already
 *     renders forward ("→ the Document · Brief", room-view.tsx) — one
 *     resolved Document, read twice, same label vocabulary both directions.
 *     `?from=document` doubles as the room_opened source=document
 *     telemetry-attribution marker (wired below) — do not repurpose or drop
 *     it.
 *     When the fetch resolves without a Document (an orphan scan, or the
 *     scan simply hasn't parsed yet), the scoped-back label/target is
 *     skipped and RoomShell falls back to its normal origin-stash — a
 *     roster-style leave rather than a broken/blank document link.
 *
 * KNOWN GAP (I74b): the A3 deep-link fix has NOT landed. DocumentGate
 * (client-side, fail-closed on `the-document-pilot`) can bounce a
 * hard-refreshed /room/[id] to /portal while the flag resolves. In-app
 * navigation is the v1 path; this is a logged gap, not silently shipped —
 * do not "fix" DocumentGate to work around it here.
 */

import { use, useEffect, useMemo, useRef, useState } from 'react';
import { useRoomGeometry } from '@patina/supabase';
import { RoomShell } from '@/components/document/rooms/room-shell';
import { RoomView } from '@/components/document/rooms/room-view/room-view';
import { roomGeometryFromRows } from '@/lib/room-view/from-rows';
import { roomEvents } from '@/lib/analytics';

/** Mirrors room-view.tsx's own SECTION_LABEL (itself mirroring folder-card.tsx,
 *  module-private in both) — the leave affordance needs the same human phase
 *  label as the doc-link this page's RoomView already renders. */
const SECTION_LABEL: Record<string, string> = {
  brief: 'Brief',
  discovery: 'Discovery',
  direction: 'Direction',
  proposal: 'Proposal',
  project: 'Project',
  install: 'Install',
  care: 'Care',
};

export default function RoomViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  // Read client-side (no useSearchParams → no Suspense boundary needed),
  // matching drafting-room.tsx's `arrivingFlagged` pattern. `from=document`
  // is also the room_opened source attribution marker (see file header) —
  // read once at mount, same as the marker itself never changes after
  // arrival.
  const [fromDocument, setFromDocument] = useState(false);

  // room_opened — fires exactly once per mount (ref-guard, not just the
  // effect's `[id]` deps: React Strict Mode double-invokes effects in dev,
  // and this event must never double-fire the way ceremony-surface.tsx's
  // `openedRef` guards ceremonyOpened).
  const openedRef = useRef(false);
  useEffect(() => {
    const qs = new URLSearchParams(window.location.search);
    const isFromDocument = qs.get('from') === 'document';
    setFromDocument(isFromDocument);
    if (!openedRef.current) {
      openedRef.current = true;
      roomEvents.roomOpened({ room_id: id, source: isFromDocument ? 'document' : 'index' });
    }
  }, [id]);

  const { data, isLoading } = useRoomGeometry(id);

  // Pure adapter — header/elements are already shaped to from-rows.ts's
  // input contract by the hook (see use-room-geometry.ts's own header note).
  const adapted = useMemo(() => {
    if (!data) return null;
    return roomGeometryFromRows(data.header, data.elements);
  }, [data]);

  // Scoped-back (I74a, package accept 2.4): only when the door arrived
  // `?from=document` AND the scan's Document actually resolves — an orphan
  // scan or a not-yet-parsed row degrades to RoomShell's generic origin-stash
  // leave instead of a dead/blank "the Document" link.
  const back = useMemo(() => {
    if (!fromDocument) return null;
    const doc = data?.document;
    if (!doc?.engagementId || !doc.activeSection) return null;
    const label = SECTION_LABEL[doc.activeSection] ?? doc.activeSection;
    return { to: `/doc/${doc.engagementId}`, label: `the Document · ${label}` };
  }, [fromDocument, data?.document]);

  return (
    <RoomShell title="A room" backTo={back?.to} backLabel={back?.label}>
      <RoomView
        roomId={id}
        doc={data?.document ?? null}
        geometry={adapted?.geometry ?? null}
        thicknessConvention={adapted?.thicknessConvention ?? false}
        isLoading={isLoading}
      />
    </RoomShell>
  );
}
