'use client';

interface MessageBubbleProps {
  direction: 'in' | 'out';
  message: string;
  timestamp: string;
  senderName?: string;
  children?: React.ReactNode;
}

export function MessageBubble({
  direction,
  message,
  timestamp,
  senderName,
  children,
}: MessageBubbleProps) {
  const isOut = direction === 'out';

  return (
    <div className={`mb-2.5 flex flex-col ${isOut ? 'items-end' : 'items-start'}`}>
      <div
        className="max-w-[75%] px-4 py-3"
        style={{
          background: isOut ? 'var(--color-charcoal)' : 'var(--color-pearl)',
          color: isOut ? 'var(--color-off-white)' : 'var(--text-primary)',
          borderRadius: isOut ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
        }}
      >
        {!isOut && senderName && (
          <div
            className="mb-1"
            style={{
              fontFamily: 'var(--font-meta)',
              fontSize: '0.52rem',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              color: 'var(--text-muted)',
            }}
          >
            {senderName}
          </div>
        )}
        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.85rem',
            lineHeight: 1.55,
            margin: 0,
          }}
        >
          {message}
        </p>
      </div>
      <div
        className="mt-1"
        style={{
          fontFamily: 'var(--font-meta)',
          fontSize: '0.5rem',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          color: isOut ? 'var(--text-muted)' : 'var(--text-muted)',
        }}
      >
        {timestamp}
      </div>
      {children}
    </div>
  );
}
