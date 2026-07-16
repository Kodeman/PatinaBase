'use client';

/**
 * /room/[id] (R107) — the Room View stub. One viewer, two doors: opened from
 * The Rooms roster (`/rooms`, a card) or scoped back from a Document scan
 * reference (Discovery fold, the ceremony's "tap to walk it" preview, the
 * letterhead "The scan" instrument, the Folio — I74a: every Document scan
 * door converts to this view). The room always knows its Document.
 *
 * Registration stub (Room View program, W2-T0): wires the route into the
 * (document) group's RoomShell physics. The real Plan/Orbit rendering off
 * room-geometry rows (Phase 2.2 / 3.1 of
 * docs/design/the-document/the-document-room-view-package.md, ruling
 * DECISIONS.md R107) lands in a later task.
 *
 * Two doors, one mechanic:
 *   · Rooms roster → RoomShell's normal origin-stash (rememberRoomOrigin at
 *     the card's click site / readRoomOrigin here) — same as Library/People.
 *     No wiring needed in this stub; the mechanic is already generic.
 *   · A Document reference → `?from=document&doc=<documentId>` is the
 *     minimal signal: it feeds RoomShell an explicit backTo/backLabel,
 *     mirroring the exact phrasing room-origin's `originLabel` already uses
 *     for a `/doc/` origin ("the document") — no new state, the same
 *     backTo/backLabel mechanism piece-room.tsx uses for its own hardcoded
 *     back-reference to the Library. Real entry links land with Phase 2.4's
 *     entry paths (a later task); this stub only honors the param shape.
 *
 * KNOWN GAP (I74b): the A3 deep-link fix has NOT landed. DocumentGate
 * (client-side, fail-closed on `the-document-pilot`) can bounce a
 * hard-refreshed /room/[id] to /portal while the flag resolves. In-app
 * navigation is the v1 path; this is a logged gap, not silently shipped —
 * do not "fix" DocumentGate to work around it here.
 */

import { use, useEffect, useState } from 'react';
import { RoomShell } from '@/components/document/rooms/room-shell';

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

  return (
    <RoomShell title="A room" backTo={back?.to} backLabel={back?.label}>
      {/* Phase 2.2/3.1 mount point — Plan + Orbit projections for this room
          (id below) render here. Do not add data fetching in this stub. */}
      <div data-room-view-mount data-room-id={id} className="mx-auto max-w-[520px] px-6 pt-24 text-center">
        <p className="font-heading text-[1.3rem] italic text-[var(--color-charcoal)]">
          This room is being drawn.
        </p>
      </div>
    </RoomShell>
  );
}
