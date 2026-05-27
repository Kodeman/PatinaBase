import * as React from 'react';
import { LayerIcon, type Layer } from './layer-icon';

export interface LayerChipProps {
  layer: Layer;
  /**
   * Show the layer label (e.g. "Personal Library") next to the icon.
   * Defaults to true; pass false to render just the icon in a tinted pill.
   */
  showLabel?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

const LAYER_LABEL: Record<Layer, string> = {
  personal: 'Personal Library',
  studio: 'Studio Library',
  catalog: 'Patina Catalog',
};

// PRD §5.1 spec: rgba tints over the layer's canonical color.
const LAYER_BG: Record<Layer, string> = {
  personal: 'rgba(139, 156, 173, 0.12)', // 12% Dusty Blue
  studio: 'rgba(168, 181, 160, 0.12)', // 12% Sage
  catalog: 'rgba(196, 165, 123, 0.15)', // 15% Clay
};

const LAYER_FG: Record<Layer, string> = {
  personal: 'var(--color-dusty-blue, #8B9CAD)',
  studio: 'var(--color-sage, #A8B5A0)',
  catalog: 'var(--color-clay, #C4A57B)',
};

const SIZE_TOKENS: Record<NonNullable<LayerChipProps['size']>, {
  fontSize: string;
  padding: string;
  iconSize: 'sm' | 'md';
  gap: string;
}> = {
  sm: { fontSize: '0.48rem', padding: '2px 7px', iconSize: 'sm', gap: '6px' },
  md: { fontSize: '0.6rem', padding: '4px 9px', iconSize: 'md', gap: '7px' },
};

/**
 * Compact tinted chip used in product cards and item headers to identify the
 * layer. Composes `LayerIcon` with a DM Mono label. Visual spec per PRD §5.1.
 */
export function LayerChip({
  layer,
  showLabel = true,
  size = 'sm',
  className,
}: LayerChipProps) {
  const tokens = SIZE_TOKENS[size];

  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: tokens.gap,
        padding: tokens.padding,
        borderRadius: 2,
        background: LAYER_BG[layer],
        color: LAYER_FG[layer],
        fontFamily: "'DM Mono', ui-monospace, SFMono-Regular, monospace",
        fontSize: tokens.fontSize,
        fontWeight: 600,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        lineHeight: 1,
        whiteSpace: 'nowrap',
      }}
    >
      <LayerIcon layer={layer} size={tokens.iconSize} color="currentColor" />
      {showLabel ? <span>{LAYER_LABEL[layer]}</span> : null}
    </span>
  );
}
