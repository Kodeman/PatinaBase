'use client';

interface StyleTagProps {
  label: string;
  active?: boolean;
  variant?: 'default' | 'avoidance';
  onClick?: () => void;
}

export function StyleTag({ label, active = false, variant = 'default', onClick }: StyleTagProps) {
  const baseClass =
    'inline-block rounded-sm px-3.5 py-1.5 font-body text-[0.78rem] font-medium whitespace-nowrap transition-colors';

  const variantClass =
    variant === 'avoidance'
      ? 'border border-[var(--color-terracotta)] text-[var(--color-terracotta)]' +
        (active ? ' bg-[rgba(199,123,110,0.06)]' : ' bg-[var(--bg-surface)]')
      : active
        ? 'border border-[var(--accent-primary)] bg-[var(--bg-surface)] text-[var(--text-primary)]'
        : 'border border-[var(--color-pearl)] bg-[var(--color-off-white)] text-[var(--text-body)]';

  return (
    <span
      className={`${baseClass} ${variantClass} ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
    >
      {label}
    </span>
  );
}
