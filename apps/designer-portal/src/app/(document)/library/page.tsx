'use client';

/**
 * The Library — the first Room (R39 / R32 / D14). It mounts inside the
 * (document) layout, so the Drawer, the log strip, and ⌘K persist around it,
 * and walking in puts the held document down through the normal flow. The
 * reusable physics live in RoomShell (rendered by LibraryRoom); this page is
 * its first tenant.
 */

import { LibraryRoom } from '@/components/document/rooms/library/library-room';

export default function LibraryRoomPage() {
  return <LibraryRoom />;
}
