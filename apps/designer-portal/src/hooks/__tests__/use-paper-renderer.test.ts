import * as React from 'react';
import { act, cleanup, render, renderHook } from '@testing-library/react';
import { renderToString } from 'react-dom/server.node';
import { hydrateRoot } from 'react-dom/client';
import type { PaperRendererState } from '../use-paper-renderer';

const mockPossible = jest.fn();
const mockReadFlag = jest.fn();
let mockUserId: string | null = 'designer-a';
let mockDistinctId = 'designer-a';
let initCallbacks: Set<() => void>;
type FlagsCallback = (flags: string[], variants: Record<string, boolean>, context?: { errorsLoading: boolean }) => void;
let flagCallbacks: Set<FlagsCallback>;
let reloadCallbacks: Set<() => void>;
const mockOnInit = jest.fn();
const mockOnFlags = jest.fn();
const mockOnReload = jest.fn();
const mockFeatureFlags = { _additionalReloadRequested: false, _reloadDebouncer: undefined as number | undefined };

jest.mock('@patina/supabase', () => ({ useSessionUserId: () => mockUserId }));
jest.mock('@/lib/analytics/posthog', () => ({
  isAnalyticsPossible: () => mockPossible(),
  onAnalyticsInit: (callback: () => void) => mockOnInit(callback),
  posthog: {
    featureFlags: mockFeatureFlags,
    isFeatureEnabled: () => mockReadFlag(),
    get_distinct_id: () => mockDistinctId,
    onFeatureFlags: (callback: FlagsCallback) => mockOnFlags(callback),
    on: (_event: string, callback: () => void) => mockOnReload(callback),
  },
}));

const KEY = 'patina:paper-renderer:v1';
const originalOverride = process.env.NEXT_PUBLIC_FLAG_OVERRIDES;
let usePaperRenderer: () => PaperRendererState;
let readStorage: jest.SpyInstance;
let writeStorage: jest.SpyInstance;

function store(renderer: string, userId: string | null = mockUserId) {
  sessionStorage.setItem(KEY, JSON.stringify({ renderer, source: 'flag', userId, decidedAt: 1 }));
  writeStorage.mockClear();
}

function initializeAnalytics() {
  act(() => { Array.from(initCallbacks).forEach((callback) => callback()); });
}

async function answer(value: boolean | undefined, errorsLoading = false) {
  mockReadFlag.mockReturnValue(value);
  await act(async () => {
    Array.from(flagCallbacks).forEach((callback) => callback([], {}, { errorsLoading }));
  });
}

function reload() {
  Array.from(reloadCallbacks).forEach((callback) => callback());
}

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['queueMicrotask'] });
  jest.clearAllMocks();
  delete process.env.NEXT_PUBLIC_FLAG_OVERRIDES;
  sessionStorage.clear();
  mockUserId = 'designer-a';
  mockDistinctId = 'designer-a';
  mockPossible.mockReturnValue(true);
  mockReadFlag.mockReturnValue(undefined);
  mockFeatureFlags._additionalReloadRequested = false;
  mockFeatureFlags._reloadDebouncer = undefined;
  initCallbacks = new Set();
  flagCallbacks = new Set();
  reloadCallbacks = new Set();
  mockOnInit.mockImplementation((callback: () => void) => {
    initCallbacks.add(callback);
    return () => { initCallbacks.delete(callback); };
  });
  mockOnFlags.mockImplementation((callback: FlagsCallback) => {
    flagCallbacks.add(callback);
    return () => { flagCallbacks.delete(callback); };
  });
  mockOnReload.mockImplementation((callback: () => void) => {
    reloadCallbacks.add(callback);
    return () => { reloadCallbacks.delete(callback); };
  });
  readStorage = jest.spyOn(Storage.prototype, 'getItem');
  writeStorage = jest.spyOn(Storage.prototype, 'setItem');
  // Fresh module = full page load, but keep the test renderer's React singleton.
  jest.isolateModules(() => {
    jest.doMock('react', () => React);
    usePaperRenderer = require('../use-paper-renderer').usePaperRenderer;
  });
});

afterEach(() => {
  cleanup();
  jest.clearAllTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
  if (originalOverride === undefined) delete process.env.NEXT_PUBLIC_FLAG_OVERRIDES;
  else process.env.NEXT_PUBLIC_FLAG_OVERRIDES = originalOverride;
});

describe('usePaperRenderer', () => {
  it.each([
    ['true', 'round8'], ['false', 'legacy'], ['TRUE', 'legacy'], ['1', 'legacy'],
  ])('override %s selects %s on the first render without analytics or storage', (value, renderer) => {
    process.env.NEXT_PUBLIC_FLAG_OVERRIDES = `designer-paper-round8:${value}`;
    const renders: PaperRendererState[] = [];
    renderHook(() => { const state = usePaperRenderer(); renders.push(state); return state; });
    expect(renders[0]).toEqual({ renderer, source: 'override' });
    expect(mockPossible).not.toHaveBeenCalled();
    expect(mockReadFlag).not.toHaveBeenCalled();
    expect(mockOnInit).not.toHaveBeenCalled();
    expect(readStorage).not.toHaveBeenCalled();
    expect(writeStorage).not.toHaveBeenCalled();
  });

  it('unavailable analytics resolves legacy in the first effect', () => {
    mockPossible.mockReturnValue(false);
    const { result } = renderHook(() => usePaperRenderer());
    expect(result.current).toEqual({ renderer: 'legacy', source: 'unavailable' });
    expect(mockOnInit).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  it.each(['legacy', 'round8'])('unavailable analytics reuses the same-user %s tab fallback', (renderer) => {
    store(renderer);
    mockPossible.mockReturnValue(false);
    const { result } = renderHook(() => usePaperRenderer());
    expect(result.current).toEqual({ renderer, source: 'tab' });
  });

  it.each([true, false])('cached identified %s wins over the tab latch with no timer left', (value) => {
    store(value ? 'legacy' : 'round8');
    mockReadFlag.mockReturnValue(value);
    const { result } = renderHook(() => usePaperRenderer());
    initializeAnalytics();
    expect(result.current).toEqual({ renderer: value ? 'round8' : 'legacy', source: 'cached' });
    expect(readStorage).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
    expect(mockOnFlags).not.toHaveBeenCalled();
  });

  it.each([true, false])('cached %s from another account and its synchronous replay are ignored', async (cached) => {
    mockDistinctId = 'designer-b';
    mockReadFlag.mockReturnValue(cached);
    mockOnFlags.mockImplementation((callback: FlagsCallback) => {
      flagCallbacks.add(callback);
      callback([], {});
      return () => { flagCallbacks.delete(callback); };
    });
    const { result } = renderHook(() => usePaperRenderer());
    initializeAnalytics();
    expect(result.current.renderer).toBe('pending');
    mockDistinctId = 'designer-a';
    await answer(true);
    expect(result.current).toEqual({ renderer: 'round8', source: 'flag' });
  });

  it('already initialized analytics can resolve synchronously and unsubscribe init', () => {
    const unsubscribe = jest.fn();
    mockReadFlag.mockReturnValue(true);
    mockOnInit.mockImplementation((callback: () => void) => { callback(); return unsubscribe; });
    const { result } = renderHook(() => usePaperRenderer());
    expect(result.current).toEqual({ renderer: 'round8', source: 'cached' });
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('fresh true wins before timeout and writes the identified tab decision', async () => {
    const { result } = renderHook(() => usePaperRenderer());
    initializeAnalytics();
    act(() => { jest.advanceTimersByTime(400); });
    await answer(true);
    expect(result.current).toEqual({ renderer: 'round8', source: 'flag' });
    expect(JSON.parse(sessionStorage.getItem(KEY)!)).toEqual({
      renderer: 'round8', source: 'flag', userId: 'designer-a', decidedAt: Date.now(),
    });
    expect(jest.getTimerCount()).toBe(0);
  });

  it('anonymous true stays pending until the identified false answer', async () => {
    mockDistinctId = 'anonymous';
    const { result } = renderHook(() => usePaperRenderer());
    initializeAnalytics();
    await answer(true);
    expect(result.current.renderer).toBe('pending');
    act(() => { mockDistinctId = 'designer-a'; reload(); });
    await answer(false);
    expect(result.current).toEqual({ renderer: 'legacy', source: 'flag' });
  });

  it('ignores an anonymous in-flight answer after identify queued a follow-up', async () => {
    mockDistinctId = 'anonymous';
    const { result } = renderHook(() => usePaperRenderer());
    initializeAnalytics();
    act(() => {
      mockDistinctId = 'designer-a';
      reload();
      mockFeatureFlags._additionalReloadRequested = true;
    });
    await answer(true);
    expect(result.current.renderer).toBe('pending');
    mockFeatureFlags._additionalReloadRequested = false;
    await answer(false);
    expect(result.current).toEqual({ renderer: 'legacy', source: 'flag' });
  });

  it('waits through a debounced reload before accepting the next answer', async () => {
    const { result } = renderHook(() => usePaperRenderer());
    initializeAnalytics();
    act(() => {
      reload();
      mockFeatureFlags._reloadDebouncer = 1;
    });
    await answer(true);
    expect(result.current.renderer).toBe('pending');
    mockFeatureFlags._reloadDebouncer = undefined;
    await answer(false);
    expect(result.current).toEqual({ renderer: 'legacy', source: 'flag' });
  });

  it('settles a recorded identified true when the session identity arrives late', async () => {
    mockUserId = null;
    const { result, rerender } = renderHook(() => usePaperRenderer());
    initializeAnalytics();
    await answer(true);
    expect(result.current.renderer).toBe('pending');
    mockUserId = 'designer-a';
    rerender();
    expect(result.current).toEqual({ renderer: 'round8', source: 'flag' });
    expect(jest.getTimerCount()).toBe(0);
  });

  it.each([false, true])('unidentified true times out to %s tab fallback at 1500ms', async (hasTab) => {
    if (hasTab) store('round8');
    mockDistinctId = 'anonymous';
    const { result } = renderHook(() => usePaperRenderer());
    initializeAnalytics();
    await answer(true);
    act(() => { jest.advanceTimersByTime(1499); });
    expect(result.current.renderer).toBe('pending');
    act(() => { jest.advanceTimersByTime(1); });
    expect(result.current).toEqual({ renderer: hasTab ? 'round8' : 'legacy', source: hasTab ? 'tab' : 'timeout' });
  });

  it('null-session true stays pending until the 1500ms fallback', async () => {
    mockUserId = null;
    const { result } = renderHook(() => usePaperRenderer());
    initializeAnalytics();
    await answer(true);
    expect(result.current.renderer).toBe('pending');
    act(() => { jest.advanceTimersByTime(1499); });
    expect(result.current.renderer).toBe('pending');
    act(() => { jest.advanceTimersByTime(1); });
    expect(result.current).toEqual({ renderer: 'legacy', source: 'timeout' });
  });

  it('anonymous false stays pending through identify and reload until true', async () => {
    mockDistinctId = 'anonymous';
    const renders: string[] = [];
    const { result } = renderHook(() => {
      const state = usePaperRenderer(); renders.push(state.renderer); return state;
    });
    initializeAnalytics();
    await answer(false);
    expect(result.current.renderer).toBe('pending');
    act(() => { mockDistinctId = 'designer-a'; reload(); });
    await answer(true);
    expect(result.current.renderer).toBe('round8');
    expect(renders).not.toContain('legacy');
  });

  it('reload after a provisional false invalidates it until the next identified callback', async () => {
    const { result } = renderHook(() => usePaperRenderer());
    initializeAnalytics();
    mockReadFlag.mockReturnValue(false);
    await act(async () => {
      flagCallbacks.forEach((callback) => callback([], {}, { errorsLoading: false }));
      reload();
    });
    expect(result.current.renderer).toBe('pending');
    await answer(false);
    expect(result.current).toEqual({ renderer: 'legacy', source: 'flag' });
  });

  it('null session identity cannot finalize cached or anonymous false', async () => {
    mockUserId = null;
    mockReadFlag.mockReturnValue(false);
    const { result, rerender } = renderHook(() => usePaperRenderer());
    initializeAnalytics();
    await answer(false);
    expect(result.current.renderer).toBe('pending');
    mockUserId = 'designer-a';
    rerender();
    await answer(false);
    expect(result.current).toEqual({ renderer: 'legacy', source: 'flag' });
  });

  it.each([undefined, 'round8'])('errors fall back immediately, ignoring stale SDK true (tab %s)', async (tab) => {
    if (tab) store(tab);
    const { result } = renderHook(() => usePaperRenderer());
    initializeAnalytics();
    await answer(true, true);
    expect(result.current).toEqual({ renderer: tab ?? 'legacy', source: tab ? 'tab' : 'error' });
    expect(jest.getTimerCount()).toBe(0);
  });

  it.each(['never initialized', 'blackholed flags', 'undefined callback'])('%s falls back exactly at 1500ms', async (scenario) => {
    const { result } = renderHook(() => usePaperRenderer());
    if (scenario !== 'never initialized') initializeAnalytics();
    if (scenario === 'undefined callback') await answer(undefined);
    act(() => { jest.advanceTimersByTime(1499); });
    expect(result.current.renderer).toBe('pending');
    act(() => { jest.advanceTimersByTime(1); });
    expect(result.current).toEqual({ renderer: 'legacy', source: 'timeout' });
    await answer(true);
    initializeAnalytics();
    expect(result.current.renderer).toBe('legacy');
  });

  it('timeout reads same-user tab fallback only at the deadline', () => {
    store('round8');
    const { result } = renderHook(() => usePaperRenderer());
    initializeAnalytics();
    expect(readStorage).not.toHaveBeenCalled();
    act(() => { jest.advanceTimersByTime(1500); });
    expect(result.current).toEqual({ renderer: 'round8', source: 'tab' });
  });

  it.each(['different user', 'null user', 'malformed JSON', 'invalid renderer'])('ignores %s tab data', (scenario) => {
    if (scenario === 'different user') store('round8', 'designer-b');
    if (scenario === 'null user') { mockUserId = null; store('round8', null); }
    if (scenario === 'invalid renderer') store('new-renderer');
    if (scenario === 'malformed JSON') sessionStorage.setItem(KEY, '{bad');
    mockPossible.mockReturnValue(false);
    const { result } = renderHook(() => usePaperRenderer());
    expect(result.current).toEqual({ renderer: 'legacy', source: 'unavailable' });
  });

  it('blocked sessionStorage keeps an in-memory latch across navigation', async () => {
    readStorage.mockImplementation(() => { throw new Error('blocked'); });
    writeStorage.mockImplementation(() => { throw new Error('blocked'); });
    const desk = renderHook(() => usePaperRenderer());
    initializeAnalytics();
    await answer(true, true);
    expect(desk.result.current).toEqual({ renderer: 'legacy', source: 'error' });
    desk.unmount();
    const doc = renderHook(() => usePaperRenderer());
    expect(doc.result.current.renderer).toBe('legacy');
    expect(mockOnInit).toHaveBeenCalledTimes(1);
  });

  it('SDK initialization exceptions fall back immediately', () => {
    mockOnInit.mockImplementation(() => { throw new Error('blocked SDK'); });
    const { result } = renderHook(() => usePaperRenderer());
    expect(result.current).toEqual({ renderer: 'legacy', source: 'error' });
    expect(jest.getTimerCount()).toBe(0);
  });

  it('later opposite callbacks and five-minute reload never replace a frame or decision', async () => {
    let mounts = 0;
    function Frame() { React.useEffect(() => { mounts += 1; }, []); return null; }
    function Paper() {
      const { renderer } = usePaperRenderer();
      return renderer === 'pending' ? null : React.createElement(Frame, { key: renderer });
    }
    render(React.createElement(Paper));
    initializeAnalytics();
    const lateCallback = Array.from(flagCallbacks)[0];
    await answer(true);
    mockReadFlag.mockReturnValue(false);
    await act(async () => {
      lateCallback([], {}, { errorsLoading: false });
      reload();
      jest.advanceTimersByTime(300_000);
    });
    expect(mounts).toBe(1);
    expect(flagCallbacks.size).toBe(0);
    expect(reloadCallbacks.size).toBe(0);
    expect(writeStorage).toHaveBeenCalledTimes(1);
  });

  it('desk to doc to desk preserves the module latch with no second pending render', async () => {
    const desk = renderHook(() => usePaperRenderer());
    initializeAnalytics();
    await answer(true);
    desk.unmount();
    for (let visit = 0; visit < 2; visit += 1) {
      const renders: string[] = [];
      const page = renderHook(() => {
        const state = usePaperRenderer(); renders.push(state.renderer); return state;
      });
      expect(renders).toEqual(['round8']);
      page.unmount();
    }
    expect(mockOnInit).toHaveBeenCalledTimes(1);
  });

  it('simultaneous consumers and StrictMode share one deadline and decision', async () => {
    const { result } = renderHook(() => [usePaperRenderer(), usePaperRenderer()], {
      wrapper: ({ children }) => React.createElement(React.StrictMode, null, children),
    });
    expect(mockOnInit).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(1);
    initializeAnalytics();
    await answer(true);
    expect(result.current.map((state) => state.renderer)).toEqual(['round8', 'round8']);
    expect(writeStorage).toHaveBeenCalledTimes(1);
  });

  it('DNT does not block a successful flag answer (measured SDK contract)', async () => {
    Object.defineProperty(navigator, 'doNotTrack', { value: '1', configurable: true });
    const { result } = renderHook(() => usePaperRenderer());
    initializeAnalytics();
    await answer(true);
    expect(result.current.renderer).toBe('round8');
    Reflect.deleteProperty(navigator, 'doNotTrack');
  });

  it('SSR and first hydration render are pending with neither frame and no mismatch', async () => {
    const renders: string[] = [];
    function Paper() {
      const { renderer } = usePaperRenderer(); renders.push(renderer);
      return React.createElement('div', null, renderer === 'pending' ? 'arrival' : renderer);
    }
    const html = renderToString(React.createElement(Paper));
    expect(html).toBe('<div>arrival</div>');
    expect(mockPossible).not.toHaveBeenCalled();
    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);
    const onRecoverableError = jest.fn();
    let root: ReturnType<typeof hydrateRoot>;
    await act(async () => { root = hydrateRoot(container, React.createElement(Paper), { onRecoverableError }); });
    expect(renders.slice(0, 2)).toEqual(['pending', 'pending']);
    expect(container.textContent).toBe('arrival');
    expect(onRecoverableError).not.toHaveBeenCalled();
    act(() => { root!.unmount(); });
    container.remove();
  });
});
