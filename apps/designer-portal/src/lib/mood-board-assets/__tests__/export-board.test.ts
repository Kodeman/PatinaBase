import {
  exportMoodBoardPng,
  formatMoodBoardExportScale,
  getMoodBoardPngExportPlan,
  safeMoodBoardFilename,
} from '../export-board';

const input = {
  canvasWidth: 1200,
  canvasHeight: 800,
  backgroundColor: '#FAF8F5',
  sections: [],
  items: [],
};

describe('mood board PNG export', () => {
  it('sanitizes a human board name without losing the extension', () => {
    const exportedAt = new Date(2026, 7, 3, 12, 0, 0);
    expect(safeMoodBoardFilename('  Élise’s Room / v2  ', 'png', exportedAt)).toBe(
      'elise-s-room-v2-2026-08-03.png',
    );
    expect(safeMoodBoardFilename('***', 'pdf')).toBe('mood-board.pdf');
  });

  it('reports the actual uniform scale when the 8192px edge cap applies', () => {
    expect(getMoodBoardPngExportPlan(input)).toEqual({
      requestedScale: 2,
      effectiveScale: 2,
      width: 2400,
      height: 1600,
      capped: false,
    });

    const capped = getMoodBoardPngExportPlan({ ...input, canvasWidth: 5000, canvasHeight: 3000 });
    expect(capped).toEqual({
      requestedScale: 2,
      effectiveScale: 8192 / 5000,
      width: 8192,
      height: 4915,
      capped: true,
    });
    expect(formatMoodBoardExportScale(capped.effectiveScale)).toBe('1.64');
  });

  it('uses the canonical renderer result and reports it to the downloader', async () => {
    const blob = new Blob(['png'], { type: 'image/png' });
    const result = {
      blob,
      width: 2400,
      height: 1600,
      effectiveScale: 2,
      warnings: [],
      paintedItemKeys: [],
      geometry: {
        version: 1,
        canvas: { width: 1200, height: 800, backgroundColor: '#FAF8F5' },
        items: [],
        sections: [],
        contentBounds: { x: 0, y: 0, width: 1200, height: 800 },
      },
    } as const;
    const renderer = jest.fn().mockResolvedValue(result);
    const download = jest.fn();

    await expect(
      exportMoodBoardPng({
        input,
        boardName: 'Living Room',
        exportedAt: new Date(2026, 7, 3, 12, 0, 0),
        renderer,
        download,
      }),
    ).resolves.toBe(result);
    expect(renderer).toHaveBeenCalledWith(input, { onProgress: undefined });
    expect(download).toHaveBeenCalledWith(blob, 'living-room-2026-08-03.png');
  });
});
