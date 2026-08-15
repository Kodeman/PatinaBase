'use client';

/**
 * Knowledge — an honest empty shelf. Nothing in this codebase records
 * cross-project standards or lessons, so there is nothing to list; the shelf
 * says so in one line rather than printing an invented set.
 *
 * The one real door is `/library`, whose middle shelf IS the studio library —
 * proven pieces, not written standards. It is offered as what it is.
 */

import Link from 'next/link';
import { ShelfNote, ShelfDoor } from './shelf-parts';

export function KnowledgeLeaf() {
  return (
    <>
      <ShelfNote>
        Studio library — cross-project standards. Nothing filed for this
        project.
      </ShelfNote>
      <ShelfDoor>
        <Link href="/library" className="block">
          Open the studio library →
        </Link>
      </ShelfDoor>
    </>
  );
}
