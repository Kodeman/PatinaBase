'use client';

/**
 * Procurement → By Status
 *
 * Per PRD slide 07: "The 8 stages, now financial." Shows the 8-stage FF&E
 * pipeline horizontally across the top with item counts and totals per stage,
 * then a single expanded section for the active stage (default: Production)
 * with rows showing per-PO operational + payment state side-by-side.
 *
 * Sprint 1 scope decision (documented in handoff report):
 *   - The PRD shows rows-per-FFE-item. Wave 1.2 only ships PO-level hooks;
 *     there is no cross-project `useFFEItems()` yet. We ship **rows-per-PO**
 *     for now — one row per purchase order, mapped to a stage via po.status
 *     using a deterministic mapping (po.status → FFE stage). This is a
 *     known approximation; Wave 1.4 should add a cross-project items hook
 *     and switch this view to rows-per-item.
 *
 * What's intentionally stubbed (Wave 2 / later):
 *   - Project filter and Payment status filter (visible but inert)
 *   - Manual ETA quick-edit (Wave 2.4)
 *   - Calendar / Receiving cross-links
 */

import { Suspense, useMemo, useState } from 'react';
import {
  usePurchaseOrders,
  type POStatus,
  type PurchaseOrder,
} from '@patina/supabase';
import { FFE_STAGE_KEYS, type FFEStageKey } from '@patina/types';
import { LoadingStrata } from '@/components/portal/loading-strata';
import {
  PaymentPill,
  type PaymentPillState,
} from '@/components/portal/procurement/payment-pill';

// ─── Stage display ──────────────────────────────────────────────────────────

/**
 * Per-stage visual + label config. Color tokens mirror the FF&E Kanban so
 * a designer sees the same colors across the per-project board and the
 * cross-project By Status view.
 */
const STAGE_DISPLAY: Record<FFEStageKey, { label: string; color: string }> = {
  specified: { label: 'Specified', color: 'var(--text-muted)' },
  quoted: { label: 'Quoted', color: 'var(--color-dusty-blue, #8B9CAD)' },
  approved: { label: 'Approved', color: 'var(--color-clay, #C4A57B)' },
  ordered: { label: 'Ordered', color: 'var(--color-dusty-blue, #8B9CAD)' },
  production: { label: 'Production', color: 'var(--color-golden-hour, #E8C547)' },
  shipped: { label: 'Shipped', color: 'var(--color-golden-hour, #E8C547)' },
  delivered: { label: 'Delivered', color: 'var(--color-sage, #A8B5A0)' },
  installed: { label: 'Installed', color: 'var(--color-sage, #A8B5A0)' },
};

/**
 * Sprint 1 approximation: map PurchaseOrder.status → FFE stage so we can
 * group PO rows under the 8-stage flow chart. A PO doesn't have its own
 * FFE stage (items do), but for the rows-per-PO Sprint 1 simplification
 * this gives a deterministic, predictable bucket.
 *
 * `cancelled` POs are filtered out of stage buckets — the flow chart only
 * shows live procurement.
 */
function poStatusToStage(status: POStatus): FFEStageKey | null {
  switch (status) {
    case 'draft':
      return 'approved';
    case 'confirmed':
      return 'ordered';
    case 'in_production':
      return 'production';
    case 'shipped':
      return 'shipped';
    case 'delivered':
      return 'delivered';
    case 'cancelled':
      return null;
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDollars(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function formatDate(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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
 */
function pickHeadlinePayment(po: PurchaseOrder): {
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

// ─── Sub-components ─────────────────────────────────────────────────────────

interface StageBucket {
  stage: FFEStageKey;
  orders: PurchaseOrder[];
  itemCount: number; // alias of orders.length in Sprint 1 (rows-per-PO)
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
        const cfg = STAGE_DISPLAY[bucket.stage];
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

function POStatusRow({ po }: { po: PurchaseOrder }) {
  const payment = pickHeadlinePayment(po);
  const badge = timeLeftBadge(po.confirmed_eta);

  // Sprint 1 rows-per-PO simplification: PO doesn't carry an item name, so
  // use the PO number (or vendor) as the primary label and the project as
  // the sub-label. Wave 1.4 should swap this for the linked FFE item name +
  // room when the cross-project items hook lands.
  const primary = po.vendor_po_number
    ? `PO ${po.vendor_po_number}`
    : (po.vendor?.name ?? 'Purchase Order');
  const sub = po.project?.name ?? 'Unknown Project';

  return (
    <div
      className="grid items-center gap-3 border-b py-3 last:border-b-0"
      style={{
        gridTemplateColumns: '2fr 1.2fr 90px 1fr 96px',
        borderColor: 'var(--border-subtle, rgba(229,226,221,0.6))',
      }}
    >
      {/* Col 1 — name + room/project */}
      <div className="min-w-0">
        <div className="truncate text-[0.85rem] font-medium text-[var(--text-primary)]">
          {primary}
        </div>
        <div className="truncate text-[0.7rem] text-[var(--text-muted)]">
          {sub}
        </div>
      </div>

      {/* Col 2 — vendor + PO number */}
      <div className="min-w-0">
        <div className="truncate text-[0.78rem] text-[var(--text-body, var(--text-primary))]">
          {po.vendor?.name ?? 'Unknown Vendor'}
        </div>
        {po.vendor_po_number && (
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
        {formatDollars(po.total_cents)}
      </div>

      {/* Col 4 — payment pill */}
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

      {/* Col 5 — time-left badge */}
      <div className="flex justify-end">
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
      </div>
    </div>
  );
}

function StageSection({ bucket }: { bucket: StageBucket }) {
  const cfg = STAGE_DISPLAY[bucket.stage];

  // Money summary: total paid (sum of paid po_payments) vs coming-due
  // (sum of due or pending), excluding patina_catalog rows.
  const { paidCents, dueComingCents } = useMemo(() => {
    let paid = 0;
    let due = 0;
    for (const po of bucket.orders) {
      if (po.is_patina_catalog) continue;
      for (const p of po.payments ?? []) {
        if (p.state === 'paid') paid += p.amount_cents;
        else due += p.amount_cents; // pending + due
      }
    }
    return { paidCents: paid, dueComingCents: due };
  }, [bucket.orders]);

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
            · {bucket.itemCount} {bucket.itemCount === 1 ? 'PO' : 'POs'} ·{' '}
            {formatDollars(bucket.totalCents)} total
            {paidCents > 0 && (
              <> · {formatDollars(paidCents)} paid</>
            )}
            {dueComingCents > 0 && (
              <> · {formatDollars(dueComingCents)} coming due</>
            )}
          </span>
        </div>

        {/* Stub filters — visible but inert per Sprint 1 scope */}
        <div
          className="flex items-center gap-3"
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.65rem',
            color: 'var(--text-muted)',
          }}
          aria-hidden
        >
          <span>Filter: Project</span>
          <span>·</span>
          <span>Filter: Payment status</span>
        </div>
      </div>

      {/* Rows */}
      <div className="px-4">
        {bucket.orders.length === 0 ? (
          <div className="py-8 text-center text-[0.78rem] italic text-[var(--text-muted)]">
            No {cfg.label.toLowerCase()} purchase orders.
          </div>
        ) : (
          bucket.orders.map((po) => <POStatusRow key={po.id} po={po} />)
        )}
      </div>
    </div>
  );
}

// ─── Main content ───────────────────────────────────────────────────────────

function ByStatusContent() {
  const { data: orders, isLoading, isError, error } = usePurchaseOrders();
  // Production is the default-open stage per PRD §7.
  const [activeStage, setActiveStage] = useState<FFEStageKey>('production');

  const allOrders = (orders ?? []) as PurchaseOrder[];

  const stages: StageBucket[] = useMemo(() => {
    const buckets: Record<FFEStageKey, StageBucket> = Object.fromEntries(
      FFE_STAGE_KEYS.map((key) => [
        key,
        { stage: key, orders: [], itemCount: 0, totalCents: 0 } as StageBucket,
      ])
    ) as Record<FFEStageKey, StageBucket>;

    for (const po of allOrders) {
      const stage = poStatusToStage(po.status);
      if (!stage) continue;
      const bucket = buckets[stage];
      bucket.orders.push(po);
      bucket.itemCount += 1;
      bucket.totalCents += po.total_cents;
    }

    return FFE_STAGE_KEYS.map((key) => buckets[key]);
  }, [allOrders]);

  const activeBucket = stages.find((s) => s.stage === activeStage)!;
  const totalLive = stages.reduce((acc, s) => acc + s.itemCount, 0);
  const cancelledCount = allOrders.filter((po) => po.status === 'cancelled').length;

  if (isLoading) return <LoadingStrata />;

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
          <div className="font-medium">Couldn&rsquo;t load purchase orders.</div>
          <div className="mt-1 text-[0.78rem] text-[var(--text-muted)]">
            {error instanceof Error ? error.message : 'Unknown error'}
          </div>
        </div>
      </div>
    );
  }

  const isEmpty = totalLive === 0 && cancelledCount === 0;

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
          {totalLive} live · {cancelledCount} cancelled
        </span>
      </div>

      {isEmpty ? (
        <div className="rounded-lg border border-[var(--border-default)] px-6 py-12 text-center">
          <p className="text-sm font-medium text-[var(--text-primary)]">
            No purchase orders yet
          </p>
          <p className="mt-1 text-[0.8rem] text-[var(--text-muted)]">
            Create a purchase order from the FF&amp;E board to see it here.
          </p>
          {/* TODO(help-system): wire CMS empty-state when Procurement surface keys are assigned */}
        </div>
      ) : (
        <>
          {/* 8-stage flow chart */}
          <FlowChart
            stages={stages}
            activeStage={activeStage}
            onSelect={setActiveStage}
          />

          {/* Active stage section */}
          <StageSection bucket={activeBucket} />
        </>
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
