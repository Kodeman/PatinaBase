'use client';

import type { ReactNode } from 'react';
import type { ProductTier } from '@patina/types';
import { TierBadge } from './tier-badge';

export interface ProductCardProps {
  id: string;
  name: string;
  maker?: string;
  makerLocation?: string;
  imageUrl?: string;
  price: number;
  tier?: ProductTier;
  aiScore?: number;
  status?: string;
  onClick?: (id: string) => void;
  /** Optional slot rendered in the top-left of the image (e.g. admin bulk-select checkbox). */
  leadingSlot?: ReactNode;
  /** Optional slot rendered in the top-right of the image (e.g. admin status badge). */
  trailingSlot?: ReactNode;
  /** Optional slot rendered under the meta row (e.g. admin inline actions). */
  footerSlot?: ReactNode;
}

export function ProductCard({
  id,
  name,
  maker,
  makerLocation,
  imageUrl,
  price,
  tier,
  aiScore,
  status,
  onClick,
  leadingSlot,
  trailingSlot,
  footerSlot,
}: ProductCardProps) {
  const statusLabel =
    status === 'published'
      ? { text: '● Active', className: 'text-[var(--color-sage)]' }
      : status === 'draft'
        ? { text: '○ Draft', className: 'text-[var(--text-muted)]' }
        : status === 'in_review'
          ? { text: '◌ Needs Teaching', className: 'text-[var(--color-golden-hour)]' }
          : null;

  return (
    <div
      className="cursor-pointer transition-transform duration-200 hover:-translate-y-0.5"
      style={{ transitionTimingFunction: 'var(--ease-default)' }}
      onClick={() => onClick?.(id)}
    >
      {/* Image */}
      <div className="relative mb-3 flex aspect-[4/3] items-center justify-center overflow-hidden rounded-md bg-[var(--color-pearl)]">
        {imageUrl ? (
          <img src={imageUrl} alt={name} className="h-full w-full object-cover" />
        ) : (
          <span className="type-meta-small">Product Image</span>
        )}
        {tier && <TierBadge tier={tier} className="absolute left-2 top-2" />}
        {leadingSlot && (
          <div className="absolute left-2 top-2 z-10" onClick={(e) => e.stopPropagation()}>
            {leadingSlot}
          </div>
        )}
        {trailingSlot && (
          <div className="absolute right-2 top-2 z-10" onClick={(e) => e.stopPropagation()}>
            {trailingSlot}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="font-body text-[0.88rem] font-medium text-[var(--text-primary)]">
        {name}
      </div>
      {maker && (
        <div className="font-body text-[0.75rem] italic text-[var(--text-muted)]">
          {[maker, makerLocation].filter(Boolean).join(' · ')}
        </div>
      )}
      <div className="mt-1 font-heading text-[1rem] font-semibold text-[var(--text-primary)]">
        ${price.toLocaleString()}
      </div>

      {/* Meta row */}
      <div className="mt-1 flex items-center gap-2">
        {statusLabel && (
          <span className={`type-meta-small ${statusLabel.className}`}>{statusLabel.text}</span>
        )}
        {aiScore !== undefined && (
          <span className="type-meta-small text-[var(--accent-primary)]">AI {aiScore}%</span>
        )}
      </div>

      {footerSlot && (
        <div className="mt-2" onClick={(e) => e.stopPropagation()}>
          {footerSlot}
        </div>
      )}
    </div>
  );
}
