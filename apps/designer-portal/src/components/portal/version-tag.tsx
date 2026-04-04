'use client';

interface VersionTagProps {
  version: number;
  label?: string; // e.g. "current draft", "sent Mar 12"
  active?: boolean;
  onClick?: () => void;
}

export function VersionTag({ version, label, active = false, onClick }: VersionTagProps) {
  return (
    <span
      className={`inline-flex cursor-default whitespace-nowrap rounded-sm border px-2.5 py-1 transition-colors ${
        active
          ? 'border-[var(--accent-primary)] text-[var(--text-primary)]'
          : 'border-[var(--color-pearl)] text-[var(--text-primary)] hover:border-[var(--accent-primary)]'
      } ${onClick ? 'cursor-pointer' : ''}`}
      style={{
        fontFamily: 'var(--font-body)',
        fontSize: '0.72rem',
        fontWeight: 500,
      }}
      onClick={onClick}
    >
      v{version}.0{label ? ` (${label})` : ''}
    </span>
  );
}
