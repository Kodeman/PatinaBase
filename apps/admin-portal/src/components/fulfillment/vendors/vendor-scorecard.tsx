'use client';

import type { VendorScorecard } from '@patina/fulfillment';
import { EmptyState } from '@/components/portal';

// The 500-point-rubric feed (spec §7): median ack, on-time ship vs
// committed, damage rate, fill rate, exception rate by cause — trailing
// windowDays, n always shown so a thin sample reads honestly. n=0 is the
// current seed reality (S0-S2 seeds mostly stop before transmission/ack) —
// EmptyState, not a wall of "—"s masquerading as data.

export interface VendorScorecardPanelProps {
  scorecard: VendorScorecard;
  onExportCsv: () => void;
}

function pct(v: number | null): string {
  return v == null ? '—' : `${Math.round(v * 1000) / 10}%`;
}
function hours(v: number | null): string {
  return v == null ? '—' : `${v}h`;
}

export function VendorScorecardPanel({ scorecard, onExportCsv }: VendorScorecardPanelProps) {
  if (scorecard.n === 0) {
    return (
      <EmptyState
        label="Scorecard"
        message={`No purchase orders in the trailing ${scorecard.windowDays} days yet — the scorecard fills in as this vendor transmits and settles POs.`}
      />
    );
  }

  const stats: Array<{ key: string; label: string; value: string }> = [
    { key: 'ack', label: 'Median ack time', value: hours(scorecard.medianAckHours) },
    { key: 'ontime', label: 'On-time ship vs committed', value: pct(scorecard.onTimeShipRate) },
    { key: 'damage', label: 'Damage rate', value: pct(scorecard.damageRate) },
    { key: 'fill', label: 'Fill rate', value: pct(scorecard.fillRate) },
  ];

  return (
    <div data-testid="vendor-scorecard">
      <div className="flex items-center justify-between">
        <p className="type-meta-small uppercase tracking-wide text-[var(--text-subtle)]" data-testid="vendor-scorecard-n">
          n = {scorecard.n} · trailing {scorecard.windowDays} days
        </p>
        <button
          type="button"
          data-testid="vendor-scorecard-export"
          onClick={onExportCsv}
          className="text-[0.7rem] text-[var(--text-muted)] underline"
        >
          Export CSV
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.key} className="rounded border border-[var(--border-default)] p-3" data-testid={`vendor-scorecard-${s.key}`}>
            <div className="type-meta-small text-[var(--text-subtle)]">{s.label}</div>
            <div className="mt-1 font-mono text-[1.1rem]" style={{ color: 'var(--text-primary)' }}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {Object.keys(scorecard.exceptionRateByCause).length > 0 && (
        <div className="mt-4">
          <p className="type-meta-small uppercase tracking-wide text-[var(--text-subtle)]">Exception rate by cause</p>
          <ul className="mt-2 space-y-1">
            {Object.entries(scorecard.exceptionRateByCause).map(([cause, rate]) => (
              <li key={cause} className="flex items-baseline justify-between text-[0.78rem]">
                <span className="text-[var(--text-primary)]">{cause.replace(/_/g, ' ')}</span>
                <span className="font-mono text-[var(--text-muted)]">{pct(rate)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Manual CSV export (spec §7 "manual export button is fine in v1") — one row,
 *  no server round-trip needed since the scorecard is already client-side. */
export function scorecardToCsv(vendorName: string, scorecard: VendorScorecard): string {
  const header = ['vendor', 'window_days', 'n', 'median_ack_hours', 'on_time_ship_rate', 'damage_rate', 'fill_rate'];
  const row = [
    vendorName,
    String(scorecard.windowDays),
    String(scorecard.n),
    scorecard.medianAckHours == null ? '' : String(scorecard.medianAckHours),
    scorecard.onTimeShipRate == null ? '' : String(scorecard.onTimeShipRate),
    scorecard.damageRate == null ? '' : String(scorecard.damageRate),
    scorecard.fillRate == null ? '' : String(scorecard.fillRate),
  ];
  const causeHeader = Object.keys(scorecard.exceptionRateByCause);
  const causeRow = causeHeader.map((c) => String(scorecard.exceptionRateByCause[c]));
  return [
    [...header, ...causeHeader.map((c) => `cause:${c}`)].join(','),
    [...row, ...causeRow].join(','),
  ].join('\n');
}
