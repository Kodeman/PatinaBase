'use client';

import { useEffect, useState } from 'react';
import { useCreateVendor } from '@/hooks/use-fulfillment-vendors';

// The Vendor Directory's "Add vendor" affordance (I15, BOH-DECISIONS.md) —
// the only operator-facing caller of fulfillment_create_vendor (00371).
// Without this dialog public.vendors could only ever grow through a seed
// file or a raw SQL insert; Kody hit exactly that on prod's empty vendors
// table minutes into the first order walk.
//
// A plain centered modal matching EtaChangeDialog's idiom (shipments/eta-
// change-dialog.tsx) — a small form, not a full Sheet like SettleDialog.
// Only the vendor name is required; website and notes are optional protocol
// facts the operator can also fill in on the profile editor the caller
// routes to next (see FulfillmentVendorsPage's onCreated).

interface Props {
  open: boolean;
  onClose: () => void;
  /** Fires once the vendor row exists — the caller routes to its profile editor. */
  onCreated: (vendorId: string) => void;
}

export function AddVendorDialog({ open, onClose, onCreated }: Props) {
  const [name, setName] = useState('');
  const [website, setWebsite] = useState('');
  const [notes, setNotes] = useState('');
  const mutation = useCreateVendor();

  useEffect(() => {
    if (open) {
      setName('');
      setWebsite('');
      setNotes('');
      mutation.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const valid = name.trim() !== '';

  const submit = () => {
    if (!valid) return;
    mutation.mutate(
      { name: name.trim(), website: website.trim() || undefined, notes: notes.trim() || undefined },
      { onSuccess: (result) => onCreated(result.vendorId) },
    );
  };

  return (
    <div
      data-testid="add-vendor-dialog"
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
          Add vendor
        </div>

        <label
          className="mt-4 block text-[0.6rem] uppercase tracking-[0.08em] text-[var(--text-muted)]"
          style={{ fontFamily: 'var(--font-meta)' }}
        >
          Vendor name · required
        </label>
        <input
          data-testid="add-vendor-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full rounded-sm border bg-transparent px-2 py-1.5 text-[0.8rem]"
          style={{ borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}
          placeholder="e.g. Room & Board Trade"
          autoFocus
        />

        <label
          className="mt-3 block text-[0.6rem] uppercase tracking-[0.08em] text-[var(--text-muted)]"
          style={{ fontFamily: 'var(--font-meta)' }}
        >
          Website
        </label>
        <input
          data-testid="add-vendor-website"
          type="text"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          className="mt-1 w-full rounded-sm border bg-transparent px-2 py-1.5 text-[0.8rem]"
          style={{ borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}
          placeholder="https://"
        />

        <label
          className="mt-3 block text-[0.6rem] uppercase tracking-[0.08em] text-[var(--text-muted)]"
          style={{ fontFamily: 'var(--font-meta)' }}
        >
          Notes
        </label>
        <textarea
          data-testid="add-vendor-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded-sm border bg-transparent px-2 py-1.5 text-[0.8rem]"
          style={{ borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}
          placeholder="Trade terms, a contact, anything worth remembering before the protocol sheet is filled in."
        />

        {mutation.isError && (
          <p data-testid="add-vendor-error" className="mt-2 text-[0.62rem] text-[var(--color-error)]">
            {(mutation.error as Error).message}
          </p>
        )}

        <div className="mt-5 flex items-center justify-end gap-3">
          <button
            type="button"
            data-testid="add-vendor-cancel"
            onClick={onClose}
            className="text-[0.72rem] text-[var(--text-muted)]"
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="add-vendor-submit"
            disabled={!valid || mutation.isPending}
            onClick={submit}
            className="rounded-sm px-3 py-1.5 text-[0.72rem] font-medium disabled:opacity-40"
            style={{ backgroundColor: 'var(--color-clay)', color: 'var(--bg-surface)' }}
          >
            {mutation.isPending ? 'Adding…' : 'Add vendor'}
          </button>
        </div>
      </div>
    </div>
  );
}
