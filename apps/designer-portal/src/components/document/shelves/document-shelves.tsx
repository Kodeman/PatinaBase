'use client';

/**
 * The shelves, mounted: the leaf and whichever shelf is currently pulled out.
 * One place decides what a shelf contains, so the spine only has to name it.
 *
 * Four shelves are the project's; the client's copy is the proposal's (W4a),
 * so every leaf is guarded on the subject it needs rather than on the mount
 * knowing which document it is standing on.
 */

import type { ShelfLeafKey } from '@/lib/document/shelves';
import type { DocumentRoom } from '@/hooks/use-document-rooms';
import { ShelfPanel } from './shelf-panel';
import { PlanRoomLeaf } from './plan-room-leaf';
import { SpecBookLeaf } from './spec-book-leaf';
import { MoodBoardsLeaf } from './mood-boards-leaf';
import { ClientCopyLeaf } from './client-copy-leaf';

export function DocumentShelves({
  openShelf,
  onClose,
  projectId,
  routeId,
  rooms = [],
  canCreateBoards = false,
  proposalId,
  clientName,
}: {
  openShelf: ShelfLeafKey | null;
  onClose: () => void;
  projectId?: string;
  routeId: string;
  rooms?: readonly DocumentRoom[];
  canCreateBoards?: boolean;
  proposalId?: string;
  clientName?: string;
}) {
  return (
    <ShelfPanel openShelf={openShelf} onClose={onClose}>
      {openShelf === 'planroom' && projectId && (
        <PlanRoomLeaf projectId={projectId} routeId={routeId} />
      )}
      {openShelf === 'specbook' && projectId && (
        <SpecBookLeaf projectId={projectId} rooms={rooms} />
      )}
      {openShelf === 'moodboards' && projectId && (
        <MoodBoardsLeaf
          projectId={projectId}
          rooms={rooms}
          canCreate={canCreateBoards}
        />
      )}
      {openShelf === 'clientcopy' && proposalId && (
        <ClientCopyLeaf proposalId={proposalId} clientName={clientName} />
      )}
    </ShelfPanel>
  );
}
