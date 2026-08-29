/**
 * CL-R14 — the error screen shows the reason capture refused, and drops Retry
 * when retrying cannot help.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

vi.mock('../../lib/supabase', async () => {
  const { createMockSupabase } = await import('../mocks/supabase');
  const { supabase } = createMockSupabase();
  return { supabase, PORTAL_URL: 'https://app.patina.cloud' };
});
vi.mock('../../hooks/use-portal-session', () => ({
  usePortalSession: () => ({ isChecking: false }),
}));

import { CaptureProvider, useCapture } from '../../state/CaptureProvider';
import { captureReducer, initialCaptureState } from '../../state/reducer';
import { ControllerContext } from '../../panel/controller-context';
import { ErrorScreen } from '../../screens/TerminalScreens';
import { KNOWN_BAD_DOMAIN_MESSAGE } from '../../lib/mode-detection';
import { useCaptureController } from '../../hooks/use-capture-controller';
import type { CaptureController } from '../../hooks/use-capture-controller';
import type { CaptureState } from '../../state/types';

function renderWithError(error: string): { refresh: ReturnType<typeof vi.fn> } {
  const refresh = vi.fn();
  const controller: CaptureController = {
    refresh,
    switchToVendor: vi.fn(),
    switchToProduct: vi.fn(),
    portalChecking: false,
    currentUrl: 'https://www.pinterest.com/pin/378724649918852625/',
  };

  const state = captureReducer(initialCaptureState(), { type: 'EXTRACTION_ERROR', error });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <CaptureProvider initial={state}>
      <ControllerContext.Provider value={controller}>{children}</ControllerContext.Provider>
    </CaptureProvider>
  );

  render(<ErrorScreen />, { wrapper });
  return { refresh };
}

afterEach(() => {
  cleanup();
});

describe('ErrorScreen (CL-R14)', () => {
  it('renders the known-bad refusal message and hides Retry', () => {
    renderWithError(KNOWN_BAD_DOMAIN_MESSAGE);

    expect(screen.getByText(KNOWN_BAD_DOMAIN_MESSAGE)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    // The two paths that still work stay.
    expect(screen.getByRole('button', { name: 'Snapshot' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'By hand' })).toBeTruthy();
  });

  it('renders a generic extraction error and keeps Retry', () => {
    renderWithError('Failed to extract product data');

    expect(screen.getByText('Failed to extract product data')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Snapshot' })).toBeTruthy();
  });

  it('is where a facebook about page lands, not the vendor screen', async () => {
    // detectModeFromUrl reads /about as a vendor page, so this only passes if
    // the known-bad guard runs before the mode branch in the controller.
    const url = 'https://www.facebook.com/somemaker/about';
    (globalThis as unknown as {
      chrome: { tabs: { query: ReturnType<typeof vi.fn> } };
    }).chrome.tabs.query = vi.fn(
      (_q: unknown, cb: (tabs: Array<{ id: number; url: string }>) => void) =>
        cb([{ id: 1, url }])
    );

    // A holder object, not a `let` — TS narrows a closure-assigned local to its
    // initializer here and the later reads become `never`.
    const seen: { state: CaptureState | null } = { state: null };
    function Probe() {
      useCaptureController();
      seen.state = useCapture();
      return null;
    }

    const signedIn: CaptureState = {
      ...initialCaptureState(),
      session: {
        status: 'signed-in',
        // Only `status` is read by the controller's extraction gate.
        user: { id: 'user-1' } as CaptureState['session']['user'],
        workspaceId: null,
      },
    };

    render(
      <CaptureProvider initial={signedIn}>
        <Probe />
      </CaptureProvider>
    );

    await waitFor(() => {
      expect(seen.state?.nav.screen).toBe('R5');
    });
    expect(seen.state?.io.error).toBe(KNOWN_BAD_DOMAIN_MESSAGE);
  });

  it('falls back to the generic sentence when no error is set', () => {
    const controller: CaptureController = {
      refresh: vi.fn(),
      switchToVendor: vi.fn(),
      switchToProduct: vi.fn(),
      portalChecking: false,
      currentUrl: 'https://example.com/p/1',
    };
    render(
      <CaptureProvider initial={initialCaptureState()}>
        <ControllerContext.Provider value={controller}>
          <ErrorScreen />
        </ControllerContext.Provider>
      </CaptureProvider>
    );

    expect(
      screen.getByText('The page blocked extraction or timed out. Try again, or capture it by hand.')
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  });
});
