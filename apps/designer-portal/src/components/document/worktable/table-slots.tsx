'use client';

/**
 * The Speccing table's mount contract — Wave 3's integration surface.
 *
 * W2 composes the table and declares where its four tools go; W3 builds them
 * (3d rooms rail, 3a inline composer, 3b boards strip, 3c library reach-in) and
 * passes them in. An unfilled slot prints nothing at all — no wrapper, no
 * spacing, no placeholder — so the table with no tools on it is exactly the
 * spread that stands there today.
 */

import type { ReactNode } from 'react';

export const SPECCING_SLOT_KEYS = [
  'rooms-rail',
  'scheme',
  'boards-strip',
  'reach-in',
] as const;

export type SpeccingSlotKey = (typeof SPECCING_SLOT_KEYS)[number];

export interface SpeccingTableSlots {
  /** The table head: the proposal-keyed room lens (W3 3d, amendment A7). */
  'rooms-rail'?: ReactNode;
  /** The loose scheme, composed inline on the paper (W3 3a). */
  scheme?: ReactNode;
  /** The proposal-keyed boards strip (W3 3b, Q1's reversal of I136). */
  'boards-strip'?: ReactNode;
  /** The library, reached in place through one door (W3 3c). */
  'reach-in'?: ReactNode;
}

export function TableSlot({
  name,
  node,
}: {
  name: SpeccingSlotKey;
  node: ReactNode;
}) {
  if (node === undefined || node === null || node === false) return null;
  return <div data-table-slot={name}>{node}</div>;
}
