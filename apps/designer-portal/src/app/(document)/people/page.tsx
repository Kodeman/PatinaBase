'use client';

/**
 * The People Room (R50 / R57 / D14). It mounts inside the (document) layout, so
 * the Drawer, the log strip, and ⌘K persist around it, and walking in puts the
 * held document down through the normal flow. The reusable physics live in
 * RoomShell (rendered by PeopleRoom); this page is its second tenant.
 */

import { PeopleRoom } from '@/components/document/people/people-room';

export default function PeopleRoomPage() {
  return <PeopleRoom />;
}
