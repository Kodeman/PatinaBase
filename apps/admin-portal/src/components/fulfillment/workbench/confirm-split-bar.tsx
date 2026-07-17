'use client';

import type { FulfillmentWorkbenchLine } from '@patina/fulfillment';

// The confirm bar (S2, spec §5.2). Confirm is DISABLED with a visible reason
// until every line is mapped (R1.7 — "2 lines unmapped"); the server RAISES the
// same block, so this is a pre-emptive UX guard over an authoritative check.
// Post-confirm it flips to a settled state naming the POs that were minted.

interface ConfirmSplitBarProps {
  lines: FulfillmentWorkbenchLine[];
  confirmed: boolean;
  poCount: number;
  pending: boolean;
  error?: string | null;
  onConfirm: () => void;
}

export function ConfirmSplitBar({
  lines,
  confirmed,
  poCount,
  pending,
  error,
  onConfirm,
}: ConfirmSplitBarProps) {
  const active = lines.filter((l) => l.lineState !== 'cancelled');
  const unmapped = active.filter((l) => l.mappingState === 'unmapped').length;
  const vendorCount = new Set(
    active.filter((l) => l.vendorId).map((l) => l.vendorId),
  ).size;

  if (confirmed) {
    return (
      <div
        data-testid="wb-confirm-bar"
        data-confirmed="true"
        className="mt-5 flex items-center justify-between border-t pt-4"
        style={{ borderColor: 'var(--border-default)' }}
      >
        <span className="text-[0.72rem] text-[var(--text-muted)]">
          Split confirmed — {poCount} vendor PO{poCount === 1 ? '' : 's'} drafted.
        </span>
        <span
          className="text-[0.6rem] uppercase tracking-[0.12em]"
          style={{ fontFamily: 'var(--font-meta)', color: 'var(--color-sage)' }}
        >
          Ready to transmit
        </span>
      </div>
    );
  }

  const blocked = unmapped > 0;
  const reason = blocked
    ? `${unmapped} line${unmapped === 1 ? '' : 's'} unmapped`
    : `${vendorCount} vendor PO${vendorCount === 1 ? '' : 's'} ready`;

  return (
    <div
      data-testid="wb-confirm-bar"
      data-confirmed="false"
      data-blocked={blocked}
      className="mt-5 flex items-center justify-between border-t pt-4"
      style={{ borderColor: 'var(--border-default)' }}
    >
      <span
        data-testid="wb-confirm-reason"
        className="text-[0.72rem]"
        style={{ color: blocked ? 'var(--color-terracotta)' : 'var(--text-muted)' }}
      >
        {error ?? reason}
      </span>
      <button
        type="button"
        data-testid="wb-confirm-button"
        disabled={blocked || pending}
        onClick={onConfirm}
        className="rounded-sm px-4 py-2 text-[0.75rem] font-medium disabled:opacity-40"
        style={{ backgroundColor: 'var(--color-clay)', color: 'var(--bg-surface)' }}
      >
        {pending ? 'Confirming…' : 'Confirm split'}
      </button>
    </div>
  );
}
