'use client';

import { useMemo, useState } from 'react';
import { ArrowUpDown, Filter } from 'lucide-react';
import { usePurchaseOrders, type PurchaseOrder } from '@patina/supabase';
import { LoadingStrata } from '@/components/portal/loading-strata';
import { SearchInput } from '@/components/portal/search-input';
import { useIsStudioOwner } from '@/hooks/use-is-studio-owner';
import { QboExportModal } from '@/components/portal/procurement/qbo-export-modal';
import {
  VendorSectionCard,
  type VendorGroup,
} from '@/components/portal/procurement/vendor-section-card';
// NOTE(W1.5.5): `OrderViaPatina` is intentionally NOT imported here.
// In v1 the Catalog ordering flow has no source of "ready items" yet, so
// opening the dialog produced dead UI ("Order 0 items totalling $0" with a
// disabled Confirm button). We now render the gold CTA on the vendor card as
// disabled with a tooltip — see `vendor-section-card.tsx`. The component file
// stays on disk for the follow-up wave that introduces the ready-items feed.
import {
  OrderAssistant,
  type OrderAssistantFFEItem,
  type OrderAssistantProject,
  type OrderAssistantVendor,
} from '@/components/portal/procurement/order-assistant';
import type { PaymentPattern } from '@patina/supabase';

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
        // Derived from the joined vendors.is_patina_catalog column (post-00149).
        // When true, the card renders the gold "Order via Patina" CTA (PRD §5)
        // in place of the standard neutral "View orders" button.
        isPatinaCatalog: po.vendor?.is_patina_catalog ?? false,
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
  // NOTE(W1.5.5): the Order-via-Patina dialog state was removed. In v1 the
  // Catalog dialog had no ffeItems to display (the source feed lands later),
  // so the dialog only ever rendered "Order 0 items totalling $0" with a
  // disabled Confirm button. The gold CTA on the vendor card now renders as
  // disabled with an explanatory tooltip instead — see `vendor-section-card`.
  // State for the Order Assistant side panel (Wave 1.4). Opens scoped to a
  // single vendor + project pair; the synthetic ffeItems list mirrors the
  // vendor's draft POs against that project. See `openOrderAssistantFor`.
  const [orderAssistant, setOrderAssistant] = useState<{
    vendor: OrderAssistantVendor;
    project: OrderAssistantProject;
    ffeItems: OrderAssistantFFEItem[];
    scopeDisclaimer?: string;
  } | null>(null);

  // Bookkeeper Export modal (Wave 3.2). The CTA is gated by studio-owner role
  // per PRD §11 + W3.1 dossier §4 — hidden, not disabled, for non-owners. The
  // role hook backs onto useUserRoles() so it never makes an extra network call.
  const [qboExportOpen, setQboExportOpen] = useState(false);
  const { isStudioOwner, isLoading: studioOwnerLoading } = useIsStudioOwner();

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
        <div className="flex items-baseline gap-4">
          {/*
            Export to QBO CTA — studio-owner only per PRD §11 + W3.1 dossier §4.
            Hidden, not disabled, for regular designers (no permissions matrix
            should be visible — "Studio owner only. No bookkeeper login.").
            v1 placement: By Vendor header. Promoting this to the procurement
            zone subnav is a follow-up once SubNav supports button-type actions
            (the current ZONE_ACTIONS contract is link-only).
          */}
          {!studioOwnerLoading && isStudioOwner && (
            <button
              type="button"
              onClick={() => setQboExportOpen(true)}
              className="rounded-[3px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-1.5 font-mono text-[0.62rem] uppercase tracking-[0.06em] text-[var(--text-primary)] transition-colors hover:border-[var(--accent-primary)] hover:text-[var(--accent-primary)]"
            >
              Export to QBO ↓
            </button>
          )}
          <span className="type-meta-small text-[var(--text-muted)]">
            {allOrders.length} order{allOrders.length !== 1 ? 's' : ''}
          </span>
        </div>
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
          {groups.map((group) => {
            // ── "Order all N" wiring (Wave 1.4) ──────────────────────────
            // A draft PO is one whose vendor confirmation + payment pattern
            // hasn't been logged yet. Each draft PO header is one "item" in
            // the assistant's UI list. Non-Catalog vendors only; Catalog
            // vendors use the OrderViaPatina dialog instead.
            const draftOrders = group.orders.filter((po) => po.status === 'draft');
            const draftCount = draftOrders.length;
            // Pick a single project to scope the assistant against — the
            // first project the draft POs target. If draft POs span multiple
            // projects we surface a disclaimer (one PO covers one project per
            // the data model, so a "true" multi-project flow needs separate
            // panel sessions).
            const draftProjectIds = new Set(
              draftOrders.map((po) => po.project_id),
            );
            const firstDraft = draftOrders[0];
            const canOrderAll =
              !group.isPatinaCatalog && draftCount > 0 && !!firstDraft?.project;

            const handleOrderAll = () => {
              if (!firstDraft?.project) return;
              const scopedDrafts = draftOrders.filter(
                (po) => po.project_id === firstDraft.project_id,
              );
              // ffeItems are display-only here: each draft PO becomes one
              // row in the assistant's "Copy item details" list. The `id`
              // field is the draft PO's id, surfaced so the row has a stable
              // React key — it is NOT used as a `project_ffe_items.id`
              // because the assistant calls `useCreatePurchaseOrder` which
              // creates a NEW PO header. The proper FFE→PO linking flow
              // requires a `project_ffe_items` source (the per-project FF&E
              // board), which lives outside the cross-project By Vendor
              // view's data shape. Submit therefore passes an empty
              // `ffeItemIds: []` (handled inside OrderAssistant).
              const ffeItems: OrderAssistantFFEItem[] = scopedDrafts.map(
                (po) => ({
                  id: po.id,
                  name: po.vendor_po_number
                    ? `${group.vendorName} · ${po.vendor_po_number}`
                    : `${group.vendorName} order`,
                  room: po.project?.name,
                  line_total_cents: po.total_cents,
                }),
              );
              const disclaimer =
                draftProjectIds.size > 1
                  ? `Showing ${scopedDrafts.length} of ${draftCount} items for ${firstDraft.project!.name}; remaining items will need separate orders.`
                  : undefined;
              setOrderAssistant({
                vendor: {
                  id: group.vendorId,
                  name: group.vendorName,
                  default_payment_terms:
                    (group.defaultPaymentTerms as PaymentPattern | null) ?? null,
                  // PRD §6 surfaces the trade portal URL + account email here.
                  // The current `vendors` query projection in
                  // `usePurchaseOrders` only joins id/name/default_payment_terms,
                  // so the panel renders the "No trade portal on file" fallback
                  // until the join is widened. Out of lane for W1.4.
                  trade_portal_url: undefined,
                  trade_account_email: undefined,
                },
                project: {
                  id: firstDraft.project!.id,
                  name: firstDraft.project!.name,
                },
                ffeItems,
                scopeDisclaimer: disclaimer,
              });
            };

            return (
              <VendorSectionCard
                key={group.vendorId}
                group={group}
                onOrderAllClick={canOrderAll ? handleOrderAll : undefined}
                orderAllLabel={
                  canOrderAll ? `Order all ${draftCount}` : undefined
                }
                // W1.5.5: `onOrderViaPatina` is intentionally not passed.
                // For Catalog vendors the gold CTA renders as disabled with
                // a tooltip ("Catalog ordering ships in a follow-up — see
                // workspace for status."). The wiring will be reinstated
                // once a ready-items feed exists to populate the dialog.
              />
            );
          })}
        </div>
      )}

      {orderAssistant && (
        <OrderAssistant
          open={!!orderAssistant}
          onOpenChange={(open) => {
            if (!open) setOrderAssistant(null);
          }}
          vendor={orderAssistant.vendor}
          project={orderAssistant.project}
          ffeItems={orderAssistant.ffeItems}
          scopeDisclaimer={orderAssistant.scopeDisclaimer}
        />
      )}

      {/* Bookkeeper Export modal — mount unconditionally so the open/close
          transition is preserved. The trigger button is studio-owner gated. */}
      <QboExportModal open={qboExportOpen} onOpenChange={setQboExportOpen} />
    </div>
  );
}

export default function ProcurementByVendorPage() {
  return <ByVendorContent />;
}
