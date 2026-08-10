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
  rpc.mockResolvedValue({ data: { ffe_item_id: 'ffe-1' }, error: null });
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
});

describe('place_product_in_project payloads', () => {
  it('uses the canonical v2 envelope with a stable retry key', () => {
    expect(placementV2Request('product-1', { kind: 'project_inbox', projectId: 'project-1', roomId: null }, source)).toMatchObject({
      projectId: 'project-1', productId: 'product-1', assignment: { scope: 'unassigned', roomId: null }, disposition: 'candidate', duplicateMode: 'reuse_or_create',
    });
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
        source
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
        source
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
});

describe('retry and duplicate preservation', () => {
  it('falls back for both PostgreSQL and PostgREST missing-v2 contracts', async () => {
    const route: SpecBookPlacementRoute = { kind: 'project_inbox', projectId: 'project-1', roomId: null };
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202' } }).mockResolvedValueOnce({ data: { ffe_item_id: 'legacy-1' }, error: null });
    await expect(placeProductInProject('product-1', route, source)).resolves.toEqual({ outcome: 'created', selectionId: null, selectionThreadId: null, placementId: null });
    expect(rpc).toHaveBeenNthCalledWith(2, 'place_product_in_project', expect.any(Object));
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
      .mockResolvedValueOnce({ data: { ffe_item_id: 'ffe-1' }, error: null });

    const failed = placeProductInProject('product-existing', route, source);
    await expect(failed).rejects.toMatchObject({
      name: 'SpecBookPlacementError',
      productId: 'product-existing',
      route,
    });

    await placeProductInProject('product-existing', route, source);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[1]).toEqual(rpc.mock.calls[0]);
  });

  it('reuses a duplicate Product master and creates only the project selection', async () => {
    const draft = draftFromExtraction(extraction());
    const routing = {
      ...initialCaptureState().routing,
      specBookPlacementPilot: true,
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
    ).resolves.toBe('product-existing');

    expect(from).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith('place_product_in_project_v2', {
      p_request: expect.objectContaining({
        projectId: 'project-1', productId: 'product-existing',
        source: expect.objectContaining({ surface: 'chrome_extension', route_kind: 'create_line' }),
      }),
    });
  });
});
