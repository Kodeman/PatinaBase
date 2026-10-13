import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { renderMoodBoardPng, type MoodBoardPainterContext } from '@patina/design-system';
import { getMoodBoardPngExportPlan } from '@/lib/mood-board-assets/export-board';
import { BoardExportDialog } from './board-export-dialog';

/**
 * SQ-865 — the PNG line in the export dialog promises the raster that
 * downloads. The real preflight and the real painter run here; only the
 * browser's canvas, its fonts and the download are stood in for.
 */

const mockRasters: Array<{ width: number; height: number }> = [];

jest.mock('@/lib/mood-board-assets/export-board', () => {
  const actual = jest.requireActual<typeof import('@/lib/mood-board-assets/export-board')>(
    '@/lib/mood-board-assets/export-board',
  );
  return {
    ...actual,
    exportMoodBoardPng: async (options: Parameters<typeof actual.exportMoodBoardPng>[0]) => {
      const result = await actual.exportMoodBoardPng({ ...options, download: () => undefined });
      mockRasters.push({ width: result.width, height: result.height });
      return result;
    },
  };
});

jest.mock('@patina/design-system', () => ({
  ...jest.requireActual('@patina/design-system'),
  Dialog: ({ open, children }: React.PropsWithChildren<{ open: boolean }>) =>
    open ? <div role="dialog">{children}</div> : null,
  DialogContent: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  DialogDescription: ({ children }: React.PropsWithChildren) => <p>{children}</p>,
  DialogHeader: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  DialogTitle: ({ children }: React.PropsWithChildren) => <h2>{children}</h2>,
}));

jest.mock('@/lib/scope/spec-pdf-client', () => ({ downloadSpecPdf: jest.fn() }));

jest.mock('@/components/ui/controls', () => ({
  Button: ({ children, onClick, disabled }: React.PropsWithChildren<{ onClick?: () => void; disabled?: boolean }>) => (
    <button type="button" onClick={onClick} disabled={disabled}>{children}</button>
  ),
}));

/** The webfont sets 6px a character; the fallback face, before it loads, 4px. */
let fontsLoaded = false;

function context(): MoodBoardPainterContext {
  return {
    save() {}, restore() {}, scale() {}, translate() {}, rotate() {},
    fillRect() {}, strokeRect() {}, beginPath() {}, moveTo() {}, lineTo() {},
    quadraticCurveTo() {}, closePath() {}, fill() {}, stroke() {}, clip() {},
    setLineDash() {}, drawImage() {}, fillText() {},
    measureText: (text: string) => ({ width: text.length * (fontsLoaded ? 6 : 4) }),
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, font: '10px sans-serif',
    textAlign: 'start', textBaseline: 'alphabetic', globalAlpha: 1,
  } as unknown as MoodBoardPainterContext;
}

// Eight words on an 80px plate: three to a line in the fallback face (three
// lines), two in the webfont (four lines), so the fonts change the raster.
const name = 'Arden Arden Arden Arden Arden Arden Arden Arden';

function board(piece: { x: number; y: number; rotation?: number }) {
  return {
    canvasWidth: 400,
    canvasHeight: 300,
    backgroundColor: '#FCFAF6',
    sections: [],
    items: [{ id: 'piece', type: 'product' as const, width: 80, height: 40, data: { name }, ...piece }],
  };
}

// The suite's environment replaces the global `HTMLCanvasElement` with a stub
// class, so the canvas `document.createElement` returns is reached through
// its own prototype.
const canvasPrototype = Object.getPrototypeOf(document.createElement('canvas')) as HTMLCanvasElement;
const originalToBlob = Object.getOwnPropertyDescriptor(canvasPrototype, 'toBlob');

beforeEach(() => {
  fontsLoaded = false;
  mockRasters.length = 0;
  jest.spyOn(canvasPrototype, 'getContext').mockImplementation(
    () => context() as unknown as CanvasRenderingContext2D,
  );
  // This jsdom has no canvas encoder; the painter's PNG encode lands here.
  Object.defineProperty(canvasPrototype, 'toBlob', {
    configurable: true,
    value(callback: BlobCallback) {
      callback(new Blob(['png'], { type: 'image/png' }));
    },
  });
});

afterEach(() => {
  jest.restoreAllMocks();
  if (originalToBlob) Object.defineProperty(canvasPrototype, 'toBlob', originalToBlob);
  delete (document as { fonts?: unknown }).fonts;
});

describe('the PNG preflight waits for the fonts the painter waits for (SQ-865 F4)', () => {
  it('publishes no dimensions while the fonts load, then the raster’s own', async () => {
    let fontsReady!: () => void;
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { ready: new Promise<void>((resolve) => { fontsReady = resolve; }) },
    });
    const input = board({ x: 160, y: 250 });
    // What a plan measured at open would have promised: the fallback face's wrap.
    const fallback = getMoodBoardPngExportPlan(input);

    render(
      <BoardExportDialog
        boardId="board-1"
        boardName="Living room"
        owner={{ kind: 'project', id: 'project-1' }}
        input={input}
        open
        onOpenChange={jest.fn()}
        flush={jest.fn().mockResolvedValue(undefined)}
      />,
    );
    expect(screen.getByText('Measuring the raster…')).toBeInTheDocument();
    expect(screen.queryByText(/× \d+px/)).not.toBeInTheDocument();

    await act(async () => {
      fontsLoaded = true;
      fontsReady();
    });
    const promised = await screen.findByText(/^2× raster · \d+ × \d+px\.$/);

    fireEvent.click(screen.getByRole('button', { name: /Board composition · PNG/ }));
    await waitFor(() => expect(mockRasters).toHaveLength(1));
    const [raster] = mockRasters;
    // The webfont's extra line grew the raster past the fallback promise …
    expect(raster.height).toBeGreaterThan(fallback.height);
    // … and the dialog promised exactly what downloaded.
    expect(promised).toHaveTextContent(`2× raster · ${raster.width} × ${raster.height}px.`);
  });
});

describe('the preflight names the raster for a turned caption at every edge (SQ-865 F2)', () => {
  const edges = {
    top: { x: 160, y: 10 },
    bottom: { x: 160, y: 250 },
    left: { x: 10, y: 130 },
    right: { x: 310, y: 130 },
  } as const;
  const cases = (Object.keys(edges) as Array<keyof typeof edges>).flatMap((edge) =>
    [0, 90, 180, 270].map((rotation) => ({ edge, rotation })),
  );

  it.each(cases)('$rotation° near the $edge edge', async ({ edge, rotation }) => {
    fontsLoaded = true;
    const input = board({ ...edges[edge], rotation });
    const plan = getMoodBoardPngExportPlan(input, context());
    const raster = await renderMoodBoardPng(input, {
      environment: {
        createCanvas: (width: number, height: number) => ({ width, height, getContext: () => context() }),
        resolveImage: async () => null,
        encode: async () => new Blob(['png'], { type: 'image/png' }),
      },
    });
    expect({ width: plan.width, height: plan.height }).toEqual({ width: raster.width, height: raster.height });
    expect(plan.effectiveScale).toBe(raster.effectiveScale);
  });

  it('grows the promise past the top for the review’s half turn', () => {
    fontsLoaded = true;
    // Saved at y=20, the half-turned caption ends 98px above the box's centre
    // (y=40): the composition gains 58px above the saved 300.
    const plan = getMoodBoardPngExportPlan(board({ x: 20, y: 20, rotation: 180 }), context());
    expect({ width: plan.width, height: plan.height }).toEqual({ width: 800, height: (300 + 58) * 2 });
  });
});
