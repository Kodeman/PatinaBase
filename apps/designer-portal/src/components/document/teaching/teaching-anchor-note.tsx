'use client';

/**
 * Return teaching, in place (system-architecture §5 "In place", mockup 05): a
 * note in a sheet's margin after the sheet's completion act. It declares its
 * surface on mount, so a tagged boundary that fires here is attributed here,
 * and the hook returns a note only after that boundary has fired and the
 * surface is at rest. Nothing shows on mount.
 */

import { useEffect, useState, type RefObject } from 'react';
import { useTeachingNoteFor } from '@/hooks/use-teaching-note';
import {
  boundaryLog,
  getCurrentTeachingSurface,
  setCurrentTeachingSurface,
} from '@/lib/teaching/boundaries';
import { MarginNote } from '../margin-note';

/**
 * The sheet's margin column: the rows, then the note. Two columns from 860px
 * (the breakpoint MarginNote's anchor rule turns on), and only while a note is
 * in it; below that the note stacks after the rows.
 */
export const TEACHING_MARGIN_COLUMN =
  'min-[860px]:has-[>aside]:grid min-[860px]:has-[>aside]:grid-cols-[minmax(0,1fr)_auto] min-[860px]:has-[>aside]:gap-x-10';

export function TeachingAnchorNote({
  surfaceKey,
  anchor,
  hostRef,
}: {
  surfaceKey: string;
  anchor?: string;
  /** An element inside the hosting sheet: the sheet never blocks its own note. */
  hostRef: RefObject<HTMLElement | null>;
}) {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setHost(hostRef.current);
    setCurrentTeachingSurface(surfaceKey);
    return () => {
      // Another surface may have declared itself since; leave its claim alone.
      if (getCurrentTeachingSurface() === surfaceKey) setCurrentTeachingSurface('unknown');
    };
  }, [surfaceKey, hostRef]);

  const { note, bind } = useTeachingNoteFor(surfaceKey, {
    slot: 'anchor',
    host,
    anchor,
    boundaries: boundaryLog,
  });
  if (!note || !bind) return null;
  return <MarginNote {...bind}>{note.body}</MarginNote>;
}
