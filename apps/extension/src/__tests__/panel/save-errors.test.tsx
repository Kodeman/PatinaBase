/**
 * CommitBar's save-error classification (CL W3-E10): offline vs an expired
 * session vs everything else — all three land on R5 with a live Retry (F4
 * rework: an expired-session save no longer routes off the draft).
 * `effects.saveToLibrary` is mocked to throw; everything else in
 * state/effects.ts (classifySaveError, the reducer) is real, so this
 * exercises the actual dispatch chain CommitBar's catch runs.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import type { ReactNode } from 'react';

vi.mock('../../lib/supabase', async () => {
  const { createMockSupabase } = await import('../mocks/supabase');
  const { supabase } = createMockSupabase();
  return { supabase, PORTAL_URL: 'https://app.patina.cloud' };
});

vi.mock('../../state/selectors', () => ({
  selectValidation: () => ({ isValid: true }),
}));

const { saveToLibrary } = vi.hoisted(() => ({ saveToLibrary: vi.fn() }));

vi.mock('../../state/effects', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../state/effects')>();
  return { ...actual, saveToLibrary };
});

import { CaptureProvider, useCapture } from '../../state/CaptureProvider';
import { initialCaptureState } from '../../state/reducer';
import { draftFromExtraction } from '../../state/draft';
import { CommitBar } from '../../panel/CommitBar';
import { ErrorScreen } from '../../screens/TerminalScreens';
import { ControllerContext } from '../../panel/controller-context';
import { KNOWN_BAD_DOMAIN_MESSAGE } from '../../lib/mode-detection';
import type { CaptureController } from '../../hooks/use-capture-controller';
import type { CaptureState } from '../../state/types';
import type { ExtractedProductData } from '@patina/shared';

function capturedState(): CaptureState {
  const state = initialCaptureState();
  state.nav.screen = 'C2';
  state.session = { status: 'signed-in', user: { id: 'user-1' } as never, workspaceId: null };
  state.routing = { ...state.routing, specBookPlacementValid: true };
  state.draft = draftFromExtraction({
    productName: 'Chair',
    description: 'Walnut chair',
    price: null,
    dimensions: null,
    materials: ['Walnut'],
    colors: null,
    finish: null,
    availableColors: null,
    availableFinishes: null,
    images: [],
    manufacturer: null,
    url: 'https://shop.example/p/1',
    extractedAt: '2026-08-29T00:00:00Z',
    confidence: 'high',
  } as ExtractedProductData);
  return state;
}

/** Renders CommitBar + the R5 screen from one CaptureProvider so a save
 * error's NAV dispatch actually swaps the visible screen, and a Probe that
 * exposes the live state for direct assertions (session/draft/nav). */
function Body({ seen }: { seen: { state: CaptureState | null } }) {
  const state = useCapture();
  seen.state = state;
  if (state.nav.screen === 'R5') return <ErrorScreen />;
  return <CommitBar />;
}

function renderPanel(state: CaptureState) {
  const controller: CaptureController = {
    refresh: vi.fn(),
    switchToVendor: vi.fn(),
    switchToProduct: vi.fn(),
    portalChecking: false,
    currentUrl: 'https://shop.example/p/1',
    captureStartedAt: Date.now(),
  };
  const seen: { state: CaptureState | null } = { state: null };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <CaptureProvider initial={state}>
      <ControllerContext.Provider value={controller}>{children}</ControllerContext.Provider>
    </CaptureProvider>
  );
  render(<Body seen={seen} />, { wrapper });
  return seen;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
});

describe('CommitBar save-error handling (CL W3-E10)', () => {
  it('routes an offline failure to R5 with the offline sentence and a Retry button', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    // The real postgrest-js/supabase-js shape for a network failure — a
    // plain object, not an Error (F1 rework: classifySaveError no longer
    // relies on `instanceof TypeError`).
    saveToLibrary.mockRejectedValueOnce({
      message: 'TypeError: Failed to fetch',
      details: '',
      hint: '',
      code: '',
    });

    const seen = renderPanel(capturedState());
    fireEvent.click(screen.getByRole('button', { name: 'Save to library' }));

    await waitFor(() =>
      expect(
        screen.getByText("You're offline — your draft is kept. Retry when you're back.")
      ).toBeTruthy()
    );
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
    expect(seen.state?.nav.screen).toBe('R5');
    // The draft that failed to save is still there for Retry to re-commit.
    expect(seen.state?.draft).not.toBeNull();
  });

  it('routes an expired session (PGRST301) to R5 with a live Retry — never the signed-out screen (F4 rework)', async () => {
    saveToLibrary.mockRejectedValueOnce({ code: 'PGRST301', message: 'JWT expired' });

    const seen = renderPanel(capturedState());
    fireEvent.click(screen.getByRole('button', { name: 'Save to library' }));

    await waitFor(() =>
      expect(screen.getByText('Your session expired — sign in to finish saving.')).toBeTruthy()
    );
    expect(seen.state?.nav.screen).toBe('R5');
    // Not a real sign-out: session.status is untouched and the draft is kept.
    expect(seen.state?.session.status).toBe('signed-in');
    expect(seen.state?.draft).not.toBeNull();
    expect(seen.state?.io.isSaving).toBe(false);
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  });

  it('carries lastCommitKind on SAVE_START for "Save as new" even with a dedup match showing (F2)', async () => {
    // A dedup match is showing (deriveRetryKind would otherwise guess
    // 'update' from it), but the user pressed "Save as new" — SAVE_START
    // must carry 'library' so a later Retry can't silently become an
    // update. (deriveRetryKind's own precedence is unit-tested in
    // effects.test.ts; runCommit's internal saveToLibrary/updateExisting
    // calls are same-module closures a top-level mock can't intercept, so
    // this asserts the dispatched action's payload instead of a spy.)
    const state = capturedState();
    state.dedup = {
      match: {
        id: 'existing-1',
        name: 'Chair',
        imageUrl: null,
        priceRetail: null,
        capturedAt: null,
      },
      confidence: 1,
      mergePicks: {},
    };
    saveToLibrary.mockRejectedValueOnce(new Error('server exploded'));

    const seen = renderPanel(state);
    fireEvent.click(screen.getByRole('button', { name: 'Save as new' }));

    await waitFor(() => expect(seen.state?.io.lastCommitKind).toBe('library'));
  });
});

describe('ErrorScreen on a known-bad domain with a live draft (F3)', () => {
  it('shows the known-bad body (Snapshot + By hand, no Retry) even though a draft is present', () => {
    const state = capturedState();
    state.nav.screen = 'R5';
    state.io = { ...state.io, error: KNOWN_BAD_DOMAIN_MESSAGE };

    renderPanel(state);

    expect(screen.getByText(KNOWN_BAD_DOMAIN_MESSAGE)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Snapshot' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'By hand' })).toBeTruthy();
  });
});
