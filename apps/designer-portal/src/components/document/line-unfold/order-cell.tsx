import type { StudioPurchaseRow } from '@patina/supabase';
import { fmtDay } from '@/lib/document/format';
import { PurchaseFact } from '../purchases/purchase-fact';
import type { LineAuthorization } from '@/lib/document/authorization-derivation';
import { CellSub, CellValue, UnfoldCell } from './cell';
import { ChangeOrderAct } from './change-order';
import { PoRiders } from '@/components/portal/procurement/order-paper/riders';

type FFERow = any;

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
  const sub = po
    ? [
        po.sent_at ? `sent to vendor ${fmtDay(po.sent_at)}` : 'not yet sent',
        po.sent_at
          ? po.acknowledged_at
            ? 'acknowledged'
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

  return (
    <UnfoldCell head="Order" testId="line-po-cell">
      <CellValue>{poLabel ?? 'Not yet ordered'}</CellValue>
      {sub && <CellSub>{sub}</CellSub>}
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
        />
      )}
    </UnfoldCell>
  );
}
