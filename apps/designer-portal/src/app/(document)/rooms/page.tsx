'use client';

/**
 * The Rooms (R107 / D14) — the third top-level Studio room, beside Library
 * and People: every scanned room across every client, one roster. Opening a
 * card walks into the Room View (`/room/[id]`) — one viewer, two doors, and
 * the room always knows its Document.
 *
 * Phase 2.1 of docs/design/the-document/the-document-room-view-package.md
 * (ruling: DECISIONS.md R107): the roster — cards with client, room type,
 * scan date, dims/area, quality dot, and Document reference, plus a
 * mini-plan thumbnail drawn from the scan's parsed geometry. RoomsIndex owns
 * RoomShell itself (mirrors library/page.tsx -> LibraryRoom), so this page
 * only wires the route.
 */

import { RoomsIndex } from '@/components/document/rooms/room-view/rooms-index';

export default function RoomsIndexPage() {
  return <RoomsIndex />;
}
