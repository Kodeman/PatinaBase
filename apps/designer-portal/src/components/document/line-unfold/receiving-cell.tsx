import { CellValue, UnfoldCell } from './cell';
import { ClaimClockLine } from './claim-clock';

type FFERow = any;

/** C-14 cell 6 — receiving: the receipt and inspection facts. */
export function ReceivingCell({
  item,
  stampKind,
  openClaims,
}: {
  item: FFERow;
  stampKind: string;
  openClaims: readonly { state: string }[];
}) {
  const value =
    stampKind === 'damaged'
      ? `Open claim${openClaims.length > 1 ? 's' : ''} · ${openClaims[0]?.state === 'vendor_notified' ? 'vendor notified' : 'drafted'}`
      : stampKind === 'received'
        ? `${item.received_quantity ?? 0} of ${item.quantity} inspected`
        : stampKind === 'delivered'
          ? 'Awaiting inspection'
          : '—';
  // C-20: the claim clock runs from delivery until the line is inspected good
  // or its claim reaches the vendor.
  const po = item.purchase_order;
  const clockRuns =
    !!po?.delivered_date &&
    (stampKind === 'delivered' ||
      (stampKind === 'damaged' && openClaims.some((c) => c.state === 'drafted')));
  return (
    <UnfoldCell head="Receiving" testId="line-receiving-cell">
      <CellValue>{value}</CellValue>
      {clockRuns && (
        <ClaimClockLine
          purchaseOrderId={po.id}
          vendorId={po.vendor_id ?? item.vendor_id}
          vendorName={item.vendor_name ?? 'The vendor'}
          className="mt-0.5 text-[11px]"
        />
      )}
    </UnfoldCell>
  );
}
