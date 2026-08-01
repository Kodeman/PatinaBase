import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExtractedProductData } from '@patina/shared';
import type { User } from '@supabase/supabase-js';

const { addRecent, from, productCapture, rpc } = vi.hoisted(() => ({
  addRecent: vi.fn(),
  from: vi.fn(),
  productCapture: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('../../lib/supabase', () => ({
  supabase: { from, rpc },
}));

vi.mock('../../lib/analytics', () => ({
  extensionEvents: {
    productCapture,
    specBookPlacementAttempted: vi.fn(),
    specBookPlacementSucceeded: vi.fn(),
    specBookPlacementFailed: vi.fn(),
    vendorCapture: vi.fn(),
  },
}));

vi.mock('../../lib/recent-captures', () => ({ addRecent }));

import { saveAsDecision } from '../../state/effects';
import { draftFromExtraction } from '../../state/draft';
import { initialCaptureState } from '../../state/reducer';

const productBuilder = {
  insert: vi.fn(),
  select: vi.fn(),
  single: vi.fn(),
};
productBuilder.insert.mockReturnValue(productBuilder);
productBuilder.select.mockReturnValue(productBuilder);

function extraction(): ExtractedProductData {
  return {
    productName: 'Walnut Chair',
    description: 'Hand-finished lounge chair',
    price: { value: 129900, currency: 'USD', raw: '$1,299' },
    dimensions: null,
    materials: ['Walnut'],
    colors: null,
    finish: null,
    availableColors: null,
    images: [
      {
        url: 'https://shop.example/chair.jpg',
        score: 90,
        width: 100,
        height: 100,
        alt: '',
      },
    ],
    manufacturer: null,
    url: 'https://shop.example/chair',
    extractedAt: '2026-08-01T00:00:00Z',
    confidence: 'high',
  } as unknown as ExtractedProductData;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('crypto', {
    randomUUID: vi.fn(() => '11111111-1111-4111-8111-111111111111'),
  });
  productBuilder.insert.mockReturnValue(productBuilder);
  productBuilder.select.mockReturnValue(productBuilder);
  productBuilder.single.mockResolvedValue({
    data: { id: 'prod-1' },
    error: null,
  });
  from.mockImplementation((table: string) => {
    if (table === 'products') return productBuilder;
    throw new Error(`Unexpected direct table write: ${table}`);
  });
  rpc.mockResolvedValue({
    data: { id: '11111111-1111-4111-8111-111111111111' },
    error: null,
  });
  addRecent.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('saveAsDecision decision authority', () => {
  it('uses one caller-owned UUID for the atomic decision + option payload', async () => {
    const draft = draftFromExtraction(extraction());
    const base = initialCaptureState().routing;
    const routing = {
      ...base,
      decision: {
        ...base.decision,
        designerClientId: 'dc-1',
        projectId: 'proj-1',
        roomId: 'room-1',
        title: 'Choose the lounge chair',
      },
    };

    await expect(
      saveAsDecision(draft, routing, { id: 'designer-1' } as User),
    ).resolves.toBe('prod-1');

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('create_client_decision', {
      p_decision_id: '11111111-1111-4111-8111-111111111111',
      p_payload: expect.objectContaining({
        designer_client_id: 'dc-1',
        project_id: 'proj-1',
        room_id: 'room-1',
        title: 'Choose the lounge chair',
        status: 'pending',
      }),
      p_options: [
        expect.objectContaining({
          name: 'Walnut Chair',
          product_id: 'prod-1',
          sort_order: 0,
        }),
      ],
      p_blocked_ffe_item_ids: [],
      p_blocked_task_ids: [],
    });
    const rpcPayload = rpc.mock.calls[0][1] as {
      p_payload: Record<string, unknown>;
      p_options: Record<string, unknown>[];
    };
    expect(rpcPayload.p_payload).not.toHaveProperty('sent_at');
    expect(rpcPayload.p_options[0]).not.toHaveProperty('decision_id');
    expect(from).not.toHaveBeenCalledWith('client_decisions');
    expect(from).not.toHaveBeenCalledWith('client_decision_options');
  });

  it('surfaces the atomic RPC error and skips success effects', async () => {
    const decisionError = {
      code: '23514',
      message: 'invalid decision references',
    };
    rpc.mockResolvedValueOnce({ data: null, error: decisionError });
    const draft = draftFromExtraction(extraction());
    const base = initialCaptureState().routing;
    const routing = {
      ...base,
      decision: { ...base.decision, designerClientId: 'dc-1' },
    };

    await expect(
      saveAsDecision(draft, routing, { id: 'designer-1' } as User),
    ).rejects.toBe(decisionError);
    expect(addRecent).not.toHaveBeenCalled();
    expect(productCapture).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalledWith('client_decisions');
    expect(from).not.toHaveBeenCalledWith('client_decision_options');
  });
});
