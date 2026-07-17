'use client';

import { useState } from 'react';
import { useAckPo } from '@/hooks/use-fulfillment-composer';

// Ack capture (S3, spec §5.3): method, vendor reference, committed ship date.
// The committed ship date re-dates the client ETA and drafts the client note
// (both handled server-side by /pos/[poId]/ack). Shown once a PO is transmitted.

const METHODS = ['phone', 'email', 'portal', 'other'] as const;

const labelCls =
  'block text-[0.6rem] uppercase tracking-[0.08em] text-[var(--text-muted)]';
const fieldCls =
  'mt-1 w-full rounded-sm border bg-transparent px-2 py-1.5 text-[0.8rem]';
const fieldStyle = { borderColor: 'var(--border-default)', color: 'var(--text-primary)' } as const;

export function AckCaptureForm({ poId }: { poId: string }) {
  const [method, setMethod] = useState<string>('email');
  const [ackRef, setAckRef] = useState('');
  const [committedShip, setCommittedShip] = useState('');
  const ack = useAckPo(poId);

  const valid = /^\d{4}-\d{2}-\d{2}$/.test(committedShip);

  return (
    <section data-testid="ack-capture-form">
      <div
        className="mb-2 text-[0.55rem] uppercase tracking-[0.13em] text-[var(--text-muted)]"
        style={{ fontFamily: 'var(--font-meta)' }}
      >
        Record acknowledgment
      </div>

      {ack.isSuccess ? (
        <div data-testid="ack-success" className="text-[0.75rem] text-[var(--color-sage, var(--color-success))]">
          Ack recorded — client ETA re-dated to {ack.data?.committedShip}, draft note ready (send with N).
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div>
            <label className={labelCls} style={{ fontFamily: 'var(--font-meta)' }}>
              Method
            </label>
            <select
              data-testid="ack-method"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className={fieldCls}
              style={fieldStyle}
            >
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelCls} style={{ fontFamily: 'var(--font-meta)' }}>
              Vendor reference
            </label>
            <input
              data-testid="ack-ref"
              value={ackRef}
              onChange={(e) => setAckRef(e.target.value)}
              placeholder="e.g. DW-2214"
              className={fieldCls}
              style={fieldStyle}
            />
          </div>

          <div>
            <label className={labelCls} style={{ fontFamily: 'var(--font-meta)' }}>
              Committed ship date
            </label>
            <input
              data-testid="ack-committed-ship"
              type="date"
              value={committedShip}
              onChange={(e) => setCommittedShip(e.target.value)}
              className={`${fieldCls} tabular-nums`}
              style={fieldStyle}
            />
          </div>

          {ack.isError && (
            <div data-testid="ack-error" className="text-[0.72rem] text-[var(--color-error)]">
              {(ack.error as Error).message}
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="button"
              data-testid="ack-submit"
              disabled={!valid || ack.isPending}
              onClick={() =>
                ack.mutate({
                  committedShip,
                  ackMethod: method,
                  ackRef: ackRef.trim() || undefined,
                })
              }
              className="rounded-sm px-3 py-1.5 text-[0.72rem] font-medium disabled:opacity-40"
              style={{ backgroundColor: 'var(--color-clay)', color: 'var(--bg-surface)' }}
            >
              {ack.isPending ? 'Recording…' : 'Record ack'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
