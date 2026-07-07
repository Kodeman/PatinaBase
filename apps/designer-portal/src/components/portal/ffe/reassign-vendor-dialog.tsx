'use client';

/**
 * Reassign Vendor confirm dialog (Schedule & Boards Wave 0B — replaces the
 * FF&E bulk bar's Coming-soon stub, B-07).
 *
 * Selected items split into two ledgers before anything is written:
 *   · reassignable — no purchase_order_id; these move to the picked vendor.
 *   · skipped      — already linked to a PO. An ordered line's vendor is a
 *                    procurement fact (cancel/re-issue the PO to change it),
 *                    so those are listed by name with their PO number and
 *                    excluded from the write. The hook re-enforces the same
 *                    guard server-side (.is('purchase_order_id', null)).
 *
 * Vendor picker is a filterable single-select list over the designer's vendor
 * directory (the page already loads it via useVendors for the Order
 * Assistant) — there is no shared vendor-select component to reuse; the
 * Order Assistant receives its vendor pre-resolved. Shell follows the
 * QuoteRequestModal / product-picker-modal overlay idiom.
 */

import { useEffect, useMemo, useState } from 'react';
import { Button, Input, IconButton } from '@/components/ui/controls';

export interface ReassignVendorOption {
  id: string;
  name: string;
}

export interface ReassignVendorItem {
  id: string;
  name: string;
  vendor_name?: string | null;
  purchase_order_id?: string | null;
  purchase_order?: { po_number?: string | null } | null;
}

/** PO-linked lines are skipped — split before the mutation ever sees them. */
export function splitReassignable<T extends { purchase_order_id?: string | null }>(
  items: T[],
): { reassignable: T[]; skipped: T[] } {
  const reassignable: T[] = [];
  const skipped: T[] = [];
  for (const item of items) {
    if (item.purchase_order_id) skipped.push(item);
    else reassignable.push(item);
  }
  return { reassignable, skipped };
}

export interface ReassignVendorDialogProps {
  open: boolean;
  onClose: () => void;
  /** The bulk-selected FF&E items (unfiltered — the dialog does the split). */
  items: ReassignVendorItem[];
  /** The designer's vendor directory. */
  vendors: ReassignVendorOption[];
  pending: boolean;
  onConfirm: (vendor: ReassignVendorOption, reassignableIds: string[]) => void;
}

export function ReassignVendorDialog({
  open,
  onClose,
  items,
  vendors,
  pending,
  onConfirm,
}: ReassignVendorDialogProps) {
  const [query, setQuery] = useState('');
  const [vendorId, setVendorId] = useState<string | null>(null);

  // Fresh picker per open — a reopened dialog must not carry the last
  // confirm's search text or vendor choice into a new selection.
  useEffect(() => {
    if (open) {
      setQuery('');
      setVendorId(null);
    }
  }, [open]);

  const { reassignable, skipped } = useMemo(() => splitReassignable(items), [items]);

  const filteredVendors = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...vendors].sort((a, b) => a.name.localeCompare(b.name));
    if (!q) return sorted;
    return sorted.filter((v) => v.name.toLowerCase().includes(q));
  }, [vendors, query]);

  const chosen = vendors.find((v) => v.id === vendorId) ?? null;
  const canConfirm = !!chosen && reassignable.length > 0 && !pending;

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Reassign vendor"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-8"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[480px] rounded-md border bg-[var(--bg-surface)] p-6 shadow-xl"
        style={{ borderColor: 'var(--border-default)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-baseline justify-between">
          <h3 className="type-section-head" style={{ fontSize: '1.2rem' }}>
            Reassign vendor
          </h3>
          <IconButton label="Close" onClick={onClose}>
            ×
          </IconButton>
        </div>
        <p className="mb-4 text-[0.78rem] text-[var(--text-muted)]">
          {reassignable.length} of {items.length} selected item
          {items.length === 1 ? '' : 's'} can move to a new vendor.
        </p>

        {skipped.length > 0 && (
          <div
            className="mb-4 rounded-[3px] border px-3 py-2"
            style={{ borderColor: 'var(--border-default)' }}
          >
            <p className="mb-1 font-mono text-[0.62rem] uppercase tracking-[0.05em] text-[var(--text-muted)]">
              Skipped — already on a purchase order
            </p>
            <ul className="space-y-0.5">
              {skipped.map((item) => (
                <li
                  key={item.id}
                  className="flex items-baseline justify-between gap-3 text-[0.75rem] text-[var(--text-primary)]"
                >
                  <span className="truncate">{item.name}</span>
                  <span className="shrink-0 font-mono text-[0.62rem] text-[var(--text-muted)]">
                    {item.purchase_order?.po_number ?? 'ordered'}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-1.5 text-[0.68rem] leading-snug text-[var(--text-muted)]">
              An ordered line&apos;s vendor changes through its purchase order,
              not a bulk edit.
            </p>
          </div>
        )}

        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search vendors…"
          aria-label="Search vendors"
          className="mb-2"
        />
        <div
          role="radiogroup"
          aria-label="Vendor"
          className="mb-4 max-h-[240px] overflow-y-auto rounded-[3px] border"
          style={{ borderColor: 'var(--border-default)' }}
        >
          {filteredVendors.length === 0 ? (
            <p className="px-3 py-4 text-center text-[0.75rem] text-[var(--text-muted)]">
              No vendors match.
            </p>
          ) : (
            filteredVendors.map((v) => (
              <button
                key={v.id}
                type="button"
                role="radio"
                aria-checked={v.id === vendorId}
                onClick={() => setVendorId(v.id)}
                className={`block w-full px-3 py-2 text-left text-[0.8rem] transition-colors ${
                  v.id === vendorId
                    ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]'
                    : 'text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
                }`}
              >
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className={`inline-block h-1.5 w-1.5 rounded-full ${
                      v.id === vendorId
                        ? 'bg-[var(--color-clay,#C4A57B)]'
                        : 'bg-transparent'
                    }`}
                  />
                  {v.name}
                </span>
              </button>
            ))
          )}
        </div>

        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={!canConfirm}
            loading={pending}
            onClick={() => {
              if (!chosen) return;
              onConfirm(
                chosen,
                reassignable.map((item) => item.id),
              );
            }}
          >
            {chosen
              ? `Reassign ${reassignable.length} to ${chosen.name}`
              : `Reassign ${reassignable.length} item${reassignable.length === 1 ? '' : 's'}`}
          </Button>
        </div>
      </div>
    </div>
  );
}
