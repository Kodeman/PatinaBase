import { useFeatureFlag } from '@/hooks/use-feature-flag';
import { CellValue, UnfoldCell } from './cell';
import { ClaimClockLine } from './claim-clock';
import { PurchaseOrderDrafts } from '../buying/draft-review';

type FFERow = any;

const RECEIVING_DRAFT_KINDS = ['vendor_claim_notice'] as const;

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
  // US-19 FR3 F3-20 / 515-6 (`one-voice`) — what is left to inspect, or what
  // was inspected once that is the fact; never `N of M`.
  const oneVoice = useFeatureFlag('one-voice').value === true;
  const inspected = item.received_quantity ?? 0;
  const toInspect = Math.max((item.quantity ?? 0) - inspected, 0);
  const value =
    stampKind === 'damaged'
      ? `Open claim${openClaims.length > 1 ? 's' : ''} · ${openClaims[0]?.state === 'vendor_notified' ? 'vendor notified' : 'drafted'}`
      : stampKind === 'received'
        ? !oneVoice
          ? `${item.received_quantity ?? 0} of ${item.quantity} inspected`
          : toInspect > 0
            ? `${toInspect} to inspect`
            : `${inspected} inspected`
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
      {/* C-28: the claim notice an exception drafted, awaiting review. */}
      {po?.id && item.project_id && (
        <PurchaseOrderDrafts
          projectId={item.project_id}
          purchaseOrderId={po.id}
          kinds={RECEIVING_DRAFT_KINDS}
        />
      )}
    </UnfoldCell>
  );
}
