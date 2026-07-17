'use client';

import { useDroppable, useDraggable } from '@dnd-kit/core';
import { formatCents, type FulfillmentWorkbenchLine } from '@patina/fulfillment';

// A single vendor PO card on the Workbench's RIGHT side (S2, spec §5.2) —
// proposed (pre-confirm, grouped client-side) or real (post-confirm). Header:
// PO letter/number + vendor name + status chip + transmission-type tag. Body:
// the vendor's lines, each carrying the SAME circled index as its twin on the
// left — the ①-thread that is the screen's signature. The card is a dnd-kit
// droppable; while a line hovers it, `data-warm` flips and the border/bg warm
// toward clay (the presentation's "the destination PO warms").

const TRANSMISSION_LABEL: Record<string, string> = {
  email: 'email',
  portal: 'portal',
  csv: 'CSV',
};

interface PoDraftCardProps {
  /** dnd-kit droppable id: `vendor:<vendorId>` (proposed) or `po:<poId>` (real). */
  dropId: string;
  /** e.g. "PO-2026-00001-A · Room & Board". */
  title: string;
  statusLabel: string;
  /** 'draft' | 'sent' | 'acknowledged' | … drives the chip color. */
  statusTone: 'draft' | 'sent' | 'ack' | 'late';
  transmissionType?: string | null;
  sideMark?: string | null;
  costCents: number;
  lines: FulfillmentWorkbenchLine[];
  /** false disables the droppable (post-confirm read-only, or the Unmapped bin). */
  droppable: boolean;
  /** true makes each line draggable (post-confirm move-line reshuffle). */
  draggableLines?: boolean;
}

function PoLine({ line, draggable }: { line: FulfillmentWorkbenchLine; draggable: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: line.id,
    disabled: !draggable,
  });
  return (
    <div
      ref={setNodeRef}
      data-testid="wb-po-line"
      data-line-id={line.id}
      data-line-index={line.lineIndex}
      className="flex items-baseline gap-2 py-1 text-[0.72rem]"
      style={{
        color: 'var(--color-mocha)',
        opacity: isDragging ? 0.35 : 1,
        cursor: draggable ? 'grab' : 'default',
      }}
      {...(draggable ? attributes : {})}
      {...(draggable ? listeners : {})}
    >
      <span style={{ fontFamily: 'var(--font-meta)', color: 'var(--color-clay)' }}>
        {line.circledIndex}
      </span>
      <span className="min-w-0 flex-1 truncate">
        {line.itemName}
        {line.qty > 1 ? ` · ×${line.qty}` : ''}
      </span>
      <span
        className="tabular-nums text-[0.66rem] text-[var(--text-muted)]"
        style={{ fontFamily: 'var(--font-meta)' }}
      >
        {line.unitCostCents != null ? formatCents(line.unitCostCents * line.qty) : '—'}
      </span>
    </div>
  );
}

const STATUS_COLOR: Record<string, string> = {
  draft: 'var(--text-muted)',
  sent: 'var(--color-dusty-blue)',
  ack: 'var(--color-sage)',
  late: 'var(--color-terracotta)',
};

export function PoDraftCard({
  dropId,
  title,
  statusLabel,
  statusTone,
  transmissionType,
  sideMark,
  costCents,
  lines,
  droppable,
  draggableLines = false,
}: PoDraftCardProps) {
  const { setNodeRef, isOver } = useDroppable({ id: dropId, disabled: !droppable });

  return (
    <div
      ref={setNodeRef}
      data-testid="wb-po-card"
      data-drop-id={dropId}
      data-warm={droppable && isOver ? 'true' : 'false'}
      className="mb-3 rounded-sm border p-3 transition-colors"
      style={{
        borderColor: isOver && droppable ? 'var(--color-clay)' : 'var(--border-default)',
        backgroundColor: isOver && droppable ? 'var(--bg-hover)' : 'var(--bg-surface)',
      }}
    >
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span
          className="truncate text-[0.75rem] font-semibold"
          style={{ color: 'var(--text-primary)' }}
        >
          {title}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {transmissionType && (
            <span
              className="text-[0.55rem] uppercase tracking-[0.1em] text-[var(--text-muted)]"
              style={{ fontFamily: 'var(--font-meta)' }}
            >
              {TRANSMISSION_LABEL[transmissionType] ?? transmissionType}
            </span>
          )}
          <span
            data-testid="wb-po-status"
            className="text-[0.55rem] uppercase tracking-[0.12em]"
            style={{ fontFamily: 'var(--font-meta)', color: STATUS_COLOR[statusTone] }}
          >
            {statusLabel}
          </span>
        </span>
      </div>

      {lines.map((l) => (
        <PoLine key={l.id} line={l} draggable={draggableLines} />
      ))}

      {(sideMark || costCents > 0) && (
        <div
          className="mt-2 flex items-baseline justify-between border-t pt-1.5 text-[0.58rem] uppercase tracking-[0.08em] text-[var(--text-muted)]"
          style={{ fontFamily: 'var(--font-meta)', borderColor: 'var(--border-subtle)' }}
        >
          <span>{sideMark ? `side-mark ${sideMark}` : ''}</span>
          <span className="tabular-nums">{formatCents(costCents)}</span>
        </div>
      )}
    </div>
  );
}
