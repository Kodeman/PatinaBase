'use client';

interface InsightPanelProps {
  title?: string;
  children: React.ReactNode;
}

export function InsightPanel({ title = 'Insight', children }: InsightPanelProps) {
  return (
    <div
      className="rounded-md border p-4"
      style={{
        background: 'rgba(196,165,123,0.04)',
        borderColor: 'rgba(196,165,123,0.15)',
      }}
    >
      <p
        className="mb-0.5"
        style={{
          fontFamily: 'var(--font-meta)',
          fontSize: '0.62rem',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--accent-primary)',
        }}
      >
        {title}
      </p>
      <div
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: '0.82rem',
          color: 'var(--text-body)',
        }}
      >
        {children}
      </div>
    </div>
  );
}
