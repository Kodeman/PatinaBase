'use client';

import { useMemo, useState } from 'react';
import { ArrowUpDown, Filter } from 'lucide-react';
import { usePurchaseOrders, type PurchaseOrder } from '@patina/supabase';
import { LoadingStrata } from '@/components/portal/loading-strata';
import { SearchInput } from '@/components/portal/search-input';
import {
  VendorSectionCard,
  type VendorGroup,
} from '@/components/portal/procurement/vendor-section-card';

// ─── Grouping helper ─────────────────────────────────────────────────────────

/**
 * Collapses a flat list of purchase orders into one VendorGroup per vendor.
 * - `totalCents` sums all `po.total_cents` for the vendor across projects.
 * - `hasDuePayment` is `true` if ANY PO has at least one `po_payment` row in
 *   the `due` state. Used to drive the warning-amber border and dot.
 * - Sort order: vendors with `hasDuePayment` come first; tiebreak alphabetical.
 *
 * Matches dossier §C.4 contract.
 */
function groupByVendor(orders: PurchaseOrder[]): VendorGroup[] {
  const map = new Map<string, VendorGroup>();

  for (const po of orders) {
    const key = po.vendor_id;
    let group = map.get(key);
    if (!group) {
      group = {
        vendorId: po.vendor_id,
        vendorName: po.vendor?.name ?? 'Unknown vendor',
        defaultPaymentTerms: po.vendor?.default_payment_terms ?? null,
        orders: [],
        totalCents: 0,
        itemCount: 0,
        projectIds: new Set<string>(),
        hasDuePayment: false,
      };
      map.set(key, group);
    }
    group.orders.push(po);
    group.totalCents += po.total_cents;
    group.itemCount += 1;
    group.projectIds.add(po.project_id);
    if ((po.payments ?? []).some((p) => p.state === 'due')) {
      group.hasDuePayment = true;
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    if (a.hasDuePayment !== b.hasDuePayment) return a.hasDuePayment ? -1 : 1;
    return a.vendorName.localeCompare(b.vendorName);
  });
}

// ─── Stub filter / sort row (no logic in Sprint 1) ───────────────────────────

// TODO(sprint-2): wire faceted filter (vendor terms, has-due-payment, project)
//                  and sort (Due first / Total / Vendor A→Z) onto these buttons.
function FilterStubRow() {
  const buttonClass =
    'inline-flex items-center gap-1.5 rounded-[3px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-1.5 font-mono text-[0.62rem] uppercase tracking-[0.06em] text-[var(--text-muted)] opacity-60';
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" disabled className={buttonClass}>
        <Filter className="h-3 w-3" />
        Filter
      </button>
      <button type="button" disabled className={buttonClass}>
        <ArrowUpDown className="h-3 w-3" />
        Sort
      </button>
    </div>
  );
}

// ─── Page content ────────────────────────────────────────────────────────────

function ByVendorContent() {
  const [search, setSearch] = useState('');
  const { data: orders, isLoading, isError, error } = usePurchaseOrders();

  const allOrders = useMemo<PurchaseOrder[]>(
    () => (orders ?? []) as PurchaseOrder[],
    [orders],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allOrders;
    return allOrders.filter((po) => {
      const hay = [
        po.vendor?.name ?? '',
        po.project?.name ?? '',
        po.vendor_po_number ?? '',
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [allOrders, search]);

  const groups = useMemo(() => groupByVendor(filtered), [filtered]);

  // ─── Loading state ───────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="pt-8">
        <LoadingStrata />
      </div>
    );
  }

  // ─── Error state ─────────────────────────────────────────────────────────
  if (isError) {
    return (
      <div className="pt-8">
        <div
          className="rounded-lg border px-6 py-12 text-center"
          style={{
            borderColor: 'var(--color-terracotta)',
            background: 'rgba(212, 160, 144, 0.08)',
          }}
        >
          <p className="text-sm font-medium text-[var(--text-primary)]">
            Could not load purchase orders
          </p>
          <p className="mt-1 text-[0.8rem] text-[var(--text-muted)]">
            {(error as Error)?.message ?? 'Try refreshing the page.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-8">
      {/* Header band */}
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="type-section-head">By Vendor</h1>
          <p className="mt-1 text-[0.8rem] text-[var(--text-muted)]">
            Purchase orders grouped by vendor across all your projects.
          </p>
        </div>
        <span className="type-meta-small text-[var(--text-muted)]">
          {allOrders.length} order{allOrders.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Filter / sort row */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search vendor, project, or PO number…"
        />
        <FilterStubRow />
      </div>

      {/* Empty state */}
      {groups.length === 0 && (
        <div className="rounded-lg border border-[var(--border-default)] px-6 py-12 text-center">
          <p className="text-sm font-medium text-[var(--text-primary)]">
            {allOrders.length === 0
              ? 'No purchase orders yet'
              : 'No matches for that search'}
          </p>
          <p className="mt-1 text-[0.8rem] text-[var(--text-muted)]">
            {allOrders.length === 0
              ? 'Create a purchase order from the FF&E board to see it here.'
              : 'Try a different vendor, project, or PO number.'}
          </p>
          {/* TODO(help-system): wire CMS empty-state when surface keys are assigned */}
        </div>
      )}

      {/* Vendor cards */}
      {groups.length > 0 && (
        <div className="flex flex-col gap-4">
          {groups.map((group) => (
            <VendorSectionCard key={group.vendorId} group={group} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function ProcurementByVendorPage() {
  return <ByVendorContent />;
}
