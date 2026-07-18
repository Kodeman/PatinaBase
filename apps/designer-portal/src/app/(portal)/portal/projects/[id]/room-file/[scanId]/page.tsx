'use client';

/**
 * /portal/projects/[id]/room-file/[scanId] — Room File v0 (Field Capture P1,
 * package item 12). Project-attached (the AC is project-anchored: "Leah reaches
 * a real room's drawing set from her project"), scan-grained leaf (room_files is
 * UNIQUE(scan_id, version) — the scan is the deliverable's true key). Sits in
 * the projects/[id]/<surface> sub-route family (ffe · financials · time ·
 * decisions), so it inherits the pipeline breadcrumb trail for free.
 *
 * Flag gate + hydration + data all live in RoomFileView (fail-closed on the
 * `room-file` PostHog flag).
 */

import { use } from 'react';
import { RoomFileView } from '@/components/room-file/room-file-view';

export default function RoomFilePage({
  params,
}: {
  params: Promise<{ id: string; scanId: string }>;
}) {
  const { id, scanId } = use(params);
  return <RoomFileView projectId={id} scanId={scanId} />;
}
