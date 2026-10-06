import { fmtDay } from '@/lib/document/format';
import { CellSub, CellValue, UnfoldCell } from './cell';

type FFERow = any;

/**
 * C-14 cell 3 — the order: PO number, the send/ack lifecycle (R18), and the
 * ship-to. With no PO yet, it says what would make the line orderable (C-11a)
 * in place of Order. Logging the ack (C-10) is the line's lifted next act
 * whenever it applies, so it never renders here.
 */
export function OrderCell({
  item,
  po,
  reasons,
}: {
  item: FFERow;
  po: FFERow | null;
  /** C-11a readiness reasons to show — empty when Order is on offer. */
  reasons: readonly string[];
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

  return (
    <UnfoldCell head="Order" testId="line-po-cell">
      <CellValue>
        {po
          ? (po.po_number ?? po.vendor_po_number ?? po.sidemark ?? 'PO drafted')
          : 'Not yet ordered'}
      </CellValue>
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
    </UnfoldCell>
  );
}
