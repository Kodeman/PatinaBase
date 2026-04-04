'use client';

interface ProposalLetterheadProps {
  clientName: string | null;
  date: string;
}

export function ProposalLetterhead({ clientName, date }: ProposalLetterheadProps) {
  const formattedDate = new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="mb-10 flex items-start justify-between border-b border-[var(--border-subtle)] pb-8">
      <div>
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 500,
            fontSize: '0.85rem',
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            color: 'var(--text-primary)',
            marginBottom: '0.5rem',
          }}
        >
          Patina
        </div>
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontStyle: 'italic',
            fontSize: '0.72rem',
            color: 'var(--accent-primary)',
          }}
        >
          Where Time Adds Value
        </div>
      </div>
      <div className="text-right">
        {clientName && (
          <>
            <div className="type-meta-small mb-0.5">Prepared for</div>
            <div className="type-label" style={{ fontSize: '0.88rem' }}>
              {clientName}
            </div>
          </>
        )}
        <div className="type-meta-small mt-2">{formattedDate}</div>
      </div>
    </div>
  );
}
