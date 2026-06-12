'use client';

/**
 * The margin item shell (spec §5): one component for all five kinds — paper
 * card, 2.5px kind-accent left border, mono kind line, title, detail,
 * unfoldable body. Resolved items quiet to 65% opacity. Hovering a
 * line-anchored item highlights its line (§13 Slice 3).
 */

import {
  deriveKindLine,
  isResolved,
  marginAccent,
  type MarginItemRow,
} from '@/lib/document/margin-derivation';

export function MarginItem({
  row,
  open,
  onToggle,
  onHoverAnchor,
  children,
}: {
  row: MarginItemRow;
  open: boolean;
  onToggle?: () => void;
  onHoverAnchor?: (lineId: string | null) => void;
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
      className={`mb-2 rounded-[5px] border border-[var(--color-pearl)] bg-[var(--doc-paper)] transition-colors duration-150 hover:border-[#CFC8BB] ${
        resolved ? 'opacity-65' : ''
      }`}
      style={{ borderLeft: `2.5px solid ${accent.border}` }}
      {...hoverProps}
    >
      <button
        type="button"
        onClick={onToggle}
        disabled={!expandable}
        className="block w-full px-3 py-2.5 text-left"
      >
        <span
          className="mb-0.5 block font-mono text-[8px] font-semibold uppercase tracking-[0.06em]"
          style={{ color: accent.label }}
        >
          {deriveKindLine(row)}
        </span>
        <span className="block text-[11.5px] font-medium leading-snug text-[var(--color-charcoal)]">
          {row.title}
        </span>
        {row.detail && (
          <span className="mt-0.5 block text-[10.5px] leading-relaxed text-[var(--text-muted)]">
            {row.detail}
          </span>
        )}
      </button>
      {expandable && open && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}
