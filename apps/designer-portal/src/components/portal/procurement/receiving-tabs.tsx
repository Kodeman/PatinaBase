'use client';

/**
 * ReceivingTabs — the 4-tab body of the Procurement → Receiving desktop
 * dashboard (PRD §9).
 *
 *   • Arriving           — POs with confirmed_eta in the next 7 days
 *                          and status in (in_production, shipped)
 *   • Pending Inspection — delivered POs without any receiving_inspections row
 *   • Damage Claims      — open damage_claims (drafted or vendor_notified)
 *   • Cleared            — receiving_inspections with outcome='clean'
 *                          inspected in the last 30 days
 *
 * The page composes all data dependencies and hands fully-resolved row
 * collections to this presentational component. Keeping the tabs purely
 * presentational simplifies the loading/error wiring on the page and keeps
 * row-level concerns (PaymentPill, time-left badge, etc.) co-located.
 */

import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  type DamageClaim,
  type DamageClaimState,
  type PurchaseOrder,
  type ReceivingInspection,
} from '@patina/supabase';
import {
  PaymentPill,
  type PaymentPillState,
} from '@/components/portal/procurement/payment-pill';

// ─── Tab key ────────────────────────────────────────────────────────────────

export type ReceivingTabKey =
  | 'arriving'
  | 'pending_inspection'
  | 'damage_claims'
  | 'cleared';

const TAB_ORDER: ReceivingTabKey[] = [
  'arriving',
  'pending_inspection',
  'damage_claims',
  'cleared',
];

const TAB_LABEL: Record<ReceivingTabKey, string> = {
  arriving: 'Arriving',
  pending_inspection: 'Pending Inspection',
  damage_claims: 'Damage Claims',
  cleared: 'Cleared',
};

// ─── Props ──────────────────────────────────────────────────────────────────

export interface ReceivingTabsProps {
  activeTab: ReceivingTabKey;
  onTabChange: (tab: ReceivingTabKey) => void;
  arriving: PurchaseOrder[];
  pendingInspection: PurchaseOrder[];
  damageClaims: DamageClaim[];
  cleared: ReceivingInspection[];
  onInspect: (po: PurchaseOrder) => void;
  onViewClaim: (claim: DamageClaim) => void;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function formatDollars(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

/**
 * Picks the most-actionable po_payments row to render in the row's
 * PaymentPill column. Mirrors the helper in by-status, but trimmed down for
 * this view (we don't need every state).
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
  const target =
    payments.find((p) => p.state === 'due') ??
    payments.find((p) => p.state === 'pending') ??
    payments[0];
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
      target.state === 'paid' ? target.paid_date : target.due_date,
    kind,
  };
}

/**
 * Builds the per-PO label shown in the row primary slot:
 *   "PO {vendor_po_number}" if set, else "Purchase Order" fallback.
 * The secondary slot is the project name.
 *
 * (When Wave 1.4 lands the cross-project items hook, this would surface item
 * names instead — same pattern as documented in by-status.)
 */
function describePO(po: PurchaseOrder): { primary: string; secondary: string } {
  const primary = po.vendor_po_number
    ? `PO ${po.vendor_po_number}`
    : (po.vendor?.name ?? 'Purchase Order');
  const secondary = po.project?.name ?? 'Unknown Project';
  return { primary, secondary };
}

const DAMAGE_STATE_ACCENT: Record<DamageClaimState, string> = {
  drafted: 'var(--color-terracotta)',
  vendor_notified: 'var(--color-golden-hour)',
  resolved: 'var(--color-sage)',
};

const DAMAGE_STATE_LABEL: Record<DamageClaimState, string> = {
  drafted: 'Drafted',
  vendor_notified: 'Vendor notified',
  resolved: 'Resolved',
};

function StatePill({ state }: { state: DamageClaimState }) {
  return (
    <span
      className="inline-flex items-center rounded-[3px] px-2 py-0.5"
      style={{
        background: `color-mix(in srgb, ${DAMAGE_STATE_ACCENT[state]} 14%, transparent)`,
        color: DAMAGE_STATE_ACCENT[state],
        fontFamily: 'var(--font-meta)',
        fontSize: '0.58rem',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        fontWeight: 600,
      }}
    >
      {DAMAGE_STATE_LABEL[state]}
    </span>
  );
}

// ─── Row components ─────────────────────────────────────────────────────────

function ArrivingRow({ po }: { po: PurchaseOrder }) {
  const { primary, secondary } = describePO(po);
  const payment = pickHeadlinePayment(po);

  return (
    <div
      className="grid items-center gap-3 border-b py-3 last:border-b-0"
      style={{
        gridTemplateColumns: '2fr 1.4fr 110px 1fr 130px',
        borderColor: 'var(--border-subtle, rgba(229,226,221,0.6))',
      }}
    >
      <div className="min-w-0">
        <div className="truncate text-[0.85rem] font-medium text-[var(--text-primary)]">
          {primary}
        </div>
        <div className="truncate text-[0.7rem] text-[var(--text-muted)]">
          {secondary}
        </div>
      </div>
      <div className="min-w-0">
        <div className="truncate text-[0.78rem] text-[var(--text-body,var(--text-primary))]">
          {po.vendor?.name ?? 'Unknown Vendor'}
        </div>
        <div
          className="truncate text-[0.62rem] text-[var(--text-muted)]"
          style={{ fontFamily: 'var(--font-meta)' }}
        >
          {po.status === 'shipped' ? 'In transit' : 'In production'}
        </div>
      </div>
      <div className="text-right">
        <div
          className="font-heading text-[0.82rem] text-[var(--text-primary)]"
          style={{ fontWeight: 500 }}
        >
          {formatDate(po.confirmed_eta)}
        </div>
        <div
          className="text-[0.62rem] text-[var(--text-muted)]"
          style={{ fontFamily: 'var(--font-meta)' }}
        >
          ETA
        </div>
      </div>
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
      <div className="flex justify-end">
        <Link
          href={`/portal/procurement/by-status?po=${po.id}`}
          className="inline-flex items-center rounded-md border bg-transparent px-2.5 py-1 text-[0.7rem] font-medium text-[var(--color-clay,#C4A57B)] transition-colors hover:bg-[color-mix(in_srgb,var(--color-clay,#C4A57B)_8%,transparent)]"
          style={{ borderColor: 'var(--border-default)' }}
        >
          Log on phone →
        </Link>
      </div>
    </div>
  );
}

function PendingInspectionRow({
  po,
  onInspect,
}: {
  po: PurchaseOrder;
  onInspect: (po: PurchaseOrder) => void;
}) {
  const { primary, secondary } = describePO(po);

  return (
    <div
      className="grid items-center gap-3 border-b py-3 last:border-b-0"
      style={{
        gridTemplateColumns: '2fr 1.4fr 110px 1fr 130px',
        borderColor: 'var(--border-subtle, rgba(229,226,221,0.6))',
      }}
    >
      <div className="min-w-0">
        <div className="truncate text-[0.85rem] font-medium text-[var(--text-primary)]">
          {primary}
        </div>
        <div className="truncate text-[0.7rem] text-[var(--text-muted)]">
          {secondary}
        </div>
      </div>
      <div className="min-w-0">
        <div className="truncate text-[0.78rem] text-[var(--text-body,var(--text-primary))]">
          {po.vendor?.name ?? 'Unknown Vendor'}
        </div>
        <div
          className="truncate text-[0.62rem] text-[var(--text-muted)]"
          style={{ fontFamily: 'var(--font-meta)' }}
        >
          Delivered · awaiting inspection
        </div>
      </div>
      <div className="text-right">
        <div
          className="font-heading text-[0.82rem] text-[var(--text-primary)]"
          style={{ fontWeight: 500 }}
        >
          {formatDate(po.confirmed_eta)}
        </div>
        <div
          className="text-[0.62rem] text-[var(--text-muted)]"
          style={{ fontFamily: 'var(--font-meta)' }}
        >
          Expected
        </div>
      </div>
      <div
        className="font-heading text-[0.82rem] text-[var(--text-primary)]"
        style={{ fontWeight: 500 }}
      >
        {formatDollars(po.total_cents)}
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => onInspect(po)}
          className="cursor-pointer rounded-md border-0 px-3 py-1 text-[0.7rem] font-medium text-white transition-colors hover:opacity-90"
          style={{ background: 'var(--color-clay,#C4A57B)' }}
        >
          Inspect now
        </button>
      </div>
    </div>
  );
}

function DamageClaimRow({
  claim,
  onView,
}: {
  claim: DamageClaim;
  onView: (claim: DamageClaim) => void;
}) {
  const insp = claim.inspection;
  const po = insp?.purchase_order;
  const vendor = po?.vendor?.name ?? 'Unknown vendor';
  // 80-char preview of the description, defaulting to the auto-draft header
  // if the description is empty.
  const description = (claim.description ?? '').trim();
  const preview =
    description.length === 0
      ? `${insp?.outcome === 'partial' ? 'Partial delivery' : 'Damage reported'} on ${vendor}`
      : description.length > 80
        ? `${description.slice(0, 80)}…`
        : description;
  const poNumber = po?.id ? po.id.slice(0, 8) : null;

  return (
    <div
      className="grid items-center gap-3 border-b py-3 last:border-b-0"
      style={{
        gridTemplateColumns: '2.4fr 110px 1.4fr 110px 110px',
        borderColor: 'var(--border-subtle, rgba(229,226,221,0.6))',
      }}
    >
      <div className="min-w-0">
        <div className="line-clamp-2 text-[0.82rem] text-[var(--text-primary)]">
          {preview}
        </div>
      </div>
      <div className="text-right">
        <div
          className="font-heading text-[0.78rem] text-[var(--text-primary)]"
          style={{ fontWeight: 500 }}
        >
          {formatDate(claim.created_at)}
        </div>
        <div
          className="text-[0.6rem] text-[var(--text-muted)]"
          style={{ fontFamily: 'var(--font-meta)' }}
        >
          Inspected
        </div>
      </div>
      <div className="min-w-0">
        <div className="truncate text-[0.78rem] text-[var(--text-primary)]">
          {vendor}
        </div>
        {poNumber && (
          <div
            className="truncate text-[0.6rem] text-[var(--text-muted)]"
            style={{ fontFamily: 'var(--font-meta)' }}
          >
            PO {poNumber}
          </div>
        )}
      </div>
      <div>
        <StatePill state={claim.state} />
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => onView(claim)}
          className="cursor-pointer rounded-md border bg-transparent px-3 py-1 text-[0.7rem] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover,rgba(0,0,0,0.04))]"
          style={{ borderColor: 'var(--border-default)' }}
        >
          View claim
        </button>
      </div>
    </div>
  );
}

function ClearedRow({ inspection }: { inspection: ReceivingInspection }) {
  const po = inspection.purchase_order;
  const vendor = po?.vendor?.name ?? 'Unknown vendor';
  const project = po?.project?.name ?? 'Unknown project';
  const poNumber = po?.id ? po.id.slice(0, 8) : null;

  return (
    <div
      className="grid items-center gap-3 border-b py-3 last:border-b-0"
      style={{
        gridTemplateColumns: '2fr 1.4fr 110px 1fr',
        borderColor: 'var(--border-subtle, rgba(229,226,221,0.6))',
      }}
    >
      <div className="min-w-0">
        <div className="truncate text-[0.85rem] font-medium text-[var(--text-primary)]">
          {poNumber ? `PO ${poNumber}` : 'Inspection'}
        </div>
        <div className="truncate text-[0.7rem] text-[var(--text-muted)]">
          {project}
        </div>
      </div>
      <div className="min-w-0">
        <div className="truncate text-[0.78rem] text-[var(--text-primary)]">
          {vendor}
        </div>
        {inspection.notes && (
          <div className="line-clamp-1 text-[0.65rem] text-[var(--text-muted)]">
            {inspection.notes}
          </div>
        )}
      </div>
      <div className="text-right">
        <div
          className="font-heading text-[0.82rem] text-[var(--text-primary)]"
          style={{ fontWeight: 500 }}
        >
          {formatDate(inspection.inspected_at)}
        </div>
        <div
          className="text-[0.62rem] text-[var(--text-muted)]"
          style={{ fontFamily: 'var(--font-meta)' }}
        >
          Cleared
        </div>
      </div>
      <div className="flex justify-end">
        <span
          className="inline-flex items-center rounded-[3px] px-2 py-0.5"
          style={{
            background: 'rgba(168,181,160,0.18)',
            color: 'var(--color-sage)',
            fontFamily: 'var(--font-meta)',
            fontSize: '0.58rem',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            fontWeight: 600,
          }}
        >
          Clean
        </span>
      </div>
    </div>
  );
}

// ─── Empty state helper ─────────────────────────────────────────────────────

function EmptyTabState({ title, body }: { title: string; body: string }) {
  return (
    <div className="px-4 py-10 text-center">
      <p className="text-[0.85rem] font-medium text-[var(--text-primary)]">
        {title}
      </p>
      <p className="mt-1 text-[0.75rem] text-[var(--text-muted)]">{body}</p>
    </div>
  );
}

// ─── Tab section header ─────────────────────────────────────────────────────

function TabContent({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <div
      className="rounded-md border"
      style={{
        borderColor: 'var(--border-default)',
        background: 'var(--bg-surface)',
      }}
    >
      <div
        className="flex items-center gap-3 border-b px-4 py-3"
        style={{ borderColor: 'var(--border-default)' }}
      >
        <span
          className="font-heading text-[1rem] text-[var(--text-primary)]"
          style={{ fontWeight: 500 }}
        >
          {title}
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
          · {count} {count === 1 ? 'row' : 'rows'}
        </span>
      </div>
      <div className="px-4">{children}</div>
    </div>
  );
}

// ─── Main ───────────────────────────────────────────────────────────────────

export function ReceivingTabs(props: ReceivingTabsProps) {
  const {
    activeTab,
    onTabChange,
    arriving,
    pendingInspection,
    damageClaims,
    cleared,
    onInspect,
    onViewClaim,
  } = props;

  const counts: Record<ReceivingTabKey, number> = {
    arriving: arriving.length,
    pending_inspection: pendingInspection.length,
    damage_claims: damageClaims.length,
    cleared: cleared.length,
  };

  return (
    <div>
      {/* Tab bar */}
      <div
        className="mb-4 flex flex-wrap items-center gap-1 border-b"
        style={{ borderColor: 'var(--border-default)' }}
        role="tablist"
        aria-label="Receiving tabs"
      >
        {TAB_ORDER.map((key) => {
          const isActive = activeTab === key;
          return (
            <button
              key={key}
              role="tab"
              aria-selected={isActive}
              type="button"
              onClick={() => onTabChange(key)}
              className="-mb-px cursor-pointer border-0 bg-transparent px-3 py-2 transition-colors"
              style={{
                borderBottom: `2px solid ${isActive ? 'var(--color-clay,#C4A57B)' : 'transparent'}`,
                color: isActive
                  ? 'var(--text-primary)'
                  : 'var(--text-muted)',
                fontSize: '0.85rem',
                fontWeight: isActive ? 500 : 400,
                fontFamily: 'var(--font-body)',
              }}
            >
              {TAB_LABEL[key]}
              <span
                className="ml-1.5"
                style={{
                  fontFamily: 'var(--font-meta)',
                  fontSize: '0.65rem',
                  color: isActive
                    ? 'var(--color-clay,#C4A57B)'
                    : 'var(--text-muted)',
                  fontWeight: 600,
                }}
              >
                {counts[key]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Active tab content */}
      {activeTab === 'arriving' && (
        <TabContent
          title="Arriving in the next 7 days"
          count={arriving.length}
        >
          {arriving.length === 0 ? (
            <EmptyTabState
              title="No incoming deliveries."
              body="POs in production or shipped with a confirmed ETA in the next 7 days will appear here."
            />
          ) : (
            arriving.map((po) => <ArrivingRow key={po.id} po={po} />)
          )}
        </TabContent>
      )}

      {activeTab === 'pending_inspection' && (
        <TabContent
          title="Delivered, awaiting inspection"
          count={pendingInspection.length}
        >
          {pendingInspection.length === 0 ? (
            <EmptyTabState
              title="Nothing to inspect."
              body="POs marked delivered without a logged inspection will show up here."
            />
          ) : (
            pendingInspection.map((po) => (
              <PendingInspectionRow key={po.id} po={po} onInspect={onInspect} />
            ))
          )}
        </TabContent>
      )}

      {activeTab === 'damage_claims' && (
        <TabContent
          title="Open damage claims"
          count={damageClaims.length}
        >
          {damageClaims.length === 0 ? (
            <EmptyTabState
              title="No open claims."
              body="Damage claims appear here while drafted or after the vendor is notified, and disappear once resolved."
            />
          ) : (
            damageClaims.map((claim) => (
              <DamageClaimRow
                key={claim.id}
                claim={claim}
                onView={onViewClaim}
              />
            ))
          )}
        </TabContent>
      )}

      {activeTab === 'cleared' && (
        <TabContent
          title="Cleared in the last 30 days"
          count={cleared.length}
        >
          {cleared.length === 0 ? (
            <EmptyTabState
              title="No clean inspections yet."
              body="Successful receiving inspections from the last 30 days will appear here."
            />
          ) : (
            cleared.map((insp) => (
              <ClearedRow key={insp.id} inspection={insp} />
            ))
          )}
        </TabContent>
      )}
    </div>
  );
}

export default ReceivingTabs;
