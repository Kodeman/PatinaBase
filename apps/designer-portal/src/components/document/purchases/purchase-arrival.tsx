'use client';

import { useRef, useState } from 'react';
import { useReceivingInspections, type StudioPurchaseRow } from '@patina/supabase';
import { LogInspectionDrawer } from '@/components/portal/procurement/log-inspection-drawer';
import { DocumentAction, DocumentActionGroup } from '../document-action';
import { InstallAct } from '../line-unfold/install-act';

export function PurchaseArrival({ item, purchase, projectId, projectName, canEdit }: {
  item: { id: string; name: string; quantity: number; received_quantity?: number | null; unit?: string | null; status: string };
  purchase: StudioPurchaseRow;
  projectId: string;
  projectName: string;
  canEdit: boolean;
}) {
  const [arranging, setArranging] = useState(false);
  const [method, setMethod] = useState<'picked_up' | 'delivered'>('picked_up');
  const opener = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [inspectionId, setInspectionId] = useState<string>();
  const { data: receipts, isLoading, error } = useReceivingInspections({ studioPurchaseId: purchase.id });
  const pending = receipts?.find((receipt) => receipt.outcome === null);
  const received = item.received_quantity ?? 0;
  const complete = received >= item.quantity;
  const checked = complete && !!receipts?.length && receipts.every((receipt) => receipt.outcome === 'clean');
  return (
    <div data-testid="line-next-act" className="mb-3 space-y-1">
      <p className="text-[11px] text-[var(--text-muted)]">Bought from {purchase.payee_name}. No acknowledgment or production step is needed.</p>
      {isLoading ? <p role="status">Loading arrival records…</p> : error ? <p role="alert">Arrival records could not be loaded. Try again before recording another arrival.</p> : (
        <>
          {pending && (
            <>
              <p role="status" className="text-[11px] text-[var(--text-muted)]">Arrived · inspection pending.</p>
              {canEdit && <DocumentAction actionKey="complete-purchase-inspection" surfaceKey="project" regionKey="purchase-arrival" variant="primary" onClick={(event) => { opener.current = event.currentTarget; setInspectionId(pending?.id); setOpen(true); }}>Complete inspection</DocumentAction>}
            </>
          )}
          {complete && !pending && !checked && <p role="status" className="text-[11px] text-[var(--text-muted)]">Arrival recorded. Review its condition in receiving before installation.</p>}
          {canEdit && !complete && !pending && (
            <>
              <DocumentAction actionKey="arrange-purchase-arrival" surfaceKey="project" regionKey="purchase-arrival" variant="primary" onClick={() => setArranging((value) => !value)} aria-expanded={arranging}>
                Arrange pickup or delivery
              </DocumentAction>
              {arranging && (
                <div className="space-y-1">
                  <p className="text-[11px] text-[var(--text-muted)]">Arrange with {purchase.payee_name} outside Patina. Record arrival only once the goods are physically received.</p>
                  <fieldset>
                    <legend className="text-[11px] text-[var(--text-muted)]">How did it arrive?</legend>
                    <label className="mr-4 inline-flex min-h-11 items-center gap-2 text-[13px]"><input type="radio" name={`arrival-${purchase.id}`} checked={method === 'picked_up'} onChange={() => setMethod('picked_up')} />Picked up</label>
                    <label className="inline-flex min-h-11 items-center gap-2 text-[13px]"><input type="radio" name={`arrival-${purchase.id}`} checked={method === 'delivered'} onChange={() => setMethod('delivered')} />Delivered</label>
                  </fieldset>
                  <DocumentActionGroup surfaceKey="project" regionKey="purchase-arrival">
                    <DocumentAction actionKey="record-purchase-arrival" variant="secondary" onClick={(event) => { opener.current = event.currentTarget; setInspectionId(undefined); setOpen(true); }}>Record arrival</DocumentAction>
                  </DocumentActionGroup>
                </div>
              )}
            </>
          )}
          {canEdit && checked && item.status === 'delivered' && <InstallAct itemId={item.id} projectId={projectId} lifted />}
        </>
      )}
      <LogInspectionDrawer returnFocusTo={opener.current} open={open} onOpenChange={setOpen} purchaseOrderId={null} studioPurchaseId={purchase.id} arrivalMethod={method} inspectionId={inspectionId} subjectStale={open && inspectionId !== pending?.id}
        receiptItems={[{ ffeItemId: item.id, name: item.name, quantity: item.quantity, receivedQuantity: received, received_quantity: received, unit: item.unit, project_id: projectId }]}
        projectId={projectId} projectName={projectName} poLabel={purchase.description ?? item.name} vendorName={purchase.payee_name} />
    </div>
  );
}
