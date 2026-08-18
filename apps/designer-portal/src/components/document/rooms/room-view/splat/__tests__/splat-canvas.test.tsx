/**
 * SplatCanvas — mount/teardown lifecycle (Rendered Room v2, W2).
 *
 * WHAT THIS CAN AND CANNOT PROVE, stated plainly so a green run is not over-read.
 * jsdom has no WebGL, so neither `THREE.WebGLRenderer` nor Spark's `SparkRenderer` /
 * `SplatMesh` can exist here for real. Both are replaced at the module boundary with
 * recorders. What that leaves genuinely assertable is the whole reason this file's
 * shape matters — the LIFECYCLE, which is where every WebGL leak in this codebase has
 * come from:
 *
 *   · the parts are constructed with our own renderer, and the splat with our URL
 *   · `onDirty` is wired, so a finished async sort can re-render an on-demand loop
 *   · unmount BEFORE the splat resolves still frees both parts (the cancel path)
 *   · unmount AFTER it resolves frees parts, renderer, and GPU context, in order
 *   · a rejected load frees the parts instead of stranding them, and says so
 *   · StrictMode's double-invoke gets a fresh canvas and leaves nothing behind
 *
 * What it does NOT prove: that Spark renders anything, that the sort is correct, or
 * that the frame ever reaches a screen. Only a browser can show that, and the W2
 * walk is where it was shown.
 */

import { act, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';

// The real three, for the parts of it jsdom CAN run. Both Spark classes extend
// THREE.Object3D in the library, so the stand-ins must too — `scene.add()` type-checks
// its argument at runtime, and a plain object would be rejected.
const ActualTHREE = jest.requireActual<typeof import('three')>('three');

const sparkInstances: MockSparkRenderer[] = [];
const meshInstances: MockSplatMesh[] = [];
const rendererInstances: MockWebGLRenderer[] = [];

/** Flipped by the no-WebGL test — the one device condition worth simulating. */
let contextAvailable = true;

class MockSparkRenderer extends ActualTHREE.Object3D {
  sourceRenderer: unknown;
  onDirty?: () => void;
  dispose = jest.fn();
  update = jest.fn().mockResolvedValue(undefined);
  constructor(options: { renderer: unknown; onDirty?: () => void }) {
    super();
    this.sourceRenderer = options.renderer;
    this.onDirty = options.onDirty;
    sparkInstances.push(this);
  }
}

class MockSplatMesh extends ActualTHREE.Object3D {
  url?: string;
  dispose = jest.fn();
  initialized: Promise<MockSplatMesh>;
  private resolve!: (m: MockSplatMesh) => void;
  private reject!: (e: Error) => void;
  constructor(options: { url?: string } = {}) {
    super();
    this.url = options.url;
    this.initialized = new Promise((res, rej) => {
      this.resolve = res;
      this.reject = rej;
    });
    meshInstances.push(this);
  }
  getBoundingBox() {
    return new ActualTHREE.Box3(
      new ActualTHREE.Vector3(0, 0, 0),
      new ActualTHREE.Vector3(4, 2.5, 3),
    );
  }
  land() {
    this.resolve(this);
  }
  fail() {
    this.reject(new Error('404'));
  }
}

class MockWebGLRenderer {
  domElement: HTMLCanvasElement;
  outputColorSpace = '';
  dispose = jest.fn();
  forceContextLoss = jest.fn();
  render = jest.fn();
  setSize = jest.fn();
  setPixelRatio = jest.fn();
  setClearColor = jest.fn();
  getContext = jest.fn(() => (contextAvailable ? ({} as unknown) : null));
  constructor(options: { canvas: HTMLCanvasElement; antialias?: boolean }) {
    this.domElement = options.canvas;
    (this as unknown as { antialias?: boolean }).antialias = options.antialias;
    rendererInstances.push(this);
  }
}

jest.mock('@sparkjsdev/spark', () => ({
  __esModule: true,
  SparkRenderer: MockSparkRenderer,
  SplatMesh: MockSplatMesh,
}));

jest.mock('three', () => {
  const actual = jest.requireActual('three');
  return { __esModule: true, ...actual, WebGLRenderer: MockWebGLRenderer };
});

// Required, not imported: an `import` is hoisted above the class declarations
// above, and the `three` factory closes over one of them — so the module under
// test has to be pulled in after this file's own bindings are initialized.
const SplatCanvas = require('../splat-canvas').default as (
  props: { splatUrl: string },
) => React.ReactElement;

const URL_A = '/fixtures/splat/room-fixture.ply';

/** Flush the microtask queue the `initialized` promise chain runs on. */
const settle = () =>
  act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

/** Let the on-demand rAF coalescer fire, then let its async frame body settle. */
const nextFrame = () =>
  act(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    await Promise.resolve();
    await Promise.resolve();
  });

beforeEach(() => {
  contextAvailable = true;
  sparkInstances.length = 0;
  meshInstances.length = 0;
  rendererInstances.length = 0;
});

describe('SplatCanvas — construction', () => {
  it('builds the Spark parts from our own renderer and our own URL', async () => {
    render(<SplatCanvas splatUrl={URL_A} />);

    expect(rendererInstances).toHaveLength(1);
    expect(sparkInstances).toHaveLength(1);
    expect(meshInstances).toHaveLength(1);
    expect(sparkInstances[0].sourceRenderer).toBe(rendererInstances[0]);
    expect(meshInstances[0].url).toBe(URL_A);
  });

  it('turns antialiasing off — MSAA does nothing for gaussians and costs frames', () => {
    render(<SplatCanvas splatUrl={URL_A} />);
    expect((rendererInstances[0] as unknown as { antialias?: boolean }).antialias).toBe(
      false,
    );
  });

  it('wires onDirty, so a finished async sort can wake the on-demand loop', () => {
    render(<SplatCanvas splatUrl={URL_A} />);
    expect(typeof sparkInstances[0].onDirty).toBe('function');
  });

  it('holds the mono loading line until the splat lands', () => {
    render(<SplatCanvas splatUrl={URL_A} />);
    expect(screen.getByText('Bringing the walkthrough up…')).toBeInTheDocument();
  });
});

describe('SplatCanvas — the frame', () => {
  it('sorts before it draws: spark.update() precedes gl.render()', async () => {
    render(<SplatCanvas splatUrl={URL_A} />);
    meshInstances[0].land();
    await settle();
    await nextFrame();

    await waitFor(() => expect(sparkInstances[0].update).toHaveBeenCalled());
    expect(rendererInstances[0].render).toHaveBeenCalled();
    const sortOrder = sparkInstances[0].update.mock.invocationCallOrder[0];
    const drawOrder = rendererInstances[0].render.mock.invocationCallOrder[0];
    expect(sortOrder).toBeLessThan(drawOrder);
  });

  it('sorts against the same scene and camera it then draws', async () => {
    render(<SplatCanvas splatUrl={URL_A} />);
    meshInstances[0].land();
    await settle();
    await nextFrame();

    await waitFor(() => expect(rendererInstances[0].render).toHaveBeenCalled());
    const sorted = sparkInstances[0].update.mock.calls[0][0];
    const [drawnScene, drawnCamera] = rendererInstances[0].render.mock.calls[0];
    expect(sorted.scene).toBe(drawnScene);
    expect(sorted.camera).toBe(drawnCamera);
  });
});

describe('SplatCanvas — teardown', () => {
  it('frees both parts when unmounted BEFORE the splat resolves', async () => {
    const { unmount } = render(<SplatCanvas splatUrl={URL_A} />);
    const [spark] = sparkInstances;
    const [mesh] = meshInstances;

    unmount();

    expect(mesh.dispose).toHaveBeenCalled();
    expect(spark.dispose).toHaveBeenCalled();
    expect(rendererInstances[0].dispose).toHaveBeenCalled();
    expect(rendererInstances[0].forceContextLoss).toHaveBeenCalled();
  });

  it('frees a splat that ARRIVES after unmount rather than attaching it', async () => {
    const { unmount } = render(<SplatCanvas splatUrl={URL_A} />);
    const [mesh] = meshInstances;
    const [spark] = sparkInstances;
    unmount();
    mesh.dispose.mockClear();
    spark.dispose.mockClear();

    mesh.land();
    await settle();

    // The late-arrival guard disposes again rather than building a scene on a
    // dead renderer; a second dispose is harmless and a missing one is a leak.
    expect(mesh.dispose).toHaveBeenCalled();
    expect(spark.dispose).toHaveBeenCalled();
    expect(rendererInstances[0].render).not.toHaveBeenCalled();
  });

  it('frees parts, renderer, and GPU context when unmounted after it resolves', async () => {
    const { unmount } = render(<SplatCanvas splatUrl={URL_A} />);
    meshInstances[0].land();
    await settle();

    unmount();

    expect(meshInstances[0].dispose).toHaveBeenCalled();
    expect(sparkInstances[0].dispose).toHaveBeenCalled();
    expect(rendererInstances[0].dispose).toHaveBeenCalled();
    expect(rendererInstances[0].forceContextLoss).toHaveBeenCalled();
    // Mesh before renderer: the library frees the packed buffers, then the thing
    // that services them.
    expect(meshInstances[0].dispose.mock.invocationCallOrder[0]).toBeLessThan(
      sparkInstances[0].dispose.mock.invocationCallOrder[0],
    );
  });

  it('removes its canvas from the DOM on unmount', () => {
    const { container, unmount } = render(<SplatCanvas splatUrl={URL_A} />);
    expect(container.querySelector('canvas')).toBeInTheDocument();
    unmount();
    expect(container.querySelector('canvas')).not.toBeInTheDocument();
  });

  it('leaves nothing behind under StrictMode’s double invoke', () => {
    const { container } = render(
      <StrictMode>
        <SplatCanvas splatUrl={URL_A} />
      </StrictMode>,
    );
    // Each mount gets its own canvas and its own parts; the discarded first pass
    // is fully disposed, which is what makes the double invoke safe.
    expect(container.querySelectorAll('canvas')).toHaveLength(1);
    expect(sparkInstances.length).toBe(rendererInstances.length);
    const disposedRenderers = rendererInstances.filter((r) => r.dispose.mock.calls.length);
    expect(disposedRenderers).toHaveLength(rendererInstances.length - 1);
  });

  it('rebuilds from scratch when the URL changes', async () => {
    const { rerender } = render(<SplatCanvas splatUrl={URL_A} />);
    const first = meshInstances[0];

    rerender(<SplatCanvas splatUrl="/fixtures/splat/other.ply" />);

    expect(first.dispose).toHaveBeenCalled();
    expect(meshInstances).toHaveLength(2);
    expect(meshInstances[1].url).toBe('/fixtures/splat/other.ply');
  });
});

describe('SplatCanvas — failure states', () => {
  it('degrades to a quiet line and frees the parts when the splat won’t load', async () => {
    render(<SplatCanvas splatUrl={URL_A} />);
    meshInstances[0].fail();
    await settle();

    expect(
      await screen.findByText(
        'The walkthrough couldn’t be loaded — Mesh and Plan carry the room.',
      ),
    ).toBeInTheDocument();
    expect(meshInstances[0].dispose).toHaveBeenCalled();
    expect(sparkInstances[0].dispose).toHaveBeenCalled();
  });

  it('says so plainly when the device has no WebGL at all', () => {
    contextAvailable = false;
    const { container } = render(<SplatCanvas splatUrl={URL_A} />);

    expect(
      screen.getByText('This device can’t render Splat — Mesh and Plan carry the room.'),
    ).toBeInTheDocument();
    // Nothing was constructed on a renderer that never worked, and no orphan
    // <canvas> was left in the document.
    expect(sparkInstances).toHaveLength(0);
    expect(meshInstances).toHaveLength(0);
    expect(rendererInstances[0].dispose).toHaveBeenCalled();
    expect(container.querySelector('canvas')).not.toBeInTheDocument();
  });
});
