'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { usePurchaseOrders, type PurchaseOrder, type POPayment } from '@patina/supabase';
import { useProjectFFEItems } from '@/hooks/use-projects';

interface FFESummaryTileProps {
  projectId: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDollars(cents: number): string {
  const dollars = cents / 100;
  if (dollars >= 1000) return `$${(dollars / 1000).toFixed(1)}k`;
  return `$${dollars.toLocaleString()}`;
}

// FF&E status buckets per brief: "In motion" (approved+ordered),
// "In production" (production+shipped), "Landed" (delivered+installed).
type StatusBucket = 'inMotion' | 'inProduction' | 'landed' | 'other';

function bucketForStatus(status: unknown): StatusBucket {
  switch (status) {
    case 'approved':
    case 'ordered':
      return 'inMotion';
    case 'production':
    case 'shipped':
      return 'inProduction';
    case 'delivered':
    case 'installed':
      return 'landed';
    default:
      return 'other';
  }
}

// ── KPI Tile (matches sibling project-detail visual rhythm) ──────────────────

interface KpiProps {
  label: string;
  value: string;
  subtitle?: string;
  subtitleColor?: string;
}

function Kpi({ label, value, subtitle, subtitleColor = 'var(--text-muted)' }: KpiProps) {
  return (
    <div className="min-w-0">
      <div
        style={{
          fontFamily: 'var(--font-meta)',
          fontSize: '0.58rem',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--text-muted)',
          marginBottom: '0.25rem',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: 'var(--font-heading)',
          fontSize: '1.4rem',
          fontWeight: 700,
          color: 'var(--text-primary)',
          lineHeight: 1,
          marginBottom: '0.15rem',
        }}
      >
        {value}
      </div>
      {subtitle && (
        <div
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.68rem',
            color: subtitleColor,
          }}
        >
          {subtitle}
        </div>
      )}
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export function FFESummaryTile({ projectId }: FFESummaryTileProps) {
  const { data: ffeItems, isLoading: ffeLoading } = useProjectFFEItems(projectId);
  const { data: orders, isLoading: ordersLoading } = usePurchaseOrders({ projectId });

  const isLoading = ffeLoading || ordersLoading;

  const summary = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items = (Array.isArray(ffeItems) ? ffeItems : []) as Array<{ status?: unknown }>;
    const pos = (Array.isArray(orders) ? orders : []) as PurchaseOrder[];

    const totalItems = items.length;

    const counts: Record<StatusBucket, number> = {
      inMotion: 0,
      inProduction: 0,
      landed: 0,
      other: 0,
    };
    for (const item of items) {
      counts[bucketForStatus(item.status)] += 1;
    }

    // Items sitting in "approved" are orderable but not yet on a PO — the
    // primary purchasing CTA targets exactly these.
    const approvedCount = items.filter((item) => item.status === 'approved').length;

    const poCount = pos.length;
    const committedCents = pos.reduce((sum, po) => sum + (po.total_cents ?? 0), 0);

    // Outstanding deposits + balances: po_payments where state='due'
    let dueCount = 0;
    let dueCents = 0;
    for (const po of pos) {
      const payments: POPayment[] = po.payments ?? [];
      for (const p of payments) {
        if (p.state === 'due') {
          dueCount += 1;
          dueCents += p.amount_cents ?? 0;
        }
      }
    }

    return {
      totalItems,
      counts,
      approvedCount,
      poCount,
      committedCents,
      dueCount,
      dueCents,
    };
  }, [ffeItems, orders]);

  // ── Loading state ──────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="my-8">
        <div
          className="rounded-[3px] border p-5"
          style={{ borderColor: 'var(--border-default)' }}
        >
          <div className="mb-4 flex items-baseline justify-between">
            <h3 className="type-section-head" style={{ fontSize: '1.15rem' }}>
              Procurement
            </h3>
          </div>
          <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="min-w-0 animate-pulse">
                <div className="mb-2 h-2 w-12 rounded bg-[var(--surface-subtle)]" />
                <div className="mb-1 h-5 w-16 rounded bg-[var(--surface-subtle)]" />
                <div className="h-2 w-20 rounded bg-[var(--surface-subtle)]" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Empty state (no FFE items yet) ─────────────────────────────────────────
  if (summary.totalItems === 0) {
    return (
      <div className="my-8">
        <div
          className="rounded-[3px] border p-5"
          style={{ borderColor: 'var(--border-default)' }}
        >
          <div className="mb-4 flex items-baseline justify-between">
            <h3 className="type-section-head" style={{ fontSize: '1.15rem' }}>
              Procurement
            </h3>
          </div>
          <div
            className="rounded-md border-2 border-dashed py-8 text-center"
            style={{ borderColor: 'var(--border-default)' }}
          >
            <p className="type-body text-[0.85rem] text-[var(--text-muted)]">
              No items specified yet.
            </p>
            <Link
              href={`/portal/projects/${projectId}/ffe`}
              className="type-meta-small mt-3 inline-block text-[var(--accent-primary)] no-underline"
              style={{ letterSpacing: '0.04em' }}
            >
              Add FF&amp;E items &rarr;
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Populated state ────────────────────────────────────────────────────────
  const inMotion = summary.counts.inMotion;
  const inProduction = summary.counts.inProduction;
  const landed = summary.counts.landed;

  return (
    <div className="my-8">
      <div
        className="rounded-[3px] border p-5"
        style={{ borderColor: 'var(--border-default)' }}
      >
        <div className="mb-4 flex items-baseline justify-between gap-4">
          <div>
            <h3 className="type-section-head" style={{ fontSize: '1.15rem' }}>
              Procurement
            </h3>
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '0.78rem',
                color: 'var(--text-muted)',
                marginTop: '0.15rem',
              }}
            >
              {summary.totalItems} FF&amp;E item{summary.totalItems === 1 ? '' : 's'}
              {' · '}
              {inProduction} in production · {landed} landed
            </p>
          </div>
        </div>

        {/* 4 KPI tiles */}
        <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
          <Kpi
            label="In motion"
            value={`${inMotion}`}
            subtitle="Approved or ordered"
          />
          <Kpi
            label="POs active"
            value={`${summary.poCount}`}
            subtitle={summary.poCount === 1 ? 'purchase order' : 'purchase orders'}
          />
          <Kpi
            label="Balance due"
            value={summary.dueCents > 0 ? formatDollars(summary.dueCents) : '$0'}
            subtitle={
              summary.dueCount > 0
                ? `${summary.dueCount} payment${summary.dueCount === 1 ? '' : 's'} due`
                : 'Nothing due now'
            }
            subtitleColor={
              summary.dueCount > 0 ? 'var(--color-terracotta)' : 'var(--color-sage)'
            }
          />
          <Kpi
            label="Committed"
            value={summary.committedCents > 0 ? formatDollars(summary.committedCents) : '—'}
            subtitle="Total PO value"
          />
        </div>

        {/* Primary CTA */}
        <div className="mt-5 flex flex-wrap items-center gap-3 border-t pt-4" style={{ borderColor: 'var(--border-default)' }}>
          {summary.approvedCount > 0 && (
            <Link
              href={`/portal/projects/${projectId}/ffe?focus=approved`}
              className="rounded-[3px] px-3 py-1.5 text-white no-underline"
              style={{
                background: 'var(--text-primary)',
                fontFamily: 'var(--font-body)',
                fontSize: '0.78rem',
                fontWeight: 600,
              }}
            >
              Order {summary.approvedCount} approved item{summary.approvedCount === 1 ? '' : 's'} &rarr;
            </Link>
          )}
          <Link
            href="/portal/procurement/by-vendor"
            className="rounded-[3px] border px-3 py-1.5 text-[var(--text-primary)] no-underline"
            style={{
              borderColor: 'var(--border-default)',
              fontFamily: 'var(--font-body)',
              fontSize: '0.78rem',
              fontWeight: 500,
            }}
          >
            View in Procurement Workspace &rarr;
          </Link>
          <Link
            href={`/portal/projects/${projectId}/ffe`}
            className="text-[0.72rem] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            style={{ fontFamily: 'var(--font-body)' }}
          >
            Open this project&apos;s FF&amp;E board
          </Link>
        </div>
      </div>
    </div>
  );
}
