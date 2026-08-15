'use client';

/**
 * The shelves, mounted: the leaf and whichever shelf is currently pulled out.
 * One place decides what a shelf contains, so the spine only has to name it.
 */

import type { ShelfLeafKey } from '@/lib/document/shelves';
import type { DocumentRoom } from '@/hooks/use-document-rooms';
import { ShelfPanel } from './shelf-panel';
import { PlanRoomLeaf } from './plan-room-leaf';
import { SpecBookLeaf } from './spec-book-leaf';
import { MoodBoardsLeaf } from './mood-boards-leaf';
import { KnowledgeLeaf } from './knowledge-leaf';

export function DocumentShelves({
  openShelf,
  onClose,
  projectId,
  routeId,
  rooms,
  canCreateBoards,
}: {
  openShelf: ShelfLeafKey | null;
  onClose: () => void;
  projectId: string;
  routeId: string;
  rooms: readonly DocumentRoom[];
  canCreateBoards: boolean;
}) {
  return (
    <ShelfPanel openShelf={openShelf} onClose={onClose}>
      {openShelf === 'planroom' && (
        <PlanRoomLeaf projectId={projectId} routeId={routeId} />
      )}
      {openShelf === 'specbook' && (
        <SpecBookLeaf projectId={projectId} rooms={rooms} />
      )}
      {openShelf === 'moodboards' && (
        <MoodBoardsLeaf
          projectId={projectId}
          rooms={rooms}
          canCreate={canCreateBoards}
        />
      )}
      {openShelf === 'knowledge' && <KnowledgeLeaf />}
    </ShelfPanel>
  );
}
