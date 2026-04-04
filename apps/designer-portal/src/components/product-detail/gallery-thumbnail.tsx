'use client';

import { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ProductImage } from './product-edit-context';

const badgeColors: Record<string, string> = {
  hero: 'bg-[var(--accent-primary)] text-white',
  lifestyle: 'bg-[var(--color-sage)] text-white',
  detail: 'bg-[var(--color-dusty-blue)] text-white',
  material: 'bg-[var(--color-aged-oak)] text-white',
  model: 'bg-[var(--text-primary)] text-[var(--bg-primary)]',
  maker: 'bg-[var(--color-sage)] text-white',
};

const imageTypes = ['hero', 'lifestyle', 'detail', 'material', 'maker'] as const;

interface GalleryThumbnailProps {
  image: ProductImage;
  index: number;
  isActive: boolean;
  isEditMode: boolean;
  isHero: boolean;
  onClick: () => void;
  onSetHero?: () => void;
  onRetag?: (type: string) => void;
  onRemove?: () => void;
}

export function GalleryThumbnail({
  image,
  index,
  isActive,
  isEditMode,
  isHero,
  onClick,
  onSetHero,
  onRetag,
  onRemove,
}: GalleryThumbnailProps) {
  const [showTagMenu, setShowTagMenu] = useState(false);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `thumb-${index}`,
    disabled: !isEditMode,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const badgeType = image.type || (isHero ? 'hero' : 'lifestyle');
  const badgeLabel = isHero ? '★ Hero' : badgeType.charAt(0).toUpperCase() + badgeType.slice(1);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative h-[54px] w-[72px] shrink-0 cursor-pointer overflow-hidden rounded border-2 bg-[var(--color-pearl)] ${
        isActive ? 'border-[var(--accent-primary)]' : 'border-transparent'
      } ${isEditMode ? 'hover:border-[var(--accent-primary)]' : ''}`}
      onClick={onClick}
    >
      {/* Image */}
      {image.url ? (
        <img src={image.url} alt={image.alt || ''} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <span className="font-mono text-[0.4rem] uppercase tracking-[0.04em] text-[var(--text-muted)]">
            {badgeLabel}
          </span>
        </div>
      )}

      {/* Edit mode overlays */}
      {isEditMode && (
        <>
          {/* Type badge */}
          <span
            className={`absolute left-1 top-1 z-10 rounded-sm px-1.5 py-0.5 font-mono text-[0.42rem] uppercase tracking-[0.04em] ${badgeColors[badgeType] || badgeColors.lifestyle}`}
          >
            {badgeLabel}
          </span>

          {/* Drag handle */}
          <span
            {...attributes}
            {...listeners}
            className="absolute right-1 top-1 z-10 flex h-5 w-5 cursor-grab items-center justify-center rounded-sm bg-[rgba(44,41,38,0.4)] text-[0.6rem] text-white opacity-0 transition-opacity group-hover:opacity-100"
          >
            ⠿
          </span>

          {/* Hover actions */}
          <div className="absolute bottom-0 left-0 right-0 z-10 flex items-center justify-between bg-gradient-to-t from-[rgba(44,41,38,0.7)] to-transparent px-1.5 py-1 opacity-0 transition-opacity group-hover:opacity-100">
            {!isHero && onSetHero && (
              <button
                onClick={(e) => { e.stopPropagation(); onSetHero(); }}
                className="cursor-pointer border-none bg-transparent font-mono text-[0.45rem] uppercase tracking-[0.04em] text-white"
              >
                ★ Set Hero
              </button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); setShowTagMenu(!showTagMenu); }}
              className="cursor-pointer border-none bg-transparent font-mono text-[0.45rem] uppercase tracking-[0.04em] text-white"
            >
              Retag
            </button>
            {onRemove && (
              <button
                onClick={(e) => { e.stopPropagation(); onRemove(); }}
                className="cursor-pointer border-none bg-transparent font-mono text-[0.45rem] uppercase tracking-[0.04em] text-[var(--color-terracotta)]"
              >
                Remove
              </button>
            )}
          </div>

          {/* Tag dropdown */}
          {showTagMenu && (
            <div className="absolute bottom-full left-0 z-20 mb-1 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] py-1 shadow-lg">
              {imageTypes.map((type) => (
                <button
                  key={type}
                  className="block w-full cursor-pointer border-none bg-transparent px-3 py-1 text-left font-mono text-[0.55rem] uppercase tracking-[0.04em] text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRetag?.(type);
                    setShowTagMenu(false);
                  }}
                >
                  {type}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
