import { act, render, screen } from '@testing-library/react';
import { useLensFrame } from '../use-lens-frame';
import type { DocumentIndexKey } from '@/lib/document/document-index';

/**
 * The global IntersectionObserver mock (`jest.setup.js:48-56`) records nothing
 * and never fires, so a test written against it cannot tell an observed
 * element from an unobserved one — which is the whole subject here. This file
 * installs a CAPTURING mock: it keeps what `observe()` was actually handed,
 * and `deliver()` refuses to report anything outside that set. An assertion
 * that a yield turned on is therefore an assertion that the element was
 * attached.
 */
class CapturingIntersectionObserver implements IntersectionObserver {
  static instances: CapturingIntersectionObserver[] = [];

  readonly root = null;
  readonly rootMargin: string;
  readonly thresholds: readonly number[] = [0];
  readonly observed = new Set<Element>();

  constructor(
    private readonly callback: IntersectionObserverCallback,
    options?: IntersectionObserverInit,
  ) {
    this.rootMargin = (options?.rootMargin as string) ?? '';
    CapturingIntersectionObserver.instances.push(this);
  }

  observe(el: Element) {
    this.observed.add(el);
  }
  unobserve(el: Element) {
    this.observed.delete(el);
  }
  disconnect() {
    this.observed.clear();
  }
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  deliver(entries: Array<[Element, boolean]>) {
    const live = entries.filter(([el]) => this.observed.has(el));
    if (live.length === 0) return;
    this.callback(
      live.map(
        ([target, isIntersecting]) =>
          ({ target, isIntersecting }) as unknown as IntersectionObserverEntry,
      ),
      this as unknown as IntersectionObserver,
    );
  }
}

/** The two observers, in construction order: the letterhead's, then the heads'. */
const letterheadObserver = () => {
  const observer = CapturingIntersectionObserver.instances[0];
  if (!observer) throw new Error('no letterhead observer was constructed');
  return observer;
};
const headObserver = () => {
  const observer = CapturingIntersectionObserver.instances[1];
  if (!observer) throw new Error('no head observer was constructed');
  return observer;
};

function Probe() {
  const { letterheadInFrame, headInFrame } = useLensFrame();
  return (
    <div>
      <span data-testid="letterhead">{String(letterheadInFrame)}</span>
      <span data-testid="head">{headInFrame ?? 'none'}</span>
    </div>
  );
}

/** The paper, with one head per region root plus one inner head that is not
 *  the stop's own — the shape `schedule-rule` and `working-boards` make. */
function paper(keys: readonly DocumentIndexKey[]) {
  const main = document.createElement('main');
  main.setAttribute('data-document-paper', '');
  for (const key of keys) {
    const root = document.createElement('section');
    root.setAttribute('data-index-region', key);
    const head = document.createElement('div');
    head.setAttribute('data-region-head', key);
    head.id = `head-${key}`;
    root.appendChild(head);
    const inner = document.createElement('div');
    inner.setAttribute('data-region-head', `${key}-rule`);
    inner.id = `inner-${key}`;
    root.appendChild(inner);
    main.appendChild(root);
  }
  document.body.appendChild(main);
  return main;
}

const letterhead = () => {
  const header = document.createElement('header');
  header.id = 'document-project-status';
  document.body.appendChild(header);
  return header;
};

/** The head observer re-attaches inside a rAF the MutationObserver queues. */
const flushAttach = async () => {
  // MutationObserver delivers on a microtask; the re-attach it queues runs a
  // frame later.
  await act(async () => {
    await Promise.resolve();
  });
  act(() => {
    jest.advanceTimersByTime(32);
  });
};

describe('useLensFrame', () => {
  const realIO = global.IntersectionObserver;

  beforeEach(() => {
    jest.useFakeTimers();
    CapturingIntersectionObserver.instances = [];
    global.IntersectionObserver =
      CapturingIntersectionObserver as unknown as typeof IntersectionObserver;
  });

  afterEach(() => {
    document.body.innerHTML = '';
    global.IntersectionObserver = realIO;
    jest.useRealTimers();
  });

  it('opens with the letterhead in frame — s0 is where every document opens', () => {
    letterhead();
    render(<Probe />);

    expect(screen.getByTestId('letterhead')).toHaveTextContent('true');
    expect(screen.getByTestId('head')).toHaveTextContent('none');
  });

  it('observes the letterhead itself and reports it leaving the viewport', () => {
    const header = letterhead();
    render(<Probe />);

    expect(letterheadObserver().observed.has(header)).toBe(true);

    act(() => letterheadObserver().deliver([[header, false]]));
    expect(screen.getByTestId('letterhead')).toHaveTextContent('false');

    act(() => letterheadObserver().deliver([[header, true]]));
    expect(screen.getByTestId('letterhead')).toHaveTextContent('true');
  });

  it('names the stop whose own region head is in the frame’s top band', () => {
    letterhead();
    paper(['approvals', 'ffe']);
    render(<Probe />);

    const head = document.getElementById('head-ffe')!;
    act(() => headObserver().deliver([[head, true]]));
    expect(screen.getByTestId('head')).toHaveTextContent('ffe');

    act(() => headObserver().deliver([[head, false]]));
    expect(screen.getByTestId('head')).toHaveTextContent('none');
  });

  it('bottom-margins the head observer to the top 15% of the frame (L-3)', () => {
    letterhead();
    paper(['approvals']);
    render(<Probe />);

    expect(headObserver().rootMargin).toBe('0px 0px -85% 0px');
    // The letterhead's own observer takes the whole viewport — a different
    // question, a different geometry.
    expect(letterheadObserver().rootMargin).toBe('');
  });

  it('observes one head per stop — the region’s own, not its inner heads', () => {
    letterhead();
    paper(['approvals', 'money']);
    render(<Probe />);

    const observed = Array.from(headObserver().observed).map((el) => el.id);
    expect(observed).toEqual(['head-approvals', 'head-money']);
    expect(observed).not.toContain('inner-approvals');
  });

  it('attaches a region that mounts after the first paint', async () => {
    letterhead();
    render(<Probe />);
    expect(headObserver().observed.size).toBe(0);

    paper(['care']);
    await flushAttach();

    const head = document.getElementById('head-care')!;
    expect(headObserver().observed.has(head)).toBe(true);
    act(() => headObserver().deliver([[head, true]]));
    expect(screen.getByTestId('head')).toHaveTextContent('care');
  });

  it('drops the yield when the region carrying it leaves the paper', async () => {
    letterhead();
    const main = paper(['schedule']);
    render(<Probe />);

    const head = document.getElementById('head-schedule')!;
    act(() => headObserver().deliver([[head, true]]));
    expect(screen.getByTestId('head')).toHaveTextContent('schedule');

    main.remove();
    await flushAttach();
    expect(screen.getByTestId('head')).toHaveTextContent('none');
  });

  it('disconnects both observers on unmount', () => {
    const header = letterhead();
    paper(['ffe']);
    const view = render(<Probe />);

    expect(letterheadObserver().observed.has(header)).toBe(true);
    expect(headObserver().observed.size).toBe(1);

    view.unmount();
    expect(letterheadObserver().observed.size).toBe(0);
    expect(headObserver().observed.size).toBe(0);
  });

  it('renders without an IntersectionObserver at all (SSR-safe)', () => {
    // @ts-expect-error — the hook's own guard is what is under test.
    delete global.IntersectionObserver;
    letterhead();
    paper(['ffe']);

    expect(() => render(<Probe />)).not.toThrow();
    expect(screen.getByTestId('letterhead')).toHaveTextContent('true');
    expect(screen.getByTestId('head')).toHaveTextContent('none');
  });
});
