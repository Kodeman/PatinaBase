import { useState } from 'react';
import type { StudioPurchaseRow } from '@patina/supabase';
import { AckRecord, usePoAckSummary } from '../buying/ack-check';
import { fmtDay } from '@/lib/document/format';
import { NAMED_ACTS } from '@/lib/document/act-names';
import { PurchaseFact } from '../purchases/purchase-fact';
import type { LineAuthorization } from '@/lib/document/authorization-derivation';
import { CellSub, CellValue, UnfoldCell } from './cell';
import { ChangeOrderAct } from './change-order';
import { PoRiders } from '@/components/portal/procurement/order-paper/riders';
import { PurchaseOrderDrafts } from '../buying/draft-review';

type FFERow = any;

const ORDER_DRAFT_KINDS = ['ack_discrepancy_reply', 'ack_chase'] as const;

/**
 * C-14 cell 3 — the order: PO number, the send/ack lifecycle (R18), and the
 * ship-to. With no PO yet, it says what would make the line orderable (C-11a)
 * in place of Order. Logging the ack (C-10) is the line's lifted next act
 * whenever it applies, so it never renders here. A live PO carries the
 * tertiary "Change this order…" act (C-21), and the PO's riders (C-26).
 */
export function OrderCell({
  item,
  po,
  purchase = null,
  reasons,
  projectId,
  auth = { track: 'none' },
  canChange = false,
}: {
  item: FFERow;
  po: FFERow | null;
  /** C-25: the line was bought on a card or on the spot — no PO. */
  purchase?: StudioPurchaseRow | null;
  /** C-11a readiness reasons to show — empty when Order is on offer. */
  reasons: readonly string[];
  projectId?: string;
  /** R8: which instrument holds this line — gates price-bearing changes. */
  auth?: LineAuthorization;
  /** The viewer may edit this line (C-21 change orders). */
  canChange?: boolean;
}) {
  const [changeOpen, setChangeOpen] = useState(false);
  // C-27: the acknowledgment's own stamp once a v2 ack is on file.
  const ack = usePoAckSummary(po?.acknowledged_at ? po.id : null);
  const sub = po
    ? [
        po.sent_at ? `sent to vendor ${fmtDay(po.sent_at)}` : 'not yet sent',
        po.sent_at
          ? po.acknowledged_at
            ? ack.copy
              ? null
              : 'acknowledged'
            : 'awaiting acknowledgment'
          : null,
        po.payment_pattern ? po.payment_pattern.replace(/_/g, ' ') : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : (item.vendor_name ?? null);

  const poLabel = po
    ? (po.po_number ?? po.vendor_po_number ?? po.sidemark ?? 'PO drafted')
    : null;

  if (!po && purchase) {
    return (
      <UnfoldCell head="Order" testId="line-po-cell">
        <CellValue>{purchase.payee_name}</CellValue>
        <PurchaseFact purchase={purchase} className="text-[11px] text-[var(--text-muted)]" />
      </UnfoldCell>
    );
  }

  // R28 — the PO reference is the `Open the order` control, so ⌘K's landing
  // has a control to put focus on. Reached at press time, not import time: a
  // static `../command-bar` import drags @patina/help-system's ESM into every
  // suite that renders the unfold (ffe-section.tsx's `openOrdersLedger`).
  const openTheOrder = () => {
    void import('../command-bar').then(({ openLedger }) =>
      openLedger('orders', { page: 'ledger', projectId, purchaseOrderId: po.id }),
    );
  };

  return (
    <UnfoldCell head="Order" testId="line-po-cell">
      {po && poLabel ? (
        <CellValue>
          <button
            type="button"
            data-po-control
            onClick={openTheOrder}
            aria-label={`${NAMED_ACTS.openOrder}, ${
              po.po_number || po.vendor_po_number ? `PO ${poLabel}` : poLabel
            }`}
            className="rounded-[2px] underline decoration-[var(--color-pearl)] underline-offset-2 hover:decoration-[var(--color-charcoal)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]"
          >
            {poLabel}
          </button>
        </CellValue>
      ) : (
        <CellValue>{poLabel ?? 'Not yet ordered'}</CellValue>
      )}
      {sub && <CellSub>{sub}</CellSub>}
      {ack.copy && (
        <p
          data-testid="po-ack-stamp"
          className={`text-[11px] ${
            ack.copy.differs
              ? 'font-medium text-[var(--color-terracotta-ink)]'
              : 'text-[var(--text-muted)]'
          }`}
        >
          {ack.copy.label}
        </p>
      )}
      {po?.ship_to && <CellSub>ship to {po.ship_to}</CellSub>}
      {reasons.length > 0 && (
        <ul
          data-testid="line-order-readiness"
          aria-label="Before this can be ordered"
          className="mt-1 text-[11px] text-[var(--text-muted)]"
        >
          {reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      )}
      {/* C-26: the PO's riders, estimate then actual. Patina carries a maker-lane PO's freight. */}
      {po && projectId && !po.is_patina_catalog && po.status !== 'cancelled' && (
        <PoRiders
          purchaseOrderId={po.id}
          projectId={projectId}
          vendor={{
            id: po.vendor_id ?? item.vendor_id,
            name: item.vendor_name ?? 'the vendor',
          }}
          disabled={!canChange}
          variant="cell"
          receiptAnchor={{ kind: 'line', anchorId: item.id }}
        />
      )}
      {po && projectId && canChange && po.status !== 'cancelled' && (
        <ChangeOrderAct
          item={item}
          po={po}
          projectId={projectId}
          auth={auth}
          vendorName={item.vendor_name ?? 'the maker'}
          poLabel={po.po_number ?? 'this order'}
          open={changeOpen}
          onOpenChange={setChangeOpen}
        />
      )}
      {/* C-27: each open difference answered here; an R8 refusal routes to
          the change order above. The reply draft is listed just below. */}
      {po && ack.state === 'discrepancy' && (
        <AckRecord
          purchaseOrderId={po.id}
          projectId={projectId}
          vendorPoNumber={po.vendor_po_number}
          confirmedEta={po.confirmed_eta}
          drafts={false}
          onStartChange={
            projectId && canChange && po.status !== 'cancelled'
              ? () => setChangeOpen(true)
              : undefined
          }
        />
      )}
      {/* C-28: the acknowledgment's letters, drafted and awaiting review. */}
      {po && projectId && (
        <PurchaseOrderDrafts projectId={projectId} purchaseOrderId={po.id} kinds={ORDER_DRAFT_KINDS} />
      )}
    </UnfoldCell>
  );
}
