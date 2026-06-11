'use client';

/**
 * Procurement → By Status
 *
 * Per PRD slide 07: "The 8 stages, now financial." Shows the 8-stage FF&E
 * pipeline horizontally across the top with item counts and totals per stage,
 * then a single expanded section for the active stage (default: Production)
 * with rows showing per-item operational + payment state side-by-side.
 *
 * W1-T5 (shipped): rows-per-FFE-item, replacing the Sprint 1 rows-per-PO
 *   approximation. Each row is a `project_ffe_items` row (via
 *   `useProcurementItems`) bucketed by its own 8-stage `status` column — the
 *   00184 DB triggers keep item stages in sync with PO lifecycle, so the
 *   per-item buckets are truthful. Payment + ETA columns read off the joined
 *   purchase order; pre-PO items render quiet placeholders.
 *
 * W1-T5 also ships the real Project / Payment filters (FacetedFilterPopover,
 *   client-side over the single loaded cache entry) with a ?projectId= deep
 *   link kept in sync with the Project facet.
 *
 * What's intentionally stubbed (later):
 *   - Calendar / Receiving cross-links
 *
 * Wave 2.4 (shipped): manual ETA quick-edit via the inline pencil icon on
 *   each row with a linked PO — opens EtaQuickEditDrawer for that PO.
 */

import { Suspense, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Pencil } from 'lucide-react';
import {
  useProcurementItems,
  type ProcurementItemRow,
} from '@patina/supabase';
import { FFE_STAGE_KEYS, type FFEStageKey } from '@patina/types';
import { STAGE_CONFIG } from '@/components/portal/ffe/stages';
import { LoadingStrata } from '@/components/portal/loading-strata';
import { IconButton } from '@/components/ui/controls';
import { useHydrated } from '@/hooks/use-hydrated';
import {
  PaymentPill,
  type PaymentPillState,
} from '@/components/portal/procurement/payment-pill';
import {
  EtaQuickEditDrawer,
  type EtaQuickEditPurchaseOrder,
} from '@/components/portal/procurement/eta-quick-edit-drawer';
import {
  FacetedFilterPopover,
  type Facet,
  type FacetSelections,
} from '@/components/portal/faceted-filter-popover';
import { procurementEvents } from '@/lib/analytics/procurement-events';

// ─── Types ──────────────────────────────────────────────────────────────────

/** The joined purchase order off a ProcurementItemRow (non-null). */
type ItemPurchaseOrder = NonNullable<ProcurementItemRow['purchase_order']>;

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDollars(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

/**
 * Weeks-until-ETA for the time-left badge. Returns null when no ETA is set.
 */
function weeksUntil(eta: string | null | undefined): number | null {
  if (!eta) return null;
  const target = new Date(eta).getTime();
  const now = Date.now();
  const diffMs = target - now;
  return Math.round(diffMs / (7 * 24 * 60 * 60 * 1000));
}

interface TimeLeftBadge {
  text: string;
  bg: string;
  color: string;
}

function timeLeftBadge(eta: string | null | undefined): TimeLeftBadge | null {
  const wk = weeksUntil(eta);
  if (wk === null) return null;

  // Red-band: less than 2 weeks → terracotta "risk"
  if (wk < 2) {
    return {
      text: wk <= 0 ? 'overdue' : `${wk} wk · risk`,
      bg: 'rgba(212,160,144,0.18)',
      color: 'var(--color-terracotta)',
    };
  }
  // Default: golden-hour
  return {
    text: `${wk} wk left`,
    bg: 'rgba(232,197,71,0.18)',
    color: 'var(--color-golden-hour)',
  };
}

/**
 * Picks the most-actionable po_payments row for the pill column. Order of
 * preference: any `due`, else first `pending`, else first `paid`, else null.
 * Sourced from the item's joined purchase order — pre-PO items have no
 * payment state at all (callers render "—").
 */
function pickHeadlinePayment(po: ItemPurchaseOrder): {
  state: PaymentPillState;
  amount: number | null;
  dueDate: string | null;
  kind: string;
} | null {
  if (po.is_patina_catalog) {
    return { state: 'patina_handled', amount: null, dueDate: null, kind: '' };
  }
  const payments = (po.payments ?? [])
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order);
  if (payments.length === 0) return null;

  const due = payments.find((p) => p.state === 'due');
  const target =
    due ?? payments.find((p) => p.state === 'pending') ?? payments[0];

  const kind =
    target.kind === 'deposit'
      ? 'Deposit'
      : target.kind === 'balance'
        ? 'Balance'
        : (target.label ?? 'Milestone');

  return {
    state: target.state as PaymentPillState,
    amount: target.amount_cents,
    dueDate:
      target.state === 'paid'
        ? target.paid_date
        : target.due_date,
    kind,
  };
}

/** Resolves an item's status to a known stage key (defensive fallback). */
function itemStage(item: ProcurementItemRow): FFEStageKey {
  return STAGE_CONFIG[item.status as FFEStageKey] ? (item.status as FFEStageKey) : 'specified';
}

// ─── Sub-components ─────────────────────────────────────────────────────────

interface StageBucket {
  stage: FFEStageKey;
  items: ProcurementItemRow[];
  itemCount: number;
  totalCents: number;
}

function FlowChart({
  stages,
  activeStage,
  onSelect,
}: {
  stages: StageBucket[];
  activeStage: FFEStageKey;
  onSelect: (s: FFEStageKey) => void;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-stretch gap-1.5">
      {stages.map((bucket, idx) => {
        const cfg = STAGE_CONFIG[bucket.stage];
        const isActive = bucket.stage === activeStage;
        return (
          <div key={bucket.stage} className="flex items-stretch gap-1.5">
            <button
              type="button"
              onClick={() => onSelect(bucket.stage)}
              className="flex min-w-[7.5rem] flex-col items-start rounded-md border px-3 py-2 text-left transition-colors"
              style={{
                borderColor: isActive ? cfg.color : 'var(--border-default)',
                background: isActive
                  ? `color-mix(in srgb, ${cfg.color} 8%, transparent)`
                  : 'var(--bg-surface)',
              }}
            >
              <span
                className="font-heading"
                style={{
                  fontSize: '1.05rem',
                  fontWeight: 500,
                  color: 'var(--text-primary)',
                }}
              >
                {bucket.itemCount}
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-meta)',
                  fontSize: '0.6rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: isActive ? cfg.color : 'var(--text-muted)',
                }}
              >
                {cfg.label}
              </span>
            </button>
            {idx < stages.length - 1 && (
              <span
                aria-hidden
                className="mt-3 h-px w-3 self-center"
                style={{ background: 'var(--border-default)' }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function ItemStatusRow({
  item,
  onEditEta,
}: {
  item: ProcurementItemRow;
  onEditEta: (po: EtaQuickEditPurchaseOrder) => void;
}) {
  const po = item.purchase_order ?? null;
  const payment = po ? pickHeadlinePayment(po) : null;
  const badge = timeLeftBadge(po?.confirmed_eta);

  // Sub-label: project (the view is cross-project) + room when assigned.
  const sub = [item.project?.name, item.room?.name].filter(Boolean).join(' · ');
  // Vendor: prefer the PO's vendor; pre-PO items fall back to the free-form
  // vendor_name typed on the item itself.
  const vendorName = po?.vendor?.name ?? item.vendor_name ?? '—';

  return (
    <div
      className="grid items-center gap-3 border-b py-3 last:border-b-0"
      style={{
        gridTemplateColumns: '2fr 1.2fr 90px 1fr 96px',
        borderColor: 'var(--border-subtle, rgba(229,226,221,0.6))',
      }}
    >
      {/* Col 1 — item name + project/room */}
      <div className="min-w-0">
        <div className="truncate text-[0.85rem] font-medium text-[var(--text-primary)]">
          {item.name}
        </div>
        {sub && (
          <div className="truncate text-[0.7rem] text-[var(--text-muted)]">
            {sub}
          </div>
        )}
      </div>

      {/* Col 2 — vendor + PO number */}
      <div className="min-w-0">
        <div className="truncate text-[0.78rem] text-[var(--text-body, var(--text-primary))]">
          {vendorName}
        </div>
        {po?.vendor_po_number && (
          <div
            className="truncate text-[0.62rem] text-[var(--text-muted)]"
            style={{ fontFamily: 'var(--font-meta)' }}
          >
            {po.vendor_po_number}
          </div>
        )}
      </div>

      {/* Col 3 — amount */}
      <div
        className="text-right font-heading text-[0.85rem] text-[var(--text-primary)]"
        style={{ fontWeight: 500 }}
      >
        {formatDollars(item.line_total_cents ?? 0)}
      </div>

      {/* Col 4 — payment pill (from the joined PO; "—" pre-PO) */}
      <div className="flex flex-col items-start gap-1">
        {payment ? (
          <PaymentPill
            state={payment.state}
            amount={payment.amount ?? undefined}
            dueDate={payment.dueDate}
            kind={payment.state === 'patina_handled' ? undefined : payment.kind}
          />
        ) : (
          <span className="text-[0.6rem] text-[var(--text-muted)]">—</span>
        )}
      </div>

      {/* Col 5 — time-left badge + ETA edit trigger (linked-PO rows only) */}
      <div className="flex items-center justify-end gap-1.5">
        {badge ? (
          <span
            className="inline-flex items-center rounded-[3px] px-2 py-0.5"
            style={{
              backgroundColor: badge.bg,
              color: badge.color,
              fontFamily: 'var(--font-meta)',
              fontSize: '0.58rem',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              fontWeight: 600,
            }}
          >
            {badge.text}
          </span>
        ) : (
          <span className="text-[0.6rem] text-[var(--text-muted)]">—</span>
        )}
        {po && (
          <IconButton
            size="sm"
            onClick={() =>
              onEditEta({
                id: po.id,
                vendor_po_number: po.vendor_po_number,
                confirmed_eta: po.confirmed_eta,
                vendor: po.vendor ?? undefined,
                project: item.project ?? undefined,
              })
            }
            label={`Update ETA for ${po.vendor_po_number ? `PO ${po.vendor_po_number}` : (po.vendor?.name ?? 'purchase order')}`}
          >
            <Pencil size={12} />
          </IconButton>
        )}
      </div>
    </div>
  );
}

function StageSection({
  bucket,
  onEditEta,
}: {
  bucket: StageBucket;
  onEditEta: (po: EtaQuickEditPurchaseOrder) => void;
}) {
  const cfg = STAGE_CONFIG[bucket.stage];

  // Money summary: total paid (sum of paid po_payments) vs coming-due
  // (sum of due or pending), excluding patina_catalog rows. Multiple items
  // can share one PO, so dedupe by PO id to avoid double-counting payments.
  const { paidCents, dueComingCents } = useMemo(() => {
    let paid = 0;
    let due = 0;
    const seenPoIds = new Set<string>();
    for (const item of bucket.items) {
      const po = item.purchase_order;
      if (!po || po.is_patina_catalog || seenPoIds.has(po.id)) continue;
      seenPoIds.add(po.id);
      for (const p of po.payments ?? []) {
        if (p.state === 'paid') paid += p.amount_cents;
        else due += p.amount_cents; // pending + due
      }
    }
    return { paidCents: paid, dueComingCents: due };
  }, [bucket.items]);

  return (
    <div
      className="rounded-md border"
      style={{
        borderColor: 'var(--border-default)',
        background: 'var(--bg-surface)',
      }}
    >
      {/* Section header */}
      <div
        className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3"
        style={{ borderColor: 'var(--border-default)' }}
      >
        <div className="flex items-center gap-3">
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: cfg.color }}
          />
          <span
            className="font-heading text-[1rem] text-[var(--text-primary)]"
            style={{ fontWeight: 500 }}
          >
            {cfg.label}
          </span>
          <span
            style={{
              fontFamily: 'var(--font-meta)',
              fontSize: '0.65rem',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: 'var(--text-muted)',
            }}
          >
            · {bucket.itemCount} {bucket.itemCount === 1 ? 'item' : 'items'} ·{' '}
            {formatDollars(bucket.totalCents)} total
            {paidCents > 0 && (
              <> · {formatDollars(paidCents)} paid</>
            )}
            {dueComingCents > 0 && (
              <> · {formatDollars(dueComingCents)} coming due</>
            )}
          </span>
        </div>
      </div>

      {/* Rows */}
      <div className="px-4">
        {bucket.items.length === 0 ? (
          <div className="py-8 text-center text-[0.78rem] italic text-[var(--text-muted)]">
            No {cfg.label.toLowerCase()} items.
          </div>
        ) : (
          bucket.items.map((item) => (
            <ItemStatusRow key={item.id} item={item} onEditEta={onEditEta} />
          ))
        )}
      </div>
    </div>
  );
}

// ─── Main content ───────────────────────────────────────────────────────────

/** Payment facet options — the PaymentPillState vocabulary used on rows. */
const PAYMENT_FACET_OPTIONS: { value: PaymentPillState; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'due', label: 'Due' },
  { value: 'paid', label: 'Paid' },
  { value: 'patina_handled', label: 'Patina handled' },
];

function ByStatusContent() {
  const hydrated = useHydrated();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: items, isLoading, isError, error } = useProcurementItems();
  // Production is the default-open stage per PRD §7.
  const [activeStage, setActiveStage] = useState<FFEStageKey>('production');
  // W2.4 — selected PO for the ETA quick-edit drawer. The drawer is mounted
  // unconditionally below so its slide-in/out animation works smoothly; the
  // `open` prop is derived from this state.
  const [etaEditPO, setEtaEditPO] = useState<EtaQuickEditPurchaseOrder | null>(null);

  // W1-T5 — real filters. ?projectId= deep link seeds the Project facet on
  // mount; everything else is plain client-side state over the single
  // loaded cache entry.
  const [filters, setFilters] = useState<FacetSelections>(() => {
    const projectId = searchParams.get('projectId');
    const initial: FacetSelections = {};
    if (projectId) initial.project = [projectId];
    return initial;
  });

  const allItems = (items ?? []) as ProcurementItemRow[];

  const facets = useMemo<Facet[]>(() => {
    const projects = new Map<string, string>();
    for (const item of allItems) {
      if (item.project?.id) projects.set(item.project.id, item.project.name);
    }
    return [
      {
        key: 'project',
        label: 'Project',
        options: Array.from(projects.entries()).map(([value, label]) => ({ value, label })),
      },
      {
        key: 'payment',
        label: 'Payment',
        options: PAYMENT_FACET_OPTIONS,
      },
    ];
  }, [allItems]);

  const handleFiltersChange = (next: FacetSelections) => {
    // Fire analytics once per facet whose selection grew (an option applied);
    // clears and resets stay quiet.
    for (const facetKey of Object.keys(next)) {
      const prevCount = (filters[facetKey] ?? []).length;
      const nextCount = (next[facetKey] ?? []).length;
      if (nextCount > prevCount) {
        procurementEvents.byStatusFilterApplied({ facet: facetKey });
      }
    }
    setFilters(next);

    // Keep ?projectId= in sync with the Project facet so the filtered view is
    // shareable/deep-linkable. The param carries exactly one project — a
    // multi-project selection drops it. Other params are preserved.
    const params = new URLSearchParams(searchParams.toString());
    const projectSel = next.project ?? [];
    if (projectSel.length === 1) params.set('projectId', projectSel[0]);
    else params.delete('projectId');
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const filteredItems = useMemo(() => {
    const projectSel = filters.project ?? [];
    const paymentSel = filters.payment ?? [];
    return allItems.filter((item) => {
      if (projectSel.length > 0 && !projectSel.includes(item.project_id)) return false;
      if (paymentSel.length > 0) {
        const payment = item.purchase_order
          ? pickHeadlinePayment(item.purchase_order)
          : null;
        if (!payment || !paymentSel.includes(payment.state)) return false;
      }
      return true;
    });
  }, [allItems, filters]);

  const stages: StageBucket[] = useMemo(() => {
    const buckets: Record<FFEStageKey, StageBucket> = Object.fromEntries(
      FFE_STAGE_KEYS.map((key) => [
        key,
        { stage: key, items: [], itemCount: 0, totalCents: 0 } as StageBucket,
      ])
    ) as Record<FFEStageKey, StageBucket>;

    for (const item of filteredItems) {
      const bucket = buckets[itemStage(item)];
      bucket.items.push(item);
      bucket.itemCount += 1;
      bucket.totalCents += item.line_total_cents ?? 0;
    }

    return FFE_STAGE_KEYS.map((key) => buckets[key]);
  }, [filteredItems]);

  const activeBucket = stages.find((s) => s.stage === activeStage)!;
  const totalLive = stages.reduce((acc, s) => acc + s.itemCount, 0);

  // Skeleton until hydrated so SSR (empty cache) and first client paint (warm
  // singleton cache) render the same tree — prevents hydration mismatch.
  if (!hydrated || isLoading) return <LoadingStrata />;

  // Error surface — keep small/quiet per portal convention. Failures are
  // typically RLS/auth and resolve on sign-in.
  if (isError) {
    return (
      <div className="pt-8">
        <h1 className="type-section-head mb-2">By Status</h1>
        <div
          className="rounded-lg border border-[var(--color-error,#C77B6E)] bg-[rgba(199,123,110,0.06)] px-4 py-6 text-[0.85rem] text-[var(--text-primary)]"
          role="alert"
        >
          <div className="font-medium">Couldn&rsquo;t load FF&amp;E items.</div>
          <div className="mt-1 text-[0.78rem] text-[var(--text-muted)]">
            {error instanceof Error ? error.message : 'Unknown error'}
          </div>
        </div>
      </div>
    );
  }

  const isEmpty = allItems.length === 0;

  return (
    <div className="pt-8">
      {/* Header band */}
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="type-section-head">By Status</h1>
          <p className="mt-1 text-[0.8rem] text-[var(--text-muted)]">
            FF&amp;E pipeline across every active project, with payment state
            on the same row.
          </p>
        </div>
        <span
          className="text-[var(--text-muted)]"
          style={{
            fontFamily: 'var(--font-meta)',
            fontSize: '0.65rem',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          {totalLive} {totalLive === 1 ? 'item' : 'items'} in pipeline
        </span>
      </div>

      {isEmpty ? (
        <div className="rounded-lg border border-[var(--border-default)] px-6 py-12 text-center">
          <p className="text-sm font-medium text-[var(--text-primary)]">
            No FF&amp;E items yet
          </p>
          <p className="mt-1 text-[0.8rem] text-[var(--text-muted)]">
            Add items to a project&rsquo;s FF&amp;E board to see them here.
          </p>
          {/* TODO(help-system): wire CMS empty-state when Procurement surface keys are assigned */}
        </div>
      ) : (
        <>
          {/* W1-T5 — filter row (Project + Payment facets) */}
          <div className="mb-4 flex items-center justify-end">
            <FacetedFilterPopover
              facets={facets}
              value={filters}
              onChange={handleFiltersChange}
            />
          </div>

          {/* 8-stage flow chart */}
          <FlowChart
            stages={stages}
            activeStage={activeStage}
            onSelect={setActiveStage}
          />

          {/* Active stage section */}
          <StageSection bucket={activeBucket} onEditEta={setEtaEditPO} />
        </>
      )}

      {/* W2.4 — ETA quick-edit drawer. Mounted once, scoped to the most
          recently selected PO. The drawer resets its internal form whenever
          `open` flips from false → true. */}
      {etaEditPO && (
        <EtaQuickEditDrawer
          open={!!etaEditPO}
          onOpenChange={(o) => {
            if (!o) setEtaEditPO(null);
          }}
          purchaseOrder={etaEditPO}
        />
      )}
    </div>
  );
}

export default function ProcurementByStatusPage() {
  return (
    <Suspense fallback={<LoadingStrata />}>
      <ByStatusContent />
    </Suspense>
  );
}
