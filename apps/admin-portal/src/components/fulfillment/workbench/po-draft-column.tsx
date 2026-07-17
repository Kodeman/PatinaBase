'use client';

import { useDroppable } from '@dnd-kit/core';
import {
  groupProposedPos,
  formatSideMark,
  type FulfillmentOrderDetailDTO,
  type FulfillmentWorkbenchLine,
  type PoState,
} from '@patina/fulfillment';
import { PoDraftCard } from './po-draft-card';

// The Workbench's RIGHT side (S2, spec §5.2). Pre-confirm it renders the
// PROPOSED split (groupProposedPos — client-side, letters matching what
// confirm_split will mint) plus an explicit Unmapped group that visibly blocks
// confirm, plus a "new PO" drop target. Post-confirm it renders the real POs
// (read-mostly; a drag between them is a move-line reshuffle). Every line's
// circled index appears here AND on the left — the thread.

const STATUS_TONE: Record<PoState, 'draft' | 'sent' | 'ack' | 'late'> = {
  draft: 'draft',
  sent: 'sent',
  acknowledged: 'ack',
  in_production: 'ack',
  shipped: 'ack',
  delivered: 'ack',
  settled: 'ack',
  cancelled: 'late',
};
const STATUS_LABEL: Record<PoState, string> = {
  draft: 'Draft',
  sent: 'Sent',
  acknowledged: 'Acknowledged',
  in_production: 'In production',
  shipped: 'Shipped',
  delivered: 'Delivered',
  settled: 'Settled',
  cancelled: 'Cancelled',
};

interface PoDraftColumnProps {
  detail: FulfillmentOrderDetailDTO;
}

function NewPoTarget() {
  const { setNodeRef, isOver } = useDroppable({ id: 'new' });
  return (
    <div
      ref={setNodeRef}
      data-testid="wb-new-po-target"
      data-warm={isOver ? 'true' : 'false'}
      className="rounded-sm border border-dashed px-3 py-3 text-center text-[0.6rem] uppercase tracking-[0.12em] transition-colors"
      style={{
        fontFamily: 'var(--font-meta)',
        color: isOver ? 'var(--color-clay)' : 'var(--text-muted)',
        borderColor: isOver ? 'var(--color-clay)' : 'var(--border-default)',
        backgroundColor: isOver ? 'var(--bg-hover)' : 'transparent',
      }}
    >
      Drop here for a new PO / other vendor
    </div>
  );
}

export function PoDraftColumn({ detail }: PoDraftColumnProps) {
  const { order, lines, pos, vendors, confirmed } = detail;
  const linesById = new Map(lines.map((l) => [l.id, l]));

  const cap = confirmed
    ? 'The fulfillment ledger — vendor POs'
    : 'The fulfillment ledger — proposed split, confirm or drag';

  return (
    <div>
      <div
        className="pb-2 pt-2.5 text-[0.55rem] uppercase tracking-[0.15em] text-[var(--text-muted)]"
        style={{ fontFamily: 'var(--font-meta)' }}
        data-testid="wb-po-colcap"
      >
        {cap}
      </div>

      <div data-testid="wb-po-cards">
        {confirmed
          ? pos.map((po) => {
              const poLines = po.lineIds
                .map((id) => linesById.get(id))
                .filter((l): l is FulfillmentWorkbenchLine => !!l);
              return (
                <PoDraftCard
                  key={po.id}
                  dropId={`po:${po.id}`}
                  title={`${po.poNumber ?? '—'} · ${po.vendorName ?? 'Vendor'}`}
                  statusLabel={STATUS_LABEL[po.status]}
                  statusTone={STATUS_TONE[po.status]}
                  transmissionType={po.transmissionType}
                  sideMark={po.sideMark}
                  costCents={po.productCostCents}
                  lines={poLines}
                  droppable={po.status === 'draft'}
                  draggableLines={po.status === 'draft'}
                />
              );
            })
          : (() => {
              const { pos: proposed, unmapped } = groupProposedPos(
                lines,
                vendors,
                order.orderNo,
              );
              return (
                <>
                  {proposed.map((p) => (
                    <PoDraftCard
                      key={p.vendorId}
                      dropId={`vendor:${p.vendorId}`}
                      title={`${p.proposedPoNumber} · ${p.vendorName ?? 'Vendor'}`}
                      statusLabel="Draft"
                      statusTone="draft"
                      transmissionType={p.transmissionType}
                      sideMark={formatSideMark(order.clientName, order.orderNo)}
                      costCents={p.productCostCents}
                      lines={p.lines}
                      droppable
                    />
                  ))}

                  {unmapped.length > 0 && (
                    <div
                      data-testid="wb-unmapped-group"
                      className="mb-3 rounded-sm border border-dashed p-3"
                      style={{ borderColor: 'var(--color-terracotta)' }}
                    >
                      <div
                        className="mb-1.5 text-[0.6rem] uppercase tracking-[0.12em]"
                        style={{ fontFamily: 'var(--font-meta)', color: 'var(--color-terracotta)' }}
                      >
                        Unmapped — assign a vendor to confirm ({unmapped.length})
                      </div>
                      {unmapped.map((l) => (
                        <div
                          key={l.id}
                          data-testid="wb-unmapped-line"
                          data-line-id={l.id}
                          className="flex items-baseline gap-2 py-1 text-[0.72rem]"
                          style={{ color: 'var(--color-mocha)' }}
                        >
                          <span style={{ fontFamily: 'var(--font-meta)', color: 'var(--color-clay)' }}>
                            {l.circledIndex}
                          </span>
                          <span className="min-w-0 flex-1 truncate">{l.itemName}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <NewPoTarget />
                </>
              );
            })()}
      </div>
    </div>
  );
}
