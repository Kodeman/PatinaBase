'use client';

import { useFfeInvoiceCoverage, usePoReleasePreview, usePoReleaseState, useProcurementItems, type PurchaseOrder, type Database } from '@patina/supabase';
import { useProjectInstruments } from '@/hooks/use-commercial-documents';
import { useProjectPurchasingAgreement } from '@/hooks/use-project-purchasing-agreement';
import { buildInstrumentIndex } from '@/lib/document/authorization-derivation';
import { formatDollars } from './model';

export function SavedPurchaseOrderStandings({ po }: { po: PurchaseOrder & Partial<Pick<Database['public']['Tables']['purchase_orders']['Row'], 'released_total_cents'>> }) {
  const items = useProcurementItems({ purchaseOrderId: po.id });
  return <PurchaseOrderStandings
    projectId={po.project_id}
    vendorId={po.vendor_id}
    totalCents={po.total_cents}
    purchaseOrderId={po.id}
    releasedTotalCents={po.released_total_cents}
    itemIds={items.isError ? undefined : items.data?.filter((item) => item.purchase_order_id === po.id).map((item) => item.id)}
  />;
}

/** Readings only: none of these facts replaces the server's send/release gates. */
export function PurchaseOrderStandings({
  projectId, vendorId, totalCents, itemIds, purchaseOrderId, releasedTotalCents,
}: {
  projectId: string;
  vendorId: string;
  totalCents: number;
  itemIds: string[] | undefined;
  purchaseOrderId?: string | null;
  releasedTotalCents?: number | null;
}) {
  const agreement = useProjectPurchasingAgreement(projectId);
  const instruments = useProjectInstruments(projectId);
  const funds = useFfeInvoiceCoverage(projectId);
  const state = usePoReleaseState(purchaseOrderId);
  const preview = usePoReleasePreview(purchaseOrderId ? null : projectId, vendorId, totalCents);
  const release = purchaseOrderId ? state : preview;
  const index = buildInstrumentIndex(instruments.data);
  const authorized = itemIds?.filter((id) => index.get(id)?.track === 'authorized').length ?? 0;
  const paid = itemIds?.filter((id) => funds.data?.[id]?.coverage === 'paid').length ?? 0;
  const count = itemIds?.length ?? 0;
  const agreementFact = agreement.isError ? 'Could not check' : !agreement.data ? 'Checking…'
    : agreement.data.state === 'patina_signed' ? 'Signed in Patina'
      : agreement.data.state === 'external_recorded' ? 'Signed agreement recorded' : 'No signed agreement recorded';
  const authorizationFact = instruments.isError ? 'Could not check'
    : !itemIds || !instruments.data ? 'Checking…'
      : count === 0 ? 'No linked pieces' : `${authorized} of ${count} pieces authorized by the client`;
  const fundsFact = funds.isError ? 'Could not check'
    : !itemIds || !funds.data ? 'Checking…'
      : count === 0 ? 'No linked pieces' : `${paid} of ${count} pieces paid in full`;
  const releaseFact = release.isError ? 'Could not check'
    : !release.data ? 'Checking…'
      : [
          release.data.cleared ? 'Cleared for this paper' : 'Owner or admin release needed',
          releasedTotalCents != null ? `Released up to ${formatDollars(releasedTotalCents)}` : null,
          `this paper is ${formatDollars(totalCents)}`,
          `aggregate to this maker on this job ${formatDollars(release.data.group_total_cents)}`,
          release.data.threshold_cents != null ? `studio release line ${formatDollars(release.data.threshold_cents)}` : null,
        ].filter(Boolean).join('; ');

  return (
    <dl aria-label="Purchasing standings" className="space-y-1 doc-type-body text-[var(--color-charcoal)]">
      {[
        ['Agreement', agreementFact],
        ['Client authorization', authorizationFact],
        ['Funds received', fundsFact],
        ['Internal release', releaseFact],
      ].map(([label, fact]) => (
        <div key={label} className="flex flex-wrap gap-x-2">
          <dt className="font-medium">{label}</dt>
          <dd>{fact}</dd>
        </div>
      ))}
    </dl>
  );
}
