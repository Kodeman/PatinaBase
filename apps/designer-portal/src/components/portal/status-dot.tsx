'use client';

import { getStatusColor, getStatusLabel, type ProjectStatusVariant } from '@/lib/project-status';

interface StatusDotProps {
  variant: ProjectStatusVariant;
  size?: 'sm' | 'md';
  withLabel?: boolean;
}

export function StatusDot({ variant, size = 'md', withLabel = false }: StatusDotProps) {
  const dim = size === 'sm' ? '8px' : '10px';
  const dot = (
    <span
      className="inline-block shrink-0 rounded-full"
      style={{ width: dim, height: dim, backgroundColor: getStatusColor(variant) }}
      aria-label={getStatusLabel(variant)}
    />
  );

  if (!withLabel) return dot;

  return (
    <span className="inline-flex items-center gap-1.5">
      {dot}
      <span className="type-meta-small text-[var(--text-muted)]">{getStatusLabel(variant)}</span>
    </span>
  );
}
