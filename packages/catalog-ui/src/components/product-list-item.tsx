'use client';

import { useState, type ReactNode } from 'react';
import type { ProductTier } from '@patina/types';

export interface ProductListItemProps {
  id: string;
  name: string;
  maker?: string;
  tier?: ProductTier;
  thumbUrl?: string;
  price: number;
  aiScore?: number;
  status?: string;
  onTeach?: (id: string) => void;
  onEdit?: (id: string) => void;
  onClick?: (id: string) => void;
  /** Optional leading slot (e.g. admin bulk-select checkbox). */
  leadingSlot?: ReactNode;
  /** Replaces the default action buttons if provided. */
  actionsSlot?: ReactNode;
}

const tierLabels: Record<string, string> = {
  maker_piece: '★ Maker Piece',
  designers_pick: "✓ Designer's Pick",
  sourced: '○ Sourced',
};

export function ProductListItem({
  id,
  name,
  maker,
  tier,
  thumbUrl,
  price,
  aiScore,
  status,
  onTeach,
  onEdit,
  onClick,
  leadingSlot,
  actionsSlot,
}: ProductListItemProps) {
  const [, setIsHovered] = useState(false);
  const needsTeaching = aiScore !== undefined && aiScore < 50;

  const scoreColor =
    aiScore === undefined
      ? 'text-[var(--color-terracotta)]'
      : aiScore < 50
        ? 'text-[var(--color-golden-hour)]'
        : 'text-[var(--accent-primary)]';

  const gridColumns = leadingSlot ? '32px 80px 1fr 100px 80px 100px' : '80px 1fr 100px 80px 100px';

  return (
    <div
      className="grid cursor-pointer items-center gap-4 border-b border-[var(--border-subtle)] py-3.5 transition-colors hover:bg-[var(--bg-hover)]"
      style={{
        gridTemplateColumns: gridColumns,
        transitionDuration: 'var(--duration-fast)',
      }}
      onClick={() => onClick?.(id)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {leadingSlot && (
        <div className="flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
          {leadingSlot}
        </div>
      )}

      {/* Thumbnail */}
      <div className="flex h-[60px] w-[80px] items-center justify-center rounded bg-[var(--color-pearl)]">
        {thumbUrl ? (
          <img src={thumbUrl} alt={name} className="h-full w-full rounded object-cover" />
        ) : (
          <span className="type-meta-small">IMG</span>
        )}
      </div>

      {/* Info */}
      <div className="min-w-0">
        <div className="font-body text-[0.88rem] font-medium text-[var(--text-primary)]">{name}</div>
        <div className="mt-0.5 font-body text-[0.75rem] text-[var(--text-muted)]">
          {[maker, tier ? tierLabels[tier] : undefined].filter(Boolean).join(' · ')}
        </div>
      </div>

      {/* Price */}
      <div className="text-right font-heading text-[0.95rem] font-semibold text-[var(--text-primary)]">
        ${price.toLocaleString()}
      </div>

      {/* AI Score */}
      <div className="text-center">
        <span className={`font-heading text-[1.1rem] font-bold ${scoreColor}`}>
          {aiScore !== undefined ? `${aiScore}%` : '—'}
        </span>
        <span className="type-meta-small mt-0.5 block">
          {status === 'draft' ? 'Draft' : needsTeaching ? 'Needs\nTeaching' : 'Score'}
        </span>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
        {actionsSlot ??
          (needsTeaching && onTeach ? (
            <button
              className="rounded-[3px] bg-[var(--accent-primary)] px-3 py-1.5 font-body text-[0.72rem] font-medium text-white"
              onClick={(e) => {
                e.stopPropagation();
                onTeach(id);
              }}
            >
              Teach
            </button>
          ) : onEdit ? (
            <button
              className="rounded-[3px] border border-[var(--border-default)] bg-transparent px-3 py-1.5 font-body text-[0.72rem] font-medium text-[var(--text-primary)]"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(id);
              }}
            >
              Edit
            </button>
          ) : null)}
      </div>
    </div>
  );
}
