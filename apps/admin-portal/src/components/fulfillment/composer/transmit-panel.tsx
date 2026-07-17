'use client';

import { useState } from 'react';
import type { FulfillmentComposerDTO } from '@patina/fulfillment';
import { fulfillmentService } from '@/services/fulfillment';
import { useSendPo, useMarkTransmitted } from '@/hooks/use-fulfillment-composer';

// The transmit panel (S3, spec §5.3). Branches on the vendor's transmission_type
// (R1.6): email sends via the fn; portal/csv are operator-driven checklists that
// capture the vendor's reference and mark_transmitted. A PO without a logged
// send has no SLA clock — so every path logs po.transmitted by construction.

const labelCls = 'block text-[0.6rem] uppercase tracking-[0.08em] text-[var(--text-muted)]';
const fieldCls = 'mt-1 w-full rounded-sm border bg-transparent px-2 py-1.5 text-[0.8rem]';
const fieldStyle = { borderColor: 'var(--border-default)', color: 'var(--text-primary)' } as const;
const clayBtn = 'rounded-sm px-3 py-1.5 text-[0.72rem] font-medium disabled:opacity-40';
const clayStyle = { backgroundColor: 'var(--color-clay)', color: 'var(--bg-surface)' } as const;

export function TransmitPanel({ dto }: { dto: FulfillmentComposerDTO }) {
  const { po, vendorProfile } = dto;
  const type = vendorProfile.transmissionType ?? 'email';

  return (
    <section data-testid="transmit-panel" data-transmission-type={type}>
      <div
        className="mb-2 text-[0.55rem] uppercase tracking-[0.13em] text-[var(--text-muted)]"
        style={{ fontFamily: 'var(--font-meta)' }}
      >
        Transmit · {type}
      </div>
      {type === 'email' && <EmailTransmit poId={po.id} recipient={vendorProfile.poEmail} />}
      {type === 'portal' && <PortalTransmit poId={po.id} portalUrl={vendorProfile.portalUrl} />}
      {type === 'csv' && <CsvTransmit poId={po.id} />}
    </section>
  );
}

function EmailTransmit({ poId, recipient }: { poId: string; recipient: string | null }) {
  const send = useSendPo(poId);
  return (
    <div className="flex flex-col gap-3">
      <div className="text-[0.75rem] text-[var(--text-muted)]">
        Emails the PO to{' '}
        <span className="font-mono text-[var(--text-primary)]">{recipient ?? 'the vendor'}</span> from{' '}
        <span className="font-mono">orders@patina.cloud</span>, PDF attached.
      </div>
      {send.isError && (
        <div data-testid="transmit-error" className="text-[0.72rem] text-[var(--color-error)]">
          {(send.error as Error).message}
        </div>
      )}
      <div className="flex justify-end">
        <button
          type="button"
          data-testid="transmit-email-send"
          disabled={send.isPending || send.isSuccess}
          onClick={() => send.mutate()}
          className={clayBtn}
          style={clayStyle}
        >
          {send.isSuccess ? 'Sent' : send.isPending ? 'Sending…' : 'Send via email'}
        </button>
      </div>
    </div>
  );
}

function PortalTransmit({ poId, portalUrl }: { poId: string; portalUrl: string | null }) {
  const [reference, setReference] = useState('');
  const mark = useMarkTransmitted(poId);
  return (
    <div className="flex flex-col gap-3">
      <ol className="list-decimal pl-4 text-[0.75rem] text-[var(--text-muted)]">
        <li>
          {portalUrl ? (
            <a
              data-testid="transmit-portal-open"
              href={portalUrl}
              target="_blank"
              rel="noreferrer"
              className="font-medium"
              style={{ color: 'var(--color-clay)' }}
            >
              Open the dealer portal ↗
            </a>
          ) : (
            'Open the dealer portal (no URL on file)'
          )}
          {' '}and enter the PO.
        </li>
        <li>Capture the portal confirmation number below.</li>
      </ol>
      <div>
        <label className={labelCls} style={{ fontFamily: 'var(--font-meta)' }}>
          Portal confirmation reference
        </label>
        <input
          data-testid="transmit-portal-ref"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="e.g. RB-PORTAL-88213"
          className={fieldCls}
          style={fieldStyle}
        />
      </div>
      {mark.isError && (
        <div data-testid="transmit-error" className="text-[0.72rem] text-[var(--color-error)]">
          {(mark.error as Error).message}
        </div>
      )}
      <div className="flex justify-end">
        <button
          type="button"
          data-testid="transmit-portal-mark"
          disabled={!reference.trim() || mark.isPending || mark.isSuccess}
          onClick={() => mark.mutate({ method: 'portal', reference: reference.trim() })}
          className={clayBtn}
          style={clayStyle}
        >
          {mark.isSuccess ? 'Logged' : mark.isPending ? 'Logging…' : 'Mark transmitted'}
        </button>
      </div>
    </div>
  );
}

function CsvTransmit({ poId }: { poId: string }) {
  const [reference, setReference] = useState('');
  const mark = useMarkTransmitted(poId);
  return (
    <div className="flex flex-col gap-3">
      <ol className="list-decimal pl-4 text-[0.75rem] text-[var(--text-muted)]">
        <li>
          <a
            data-testid="transmit-csv-download"
            href={fulfillmentService.csvUrl(poId)}
            className="font-medium"
            style={{ color: 'var(--color-clay)' }}
          >
            Download the CSV to spec ↓
          </a>{' '}
          and send it to the vendor.
        </li>
        <li>Record the batch / file reference below.</li>
      </ol>
      <div>
        <label className={labelCls} style={{ fontFamily: 'var(--font-meta)' }}>
          CSV batch reference
        </label>
        <input
          data-testid="transmit-csv-ref"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="e.g. batch-2026-07-17.csv"
          className={fieldCls}
          style={fieldStyle}
        />
      </div>
      {mark.isError && (
        <div data-testid="transmit-error" className="text-[0.72rem] text-[var(--color-error)]">
          {(mark.error as Error).message}
        </div>
      )}
      <div className="flex justify-end">
        <button
          type="button"
          data-testid="transmit-csv-mark"
          disabled={!reference.trim() || mark.isPending || mark.isSuccess}
          onClick={() => mark.mutate({ method: 'csv', reference: reference.trim() })}
          className={clayBtn}
          style={clayStyle}
        >
          {mark.isSuccess ? 'Logged' : mark.isPending ? 'Logging…' : 'Mark transmitted'}
        </button>
      </div>
    </div>
  );
}
