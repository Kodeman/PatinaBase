'use client';

/**
 * Mood boards, on a shelf. The room transplants whole — `ProjectMoodBoards` is
 * the same component, with the same fold, the same creator and the same
 * board-intent listener it has always had; only where it stands has changed.
 *
 * Boards carry `project_room_id`, so the lens lifts inside the component; the
 * count here reads the same two queries it mounts (React Query hands back the
 * cache rather than reading twice).
 */

import { useProjectBoards, useProjectOwnedBoards } from '@patina/supabase';
import { useRoomLens } from '../room-lens-context';
import type { DocumentRoom } from '@/hooks/use-document-rooms';
import { ProjectMoodBoards } from '../project-mood-boards';
import { ShelfLifted } from './shelf-parts';

export function MoodBoardsLeaf({
  projectId,
  rooms,
  canCreate,
}: {
  projectId: string;
  rooms: readonly DocumentRoom[];
  canCreate: boolean;
}) {
  const { heldRoomId } = useRoomLens();
  const live = useProjectOwnedBoards(projectId);
  const frozen = useProjectBoards(projectId);
  const heldRoom = rooms.find((r) => r.id === heldRoomId) ?? null;

  const inRoom = [...(live.data ?? []), ...(frozen.data ?? [])].filter(
    (board) =>
      (board as { project_room_id?: string | null }).project_room_id ===
      heldRoomId,
  ).length;

  return (
    <>
      <ShelfLifted roomName={heldRoom?.name ?? null} found={inRoom} />
      <ProjectMoodBoards projectId={projectId} canCreate={canCreate} />
    </>
  );
}
