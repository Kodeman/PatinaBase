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
  PROJECT_PAPER_ORDER,
  type DocumentIndexKey,
} from '@/lib/document/document-index';
import {
  deriveKindLine,
  isResolved,
  marginAccent,
  type MarginItemRow,
} from '@/lib/document/margin-derivation';
import { MItemContent } from './m-item';

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
  return (
    PROJECT_PAPER_ORDER.find((region) => region.key === key)?.label ?? key
  ).toUpperCase();
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
  const accent = marginAccent(row.kind);
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
    <div
      className={`doc-elevated mb-2 rounded-[4px] border border-[var(--doc-ink-border)] bg-[var(--doc-paper)] transition-colors duration-150 hover:border-[#CFC8BB] ${
        resolved ? 'opacity-65' : ''
      }`}
      style={{ borderLeft: `2.5px solid ${accent.border}` }}
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
          kindColor={accent.label}
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
