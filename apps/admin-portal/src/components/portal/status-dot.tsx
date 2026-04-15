import type { CSSProperties } from 'react';

export type StatusVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'accent';

interface StatusDotProps {
  variant?: StatusVariant;
  label?: string;
  /** Override the dot color directly */
  color?: string;
  className?: string;
  size?: 'sm' | 'md';
}

const variantColor: Record<StatusVariant, string> = {
  success: 'var(--color-success)',
  warning: 'var(--color-warning)',
  error: 'var(--color-error)',
  info: 'var(--color-info)',
  neutral: 'var(--text-muted)',
  accent: 'var(--accent-primary)',
};

export function StatusDot({
  variant = 'neutral',
  label,
  color,
  className,
  size = 'md',
}: StatusDotProps) {
  const dotStyle: CSSProperties = {
    backgroundColor: color ?? variantColor[variant],
  };
  const dotSize = size === 'sm' ? 'h-1.5 w-1.5' : 'h-2 w-2';

  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ''}`}>
      <span className={`inline-block rounded-full ${dotSize}`} style={dotStyle} />
      {label && <span className="type-meta-small">{label}</span>}
    </span>
  );
}
