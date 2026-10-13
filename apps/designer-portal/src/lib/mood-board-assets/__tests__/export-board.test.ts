import {
  exportMoodBoardPng,
  formatMoodBoardExportScale,
  getMoodBoardPngExportPlan,
  safeMoodBoardFilename,
} from '../export-board';
import { renderMoodBoardPng, type MoodBoardPainterContext } from '@patina/design-system';

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

  it('promises the raster the painter produces when a caption grows the composition', async () => {
    // A 400×300 board whose bottom piece's long name wraps past its 40px box.
    const grown = {
      canvasWidth: 400,
      canvasHeight: 300,
      backgroundColor: '#FCFAF6',
      sections: [],
      items: [
        {
          id: 'bottom',
          type: 'product' as const,
          x: 300,
          y: 260,
          width: 40,
          height: 40,
          data: { name: 'Halyard lounge chair in a long walnut and boucle finish', vendor_name: 'West Elm' },
        },
      ],
    };
    // The one text metric both the dialog and the painter measure with.
    const context = () =>
      ({
        save() {}, restore() {}, scale() {}, translate() {}, rotate() {},
        fillRect() {}, strokeRect() {}, beginPath() {}, moveTo() {}, lineTo() {},
        quadraticCurveTo() {}, closePath() {}, fill() {}, stroke() {}, clip() {},
        setLineDash() {}, drawImage() {}, fillText() {},
        measureText: (text: string) => ({ width: text.length * 6 }),
        fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, font: '10px sans-serif',
        textAlign: 'start', textBaseline: 'alphabetic', globalAlpha: 1,
      }) as unknown as MoodBoardPainterContext;

    const plan = getMoodBoardPngExportPlan(grown, context());
    const result = await renderMoodBoardPng(grown, {
      environment: {
        createCanvas: (width: number, height: number) => ({ width, height, getContext: () => context() }),
        encode: async () => new Blob(['png'], { type: 'image/png' }),
      },
    });
    // The saved canvas says 800×600 at 2×; the caption grows the composition,
    // and the preflight names exactly what downloads.
    expect(result.height).toBeGreaterThan(600);
    expect({ width: plan.width, height: plan.height }).toEqual({ width: result.width, height: result.height });
    expect(plan.effectiveScale).toBe(result.effectiveScale);

    // Under the 8192px edge cap the grown height scales with the same factor.
    const tall = { ...grown, canvasWidth: 5000, canvasHeight: 300, items: grown.items.map((item) => ({ ...item, x: 4900 })) };
    const cappedPlan = getMoodBoardPngExportPlan(tall, context());
    const cappedResult = await renderMoodBoardPng(tall, {
      environment: {
        createCanvas: (width: number, height: number) => ({ width, height, getContext: () => context() }),
        encode: async () => new Blob(['png'], { type: 'image/png' }),
      },
    });
    expect(cappedPlan.capped).toBe(true);
    expect({ width: cappedPlan.width, height: cappedPlan.height }).toEqual({
      width: cappedResult.width,
      height: cappedResult.height,
    });
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
