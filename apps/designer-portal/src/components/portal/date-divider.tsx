'use client';

interface DateDividerProps {
  date: string;
}

export function DateDivider({ date }: DateDividerProps) {
  return (
    <div className="my-4 text-center">
      <span
        className="inline-block px-3"
        style={{
          fontFamily: 'var(--font-meta)',
          fontSize: '0.52rem',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          color: 'var(--text-muted)',
          background: 'var(--bg-primary)',
        }}
      >
        {date}
      </span>
    </div>
  );
}
