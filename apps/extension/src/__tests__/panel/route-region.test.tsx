/**
 * RouteCommitRegion — sticky route kind + capture note (CL-R1 / D5).
 *
 * Mounts the real RouteCommitRegion (and the real FFESlotPicker it renders,
 * per the field-visibility.test.tsx seam) under CaptureProvider. chrome.* is
 * mocked globally in src/__tests__/setup.ts; this file overrides
 * chrome.storage.local.get per test to seed the sticky spec-book-placement
 * context. supabase is mocked locally since FFESlotPicker queries
 * project_rooms/project_ffe_items directly when a project/room is already
 * selected on mount.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExtractedProductData, Project } from '@patina/shared';

/** project_rooms resolves a room matching PROJECT_ONE.id/'room-1' so tests that
 * seed a project+room don't get self-healed away by the rooms-fetch effect's
 * own "not in the fetched list → clear it" logic (FFESlotPicker.tsx). Every
 * other table (project_ffe_items, etc.) resolves empty. */
function chainable(rows: unknown[] = []) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.is = vi.fn(() => chain);
  chain.order = vi.fn(() => Promise.resolve({ data: rows }));
  return chain;
}

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn((table: string) =>
      table === 'project_rooms' ? chainable([{ id: 'room-1', name: 'Living Room' }]) : chainable([])
    ),
  },
}));

vi.mock('../../hooks/use-reference-data', () => ({
  useReferenceData: () => ({ projects: [], styles: [] }),
}));

import { RouteCommitRegion } from '../../panel/regions/RouteCommitRegion';
import { FFESlotPicker } from '../../components/FFESlotPicker';
import { CaptureProvider, useCapture } from '../../state/CaptureProvider';
import { draftFromExtraction } from '../../state/draft';
import { initialCaptureState } from '../../state/reducer';
import { SPEC_BOOK_PLACEMENT_CONTEXT_KEY } from '../../lib/spec-book-placement';

const PROJECT_ONE: Project = {
  id: 'project-1',
  name: 'The Overlook',
  clientProfileId: null,
  status: 'active',
  notes: null,
  createdAt: '2026-08-10T00:00:00Z',
  updatedAt: '2026-08-10T00:00:00Z',
};

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

/** Renders the current draft.note so a dispatched NOTE_SET is observable
 * through shared CaptureProvider state, not just the textarea's own DOM value. */
function NoteProbe() {
  const { draft } = useCapture();
  return <span data-testid="note-probe">{draft?.note ?? ''}</span>;
}

afterEach(cleanup);

function seedStorage(context: Record<string, unknown>) {
  const storageGet = chrome.storage.local.get as unknown as ReturnType<typeof vi.fn>;
  storageGet.mockResolvedValueOnce({
    [SPEC_BOOK_PLACEMENT_CONTEXT_KEY]: context,
  });
}

describe('RouteCommitRegion — sticky route kind (CL-R1 / D5)', () => {
  it('mounts with the saved routeKind selected as its plain-copy destination', async () => {
    seedStorage({ projectId: 'project-1', roomId: 'room-1', routeKind: 'fill_slot' });

    render(
      <CaptureProvider initial={capturedState()}>
        <RouteCommitRegion />
      </CaptureProvider>
    );

    const destination = (await screen.findByRole('combobox', {
      name: 'Capture destination',
    })) as HTMLSelectElement;

    expect(destination.value).toBe('fill_slot');
    expect(destination.selectedOptions[0].textContent).toBe('An open spot in a room');
  });

  it('persists routeKind to chrome.storage.local when the destination changes', async () => {
    seedStorage({ projectId: null, roomId: null, routeKind: 'library' });

    render(
      <CaptureProvider initial={capturedState()}>
        <RouteCommitRegion />
      </CaptureProvider>
    );

    const destination = (await screen.findByRole('combobox', {
      name: 'Capture destination',
    })) as HTMLSelectElement;
    expect(destination.value).toBe('library');

    fireEvent.change(destination, { target: { value: 'project_inbox' } });

    await waitFor(() =>
      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        [SPEC_BOOK_PLACEMENT_CONTEXT_KEY]: {
          projectId: null,
          roomId: null,
          routeKind: 'project_inbox',
        },
      })
    );
  });
});

describe('FFESlotPicker — assigningExisting wins over a remembered library routeKind', () => {
  it('mounts in fill_slot for an explicit placement even when the sticky context remembered library', async () => {
    render(
      <FFESlotPicker
        projects={[PROJECT_ONE]}
        productId="product-1"
        productName="Chair"
        initialContext={{ projectId: 'project-1', roomId: 'room-1', routeKind: 'library' }}
      />
    );

    // assigningExisting (productId set) hides the "Capture destination"
    // select entirely — fill_slot is only observable via the project/room/
    // slot selects it unlocks (routeKind !== 'library').
    expect(screen.getByText('Place Chair')).toBeTruthy();
    expect(screen.queryByRole('combobox', { name: 'Capture destination' })).toBeNull();
    expect(await screen.findByRole('combobox', { name: 'Project' })).toBeTruthy();
    expect(await screen.findByRole('combobox', { name: 'Open spot' })).toBeTruthy();
  });
});

describe('RouteCommitRegion — capture note (CL-R1 / c)', () => {
  it('dispatches NOTE_SET as the designer types, landing in shared draft state', async () => {
    seedStorage({ projectId: null, roomId: null });

    render(
      <CaptureProvider initial={capturedState()}>
        <RouteCommitRegion />
        <NoteProbe />
      </CaptureProvider>
    );

    await screen.findByRole('combobox', { name: 'Capture destination' });

    const note = screen.getByRole('textbox', { name: 'Capture note' }) as HTMLTextAreaElement;
    expect(note.value).toBe('');
    expect(screen.getByTestId('note-probe').textContent).toBe('');

    fireEvent.change(note, {
      target: { value: "Client loved the walnut — check the finish sample first" },
    });

    await waitFor(() =>
      expect(screen.getByTestId('note-probe').textContent).toBe(
        "Client loved the walnut — check the finish sample first"
      )
    );
    expect(note.value).toBe("Client loved the walnut — check the finish sample first");
  });
});
