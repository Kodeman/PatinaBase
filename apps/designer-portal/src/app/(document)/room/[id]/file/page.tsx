'use client';

/**
 * /room/[id]/file — the Room File (Field Capture P1, package item 12), rehoused
 * by the R21 dissolve from /portal/projects/[id]/room-file/[scanId].
 *
 * The old address was project-nested because it sat in the projects/[id]/<surface>
 * family and borrowed that trail's breadcrumb. Nothing about the deliverable was
 * ever project-keyed: `room_files` is UNIQUE(scan_id, version) — the SCAN is the
 * true key, exactly as it is for /room/[id] (the Room View). So the Room File
 * becomes the Room's leaf: `[id]` here is the SAME scan id the sibling route
 * reads, and the owning project is resolved from the scan inside RoomFileView.
 *
 * ⚠ ROOM id ≠ SCAN id. /rooms and /portal/rooms/:id speak the `rooms` table;
 * this route and /room/[id] speak `room_scans`. Never map one to the other.
 *
 * No RoomShell: the Room File is a leaf reading, not a Room you walk into. It
 * mounts bare inside the (document) layout — paper background, Studio Drawer,
 * ⌘K — and carries its own back-to-the-room line. Flag gate (`room-file`,
 * fail-closed), hydration gate, and every fetch live in RoomFileView.
 */

import { use } from 'react';
import { RoomFileView } from '@/components/room-file/room-file-view';

export default function RoomFilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <div className="px-5 pt-8 sm:px-8">
      <RoomFileView scanId={id} />
    </div>
  );
}
