/**
 * US-14 arrival — one route's run (arrival-run.tsx) against a fake engine: gate at the commit,
 * hide/ready/quiet/faces, the caps, the guards at ready, her hand during the wait, the one-time
 * writes under StrictMode, and the end report (telemetry + EVENT_ENDED + the anchor, once per entry
 * for every end).
 */
import { StrictMode, useEffect } from 'react';
import { act, render } from '@testing-library/react';
import posthog from 'posthog-js';
import { callSheetPending } from '@/components/document/command-bar';
import { markArrival } from '@/lib/arrival/mark-arrival';
import type { RouteEntry } from '@/lib/arrival/nav';
import type { ArrivalEngine, Run, RunPhase } from '@/lib/arrival/run-contract';
import { BUDGET, EVENT_ENDED, KEYS } from '@/lib/arrival/types';
import type {
  ArrivalEnded,
  Brief,
  DeclineCause,
  EndHow,
  GateInput,
  GateResult,
  Surface,
} from '@/lib/arrival/types';
import { ArrivalMount } from '../arrival-mount';
import { ArrivalRun } from '../arrival-run';

jest.mock('posthog-js', () => ({ __esModule: true, default: { capture: jest.fn() } }));
jest.mock('@/lib/analytics/posthog', () => ({ isAnalyticsEnabled: () => true }));
jest.mock('@/lib/arrival/mark-arrival', () => ({ markArrival: jest.fn() }));
jest.mock('@/components/document/command-bar', () => ({ callSheetPending: { value: false } }));

let mockWalkthrough = false;
jest.mock('@/components/document/help/desk-walkthrough', () => ({
  useSuppressDeskFirstTouch: () => mockWalkthrough,
}));

let mockOffer: object | null = null;
jest.mock('@/hooks/document-time-provider', () => ({
  useDocumentTime: () => ({ offer: mockOffer }),
}));

const mockEnterRoute = jest.fn();
jest.mock('@/lib/arrival/nav', () => ({
  ...jest.requireActual('@/lib/arrival/nav'),
  enterRoute: (...args: unknown[]) => mockEnterRoute(...args),
}));

let mockPathname = '/desk';
jest.mock('next/navigation', () => ({ usePathname: () => mockPathname }));

const capture = (posthog as unknown as { capture: jest.Mock }).capture;
const html = document.documentElement;

// ArrivalMount subscribes to the reduced-motion query once per module (installArrivalListeners);
// kept outside jest's mock state so clearMocks cannot lose the listener between tests.
const motionListeners: Array<() => void> = [];
const setupMatchMedia = window.matchMedia;
window.matchMedia = (query: string) => ({
  ...setupMatchMedia(query),
  addEventListener: (_type: string, listener: () => void) => {
    if (query === '(prefers-reduced-motion: reduce)') motionListeners.push(listener);
  },
});

type FakeRun = Run & { phase: RunPhase; start: jest.Mock; finish: jest.Mock };

function fakeRun(surface: Surface): FakeRun {
  let resolveEnded: (e: ArrivalEnded) => void = () => {};
  const ended = new Promise<ArrivalEnded>((resolve) => {
    resolveEnded = resolve;
  });
  const run: FakeRun = {
    phase: 'compose',
    ended,
    start: jest.fn(() => {
      html.classList.remove('arr-pre');
      html.classList.add('arr-on');
    }),
    // As engine.ts end(): resolves `ended` and dispatches EVENT_ENDED itself, once per run.
    finish: jest.fn((how: EndHow, cause?: DeclineCause) => {
      if (run.phase === 'done') return;
      run.phase = 'done';
      html.classList.remove('arr-pre', 'arr-on');
      const detail: ArrivalEnded = cause ? { surface, how, cause } : { surface, how };
      resolveEnded(detail);
      window.dispatchEvent(new CustomEvent(EVENT_ENDED, { detail }));
    }),
    onKeyDown: jest.fn(),
    onPointerDown: jest.fn(),
    onPointerUp: jest.fn(),
    onWheel: jest.fn(),
    onTouchMove: jest.fn(),
    onScroll: jest.fn(),
    onVisibilityChange: jest.fn(),
    onFocusIn: jest.fn(),
  };
  return run;
}

function makeEngine(gate?: (input: GateInput) => GateResult) {
  const runs: FakeRun[] = [];
  const engine = {
    gate: jest.fn(
      gate ??
        ((input: GateInput): GateResult => ({
          play: true,
          via: input.token?.via ?? null,
          reduced: input.reducedMotion,
        })),
    ),
    brief: jest.fn((root: HTMLElement, surface: Surface): Brief | null => {
      const node = root.querySelector<HTMLElement>('[data-part~=headline]');
      if (!node) return null;
      const headline = { part: 'headline' as const, text: node.textContent ?? '', node, carrier: 'node' as const };
      return { surface, parts: [headline], headline, act: null, today: '2026-09-28' };
    }),
    verifyFrame0: jest.fn(() => true),
    createRun: jest.fn((brief: Brief) => {
      const run = fakeRun(brief.surface);
      runs.push(run);
      return run;
    }),
  } satisfies ArrivalEngine;
  return { engine, runs };
}

function soft(now: number): RouteEntry {
  return { entry: 'soft', entryAt: now, hard: false, navType: null, suppressedPath: null };
}

function addRoot(surface: Surface, ready: boolean, text = 'Nothing is overdue.'): HTMLElement {
  const root = document.createElement('main');
  root.setAttribute('data-arrival', surface);
  if (ready) root.setAttribute('data-arrival-ready', '');
  root.innerHTML = `<p data-part="headline settle">${text}</p>`;
  document.body.appendChild(root);
  return root;
}

async function flush() {
  await act(async () => {
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
  });
}

async function advance(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
  await flush();
}

/** Root present and ready: faces resolve, then the quiet window closes. */
async function toReady() {
  await flush();
  await advance(BUDGET.QUIET_MS);
}

function declined(surface: Surface, cause: DeclineCause) {
  return ['arrival_ended', { surface, how: 'declined', cause }];
}

const fonts = {
  load: jest.fn(() => Promise.resolve([{}])),
  check: jest.fn(() => true),
};

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['queueMicrotask', 'nextTick'] });
  window.sessionStorage.clear();
  document.body.innerHTML = '';
  html.className = '';
  html.style.setProperty('--arr-ok', '1');
  Object.defineProperty(document, 'fonts', { configurable: true, value: fonts });
  fonts.load.mockImplementation(() => Promise.resolve([{}]));
  fonts.check.mockImplementation(() => true);
  mockEnterRoute.mockImplementation((_path: string, now: number) => soft(now));
  mockWalkthrough = false;
  mockOffer = null;
  mockPathname = '/desk';
  callSheetPending.value = false;
  window.history.replaceState(null, '', '/desk');
});

afterEach(() => {
  jest.useRealTimers();
  html.style.removeProperty('--arr-ok');
  html.className = '';
});

describe('the play path', () => {
  it('hides at the commit, starts at ready + quiet + faces, reports once and marks once', async () => {
    addRoot('desk', true);
    const { engine, runs } = makeEngine();
    const ended = jest.fn();
    window.addEventListener(EVENT_ENDED, ended);

    render(<ArrivalRun engine={engine} pathname="/desk" />);
    expect(html.classList.contains('arr-pre')).toBe(true);
    expect(engine.gate).toHaveBeenCalledTimes(1);
    expect(engine.gate.mock.calls[0][0]).toMatchObject({ surface: 'desk', pathname: '/desk', entry: 'soft' });

    await flush();
    await advance(BUDGET.QUIET_MS - 1);
    expect(engine.createRun).not.toHaveBeenCalled();
    await advance(1);
    expect(engine.createRun).toHaveBeenCalledTimes(1);
    const run = runs[0];
    expect(run.start).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage.getItem(KEYS.VISIT)).not.toBeNull();
    expect(window.sessionStorage.getItem(KEYS.DESK)).not.toBeNull();
    expect(capture).not.toHaveBeenCalled();

    run.finish('settled');
    await flush();
    expect(capture.mock.calls).toEqual([['arrival_ended', { surface: 'desk', how: 'settled' }]]);
    expect(markArrival).toHaveBeenCalledTimes(1);
    expect(markArrival).toHaveBeenCalledWith('desk', null);
    expect(ended).toHaveBeenCalledTimes(1);
    expect((ended.mock.calls[0][0] as CustomEvent<ArrivalEnded>).detail).toEqual({
      surface: 'desk',
      how: 'settled',
    });
    window.removeEventListener(EVENT_ENDED, ended);
  });

  it('a mutation in the route root restarts the quiet window', async () => {
    const root = addRoot('desk', true);
    const { engine } = makeEngine();
    render(<ArrivalRun engine={engine} pathname="/desk" />);
    await flush();
    await advance(BUDGET.QUIET_MS - 20);
    root.querySelector('p')!.textContent = 'Two things need your hand.';
    await flush();
    await advance(20);
    expect(engine.createRun).not.toHaveBeenCalled();
    await advance(BUDGET.QUIET_MS);
    expect(engine.createRun).toHaveBeenCalledTimes(1);
  });

  it('StrictMode: one gate, one pl-visit stamp, one token consumption, one createRun', async () => {
    mockPathname = '/doc/e1';
    window.history.replaceState(null, '', '/doc/e1');
    window.sessionStorage.setItem(KEYS.ARRIVE, JSON.stringify({ via: 'ptr', to: '/doc/e1', at: Date.now() }));
    addRoot('document', true, 'Approve the sofa.');
    const setItem = jest.spyOn(Storage.prototype, 'setItem');
    const removeItem = jest.spyOn(Storage.prototype, 'removeItem');
    const { engine } = makeEngine();

    render(
      <StrictMode>
        <ArrivalRun engine={engine} pathname="/doc/e1" />
      </StrictMode>,
    );
    await toReady();

    expect(mockEnterRoute).toHaveBeenCalledTimes(1);
    expect(engine.gate).toHaveBeenCalledTimes(1);
    expect(engine.createRun).toHaveBeenCalledTimes(1);
    expect(engine.createRun.mock.calls[0][2]).toMatchObject({ via: 'ptr', reduced: false });
    expect(setItem.mock.calls.filter(([key]) => key === KEYS.VISIT)).toHaveLength(1);
    expect(setItem.mock.calls.filter(([key]) => key === KEYS.DESK)).toHaveLength(0);
    expect(removeItem.mock.calls.filter(([key]) => key === KEYS.ARRIVE)).toHaveLength(1);
    expect(window.sessionStorage.getItem(KEYS.ARRIVE)).toBeNull();
    setItem.mockRestore();
    removeItem.mockRestore();
  });

  it.each<DeclineCause>(['drift', 'no-root'])(
    'an engine decline inside start() (%s) leaves pl-desk unset; the visit stamp stays',
    async (cause) => {
      addRoot('desk', true);
      const { engine, runs } = makeEngine();
      engine.createRun.mockImplementation((brief: Brief) => {
        const run = fakeRun(brief.surface);
        run.start.mockImplementation(() => run.finish('declined', cause));
        runs.push(run);
        return run;
      });
      render(<ArrivalRun engine={engine} pathname="/desk" />);
      await toReady();

      expect(runs[0].start).toHaveBeenCalledTimes(1);
      expect(window.sessionStorage.getItem(KEYS.DESK)).toBeNull();
      expect(window.sessionStorage.getItem(KEYS.VISIT)).not.toBeNull();
      expect(capture.mock.calls).toEqual([declined('desk', cause)]);
      expect(markArrival).toHaveBeenCalledTimes(1);
      expect(html.classList.contains('arr-pre')).toBe(false);
    },
  );

  it('start() throwing ends the run as error and leaves pl-desk unset', async () => {
    addRoot('desk', true);
    const { engine, runs } = makeEngine();
    engine.createRun.mockImplementation((brief: Brief) => {
      const run = fakeRun(brief.surface);
      run.start.mockImplementation(() => {
        throw new Error('measure failed');
      });
      runs.push(run);
      return run;
    });
    render(<ArrivalRun engine={engine} pathname="/desk" />);
    await toReady();

    expect(runs[0].finish).toHaveBeenCalledWith('error');
    expect(window.sessionStorage.getItem(KEYS.DESK)).toBeNull();
    expect(capture.mock.calls).toEqual([['arrival_ended', { surface: 'desk', how: 'error' }]]);
  });

  it('a hard entry never inherits a token: the gate sees none and it is spent at the commit', () => {
    mockPathname = '/doc/e1';
    window.sessionStorage.setItem(KEYS.ARRIVE, JSON.stringify({ via: 'act', to: '/doc/e1', at: Date.now() }));
    mockEnterRoute.mockImplementation((_p: string, now: number) => ({
      ...soft(now),
      entry: 'reload',
      hard: true,
      navType: 'reload',
    }));
    const { engine } = makeEngine();
    render(<ArrivalRun engine={engine} pathname="/doc/e1" />);
    expect(engine.gate.mock.calls[0][0].token).toBeNull();
    expect(window.sessionStorage.getItem(KEYS.ARRIVE)).toBeNull();
  });
});

describe('EVENT_ENDED — exactly one per entry', () => {
  const events: ArrivalEnded[] = [];
  const onEnded = (e: Event) => events.push((e as CustomEvent<ArrivalEnded>).detail);
  beforeEach(() => {
    events.length = 0;
    window.addEventListener(EVENT_ENDED, onEnded);
  });
  afterEach(() => window.removeEventListener(EVENT_ENDED, onEnded));

  it('a played run: the engine dispatches it; the host adds none', async () => {
    addRoot('desk', true);
    const { engine, runs } = makeEngine();
    render(<ArrivalRun engine={engine} pathname="/desk" />);
    await toReady();
    runs[0].finish('skip');
    await flush();
    expect(events).toEqual([{ surface: 'desk', how: 'skip' }]);
    expect(capture).toHaveBeenCalledTimes(1);
  });

  it('an engine decline inside start(): the engine dispatches it; the host adds none', async () => {
    addRoot('desk', true);
    const { engine, runs } = makeEngine();
    engine.createRun.mockImplementation((brief: Brief) => {
      const run = fakeRun(brief.surface);
      run.start.mockImplementation(() => run.finish('declined', 'drift'));
      runs.push(run);
      return run;
    });
    render(<ArrivalRun engine={engine} pathname="/desk" />);
    await toReady();
    await flush();
    expect(events).toEqual([{ surface: 'desk', how: 'declined', cause: 'drift' }]);
  });

  it('a run cut off by unmount: one event, from the engine', async () => {
    addRoot('desk', true);
    const { engine } = makeEngine();
    const view = render(<ArrivalRun engine={engine} pathname="/desk" />);
    await toReady();
    view.unmount();
    await flush();
    expect(events).toEqual([{ surface: 'desk', how: 'mutation' }]);
  });

  it.each<[string, () => void]>([
    ['a gate decline', () => undefined],
    ['a busy decline at ready', () => {
      const dialog = document.createElement('div');
      dialog.setAttribute('role', 'dialog');
      document.body.appendChild(dialog);
    }],
  ])('%s before any run: the host dispatches it, once', async (label, arrange) => {
    addRoot('desk', true);
    arrange();
    const gate = label === 'a gate decline'
      ? (): GateResult => ({ play: false, cause: 'desk-shown' })
      : undefined;
    const { engine } = makeEngine(gate);
    render(
      <StrictMode>
        <ArrivalRun engine={engine} pathname="/desk" />
      </StrictMode>,
    );
    await toReady();
    expect(engine.createRun).not.toHaveBeenCalled();
    expect(events).toEqual([
      { surface: 'desk', how: 'declined', cause: label === 'a gate decline' ? 'desk-shown' : 'busy' },
    ]);
  });
});

describe('the gate at the commit', () => {
  it('reads location.search before a passive strip removes it', () => {
    window.history.replaceState(null, '', '/desk?book=orders');
    function DoorwayStrip() {
      useEffect(() => {
        window.history.replaceState(null, '', '/desk');
      }, []);
      return null;
    }
    const { engine } = makeEngine((input) =>
      input.search ? { play: false, cause: 'query' } : { play: true, via: null, reduced: false },
    );
    render(
      <>
        <DoorwayStrip />
        <ArrivalRun engine={engine} pathname="/desk" />
      </>,
    );
    expect(engine.gate.mock.calls[0][0].search).toBe('?book=orders');
    expect(window.location.search).toBe('');
    expect(capture.mock.calls).toEqual([declined('desk', 'query')]);
    expect(html.classList.contains('arr-pre')).toBe(false);
    expect(markArrival).toHaveBeenCalledTimes(1);
  });

  it.each<DeclineCause>(['token', 'reload'])(
    'a gate decline (%s) writes the anchor exactly once, StrictMode included',
    (cause) => {
      mockPathname = '/doc/e1';
      const { engine } = makeEngine(() => ({ play: false, cause }));
      render(
        <StrictMode>
          <ArrivalRun engine={engine} pathname="/doc/e1" />
        </StrictMode>,
      );
      expect(capture.mock.calls).toEqual([declined('document', cause)]);
      expect(markArrival).toHaveBeenCalledTimes(1);
      expect(markArrival).toHaveBeenCalledWith('document', 'e1');
    },
  );

  it('a decline reports its cause and never hides the page', () => {
    const { engine } = makeEngine(() => ({ play: false, cause: 'desk-shown' }));
    render(<ArrivalRun engine={engine} pathname="/desk" />);
    expect(capture.mock.calls).toEqual([declined('desk', 'desk-shown')]);
    expect(html.classList.contains('arr-pre')).toBe(false);
  });

  it('the ⌘K Call Sheet walk declines busy at the commit', () => {
    callSheetPending.value = true;
    const { engine } = makeEngine();
    render(<ArrivalRun engine={engine} pathname="/doc/e1" />);
    expect(capture.mock.calls).toEqual([declined('document', 'busy')]);
    expect(html.classList.contains('arr-pre')).toBe(false);
  });

  it('missing arrival CSS declines sentinel; missing FontFaceSet declines unsupported', () => {
    html.style.removeProperty('--arr-ok');
    const first = makeEngine();
    const view = render(<ArrivalRun engine={first.engine} pathname="/desk" />);
    view.unmount();
    html.style.setProperty('--arr-ok', '1');
    Object.defineProperty(document, 'fonts', { configurable: true, value: undefined });
    const second = makeEngine();
    render(<ArrivalRun engine={second.engine} pathname="/desk" />);
    expect(capture.mock.calls).toEqual([declined('desk', 'sentinel'), declined('desk', 'unsupported')]);
    expect(html.classList.contains('arr-pre')).toBe(false);
  });

  it('does nothing on a route that is not an arrival surface', () => {
    const { engine } = makeEngine();
    render(<ArrivalRun engine={engine} pathname="/board/b1" />);
    expect(engine.gate).not.toHaveBeenCalled();
    expect(mockEnterRoute).not.toHaveBeenCalled();
    expect(html.classList.contains('arr-pre')).toBe(false);
  });
});

describe('the caps', () => {
  it('hidden: the root appears but is not ready within HIDDEN_CAP_MS → hidden, page shown', async () => {
    const { engine } = makeEngine();
    render(<ArrivalRun engine={engine} pathname="/desk" />);
    await advance(2_000);
    expect(capture).not.toHaveBeenCalled();
    addRoot('desk', false);
    await flush();
    await advance(BUDGET.HIDDEN_CAP_MS - 1);
    expect(capture).not.toHaveBeenCalled();
    expect(html.classList.contains('arr-pre')).toBe(true);
    await advance(1);
    expect(capture.mock.calls).toEqual([declined('desk', 'hidden')]);
    expect(html.classList.contains('arr-pre')).toBe(false);
    expect(engine.createRun).not.toHaveBeenCalled();
    expect(markArrival).toHaveBeenCalledTimes(1);
  });

  it('entry (soft): no ready within SOFT_ENTRY_READY_MS of the commit → late', async () => {
    const { engine } = makeEngine();
    render(<ArrivalRun engine={engine} pathname="/desk" />);
    await advance(BUDGET.SOFT_ENTRY_READY_MS - 1);
    expect(capture).not.toHaveBeenCalled();
    await advance(1);
    expect(capture.mock.calls).toEqual([declined('desk', 'late')]);
    expect(html.classList.contains('arr-pre')).toBe(false);
    expect(markArrival).toHaveBeenCalledTimes(1);
    expect(markArrival).toHaveBeenCalledWith('desk', null);
  });

  it('entry (hard): counted from timeOrigin; already spent at the commit → late without hiding', async () => {
    mockEnterRoute.mockImplementationOnce((_p: string, now: number) => ({
      ...soft(now),
      entry: 'hard',
      hard: true,
      entryAt: now - (BUDGET.HARD_ENTRY_READY_MS - 500),
    }));
    const first = makeEngine();
    const view = render(<ArrivalRun engine={first.engine} pathname="/desk" />);
    expect(html.classList.contains('arr-pre')).toBe(true);
    await advance(500);
    expect(capture.mock.calls).toEqual([declined('desk', 'late')]);
    view.unmount();

    capture.mockClear();
    mockEnterRoute.mockImplementationOnce((_p: string, now: number) => ({
      ...soft(now),
      entry: 'hard',
      hard: true,
      entryAt: now - BUDGET.HARD_ENTRY_READY_MS,
    }));
    const second = makeEngine();
    render(<ArrivalRun engine={second.engine} pathname="/desk" />);
    expect(capture.mock.calls).toEqual([declined('desk', 'late')]);
    expect(html.classList.contains('arr-pre')).toBe(false);
  });

  it('faces that do not resolve within FONTS_MS → fonts', async () => {
    fonts.load.mockImplementation(() => new Promise(() => {}));
    addRoot('desk', true);
    const { engine } = makeEngine();
    render(<ArrivalRun engine={engine} pathname="/desk" />);
    await flush();
    await advance(BUDGET.FONTS_MS);
    expect(capture.mock.calls).toEqual([declined('desk', 'fonts')]);
    expect(html.classList.contains('arr-pre')).toBe(false);
    expect(engine.createRun).not.toHaveBeenCalled();
  });
});

describe('the guards at ready', () => {
  it('busy (an open dialog) → busy, page shown, anchor still written', async () => {
    addRoot('desk', true);
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    document.body.appendChild(dialog);
    const { engine } = makeEngine();
    render(<ArrivalRun engine={engine} pathname="/desk" />);
    await toReady();
    expect(capture.mock.calls).toEqual([declined('desk', 'busy')]);
    expect(html.classList.contains('arr-pre')).toBe(false);
    expect(engine.createRun).not.toHaveBeenCalled();
    expect(markArrival).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage.getItem(KEYS.VISIT)).toBeNull();
  });

  it('busy from React state: the walkthrough on screen, or a pending log-time offer', async () => {
    addRoot('desk', true);
    mockWalkthrough = true;
    const first = makeEngine();
    const view = render(<ArrivalRun engine={first.engine} pathname="/desk" />);
    await toReady();
    view.unmount();
    mockWalkthrough = false;
    mockOffer = { projectId: 'p1' };
    const second = makeEngine();
    render(<ArrivalRun engine={second.engine} pathname="/desk" />);
    await toReady();
    expect(capture.mock.calls).toEqual([declined('desk', 'busy'), declined('desk', 'busy')]);
  });

  it('no brief → no-headline, anchor still written', async () => {
    const root = addRoot('document', true);
    root.innerHTML = '<p>no marks</p>';
    const { engine } = makeEngine();
    render(<ArrivalRun engine={engine} pathname="/doc/e1" />);
    await toReady();
    expect(capture.mock.calls).toEqual([declined('document', 'no-headline')]);
    expect(markArrival).toHaveBeenCalledWith('document', 'e1');
    expect(html.classList.contains('arr-pre')).toBe(false);
  });

  it('a background tab at ready → hidden', async () => {
    addRoot('desk', true);
    const visibility = jest.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    const { engine } = makeEngine();
    render(<ArrivalRun engine={engine} pathname="/desk" />);
    await toReady();
    expect(capture.mock.calls).toEqual([declined('desk', 'hidden')]);
    expect(markArrival).toHaveBeenCalledTimes(1);
    visibility.mockRestore();
  });
});

describe('her hand during the wait', () => {
  function mountWaiting() {
    const { engine } = makeEngine();
    render(
      <>
        <ArrivalMount />
        <ArrivalRun engine={engine} pathname="/desk" />
      </>,
    );
    expect(html.classList.contains('arr-pre')).toBe(true);
    return engine;
  }

  /** The page then reaches ready: nothing starts, nothing more is reported. */
  async function staysAtRest(engine: ReturnType<typeof makeEngine>['engine']) {
    addRoot('desk', true);
    await toReady();
    await advance(BUDGET.SOFT_ENTRY_READY_MS);
    expect(engine.createRun).not.toHaveBeenCalled();
    expect(capture.mock.calls).toEqual([declined('desk', 'busy')]);
    expect(markArrival).toHaveBeenCalledTimes(1);
    expect(html.classList.contains('arr-pre')).toBe(false);
  }

  it('a key ends the wait for good (arr-pre gone, no run) and is not swallowed', async () => {
    const engine = mountWaiting();
    const key = new KeyboardEvent('keydown', { key: 'j', bubbles: true, cancelable: true });
    document.body.dispatchEvent(key);
    expect(key.defaultPrevented).toBe(false);
    expect(html.classList.contains('arr-pre')).toBe(false);
    await staysAtRest(engine);
  });

  it('a press ends the wait for good and reaches the chrome', async () => {
    const engine = mountWaiting();
    const chrome = jest.fn();
    document.body.addEventListener('pointerdown', chrome);
    const press = new MouseEvent('pointerdown', { bubbles: true, cancelable: true });
    document.body.dispatchEvent(press);
    document.body.removeEventListener('pointerdown', chrome);
    expect(chrome).toHaveBeenCalledTimes(1);
    expect(press.defaultPrevented).toBe(false);
    expect(html.classList.contains('arr-pre')).toBe(false);
    await staysAtRest(engine);
  });

  it.each(['wheel', 'touchmove'])('%s ends the wait for good', async (type) => {
    const engine = mountWaiting();
    document.body.dispatchEvent(new Event(type, { bubbles: true }));
    expect(html.classList.contains('arr-pre')).toBe(false);
    await staysAtRest(engine);
  });

  it('Escape is swallowed and ends the wait; once it has ended, Escape passes', async () => {
    const engine = mountWaiting();
    const first = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    document.body.dispatchEvent(first);
    expect(first.defaultPrevented).toBe(true);
    expect(html.classList.contains('arr-pre')).toBe(false);

    const second = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    document.body.dispatchEvent(second);
    expect(second.defaultPrevented).toBe(false);
    await staysAtRest(engine);
  });
});

describe('the host finishes (CONTRACT §4b)', () => {
  async function mountPlaying() {
    addRoot('desk', true);
    const { engine, runs } = makeEngine();
    render(
      <>
        <ArrivalMount />
        <ArrivalRun engine={engine} pathname="/desk" />
      </>,
    );
    await toReady();
    const run = runs[0];
    expect(html.classList.contains('arr-on')).toBe(true);
    return run;
  }

  async function restored(run: FakeRun, how: EndHow) {
    expect(run.finish).toHaveBeenCalledTimes(1);
    expect(run.finish).toHaveBeenCalledWith(how);
    expect(html.classList.contains('arr-on')).toBe(false);
    expect(html.classList.contains('arr-pre')).toBe(false);
    await flush();
    expect(capture.mock.calls).toEqual([['arrival_ended', { surface: 'desk', how }]]);
  }

  function selectHeadline() {
    const range = document.createRange();
    range.selectNodeContents(document.querySelector('[data-part~=headline]')!);
    const selection = document.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  }

  afterEach(() => {
    document.getSelection()?.removeAllRanges();
  });

  it('pagehide → finish, the page at rest', async () => {
    const run = await mountPlaying();
    window.dispatchEvent(new Event('pagehide'));
    await restored(run, 'hidden-tab');
  });

  it('pageshow from the BFCache → finish; an ordinary pageshow does nothing', async () => {
    const run = await mountPlaying();
    window.dispatchEvent(new Event('pageshow'));
    expect(run.finish).not.toHaveBeenCalled();
    const fromCache = new Event('pageshow');
    Object.defineProperty(fromCache, 'persisted', { value: true });
    window.dispatchEvent(fromCache);
    await restored(run, 'hidden-tab');
  });

  it('beforeprint → finish, the page at rest', async () => {
    const run = await mountPlaying();
    window.dispatchEvent(new Event('beforeprint'));
    await restored(run, 'mutation');
  });

  it('a selection in Acts 1–2 → finish; a collapsed one does nothing', async () => {
    const run = await mountPlaying();
    document.dispatchEvent(new Event('selectionchange'));
    expect(run.finish).not.toHaveBeenCalled();
    run.phase = 'hold';
    selectHeadline();
    await restored(run, 'input');
  });

  it('a selection in Act 3 does not end the run', async () => {
    const run = await mountPlaying();
    run.phase = 'assemble';
    selectHeadline();
    expect(run.finish).not.toHaveBeenCalled();
    expect(html.classList.contains('arr-on')).toBe(true);
  });

  it('a reduced-motion change → finish, the page at rest', async () => {
    const run = await mountPlaying();
    expect(motionListeners).toHaveLength(1);
    motionListeners[0]();
    await restored(run, 'mutation');
  });

  it('pagehide during the wait ends it for good', async () => {
    const { engine } = makeEngine();
    render(
      <>
        <ArrivalMount />
        <ArrivalRun engine={engine} pathname="/desk" />
      </>,
    );
    expect(html.classList.contains('arr-pre')).toBe(true);
    window.dispatchEvent(new Event('pagehide'));
    expect(html.classList.contains('arr-pre')).toBe(false);
    addRoot('desk', true);
    await toReady();
    expect(engine.createRun).not.toHaveBeenCalled();
    expect(capture.mock.calls).toEqual([declined('desk', 'busy')]);
  });
});

describe('unmount', () => {
  it('mid-run: finish("mutation"), arr-* gone, and the cleanup itself writes nothing', async () => {
    addRoot('desk', true);
    const { engine, runs } = makeEngine();
    const view = render(<ArrivalRun engine={engine} pathname="/desk" />);
    await toReady();
    const run = runs[0];
    expect(html.classList.contains('arr-on')).toBe(true);

    const setItem = jest.spyOn(Storage.prototype, 'setItem');
    view.unmount();
    expect(run.finish).toHaveBeenCalledWith('mutation');
    expect(html.classList.contains('arr-pre')).toBe(false);
    expect(html.classList.contains('arr-on')).toBe(false);
    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();

    await flush();
    expect(capture.mock.calls).toEqual([['arrival_ended', { surface: 'desk', how: 'mutation' }]]);
  });

  it('mid-wait: the page is shown, nothing starts later, nothing is reported', async () => {
    const { engine } = makeEngine();
    const view = render(<ArrivalRun engine={engine} pathname="/desk" />);
    expect(html.classList.contains('arr-pre')).toBe(true);
    view.unmount();
    expect(html.classList.contains('arr-pre')).toBe(false);
    addRoot('desk', true);
    await toReady();
    await advance(BUDGET.SOFT_ENTRY_READY_MS);
    expect(engine.createRun).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalled();
  });
});
