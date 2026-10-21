'use client';

import { useEffect, useState, type RefObject } from 'react';

import { contrastRatio } from '@/lib/editorial/contrast';
import { normalised } from '@/lib/editorial/crop';
import type { EditorialAsset } from '@/lib/editorial/types';

/* The paper tab: opaque page furniture cut into the hero's bottom-left, never a
   scrim. `notch` cuts in; `hairline` adds a rule where the plate's edge would
   melt into the paper; `below` sets the tab under the plate. */

export type PaperTabMode = 'notch' | 'hairline' | 'below';

/** Measured against these values, which mirror --plate-tab and --plate-caption-ink. */
export const TAB_PAPER = '#FAF7F2';
export const TAB_INK = '#4E4339';
export const MIN_INK_CONTRAST = 4.5;
/** Below this the plate's edge disappears into the paper. */
export const MIN_EDGE_CONTRAST = 1.3;
/** Pinch or browser zoom at 200 percent reads as scale 2. */
export const ZOOM_SCALE_LIMIT = 1.5;
export const MIN_CONTAINER_PX = 320;
/** The tab's zone at 390: bottom-left 310 × 44 of a 390 × 340 plate. */
export const TAB_ZONE = { x: 310 / 390, y: 1 - 44 / 340 } as const;

export interface PaperTabInput {
  /** The plate's sampled background under the tab. */
  dominantHex: string | null;
  /** Focal point in the displayed crop, 0–1. */
  focal?: readonly [number, number] | null;
  zoomScale?: number | null;
  containerWidth?: number | null;
  paperHex?: string;
  inkHex?: string;
}

function inkTooFaint(input: PaperTabInput, paper: string): boolean {
  const ink = contrastRatio(input.inkHex ?? TAB_INK, paper);
  return ink === null || ink < MIN_INK_CONTRAST;
}

function viewTooTight(input: PaperTabInput): boolean {
  if ((input.zoomScale ?? 1) > ZOOM_SCALE_LIMIT) return true;
  return input.containerWidth != null && input.containerWidth < MIN_CONTAINER_PX;
}

function focalUnderTab(focal: PaperTabInput['focal']): boolean {
  return Boolean(focal && focal[0] <= TAB_ZONE.x && focal[1] >= TAB_ZONE.y);
}

function edgeMelts(dominantHex: string | null, paper: string): boolean {
  const edge = dominantHex ? contrastRatio(dominantHex, paper) : null;
  return edge !== null && edge < MIN_EDGE_CONTRAST;
}

function tabCannotNotch(input: PaperTabInput, paper: string): boolean {
  return inkTooFaint(input, paper) || viewTooTight(input) || focalUnderTab(input.focal);
}

export function paperTabMode(input: PaperTabInput): PaperTabMode {
  const paper = input.paperHex ?? TAB_PAPER;
  if (tabCannotNotch(input, paper)) return 'below';
  return edgeMelts(input.dominantHex, paper) ? 'hairline' : 'notch';
}

/** The asset's focal point, moved into the phone crop's own frame. */
export function focalInCrop(asset: Pick<EditorialAsset, 'focal' | 'crops' | 'width' | 'height'>): [number, number] | null {
  if (!asset.focal) return null;
  const rect = asset.crops.cover_phone?.rect;
  if (!rect) return [asset.focal[0], asset.focal[1]];
  const [x, y, w, h] = normalised(rect, asset.width, asset.height);
  if (!(w > 0 && h > 0)) return null;
  return [(asset.focal[0] - x) / w, (asset.focal[1] - y) / h];
}

/** Live zoom and container width; the server render assumes neither. */
export function usePaperTabMode(
  asset: Pick<EditorialAsset, 'focal' | 'crops' | 'width' | 'height' | 'dominantHex'>,
  container: RefObject<HTMLElement | null>,
): PaperTabMode {
  const [view, setView] = useState<{ zoomScale: number; containerWidth: number | null }>({
    zoomScale: 1,
    containerWidth: null,
  });

  useEffect(() => {
    const measure = () =>
      setView({
        zoomScale: window.visualViewport?.scale ?? 1,
        containerWidth: container.current?.clientWidth || null,
      });
    measure();
    window.visualViewport?.addEventListener('resize', measure);
    window.addEventListener('resize', measure);
    return () => {
      window.visualViewport?.removeEventListener('resize', measure);
      window.removeEventListener('resize', measure);
    };
  }, [container]);

  return paperTabMode({ dominantHex: asset.dominantHex, focal: focalInCrop(asset), ...view });
}

export interface PaperTabProps {
  mode: PaperTabMode;
  eyebrow: string;
  headline: string;
  headingId?: string;
}

export function PaperTab({ mode, eyebrow, headline, headingId }: PaperTabProps) {
  return (
    <div className="ed-tab" data-tab="" data-tab-mode={mode}>
      <p className="ed-eyebrow">{eyebrow}</p>
      <h2 id={headingId} className="ed-tab__title">
        {headline}
      </h2>
    </div>
  );
}
