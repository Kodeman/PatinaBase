import { useMemo } from 'react';
import {
  useFfeInvoiceCoverage,
  useFfeInvoiceStageCoverage,
  useProjectInvoices,
  type FfeItemCoverage,
} from '@patina/supabase';
import { fmtDay } from '@/lib/document/format';
import {
  clientStageFact,
  lineBillingByItem,
  type ComposerStageSlot,
  type FactInvoice,
} from '@/lib/document/invoice-composer';
import { CellSub, UnfoldCell } from './cell';
import { PoMoneyOut, type MoneyOutPayment } from './record-payment';

export type { MoneyOutPayment } from './record-payment';

/**
 * Fronting (D2 §M5.7): whether the client has paid for this line yet, read
 * from `get_ffe_invoice_coverage`. A fact beside the money out, never a block
 * (R9). No entry in a loaded map means the line is not visible to the caller,
 * so it says nothing rather than guess.
 */
export function frontingFact(coverage: FfeItemCoverage | undefined): string | null {
  if (!coverage) return null;
  if (coverage.coverage === 'paid') return 'Client has paid for this line';
  if (coverage.coverage === 'uninvoiced') return 'Client not yet invoiced for this line';
  if (coverage.invoiceStatus === 'draft') return 'Client invoice still in draft';
  if (coverage.invoiceStatus === 'partially_paid') return 'Client has paid part of this line';
  return 'Client deposit not yet received';
}

/**
 * C-14 cell 5 — money out (C-11, D1-11): the PO's payment schedule with each
 * row's state, the payments recorded against it, and the record / void acts.
 * A Patina-catalog order settles through checkout and reads its rows without
 * amounts or acts (V1). With no PO, nothing is owed yet.
 */
export function MoneyOutCell({
  po,
  projectId,
  itemId,
}: {
  po: {
    id: string;
    is_patina_catalog?: boolean | null;
    payments?: readonly MoneyOutPayment[] | null;
  } | null;
  projectId: string;
  itemId: string;
}) {
  return (
    <UnfoldCell head="Money out" testId="line-money-out-cell">
      {!po ? (
        <CellSub>Nothing owed until it is ordered</CellSub>
      ) : (
        <>
          <PoMoneyOut
            purchaseOrderId={po.id}
            projectId={projectId}
            isPatinaCatalog={Boolean(po.is_patina_catalog)}
            fallback={po.payments}
            receiptAnchor={{ kind: 'line', anchorId: itemId }}
          />
          <FrontingFact projectId={projectId} itemId={itemId} />
        </>
      )}
    </UnfoldCell>
  );
}

/**
 * The quiet client-billing fact. A line billed as a deposit then a balance
 * (C-31) reads its stages with dates — "Client deposit billed 3 October · paid
 * 6 October · balance unbilled"; otherwise the 00187 fronting fact.
 */
function FrontingFact({ projectId, itemId }: { projectId: string; itemId: string }) {
  const { data: coverage } = useFfeInvoiceCoverage(projectId);
  const { data: stageRows } = useFfeInvoiceStageCoverage(projectId);
  const { data: invoices } = useProjectInvoices(projectId);
  const staged = useMemo(() => {
    const billing = lineBillingByItem(stageRows as ComposerStageSlot[] | undefined).get(itemId);
    const byId = new Map(
      ((invoices ?? []) as unknown as FactInvoice[]).map((inv) => [inv.id, inv] as const),
    );
    return clientStageFact(billing, byId, fmtDay);
  }, [stageRows, invoices, itemId]);
  const fact = staged ?? frontingFact(coverage?.[itemId]);
  if (!fact) return null;
  return (
    <p data-testid="money-out-fronting" className="mt-1 text-[11px] text-[var(--text-muted)]">
      {fact}
    </p>
  );
}
