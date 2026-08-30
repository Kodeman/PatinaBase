/**
 * The density observer, at the only two geometries it owns: the lookahead that
 * promotes a region 240px below the frame, and the settle that decides WHEN the
 * promotion is allowed to land.
 *
 * The global IntersectionObserver mock (`jest.setup.js:48-56`) accepts an
 * `observe` and never fires, so every assertion here would pass on an observer
 * that was never wired. This suite installs a CAPTURING mock instead: it keeps
 * the callback and the options, so the test drives the entries itself and can
 * read back the rootMargin the hook actually asked for.
 */

import { createRef } from 'react';
import type { RefObject } from 'react';
import { act, render } from '@testing-library/react';
import { useLensDensity, useLensDensityStore } from '../use-lens-density';
import type { LensDensityApi } from '../use-lens-density';

/** D-B46's first half. The hook reads the live query count; the suite drives
 *  it, so a paper can be held "still loading" for as long as a case needs. */
let fetching = 0;
jest.mock('@tanstack/react-query', () => ({
  QueryClientContext: jest
    .requireActual('react')
    .createContext(undefined),
  QueryClient: class {},
  useIsFetching: () => fetching,
}));

class CapturingIntersectionObserver {
  static instances: CapturingIntersectionObserver[] = [];

  readonly observed = new Set<Element>();
  disconnected = false;

  constructor(
    private readonly callback: IntersectionObserverCallback,
    readonly options: IntersectionObserverInit | undefined,
  ) {
    CapturingIntersectionObserver.instances.push(this);
  }

  observe(target: Element): void {
    this.observed.add(target);
  }

  unobserve(target: Element): void {
    this.observed.delete(target);
  }

  disconnect(): void {
    this.disconnected = true;
    this.observed.clear();
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  fire(targets: Element[], isIntersecting = true): void {
    // An entry that says "intersecting" is a statement about geometry, and the
    // hook re-measures position at the moment it writes (a queued entry can
    // outlive the paper it was computed against). So a fired crossing brings
    // its target to the line, or the fixture would be asserting against a
    // reading the browser could never produce.
    if (isIntersecting) {
      for (const target of targets) {
        topAt(target as HTMLElement, window.innerHeight);
      }
    }
    this.callback(
      targets.map(
        (target) =>
          ({ target, isIntersecting }) as unknown as IntersectionObserverEntry,
      ),
      this as unknown as IntersectionObserver,
    );
  }
}

const REGION_KEYS = ['approvals', 'schedule', 'ffe', 'money'] as const;

let api: LensDensityApi;

function Probe({
  enabled = true,
  watch = 'ffe',
  paperRef,
}: {
  enabled?: boolean;
  watch?: string;
  paperRef?: RefObject<HTMLElement | null>;
}) {
  api = useLensDensity(paperRef, { enabled });
  const spoken = useLensDensityStore(watch);
  return <span data-testid="spoken">{spoken ?? 'silent'}</span>;
}

function mountPaper(keys: readonly string[] = REGION_KEYS) {
  const shell = document.createElement('div');
  shell.setAttribute('data-document-shell', '');
  const paper = document.createElement('main');
  paper.setAttribute('data-document-paper', '');
  keys.forEach((key, index) => {
    const region = document.createElement('section');
    region.setAttribute('data-index-region', key);
    // What React renders from the fold hook's own default; the lens only ever
    // overwrites it with `full`.
    region.setAttribute('data-density', 'quiet');
    // jsdom lays nothing out, and an unstubbed rect reads top 0 — inside the
    // lookahead, where discovery would promote every root on sight. Start them
    // all well below the line and let each test bring up the one it means.
    topAt(region, 2000 + index * 600);
    paper.appendChild(region);
  });
  shell.appendChild(paper);
  document.body.appendChild(shell);
  // D-B46's second half: jsdom lays nothing out, so `scrollHeight` is 0 for
  // every element and a paper would never look resolved. The suite states the
  // height it means, and changes it to play a paper that is still growing.
  setPaperHeight(paper, 5000);
  return { shell, paper };
}

function setPaperHeight(paper: HTMLElement, height: number) {
  Object.defineProperty(paper, 'scrollHeight', {
    value: height,
    configurable: true,
  });
}

function regionRoot(key: string): HTMLElement {
  return document.querySelector<HTMLElement>(`[data-index-region="${key}"]`)!;
}

function observer(): CapturingIntersectionObserver {
  return CapturingIntersectionObserver.instances[0];
}

/** Attributes are written inside a rAF; a `MutationObserver` delivers on a
 *  microtask. Both have to drain before the DOM can be read. The default is
 *  six frames rather than two because D-B46's gate spends four of them: one to
 *  take the paper's first height, three to watch it hold. */
async function flush(ms = 96) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

function scrollTo(y: number) {
  Object.defineProperty(window, 'scrollY', {
    value: y,
    writable: true,
    configurable: true,
  });
  window.dispatchEvent(new Event('scroll'));
}

function topAt(root: HTMLElement, top: number, height = 500) {
  root.getBoundingClientRect = () =>
    ({
      top,
      bottom: top + height,
      left: 0,
      right: 0,
      width: 0,
      height,
    }) as DOMRect;
}

function bottomAt(root: HTMLElement, bottom: number) {
  topAt(root, bottom - 100, 100);
}

describe('useLensDensity', () => {
  const realIntersectionObserver = global.IntersectionObserver;

  beforeEach(() => {
    jest.useFakeTimers();
    fetching = 0;
    document.body.innerHTML = '';
    CapturingIntersectionObserver.instances = [];
    global.IntersectionObserver =
      CapturingIntersectionObserver as unknown as typeof IntersectionObserver;
    Object.defineProperty(window, 'scrollY', {
      value: 0,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    global.IntersectionObserver = realIntersectionObserver;
    delete window.__lensSettled;
    jest.useRealTimers();
  });

  it('watches every root at one threshold, 240px below the frame', async () => {
    mountPaper();
    render(<Probe />);
    await flush();

    expect(CapturingIntersectionObserver.instances).toHaveLength(1);
    expect(observer().options).toMatchObject({
      root: null,
      rootMargin: '0px 0px 240px 0px',
      threshold: 0,
    });
    expect(observer().observed.size).toBe(REGION_KEYS.length);
  });

  it('promotes a root the first time it crosses, and tells that region alone', async () => {
    mountPaper();
    const { getByTestId } = render(<Probe watch="ffe" />);
    await flush();
    expect(getByTestId('spoken')).toHaveTextContent('silent');

    await act(async () => {
      observer().fire([regionRoot('ffe')]);
      jest.advanceTimersByTime(32);
    });

    expect(regionRoot('ffe')).toHaveAttribute('data-density', 'full');
    expect(getByTestId('spoken')).toHaveTextContent('full');
    expect(api.getDensity('ffe')).toBe('full');

    // One region promoted is one region promoted.
    expect(regionRoot('money')).toHaveAttribute('data-density', 'quiet');
    expect(api.getDensity('money')).toBeNull();
  });

  it('never takes a promotion back — the observer stops watching, and a later miss says nothing', async () => {
    mountPaper();
    render(<Probe />);
    await flush();

    const ffe = regionRoot('ffe');
    await act(async () => {
      observer().fire([ffe]);
      jest.advanceTimersByTime(32);
    });
    expect(observer().observed.has(ffe)).toBe(false);

    await act(async () => {
      observer().fire([ffe], false);
      jest.advanceTimersByTime(32);
    });
    expect(ffe).toHaveAttribute('data-density', 'full');
    expect(api.getDensity('ffe')).toBe('full');
  });

  it('writes data-passed once, and never removes it', async () => {
    mountPaper();
    render(<Probe />);
    await flush();

    const approvals = regionRoot('approvals');
    const write = jest.spyOn(approvals, 'setAttribute');

    bottomAt(approvals, -10);
    await act(async () => {
      scrollTo(600);
      jest.advanceTimersByTime(32);
    });
    expect(approvals).toHaveAttribute('data-passed', '');

    // Back up the paper: the region is in frame again, and keeps the mark.
    bottomAt(approvals, 400);
    await act(async () => {
      scrollTo(590);
      jest.advanceTimersByTime(200);
    });
    expect(approvals).toHaveAttribute('data-passed', '');
    expect(
      write.mock.calls.filter(([name]) => name === 'data-passed'),
    ).toHaveLength(1);
  });

  it('picks up a root that mounts after the paper did', async () => {
    const { paper } = mountPaper(['approvals']);
    render(<Probe watch="care" />);
    await flush();
    expect(observer().observed.size).toBe(1);

    const late = document.createElement('section');
    late.setAttribute('data-index-region', 'care');
    late.setAttribute('data-density', 'quiet');
    // Below the lookahead line, so discovery hands it to the observer rather
    // than promoting it on sight.
    topAt(late, 3000);
    // The mutation record lands on a microtask; the re-discovery it queues is
    // one frame behind it.
    await act(async () => {
      paper.appendChild(late);
    });
    await flush();
    expect(observer().observed.has(late)).toBe(true);

    await act(async () => {
      observer().fire([late]);
      jest.advanceTimersByTime(32);
    });
    expect(late).toHaveAttribute('data-density', 'full');
  });

  it('holds a crossing through a fling and lands the whole buffer on the settle, in paper order', async () => {
    const { shell } = mountPaper();
    render(<Probe />);
    await flush();
    expect(shell).toHaveAttribute('data-lens-settled', 'true');

    // A fling: 1000px in one frame.
    await act(async () => {
      scrollTo(1000);
      jest.advanceTimersByTime(32);
    });
    expect(shell).toHaveAttribute('data-lens-settled', 'false');

    const order: string[] = [];
    for (const key of ['money', 'ffe'] as const) {
      const root = regionRoot(key);
      const write = root.setAttribute.bind(root);
      root.setAttribute = (name: string, value: string) => {
        if (name === 'data-density') order.push(key);
        write(name, value);
      };
    }

    await act(async () => {
      observer().fire([regionRoot('money'), regionRoot('ffe')]);
      jest.advanceTimersByTime(32);
    });
    expect(regionRoot('ffe')).toHaveAttribute('data-density', 'quiet');
    expect(regionRoot('money')).toHaveAttribute('data-density', 'quiet');

    // D-B32 — was: a slow frame re-armed the window, so the buffer waited for
    // 120ms of quiet after ANY frame. The window now runs from the last FAST
    // frame, so nothing more need arrive for it to land.
    await flush(40);
    expect(regionRoot('ffe')).toHaveAttribute('data-density', 'quiet');

    await flush(80);
    expect(regionRoot('ffe')).toHaveAttribute('data-density', 'full');
    expect(regionRoot('money')).toHaveAttribute('data-density', 'full');
    expect(shell).toHaveAttribute('data-lens-settled', 'true');
    // Paper order, not the order the entries arrived in.
    expect(order).toEqual(['ffe', 'money']);
  });

  it('resolves __lensSettled at the settle, and at once when already settled', async () => {
    mountPaper();
    render(<Probe />);
    await flush();

    await expect(window.__lensSettled!()).resolves.toBe(true);

    await act(async () => {
      scrollTo(1000);
      jest.advanceTimersByTime(32);
    });

    let landed: unknown = null;
    void window.__lensSettled!().then((value) => {
      landed = value;
    });
    await flush();
    expect(landed).toBeNull();

    // No nudge: the window closes on its own, 120ms after the fast frame.
    await flush(160);
    expect(landed).toBe(true);
  });

  it('forces every region through the press target to full, in one commit', async () => {
    mountPaper();
    render(<Probe />);
    await flush();

    await act(async () => {
      api.forceFullThrough('ffe');
    });

    expect(regionRoot('approvals')).toHaveAttribute('data-density', 'full');
    expect(regionRoot('schedule')).toHaveAttribute('data-density', 'full');
    expect(regionRoot('ffe')).toHaveAttribute('data-density', 'full');
    // Nothing beyond the target.
    expect(regionRoot('money')).toHaveAttribute('data-density', 'quiet');
  });

  it('with the lens off, prints every region full and installs no observer', async () => {
    mountPaper();
    const { getByTestId } = render(<Probe enabled={false} />);
    await flush();

    expect(CapturingIntersectionObserver.instances).toHaveLength(0);
    for (const key of REGION_KEYS) {
      expect(regionRoot(key)).toHaveAttribute('data-density', 'full');
    }
    expect(getByTestId('spoken')).toHaveTextContent('full');
  });

  it('lets go of everything on unmount', async () => {
    const { paper } = mountPaper();
    const { unmount } = render(<Probe />);
    await flush();

    await act(async () => {
      observer().fire([regionRoot('ffe')]);
      jest.advanceTimersByTime(32);
    });
    expect(api.getDensity('ffe')).toBe('full');

    const io = observer();
    unmount();
    expect(io.disconnected).toBe(true);
    expect(window.__lensSettled).toBeUndefined();
    expect(api.getDensity('ffe')).toBeNull();

    const late = document.createElement('section');
    late.setAttribute('data-index-region', 'care');
    await act(async () => {
      paper.appendChild(late);
    });
    await flush();
    expect(io.observed.has(late)).toBe(false);
    expect(late).not.toHaveAttribute('data-density');
  });

  // ── D-B46 · the resolution gate ──────────────────────────────────────────
  // Was: "promotes what is already in frame before paint" — the layout-effect
  // pass ran at mount and its promotions were asserted synchronously after
  // `render()`. The lead's cold-load probe showed what that measured: five
  // roots mounting into a ~2,600px skeleton put `money` and `record` inside
  // `innerHeight + 240`, and one direction meant `record` stood `full` 9,033px
  // below the frame on every cold load. The pass now waits for the paper.

  it('promotes nothing into a paper that is still growing', async () => {
    const { paper } = mountPaper();
    topAt(regionRoot('approvals'), 40);
    topAt(regionRoot('schedule'), 300);
    topAt(regionRoot('ffe'), 600);

    const { getByTestId } = render(<Probe watch="approvals" />);

    // The skeleton grows every frame, exactly as the bodies resolve.
    let height = 400;
    for (let frame = 0; frame < 12; frame += 1) {
      height += 400;
      setPaperHeight(paper, height);
      await flush(16);
      expect(regionRoot('approvals')).toHaveAttribute('data-density', 'quiet');
    }

    expect(regionRoot('schedule')).toHaveAttribute('data-density', 'quiet');
    expect(regionRoot('ffe')).toHaveAttribute('data-density', 'quiet');
    expect(getByTestId('spoken')).toHaveTextContent('silent');
    expect(
      document.querySelector('[data-document-shell]'),
    ).not.toHaveAttribute('data-lens-resolved');
  });

  it('promotes nothing while a query is still fetching, however still the paper is', async () => {
    fetching = 1;
    mountPaper();
    topAt(regionRoot('approvals'), 40);

    render(<Probe watch="approvals" />);
    await flush(320);

    expect(regionRoot('approvals')).toHaveAttribute('data-density', 'quiet');
    expect(
      document.querySelector('[data-document-shell]'),
    ).not.toHaveAttribute('data-lens-resolved');
    // Observed, ordered, waiting — the gate defers the promotion, it does not
    // drop the root.
    expect(observer().observed.has(regionRoot('approvals'))).toBe(true);
  });

  it('runs D-B15(c)\u2019s pass the moment the paper resolves, and only on the roots at the line', async () => {
    const { shell, paper } = mountPaper();
    topAt(regionRoot('approvals'), 40);
    topAt(regionRoot('schedule'), window.innerHeight + 200);
    topAt(regionRoot('ffe'), window.innerHeight + 400);

    fetching = 1;
    setPaperHeight(paper, 9000);
    const { getByTestId, rerender } = render(<Probe watch="approvals" />);
    await flush(160);
    expect(regionRoot('approvals')).toHaveAttribute('data-density', 'quiet');

    // The last query settles. In product `useIsFetching` is a subscription and
    // that is the render; here the re-render is the subscription's stand-in.
    fetching = 0;
    rerender(<Probe watch="approvals" />);
    await flush();

    // In frame, and inside the 240 lookahead: promoted.
    expect(regionRoot('approvals')).toHaveAttribute('data-density', 'full');
    expect(regionRoot('schedule')).toHaveAttribute('data-density', 'full');
    // 400px below the line: not.
    expect(regionRoot('ffe')).toHaveAttribute('data-density', 'quiet');
    expect(regionRoot('money')).toHaveAttribute('data-density', 'quiet');
    expect(getByTestId('spoken')).toHaveTextContent('full');
    expect(shell).toHaveAttribute('data-lens-resolved', 'true');
  });

  it('runs the same pass at the 3000ms deadline when the paper never settles', async () => {
    const { shell, paper } = mountPaper();
    topAt(regionRoot('approvals'), 40);

    // A query that keeps retrying: the gate's first half never opens.
    fetching = 1;
    render(<Probe watch="approvals" />);

    let height = 400;
    for (let frame = 0; frame < 20; frame += 1) {
      height += 100;
      setPaperHeight(paper, height);
      await flush(16);
    }
    expect(regionRoot('approvals')).toHaveAttribute('data-density', 'quiet');

    await flush(3000);

    expect(regionRoot('approvals')).toHaveAttribute('data-density', 'full');
    expect(shell).toHaveAttribute('data-lens-resolved', 'true');
  });

  it('resolves a warm paper inside three frames — D-B15\u2019s no-flash intent, to within the gate', async () => {
    const { shell } = mountPaper();
    topAt(regionRoot('approvals'), 40);

    // Warm: the cache is primed, so nothing is fetching and the paper is laid
    // out at its full height on the first commit.
    render(<Probe watch="approvals" />);
    await flush(64);

    expect(shell).toHaveAttribute('data-lens-resolved', 'true');
    expect(regionRoot('approvals')).toHaveAttribute('data-density', 'full');
  });

  it('buffers a crossing made during the load and lands it at resolution', async () => {
    const { paper } = mountPaper();
    fetching = 1;
    const { rerender } = render(<Probe />);
    await flush();

    // She is scrolling while the paper loads — the crossing is real, and it
    // waits for a paper that can be measured.
    await act(async () => {
      observer().fire([regionRoot('money')]);
      jest.advanceTimersByTime(32);
    });
    expect(regionRoot('money')).toHaveAttribute('data-density', 'quiet');

    fetching = 0;
    rerender(<Probe />);
    setPaperHeight(paper, 5000);
    await flush();

    expect(regionRoot('money')).toHaveAttribute('data-density', 'full');
  });

  it('lands a press before the paper resolves — a press is her, not the lens guessing', async () => {
    mountPaper();
    fetching = 1;
    render(<Probe />);
    await flush(160);
    expect(regionRoot('approvals')).toHaveAttribute('data-density', 'quiet');

    await act(async () => {
      api.forceFullThrough('ffe');
    });

    expect(regionRoot('approvals')).toHaveAttribute('data-density', 'full');
    expect(regionRoot('schedule')).toHaveAttribute('data-density', 'full');
    expect(regionRoot('ffe')).toHaveAttribute('data-density', 'full');
    expect(regionRoot('money')).toHaveAttribute('data-density', 'quiet');
  });

  it('promotes a deep landing once resolved — in frame and inside the lookahead', async () => {
    const { paper } = mountPaper();
    render(<Probe />);
    await flush();

    // She lands deep on the paper: a late root arrives above the frame, and
    // another just inside the line.
    const above = document.createElement('section');
    above.setAttribute('data-index-region', 'record');
    above.setAttribute('data-density', 'quiet');
    topAt(above, -900);
    const ahead = document.createElement('section');
    ahead.setAttribute('data-index-region', 'care');
    ahead.setAttribute('data-density', 'quiet');
    topAt(ahead, window.innerHeight + 100);

    await act(async () => {
      paper.appendChild(above);
      paper.appendChild(ahead);
    });
    await flush();

    expect(above).toHaveAttribute('data-density', 'full');
    expect(ahead).toHaveAttribute('data-density', 'full');
  });

  it('answers a root discovered above the frame — nothing below will ever cross for it', async () => {
    const { paper } = mountPaper(['ffe']);
    render(<Probe watch="care" />);
    await flush();

    // A deep landing: the region's query settles after the reader is already
    // past its slot, so a bottom-only rootMargin will never fire for it.
    const late = document.createElement('section');
    late.setAttribute('data-index-region', 'care');
    late.setAttribute('data-density', 'quiet');
    topAt(late, -800);
    await act(async () => {
      paper.appendChild(late);
    });
    await flush();

    expect(late).toHaveAttribute('data-density', 'full');
    expect(observer().observed.has(late)).toBe(false);
    expect(api.getDensity('care')).toBe('full');
  });

  it('buffers every crossing while frozen and lands them in one commit at the settle after', async () => {
    mountPaper();
    render(<Probe />);
    await flush();

    const ffe = regionRoot('ffe');
    const writes: string[] = [];
    const write = ffe.setAttribute.bind(ffe);
    ffe.setAttribute = (name: string, value: string) => {
      if (name === 'data-density') writes.push(value);
      write(name, value);
    };

    act(() => {
      api.freeze(true);
    });

    await act(async () => {
      observer().fire([ffe]);
      jest.advanceTimersByTime(32);
    });
    expect(ffe).toHaveAttribute('data-density', 'quiet');

    // W4-C5: at rest there is no next settle to wait for, so the thaw itself
    // drains the buffer on the next frame. The old assertion here ("unfreezing
    // commits nothing by itself") locked in the defect: a reader who ticked a
    // checklist box and then stopped scrolling held every buffered crossing
    // quiet indefinitely.
    act(() => {
      api.freeze(false);
    });
    await flush();

    expect(ffe).toHaveAttribute('data-density', 'full');
    expect(writes).toEqual(['full']);
  });

  it('thawing mid-scroll leaves the buffer to the settle that is already armed', async () => {
    const { shell } = mountPaper();
    render(<Probe />);
    await flush();

    const ffe = regionRoot('ffe');

    act(() => {
      api.freeze(true);
    });

    // One fast frame: unsettled, with the settle timer armed on that same
    // frame (D-B32).
    await act(async () => {
      scrollTo(400);
      jest.advanceTimersByTime(32);
    });
    expect(shell).toHaveAttribute('data-lens-settled', 'false');

    await act(async () => {
      observer().fire([ffe]);
      jest.advanceTimersByTime(32);
    });
    expect(ffe).toHaveAttribute('data-density', 'quiet');

    act(() => {
      api.freeze(false);
    });
    // Still mid-flight: the thaw queues nothing, because a settle is coming.
    expect(ffe).toHaveAttribute('data-density', 'quiet');

    await flush(160);
    expect(shell).toHaveAttribute('data-lens-settled', 'true');
    expect(ffe).toHaveAttribute('data-density', 'full');
  });

  it('leaves the press with heights, not promises — the store is current before the handler returns', async () => {
    mountPaper();
    const { getByTestId } = render(<Probe watch="ffe" />);
    await flush();

    let spokenDuring = '';
    act(() => {
      api.forceFullThrough('ffe');
      spokenDuring = getByTestId('spoken').textContent ?? '';
    });

    expect(spokenDuring).toBe('full');
  });

  it('settles 120ms after a jump — one scroll event, no nudge to follow it', async () => {
    const { shell } = mountPaper();
    render(<Probe />);
    await flush();

    // `window.scrollTo` fires exactly one event, and its travel is always over
    // the gate. Nothing else is coming.
    await act(async () => {
      scrollTo(400);
      jest.advanceTimersByTime(32);
    });
    expect(shell).toHaveAttribute('data-lens-settled', 'false');

    let landed: unknown = null;
    void window.__lensSettled!().then((value) => {
      landed = value;
    });

    await flush(140);
    expect(shell).toHaveAttribute('data-lens-settled', 'true');
    expect(landed).toBe(true);
  });

  it('never unsettles under a slow drift, and commits into it', async () => {
    const { shell } = mountPaper();
    render(<Probe />);
    await flush();

    const ffe = regionRoot('ffe');
    let y = 0;
    for (let frame = 0; frame < 60; frame += 1) {
      y += 10;
      await act(async () => {
        scrollTo(y);
        jest.advanceTimersByTime(32);
      });
      // Every frame is under the gate, so the gate never opens — a drift that
      // unsettled would hold back the promotions L-4 makes ahead of her.
      expect(shell).toHaveAttribute('data-lens-settled', 'true');

      if (frame === 29) {
        await act(async () => {
          observer().fire([ffe]);
          jest.advanceTimersByTime(32);
        });
        // Mid-drift, with 30 frames still to come: committed already.
        expect(ffe).toHaveAttribute('data-density', 'full');
      }
    }
  });

  it('settles 120ms after the last fast frame, though slow frames keep arriving', async () => {
    const { shell } = mountPaper();
    render(<Probe />);
    await flush();

    await act(async () => {
      scrollTo(400);
      jest.advanceTimersByTime(32);
    });
    expect(shell).toHaveAttribute('data-lens-settled', 'false');

    // Three slow frames inside the window: they neither unsettle nor delay.
    let y = 400;
    for (let frame = 0; frame < 3; frame += 1) {
      y += 10;
      await act(async () => {
        scrollTo(y);
        jest.advanceTimersByTime(32);
      });
    }
    expect(shell).toHaveAttribute('data-lens-settled', 'false');

    // One more slow frame carries us past 120ms from the fast one.
    await act(async () => {
      scrollTo(y + 10);
      jest.advanceTimersByTime(32);
    });
    expect(shell).toHaveAttribute('data-lens-settled', 'true');
  });

  it('carries the settled state from the first commit, even when the shell arrives late', async () => {
    // The hook attaches above the page's early returns: on the first pass the
    // document is still loading and there is neither shell nor paper to write
    // to. W4-C22: the real nesting is `shell > main[data-document-paper]`, so
    // the arrival that matters is the SHELL landing on the body — the branch
    // an earlier version of this test inverted by appending the shell inside
    // the paper.
    render(<Probe />);
    await flush();
    expect(document.querySelector('[data-document-shell]')).toBeNull();
    expect(document.querySelector('[data-document-paper]')).toBeNull();

    const shell = document.createElement('div');
    shell.setAttribute('data-document-shell', '');
    const paper = document.createElement('main');
    paper.setAttribute('data-document-paper', '');
    shell.appendChild(paper);
    await act(async () => {
      document.body.appendChild(shell);
    });
    await flush();

    expect(shell).toHaveAttribute('data-lens-settled', 'true');
  });

  it('re-discovers when the paper element itself is replaced', async () => {
    // W4-C6: `resolutionState` flipping back to `loading` unmounts `<main
    // data-document-paper>` and React mounts a NEW element in its place. A
    // MutationObserver that had narrowed to the old paper would be sitting on
    // a detached node and the lens would be dead for the rest of the page.
    const { shell, paper } = mountPaper();
    render(<Probe watch="ffe" />);
    await flush();
    expect(observer().observed.size).toBe(REGION_KEYS.length);

    await act(async () => {
      paper.remove();
    });
    await flush();

    const replacement = document.createElement('main');
    replacement.setAttribute('data-document-paper', '');
    const region = document.createElement('section');
    region.setAttribute('data-index-region', 'ffe');
    region.setAttribute('data-density', 'quiet');
    // Above the frame and wholly past it — the deep-landing case discovery is
    // the only answer to.
    topAt(region, -400, 100);
    replacement.appendChild(region);

    await act(async () => {
      shell.appendChild(replacement);
    });
    await flush();

    expect(region).toHaveAttribute('data-density', 'full');
    expect(region).toHaveAttribute('data-passed', '');
  });

  it('forgets a promoted key when its last root leaves the paper', async () => {
    // W4-C10: `promotedKeys` is module-level. A section switch mounts fresh
    // roots under the previous section's keys; promoting on the key alone
    // would render a region 3,000px below the frame `full` at first paint.
    const { paper } = mountPaper();
    const { getByTestId } = render(<Probe watch="ffe" />);
    await flush();

    await act(async () => {
      observer().fire([regionRoot('ffe')]);
      jest.advanceTimersByTime(32);
    });
    expect(api.getDensity('ffe')).toBe('full');

    await act(async () => {
      paper.innerHTML = '';
    });
    await flush();
    expect(api.getDensity('ffe')).toBeNull();
    expect(getByTestId('spoken')).toHaveTextContent('silent');

    // The new section's `ffe`, far below the frame: quiet, key or no key.
    const reborn = document.createElement('section');
    reborn.setAttribute('data-index-region', 'ffe');
    reborn.setAttribute('data-density', 'quiet');
    topAt(reborn, 4000);
    await act(async () => {
      paper.appendChild(reborn);
    });
    await flush();

    expect(reborn).toHaveAttribute('data-density', 'quiet');
    expect(api.getDensity('ffe')).toBeNull();
  });

  it('still opens a root React re-creates under a promoted key where its predecessor was', async () => {
    // The legitimate half of D-B16: position answers it, so dropping the
    // key-alone arm costs nothing.
    const { paper } = mountPaper();
    render(<Probe watch="ffe" />);
    await flush();

    await act(async () => {
      observer().fire([regionRoot('ffe')]);
      jest.advanceTimersByTime(32);
    });
    expect(api.getDensity('ffe')).toBe('full');

    const old = regionRoot('ffe');
    const reborn = document.createElement('section');
    reborn.setAttribute('data-index-region', 'ffe');
    reborn.setAttribute('data-density', 'quiet');
    topAt(reborn, 200);
    await act(async () => {
      paper.replaceChild(reborn, old);
    });
    await flush();

    expect(reborn).toHaveAttribute('data-density', 'full');
    expect(api.getDensity('ffe')).toBe('full');
  });

  it('holds a burst open until 120ms after its last frame', async () => {
    const { shell } = mountPaper();
    render(<Probe />);
    await flush();

    let y = 0;
    for (let frame = 0; frame < 5; frame += 1) {
      y += 60;
      await act(async () => {
        scrollTo(y);
        jest.advanceTimersByTime(32);
      });
      expect(shell).toHaveAttribute('data-lens-settled', 'false');
    }

    // 100ms after the last frame: still travelling, as far as the gate knows.
    await flush(100);
    expect(shell).toHaveAttribute('data-lens-settled', 'false');

    await flush(40);
    expect(shell).toHaveAttribute('data-lens-settled', 'true');
  });

  it.each([
    ['the paper itself', (paper: HTMLElement) => paper],
    ['an ancestor of the paper', (paper: HTMLElement) => paper.parentElement!],
    [
      'a descendant of the paper',
      (paper: HTMLElement) => paper.querySelector<HTMLElement>('section')!,
    ],
  ])('resolves the paper from a ref held on %s', async (_label, pick) => {
    // Every other case in this suite calls `useLensDensity(undefined, …)`, so
    // `resolvePaper`'s three `paperRef` arms — `matches`, `querySelector`,
    // `closest` — were never exercised at all.
    const { paper } = mountPaper();
    const ref = createRef<HTMLElement>();
    (ref as { current: HTMLElement | null }).current = pick(paper);

    render(<Probe paperRef={ref} watch="ffe" />);
    await flush();

    expect(observer().observed.size).toBe(REGION_KEYS.length);
    await act(async () => {
      observer().fire([regionRoot('ffe')]);
      jest.advanceTimersByTime(32);
    });
    expect(regionRoot('ffe')).toHaveAttribute('data-density', 'full');
  });

  it('hands each key its own reading', async () => {
    mountPaper();
    const money = render(<Probe watch="money" />);
    await flush();

    await act(async () => {
      observer().fire([regionRoot('money')]);
      jest.advanceTimersByTime(32);
    });

    expect(money.getByTestId('spoken')).toHaveTextContent('full');
    expect(api.getDensity('money')).toBe('full');
    expect(api.getDensity('approvals')).toBeNull();
    expect(api.getDensity('schedule')).toBeNull();
  });
});
