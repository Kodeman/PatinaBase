'use client';

/**
 * The Finalize table's shelf block (Start to Signature W4a, flag `worktable`).
 *
 * A proposal document has no rooms, no running index and no project shelves —
 * it has exactly one thing worth keeping beside the paper, and that is the
 * client's copy. So the spine grows the shelves block and nothing else, with
 * one row on it. The row and its leaf exist only from 1440px by the panel's own
 * construction; below that the watch's Preview act is the copy's form (Q7/A4).
 */

import type { ShelfKey } from '@/lib/document/shelves';
import { SpineShelvesBlock } from '../spine-shelves-block';

const STATUSES: Record<ShelfKey, string> = {
  planroom: '',
  specbook: '',
  moodboards: '',
  callsheet: '',
  knowledge: '',
  clientcopy: 'As sent · live',
};

export function FinalizeShelf({
  openShelf,
  onToggleShelf,
}: {
  openShelf: ShelfKey | null;
  onToggleShelf: (key: ShelfKey) => void;
}) {
  return (
    <SpineShelvesBlock
      openShelf={openShelf}
      statuses={STATUSES}
      subject="proposal"
      callSheetEnabled={false}
      clientCopyEnabled
      onToggleShelf={onToggleShelf}
    />
  );
}
