import { fmtDay } from '@/lib/document/format';
import type { LineAuthorization } from '@/lib/document/authorization-derivation';
import { CellSub, CellValue, UnfoldCell } from './cell';
import { ChangeOrderAct } from './change-order';

type FFERow = any;

/**
 * C-14 cell 3 — the order: PO number, the send/ack lifecycle (R18), and the
 * ship-to. With no PO yet, it says what would make the line orderable (C-11a)
 * in place of Order. Logging the ack (C-10) is the line's lifted next act
 * whenever it applies, so it never renders here. A live PO carries the
 * tertiary "Change this order…" act (C-21).
 */
export function OrderCell({
  item,
  po,
  reasons,
  projectId,
  auth = { track: 'none' },
  canChange = false,
}: {
  item: FFERow;
  po: FFERow | null;
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
