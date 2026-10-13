'use client';

import {
  computeMoodBoardRasterScale,
  createDefaultMoodBoardRasterEnvironment,
  DEFAULT_MOOD_BOARD_EXPORT_SCALE,
  MOOD_BOARD_EXPORT_MAX_EDGE,
  measureMoodBoardContentBounds,
  renderMoodBoardPng,
  resolveMoodBoardGeometry,
  type MoodBoardPainterContext,
  type MoodBoardPngOptions,
  type MoodBoardRasterEnvironment,
  type MoodBoardRasterInput,
  type MoodBoardRasterResult,
} from '@patina/design-system';

export type MoodBoardPngRenderer = (
  input: MoodBoardRasterInput,
  options?: MoodBoardPngOptions,
) => Promise<MoodBoardRasterResult>;

function localDateStamp(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function safeMoodBoardFilename(
  name: string,
  extension: 'png' | 'pdf',
  exportedAt = new Date(),
): string {
  const stem = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 80) || 'mood-board';
  const datedStem = extension === 'png' ? `${stem}-${localDateStamp(exportedAt)}` : stem;
  return `${datedStem}.${extension}`;
}

export interface MoodBoardPngExportPlan {
  requestedScale: number;
  effectiveScale: number;
  width: number;
  height: number;
  capped: boolean;
}

/** A 2D context the dialog measures captions with, as the painter will. */
function defaultMeasureContext(): MoodBoardPainterContext | null {
  if (typeof document === 'undefined') return null;
  try {
    return document.createElement('canvas').getContext('2d') as MoodBoardPainterContext | null;
  } catch {
    return null;
  }
}

/**
 * Preflight dimensions shown by the dialog before invoking the painter. They
 * are the raster the painter will produce: the composition grown on every
 * side to every printed caption (R13b), then the 2× scale under the 8192px
 * edge cap. With no 2D context to measure text (a server render), the saved
 * canvas stands in.
 */
export function getMoodBoardPngExportPlan(
  input: MoodBoardRasterInput,
  measureContext: MoodBoardPainterContext | null = defaultMeasureContext(),
): MoodBoardPngExportPlan {
  const geometry = 'canvas' in input ? input : resolveMoodBoardGeometry(input);
  const composition = measureContext
    ? measureMoodBoardContentBounds(measureContext, geometry)
    : geometry.canvas;
  const output = computeMoodBoardRasterScale(
    { width: composition.width, height: composition.height },
    DEFAULT_MOOD_BOARD_EXPORT_SCALE,
    MOOD_BOARD_EXPORT_MAX_EDGE,
  );
  return {
    requestedScale: DEFAULT_MOOD_BOARD_EXPORT_SCALE,
    effectiveScale: output.scale,
    width: output.width,
    height: output.height,
    capped: output.scale < DEFAULT_MOOD_BOARD_EXPORT_SCALE,
  };
}

/**
 * The preflight the dialog publishes: measured only once the fonts the
 * painter waits for are ready (the same `waitForFonts`), so a caption wraps
 * as it will in the raster and the promised dimensions are the downloaded
 * ones, never a fallback font's (SQ-865).
 */
export async function measureMoodBoardPngExportPlan(
  input: MoodBoardRasterInput,
  environment: Pick<MoodBoardRasterEnvironment, 'waitForFonts'> =
    createDefaultMoodBoardRasterEnvironment(),
): Promise<MoodBoardPngExportPlan> {
  try {
    await environment.waitForFonts?.();
  } catch {
    // As the painter: a rejected webfont load continues on the system tail.
  }
  return getMoodBoardPngExportPlan(input);
}

export function formatMoodBoardExportScale(scale: number): string {
  return scale.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
}

export function downloadBlob(blob: Blob, filename: string): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Composition-true PNG export through the canonical geometry painter. */
export async function exportMoodBoardPng(options: {
  input: MoodBoardRasterInput;
  boardName: string;
  onProgress?: MoodBoardPngOptions['onProgress'];
  exportedAt?: Date;
  renderer?: MoodBoardPngRenderer;
  download?: (blob: Blob, filename: string) => void;
}): Promise<MoodBoardRasterResult> {
  const result = await (options.renderer ?? renderMoodBoardPng)(options.input, {
    onProgress: options.onProgress,
  });
  (options.download ?? downloadBlob)(
    result.blob,
    safeMoodBoardFilename(options.boardName, 'png', options.exportedAt),
  );
  return result;
}
