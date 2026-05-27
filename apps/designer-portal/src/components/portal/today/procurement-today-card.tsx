'use client';

import Link from 'next/link';
import { useTodayProcurementCounts } from '@patina/supabase';

/**
 * Today Dashboard "Procurement" card (Sprint 2 W2.3 CB3).
 *
 * Visual rhythm mirrors the in-project FFESummaryTile (rounded border, 3 KPI
 * tiles in a row, primary CTA in a divider footer). Each KPI is clickable and
 * deep-links into the procurement workspace.
 *
 * PRD ref: patina-procurement-workspace-v1 §3 (Today Dashboard card), §12
 * Phase 2.
 */

interface KpiTileProps {
  label: string;
  value: number;
  href: string;
}

function KpiTile({ label, value, href }: KpiTileProps) {
  return (
    <Link
      href={href}
      className="block min-w-0 rounded-[3px] no-underline transition-colors hover:bg-[var(--bg-hover)]"
      style={{
        padding: '0.5rem 0.25rem',
        margin: '-0.5rem -0.25rem',
      }}
    >
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
        }}
      >
        {value}
      </div>
    </Link>
  );
}

export function ProcurementTodayCard() {
  const { data, isLoading } = useTodayProcurementCounts();

  // ── Loading state ──────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div
        className="rounded-[3px] border p-5"
        style={{ borderColor: 'var(--border-default)' }}
      >
        <div className="mb-4 flex items-baseline justify-between">
          <h3 className="type-section-head" style={{ fontSize: '1.15rem' }}>
            Procurement
          </h3>
        </div>
        <div className="grid grid-cols-3 gap-6">
          {[0, 1, 2].map((i) => (
            <div key={i} className="min-w-0 animate-pulse">
              <div className="mb-2 h-2 w-20 rounded bg-[var(--surface-subtle)]" />
              <div className="h-5 w-10 rounded bg-[var(--surface-subtle)]" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const arrivingThisWeek = data?.arrivingThisWeek ?? 0;
  const inspectionsPending = data?.inspectionsPending ?? 0;
  const damageClaimsOpen = data?.damageClaimsOpen ?? 0;
  const allZero =
    arrivingThisWeek === 0 && inspectionsPending === 0 && damageClaimsOpen === 0;

  // ── Empty state (no activity this week) ────────────────────────────────────
  if (allZero) {
    return (
      <div
        className="rounded-[3px] border p-5"
        style={{ borderColor: 'var(--border-default)' }}
      >
        <div className="mb-3 flex items-baseline justify-between">
          <h3 className="type-section-head" style={{ fontSize: '1.15rem' }}>
            Procurement
          </h3>
        </div>
        <p
          className="type-body-small"
          style={{ color: 'var(--text-muted)' }}
        >
          No procurement activity this week.
        </p>
        <div
          className="mt-4 border-t pt-3"
          style={{ borderColor: 'var(--border-default)' }}
        >
          <Link
            href="/portal/procurement/by-vendor"
            className="type-meta-small text-[var(--text-muted)] no-underline hover:text-[var(--text-primary)]"
            style={{ letterSpacing: '0.04em' }}
          >
            View workspace &rarr;
          </Link>
        </div>
      </div>
    );
  }

  // ── Populated state ────────────────────────────────────────────────────────
  return (
    <div
      className="rounded-[3px] border p-5"
      style={{ borderColor: 'var(--border-default)' }}
    >
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <h3 className="type-section-head" style={{ fontSize: '1.15rem' }}>
          Procurement
        </h3>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <KpiTile
          label="Arriving this week"
          value={arrivingThisWeek}
          href="/portal/procurement/calendar"
        />
        <KpiTile
          label="Inspections to do"
          value={inspectionsPending}
          href="/portal/procurement/receiving?tab=pending"
        />
        <KpiTile
          label="Damage claims open"
          value={damageClaimsOpen}
          href="/portal/procurement/receiving?tab=damage"
        />
      </div>

      <div
        className="mt-5 flex flex-wrap items-center gap-3 border-t pt-4"
        style={{ borderColor: 'var(--border-default)' }}
      >
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
          View workspace &rarr;
        </Link>
      </div>
    </div>
  );
}
