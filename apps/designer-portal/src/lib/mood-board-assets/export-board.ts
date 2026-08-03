'use client';

import {
  renderMoodBoardPng,
  type MoodBoardPngOptions,
  type MoodBoardRasterInput,
  type MoodBoardRasterResult,
} from '@patina/design-system';

export type MoodBoardPngRenderer = (
  input: MoodBoardRasterInput,
  options?: MoodBoardPngOptions,
) => Promise<MoodBoardRasterResult>;

export function safeMoodBoardFilename(name: string, extension: 'png' | 'pdf'): string {
  const stem = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 80) || 'mood-board';
  return `${stem}.${extension}`;
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
  renderer?: MoodBoardPngRenderer;
  download?: (blob: Blob, filename: string) => void;
}): Promise<MoodBoardRasterResult> {
  const result = await (options.renderer ?? renderMoodBoardPng)(options.input, {
    onProgress: options.onProgress,
  });
  (options.download ?? downloadBlob)(
    result.blob,
    safeMoodBoardFilename(options.boardName, 'png'),
  );
  return result;
}
