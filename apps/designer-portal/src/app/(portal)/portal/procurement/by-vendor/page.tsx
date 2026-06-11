'use client';

import { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowUpDown, X } from 'lucide-react';
import {
  usePurchaseOrders,
  useProcurementItems,
  useVendors,
  useIsStudioOwner,
  type ProcurementItemRow,
  type PurchaseOrder,
} from '@patina/supabase';
import { LoadingStrata } from '@/components/portal/loading-strata';
import { SearchInput } from '@/components/portal/search-input';
import { Button, FilterPill } from '@/components/ui/controls';
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

// ─── Orderable items (W3-T3a) ────────────────────────────────────────────────

/**
 * The `select('*')` in useProcurementItems carries the 00185 trade price and
 * the decision-block link even though the canonical ProcurementItemRow
 * interface hasn't been widened yet — extend locally for type-safe access.
 */
type OrderableItem = ProcurementItemRow & {
  trade_price_cents?: number | null;
  blocked_by_decision_id?: string | null;
};

/**
 * An item is orderable when it's approved and not yet linked to a PO. Items
 * held by a pending blocks_procurement decision are excluded up front
 * (mirrors the FF&E board's pre-queue filter) so the Order Assistant never
 * opens on a batch it would refuse.
 */
function isOrderable(it: OrderableItem): boolean {
  if (it.status !== 'approved' || it.purchase_order_id) return false;
  if (it.blocked && it.blocked_by_decision_id) return false;
  return !!it.vendor_id;
}

/** One Order Assistant session — one (vendor, project) pair → one PO. */
interface PendingOrder {
  vendor: OrderAssistantVendor;
  project: OrderAssistantProject;
  ffeItems: OrderAssistantFFEItem[];
}

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

// ─── Sort row ────────────────────────────────────────────────────────────────
// NOTE: faceted filtering (vendor terms, has-due-payment) is still a Sprint-2
// follow-up; sort is wired here. The free-text search above already filters
// the list, and W1-T6 added a ?projectId= server-side filter (dismissible pill).

type VendorSortKey = 'due' | 'total' | 'vendor';

function SortRow({
  value,
  onChange,
}: {
  value: VendorSortKey;
  onChange: (v: VendorSortKey) => void;
}) {
  return (
    <label className="inline-flex items-center gap-1.5 rounded-[3px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-1.5 font-mono text-[0.62rem] uppercase tracking-[0.06em] text-[var(--text-muted)]">
      <ArrowUpDown className="h-3 w-3" />
      Sort
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as VendorSortKey)}
        className="bg-transparent font-mono text-[0.62rem] uppercase tracking-[0.06em] text-[var(--text-default)] focus:outline-none"
      >
        <option value="due">Due first</option>
        <option value="total">Total (high→low)</option>
        <option value="vendor">Vendor A→Z</option>
      </select>
    </label>
  );
}

// ─── Page content ────────────────────────────────────────────────────────────

function ByVendorContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // W1-T6 — ?projectId= deep link (e.g. from the project-detail Procurement
  // tile). Passed server-side into usePurchaseOrders; the query key embeds the
  // filters object so the filtered view is its own cache entry.
  const projectId = searchParams.get('projectId');

  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<VendorSortKey>('due');
  // NOTE(W1.5.5): the Order-via-Patina dialog state was removed. In v1 the
  // Catalog dialog had no ffeItems to display (the source feed lands later),
  // so the dialog only ever rendered "Order 0 items totalling $0" with a
  // disabled Confirm button. The gold CTA on the vendor card now renders as
  // disabled with an explanatory tooltip instead — see `vendor-section-card`.
  //
  // Order Assistant queue (W3-T3a). "Order all" feeds REAL approved-unordered
  // project_ffe_items into the assistant — the Wave 1.4 synthetic draft-PO
  // rows (which created 0-total, item-less POs) are retired. One PO covers
  // one project, so a vendor whose orderable items span projects enqueues one
  // PendingOrder per (vendor, project) and the assistant walks the queue —
  // same mechanism as the FF&E board's bulk "Generate POs".
  const [orderQueue, setOrderQueue] = useState<PendingOrder[]>([]);
  const activeOrder = orderQueue[0] ?? null;

  // Bookkeeper Export modal (Wave 3.2). The CTA is gated by studio-owner role
  // per PRD §11 + W3.1 dossier §4 — hidden, not disabled, for non-owners. The
  // role hook backs onto useUserRoles() so it never makes an extra network call.
  const [qboExportOpen, setQboExportOpen] = useState(false);
  const { isStudioOwner, isLoading: studioOwnerLoading } = useIsStudioOwner();

  const { data: orders, isLoading, isError, error } = usePurchaseOrders(
    projectId ? { projectId } : undefined,
  );

  // W3-T3a — real orderable items for the "Order all" CTA. One cross-project
  // query (server-filtered by the ?projectId= deep link when present),
  // grouped client-side per vendor. Shares the ['procurement-items'] cache
  // namespace with By Status, and invalidateFfeCaches sweeps it after PO
  // creation so counts stay truthful.
  const { data: procurementItems } = useProcurementItems(
    projectId ? { projectId } : undefined,
  );

  // Vendor directory — enriches the assistant's vendor context (payment
  // terms, trade portal URL/email) beyond the slim join usePurchaseOrders
  // carries. Mirrors the FF&E board's vendorById map.
  const { data: vendorsResult } = useVendors();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vendorById = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map = new Map<string, any>();
    // useVendors() returns { data, pagination }, not a bare array.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const v of ((vendorsResult as any)?.data ?? []) as any[]) map.set(v.id, v);
    return map;
  }, [vendorsResult]);

  const orderableByVendor = useMemo(() => {
    const map = new Map<string, OrderableItem[]>();
    for (const it of (procurementItems ?? []) as OrderableItem[]) {
      if (!isOrderable(it)) continue;
      const arr = map.get(it.vendor_id as string) ?? [];
      arr.push(it);
      map.set(it.vendor_id as string, arr);
    }
    return map;
  }, [procurementItems]);

  const allOrders = useMemo<PurchaseOrder[]>(
    () => (orders ?? []) as PurchaseOrder[],
    [orders],
  );

  // Project name for the filter pill — derived from the loaded POs' joined
  // project data (all rows share the project when the server filter is on).
  // Falls back to a generic label when the filtered result is empty so the
  // pill can still be dismissed.
  const projectName = useMemo(() => {
    if (!projectId) return null;
    for (const po of allOrders) {
      if (po.project?.name) return po.project.name;
    }
    return null;
  }, [projectId, allOrders]);

  const clearProjectFilter = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('projectId');
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

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

  const groups = useMemo(() => {
    const g = groupByVendor(filtered);
    if (sortKey === 'total') {
      return [...g].sort((a, b) => b.totalCents - a.totalCents);
    }
    if (sortKey === 'vendor') {
      return [...g].sort((a, b) => a.vendorName.localeCompare(b.vendorName));
    }
    // 'due' — keep groupByVendor's default (due-payment vendors first, then A→Z)
    return g;
  }, [filtered, sortKey]);

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
            <Button variant="secondary" size="sm" onClick={() => setQboExportOpen(true)}>
              Export to QBO ↓
            </Button>
          )}
          <span className="type-meta-small text-[var(--text-muted)]">
            {allOrders.length} order{allOrders.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Filter / sort row */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search vendor, project, or PO number…"
          />
          {projectId && (
            <FilterPill
              active
              onClick={clearProjectFilter}
              aria-label={
                projectName
                  ? `Remove project filter: ${projectName}`
                  : 'Remove project filter'
              }
            >
              {projectName ? `Project: ${projectName}` : 'Project filter'}
              <X className="h-3 w-3" aria-hidden />
            </FilterPill>
          )}
        </div>
        <SortRow value={sortKey} onChange={setSortKey} />
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
              ? "Select approved items on a project's FF&E board and choose Create PO."
              : 'Try a different vendor, project, or PO number.'}
          </p>
          {allOrders.length === 0 && (
            <Link
              href={
                projectId
                  ? `/portal/projects/${projectId}/ffe?focus=approved`
                  : '/portal/projects'
              }
              className="type-meta-small mt-3 inline-block text-[var(--accent-primary)] no-underline"
              style={{ letterSpacing: '0.04em' }}
            >
              {projectId ? <>Open the FF&amp;E board &rarr;</> : <>Browse projects &rarr;</>}
            </Link>
          )}
          {/* TODO(help-system): wire CMS empty-state when surface keys are assigned */}
        </div>
      )}

      {/* Vendor cards */}
      {groups.length > 0 && (
        <div className="flex flex-col gap-4">
          {groups.map((group) => {
            // ── "Order all N" wiring (W3-T3a) ─────────────────────────────
            // Real approved-unordered project_ffe_items for this vendor
            // (already filtered by ?projectId= server-side when present).
            // Non-Catalog vendors only; Catalog vendors keep the disabled
            // gold CTA until the OrderViaPatina ready-items feed lands.
            const orderable = orderableByVendor.get(group.vendorId) ?? [];
            const showOrderAll = !group.isPatinaCatalog;

            const handleOrderAll = () => {
              if (orderable.length === 0) return;
              const rec = vendorById.get(group.vendorId);
              const vendor: OrderAssistantVendor = {
                id: group.vendorId,
                name: group.vendorName,
                default_payment_terms:
                  ((rec?.default_payment_terms ??
                    group.defaultPaymentTerms) as PaymentPattern | null) ?? null,
                trade_portal_url: rec?.trade_portal_url ?? undefined,
                trade_account_email: rec?.trade_account_email ?? undefined,
                is_patina_catalog: rec?.is_patina_catalog ?? group.isPatinaCatalog,
              };
              // One PO covers one project — group per project and enqueue one
              // assistant session per (vendor, project) pair.
              const byProject = new Map<string, OrderableItem[]>();
              for (const it of orderable) {
                const arr = byProject.get(it.project_id) ?? [];
                arr.push(it);
                byProject.set(it.project_id, arr);
              }
              const sessions: PendingOrder[] = Array.from(byProject.entries()).map(
                ([pid, list]) => ({
                  vendor,
                  project: { id: pid, name: list[0].project?.name ?? 'Project' },
                  ffeItems: list.map((it) => ({
                    id: it.id,
                    name: it.name,
                    room: it.room?.name,
                    line_total_cents: it.line_total_cents ?? 0,
                    // Dual pricing (00185/00186): the assistant totals
                    // COALESCE(trade, unit) × qty — the vendor TRADE total
                    // the create_purchase_order RPC computes server-side.
                    quantity: it.quantity ?? 1,
                    unit_price_cents: it.unit_price_cents ?? null,
                    trade_price_cents: it.trade_price_cents ?? null,
                    blocked: it.blocked,
                    blocked_by_decision_id: it.blocked_by_decision_id ?? null,
                    blocked_reason: it.blocked_reason,
                  })),
                }),
              );
              setOrderQueue(sessions);
            };

            return (
              <VendorSectionCard
                key={group.vendorId}
                group={group}
                onOrderAllClick={
                  showOrderAll && orderable.length > 0 ? handleOrderAll : undefined
                }
                orderAllLabel={
                  showOrderAll
                    ? orderable.length > 0
                      ? `Order all ${orderable.length}`
                      : 'Order all'
                    : undefined
                }
                orderAllDisabledReason={
                  showOrderAll && orderable.length === 0
                    ? 'No approved, unordered items for this vendor.'
                    : undefined
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

      {/* Order Assistant — one (vendor, project) session at a time; closing
          advances the queue (same mechanism as the FF&E board). */}
      {activeOrder && (
        <OrderAssistant
          open={!!activeOrder}
          onOpenChange={(open) => {
            if (!open) setOrderQueue((q) => q.slice(1));
          }}
          vendor={activeOrder.vendor}
          project={activeOrder.project}
          ffeItems={activeOrder.ffeItems}
          scopeDisclaimer={
            orderQueue.length > 1
              ? `${orderQueue.length} project orders queued for ${activeOrder.vendor.name} — you'll confirm each in turn.`
              : undefined
          }
        />
      )}

      {/* Bookkeeper Export modal — mount unconditionally so the open/close
          transition is preserved. The trigger button is studio-owner gated. */}
      <QboExportModal open={qboExportOpen} onOpenChange={setQboExportOpen} />
    </div>
  );
}

export default function ProcurementByVendorPage() {
  // useSearchParams requires a Suspense boundary in Next 15 (same pattern as
  // the By Status page).
  return (
    <Suspense fallback={<div className="pt-8"><LoadingStrata /></div>}>
      <ByVendorContent />
    </Suspense>
  );
}
