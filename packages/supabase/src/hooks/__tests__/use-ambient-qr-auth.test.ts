// @vitest-environment jsdom

import { createRequire } from 'node:module';
import { StrictMode, act, createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useAmbientQrAuth,
  type AmbientQrAuthOptions,
  type AmbientQrAuthResult,
} from '../use-ambient-qr-auth';

interface TestRoot {
  render(children: ReactNode): void;
  unmount(): void;
}

// ReactDOM comes from the package's existing Next peer, matching the sibling
// strict-mode suite: a real root, not a mocked dispatcher.
const localRequire = createRequire(import.meta.url);
const nextRequire = createRequire(localRequire.resolve('next/package.json'));
const { createRoot } = nextRequire('react-dom/client') as {
  createRoot(container: Element): TestRoot;
};

const QR_LIFETIME_MS = 60_000;

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 400): Response {
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

/** Serves generate + status by URL so tests can move the clock freely. */
function makeFetcher({ generateStatus = 200 }: { generateStatus?: number } = {}) {
  let issued = 0;
  return vi.fn(async (input: RequestInfo | URL) => {
    if (String(input).includes('/generate')) {
      if (generateStatus !== 200) {
        return jsonResponse({ error: 'too many' }, false, generateStatus);
      }
      issued += 1;
      return jsonResponse({
        sessionToken: `session-${issued}`,
        qrUrl: `patina://auth?session=${issued}`,
        expiresAt: new Date(Date.now() + QR_LIFETIME_MS).toISOString(),
      });
    }
    return jsonResponse({ status: 'pending' });
  });
}

type Fetcher = ReturnType<typeof makeFetcher>;

function callsTo(fetcher: Fetcher, path: string): number {
  return fetcher.mock.calls.filter((call) => String(call[0]).includes(path)).length;
}

let root: TestRoot | undefined;
let latest: AmbientQrAuthResult | undefined;
let hidden = false;

function Probe(props: AmbientQrAuthOptions) {
  latest = useAmbientQrAuth(props);
  return createElement('span', { 'data-phase': latest.phase }, latest.phase);
}

async function render(props: AmbientQrAuthOptions): Promise<void> {
  await act(async () => {
    root?.render(createElement(Probe, props));
    await vi.advanceTimersByTimeAsync(0);
  });
}

/** Advance the fake clock inside act, then let every settled promise land. */
async function flush(ms = 0): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

async function setHidden(next: boolean): Promise<void> {
  hidden = next;
  await act(async () => {
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
  });
  await flush();
}

/** Spend both auto-renewals so the badge is resting. */
async function burnRenewalBudget(): Promise<void> {
  await flush(QR_LIFETIME_MS + 1_000);
  await flush(QR_LIFETIME_MS + 1_000);
  await flush(QR_LIFETIME_MS + 1_000);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-05T12:00:00.000Z'));
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  hidden = false;
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    get: () => hidden,
  });
  root = createRoot(document.createElement('div'));
});

afterEach(async () => {
  if (root) {
    await act(async () => root?.unmount());
    root = undefined;
  }
  latest = undefined;
  vi.unstubAllGlobals();
  vi.useRealTimers();
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

describe('useAmbientQrAuth', () => {
  it('renews twice on expiry and then rests with the last code latched', async () => {
    const fetcher = makeFetcher();
    vi.stubGlobal('fetch', fetcher);

    await render({ baseUrl: '', enabled: true });
    await flush();
    expect(latest).toMatchObject({
      phase: 'live',
      qrState: 'pending',
      qrUrl: 'patina://auth?session=1',
      secondsRemaining: 60,
      totalSeconds: 60,
    });
    expect(callsTo(fetcher, '/generate')).toBe(1);

    await flush(QR_LIFETIME_MS + 1_000);
    expect(callsTo(fetcher, '/generate')).toBe(2);
    expect(latest).toMatchObject({ phase: 'live', qrUrl: 'patina://auth?session=2' });

    await flush(QR_LIFETIME_MS + 1_000);
    expect(callsTo(fetcher, '/generate')).toBe(3);
    expect(latest?.phase).toBe('live');

    // Budget spent: the third expiry rests instead of asking again.
    await flush(QR_LIFETIME_MS + 1_000);
    expect(callsTo(fetcher, '/generate')).toBe(3);
    expect(latest).toMatchObject({
      phase: 'resting',
      qrState: 'expired',
      qrUrl: 'patina://auth?session=3',
      secondsRemaining: 0,
    });

    // A resting badge stops polling entirely.
    const pollsAtRest = callsTo(fetcher, '/status');
    await flush(30_000);
    expect(callsTo(fetcher, '/status')).toBe(pollsAtRest);
  });

  it('wakes with a fresh budget so auto-renewal works again', async () => {
    const fetcher = makeFetcher();
    vi.stubGlobal('fetch', fetcher);

    await render({ baseUrl: '', enabled: true });
    await flush();
    await burnRenewalBudget();
    expect(latest?.phase).toBe('resting');
    expect(callsTo(fetcher, '/generate')).toBe(3);

    await act(async () => {
      latest?.wake();
      await vi.advanceTimersByTimeAsync(0);
    });
    await flush();
    expect(callsTo(fetcher, '/generate')).toBe(4);
    expect(latest?.phase).toBe('live');

    await flush(QR_LIFETIME_MS + 1_000);
    expect(callsTo(fetcher, '/generate')).toBe(5);
    expect(latest?.phase).toBe('live');
  });

  it('resets the budget when the badge is re-enabled', async () => {
    const fetcher = makeFetcher();
    vi.stubGlobal('fetch', fetcher);

    await render({ baseUrl: '', enabled: true });
    await flush();
    await burnRenewalBudget();
    expect(latest?.phase).toBe('resting');

    await render({ baseUrl: '', enabled: false });
    await flush();
    expect(latest).toMatchObject({ qrState: 'idle', qrUrl: null });
    expect(callsTo(fetcher, '/generate')).toBe(3);

    await render({ baseUrl: '', enabled: true });
    await flush();
    expect(callsTo(fetcher, '/generate')).toBe(4);
    expect(latest?.phase).toBe('live');

    await flush(QR_LIFETIME_MS + 1_000);
    expect(callsTo(fetcher, '/generate')).toBe(5);
    expect(latest?.phase).toBe('live');
  });

  it('pauses polling and defers renewal while hidden, then flushes on visible', async () => {
    const fetcher = makeFetcher();
    vi.stubGlobal('fetch', fetcher);

    await render({ baseUrl: '', enabled: true });
    await flush();
    await flush(4_000);
    expect(callsTo(fetcher, '/status')).toBe(2);

    await setHidden(true);
    const pausedPolls = callsTo(fetcher, '/status');
    await flush(10_000);
    expect(callsTo(fetcher, '/status')).toBe(pausedPolls);
    // The local countdown is untouched by the pause.
    expect(latest?.secondsRemaining).toBe(46);

    await flush(QR_LIFETIME_MS);
    expect(latest?.qrState).toBe('expired');
    expect(latest?.phase).toBe('refreshing');
    expect(callsTo(fetcher, '/generate')).toBe(1);

    await setHidden(false);
    expect(callsTo(fetcher, '/generate')).toBe(2);
    expect(latest?.phase).toBe('live');

    await flush(2_000);
    expect(callsTo(fetcher, '/status')).toBeGreaterThan(pausedPolls);
  });

  it('rests in an error phase on 429 and throttles wake for the backoff window', async () => {
    const fetcher = makeFetcher({ generateStatus: 429 });
    vi.stubGlobal('fetch', fetcher);

    await render({ baseUrl: '', enabled: true, renewBackoffMs: 60_000 });
    await flush();
    expect(latest).toMatchObject({
      phase: 'error',
      qrState: 'error',
      failure: { kind: 'rate_limit' },
      // The badge reads this to decide whether to offer a tap at all.
      wakeAvailable: false,
    });
    expect(callsTo(fetcher, '/generate')).toBe(1);

    await flush(30_000);
    expect(latest?.wakeAvailable).toBe(false);
    await act(async () => {
      latest?.wake();
      await vi.advanceTimersByTimeAsync(0);
    });
    await flush();
    expect(callsTo(fetcher, '/generate')).toBe(1);

    await flush(30_000);
    // The window closes on its own — nothing else was going to re-render a
    // rate-limited badge, so the affordance has to come back by itself.
    expect(latest?.wakeAvailable).toBe(true);
    await act(async () => {
      latest?.wake();
      await vi.advanceTimersByTimeAsync(0);
    });
    await flush();
    expect(callsTo(fetcher, '/generate')).toBe(2);
  });

  it('generates nothing in a tab that has never been seen, then once it is', async () => {
    const fetcher = makeFetcher();
    vi.stubGlobal('fetch', fetcher);
    hidden = true;

    await render({ baseUrl: '', enabled: true });
    await flush(30_000);
    // A background tab is hidden from its first paint: the visibility handler
    // can only pause a transport that already started, so the start itself has
    // to wait for someone to look.
    expect(fetcher).not.toHaveBeenCalled();
    expect(latest).toMatchObject({ qrState: 'idle', qrUrl: null });

    await setHidden(false);
    expect(callsTo(fetcher, '/generate')).toBe(1);
    expect(latest?.phase).toBe('live');

    // The latch holds: hiding again pauses polling as before, it does not send
    // the badge back behind a second reveal.
    await setHidden(true);
    await setHidden(false);
    expect(callsTo(fetcher, '/generate')).toBe(1);
    expect(latest?.phase).toBe('live');
  });

  it('spends exactly one renewal per expiry under Strict Mode', async () => {
    const fetcher = makeFetcher();
    vi.stubGlobal('fetch', fetcher);

    await act(async () => {
      root?.render(
        createElement(
          StrictMode,
          null,
          createElement(Probe, { baseUrl: '', enabled: true }),
        ),
      );
      await vi.advanceTimersByTimeAsync(0);
    });
    await flush();
    expect(latest?.phase).toBe('live');
    // Strict Mode replays the transport's setup/cleanup/setup; the policy layer
    // must not add renewals of its own on top of it.
    const afterMount = callsTo(fetcher, '/generate');

    await flush(QR_LIFETIME_MS + 1_000);
    expect(callsTo(fetcher, '/generate')).toBe(afterMount + 1);
    expect(latest?.phase).toBe('live');

    await flush(QR_LIFETIME_MS + 1_000);
    expect(callsTo(fetcher, '/generate')).toBe(afterMount + 2);

    await flush(QR_LIFETIME_MS + 1_000);
    expect(callsTo(fetcher, '/generate')).toBe(afterMount + 2);
    expect(latest?.phase).toBe('resting');
  });

  it('makes no request at all while disabled', async () => {
    const fetcher = makeFetcher();
    vi.stubGlobal('fetch', fetcher);

    await render({ baseUrl: '', enabled: false });
    await flush(120_000);

    expect(fetcher).not.toHaveBeenCalled();
    expect(latest).toMatchObject({
      qrState: 'idle',
      qrUrl: null,
      secondsRemaining: 0,
      totalSeconds: 0,
      failure: null,
    });

    await act(async () => {
      latest?.wake();
      await vi.advanceTimersByTimeAsync(0);
    });
    await flush();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
