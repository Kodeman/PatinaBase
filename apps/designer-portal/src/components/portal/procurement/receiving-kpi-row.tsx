'use client';

/**
 * ReceivingKpiRow — the 4-KPI header for the Procurement → Receiving dashboard.
 *
 * Per PRD §9 the desktop dashboard opens with four counters:
 *   1. "Arriving this week"   — from useTodayProcurementCounts().arrivingThisWeek
 *   2. "Pending inspection"   — from useTodayProcurementCounts().inspectionsPending
 *   3. "Damage claims open"   — from useTodayProcurementCounts().damageClaimsOpen
 *   4. "Inspection pass rate" — derived locally from a 30-day window of
 *                               receiving_inspections (clean / total).
 *
 * The component takes pre-resolved numbers as props so the parent page can
 * own the data layer (useTodayProcurementCounts + useReceivingInspections).
 * That makes loading / error handling explicit at the page level instead of
 * smearing it across four tiles.
 */

import type { ReactNode } from 'react';

export interface ReceivingKpiRowProps {
  arrivingThisWeek: number | null;
  inspectionsPending: number | null;
  damageClaimsOpen: number | null;
  /** Pass rate as a percentage 0–100. null means "no inspections in window". */
  inspectionPassRatePct: number | null;
  /** Total inspections counted in the pass-rate window (for the meta line). */
  inspectionPassRateSampleSize: number;
  /** Renders the whole row in a muted "loading" treatment when true. */
  isLoading?: boolean;
}

interface TileProps {
  label: string;
  value: ReactNode;
  meta?: string;
  /** Optional accent color (CSS variable string). */
  accent?: string;
  isLoading?: boolean;
}

function KpiTile({ label, value, meta, accent, isLoading }: TileProps) {
  return (
    <div
      className="flex flex-col rounded-md border px-4 py-3"
      style={{
        borderColor: 'var(--border-default)',
        background: 'var(--bg-surface)',
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-meta)',
          fontSize: '0.6rem',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: accent ?? 'var(--text-muted)',
        }}
      >
        {label}
      </span>
      <span
        className="font-heading"
        style={{
          fontSize: '1.6rem',
          fontWeight: 500,
          color: isLoading ? 'var(--text-muted)' : 'var(--text-primary)',
          lineHeight: 1.15,
          marginTop: '0.15rem',
        }}
      >
        {isLoading ? '—' : value}
      </span>
      {meta && (
        <span
          className="mt-0.5 truncate text-[0.65rem] text-[var(--text-muted)]"
          style={{ fontFamily: 'var(--font-body)' }}
        >
          {meta}
        </span>
      )}
    </div>
  );
}

export function ReceivingKpiRow(props: ReceivingKpiRowProps) {
  const {
    arrivingThisWeek,
    inspectionsPending,
    damageClaimsOpen,
    inspectionPassRatePct,
    inspectionPassRateSampleSize,
    isLoading,
  } = props;

  const passRateText =
    inspectionPassRatePct == null ? '—' : `${inspectionPassRatePct.toFixed(1)}%`;
  const passRateMeta =
    inspectionPassRateSampleSize === 0
      ? 'Last 30 days · no inspections'
      : `Last 30 days · ${inspectionPassRateSampleSize} inspection${
          inspectionPassRateSampleSize === 1 ? '' : 's'
        }`;

  return (
    <div
      className="mb-6 grid gap-3"
      style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}
    >
      <KpiTile
        label="Arriving this week"
        value={arrivingThisWeek ?? 0}
        meta="Next 7 days · in production or shipped"
        isLoading={isLoading}
      />
      <KpiTile
        label="Pending inspection"
        value={inspectionsPending ?? 0}
        meta="Delivered, awaiting log"
        accent="var(--color-golden-hour)"
        isLoading={isLoading}
      />
      <KpiTile
        label="Damage claims open"
        value={damageClaimsOpen ?? 0}
        meta="Drafted or vendor-notified"
        accent={(damageClaimsOpen ?? 0) > 0 ? 'var(--color-terracotta)' : undefined}
        isLoading={isLoading}
      />
      <KpiTile
        label="Inspection pass rate"
        value={passRateText}
        meta={passRateMeta}
        accent="var(--color-sage)"
        isLoading={isLoading}
      />
    </div>
  );
}

export default ReceivingKpiRow;
