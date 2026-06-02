'use client';

/**
 * Procurement → Receiving (desktop dashboard, Sprint 2 Wave 2.3).
 *
 * Per PRD §9 the desktop receiving surface is a triage view: 4 KPIs at the
 * top, then a 4-tab body covering the lifecycle from "Arriving" through
 * "Cleared". The deep photo-rich receiving log lives on iOS (mobile-first
 * per PRD §9) — desktop only needs a lightweight inspection-logging
 * affordance for cases where the box is already at the studio.
 *
 * Data dependencies (all from `@patina/supabase` — Wave 2.2):
 *   • useTodayProcurementCounts  — fast counts for the KPI strip
 *   • usePurchaseOrders          — arriving + pending-inspection filtering
 *   • useReceivingInspections    — pending vs cleared partition + pass rate
 *   • useDamageClaims            — open damage claims tab
 *
 * Side surfaces:
 *   • LogInspectionDrawer   — opened from the "Inspect now" row CTA
 *   • DamageClaimDrawer     — opened from the "View claim" row CTA
 *
 * All four mutations + state transitions flow through the shared hooks so
 * cache invalidation is consistent with the rest of the procurement zone.
 */

import { Suspense, useMemo, useState } from 'react';
import {
  useDamageClaims,
  usePurchaseOrders,
  useReceivingInspections,
  useTodayProcurementCounts,
  type DamageClaim,
  type PurchaseOrder,
  type ReceivingInspection,
} from '@patina/supabase';
import { LoadingStrata } from '@/components/portal/loading-strata';
import { useHydrated } from '@/hooks/use-hydrated';
import { ReceivingKpiRow } from '@/components/portal/procurement/receiving-kpi-row';
import {
  ReceivingTabs,
  type ReceivingTabKey,
} from '@/components/portal/procurement/receiving-tabs';
import { LogInspectionDrawer } from '@/components/portal/procurement/log-inspection-drawer';
import { DamageClaimDrawer } from '@/components/portal/procurement/damage-claim-drawer';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** ISO YYYY-MM-DD, n days from today. Positive n = future. */
function isoDateOffsetDays(n: number): string {
  return new Date(Date.now() + n * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

/** ISO timestamp n days from now (used as a since-date filter). */
function isoTimestampOffsetDays(n: number): string {
  return new Date(Date.now() + n * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Builds the {primary, secondary} label used by the Log Inspection drawer
 * header. Same shape as the by-status row helper but inlined here so the
 * page doesn't have to import a row component just for one helper.
 */
function describePO(po: PurchaseOrder): { primary: string; secondary: string } {
  const primary = po.vendor_po_number
    ? `PO ${po.vendor_po_number}`
    : (po.vendor?.name ?? 'Purchase Order');
  const secondary = po.project?.name ?? 'Unknown Project';
  return { primary, secondary };
}

// ─── Content ────────────────────────────────────────────────────────────────

function ReceivingDashboardContent() {
  // ─── Data ───────────────────────────────────────────────────────────────

  const hydrated = useHydrated();
  const countsQuery = useTodayProcurementCounts();
  const ordersQuery = usePurchaseOrders();
  // 30-day pass-rate window for the KPI; "Cleared" tab also reads from this
  // set to avoid a second round-trip.
  const sinceThirtyDays = useMemo(() => isoTimestampOffsetDays(-30), []);
  const inspectionsQuery = useReceivingInspections({ sinceDate: sinceThirtyDays });
  // Open claims (drafted + vendor_notified). We do two fetches because the
  // filter is server-side (single state) — Postgres `IN()` isn't directly
  // exposed via the .eq() filter the hook uses.
  const draftedClaimsQuery = useDamageClaims({ state: 'drafted' });
  const notifiedClaimsQuery = useDamageClaims({ state: 'vendor_notified' });

  // `!hydrated` keeps the skeleton on SSR + first client paint so the warm
  // singleton cache can't diverge from the empty server cache (hydration mismatch).
  const isLoading =
    !hydrated ||
    countsQuery.isLoading ||
    ordersQuery.isLoading ||
    inspectionsQuery.isLoading ||
    draftedClaimsQuery.isLoading ||
    notifiedClaimsQuery.isLoading;

  const errorSource =
    ordersQuery.error ??
    inspectionsQuery.error ??
    draftedClaimsQuery.error ??
    notifiedClaimsQuery.error ??
    null;

  // ─── Tab state + drawers ────────────────────────────────────────────────

  const [activeTab, setActiveTab] = useState<ReceivingTabKey>('arriving');
  const [logTarget, setLogTarget] = useState<PurchaseOrder | null>(null);
  const [claimTarget, setClaimTarget] = useState<DamageClaim | null>(null);

  // ─── Derived rows ───────────────────────────────────────────────────────

  const orders = (ordersQuery.data ?? []) as PurchaseOrder[];
  const inspections = (inspectionsQuery.data ?? []) as ReceivingInspection[];
  const openClaims: DamageClaim[] = useMemo(() => {
    const drafted = (draftedClaimsQuery.data ?? []) as DamageClaim[];
    const notified = (notifiedClaimsQuery.data ?? []) as DamageClaim[];
    // Newest first to match the iOS app's default sort.
    return [...drafted, ...notified].sort((a, b) =>
      a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0,
    );
  }, [draftedClaimsQuery.data, notifiedClaimsQuery.data]);

  /** Arriving: confirmed_eta within today..+7d, status in_production OR shipped. */
  const arriving = useMemo(() => {
    const todayIso = isoDateOffsetDays(0);
    const sevenAhead = isoDateOffsetDays(7);
    return orders
      .filter((po) => {
        if (!po.confirmed_eta) return false;
        if (po.status !== 'in_production' && po.status !== 'shipped') return false;
        const eta = po.confirmed_eta.slice(0, 10);
        return eta >= todayIso && eta <= sevenAhead;
      })
      .sort((a, b) => {
        const ax = a.confirmed_eta ?? '';
        const bx = b.confirmed_eta ?? '';
        return ax < bx ? -1 : ax > bx ? 1 : 0;
      });
  }, [orders]);

  /**
   * Pending Inspection: status='delivered' AND no receiving_inspections row
   * exists for the PO. We join the two collections client-side using the
   * Set of inspected PO ids.
   *
   * NOTE: inspectionsQuery is scoped to the 30-day window. A delivery older
   * than 30 days with no inspection would falsely show up as "pending" — in
   * practice we expect inspections to be logged within hours of delivery so
   * the 30-day window is a safe approximation. If this proves insufficient,
   * widen the query window or add a dedicated `has_inspection` flag in v2.
   */
  const pendingInspection = useMemo(() => {
    const inspectedPoIds = new Set(
      inspections.map((i) => i.purchase_order_id),
    );
    return orders
      .filter((po) => po.status === 'delivered' && !inspectedPoIds.has(po.id))
      .sort((a, b) => {
        const ax = a.confirmed_eta ?? '';
        const bx = b.confirmed_eta ?? '';
        return ax < bx ? -1 : ax > bx ? 1 : 0;
      });
  }, [orders, inspections]);

  /** Cleared: outcome='clean' in the last 30 days (already filtered server-side). */
  const cleared = useMemo(() => {
    return inspections.filter((i) => i.outcome === 'clean');
  }, [inspections]);

  /** Pass rate: clean / total within the 30-day window. */
  const passRatePct = useMemo(() => {
    if (inspections.length === 0) return null;
    const clean = inspections.filter((i) => i.outcome === 'clean').length;
    return (clean / inspections.length) * 100;
  }, [inspections]);

  // ─── Render ─────────────────────────────────────────────────────────────

  if (isLoading) return <LoadingStrata />;

  if (errorSource) {
    return (
      <div className="pt-8">
        <h1 className="type-section-head mb-2">Receiving</h1>
        <div
          className="rounded-lg border border-[var(--color-error,#C77B6E)] bg-[rgba(199,123,110,0.06)] px-4 py-6 text-[0.85rem] text-[var(--text-primary)]"
          role="alert"
        >
          <div className="font-medium">Couldn&rsquo;t load receiving data.</div>
          <div className="mt-1 text-[0.78rem] text-[var(--text-muted)]">
            {errorSource instanceof Error ? errorSource.message : 'Unknown error'}
          </div>
        </div>
      </div>
    );
  }

  const counts = countsQuery.data;

  // Pre-resolved labels for the Log Inspection drawer so the drawer itself
  // stays presentational.
  const logTargetMeta = logTarget
    ? describePO(logTarget)
    : { primary: '', secondary: '' };
  const logTargetVendor = logTarget?.vendor?.name ?? 'Unknown vendor';

  return (
    <div className="pt-8">
      {/* Header band */}
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="type-section-head">Receiving</h1>
          <p className="mt-1 text-[0.8rem] text-[var(--text-muted)]">
            Inbound shipments + delivery reconciliation. Inspect on desktop or
            log photo evidence from the iOS app.
          </p>
        </div>
      </div>

      <ReceivingKpiRow
        arrivingThisWeek={counts?.arrivingThisWeek ?? 0}
        inspectionsPending={counts?.inspectionsPending ?? 0}
        damageClaimsOpen={counts?.damageClaimsOpen ?? 0}
        inspectionPassRatePct={passRatePct}
        inspectionPassRateSampleSize={inspections.length}
      />

      <ReceivingTabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
        arriving={arriving}
        pendingInspection={pendingInspection}
        damageClaims={openClaims}
        cleared={cleared}
        onInspect={(po) => setLogTarget(po)}
        onViewClaim={(claim) => setClaimTarget(claim)}
      />

      {/* Log inspection sheet — controlled by the page so we can hand the
          PO context across without a per-row local state. */}
      {logTarget && (
        <LogInspectionDrawer
          open={!!logTarget}
          onOpenChange={(open) => {
            if (!open) setLogTarget(null);
          }}
          purchaseOrderId={logTarget.id}
          poLabel={logTargetMeta.primary}
          vendorName={logTargetVendor}
          projectName={logTargetMeta.secondary}
        />
      )}

      {/* Damage claim sheet. */}
      <DamageClaimDrawer
        open={!!claimTarget}
        onOpenChange={(open) => {
          if (!open) setClaimTarget(null);
        }}
        claim={claimTarget}
      />
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function ProcurementReceivingPage() {
  return (
    <Suspense fallback={<LoadingStrata />}>
      <ReceivingDashboardContent />
    </Suspense>
  );
}
