'use client';

import { use, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useProjectFFEItems, useProjectRooms } from '@/hooks/use-projects';
import { useProject } from '@/hooks/use-projects';
import { useUpdateFFEItemStatus, useVendors, type PaymentPattern } from '@patina/supabase';
import { Breadcrumb } from '@/components/portal/breadcrumb';
import { LoadingStrata } from '@/components/portal/loading-strata';
import { useHydrated } from '@/hooks/use-hydrated';
import { SearchInput } from '@/components/portal/search-input';
import { useToast } from '@/components/portal/toast-provider';
import { queryKeys } from '@/lib/react-query';
import {
  OrderAssistant,
  type OrderAssistantFFEItem,
  type OrderAssistantProject,
  type OrderAssistantVendor,
} from '@/components/portal/procurement/order-assistant';
import {
  FacetedFilterPopover,
  type Facet,
  type FacetSelections,
} from '@/components/portal/faceted-filter-popover';
import {
  BlockedItemsRollup,
  distinctBlockingDecisionIds,
  getBlockedItems,
} from '@/components/portal/procurement/blocked-by-decision-notice';
import { BulkActionBar, BulkActionButton } from '@/components/portal/bulk-action-bar';
// F1.7 — FF&E migrated to ambient + reactive help-system layers per spec §12.4.
// FF&E itself is Patina vocabulary (Furniture, Fixtures & Equipment), and each
// procurement stage is a Patina-defined step. The page-level intro frames the
// Kanban; per-stage StrataInfoIcons let designers learn what each status
// signals. Item-drawer fields use FieldLabel for the procurement concepts
// (PO Number, Line Total, ETA, Blocked Reason).
import {
  EmptyState,
  SectionIntro,
  StrataInfoIcon,
  SurfaceKeys,
  useHelpContent,
} from '@patina/help-system';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyItem = any;

// One vendor's worth of FF&E to push through the Order Assistant. Selecting
// items across multiple vendors enqueues one PendingOrder per vendor and the
// assistant walks them one at a time.
interface PendingOrder {
  vendor: OrderAssistantVendor;
  project: OrderAssistantProject;
  ffeItems: OrderAssistantFFEItem[];
}

// FF&E procurement stages — each is a Patina-defined step in the lifecycle.
// `surfaceKey` is the StrataInfoIcon target for the column header, so authors
// can explain what each stage means without cluttering the column UI.
const STAGES = [
  { key: 'specified',  label: 'Specified',   color: 'var(--text-muted)',                       surfaceKey: SurfaceKeys.DesignerPortal.Ffe.Stage.Specified },
  { key: 'quoted',     label: 'Quoted',      color: 'var(--color-dusty-blue, #8B9CAD)',        surfaceKey: SurfaceKeys.DesignerPortal.Ffe.Stage.Quoted },
  { key: 'approved',   label: 'Approved',    color: 'var(--color-clay, #C4A57B)',              surfaceKey: SurfaceKeys.DesignerPortal.Ffe.Stage.Approved },
  { key: 'ordered',    label: 'Ordered',     color: 'var(--color-dusty-blue, #8B9CAD)',        surfaceKey: SurfaceKeys.DesignerPortal.Ffe.Stage.Ordered },
  { key: 'production', label: 'Production',  color: 'var(--color-golden-hour, #E8C547)',       surfaceKey: SurfaceKeys.DesignerPortal.Ffe.Stage.Production },
  { key: 'shipped',    label: 'Shipped',     color: 'var(--color-golden-hour, #E8C547)',       surfaceKey: SurfaceKeys.DesignerPortal.Ffe.Stage.Shipped },
  { key: 'delivered',  label: 'Delivered',   color: 'var(--color-sage, #A8B5A0)',              surfaceKey: SurfaceKeys.DesignerPortal.Ffe.Stage.Delivered },
  { key: 'installed',  label: 'Installed',   color: 'var(--color-sage, #A8B5A0)',              surfaceKey: SurfaceKeys.DesignerPortal.Ffe.Stage.Installed },
];

// CMS-probe-then-fallback wrapper for the page-level zero-state when a
// project has no FF&E items at all. Mirrors the F1.6 Clients empty-state
// pattern so first-time designers see helpful copy instead of a blank board.
function FfeBoardEmpty({ isFiltered }: { isFiltered: boolean }) {
  const surfaceKey = isFiltered
    ? SurfaceKeys.DesignerPortal.Ffe.Empty.NoFilterResults
    : SurfaceKeys.DesignerPortal.Ffe.Empty.NoItems;
  const { data, isLoading } = useHelpContent(surfaceKey, 'emptyState');

  if (isLoading) return null;

  if (data) {
    return <EmptyState surfaceKey={surfaceKey} />;
  }

  return (
    <div className="py-12 text-center type-body italic text-[var(--text-muted)]">
      {isFiltered
        ? 'No items match these filters. Adjust the search or clear filters.'
        : 'No FF&E items yet — items appear here once specifications are added to project rooms.'}
    </div>
  );
}

function formatDollars(cents: number): string {
  return `$${((cents || 0) / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function formatDate(d?: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function FFEPipelinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const drawerItemId = searchParams.get('item');
  const hydrated = useHydrated();

  const { data: project } = useProject(projectId);
  const { data: rawItems } = useProjectFFEItems(projectId);
  const { data: rawRooms } = useProjectRooms(projectId);
  const { data: vendors } = useVendors();
  const updateStatus = useUpdateFFEItemStatus();

  const items = useMemo(() => (Array.isArray(rawItems) ? rawItems : []) as AnyItem[], [rawItems]);
  const rooms = useMemo(() => (Array.isArray(rawRooms) ? rawRooms : []) as AnyItem[], [rawRooms]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vendorList = (Array.isArray(vendors) ? vendors : []) as any[];

  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<FacetSelections>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Deep-link from the project-detail Procurement tile: ?focus=approved lands
  // the designer here with all approved items pre-selected, one click from
  // "Generate POs". Runs once after items first load.
  const focus = searchParams.get('focus');
  const focusApplied = useRef(false);
  useEffect(() => {
    if (focus === 'approved' && !focusApplied.current && items.length > 0) {
      focusApplied.current = true;
      setSelected(new Set(items.filter((it) => it.status === 'approved').map((it) => it.id)));
    }
  }, [focus, items]);

  const facets = useMemo<Facet[]>(() => {
    const itemTypes = new Set<string>();
    const itemVendors = new Map<string, string>();
    for (const it of items) {
      if (it.item_type) itemTypes.add(it.item_type);
      if (it.vendor_name) itemVendors.set(it.vendor_id || it.vendor_name, it.vendor_name);
    }
    return [
      {
        key: 'room',
        label: 'Room',
        options: rooms.map((r) => ({ value: r.id, label: r.name })),
      },
      {
        key: 'vendor',
        label: 'Vendor',
        options: Array.from(itemVendors.entries()).map(([value, label]) => ({ value, label })),
      },
      {
        key: 'type',
        label: 'Type',
        options: Array.from(itemTypes).map((t) => ({
          value: t,
          label: t === 'fixed' ? 'Fixed' : t === 'allowance' ? 'Allowance' : 'TBD',
        })),
      },
    ];
  }, [items, rooms]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      if (q) {
        const hay = [it.name, it.vendor_name, it.po_number].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      const roomSel = filters.room ?? [];
      if (roomSel.length > 0 && !roomSel.includes(it.project_room_id)) return false;
      const vendorSel = filters.vendor ?? [];
      if (vendorSel.length > 0 && !vendorSel.includes(it.vendor_id || it.vendor_name)) return false;
      const typeSel = filters.type ?? [];
      if (typeSel.length > 0 && !typeSel.includes(it.item_type)) return false;
      return true;
    });
  }, [items, search, filters]);

  const grouped = useMemo(() => {
    const map: Record<string, AnyItem[]> = {};
    for (const stage of STAGES) map[stage.key] = [];
    for (const it of filtered) {
      const key = it.status || 'specified';
      if (!map[key]) map[key] = [];
      map[key].push(it);
    }
    return map;
  }, [filtered]);

  // Decision-Framework blocked-items rollup (PT-D-2-T3-2). Counts items held
  // by a pending blocks_procurement decision across the whole project. When a
  // single decision is responsible we deep-link straight to it; otherwise the
  // rollup links to the decisions list.
  const blockedRollup = useMemo(() => {
    const blocked = getBlockedItems(items);
    const decisionIds = distinctBlockingDecisionIds(blocked);
    return {
      count: blocked.length,
      decisionId: decisionIds.length === 1 ? decisionIds[0] : undefined,
    };
  }, [items]);

  const drawerItem = drawerItemId ? items.find((it) => it.id === drawerItemId) : null;

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const bulkAdvance = async (toStatus: string) => {
    const ids = Array.from(selected);
    await Promise.all(
      ids.map((itemId) => updateStatus.mutateAsync({ itemId, projectId, status: toStatus }))
    );
    setSelected(new Set());
  };

  // ── Purchasing (P1.1) ──────────────────────────────────────────────────
  // Reuse the existing OrderAssistant (built for the By Vendor view) to turn
  // selected FF&E items into purchase orders. Items are grouped by vendor —
  // one PO per vendor — and the assistant walks the queue one vendor at a time.
  const queryClient = useQueryClient();
  const { toast } = useToast();
  // Enriches the per-item vendor_id/vendor_name with payment terms + portal URL.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vendorById = useMemo(() => {
    const map = new Map<string, any>();
    // useVendors() returns { data, pagination }, not a bare array.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const v of ((vendors as any)?.data ?? []) as any[]) map.set(v.id, v);
    return map;
  }, [vendors]);

  // poQueue[0] is the active order shown in the assistant; closing drops it.
  const [poQueue, setPoQueue] = useState<PendingOrder[]>([]);
  const activeOrder = poQueue[0] ?? null;

  const startGeneratePOs = (sourceItems: AnyItem[]) => {
    // Decision-Framework integrity (PT-D-2-T3-1): items held by a pending
    // blocks_procurement decision are dropped from the batch before it reaches
    // the Order Assistant, with a toast pointing the designer at the decision.
    const blocked = sourceItems.filter(
      (it) => it.blocked && it.blocked_by_decision_id,
    );
    const orderable = sourceItems.filter(
      (it) => !(it.blocked && it.blocked_by_decision_id),
    );
    if (blocked.length > 0) {
      toast(
        `${blocked.length} item${blocked.length === 1 ? '' : 's'} skipped — blocked pending a client decision.`,
        'warning',
      );
    }
    if (orderable.length === 0) {
      if (blocked.length === 0) {
        toast('Assign a vendor to these items before generating a PO.', 'warning');
      }
      return;
    }

    const withVendor = orderable.filter((it) => it.vendor_id);
    const withoutVendor = orderable.length - withVendor.length;
    if (withVendor.length === 0) {
      toast('Assign a vendor to these items before generating a PO.', 'warning');
      return;
    }
    if (withoutVendor > 0) {
      toast(
        `${withoutVendor} item${withoutVendor === 1 ? '' : 's'} skipped — assign a vendor first.`,
        'warning',
      );
    }

    const groups = new Map<string, AnyItem[]>();
    for (const it of withVendor) {
      const arr = groups.get(it.vendor_id) ?? [];
      arr.push(it);
      groups.set(it.vendor_id, arr);
    }

    const orders: PendingOrder[] = Array.from(groups.entries()).map(([vendorId, groupItems]) => {
      const rec = vendorById.get(vendorId);
      return {
        vendor: {
          id: vendorId,
          name: groupItems[0].vendor_name ?? rec?.name ?? 'Vendor',
          default_payment_terms: (rec?.default_payment_terms as PaymentPattern | null) ?? null,
          trade_portal_url: rec?.trade_portal_url ?? undefined,
          trade_account_email: rec?.trade_account_email ?? undefined,
          is_patina_catalog: rec?.is_patina_catalog ?? undefined,
        },
        project: { id: projectId, name: project?.name ?? 'Project' },
        ffeItems: groupItems.map((it) => ({
          id: it.id,
          name: it.name,
          room: it.room?.name,
          line_total_cents: it.line_total_cents || 0,
          // Decision-Framework integrity (PT-D-2-T3-1): carry the blocked flag
          // + decision link so the Order Assistant can refuse ordering and
          // deep-link the designer to the pending decision.
          blocked: it.blocked,
          blocked_by_decision_id: it.blocked_by_decision_id,
          blocked_reason: it.blocked_reason,
        })),
      };
    });

    setPoQueue(orders);
    setSelected(new Set());
  };

  // After a PO is created, advance its items to "ordered" and refresh the board
  // (useCreatePurchaseOrder only invalidates its own @patina/supabase keys, not
  // the portal's project-scoped FF&E key).
  const handleOrderCreated = async (order: PendingOrder) => {
    await Promise.allSettled(
      order.ffeItems.map((i) =>
        updateStatus.mutateAsync({ itemId: i.id, projectId, status: 'ordered' }),
      ),
    );
    queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
  };

  // Skeleton until hydrated so SSR (empty cache) and first client paint (warm
  // singleton cache) render the same tree — prevents hydration mismatch.
  if (!hydrated || !project) return <LoadingStrata />;

  return (
    <div className="pt-8">
      <Breadcrumb
        items={[
          { label: 'Projects', href: '/portal/projects' },
          { label: project.name, href: `/portal/projects/${projectId}` },
          { label: 'FF&E' },
        ]}
      />

      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <div className="flex items-baseline gap-1.5">
            <h1 className="type-section-head" style={{ fontSize: '1.5rem' }}>
              FF&amp;E Pipeline
            </h1>
            {/* FF&E itself is Patina vocabulary; StrataInfoIcon explains the
                acronym + the procurement-board model. */}
            <StrataInfoIcon
              surfaceKey={SurfaceKeys.DesignerPortal.Ffe.Concept.Ffe}
              ariaLabel="What does FF&E mean?"
              fallback="FF&E stands for Furniture, Fixtures & Equipment — every specified product that moves through procurement on the way to install."
            />
          </div>
          <SectionIntro
            surfaceKey={SurfaceKeys.DesignerPortal.Ffe.ListIntro}
            fallback="Track each item from specification through install. Move items between stages to keep your client and vendors aligned."
          />
        </div>
        <div className="flex items-center gap-3">
          {/* PT-D-2-T3-2 — surface how many items are held pending a decision. */}
          <BlockedItemsRollup
            count={blockedRollup.count}
            projectId={projectId}
            decisionId={blockedRollup.decisionId}
          />
          <div className="type-meta-small text-[var(--text-muted)]">
            {filtered.length} of {items.length} items
          </div>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Search items, vendors, PO numbers" />
        <FacetedFilterPopover facets={facets} value={filters} onChange={setFilters} />
      </div>

      {/* Board-level empty state. Per spec §12.4 — first-time designers and
          filter-no-match cases route to dedicated CMS surfaces so authors can
          write distinct copy. */}
      {filtered.length === 0 && (
        <FfeBoardEmpty isFiltered={items.length > 0} />
      )}

      {/* Kanban */}
      <div className="overflow-x-auto pb-4">
        <div className="flex min-w-max gap-3">
          {STAGES.map((stage) => {
            const stageItems = grouped[stage.key] || [];
            return (
              <div
                key={stage.key}
                className="flex w-[260px] shrink-0 flex-col rounded-md border"
                style={{ borderColor: 'var(--border-default)', background: 'var(--bg-surface)' }}
              >
                <div
                  className="flex items-center justify-between border-b px-3 py-2"
                  style={{ borderColor: 'var(--border-default)' }}
                >
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ background: stage.color }} />
                    <span
                      style={{
                        fontFamily: 'var(--font-meta)',
                        fontSize: '0.62rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                      }}
                    >
                      {stage.label}
                    </span>
                    {/* Per-stage StrataInfoIcon — Patina-defined procurement
                        step. Tooltip body authored in Sanity per stage key. */}
                    <StrataInfoIcon
                      surfaceKey={stage.surfaceKey}
                      size={11}
                      ariaLabel={`What does the ${stage.label} stage mean?`}
                    />
                  </span>
                  <span className="type-meta-small text-[var(--text-muted)]">
                    {stageItems.length}
                  </span>
                </div>
                <div className="flex flex-col gap-2 p-2 min-h-[100px]">
                  {stageItems.map((it) => {
                    const isSelected = selected.has(it.id);
                    return (
                      <div
                        key={it.id}
                        className="cursor-pointer rounded-md border bg-white p-2.5 text-left transition-colors hover:border-[var(--text-primary)]"
                        style={{
                          borderColor: isSelected
                            ? 'var(--text-primary)'
                            : 'var(--border-default)',
                        }}
                        onClick={() =>
                          router.push(`/portal/projects/${projectId}/ffe?item=${it.id}`)
                        }
                      >
                        <div className="mb-1.5 flex items-start justify-between gap-2">
                          <span className="line-clamp-2 font-body text-[0.8rem] font-medium">
                            {it.name}
                          </span>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onClick={(e) => e.stopPropagation()}
                            onChange={() => toggleSelect(it.id)}
                            aria-label={`Select ${it.name}`}
                          />
                        </div>
                        {it.blocked && (
                          <div className="mb-1.5 type-meta-small uppercase tracking-wider" style={{ color: 'var(--color-terracotta, #D4A090)' }}>
                            ⚠ Blocked
                          </div>
                        )}
                        {it.room?.name && (
                          <div className="type-meta-small text-[var(--text-muted)]">
                            {it.room.name}
                          </div>
                        )}
                        {it.vendor_name && (
                          <div className="type-meta-small text-[var(--text-muted)]">
                            {it.vendor_name}
                          </div>
                        )}
                        <div className="mt-1.5 flex items-baseline justify-between">
                          <span className="font-heading text-[0.85rem] font-semibold">
                            {formatDollars(it.line_total_cents || 0)}
                          </span>
                          {it.eta && (
                            <span className="type-meta-small text-[var(--text-muted)]">
                              ETA {formatDate(it.eta)}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {stageItems.length === 0 && (
                    <div className="py-6 text-center type-meta-small text-[var(--text-muted)]">
                      —
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Item drawer */}
      {drawerItem && (
        <ItemDrawer
          item={drawerItem}
          rooms={rooms}
          vendors={vendorList}
          onClose={() => router.push(`/portal/projects/${projectId}/ffe`)}
          onUpdateStatus={async (status) => {
            await updateStatus.mutateAsync({ itemId: drawerItem.id, projectId, status });
          }}
          onGeneratePO={() => {
            router.push(`/portal/projects/${projectId}/ffe`);
            startGeneratePOs([drawerItem]);
          }}
        />
      )}

      {/* Bulk action bar. Generate POs launches the Order Assistant (P1.1).
          Reassign Vendor is not built yet — disabled with a tooltip (B-07). */}
      <BulkActionBar count={selected.size} onClear={() => setSelected(new Set())}>
        <BulkActionButton onClick={() => bulkAdvance('approved')}>Mark Approved</BulkActionButton>
        <BulkActionButton onClick={() => bulkAdvance('ordered')}>Mark Ordered</BulkActionButton>
        <BulkActionButton
          onClick={() => startGeneratePOs(items.filter((it) => selected.has(it.id)))}
        >
          Generate POs
        </BulkActionButton>
        <ComingSoonButton>Reassign Vendor</ComingSoonButton>
      </BulkActionBar>

      {/* Order Assistant — one vendor at a time; closing advances the queue. */}
      {activeOrder && (
        <OrderAssistant
          open={!!activeOrder}
          onOpenChange={(open) => {
            if (!open) setPoQueue((q) => q.slice(1));
          }}
          vendor={activeOrder.vendor}
          project={activeOrder.project}
          ffeItems={activeOrder.ffeItems}
          scopeDisclaimer={
            poQueue.length > 1
              ? `${poQueue.length} vendor orders queued — you'll confirm each in turn.`
              : undefined
          }
          onCreated={() => {
            void handleOrderCreated(activeOrder);
          }}
        />
      )}
    </div>
  );
}

// Matches BulkActionButton styling but disabled with a tooltip — used for
// procurement actions that aren't built yet (B-07). Kept local so the shared
// BulkActionButton component stays untouched.
function ComingSoonButton({ children }: { children: ReactNode }) {
  return (
    <button
      type="button"
      disabled
      title="Coming soon"
      className="cursor-not-allowed rounded-[3px] border px-3 py-1.5 text-[0.8rem] opacity-50"
      style={{
        borderColor: 'var(--border-default)',
        color: 'var(--text-primary)',
        fontFamily: 'var(--font-body)',
      }}
    >
      {children}
    </button>
  );
}

function ItemDrawer({
  item,
  rooms,
  vendors,
  onClose,
  onUpdateStatus,
  onGeneratePO,
}: {
  item: AnyItem;
  rooms: AnyItem[];
  vendors: AnyItem[];
  onClose: () => void;
  onUpdateStatus: (status: string) => Promise<void>;
  onGeneratePO?: () => void;
}) {
  const room = rooms.find((r) => r.id === item.project_room_id);
  const currentIdx = STAGES.findIndex((s) => s.key === item.status);
  const nextStage = currentIdx >= 0 && currentIdx < STAGES.length - 1 ? STAGES[currentIdx + 1] : null;
  // Decision-Framework integrity (PT-D-2-T3-1): an item held by a pending
  // blocks_procurement decision (blocked flag + a blocked_by_decision_id)
  // cannot be ordered until the client responds.
  const isOrderBlocked = Boolean(item.blocked) && Boolean(item.blocked_by_decision_id);

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-[480px] max-w-[95vw] overflow-y-auto border-l bg-[var(--bg-surface)] shadow-xl"
      style={{ borderColor: 'var(--border-default)' }}>
      <div className="flex items-center justify-between border-b p-4" style={{ borderColor: 'var(--border-default)' }}>
        <span className="type-meta-small uppercase tracking-wider">Item Detail</span>
        <button
          type="button"
          onClick={onClose}
          className="text-[1rem] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          aria-label="Close"
        >
          ×
        </button>
      </div>

      <div className="p-5">
        <h2
          className="mb-3"
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1.25rem',
            color: 'var(--text-primary)',
          }}
        >
          {item.name}
        </h2>

        <Field label="Room" value={room?.name || '—'} />
        <Field label="Vendor" value={item.vendor_name || '—'} />
        {/* Procurement-side concepts get StrataInfoIcons so designers can
            learn what each label measures without leaving the drawer. */}
        <Field
          label="PO Number"
          value={item.po_number || '—'}
          surfaceKey={SurfaceKeys.DesignerPortal.Ffe.Detail.PoNumber}
        />
        <Field label="Quantity" value={String(item.quantity ?? 1)} />
        <Field label="Unit Price" value={formatDollars(item.unit_price_cents || 0)} />
        <Field
          label="Line Total"
          value={formatDollars(item.line_total_cents || 0)}
          surfaceKey={SurfaceKeys.DesignerPortal.Ffe.Detail.LineTotal}
        />
        <Field
          label="ETA"
          value={formatDate(item.eta)}
          surfaceKey={SurfaceKeys.DesignerPortal.Ffe.Detail.Eta}
        />
        <Field label="Last Updated" value={formatDate(item.last_status_change_at || item.updated_at)} />

        {item.blocked && (
          <div
            className="my-3 rounded-md border-2 p-3"
            style={{ borderColor: 'var(--color-terracotta, #D4A090)' }}
          >
            <div
              className="type-meta-small uppercase tracking-wider mb-1 inline-flex items-baseline gap-1"
              style={{ color: 'var(--color-terracotta)' }}
            >
              ⚠ Blocked
              {/* Blocked-reason is a Patina-defined procurement status —
                  StrataInfoIcon explains what triggers a block and how to
                  unblock. */}
              <StrataInfoIcon
                surfaceKey={SurfaceKeys.DesignerPortal.Ffe.Detail.BlockedReason}
                size={11}
                ariaLabel="What does a Blocked item mean?"
              />
            </div>
            <p className="type-body text-[0.82rem]">
              {item.blocked_reason || 'Pending decision blocks this item.'}
            </p>
            {item.blocked_by_decision_id && (
              <a
                href={`/portal/decisions/${item.blocked_by_decision_id}`}
                className="mt-2 inline-block type-meta-small font-medium underline decoration-dotted underline-offset-2 hover:decoration-solid"
                style={{ color: 'var(--color-terracotta, #D4A090)' }}
              >
                View the decision →
              </a>
            )}
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-2">
          {nextStage && (
            <button
              type="button"
              onClick={() => onUpdateStatus(nextStage.key)}
              className="rounded-[3px] px-3 py-1.5 text-[0.8rem] text-[var(--bg-primary)]"
              style={{ background: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}
            >
              Mark as {nextStage.label}
            </button>
          )}
          <button
            type="button"
            onClick={() => item.vendor_id && !isOrderBlocked && onGeneratePO?.()}
            disabled={!item.vendor_id || isOrderBlocked}
            title={
              isOrderBlocked
                ? 'Ordering is blocked pending a client decision'
                : item.vendor_id
                  ? 'Create a purchase order for this item'
                  : 'Assign a vendor first'
            }
            className={`rounded-[3px] border bg-transparent px-3 py-1.5 text-[0.8rem] ${item.vendor_id && !isOrderBlocked ? '' : 'cursor-not-allowed opacity-50'}`}
            style={{ borderColor: 'var(--border-default)' }}
          >
            {isOrderBlocked ? 'Blocked — decision pending' : 'Generate PO'}
          </button>
        </div>

        {/* Suppress unused vendors prop warning until vendor reassignment ships */}
        <span className="hidden">{vendors.length}</span>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  surfaceKey,
}: {
  label: string;
  value: string;
  surfaceKey?: string;
}) {
  return (
    <div className="flex items-baseline justify-between border-b py-1.5 last:border-b-0" style={{ borderColor: 'var(--border-subtle)' }}>
      <span className="type-meta-small text-[var(--text-muted)] inline-flex items-baseline gap-1">
        {label}
        {/* Optional StrataInfoIcon — surfaces Patina-vocab definitions inline
            without bloating the row. Hidden when no surfaceKey is provided. */}
        {surfaceKey ? (
          <StrataInfoIcon
            surfaceKey={surfaceKey}
            size={11}
            ariaLabel={`What does ${label} mean?`}
          />
        ) : null}
      </span>
      <span className="type-body text-[0.85rem] text-[var(--text-primary)]">{value}</span>
    </div>
  );
}
