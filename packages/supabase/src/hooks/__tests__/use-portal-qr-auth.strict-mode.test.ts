// @vitest-environment jsdom

import { createRequire } from 'node:module';
import {
  StrictMode,
  act,
  createElement,
  type ReactNode,
} from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePortalQrAuth, type PortalQrAuthState } from '../use-portal-qr-auth';

interface TestRoot {
  render(children: ReactNode): void;
  unmount(): void;
}

// ReactDOM is provided by the package's existing Next peer. Resolving from
// Next keeps this package's test manifest unchanged while exercising a real
// React root rather than mocking the hook dispatcher.
const localRequire = createRequire(import.meta.url);
const nextRequire = createRequire(localRequire.resolve('next/package.json'));
const { createRoot } = nextRequire('react-dom/client') as {
  createRoot(container: Element): TestRoot;
};

function generatedQr(url: string): Response {
  return {
    ok: true,
    json: vi.fn().mockResolvedValue({
      sessionToken: `session-${url}`,
      qrUrl: `patina://auth/qr?source=${encodeURIComponent(url)}`,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    }),
  } as unknown as Response;
}

let root: TestRoot | undefined;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-05T12:00:00.000Z'));
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  if (root) {
    await act(async () => root?.unmount());
    root = undefined;
  }
  vi.unstubAllGlobals();
  vi.useRealTimers();
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean })
    .IS_REACT_ACT_ENVIRONMENT;
});

describe('usePortalQrAuth React lifecycle', () => {
  it('survives StrictMode replay and safely replaces its baseUrl controller', async () => {
    const signals: AbortSignal[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.signal) signals.push(init.signal);
      return generatedQr(String(input));
    });
    vi.stubGlobal('fetch', fetcher);

    let observedState: PortalQrAuthState = 'idle';
    function Probe({ baseUrl }: { baseUrl: string }) {
      const auth = usePortalQrAuth({ baseUrl, enabled: true });
      observedState = auth.state;
      return createElement('span', { 'data-state': auth.state }, auth.state);
    }

    const container = document.createElement('div');
    root = createRoot(container);
    await act(async () => {
      root?.render(
        createElement(
          StrictMode,
          null,
          createElement(Probe, { baseUrl: 'https://first.patina.test' }),
        ),
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    // Strict Mode performs setup -> cleanup -> setup with the same memoized
    // controller. The replayed setup must still reach pending.
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(signals[0]?.aborted).toBe(true);
    expect(signals[1]?.aborted).toBe(false);
    expect(observedState).toBe('pending');
    expect(container.querySelector('span')?.dataset.state).toBe('pending');

    await act(async () => {
      root?.render(
        createElement(
          StrictMode,
          null,
          createElement(Probe, { baseUrl: 'https://second.patina.test' }),
        ),
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(signals[1]?.aborted).toBe(true);
    expect(fetcher).toHaveBeenLastCalledWith(
      'https://second.patina.test/api/auth/qr/generate',
      expect.objectContaining({ cache: 'no-store' }),
    );
    expect(observedState).toBe('pending');

    await act(async () => root?.unmount());
    root = undefined;
    expect(signals.every((signal) => signal.aborted)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
