import * as React from 'react';

/**
 * Layer identity in the three-layer product catalog.
 * personal → Library private to a single designer.
 * studio   → Shared within a studio organization.
 * catalog  → Patina-managed marketplace.
 */
export type Layer = 'personal' | 'studio' | 'catalog';

export type LayerIconSize = 'sm' | 'md' | 'lg';

export interface LayerIconProps {
  layer: Layer;
  size?: LayerIconSize;
  /**
   * Override the brand layer color. By default the icon picks the canonical
   * tint per layer (Dusty Blue / Sage / Clay). Pass `'currentColor'` to inherit
   * from the parent (useful inside a `LayerChip` that already sets the color).
   */
  color?: string;
  className?: string;
  /**
   * Accessible label. Defaults to "<Layer> library indicator".
   */
  'aria-label'?: string;
}

const SIZE_PX: Record<LayerIconSize, { w: number; h: number; gap: number; bar: number }> = {
  sm: { w: 14, h: 10, gap: 1.5, bar: 1.5 },
  md: { w: 18, h: 13, gap: 2, bar: 2 },
  lg: { w: 24, h: 17, gap: 2.5, bar: 2.5 },
};

const LAYER_COLOR: Record<Layer, string> = {
  personal: 'var(--color-dusty-blue, #8B9CAD)',
  studio: 'var(--color-sage, #A8B5A0)',
  catalog: 'var(--color-clay, #C4A57B)',
};

const LAYER_LABEL: Record<Layer, string> = {
  personal: 'Personal',
  studio: 'Studio',
  catalog: 'Catalog',
};

/**
 * 1/2/3-line miniature Strata Mark variant identifying the catalog layer.
 * Visual spec from `docs/prds/patina-three-layer-product-catalog.html` §
 * `.layer-icon` and the engineering handoff §5.1.
 */
export function LayerIcon({
  layer,
  size = 'sm',
  color,
  className,
  'aria-label': ariaLabel,
}: LayerIconProps) {
  const dims = SIZE_PX[size];
  const fill = color ?? LAYER_COLOR[layer];

  const bars = barsForLayer(layer);

  return (
    <span
      role="img"
      aria-label={ariaLabel ?? `${LAYER_LABEL[layer]} library indicator`}
      className={className}
      style={{
        width: dims.w,
        height: dims.h,
        display: 'inline-flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: dims.gap,
        color: fill,
        flexShrink: 0,
      }}
    >
      {bars.map((bar, i) => (
        <span
          key={i}
          aria-hidden="true"
          style={{
            display: 'block',
            height: dims.bar,
            width: bar.width,
            borderRadius: 1,
            background: 'currentColor',
            opacity: bar.opacity,
          }}
        />
      ))}
    </span>
  );
}

function barsForLayer(layer: Layer): Array<{ width: string; opacity: number }> {
  switch (layer) {
    case 'personal':
      return [{ width: '100%', opacity: 0.6 }];
    case 'studio':
      return [
        { width: '100%', opacity: 0.9 },
        { width: '75%', opacity: 0.6 },
      ];
    case 'catalog':
      return [
        { width: '100%', opacity: 1 },
        { width: '75%', opacity: 0.6 },
        { width: '50%', opacity: 0.3 },
      ];
  }
}
