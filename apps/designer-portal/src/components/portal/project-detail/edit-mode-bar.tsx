'use client';

interface EditModeBarProps {
  onToggleClientView?: () => void;
  onSendUpdate?: () => void;
}

export function EditModeBar({ onToggleClientView, onSendUpdate }: EditModeBarProps) {
  return (
    <div
      className="flex items-center justify-between px-6 py-2"
      style={{
        background: 'rgba(196, 165, 123, 0.06)',
        borderBottom: '1px solid rgba(196, 165, 123, 0.15)',
      }}
    >
      <div className="flex items-center gap-2.5">
        <span
          className="inline-block h-[7px] w-[7px] rounded-full"
          style={{
            background: 'var(--color-clay)',
            animation: 'pulse-dot 2s ease-in-out infinite',
          }}
        />
        <span
          style={{
            fontFamily: 'var(--font-meta)',
            fontSize: '0.58rem',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--color-clay)',
          }}
        >
          Edit Mode
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span
          style={{
            fontFamily: 'var(--font-meta)',
            fontSize: '0.58rem',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--color-sage)',
          }}
        >
          Saved
        </span>
        <button
          onClick={onToggleClientView}
          className="rounded-[3px] border border-[var(--border-default)] bg-transparent px-3 py-1.5 text-[var(--text-primary)]"
          style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', fontWeight: 500 }}
        >
          Client View
        </button>
        <button
          onClick={onSendUpdate}
          className="rounded-[3px] px-3 py-1.5 text-white"
          style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', fontWeight: 500, background: 'var(--color-clay)' }}
        >
          Send Update
        </button>
      </div>
    </div>
  );
}
