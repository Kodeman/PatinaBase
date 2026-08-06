/**
 * The Light Table's honest-failure contract.
 *
 * `renderPageThumbnail` is the only thing standing between a page that will
 * not draw and a card that says "Drawing the page…" forever. A render that
 * never settles must be cut off and reported as a failure — and the abandoned
 * render task must be cancelled, not left drawing behind a card that has
 * already given up on it.
 */

const renderTask = {
  promise: new Promise<void>(() => {
    /* never settles — the hang this timeout exists for */
  }),
  cancel: jest.fn(),
};

const getDocument = jest.fn();
const destroy = jest.fn().mockResolvedValue(undefined);

jest.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: (...args: unknown[]) => getDocument(...args),
}));

import { renderPageThumbnail, THUMBNAIL_RENDER_TIMEOUT_MS } from '../pdf';

beforeEach(() => {
  renderTask.cancel.mockClear();
  destroy.mockClear();
  getDocument.mockReturnValue({
    promise: Promise.resolve({
      getPage: jest.fn().mockResolvedValue({
        getViewport: () => ({ width: 800, height: 600 }),
        render: jest.fn(() => renderTask),
        cleanup: jest.fn(),
      }),
      destroy,
    }),
  });
  // jsdom carries no 2d context, and the suite's custom environment replaces
  // the GLOBAL HTMLCanvasElement with a stub — so the prototype has to be
  // reached through a real element, which is what pdf.ts actually creates.
  Object.getPrototypeOf(document.createElement('canvas')).getContext = () =>
    ({}) as never;
});

describe('renderPageThumbnail', () => {
  it('gives up on a render that never settles, and cancels it', async () => {
    jest.useFakeTimers();
    try {
      const drawing = renderPageThumbnail(new Uint8Array([1, 2, 3]), 0);
      const settled = expect(drawing).rejects.toThrow(
        /took too long to draw/,
      );
      await jest.advanceTimersByTimeAsync(THUMBNAIL_RENDER_TIMEOUT_MS);
      await settled;
      expect(renderTask.cancel).toHaveBeenCalledTimes(1);
      // The document is released even on the failing leg.
      expect(destroy).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });
});
