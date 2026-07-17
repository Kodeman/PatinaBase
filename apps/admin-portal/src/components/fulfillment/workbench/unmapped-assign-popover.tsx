'use client';

import { useEffect, useState } from 'react';
import type { FulfillmentVendorOption, FulfillmentWorkbenchLine } from '@patina/fulfillment';

// Assign / reassign a line's vendor + cost (S2, spec §5.2 / R1.7). The only way
// to clear an Unmapped line (unblocking confirm) — vendor sourced from
// vendor_profiles, cost entered in dollars. Also opens from a drag onto the
// "new PO" target, or onto a vendor with a still-unmapped line (which needs a
// cost the drag can't supply). A plain centered modal — dnd-kit owns pointer
// events on the surface behind it, so an anchored popover risks activation
// races; a modal is the robust choice.

interface Props {
  open: boolean;
  line: FulfillmentWorkbenchLine | null;
  vendors: FulfillmentVendorOption[];
  /** Prefill the vendor (e.g. dropped onto vendor B's card). */
  defaultVendorId?: string | null;
  onClose: () => void;
  onSubmit: (payload: { vendorId: string; unitCostCents: number }) => void;
}

export function UnmappedAssignPopover({
  open,
  line,
  vendors,
  defaultVendorId,
  onClose,
  onSubmit,
}: Props) {
  const [vendorId, setVendorId] = useState('');
  const [costDollars, setCostDollars] = useState('');

  useEffect(() => {
    if (open && line) {
      setVendorId(defaultVendorId ?? line.vendorId ?? '');
      setCostDollars(
        line.unitCostCents != null ? (line.unitCostCents / 100).toFixed(2) : '',
      );
    }
  }, [open, line, defaultVendorId]);

  if (!open || !line) return null;

  const cost = Number(costDollars);
  const valid = vendorId !== '' && Number.isFinite(cost) && cost >= 0 && costDollars !== '';

  return (
    <div
      data-testid="wb-assign-popover"
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
          {line.mappingState === 'unmapped' ? 'Assign vendor' : 'Reassign vendor'}
        </div>
        <div
          className="mt-1 text-[1rem]"
          style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}
        >
          {line.circledIndex} {line.itemName}
        </div>
        <div className="mt-1 text-[0.66rem] text-[var(--text-muted)]">
          Client charged {(line.unitPriceCents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
        </div>

        <label className="mt-4 block text-[0.6rem] uppercase tracking-[0.08em] text-[var(--text-muted)]" style={{ fontFamily: 'var(--font-meta)' }}>
          Vendor
        </label>
        <select
          data-testid="wb-assign-vendor"
          value={vendorId}
          onChange={(e) => setVendorId(e.target.value)}
          className="mt-1 w-full rounded-sm border bg-transparent px-2 py-1.5 text-[0.8rem]"
          style={{ borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}
        >
          <option value="">Select a vendor…</option>
          {vendors.map((v) => (
            <option key={v.vendorId} value={v.vendorId}>
              {v.vendorName} · {v.transmissionType}
            </option>
          ))}
        </select>

        <label className="mt-3 block text-[0.6rem] uppercase tracking-[0.08em] text-[var(--text-muted)]" style={{ fontFamily: 'var(--font-meta)' }}>
          Unit cost (trade), USD
        </label>
        <input
          data-testid="wb-assign-cost"
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          value={costDollars}
          onChange={(e) => setCostDollars(e.target.value)}
          className="mt-1 w-full rounded-sm border bg-transparent px-2 py-1.5 text-[0.8rem] tabular-nums"
          style={{ borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}
          placeholder="0.00"
        />

        <div className="mt-5 flex items-center justify-end gap-3">
          <button
            type="button"
            data-testid="wb-assign-cancel"
            onClick={onClose}
            className="text-[0.72rem] text-[var(--text-muted)]"
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="wb-assign-submit"
            disabled={!valid}
            onClick={() => onSubmit({ vendorId, unitCostCents: Math.round(cost * 100) })}
            className="rounded-sm px-3 py-1.5 text-[0.72rem] font-medium disabled:opacity-40"
            style={{ backgroundColor: 'var(--color-clay)', color: 'var(--bg-surface)' }}
          >
            Assign
          </button>
        </div>
      </div>
    </div>
  );
}
