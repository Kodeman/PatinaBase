'use client';

import { useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { resolveDragOutcome, type FulfillmentOrderDetailDTO } from '@patina/fulfillment';
import { useAssignLine, useConfirmSplit, useMoveLine } from '@/hooks/use-fulfillment-order';
import { ClientOrderPanel } from './client-order-panel';
import { PoDraftColumn } from './po-draft-column';
import { MoneyStrip } from './money-strip';
import { ConfirmSplitBar } from './confirm-split-bar';
import { UnmappedAssignPopover } from './unmapped-assign-popover';

// The Order Workbench (S2, spec §5.2, "where one becomes six"). A three-track
// CSS grid — client order (5fr) · a literal 1px hairline column · vendor POs
// (7fr) — wrapped in one DndContext (PointerSensor + KeyboardSensor). Dragging a
// line across the hairline is the screen's single animated moment: the
// destination card warms (dnd-kit isOver → data-warm) and the money strip
// re-figures from cache (MoneyStrip calls computeMoneyStrip). Drag semantics
// depend on whether the split is confirmed:
//   • pre-confirm  — proposed groups are vendors; a drop reassigns the line's
//                    vendor (assign RPC). An unmapped line has no cost, so its
//                    drop opens the assign popover instead of guessing 0.
//   • post-confirm — real POs exist; a drop is a move-line reshuffle.

interface WorkbenchProps {
  detail: FulfillmentOrderDetailDTO;
}

export function Workbench({ detail }: WorkbenchProps) {
  const { order, lines, vendors, config, confirmed } = detail;

  const assign = useAssignLine(order.id);
  const move = useMoveLine(order.id);
  const confirm = useConfirmSplit(order.id);

  const [activeLineId, setActiveLineId] = useState<string | null>(null);
  const [popover, setPopover] = useState<{ lineId: string; defaultVendorId?: string | null } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const lineById = useMemo(() => new Map(lines.map((l) => [l.id, l])), [lines]);
  const activeLine = activeLineId ? lineById.get(activeLineId) ?? null : null;
  const popoverLine = popover ? lineById.get(popover.lineId) ?? null : null;

  const handleDragStart = (e: DragStartEvent) => setActiveLineId(String(e.active.id));

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveLineId(null);
    const { active, over } = e;
    const lineId = String(active.id);
    const line = lineById.get(lineId);
    if (!line) return;

    // The drop's meaning (move / assign / popover / noop) is decided by the
    // pure resolveDragOutcome (@patina/fulfillment, tested in drag.test.ts);
    // this component just dispatches it.
    const outcome = resolveDragOutcome(over ? String(over.id) : null, line);
    switch (outcome.action) {
      case 'move':
        move.mutate({ lineId, poId: outcome.poId });
        break;
      case 'assign':
        assign.mutate({ lineId, vendorId: outcome.vendorId, unitCostCents: outcome.unitCostCents });
        break;
      case 'popover':
        setPopover({ lineId, defaultVendorId: outcome.defaultVendorId });
        break;
      case 'noop':
        break;
    }
  };

  const confirmError =
    confirm.error instanceof Error ? confirm.error.message : null;

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div
        data-testid="workbench-grid"
        className="grid items-start gap-0"
        style={{ gridTemplateColumns: 'minmax(0,5fr) 1px minmax(0,7fr)' }}
      >
        <div className="pr-5">
          <ClientOrderPanel
            lines={lines}
            locked={confirmed}
            onAssign={(lineId) => setPopover({ lineId })}
          />
        </div>

        {/* the literal 1px hairline column */}
        <div
          aria-hidden
          className="h-full w-px"
          style={{ backgroundColor: 'var(--border-default)' }}
        />

        <div className="pl-5">
          <PoDraftColumn detail={detail} />
        </div>
      </div>

      <MoneyStrip lines={lines} order={order} config={config} />

      <ConfirmSplitBar
        lines={lines}
        confirmed={confirmed}
        poCount={detail.pos.length}
        pending={confirm.isPending}
        error={confirmError}
        onConfirm={() => confirm.mutate()}
      />

      <DragOverlay>
        {activeLine ? (
          <div
            className="rounded-sm border px-3 py-2 text-[0.8rem] shadow-sm"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--color-clay)',
              fontFamily: 'var(--font-display)',
              color: 'var(--text-primary)',
            }}
          >
            <span style={{ fontFamily: 'var(--font-meta)', color: 'var(--color-clay)' }}>
              {activeLine.circledIndex}
            </span>{' '}
            {activeLine.itemName}
          </div>
        ) : null}
      </DragOverlay>

      <UnmappedAssignPopover
        open={!!popover}
        line={popoverLine}
        vendors={vendors}
        defaultVendorId={popover?.defaultVendorId}
        onClose={() => setPopover(null)}
        onSubmit={(payload) => {
          if (!popover) return;
          assign.mutate({ lineId: popover.lineId, ...payload });
          setPopover(null);
        }}
      />
    </DndContext>
  );
}
