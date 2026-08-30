import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExtractedProductData } from '@patina/shared';

const { rpc, from } = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
}));

vi.mock('../../lib/supabase', () => ({
  supabase: { rpc, from },
}));

vi.mock('../../lib/analytics', () => ({
  extensionEvents: {
    specBookPlacementAttempted: vi.fn(),
    specBookPlacementSucceeded: vi.fn(),
    specBookPlacementFailed: vi.fn(),
    productCapture: vi.fn(),
  },
}));

vi.mock('../../lib/recent-captures', () => ({
  addRecent: vi.fn().mockResolvedValue(undefined),
}));

import {
  SPEC_BOOK_PLACEMENT_CONTEXT_KEY,
  loadSpecBookPlacementContext,
  placementRpcPayload,
  placementV2Request,
  placeProductInProject,
  saveSpecBookPlacementContext,
  type SpecBookPlacementRoute,
} from '../../lib/spec-book-placement';
import { reuseProductForSpecBookPlacement } from '../../state/effects';
import { draftFromExtraction } from '../../state/draft';
import { initialCaptureState } from '../../state/reducer';

const source = {
  sourceUrl: 'https://shop.example/chair',
  captureKind: 'product',
};
const SELECTION_ID = '123e4567-e89b-42d3-a456-426614174000';
const THREAD_ID = '223e4567-e89b-42d3-a456-426614174000';
const PLACEMENT_ID = '323e4567-e89b-42d3-a456-426614174000';

function extraction(): ExtractedProductData {
  return {
    productName: 'Walnut Chair',
    description: null,
    price: null,
    dimensions: null,
    materials: ['Walnut'],
    colors: null,
    finish: 'Oil',
    availableColors: null,
    images: [],
    manufacturer: null,
    url: source.sourceUrl,
    extractedAt: '2026-07-30T00:00:00Z',
    confidence: 'high',
  } as unknown as ExtractedProductData;
}

beforeEach(() => {
  vi.clearAllMocks();
  rpc.mockResolvedValue({ data: { outcome: 'created', selectionId: SELECTION_ID, threadId: THREAD_ID, placementId: PLACEMENT_ID }, error: null });
});

describe('sticky spec-book placement context', () => {
  it('round-trips project and room through chrome.storage.local', async () => {
    const storageGet = chrome.storage.local.get as unknown as ReturnType<typeof vi.fn>;
    storageGet.mockResolvedValueOnce({
      [SPEC_BOOK_PLACEMENT_CONTEXT_KEY]: {
        projectId: 'project-1',
        roomId: 'room-1',
      },
    });

    await expect(loadSpecBookPlacementContext()).resolves.toEqual({
      projectId: 'project-1',
      roomId: 'room-1',
    });

    await saveSpecBookPlacementContext({
      projectId: 'project-2',
      roomId: 'room-2',
    });
    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      [SPEC_BOOK_PLACEMENT_CONTEXT_KEY]: {
        projectId: 'project-2',
        roomId: 'room-2',
      },
    });
  });

  it('fails closed to an empty context when stored data is malformed', async () => {
    const storageGet = chrome.storage.local.get as unknown as ReturnType<typeof vi.fn>;
    storageGet.mockResolvedValueOnce({
      [SPEC_BOOK_PLACEMENT_CONTEXT_KEY]: {
        projectId: 123,
        roomId: 'room-1',
      },
    });

    await expect(loadSpecBookPlacementContext()).resolves.toEqual({
      projectId: null,
      roomId: null,
    });
  });

  it('round-trips routeKind alongside project and room (CL-R1 / D5)', async () => {
    const storageGet = chrome.storage.local.get as unknown as ReturnType<typeof vi.fn>;
    storageGet.mockResolvedValueOnce({
      [SPEC_BOOK_PLACEMENT_CONTEXT_KEY]: {
        projectId: 'project-1',
        roomId: 'room-1',
        routeKind: 'fill_slot',
      },
    });

    await expect(loadSpecBookPlacementContext()).resolves.toEqual({
      projectId: 'project-1',
      roomId: 'room-1',
      routeKind: 'fill_slot',
    });

    await saveSpecBookPlacementContext({
      projectId: 'project-2',
      roomId: 'room-2',
      routeKind: 'create_line',
    });
    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      [SPEC_BOOK_PLACEMENT_CONTEXT_KEY]: {
        projectId: 'project-2',
        roomId: 'room-2',
        routeKind: 'create_line',
      },
    });
  });

  it('still loads a context saved before routeKind existed (missing → default as today)', async () => {
    const storageGet = chrome.storage.local.get as unknown as ReturnType<typeof vi.fn>;
    storageGet.mockResolvedValueOnce({
      [SPEC_BOOK_PLACEMENT_CONTEXT_KEY]: {
        projectId: 'project-1',
        roomId: 'room-1',
      },
    });

    const loaded = await loadSpecBookPlacementContext();
    expect(loaded).toEqual({ projectId: 'project-1', roomId: 'room-1' });
    expect(loaded.routeKind).toBeUndefined();
  });

  it('fails closed to an empty context when routeKind is not a recognized route kind', async () => {
    const storageGet = chrome.storage.local.get as unknown as ReturnType<typeof vi.fn>;
    storageGet.mockResolvedValueOnce({
      [SPEC_BOOK_PLACEMENT_CONTEXT_KEY]: {
        projectId: 'project-1',
        roomId: 'room-1',
        routeKind: 'not_a_real_route',
      },
    });

    await expect(loadSpecBookPlacementContext()).resolves.toEqual({
      projectId: null,
      roomId: null,
    });
  });
});

describe('place_product_in_project payloads', () => {
  it('uses the canonical v2 envelope with a stable retry key', () => {
    const route = { kind: 'project_inbox' as const, projectId: 'project-1', roomId: null };
    expect(placementV2Request('product-1', route, source, 'reuse')).toEqual({
      projectId: 'project-1', productId: 'product-1', roomId: null,
      assignmentScope: 'unassigned', category: null, boardId: null,
      disposition: 'candidate', duplicateMode: 'reuse', placeholderSelectionId: null,
      configurationId: null, roleConfigurationIdentity: null,
      idempotencyKey: 'chrome:product-1:project-1:project_inbox:unassigned::reuse',
      source: 'chrome_extension',
    });
    expect(placementV2Request('product-1', route, source, 'create').idempotencyKey)
      .not.toBe(placementV2Request('product-1', route, source, 'reuse').idempotencyKey);
  });
  it('routes an existing slot without leaking create-line fields', () => {
    expect(
      placementRpcPayload(
        'product-1',
        {
          kind: 'fill_slot',
          projectId: 'project-1',
          roomId: 'room-1',
          slotId: 'slot-1',
        },
        { ...source, captureId: 'capture-1' },
        'reuse',
      )
    ).toEqual({
      p_project_id: 'project-1',
      p_product_id: 'product-1',
      p_room_id: 'room-1',
      p_slot_id: 'slot-1',
      p_category: null,
      p_source: {
        client: 'chrome_extension',
        surface: 'chrome_extension',
        route_kind: 'fill_slot',
        source_url: source.sourceUrl,
        capture_kind: 'product',
        captureId: 'capture-1',
        idempotencyKey: 'chrome:product-1:project-1:fill_slot:room-1:slot-1:reuse',
      },
    });
  });

  it('routes a new line with category/source and no slot id', () => {
    expect(
      placementRpcPayload(
        'product-1',
        {
          kind: 'create_line',
          projectId: 'project-1',
          roomId: 'room-1',
          category: '  lounge seating  ',
        },
        source,
        'create',
      )
    ).toMatchObject({
      p_project_id: 'project-1',
      p_product_id: 'product-1',
      p_room_id: 'room-1',
      p_slot_id: null,
      p_category: 'lounge seating',
      p_source: {
        route_kind: 'create_line',
        source_url: source.sourceUrl,
      },
    });
  });

  it('bounds category input and caps a stable retry key at 200 characters', () => {
    const route = {
      kind: 'create_line' as const, projectId: 'project-1', roomId: 'room-1', category: 'x'.repeat(200),
    };
    const first = placementV2Request('product-1', route, source, 'create').idempotencyKey;
    const second = placementV2Request('product-1', route, source, 'create').idempotencyKey;
    expect(first).toBe(second);
    expect(first.length).toBeLessThanOrEqual(200);
    expect(() => placementV2Request('product-1', { ...route, category: 'x'.repeat(201) }, source, 'create'))
      .toThrow('1–200');
  });
});

describe('retry and duplicate preservation', () => {
  it('falls back for both PostgreSQL and PostgREST missing-v2 contracts', async () => {
    const route: SpecBookPlacementRoute = { kind: 'project_inbox', projectId: 'project-1', roomId: null };
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202' } }).mockResolvedValueOnce({ data: { outcome: 'created', selectionId: SELECTION_ID, threadId: THREAD_ID, placementId: null }, error: null });
    await expect(placeProductInProject('product-1', route, source, { duplicateMode: 'reuse' })).resolves.toEqual({ outcome: 'created', selectionId: SELECTION_ID, threadId: THREAD_ID, placementId: null });
    expect(rpc).toHaveBeenNthCalledWith(2, 'place_product_in_project', expect.any(Object));
    expect(rpc.mock.calls[1][1].p_source.idempotencyKey).toBe(
      placementV2Request('product-1', route, source, 'reuse').idempotencyKey,
    );
  });
  it('retains the durable Product and selected route when placement fails', async () => {
    const route: SpecBookPlacementRoute = {
      kind: 'fill_slot',
      projectId: 'project-1',
      roomId: 'room-1',
      slotId: 'slot-1',
    };
    rpc
      .mockResolvedValueOnce({
        data: null,
        error: { message: 'slot already filled' },
      })
      .mockResolvedValueOnce({ data: { outcome: 'filled', selectionId: SELECTION_ID, threadId: THREAD_ID, placementId: null }, error: null });

    const failed = placeProductInProject('product-existing', route, source, { duplicateMode: 'reuse' });
    await expect(failed).rejects.toMatchObject({
      name: 'SpecBookPlacementError',
      productId: 'product-existing',
      route,
    });

    await placeProductInProject('product-existing', route, source, { duplicateMode: 'reuse' });
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[1]).toEqual(rpc.mock.calls[0]);
  });

  it('reuses a duplicate Product master and creates only the project selection', async () => {
    const draft = draftFromExtraction(extraction());
    const routing = {
      ...initialCaptureState().routing,
      specBookPlacementValid: true,
      specBookPlacement: {
        kind: 'create_line' as const,
        projectId: 'project-1',
        roomId: 'room-1',
        category: 'seating',
      },
    };

    await expect(
      reuseProductForSpecBookPlacement('product-existing', draft, routing)
    ).resolves.toMatchObject({ productId: 'product-existing' });

    expect(from).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith('place_product_in_project_v2', {
      p_request: expect.objectContaining({
        projectId: 'project-1', productId: 'product-existing',
        source: 'chrome_extension', duplicateMode: 'reuse',
      }),
    });
  });

  it('preserves explicit hold intent and requires its outcome ids to remain null', async () => {
    const route: SpecBookPlacementRoute = { kind: 'project_inbox', projectId: 'project-1', roomId: null };
    rpc.mockResolvedValueOnce({
      data: { outcome: 'held', selectionId: null, threadId: null, placementId: null },
      error: null,
    });

    await expect(placeProductInProject('product-1', route, source, { duplicateMode: 'hold' })).resolves.toEqual({
      outcome: 'held', selectionId: null, threadId: null, placementId: null,
    });
    expect(rpc).toHaveBeenCalledWith('place_product_in_project_v2', {
      p_request: expect.objectContaining({ duplicateMode: 'hold' }),
    });
  });

  it.each([
    { outcome: 'created', selectionId: null, threadId: THREAD_ID, placementId: null },
    { outcome: 'reused', selectionId: SELECTION_ID, threadId: 'not-a-uuid', placementId: null },
    { outcome: 'filled', selectionId: SELECTION_ID, threadId: THREAD_ID, placementId: 'not-a-uuid' },
    { outcome: 'held', selectionId: SELECTION_ID, threadId: THREAD_ID, placementId: null },
  ])('fails closed for malformed exact outcome %#', async (data) => {
    const route: SpecBookPlacementRoute = { kind: 'project_inbox', projectId: 'project-1', roomId: null };
    rpc.mockResolvedValueOnce({ data, error: null });
    await expect(placeProductInProject('product-1', route, source, { duplicateMode: 'reuse' }))
      .rejects.toThrow('invalid outcome');
  });

  it.each([undefined, 'unknown'])('fails closed for missing or unknown outcome %s', async (outcome) => {
    const route: SpecBookPlacementRoute = { kind: 'project_inbox', projectId: 'project-1', roomId: null };
    rpc.mockResolvedValueOnce({ data: { outcome, selectionId: SELECTION_ID, threadId: THREAD_ID }, error: null });
    await expect(placeProductInProject('product-1', route, source, { duplicateMode: 'reuse' }))
      .rejects.toThrow('invalid outcome');
  });
});
