'use client';

import { use, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  useProject,
  useProjectFFEItems,
  useProjectRooms,
  useAddProjectFFEItem,
  useRemoveProjectFFEItem,
} from '@/hooks/use-projects';
import {
  useUpdateFFEItemStatus,
  useIsStudioOwner,
  useVendors,
  useFFECategories,
  useFfeInvoiceCoverage,
  type PaymentPattern,
} from '@patina/supabase';
import { FFE_STAGE_KEYS, type FFEStageKey } from '@patina/types';
import { STAGES, STAGE_CONFIG } from '@/components/portal/ffe/stages';
import { poSync } from '@/components/portal/ffe/stage-select';
import { FFEItemCard } from '@/components/portal/ffe/ffe-item-card';
import { FFEItemDrawer } from '@/components/portal/ffe/ffe-item-drawer';
import {
  AddFFEItemControls,
  type AddFFEItemControlsHandle,
} from '@/components/portal/ffe/add-ffe-item-controls';
import { type ProductPickResult } from '@/components/portal/proposals/product-picker-modal';
import {
  type AllowanceFormState,
  type TbdFormState,
} from '@/components/portal/ffe/ffe-item-forms';
import { PageActionBar } from '@/components/portal';
import { LoadingStrata } from '@/components/portal/loading-strata';
import { useHydrated } from '@/hooks/use-hydrated';
import { SearchInput } from '@/components/portal/search-input';
import { useToast } from '@/components/portal/toast-provider';
import { procurementEvents } from '@/lib/analytics/procurement-events';
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
import { Button } from '@/components/ui/controls';
import {
  formatDollars,
  formatSignedDollars,
  parseDollarsToCents,
  parsePercentInput,
} from '@/lib/currency-ui';

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

// Stage label/color/surfaceKey config now lives in the shared FF&E module
// (@/components/portal/ffe/stages) so the board, the card stage dropdown, and
// the Procurement By Status view stay in lockstep.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// PO-sync derivation (00184 stage ratchet) now lives in the shared FF&E
// module (@/components/portal/ffe/stage-select → poSync) so the board cards
// and the item drawer stay in lockstep.

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

// Money helpers (formatDollars/formatSignedDollars + the 00185 dual-pricing
// input parsers) moved to the shared @/lib/currency-ui module — the item
// drawer (ffe-item-drawer.tsx) imports the same set.

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
  // Full directory page — the default pageSize (20) silently truncated the
  // vendorById lookup map, dropping payment terms / portal URLs / the W4-T4
  // orders_email hint for any vendor past the first alphabetical page.
  const { data: vendors } = useVendors(undefined, { page: 1, pageSize: 500 });
  const { data: rawCategories } = useFFECategories();
  const updateStatus = useUpdateFFEItemStatus();
  const addItem = useAddProjectFFEItem();
  const removeItem = useRemoveProjectFFEItem();

  // Margin visibility (00185 dual pricing): trade cost + margin are studio-
  // owner-only and HIDDEN (not disabled) for everyone else. While roles load
  // this is false → labels simply absent.
  const { isStudioOwner } = useIsStudioOwner();

  const items = useMemo(() => (Array.isArray(rawItems) ? rawItems : []) as AnyItem[], [rawItems]);
  const rooms = useMemo(() => (Array.isArray(rawRooms) ? rawRooms : []) as AnyItem[], [rawRooms]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vendorList = (Array.isArray(vendors) ? vendors : []) as any[];

  // FF&E categories for the allowance/TBD add-forms (no proposalId → system +
  // designer-scoped rows, the correct set for a project).
  const categoryOptions = useMemo(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    () => ((rawCategories ?? []) as any[]).map((c) => ({ slug: c.slug, label: c.label })),
    [rawCategories]
  );
  const categoryLookup = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of categoryOptions) map.set(c.slug, c.label);
    return map;
  }, [categoryOptions]);
  const roomOptions = useMemo(() => rooms.map((r) => ({ id: r.id, name: r.name })), [rooms]);

  // Direct add/edit only works for a real (UUID) project — slug fixtures serve
  // mock data and have no Supabase row to insert against.
  const isRealProject = UUID_RE.test(projectId);
  const addControlsRef = useRef<AddFFEItemControlsHandle>(null);

  // Invoice coverage (00187): items billed on a live invoice line can't be
  // removed — the chk_line_items_ffe_kind guard rejects the delete. The
  // drawer uses this map to disable Remove proactively with the invoice
  // number. Missing key = not covered.
  const { data: invoiceCoverage } = useFfeInvoiceCoverage(projectId, {
    enabled: isRealProject,
  });

  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<FacetSelections>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [collapsedRooms, setCollapsedRooms] = useState<Set<string>>(new Set());

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
        key: 'stage',
        label: 'Stage',
        options: FFE_STAGE_KEYS.map((k) => ({ value: k, label: STAGE_CONFIG[k].label })),
      },
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
      const stageSel = filters.stage ?? [];
      if (stageSel.length > 0 && !stageSel.includes(it.status || 'specified')) return false;
      const roomSel = filters.room ?? [];
      if (roomSel.length > 0 && !roomSel.includes(it.project_room_id)) return false;
      const vendorSel = filters.vendor ?? [];
      if (vendorSel.length > 0 && !vendorSel.includes(it.vendor_id || it.vendor_name)) return false;
      const typeSel = filters.type ?? [];
      if (typeSel.length > 0 && !typeSel.includes(it.item_type)) return false;
      return true;
    });
  }, [items, search, filters]);

  // Stage-count strip is computed from ALL items (not `filtered`) so it stays a
  // stable pipeline-at-a-glance even while a stage filter is active.
  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const stage of STAGES) counts[stage.key] = 0;
    for (const it of items) {
      const key = it.status || 'specified';
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }, [items]);

  // Filter first, then group by room (rooms in their sort order, Unassigned
  // last). Mirrors the proposal FF&E schedule builder's grouping.
  const groupedByRoom = useMemo(() => {
    const matched = new Set(rooms.map((r) => r.id));
    const byRoom = new Map<string, AnyItem[]>();
    for (const it of filtered) {
      const key = it.project_room_id && matched.has(it.project_room_id) ? it.project_room_id : '__unassigned';
      const arr = byRoom.get(key) ?? [];
      arr.push(it);
      byRoom.set(key, arr);
    }
    const groups: Array<{ id: string; name: string; items: AnyItem[] }> = [];
    for (const room of rooms) {
      const arr = byRoom.get(room.id);
      if (arr && arr.length > 0) groups.push({ id: room.id, name: room.name, items: arr });
    }
    const unassigned = byRoom.get('__unassigned');
    if (unassigned && unassigned.length > 0) {
      groups.push({ id: '__unassigned', name: 'Unassigned', items: unassigned });
    }
    return groups;
  }, [filtered, rooms]);

  const toggleRoom = (id: string) =>
    setCollapsedRooms((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Summary-strip chip click → single-select toggle into the shared filters.stage
  // (the same state the Filters popover writes), so strip and popover stay in sync.
  const toggleStageFilter = (key: string) =>
    setFilters((prev) => {
      const cur = prev.stage ?? [];
      const isOnly = cur.length === 1 && cur[0] === key;
      return { ...prev, stage: isOnly ? [] : [key] };
    });

  // Stage change from a card dropdown or the item drawer — any stage → any
  // stage. Errors surface via the global mutation toast; we swallow the
  // rejection so StageSelect's pending state resets cleanly. `is_override`
  // marks a manual pick on a PO-synced item (00184 ratchet) — the override
  // holds until the next PO transition.
  const handleStageChange = async (item: AnyItem, next: FFEStageKey) => {
    const from = item.status || 'specified';
    try {
      await updateStatus.mutateAsync({ itemId: item.id, projectId, status: next });
      procurementEvents.statusAdvanced({
        from,
        to: next,
        is_override: poSync(item).systemSet,
      });
    } catch {
      /* global mutation error toast already fired */
    }
  };

  const handleAddProduct = (r: ProductPickResult) =>
    addItem.mutateAsync({
      projectId,
      productId: r.productId,
      name: r.name,
      quantity: 1,
      unitPriceCents: r.priceCents ?? 0,
      // Catalog trade cost rides along when the picker knows it (00185).
      // Markup stays null — the price relationship is unknown at add time;
      // the pricing drawer can derive it later.
      tradePriceCents: r.priceTradeCents ?? null,
      vendorName: r.vendorName ?? undefined,
      itemType: 'fixed',
      projectRoomId: r.scopeRoomId,
    });

  const handleAddAllowance = (form: AllowanceFormState) => {
    const budgetMin = Math.round(parseFloat(form.minDollars || '0') * 100);
    const budgetMax = Math.round(parseFloat(form.maxDollars || '0') * 100);
    return addItem.mutateAsync({
      projectId,
      name: categoryLookup.get(form.ffeCategory) ?? form.ffeCategory,
      quantity: 1,
      unitPriceCents: 0,
      itemType: 'allowance',
      projectRoomId: form.scopeRoomId || null,
      ffeCategory: form.ffeCategory,
      budgetMinCents: budgetMin,
      budgetMaxCents: budgetMax,
      // Optional dual-pricing fields (00185) — empty stays NULL ("unknown").
      tradePriceCents: parseDollarsToCents(form.tradeDollars),
      markupPercent: parsePercentInput(form.markupPercent),
      notes: form.notes || undefined,
    });
  };

  const handleAddTbd = (form: TbdFormState) =>
    addItem.mutateAsync({
      projectId,
      name: categoryLookup.get(form.ffeCategory) ?? form.ffeCategory,
      quantity: 1,
      unitPriceCents: 0,
      itemType: 'tbd',
      projectRoomId: form.scopeRoomId || null,
      ffeCategory: form.ffeCategory,
      notes: form.notes || undefined,
    });

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

  // Card margin meta (00185): computed ONLY for studio owners on items with a
  // trade cost — everyone/everything else gets null (label hidden). Short
  // style, e.g. "Margin $1,140"; margin = line_total − trade × qty.
  const cardMarginLabel = (it: AnyItem): string | null => {
    if (!isStudioOwner) return null;
    // Allowance/TBD line totals are budget-range midpoints, not unit × qty, so
    // the margin formula is meaningless for those item types. Guard here matches
    // the drawer's clientEditable gate.
    if (it.item_type !== 'fixed') return null;
    if (it.trade_price_cents === null || it.trade_price_cents === undefined) return null;
    const margin = (it.line_total_cents || 0) - it.trade_price_cents * (it.quantity ?? 1);
    return `Margin ${formatSignedDollars(margin)}`;
  };

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const bulkAdvance = async (toStatus: string) => {
    const to = toStatus as FFEStageKey;
    const selectedItems = items.filter((it) => selected.has(it.id));
    // Capture each item's pre-advance status before any mutation so analytics
    // reflect the real from→to transition even if items share the same stage.
    const snapshots = selectedItems.map((it) => ({
      itemId: it.id,
      from: (it.status || 'specified') as FFEStageKey,
      is_override: poSync(it).systemSet,
    }));
    await Promise.all(
      snapshots.map(({ itemId }) => updateStatus.mutateAsync({ itemId, projectId, status: to }))
    );
    for (const snap of snapshots) {
      procurementEvents.statusAdvanced({ from: snap.from, to, is_override: snap.is_override });
    }
    setSelected(new Set());
  };

  // ── Purchasing (P1.1) ──────────────────────────────────────────────────
  // Reuse the existing OrderAssistant (built for the By Vendor view) to turn
  // selected FF&E items into purchase orders. Items are grouped by vendor —
  // one PO per vendor — and the assistant walks the queue one vendor at a time.
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
          // W4-T4 — outbound PO recipient hint for the created step's
          // "Email to {vendor}" action (server resolves authoritatively).
          orders_email: rec?.orders_email ?? null,
          contact_info: rec?.contact_info ?? null,
        },
        project: { id: projectId, name: project?.name ?? 'Project' },
        ffeItems: groupItems.map((it) => ({
          id: it.id,
          name: it.name,
          room: it.room?.name,
          line_total_cents: it.line_total_cents || 0,
          // Dual pricing (00185/00186): the Order Assistant totals
          // COALESCE(trade, unit) × qty — the vendor TRADE total the
          // create_purchase_order RPC computes server-side.
          quantity: it.quantity ?? 1,
          unit_price_cents: it.unit_price_cents ?? null,
          trade_price_cents: it.trade_price_cents ?? null,
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

    // W3-T3b — assistant-opened exposure event. One event per queue launch;
    // vendor_id only when the whole queue is a single vendor.
    procurementEvents.orderAssistantOpened({
      source: 'ffe_board',
      item_count: withVendor.length,
      vendor_id: orders.length === 1 ? orders[0].vendor.id : undefined,
      project_id: projectId,
    });
  };

  // Persistent "Create PO" entry (W3-T3b): always visible in the page action
  // bar. With a selection it behaves exactly like the bulk-bar action; with
  // nothing selected it auto-targets every approved, unordered, unblocked
  // item (the same eligibility the ?focus=approved deep link pre-selects,
  // minus already-ordered/blocked rows the queue would drop anyway).
  const handleHeaderCreatePo = () => {
    const source =
      selected.size > 0
        ? items.filter((it) => selected.has(it.id))
        : items.filter(
            (it) =>
              (it.status || 'specified') === 'approved' &&
              !it.purchase_order_id &&
              !(it.blocked && it.blocked_by_decision_id),
          );
    if (source.length === 0) {
      toast('No approved, unordered items to order — approve items first.', 'warning');
      return;
    }
    startGeneratePOs(source);
  };

  // ── Invoice items (W3-T4) ─────────────────────────────────────────────
  // Closes the FF&E→invoice loop from the board: selected items route to the
  // invoice composer's ?ffeItemIds= prefill so the designer reviews the lines
  // before a draft exists. Items already billed on a live invoice line (the
  // 00187 partial-unique guard would reject them) and unpriced items (NULL
  // client unit price) are dropped here with a toast — the composer re-checks
  // coverage anyway, but the skips should be visible at the point of intent.
  const handleInvoiceItems = () => {
    const selectedItems = items.filter((it) => selected.has(it.id));
    if (selectedItems.length === 0) {
      toast('Select items to invoice first.', 'warning');
      return;
    }
    const billable: AnyItem[] = [];
    let skippedCovered = 0;
    let skippedUnpriced = 0;
    for (const it of selectedItems) {
      const cov = invoiceCoverage?.[it.id];
      if (cov && cov.coverage !== 'uninvoiced') {
        skippedCovered += 1;
        continue;
      }
      if (it.unit_price_cents === null || it.unit_price_cents === undefined) {
        skippedUnpriced += 1;
        continue;
      }
      billable.push(it);
    }
    if (skippedCovered > 0) {
      toast(
        `${skippedCovered} already invoiced item${skippedCovered === 1 ? '' : 's'} skipped.`,
        'warning',
      );
    }
    if (skippedUnpriced > 0) {
      toast(
        `${skippedUnpriced} unpriced item${skippedUnpriced === 1 ? '' : 's'} skipped — set a client price first.`,
        'warning',
      );
    }
    if (billable.length === 0) {
      toast('Nothing left to invoice in this selection.', 'warning');
      return;
    }

    procurementEvents.ffeItemsInvoiced({
      item_count: billable.length,
      total_cents: billable.reduce(
        (sum, it) =>
          sum + (it.line_total_cents ?? (it.unit_price_cents ?? 0) * (it.quantity ?? 1)),
        0,
      ),
      skipped_covered: skippedCovered,
      skipped_unpriced: skippedUnpriced,
    });
    setSelected(new Set());
    router.push(
      `/portal/billing/invoices/new?projectId=${projectId}&ffeItemIds=${billable
        .map((it) => it.id)
        .join(',')}`,
    );
  };

  // No post-creation work needed here (W1-T7): the 00184 DB triggers advance
  // linked items to 'ordered' server-side, and useCreatePurchaseOrder's
  // onSuccess invalidates both FF&E cache namespaces (invalidateFfeCaches →
  // ['project-ffe-items', id] — the board's read key — plus the
  // ['projects', id] rollups).

  // Skeleton until hydrated so SSR (empty cache) and first client paint (warm
  // singleton cache) render the same tree — prevents hydration mismatch.
  if (!hydrated || !project) return <LoadingStrata />;

  return (
    <div className="pt-8">
      {/* The global breadcrumb (SubNav) carries the project name + "FF&E" step;
          the bar surfaces the FF&E concept icon + help intro as meta, with the
          blocked-items rollup + item count on the right. */}
      <PageActionBar
        meta={
          <div className="min-w-0">
            <div className="flex items-baseline gap-1.5">
              <span className="type-label-secondary">FF&amp;E Pipeline</span>
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
        }
        actions={
          <>
            {/* PT-D-2-T3-2 — surface how many items are held pending a decision. */}
            <BlockedItemsRollup
              count={blockedRollup.count}
              projectId={projectId}
              decisionId={blockedRollup.decisionId}
            />
            <div className="type-meta-small text-[var(--text-muted)]">
              {filtered.length} of {items.length} items
            </div>
            {/* Persistent ordering entry (W3-T3b). Acts on the selection when
                one exists; otherwise auto-targets every approved, unordered,
                unblocked item and opens the per-vendor queue. */}
            <Button variant="primary" size="sm" onClick={handleHeaderCreatePo}>
              Create PO
            </Button>
          </>
        }
      />

      {/* Add FF&E — direct add to the project (real/UUID projects only; slug
          fixtures serve mock data with no Supabase row to insert against). The
          allowance/TBD inline forms render in place below the buttons. Per-room
          "+ Add" links drive this same instance via the imperative handle. */}
      {isRealProject && (
        <div className="mb-5">
          <AddFFEItemControls
            ref={addControlsRef}
            rooms={roomOptions}
            categories={categoryOptions}
            pickerScope="library"
            isSaving={addItem.isPending}
            productLabel="+ Add FF&E"
            showTradePricing={true}
            onAddProduct={handleAddProduct}
            onAddAllowance={handleAddAllowance}
            onAddTbd={handleAddTbd}
          />
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Search items, vendors, PO numbers" />
        <FacetedFilterPopover facets={facets} value={filters} onChange={setFilters} />
      </div>

      {/* Stage-count summary strip — pipeline-at-a-glance. Clicking a chip
          single-select-toggles the shared filters.stage (same state as the
          Filters popover's Stage facet). */}
      {items.length > 0 && (
        <div className="mb-5 flex flex-wrap items-stretch gap-1.5">
          {STAGES.map((stage) => {
            const active = (filters.stage ?? []).includes(stage.key);
            return (
              <button
                key={stage.key}
                type="button"
                onClick={() => toggleStageFilter(stage.key)}
                aria-pressed={active}
                className="flex min-w-[6.5rem] items-center gap-2 rounded-md border px-3 py-1.5 text-left transition-colors"
                style={{
                  borderColor: active ? stage.color : 'var(--border-default)',
                  background: active
                    ? `color-mix(in srgb, ${stage.color} 10%, transparent)`
                    : 'var(--bg-surface)',
                }}
              >
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: stage.color }} />
                <span
                  className="flex-1"
                  style={{
                    fontFamily: 'var(--font-meta)',
                    fontSize: '0.6rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: active ? stage.color : 'var(--text-muted)',
                  }}
                >
                  {stage.label}
                </span>
                <span className="font-heading text-[0.85rem] font-medium text-[var(--text-primary)]">
                  {stageCounts[stage.key] ?? 0}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Board-level empty state. Per spec §12.4 — first-time designers and
          filter-no-match cases route to dedicated CMS surfaces so authors can
          write distinct copy. */}
      {filtered.length === 0 && (
        <FfeBoardEmpty isFiltered={items.length > 0} />
      )}

      {/* Card grid, grouped by room. Each card carries an inline stage dropdown
          (any stage → any stage). Rooms collapse independently; Unassigned last. */}
      <div className="flex flex-col gap-5 pb-4">
        {groupedByRoom.map((group) => {
          const collapsed = collapsedRooms.has(group.id);
          return (
            <div key={group.id}>
              <div className="mb-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggleRoom(group.id)}
                  aria-expanded={!collapsed}
                  className="flex items-center gap-1.5 text-[var(--color-clay)] transition-colors hover:text-[var(--text-primary)]"
                >
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    aria-hidden
                    style={{ transform: collapsed ? 'rotate(-90deg)' : 'none', transition: 'transform 120ms' }}
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                  <span
                    style={{
                      fontFamily: 'var(--font-meta)',
                      fontSize: '0.62rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                    }}
                  >
                    {group.name}
                  </span>
                </button>
                <span className="type-meta-small text-[var(--text-muted)]">{group.items.length}</span>
                {isRealProject && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      addControlsRef.current?.openProduct(group.id === '__unassigned' ? null : group.id)
                    }
                  >
                    + Add
                  </Button>
                )}
              </div>

              {!collapsed && (
                <div
                  className="grid gap-3"
                  style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}
                >
                  {group.items.map((it) => (
                    <FFEItemCard
                      key={it.id}
                      name={it.name}
                      imageUrl={it.product?.images?.[0] ?? null}
                      roomName={it.room?.name}
                      vendorName={it.vendor_name}
                      quantity={it.quantity}
                      unitTotalLabel={formatDollars(it.line_total_cents || 0)}
                      etaLabel={it.eta ? formatDate(it.eta) : null}
                      marginLabel={cardMarginLabel(it)}
                      itemType={it.item_type}
                      blocked={it.blocked}
                      blockedReason={it.blocked_reason}
                      blockedByDecisionId={it.blocked_by_decision_id}
                      selected={selected.has(it.id)}
                      onToggleSelect={() => toggleSelect(it.id)}
                      onOpenDetail={() => router.push(`/portal/projects/${projectId}/ffe?item=${it.id}`)}
                      stage={{
                        currentStatus: it.status || 'specified',
                        onChangeStatus: (next) => handleStageChange(it, next),
                        sync: poSync(it),
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Item drawer */}
      {drawerItem && (
        <FFEItemDrawer
          item={drawerItem}
          projectId={projectId}
          rooms={rooms}
          vendors={vendorList}
          isStudioOwner={isStudioOwner}
          canEditPricing={isRealProject}
          invoiceCoverage={invoiceCoverage?.[drawerItem.id] ?? null}
          onClose={() => router.push(`/portal/projects/${projectId}/ffe`)}
          onUpdateStatus={async (status) => {
            // Through handleStageChange so drawer picks fire the same
            // procurement_status_advanced event as the card dropdowns.
            await handleStageChange(drawerItem, status as FFEStageKey);
          }}
          onGeneratePO={() => {
            router.push(`/portal/projects/${projectId}/ffe`);
            startGeneratePOs([drawerItem]);
          }}
          onRemove={
            isRealProject
              ? async () => {
                  await removeItem.mutateAsync({ itemId: drawerItem.id, projectId });
                  router.push(`/portal/projects/${projectId}/ffe`);
                }
              : undefined
          }
        />
      )}

      {/* Bulk action bar. Create PO launches the Order Assistant (P1.1).
          Reassign Vendor is not built yet — disabled with a tooltip (B-07). */}
      <BulkActionBar count={selected.size} onClear={() => setSelected(new Set())}>
        <BulkActionButton onClick={() => bulkAdvance('approved')}>Mark Approved</BulkActionButton>
        <BulkActionButton onClick={() => bulkAdvance('ordered')}>Mark Ordered</BulkActionButton>
        <BulkActionButton
          onClick={() => startGeneratePOs(items.filter((it) => selected.has(it.id)))}
        >
          Create PO
        </BulkActionButton>
        {/* W3-T4 — route selected items to the invoice composer's
            ?ffeItemIds= prefill (covered/unpriced items skipped with toasts). */}
        <BulkActionButton onClick={handleInvoiceItems}>Invoice Items</BulkActionButton>
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
    <Button variant="secondary" size="sm" disabled title="Coming soon">
      {children}
    </Button>
  );
}
