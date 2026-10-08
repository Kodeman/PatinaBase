'use client';

/**
 * One room on the Document's Pieces overview (US-21 Q14, SPEC a1/a10/a12):
 * the strata mark, the room's name, `6 lines · 5 placeholders`, `~$23,564`,
 * `ADD A LINE` and `WORK THIS ROOM →`. The name unfolds the room to its lines.
 * The row the reader came back from carries the 3px ink bar (a10). At 390 the
 * row stacks, `WORK THIS ROOM →` above `ADD A LINE` (a12).
 */

import type { ReactNode } from 'react';
import { DocumentAction } from '../document-action';
import { StrataMark } from '../strata-mark';
import { buildRoomHref } from '@/lib/document/pieces/build-room-url';
import {
  overviewRowCounts,
  overviewRowFigure,
  type OverviewRow,
} from '@/lib/document/pieces/overview-derivation';

export function piecesOverviewRowId(row: Pick<OverviewRow, 'key'>): string {
  return `pieces-room-${row.key}`;
}

export function PiecesOverviewRow({
  projectId,
  row,
  open,
  returned = false,
  lifted = false,
  onToggle,
  onAddLine,
  children,
}: {
  projectId: string;
  row: OverviewRow;
  open: boolean;
  /** a10 — the room the reader came back from the Build room to. */
  returned?: boolean;
  /** The room lens holds this room. */
  lifted?: boolean;
  onToggle: () => void;
  onAddLine: () => void;
  /** The room's lines, rendered while it is open. */
  children?: ReactNode;
}) {
  const bodyId = `pieces-room-lines-${row.key}`;
  const figure = overviewRowFigure(row);
  return (
    <li
      id={piecesOverviewRowId(row)}
      data-pieces-room={row.key}
      data-returned={returned ? 'true' : undefined}
      className={`scroll-mt-16 border-b border-l-[3px] border-b-[color:var(--color-pearl)] pl-3 ${
        returned ? 'border-l-[color:var(--ink)]' : 'border-l-transparent'
      } ${lifted ? 'doc-room-lifted' : ''}`}
    >
      <div
        id={row.roomId ? `doc-room-${row.roomId}` : undefined}
        className="flex min-h-14 scroll-mt-16 flex-col gap-1 py-2 sm:flex-row sm:items-center sm:gap-4"
      >
        <div className="flex items-center gap-3">
          <StrataMark size="sm" state={row.mark} />
          <h3 className="font-heading text-[16px] italic text-[var(--ink)]">
            <button
              type="button"
              aria-expanded={open}
              aria-controls={open ? bodyId : undefined}
              onClick={onToggle}
              className="min-h-11 text-left underline-offset-4 hover:underline hover:decoration-[var(--color-clay)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay-ink)]"
            >
              {row.name}
            </button>
          </h3>
        </div>
        <div className="flex items-baseline gap-4">
          <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--ink-faint)]">
            {overviewRowCounts(row)}
          </span>
          {figure && (
            <span className="text-[14px] tabular-nums text-[var(--ink)]">
              {figure}
            </span>
          )}
        </div>
        {/* DOM order is the 1440 order; at 390 the door stands first. */}
        <div className="flex flex-col-reverse items-start gap-1 sm:ml-auto sm:flex-row sm:items-center sm:gap-4">
          <DocumentAction
            actionKey="open-add-schedule-line"
            surfaceKey="project"
            regionKey="pieces-overview-row"
            variant="tertiary"
            onClick={onAddLine}
          >
            Add a line
          </DocumentAction>
          <DocumentAction
            actionKey="work-this-room"
            surfaceKey="project"
            regionKey="pieces-overview-row"
            variant="secondary"
            href={buildRoomHref(projectId, { lens: 'rough', room: row.key })}
            trailing="→"
          >
            Work this room
          </DocumentAction>
        </div>
      </div>
      {open && (
        <div id={bodyId} className="pb-3">
          {children}
        </div>
      )}
    </li>
  );
}
