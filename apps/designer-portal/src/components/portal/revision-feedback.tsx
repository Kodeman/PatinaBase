'use client';

interface RevisionFeedbackProps {
  feedback: string;
  clientName: string;
  date: string;
}

export function RevisionFeedback({ feedback, clientName, date }: RevisionFeedbackProps) {
  const formattedDate = new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });

  return (
    <div
      className="rounded-md border p-5"
      style={{
        background: 'rgba(232,197,71,0.04)',
        borderColor: 'rgba(232,197,71,0.2)',
      }}
    >
      <div
        className="mb-2"
        style={{
          fontFamily: 'var(--font-meta)',
          fontSize: '0.62rem',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: '#E8C547',
        }}
      >
        Client Feedback &mdash; {formattedDate}
      </div>
      <p
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: '0.88rem',
          color: 'var(--text-body)',
          lineHeight: 1.6,
          fontStyle: 'italic',
        }}
      >
        &ldquo;{feedback}&rdquo;
      </p>
      <div
        className="mt-2"
        style={{
          fontFamily: 'var(--font-meta)',
          fontSize: '0.55rem',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--text-muted)',
        }}
      >
        &mdash; {clientName}
      </div>
    </div>
  );
}
