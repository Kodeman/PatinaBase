import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExtractedProductData } from '@patina/shared';

const { saveToLibrary } = vi.hoisted(() => ({ saveToLibrary: vi.fn() }));

vi.mock('../../hooks/use-reference-data', () => ({
  useReferenceData: () => ({ projects: [], styles: [] }),
}));

vi.mock('../../state/selectors', () => ({
  selectValidation: () => ({ isValid: true }),
}));

vi.mock('../../state/effects', () => ({
  reuseProductForSpecBookPlacement: vi.fn(),
  retrySpecBookPlacement: vi.fn(),
  saveToLibrary,
  saveToInbox: vi.fn(),
  updateExisting: vi.fn(),
}));

vi.mock('../../components/FFESlotPicker', async () => {
  const React = await import('react');
  return {
    FFESlotPicker: ({ onRouteChange }: { onRouteChange?: (route: { kind: 'library' }, valid: boolean) => void }) => {
      React.useEffect(() => onRouteChange?.({ kind: 'library' }, true), []);
      return <div aria-label="Project placement picker" />;
    },
  };
});

import { RouteCommitRegion } from '../../panel/regions/RouteCommitRegion';
import { CommitBar } from '../../panel/CommitBar';
import { CaptureProvider } from '../../state/CaptureProvider';
import { draftFromExtraction } from '../../state/draft';
import { initialCaptureState } from '../../state/reducer';

function capturedState() {
  const state = initialCaptureState();
  state.nav.screen = 'C2';
  state.session = { status: 'signed-in', user: { id: 'user-1' } as never, workspaceId: null };
  state.draft = draftFromExtraction({
    productName: 'Chair', description: 'Walnut chair', price: null, dimensions: null,
    materials: ['Walnut'], colors: null, finish: null, availableColors: null,
    availableFinishes: null, images: [], manufacturer: null,
    url: 'https://example.com/chair', extractedAt: '2026-08-10T00:00:00Z', confidence: 'high',
  } as ExtractedProductData);
  return state;
}

describe('unflagged GA route readiness', () => {
  beforeEach(() => vi.clearAllMocks());

  it('blocks a fast save and never exposes the legacy route while storage is delayed', async () => {
    let resolveStorage!: (value: Record<string, unknown>) => void;
    const delayedStorage = new Promise<Record<string, unknown>>((resolve) => { resolveStorage = resolve; });
    vi.mocked(chrome.storage.local.get).mockReturnValueOnce(delayedStorage as never);

    render(
      <CaptureProvider initial={capturedState()}>
        <RouteCommitRegion />
        <CommitBar />
      </CaptureProvider>,
    );

    expect(screen.getByLabelText('Loading project placement')).not.toBeNull();
    expect(screen.queryByRole('combobox', { name: /route/i })).toBeNull();
    const save = screen.getByRole('button', { name: 'Save to library' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.click(save);
    expect(saveToLibrary).not.toHaveBeenCalled();

    await act(async () => resolveStorage({}));
    await waitFor(() => expect(screen.getByLabelText('Project placement picker')).not.toBeNull());
    await waitFor(() => expect(save.disabled).toBe(false));
  });
});
