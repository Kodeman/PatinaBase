import { exportMoodBoardPng, safeMoodBoardFilename } from '../export-board';

const input = {
  canvasWidth: 1200,
  canvasHeight: 800,
  backgroundColor: '#FAF8F5',
  sections: [],
  items: [],
};

describe('mood board PNG export', () => {
  it('sanitizes a human board name without losing the extension', () => {
    expect(safeMoodBoardFilename('  Élise’s Room / v2  ', 'png')).toBe('elise-s-room-v2.png');
    expect(safeMoodBoardFilename('***', 'pdf')).toBe('mood-board.pdf');
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
      exportMoodBoardPng({ input, boardName: 'Living Room', renderer, download }),
    ).resolves.toBe(result);
    expect(renderer).toHaveBeenCalledWith(input, { onProgress: undefined });
    expect(download).toHaveBeenCalledWith(blob, 'living-room.png');
  });
});
