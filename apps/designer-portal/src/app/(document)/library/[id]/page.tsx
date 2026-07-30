'use client';

import { use } from 'react';
import { PieceRoom } from '@/components/document/rooms/piece/piece-room';

/**
 * /library/[id] (R40) — The Piece: a Room reached by tapping a piece on a shelf.
 * View + edit every property of one library item; leaving returns to the
 * Library. Unflagged — it rides the (document) layout (Drawer + ⌘K + LogStrip
 * persist above this Room), unconditional since the R21 dissolve (I109).
 * room-origin already classifies /library/[id]
 * as a Room labelled "the Library".
 */
export default function PieceRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <PieceRoom productId={id} />;
}
