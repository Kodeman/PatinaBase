'use client';

import { useEffect, useState } from 'react';
import { useRecordEtaChange } from '@/hooks/use-fulfillment-shipments';

// The ETA-slip affordance (R4.5, BOH-DECISIONS) — the only operator-facing
// caller of fulfillment_update_shipment_eta (00363). Without this dialog the
// RPC was API-only (I11): current_eta could never move in production, so the
// board's SlipFigure/formatSlip rendering (shipment-row.tsx) was dead weight
// — nothing but a fixture's GUC side door could ever produce a slipped ETA.
//
// A plain centered modal, matching UnmappedAssignPopover's idiom (S2,
// workbench/unmapped-assign-popover.tsx) — a small two-field form (date +
// required reason), not a full Sheet like SettleDialog. Reason is required
// both here and by the route — it's the only thing that makes eta_history
// worth reading later.

interface Props {
  shipmentId: string;
  /** Prefills the date field: the current ETA if one's already been
   *  recorded, else the PO's promised (committed) ship date. */
  currentEta: string | null;
  committedShip: string | null;
  open: boolean;
  onClose: () => void;
}

export function EtaChangeDialog({ shipmentId, currentEta, committedShip, open, onClose }: Props) {
  const [date, setDate] = useState('');
  const [reason, setReason] = useState('');
  const mutation = useRecordEtaChange(shipmentId);

  useEffect(() => {
    if (open) {
      setDate(currentEta ?? committedShip ?? '');
      setReason('');
    }
  }, [open, currentEta, committedShip]);

  if (!open) return null;

  const valid = date !== '' && reason.trim() !== '';

  const submit = () => {
    if (!valid) return;
    mutation.mutate(
      { currentEta: date, reason: reason.trim() },
      { onSuccess: onClose },
    );
  };

  return (
    <div
      data-testid="eta-change-dialog"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(44,41,38,0.28)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-sm border p-5"
        style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="text-[0.55rem] uppercase tracking-[0.13em] text-[var(--text-muted)]"
          style={{ fontFamily: 'var(--font-meta)' }}
        >
          Record ETA change
        </div>

        <label
          className="mt-4 block text-[0.6rem] uppercase tracking-[0.08em] text-[var(--text-muted)]"
          style={{ fontFamily: 'var(--font-meta)' }}
        >
          New ETA
        </label>
        <input
          data-testid="eta-change-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="mt-1 w-full rounded-sm border bg-transparent px-2 py-1.5 text-[0.8rem] tabular-nums"
          style={{ borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}
        />

        <label
          className="mt-3 block text-[0.6rem] uppercase tracking-[0.08em] text-[var(--text-muted)]"
          style={{ fontFamily: 'var(--font-meta)' }}
        >
          Reason · required
        </label>
        <input
          data-testid="eta-change-reason"
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="mt-1 w-full rounded-sm border bg-transparent px-2 py-1.5 text-[0.8rem]"
          style={{ borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}
          placeholder="e.g. carrier delay"
        />

        {mutation.isError && (
          <p data-testid="eta-change-error" className="mt-2 text-[0.62rem] text-[var(--color-error)]">
            {(mutation.error as Error).message}
          </p>
        )}

        <div className="mt-5 flex items-center justify-end gap-3">
          <button
            type="button"
            data-testid="eta-change-cancel"
            onClick={onClose}
            className="text-[0.72rem] text-[var(--text-muted)]"
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="eta-change-submit"
            disabled={!valid || mutation.isPending}
            onClick={submit}
            className="rounded-sm px-3 py-1.5 text-[0.72rem] font-medium disabled:opacity-40"
            style={{ backgroundColor: 'var(--color-clay)', color: 'var(--bg-surface)' }}
          >
            {mutation.isPending ? 'Recording…' : 'Record'}
          </button>
        </div>
      </div>
    </div>
  );
}
