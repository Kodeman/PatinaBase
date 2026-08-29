'use client';

/**
 * The kickoff band (slide 15) — "no roster step in the open-project sheet.
 * Essentials at birth, composition on the document, where the designer is
 * already looking."
 *
 * One band under the letterhead: "– You're on the call sheet as lead. Who else
 * is on the job?" and three scored words. It goes away two ways, and only two:
 *   · LATER writes the permanent dismissal (the MarginNote localStorage
 *     mechanism, key `kickoff:{projectId}`), or
 *   · the sheet starts doing its job — `kickoffRetired(rows)` at four names.
 * Never a "don't show again" checkbox, never a step counter (R94).
 *
 * SSR-safe like MarginNote: nothing renders on the server or the first client
 * paint, then the band reveals after mount iff it hasn't been dismissed — so a
 * dismissed band never flashes.
 *
 * Flag-gated on `call-sheet` at this consumer.
 *
 * FIX 2 (kickoff/instrument open modes) — the two doorways dispatch
 * `document:open-call-sheet` directly (the same event ⌘K and the letterhead
 * instrument use) rather than calling back into the page: FROM THE ROLODEX
 * carries mode 'picker' (straight to the rolodex), NEW PERSON carries mode
 * 'add' (the picker already in its add-a-person state) — so either one skips
 * the intermediate roster list the plain sheet-open lands on.
 */

import { useEffect, useRef, useState } from 'react';
import type { ProjectRosterRow } from '@patina/supabase';
import { useFeatureFlag } from '@/hooks/use-feature-flag';
import { kickoffRetired } from '@/lib/document/roster-derivation';
import { hasMarginNoteBeenSeen, markMarginNoteSeen } from '../margin-note';
import { DocumentAction, DocumentActionRow } from '../document-action';
import type { CallSheetOpenMode } from './call-sheet';

export function kickoffNoteKey(projectId: string): string {
  return `kickoff:${projectId}`;
}

function dispatchOpenCallSheet(mode: CallSheetOpenMode) {
  window.dispatchEvent(new CustomEvent('document:open-call-sheet', { detail: { mode } }));
}

export function KickoffBand({
  projectId,
  rows,
}: {
  projectId: string;
  rows: ProjectRosterRow[];
}) {
  const { value: callSheetOn } = useFeatureFlag('call-sheet');
  const noteKey = kickoffNoteKey(projectId);
  const [revealed, setRevealed] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // The count the band first saw — the running sub-line appears only once the
  // roster has grown past it, so a project that opens with three names doesn't
  // get congratulated for standing still.
  const initialCount = useRef<number | null>(null);
  if (initialCount.current === null && rows.length > 0) {
    initialCount.current = rows.length;
  }

  useEffect(() => {
    setDismissed(hasMarginNoteBeenSeen(noteKey));
    setRevealed(true);
  }, [noteKey]);

  if (!callSheetOn || !revealed || dismissed || kickoffRetired(rows)) return null;

  const grown =
    initialCount.current !== null && rows.length > initialCount.current;

  return (
    <div
      data-kickoff-band
      className="mt-[var(--doc-region-gap)] flex flex-wrap items-baseline justify-between gap-x-5 gap-y-2 border-l-2 border-[var(--color-clay)] bg-white/40 px-3 py-2.5"
    >
      <div className="min-w-0">
        <p className="text-[0.8rem] text-[var(--color-charcoal)]">
          – You&rsquo;re on the call sheet as lead. Who else is on the job?
        </p>
        {grown && (
          <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--color-aged-oak)]">
            {rows.length} on the call sheet
          </p>
        )}
      </div>
      <DocumentActionRow
        surfaceKey="call-sheet"
        regionKey="kickoff-band"
        aria-label="Add to the call sheet"
      >
        <DocumentAction
          actionKey="kickoff-from-rolodex"
          variant="primary"
          onClick={() => dispatchOpenCallSheet('picker')}
        >
          From the rolodex
        </DocumentAction>
        <DocumentAction
          actionKey="kickoff-new-person"
          variant="secondary"
          onClick={() => dispatchOpenCallSheet('add')}
        >
          New person
        </DocumentAction>
        <DocumentAction
          actionKey="kickoff-later"
          variant="tertiary"
          onClick={() => {
            markMarginNoteSeen(noteKey);
            setDismissed(true);
          }}
        >
          Later
        </DocumentAction>
      </DocumentActionRow>
    </div>
  );
}
