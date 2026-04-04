import type { MockTimeTracking } from '@/types/project-ui';
import { PHASE_CONFIG, type ProjectPhase } from '@/types/project-ui';
import { ProgressBar } from '@/components/portal/progress-bar';

interface TimeTrackingPanelProps {
  tracking: MockTimeTracking;
  designFee: number;
}

export function TimeTrackingPanel({ tracking, designFee }: TimeTrackingPanelProps) {
  const effectiveRate = tracking.totalSpent > 0
    ? (designFee / 100) / tracking.totalSpent
    : 0;

  return (
    <div>
      <h3
        style={{
          fontFamily: 'var(--font-heading)',
          fontWeight: 500,
          fontSize: '1.25rem',
          lineHeight: 1.35,
          marginBottom: '0.25rem',
        }}
      >
        Time Tracking
      </h3>
      <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
        Hours logged by phase
      </div>

      {tracking.entries.map((entry) => {
        const config = PHASE_CONFIG[entry.phase as ProjectPhase];
        const pct = entry.hoursEstimated > 0 ? (entry.hoursSpent / entry.hoursEstimated) * 100 : 100;
        const isComplete = entry.hoursSpent >= entry.hoursEstimated;

        return (
          <div
            key={entry.phase}
            className="grid items-center gap-3 py-1"
            style={{ gridTemplateColumns: '140px 1fr auto' }}
          >
            <div
              style={{
                fontFamily: 'var(--font-meta)',
                fontSize: '0.62rem',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: 'var(--text-muted)',
              }}
            >
              {config?.shortLabel ?? entry.phase}
            </div>
            <div style={{ marginTop: '0.3rem' }}>
              <ProgressBar progress={Math.min(100, pct)} />
            </div>
            <div
              style={{
                fontFamily: 'var(--font-meta)',
                fontSize: '0.55rem',
                color: isComplete ? 'var(--text-muted)' : 'var(--color-clay)',
                minWidth: '40px',
                textAlign: 'right',
              }}
            >
              {entry.hoursSpent}h
            </div>
          </div>
        );
      })}

      <div className="mt-2 flex items-baseline justify-between">
        <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', fontWeight: 500 }}>
          Total: {tracking.totalSpent}h
        </span>
        <span
          style={{
            fontFamily: 'var(--font-meta)',
            fontSize: '0.58rem',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--text-muted)',
          }}
        >
          of {tracking.totalEstimated}h estimated · ${effectiveRate.toFixed(2)}/hr effective
        </span>
      </div>
    </div>
  );
}
