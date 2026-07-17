'use client';

import { useDraggable } from '@dnd-kit/core';
import { formatCents, type FulfillmentWorkbenchLine } from '@patina/fulfillment';

// The Workbench's LEFT side (S2, spec §5.2) — the order as the client bought
// it: circled index (the thread), item name + muted attribution, qty, price.
// Each line is a dnd-kit draggable (id = line.id); dragging it across the
// hairline is the screen's one animated moment. An unmapped line wears an
// explicit terracotta "Unmapped" chip and an Assign affordance (R1.7) — it is
// the only way to price a line without a vendor mapping, and confirm stays
// blocked until every such line is cleared.

interface ClientOrderPanelProps {
  lines: FulfillmentWorkbenchLine[];
  /** Open the assign popover for an unmapped (or reassignable) line. */
  onAssign: (lineId: string) => void;
  /** After confirm, lines are read-only (no drag/assign). */
  locked: boolean;
}

function LineRow({
  line,
  onAssign,
  locked,
}: {
  line: FulfillmentWorkbenchLine;
  onAssign: (lineId: string) => void;
  locked: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: line.id,
    disabled: locked,
  });
  const unmapped = line.mappingState === 'unmapped';

  return (
    <div
      ref={setNodeRef}
      data-testid="wb-line"
      data-line-id={line.id}
      data-line-index={line.lineIndex}
      data-mapping={line.mappingState}
      className="grid grid-cols-[1.4rem_1fr_auto] items-baseline gap-3 border-b py-2.5"
      style={{
        borderColor: 'var(--border-subtle)',
        opacity: isDragging ? 0.35 : 1,
        cursor: locked ? 'default' : 'grab',
      }}
      {...(locked ? {} : attributes)}
      {...(locked ? {} : listeners)}
    >
      <span
        className="text-[0.72rem]"
        style={{ fontFamily: 'var(--font-meta)', color: 'var(--color-clay)' }}
        data-testid="wb-line-index"
      >
        {line.circledIndex}
      </span>
      <div className="min-w-0">
        <div
          className="truncate text-[0.9rem]"
          style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}
        >
          {line.itemName}
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          <span className="truncate text-[0.66rem] text-[var(--text-muted)]">
            {line.vendorName ?? (unmapped ? 'No vendor mapping' : '—')}
            {line.qty > 1 ? ` · ×${line.qty}` : ''}
          </span>
          {unmapped && (
            <span
              data-testid="wb-unmapped-chip"
              className="rounded-sm border px-1.5 py-px text-[0.55rem] uppercase tracking-[0.1em]"
              style={{
                fontFamily: 'var(--font-meta)',
                color: 'var(--color-terracotta)',
                borderColor: 'var(--color-terracotta)',
              }}
            >
              Unmapped
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1">
        <span
          className="text-[0.78rem] tabular-nums"
          style={{ fontFamily: 'var(--font-meta)', color: 'var(--color-mocha)' }}
        >
          {formatCents(line.unitPriceCents * line.qty)}
        </span>
        {!locked && (
          <button
            type="button"
            data-testid="wb-line-assign"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onAssign(line.id);
            }}
            className="text-[0.6rem] uppercase tracking-[0.08em] underline decoration-dotted underline-offset-2"
            style={{ fontFamily: 'var(--font-meta)', color: 'var(--color-clay)' }}
          >
            {unmapped ? 'Assign' : 'Reassign'}
          </button>
        )}
      </div>
    </div>
  );
}

export function ClientOrderPanel({ lines, onAssign, locked }: ClientOrderPanelProps) {
  return (
    <div>
      <div
        className="pb-2 pt-2.5 text-[0.55rem] uppercase tracking-[0.15em] text-[var(--text-muted)]"
        style={{ fontFamily: 'var(--font-meta)' }}
      >
        The client&rsquo;s order — as purchased
      </div>
      <div data-testid="wb-client-lines">
        {lines.map((line) => (
          <LineRow key={line.id} line={line} onAssign={onAssign} locked={locked} />
        ))}
      </div>
    </div>
  );
}
