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

import { act, render } from '@testing-library/react';
import { useLensDensity, useLensDensityStore } from '../use-lens-density';
import type { LensDensityApi } from '../use-lens-density';

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
}: {
  enabled?: boolean;
  watch?: string;
}) {
  api = useLensDensity(undefined, { enabled });
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
  return { shell, paper };
}

function regionRoot(key: string): HTMLElement {
  return document.querySelector<HTMLElement>(`[data-index-region="${key}"]`)!;
}

function observer(): CapturingIntersectionObserver {
  return CapturingIntersectionObserver.instances[0];
}

/** Attributes are written inside a rAF; a `MutationObserver` delivers on a
 *  microtask. Both have to drain before the DOM can be read. */
async function flush(ms = 32) {
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

    // Slow enough to arm the gate, but not yet 120ms of it.
    await act(async () => {
      scrollTo(1010);
      jest.advanceTimersByTime(32);
    });
    await flush(80);
    expect(regionRoot('ffe')).toHaveAttribute('data-density', 'quiet');

    await flush(40);
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

    await act(async () => {
      scrollTo(1005);
      jest.advanceTimersByTime(32);
    });
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

  it('promotes what is already in frame before paint, with no observer record at all', async () => {
    mountPaper();
    // The first screen: approvals in the frame, schedule just under the
    // lookahead line, the rest far below it.
    topAt(regionRoot('approvals'), 40);
    topAt(regionRoot('schedule'), window.innerHeight + 200);

    const { getByTestId } = render(<Probe watch="approvals" />);

    // No flush, no entry fired: the layout effect has already corrected the
    // SSR-quiet markup, so hydration paints these full.
    expect(regionRoot('approvals')).toHaveAttribute('data-density', 'full');
    expect(regionRoot('schedule')).toHaveAttribute('data-density', 'full');
    expect(regionRoot('ffe')).toHaveAttribute('data-density', 'quiet');
    expect(getByTestId('spoken')).toHaveTextContent('full');

    // Promoted at discovery is promoted without ever being watched.
    expect(observer().observed.has(regionRoot('approvals'))).toBe(false);
    expect(observer().observed.has(regionRoot('ffe'))).toBe(true);
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

    // Unfreezing commits nothing by itself; the next settle does.
    act(() => {
      api.freeze(false);
    });
    await flush();
    expect(ffe).toHaveAttribute('data-density', 'quiet');

    await act(async () => {
      scrollTo(1000);
      jest.advanceTimersByTime(32);
    });
    await act(async () => {
      scrollTo(1010);
      jest.advanceTimersByTime(32);
    });
    await flush(160);

    expect(ffe).toHaveAttribute('data-density', 'full');
    expect(writes).toEqual(['full']);
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
