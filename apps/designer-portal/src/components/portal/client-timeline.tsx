'use client';

interface TimelineEntry {
  id: string;
  label: string;
  date: string;
  status: 'done' | 'active' | 'future';
}

interface ClientTimelineProps {
  entries: TimelineEntry[];
}

export function ClientTimeline({ entries }: ClientTimelineProps) {
  if (entries.length === 0) {
    return (
      <p className="type-body py-4 italic text-[var(--text-muted)]">
        No timeline entries yet.
      </p>
    );
  }

  return (
    <div className="relative pl-8">
      {/* Vertical line */}
      <div
        className="absolute left-[5px] top-[10px]"
        style={{
          width: '2px',
          bottom: '10px',
          background: 'var(--color-pearl)',
          borderRadius: '1px',
        }}
      />

      {entries.map((entry) => (
        <div key={entry.id} className="relative py-2.5">
          {/* Dot */}
          <div
            className="absolute rounded-full"
            style={{
              left: '-2rem',
              top: '0.8rem',
              width: '12px',
              height: '12px',
              border: `2.5px solid ${
                entry.status === 'done'
                  ? 'var(--color-sage)'
                  : entry.status === 'active'
                    ? 'var(--accent-primary)'
                    : 'var(--color-pearl)'
              }`,
              background:
                entry.status === 'done'
                  ? 'var(--color-sage)'
                  : entry.status === 'active'
                    ? 'var(--accent-primary)'
                    : 'var(--bg-surface)',
            }}
          />

          {/* Content */}
          <div
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.88rem',
              fontWeight: entry.status === 'active' ? 500 : 400,
              color:
                entry.status === 'done'
                  ? 'var(--text-muted)'
                  : entry.status === 'active'
                    ? 'var(--text-primary)'
                    : 'var(--color-pearl)',
            }}
          >
            {entry.label}
          </div>
          <div
            style={{
              fontFamily: 'var(--font-meta)',
              fontSize: '0.55rem',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              color: 'var(--text-muted)',
              marginTop: '0.1rem',
            }}
          >
            {entry.date}
          </div>
        </div>
      ))}
    </div>
  );
}
