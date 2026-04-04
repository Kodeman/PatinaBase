'use client';

interface Phase {
  dateRange: string;
  name: string;
}

interface TimelinePhasesProps {
  phases: Phase[];
}

export function TimelinePhases({ phases }: TimelinePhasesProps) {
  return (
    <div>
      {phases.map((phase, i) => (
        <div
          key={i}
          className={`grid gap-4 py-2 ${i < phases.length - 1 ? 'border-b border-[rgba(229,226,221,0.3)]' : ''}`}
          style={{ gridTemplateColumns: '140px 1fr' }}
        >
          <div
            style={{
              fontFamily: 'var(--font-meta)',
              fontSize: '0.62rem',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              color: 'var(--text-muted)',
              paddingTop: '0.15rem',
            }}
          >
            {phase.dateRange}
          </div>
          <div
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.88rem',
              color: 'var(--text-primary)',
            }}
          >
            {phase.name}
          </div>
        </div>
      ))}
    </div>
  );
}
