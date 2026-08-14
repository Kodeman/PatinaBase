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
 *     signal, and (A2) `?docId=` carries the CURRENT document's own
 *     engagement id — the document the visitor actually opened the scan
 *     from, which is not always the scan's own canonical document (a scan
 *     cross-linked into another document, or any identity-migration
 *     scenario, e.g. J6). When `docId` resolves (via the same
 *     `useDocumentEngagement` resolver the doc surface itself uses — J6's
 *     fix applies here for free), the scoped-back targets THAT document.
 *     Only when `docId` is absent (an older bookmarked/pre-A2 link) or its
 *     resolver comes back empty does the scoped-back fall back to the
 *     scan's own canonical document, read off the SAME `useRoomGeometry`
 *     fetch this page already makes for the Plan (`data.document.engagementId`
 *     / `.activeSection`, room_scan_documents — 00339). Either way it
 *     produces the phase-qualified leave affordance ("← the Document ·
 *     Brief") the doc-link at the top of RoomView already renders forward
 *     ("→ the Document · Brief", room-view.tsx) — one resolved Document,
 *     read twice, same label vocabulary both directions. `?from=document`
 *     doubles as the room_opened source=document telemetry-attribution
 *     marker (wired below) — do not repurpose or drop it.
 *     When neither the docId resolver nor the fetch resolves a Document (an
 *     orphan scan, or the scan simply hasn't parsed yet), the scoped-back
 *     label/target is skipped and RoomShell falls back to its normal
 *     origin-stash — a roster-style leave rather than a broken/blank
 *     document link.
 *
 * (I74b, historical): a hard-refreshed /room/[id] used to be able to bounce
 * to /portal while the now-removed DocumentGate's flag check resolved.
 * DocumentGate was retired in the R21 dissolve (the legacy portal spine it
 * guarded no longer exists), so that bounce no longer happens.
 */

import { use, useEffect, useMemo, useRef, useState } from 'react';
import { useRoomGeometry, useRoomScanPhotos } from '@patina/supabase';
import { RoomShell } from '@/components/document/rooms/room-shell';
import { RoomView } from '@/components/document/rooms/room-view/room-view';
import { roomGeometryFromRows } from '@/lib/room-view/from-rows';
import { roomEvents } from '@/lib/analytics';
import { useDocumentEngagement } from '@/hooks/use-document-state';

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
  // arrival. `docId` (A2) is read the same way, same reasoning.
  const [fromDocument, setFromDocument] = useState(false);
  const [docId, setDocId] = useState<string | null>(null);

  // room_opened — fires exactly once per mount (ref-guard, not just the
  // effect's `[id]` deps: React Strict Mode double-invokes effects in dev,
  // and this event must never double-fire the way ceremony-surface.tsx's
  // `openedRef` guards ceremonyOpened).
  const openedRef = useRef(false);
  useEffect(() => {
    const qs = new URLSearchParams(window.location.search);
    const isFromDocument = qs.get('from') === 'document';
    setFromDocument(isFromDocument);
    setDocId(qs.get('docId'));
    if (!openedRef.current) {
      openedRef.current = true;
      roomEvents.roomOpened({ room_id: id, source: isFromDocument ? 'document' : 'index' });
    }
  }, [id]);

  const { data, isLoading } = useRoomGeometry(id);

  // A2: resolve the referring document by the id the door carried, THROUGH
  // the same resolver the doc surface itself uses (J6's redirect leg applies
  // here too, for free). Disabled (and permanently non-loading) when no
  // docId arrived — see use-document-state.ts's UUID `enabled` gate.
  const referrer = useDocumentEngagement(docId ?? '');

  // The scan's photo set, alongside the geometry fetch. `id` IS the scan id
  // (useRoomGeometry queries room_scan_documents by scan_id) — the same key
  // useRoomScanPhotos signs against room_scan_images. `[]` for a Field scan
  // with no photos; the strip/markers/rail line all stay absent.
  const { data: photos } = useRoomScanPhotos(id);

  // Pure adapter — header/elements are already shaped to from-rows.ts's
  // input contract by the hook (see use-room-geometry.ts's own header note).
  const adapted = useMemo(() => {
    if (!data) return null;
    return roomGeometryFromRows(data.header, data.elements);
  }, [data]);

  // Scoped-back (I74a, package accept 2.4; A2 adds the docId-referrer path):
  // only when the door arrived `?from=document` at all. Priority when a
  // `docId` also arrived: an engagement resolution targets that document by
  // name + phase; a redirect resolution (J6-style: the referring id moved)
  // targets the redirect's project; still loading holds the leave affordance
  // back rather than flashing the canonical fallback first; a 'missing'/
  // errored resolution falls through to the scan's own canonical document,
  // same as when no docId arrived at all. An orphan scan or a not-yet-parsed
  // canonical-document row (both paths) degrades to RoomShell's generic
  // origin-stash leave instead of a dead/blank "the Document" link.
  const back = useMemo(() => {
    if (!fromDocument) return null;
    if (docId) {
      if (referrer.isLoading || referrer.isFetching) return null;
      if (referrer.data?.kind === 'engagement') {
        const { row } = referrer.data;
        const label = SECTION_LABEL[row.active_section] ?? row.active_section;
        return { to: `/doc/${row.engagement_id}`, label: `the Document · ${label}` };
      }
      if (referrer.data?.kind === 'redirect') {
        return { to: `/doc/${referrer.data.projectId}`, label: 'the Document' };
      }
      // 'missing' or a query error: fall through to the canonical-document
      // read below, same as an older link with no docId at all.
    }
    const doc = data?.document;
    if (!doc?.engagementId || !doc.activeSection) return null;
    const label = SECTION_LABEL[doc.activeSection] ?? doc.activeSection;
    return { to: `/doc/${doc.engagementId}`, label: `the Document · ${label}` };
  }, [
    fromDocument,
    docId,
    referrer.isLoading,
    referrer.isFetching,
    referrer.data,
    data?.document,
  ]);

  return (
    <RoomShell title="A room" backTo={back?.to} backLabel={back?.label}>
      <RoomView
        roomId={id}
        doc={data?.document ?? null}
        geometry={adapted?.geometry ?? null}
        thicknessConvention={adapted?.thicknessConvention ?? false}
        provenance={adapted?.provenance ?? null}
        photos={photos ?? []}
        isLoading={isLoading}
      />
    </RoomShell>
  );
}
