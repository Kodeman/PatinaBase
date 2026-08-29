import { act, fireEvent, render, screen } from '@testing-library/react';
import { useDocumentRunningIndex } from '../use-document-running-index';
import {
  DOCUMENT_INDEX_KEYS,
  UNFOLD_REGION_EVENT,
  type DocumentIndexKey,
} from '@/lib/document/document-index';

/**
 * The global IntersectionObserver mock (`jest.setup.js:48-56`) records nothing
 * and never fires, so a test written against it cannot tell an observed root
 * from an unobserved one — which is the whole subject here. This file installs
 * a CAPTURING mock instead: it keeps the elements actually handed to
 * `observe()`, and `deliver()` refuses to hand an entry to anything outside
 * that set. An assertion that the line moved is therefore an assertion
 * that the root was attached.
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

  deliver(states: Partial<Record<DocumentIndexKey, boolean>>) {
    const entries = Array.from(this.observed)
      .filter((el) => {
        const key = el.getAttribute('data-index-region') as DocumentIndexKey;
        return key in states;
      })
      .map((el) => {
        const key = el.getAttribute('data-index-region') as DocumentIndexKey;
        return {
          target: el,
          isIntersecting: states[key] as boolean,
        } as unknown as IntersectionObserverEntry;
      });
    if (entries.length === 0) return;
    this.callback(entries, this as unknown as IntersectionObserver);
  }
}

function liveObserver() {
  const live = CapturingIntersectionObserver.instances.at(-1);
  if (!live) throw new Error('no IntersectionObserver was constructed');
  return live;
}

/** Which roots the hook has actually attached, in DOM order. */
function attachedKeys(): DocumentIndexKey[] {
  return Array.from(liveObserver().observed).map(
    (el) => el.getAttribute('data-index-region') as DocumentIndexKey,
  );
}

function Probe({
  keys = DOCUMENT_INDEX_KEYS,
}: {
  keys?: readonly DocumentIndexKey[];
}) {
  const { activeKey, jump, mountedKeys } = useDocumentRunningIndex(
    keys,
    'proj-1',
  );
  return (
    <div>
      <span data-testid="active">{activeKey ?? 'none'}</span>
      <span data-testid="mounted">{mountedKeys.join(',') || 'none'}</span>
      <button type="button" onClick={() => jump('money')}>
        jump
      </button>
    </div>
  );
}

/**
 * The MutationObserver is the subscription's own half: which SUBTREE it
 * watches is the fix under test (a body watch that outlives the paper's
 * arrival wakes on every childList mutation in the application), so the
 * targets it is handed are recorded.
 */
const mutationTargets: Node[] = [];
let mutationDisconnects = 0;
const RealMutationObserver = global.MutationObserver;
class CapturingMutationObserver extends RealMutationObserver {
  observe(target: Node, options?: MutationObserverInit) {
    mutationTargets.push(target);
    super.observe(target, options);
  }
  disconnect() {
    mutationDisconnects += 1;
    super.disconnect();
  }
}

describe('useDocumentRunningIndex', () => {
  const realIntersectionObserver = global.IntersectionObserver;
  let paper: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    // The paper is the subtree the MutationObserver watches; it exists on the
    // first paint of a document, before any region root has settled.
    paper = document.createElement('main');
    paper.setAttribute('data-document-paper', '');
    document.body.appendChild(paper);

    CapturingIntersectionObserver.instances = [];
    global.IntersectionObserver =
      CapturingIntersectionObserver as unknown as typeof IntersectionObserver;
    mutationTargets.length = 0;
    mutationDisconnects = 0;
    global.MutationObserver =
      CapturingMutationObserver as unknown as typeof MutationObserver;

    // jsdom has no scroller; the jump's rAF work must still be allowed to run.
    Element.prototype.scrollIntoView = jest.fn();
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
    global.IntersectionObserver = realIntersectionObserver;
    global.MutationObserver = RealMutationObserver;
  });

  function mountRegions(keys: readonly DocumentIndexKey[] = DOCUMENT_INDEX_KEYS) {
    for (const key of keys) {
      const section = document.createElement('section');
      section.setAttribute('data-index-region', key);
      paper.appendChild(section);
    }
    return paper;
  }

  /**
   * `resolve()`'s foot-of-the-paper branch reads
   * `documentElement.scrollHeight`, which jsdom leaves at 0 — so every frame
   * looks like the foot and the last mounted region always wins. A test about
   * which region is CROSSING the reading band has to give the paper a height
   * first.
   */
  function tallPaper() {
    Object.defineProperty(document.documentElement, 'scrollHeight', {
      configurable: true,
      value: 5000,
    });
  }

  /**
   * jsdom's MutationObserver notifies on a real microtask
   * (`Promise.resolve().then`, unfaked), and the hook debounces the re-attach
   * to one rAF (faked). Both have to be let through, in that order.
   */
  async function settleAttach() {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      jest.advanceTimersByTime(20);
    });
  }

  it('asks a region to unfold before it jumps — the index never lands on a seam', () => {
    mountRegions();
    const seen: DocumentIndexKey[] = [];
    const listener = (e: Event) => {
      const region = (e as CustomEvent<{ region?: DocumentIndexKey }>).detail
        ?.region;
      if (region) seen.push(region);
    };
    window.addEventListener(UNFOLD_REGION_EVENT, listener);

    render(<Probe />);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'jump' }));
    });

    expect(seen).toEqual(['money']);
    window.removeEventListener(UNFOLD_REGION_EVENT, listener);
  });

  it('attaches every root the paper already carries, at the reading band', () => {
    mountRegions();
    render(<Probe />);

    expect(attachedKeys()).toEqual([...DOCUMENT_INDEX_KEYS]);
    expect(liveObserver().rootMargin).toBe('-20% 0px -62% 0px');
  });

  // The retry attach this replaces gave up after ~2s (8 × 250ms). The foot of
  // a long paper — the closeout band and the record — settles later than that,
  // and an unobserved root does not present as an error: the rail simply goes
  // quiet at the foot.
  it('attaches a root that mounts long after the old retry window had lapsed', async () => {
    tallPaper();
    render(<Probe />);
    expect(attachedKeys()).toEqual([]);

    act(() => {
      jest.advanceTimersByTime(5000);
    });

    mountRegions(['record']);
    await settleAttach();

    expect(attachedKeys()).toEqual(['record']);

    // And the late root can hold the line, which is the point of attaching it.
    act(() => {
      liveObserver().deliver({ record: true });
    });
    expect(screen.getByTestId('active')).toHaveTextContent('record');
  });

  it('drops a root the spread has unmounted, so the line cannot mark it', async () => {
    mountRegions(['approvals', 'record']);
    render(<Probe />);
    expect(attachedKeys()).toEqual(['approvals', 'record']);

    paper.querySelector('[data-index-region="record"]')?.remove();
    await settleAttach();

    expect(attachedKeys()).toEqual(['approvals']);
    expect(screen.getByTestId('active')).toHaveTextContent('approvals');
  });

  it('commits the reading line to the jump target rather than walking there', () => {
    mountRegions();
    render(<Probe />);

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'jump' }));
    });
    expect(screen.getByTestId('active')).toHaveTextContent('money');

    // The lock lapses with the scroll; the last region then owns the foot of
    // the paper, which on a project spread is now `record`.
    act(() => {
      jest.advanceTimersByTime(1000);
      fireEvent.scroll(window);
      jest.advanceTimersByTime(50);
    });
    expect(screen.getByTestId('active')).toHaveTextContent('record');
  });

  // L-10 — a press forces its target as the reading stop for the length of the
  // smooth scroll. Without the lock the scroll's intermediate regions report
  // themselves on the way past and the line walks the paper instead of
  // committing to where she asked to go.
  it('ignores intermediate regions reporting themselves during the 700ms jump lock', () => {
    tallPaper();
    mountRegions();
    render(<Probe />);

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'jump' }));
    });
    expect(screen.getByTestId('active')).toHaveTextContent('money');

    // Mid-scroll, 400ms in: approvals crosses the reading band. Unlocked,
    // `resolve()`'s crossing branch would hand it the line.
    act(() => {
      jest.advanceTimersByTime(400);
      liveObserver().deliver({ approvals: true });
      fireEvent.scroll(window);
      jest.advanceTimersByTime(20);
    });
    expect(screen.getByTestId('active')).toHaveTextContent('money');

    // Past 700ms the lock is gone and the same report is honoured.
    act(() => {
      jest.advanceTimersByTime(400);
      liveObserver().deliver({ approvals: true });
      fireEvent.scroll(window);
      jest.advanceTimersByTime(20);
    });
    expect(screen.getByTestId('active')).toHaveTextContent('approvals');
  });

  it('commits the line when the TICKET asks a region to unfold, not only the index', () => {
    // B1 — the ticket's Pieces/Money/Dates rows make the same request from
    // outside this hook. One lock, and it lives with the line it locks; two
    // copies of the act would let the index and the ticket disagree about
    // where the reader went.
    mountRegions();
    render(<Probe />);
    expect(screen.getByTestId('active')).not.toHaveTextContent('approvals');

    act(() => {
      window.dispatchEvent(
        new CustomEvent(UNFOLD_REGION_EVENT, { detail: { region: 'approvals' } }),
      );
    });
    expect(screen.getByTestId('active')).toHaveTextContent('approvals');

    // And it holds through the scroll the request set off, exactly as a jump
    // from the index's own row does.
    act(() => {
      fireEvent.scroll(window);
      jest.advanceTimersByTime(50);
    });
    expect(screen.getByTestId('active')).toHaveTextContent('approvals');
  });

  // C11 — the page hands the index the regions THIS spread mounts, but a root
  // can still be missing when the line first reads: regions arrive as their own
  // queries settle, and a pinned Worktable composition can put a different
  // section on the paper. The reading line must stay on what the DOM actually
  // answers for.
  it('never lands the reading line on a region the spread did not mount', () => {
    const installKeys: DocumentIndexKey[] = ['approvals', 'schedule', 'ffe'];
    mountRegions(['approvals']);
    render(<Probe keys={installKeys} />);

    act(() => {
      fireEvent.scroll(window);
      jest.advanceTimersByTime(50);
    });

    // jsdom's document has no height, so the foot-of-the-paper branch decides
    // this: unguarded it would hand the line to 'ffe', the last KEY, whose
    // root is nowhere on the page.
    expect(screen.getByTestId('active')).toHaveTextContent('approvals');
  });

  // C-06 — a fold that swaps the root, a refetch that remounts it, a pinned
  // spread: the key stays, the ELEMENT changes. The replacement is observed,
  // and the report the old one left behind is dropped with it — otherwise
  // `resolve()`'s crossing branch hands the line to a region that has not
  // reported since it left the page.
  it('re-observes a root replaced in place, and drops the report the old one left', async () => {
    tallPaper();
    mountRegions(['approvals', 'record']);
    render(<Probe keys={['approvals', 'record']} />);

    act(() => {
      liveObserver().deliver({ approvals: true });
    });
    expect(screen.getByTestId('active')).toHaveTextContent('approvals');

    const old = paper.querySelector(
      '[data-index-region="approvals"]',
    ) as HTMLElement;
    const replacement = document.createElement('section');
    replacement.setAttribute('data-index-region', 'approvals');
    paper.replaceChild(replacement, old);
    await settleAttach();

    // The new element is the observed one; the old is not.
    expect(Array.from(liveObserver().observed)).toContain(replacement);
    expect(Array.from(liveObserver().observed)).not.toContain(old);
    expect(attachedKeys()).toEqual(expect.arrayContaining(['approvals']));
    // And the stale `approvals: true` no longer holds the line.
    expect(screen.getByTestId('active')).not.toHaveTextContent('approvals');
  });

  // The subscription is for the life of the route; nothing may outlive it.
  it('disconnects both observers when the document goes', () => {
    mountRegions();
    const { unmount } = render(<Probe />);
    const observer = liveObserver();
    expect(observer.observed.size).toBe(DOCUMENT_INDEX_KEYS.length);
    const before = mutationDisconnects;

    unmount();

    expect(observer.observed.size).toBe(0);
    expect(mutationDisconnects).toBeGreaterThan(before);
  });

  // C-05 — before the paper exists the body is watched INSTEAD, and only until
  // the paper arrives. A body watch that survives it wakes on every childList
  // mutation in the application and pays a forced layout per frame for churn
  // that cannot contain a region root.
  it('watches the body only until the paper arrives, then re-roots on it', async () => {
    paper.remove();
    render(<Probe keys={['approvals']} />);

    expect(mutationTargets).toEqual([document.body]);
    expect(attachedKeys()).toEqual([]);

    document.body.appendChild(paper);
    mountRegions(['approvals']);
    await settleAttach();

    expect(attachedKeys()).toEqual(['approvals']);
    expect(mutationTargets[mutationTargets.length - 1]).toBe(paper);
    expect(mutationTargets).not.toContain(document.body.ownerDocument);
    // The body watch was replaced, not added to.
    expect(mutationTargets.filter((t) => t === document.body)).toHaveLength(1);
    expect(mutationDisconnects).toBeGreaterThan(0);
  });

  // C-04 — the ladder prints a stop as a press target only where its root is
  // actually on the paper; a press onto nothing scrolls nowhere and lands
  // focus nowhere.
  it('reports which roots are on the paper, in paper order', async () => {
    mountRegions(['record', 'approvals']);
    render(<Probe keys={['approvals', 'ffe', 'record']} />);

    expect(screen.getByTestId('mounted')).toHaveTextContent('approvals,record');

    mountRegions(['ffe']);
    await settleAttach();
    expect(screen.getByTestId('mounted')).toHaveTextContent(
      'approvals,ffe,record',
    );

    paper.querySelector('[data-index-region="ffe"]')?.remove();
    await settleAttach();
    expect(screen.getByTestId('mounted')).toHaveTextContent('approvals,record');
  });

  it('marks nothing at all while no region root has mounted', () => {
    render(<Probe keys={['approvals', 'schedule', 'ffe']} />);

    act(() => {
      fireEvent.scroll(window);
      jest.advanceTimersByTime(50);
    });

    expect(screen.getByTestId('active')).toHaveTextContent('none');
  });
});
