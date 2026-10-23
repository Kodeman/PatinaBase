'use client';

import { useState } from 'react';
import { DocumentAction } from '../document-action';
import { PurchaseRecordForm } from './purchase-record-form';
import { RecordPaymentForm } from '../line-unfold/record-payment';

export function PurchaseChoices({
  projectId, item, canPrepare, canRecord, purchaseOrderId, isPatinaCatalog, onPrepare,
}: {
  projectId: string;
  item: { id: string; name: string };
  canPrepare: boolean;
  canRecord: boolean;
  purchaseOrderId: string | null;
  isPatinaCatalog: boolean;
  onPrepare: () => void;
}) {
  const [recording, setRecording] = useState(false);
  const [paying, setPaying] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  return (
    <div className="mt-2 space-y-1" aria-label="Buying choices">
      <div>
        <DocumentAction actionKey="prepare-line-po" surfaceKey="project" regionKey="line-buying-choices" variant="secondary" disabled={!canPrepare} onClick={onPrepare}>
          Prepare a PO
        </DocumentAction>
        <p className="text-[11px] text-[var(--text-muted)]">Drafts a PO. Nothing is sent until you press Send.{purchaseOrderId ? ' This line already has a PO.' : ''}</p>
      </div>
      <div>
        <DocumentAction actionKey="record-existing-line-purchase" surfaceKey="project" regionKey="line-buying-choices" variant="secondary" disabled={!canRecord} onClick={() => setRecording((open) => !open)} aria-expanded={recording}>
          Record a purchase already made
        </DocumentAction>
        <p className="text-[11px] text-[var(--text-muted)]">Nothing will be sent or ordered.{purchaseOrderId ? ' This line is already on a PO.' : ''}</p>
      </div>
      <div>
        <DocumentAction actionKey="record-line-po-payment" surfaceKey="project" regionKey="line-buying-choices" variant="secondary" disabled={!purchaseOrderId || isPatinaCatalog} onClick={() => setPaying((open) => !open)} aria-expanded={paying}>
          Record a payment
        </DocumentAction>
        <p className="text-[11px] text-[var(--text-muted)]">Records money paid against an existing PO, not another purchase.{!purchaseOrderId ? ' A PO is needed first.' : isPatinaCatalog ? ' This order settles through Patina checkout.' : ' This records an additional payment; scheduled payments remain in Money out.'}</p>
      </div>
      {paying && purchaseOrderId && !isPatinaCatalog && <RecordPaymentForm purchaseOrderId={purchaseOrderId} projectId={projectId} remainderCents={0} receiptAnchor={{ kind: 'line', anchorId: item.id }} onDone={() => setPaying(false)} />}
      {recording && <PurchaseRecordForm projectId={projectId} initialLine={item} onDone={(message) => { setRecording(false); setResult(message); }} />}
      {result && <p role="status" className="text-[11px] text-[var(--text-muted)]">{result}</p>}
    </div>
  );
}
