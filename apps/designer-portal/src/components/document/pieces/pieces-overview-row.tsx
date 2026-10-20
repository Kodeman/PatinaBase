'use client';

/**
 * One room on the Document's Pieces overview (US-21 Q14, SPEC a1/a10/a12):
 * the strata mark, the room's name, `6 lines · 5 placeholders` and `~$23,564`.
 * US-43 R4: the name (`.t-d3`, with a visible ⌄) unfolds the room to its lines,
 * and the room's own acts — `Add room selection`, `Edit room selections →` —
 * stand inside the opened room rather than on every closed row. The row the
 * reader came back from carries the 3px ink bar (a10). At 390 the row stacks.
 */

import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import type { RoomFinish } from '@patina/types';
import { DocumentAction } from '../document-action';
import { StrataMark } from '../strata-mark';
import { FinishSwatch } from './finish-swatch';
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
  docId,
  row,
  open,
  returned = false,
  lifted = false,
  wallSwatch = null,
  onToggle,
  onAddLine,
  children,
}: {
  /** The id the Document was opened with (`/doc/<id>`). */
  docId: string;
  row: OverviewRow;
  open: boolean;
  /** a10 — the room the reader came back from the Build room to. */
  returned?: boolean;
  /** The room lens holds this room. */
  lifted?: boolean;
  /** S8 — the room's wall finish, from the Finishes lens. */
  wallSwatch?: RoomFinish | null;
  onToggle: () => void;
  onAddLine: () => void;
  /** The room's lines, rendered while it is open. */
  children?: ReactNode;
}) {
  const bodyId = `pieces-room-lines-${row.key}`;
  const figure = overviewRowFigure(row);
  const nameRef = useRef<HTMLButtonElement>(null);

  // T-60a F2/F6: back from the Build room, focus lands on the room row she
  // returned to; the Document has already brought it into view.
  useEffect(() => {
    if (returned) nameRef.current?.focus({ preventScroll: true });
  }, [returned]);
  // A room that closes with focus inside it hands focus back to its toggle,
  // unless something else has already taken it.
  const focusLeftWithBody = useRef(false);
  useEffect(() => {
    if (open || !focusLeftWithBody.current) return;
    focusLeftWithBody.current = false;
    const active = document.activeElement;
    if (!active || active === document.body) nameRef.current?.focus({ preventScroll: true });
  }, [open]);
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
          <h3 className="t-d3 text-[var(--ink)]">
            <button
              ref={nameRef}
              type="button"
              aria-expanded={open}
              aria-controls={open ? bodyId : undefined}
              onClick={onToggle}
              className="inline-flex min-h-11 items-center gap-2 text-left underline-offset-4 hover:underline hover:decoration-[var(--color-clay)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay-ink)]"
            >
              {row.name}
              <span
                aria-hidden
                className={`inline-block text-[16px] leading-none text-[var(--ink-faint)] motion-safe:transition-transform ${
                  open ? 'rotate-180' : ''
                }`}
              >
                ⌄
              </span>
            </button>
          </h3>
          {wallSwatch?.hex && (
            <span className="text-[var(--ink-faint)]">
              <FinishSwatch
                hex={wallSwatch.hex}
                label={`Walls, ${wallSwatch.product ?? wallSwatch.hex}`}
              />
            </span>
          )}
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
      </div>
      {open && (
        <RoomBody id={bodyId} onCloseWithFocus={() => (focusLeftWithBody.current = true)}>
          {children}
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
            <DocumentAction
              actionKey="open-add-schedule-line"
              surfaceKey="project"
              regionKey="pieces-overview-row"
              variant="tertiary"
              onClick={onAddLine}
            >
              Add room selection
            </DocumentAction>
            <DocumentAction
              actionKey="work-this-room"
              surfaceKey="project"
              regionKey="pieces-overview-row"
              variant="secondary"
              href={buildRoomHref(docId, { lens: 'rough', room: row.key })}
              trailing="→"
            >
              Edit room selections
            </DocumentAction>
          </div>
        </RoomBody>
      )}
    </li>
  );
}

/** The opened room. Its layout-effect cleanup runs before the body leaves the
 *  page, while it can still see whether focus was inside it. */
function RoomBody({
  id,
  onCloseWithFocus,
  children,
}: {
  id: string;
  onCloseWithFocus: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onClose = useRef(onCloseWithFocus);
  onClose.current = onCloseWithFocus;
  useLayoutEffect(() => {
    const body = ref.current;
    return () => {
      if (body?.contains(document.activeElement)) onClose.current();
    };
  }, []);
  return (
    <div ref={ref} id={id} className="pb-3">
      {children}
    </div>
  );
}
