'use client';

import {
  computeMoodBoardRasterScale,
  DEFAULT_MOOD_BOARD_EXPORT_SCALE,
  MOOD_BOARD_EXPORT_MAX_EDGE,
  renderMoodBoardPng,
  resolveMoodBoardGeometry,
  type MoodBoardPngOptions,
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

/** Preflight dimensions shown by the dialog before invoking the painter. */
export function getMoodBoardPngExportPlan(
  input: MoodBoardRasterInput,
): MoodBoardPngExportPlan {
  const canvas = 'canvas' in input ? input.canvas : resolveMoodBoardGeometry(input).canvas;
  const output = computeMoodBoardRasterScale(
    canvas,
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
