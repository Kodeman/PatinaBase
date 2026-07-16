'use client';

/**
 * The Rooms (R107 / D14) — the third top-level Studio room, beside Library
 * and People: every scanned room across every client, one roster. Opening a
 * card walks into the Room View (`/room/[id]`) — one viewer, two doors, and
 * the room always knows its Document.
 *
 * This is a registration stub (Room View program, W2-T0): it wires the route
 * into the (document) group's RoomShell physics (Drawer, LogStrip, ⌘K
 * persist above it; walking in puts the held document down through the
 * normal flow). The real roster — cards with client, room type, scan date,
 * dims/area, quality dot, and Document reference, plus a mini-plan thumbnail
 * — is Phase 2.1 of docs/design/the-document/the-document-room-view-package.md
 * (ruling: DECISIONS.md R107) and lands in a later task.
 */

import { RoomShell } from '@/components/document/rooms/room-shell';

export default function RoomsIndexPage() {
  return (
    <RoomShell title="The Rooms">
      {/* Phase 2.1 mount point — the roster of scanned-room cards renders
          here. Do not add data fetching in this stub. */}
      <div data-rooms-roster-mount className="mx-auto max-w-[520px] px-6 pt-24 text-center">
        <p className="font-heading text-[1.3rem] italic text-[var(--color-charcoal)]">
          Rooms are being drawn.
        </p>
      </div>
    </RoomShell>
  );
}
