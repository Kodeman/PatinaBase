'use client';

/**
 * The turn — the one line a stale table is allowed to print.
 *
 * Transitions are ceremonies, not surprises (Direction B, principle 5): the
 * paper says the table is ready and waits to be turned. Scored ink, never a
 * button, and never more than this one line.
 */

import { DocumentAction, DocumentActionRow } from '../document-action';

export function TableTurnLine({ onTurn }: { onTurn: () => void }) {
  return (
    <DocumentActionRow
      surfaceKey="open-document"
      regionKey="table-turn"
      className="mt-1"
      aria-label="The table is ready to turn"
    >
      <span
        data-table-turn
        className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-aged-oak)]"
      >
        The table is ready to turn —
      </span>
      <DocumentAction actionKey="turn-the-table" variant="secondary" onClick={onTurn}>
        Turn it
      </DocumentAction>
    </DocumentActionRow>
  );
}
