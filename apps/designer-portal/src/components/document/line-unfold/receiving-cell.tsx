import { CellValue, UnfoldCell } from './cell';

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
  return (
    <UnfoldCell head="Receiving" testId="line-receiving-cell">
      <CellValue>{value}</CellValue>
    </UnfoldCell>
  );
}
