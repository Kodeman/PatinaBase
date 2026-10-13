'use client';

/**
 * The margin item shell (spec §5): one component for all five kinds — paper
 * card, 2.5px kind-accent left border, mono kind line, title, detail,
 * unfoldable body. Resolved items quiet to 65% opacity. Hovering a
 * line-anchored item highlights its line (§13 Slice 3).
 *
 * Wave 1 (RF-03): every card prints where it is anchored — `BESIDE PIECES` for
 * a line anchor, `ABOUT THE WHOLE JOB` for a section or letterhead one — so a
 * card lifted out of its group still says what it sits beside.
 */

import {
  DOCUMENT_INDEX_LABELS,
  type DocumentIndexKey,
} from '@/lib/document/document-index';
import {
  deriveKindLine,
  isResolved,
  type MarginItemRow,
} from '@/lib/document/margin-derivation';
import { MItemContent } from './m-item';

/** The margin's kind word is ink, never a pigment (V20 U-Q13). */
const MARGIN_KIND_INK = 'var(--text-primary)';

/**
 * The paper region a margin item is anchored to, or null for the whole job.
 * `margin_items` only ever resolves a `line` anchor to a `project_ffe_items`
 * id (00197), so a line anchor is the Pieces region; `section` and
 * `letterhead` anchor nothing narrower than the document itself.
 */
export function marginAnchorRegion(row: MarginItemRow): DocumentIndexKey | null {
  return row.anchor_kind === 'line' ? 'ffe' : null;
}

export function marginRegionName(key: DocumentIndexKey): string {
  return DOCUMENT_INDEX_LABELS[key].toUpperCase();
}

/** The card's printed anchor line. */
export function marginAnchorLine(row: MarginItemRow): string {
  const key = marginAnchorRegion(row);
  return key ? `BESIDE ${marginRegionName(key)}` : 'ABOUT THE WHOLE JOB';
}

export function MarginItem({
  row,
  open,
  onToggle,
  onHoverAnchor,
  targetId,
  children,
}: {
  row: MarginItemRow;
  open: boolean;
  onToggle?: () => void;
  onHoverAnchor?: (lineId: string | null) => void;
  targetId?: string;
  children?: React.ReactNode;
}) {
  const resolved = isResolved(row);
  const expandable = Boolean(onToggle);
  const hoverProps =
    row.anchor_kind === 'line' && row.anchor_id && onHoverAnchor
      ? {
          onMouseEnter: () => onHoverAnchor(row.anchor_id),
          onMouseLeave: () => onHoverAnchor(null),
        }
      : {};

  return (
    // US-28 S7 — a Card off the paper (L2): the one stock, the 1px card edge,
    // and the kind printed in ink. No pigment edge, no pigment kind word: the
    // kind is the word itself (V20 U-Q13).
    <div
      data-margin-kind={row.kind}
      className={`mb-2 rounded-[2px] border border-[var(--card-edge)] bg-[var(--paper-doc)] ${
        resolved ? 'opacity-65' : ''
      }`}
      {...hoverProps}
    >
      <button
        id={targetId}
        type="button"
        onClick={onToggle}
        disabled={!expandable}
        aria-expanded={expandable ? open : undefined}
        className="block w-full px-3 py-2.5 text-left"
      >
        <MItemContent
          kindLine={deriveKindLine(row)}
          kindColor={MARGIN_KIND_INK}
          title={row.title}
          detail={row.detail}
          tone="paper"
        />
        <span
          data-margin-anchor-line
          className="mt-1 block font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--text-muted)]"
        >
          {marginAnchorLine(row)}
        </span>
      </button>
      {expandable && open && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}
