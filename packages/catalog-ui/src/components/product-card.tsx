'use client';

import type { ReactNode } from 'react';
import type { ProductTier } from '@patina/types';
import { TierBadge } from './tier-badge';
import { LayerChip } from './layer-chip';
import type { Layer } from './layer-icon';

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

  // ─── Three-layer catalog props (PRD §5.2) ────────────────────────────────
  /**
   * Catalog layer this product belongs to. When set, drives a `LayerChip`
   * overlay in the top-right of the image unless `showLayer={false}`.
   */
  layer?: Layer;
  /** Show the `LayerChip` when `layer` is set. Defaults to true. */
  showLayer?: boolean;
  /**
   * Free-form project tag rendered below the image (e.g. "Maple St").
   * Surfaced when `showProjectTags` is true.
   */
  projectTag?: string;
  /** Show `projectTag` chip — default for Personal LayerView only. */
  showProjectTags?: boolean;
  /**
   * Usage count (number of projects this Studio Library item is in). Surfaced
   * when `showUsageCount` is true — default for Studio LayerView only.
   */
  usageCount?: number;
  showUsageCount?: boolean;
  /**
   * Aesthete match percentage (0–100). Surfaced when `showAestheteMatch` is
   * true — default for Catalog LayerView only.
   */
  aestheteMatch?: number;
  showAestheteMatch?: boolean;
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
  layer,
  showLayer = true,
  projectTag,
  showProjectTags = false,
  usageCount,
  showUsageCount = false,
  aestheteMatch,
  showAestheteMatch = false,
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
        {layer && showLayer && !trailingSlot && (
          <div
            className="absolute right-2 top-2 z-10 rounded-[2px]"
            style={{
              // Light wash so the chip stays legible over varied product photos
              background: 'rgba(250, 247, 242, 0.9)',
              padding: '1px 1px',
            }}
          >
            <LayerChip layer={layer} showLabel={false} size="sm" />
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
        {showProjectTags && projectTag && (
          <span className="type-meta-small text-[var(--color-dusty-blue,#8B9CAD)]">
            · {projectTag}
          </span>
        )}
        {showUsageCount && typeof usageCount === 'number' && (
          <span className="type-meta-small text-[var(--color-sage,#A8B5A0)]">
            · {usageCount} {usageCount === 1 ? 'project' : 'projects'}
          </span>
        )}
        {showAestheteMatch && typeof aestheteMatch === 'number' && (
          <span className="type-meta-small text-[var(--color-clay,#C4A57B)]">
            · {aestheteMatch}% match
          </span>
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
