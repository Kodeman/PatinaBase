'use client';

/**
 * Return teaching at the act (system-architecture §5): one sentence above a
 * send act. Only `workflow_changing` releases reach this slot; the selector
 * enforces that, not this component.
 */

import { useEffect, useState, type RefObject } from 'react';
import { useTeachingNoteFor } from '@/hooks/use-teaching-note';
import { MarginNote } from '../margin-note';

export function TeachingActNote({
  surfaceKey,
  hostRef,
}: {
  surfaceKey: string;
  /** An element inside the hosting sheet: the sheet never blocks its own note. */
  hostRef: RefObject<HTMLElement | null>;
}) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => setHost(hostRef.current), [hostRef]);

  const { note, bind } = useTeachingNoteFor(surfaceKey, { slot: 'act', host });
  if (!note || !bind) return null;
  return (
    <MarginNote {...bind} className="mb-4">
      {note.body}
    </MarginNote>
  );
}
