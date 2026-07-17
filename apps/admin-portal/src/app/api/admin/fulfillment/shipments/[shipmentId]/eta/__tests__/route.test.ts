/**
 * @jest-environment node
 *
 * Tests for POST /api/admin/fulfillment/shipments/[shipmentId]/eta (R4.5).
 *
 * fulfillment_update_shipment_eta (00363) shipped with a FOUR-arg signature —
 * (p_shipment_id, p_current_eta, p_reason, p_actor) — and sat API-only until
 * this route (I11: no operator caller existed, so current_eta could never
 * move in production). The appointment route's __tests__/route.test.ts
 * documents exactly how a guessed-at signature drifts from what a migration
 * actually ships (PGRST202 with no operator-visible reason); this file locks
 * the eta RPC's argument shape the same way so a future signature change
 * fails a build instead of shipping a silent no-op.
 *
 * Uses the `node` test env (not jsdom) so `next/server`'s NextRequest can be
 * constructed directly — mirrors the appointment route's test.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAdmin } from '@/lib/supabase-admin';
import { loadShipmentForGate } from '@/lib/fulfillment-shipments';

import { POST } from '../route';

jest.mock('@/lib/supabase-admin', () => {
  const actual = jest.requireActual('@/lib/supabase-admin');
  return {
    ...actual,
    getAuthenticatedAdmin: jest.fn(),
  };
});

jest.mock('@/lib/fulfillment-shipments', () => ({
  loadShipmentForGate: jest.fn(),
}));

const mockGetAuthenticatedAdmin = getAuthenticatedAdmin as jest.Mock;
const mockLoadShipmentForGate = loadShipmentForGate as jest.Mock;

describe('POST /api/admin/fulfillment/shipments/[shipmentId]/eta', () => {
  const shipmentId = 'ship-1';
  let rpcMock: jest.Mock;

  function makeRequest(body: Record<string, unknown> = {}): NextRequest {
    return new NextRequest(
      `http://localhost:3001/api/admin/fulfillment/shipments/${shipmentId}/eta`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      } as unknown as RequestInit,
    );
  }

  function makeParams() {
    return { params: Promise.resolve({ shipmentId }) };
  }

  beforeEach(() => {
    rpcMock = jest.fn().mockResolvedValue({ error: null });
    mockGetAuthenticatedAdmin.mockResolvedValue({
      user: { id: 'admin-1', email: 'admin@patina.cloud' },
      adminClient: { rpc: rpcMock },
    });
    mockLoadShipmentForGate.mockResolvedValue({
      id: shipmentId,
      poId: 'po-1',
      mode: 'parcel',
      appointmentConfirmedAt: null,
      deliveredAt: null,
      inspectionWindowDays: null,
    });
  });

  it('calls fulfillment_update_shipment_eta with exactly the 00363 4-arg signature', async () => {
    const res = await POST(
      makeRequest({ currentEta: '2026-09-10', reason: 'carrier delay' }),
      makeParams(),
    );

    expect(res.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith('fulfillment_update_shipment_eta', {
      p_shipment_id: shipmentId,
      p_current_eta: '2026-09-10',
      p_reason: 'carrier delay',
      p_actor: 'admin@patina.cloud',
    });

    const calledArgs = rpcMock.mock.calls[0][1] as Record<string, unknown>;
    expect(Object.keys(calledArgs).sort()).toEqual([
      'p_actor',
      'p_current_eta',
      'p_reason',
      'p_shipment_id',
    ]);
  });

  it('returns the recorded currentEta on success', async () => {
    const res = await POST(
      makeRequest({ currentEta: '2026-09-10', reason: 'carrier delay' }),
      makeParams(),
    );
    const json = await res.json();
    expect(json).toMatchObject({ data: { ok: true, currentEta: '2026-09-10' } });
  });

  it('400s when reason is missing', async () => {
    const res = await POST(makeRequest({ currentEta: '2026-09-10' }), makeParams());
    expect(res.status).toBe(400);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('400s when reason is only whitespace', async () => {
    const res = await POST(
      makeRequest({ currentEta: '2026-09-10', reason: '   ' }),
      makeParams(),
    );
    expect(res.status).toBe(400);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('400s when currentEta is missing or malformed', async () => {
    const res1 = await POST(makeRequest({ reason: 'carrier delay' }), makeParams());
    expect(res1.status).toBe(400);

    const res2 = await POST(
      makeRequest({ currentEta: 'not-a-date', reason: 'carrier delay' }),
      makeParams(),
    );
    expect(res2.status).toBe(400);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('returns 404 and never calls the RPC when the shipment does not exist', async () => {
    mockLoadShipmentForGate.mockResolvedValue(null);

    const res = await POST(
      makeRequest({ currentEta: '2026-09-10', reason: 'carrier delay' }),
      makeParams(),
    );

    expect(res.status).toBe(404);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('passes through the auth failure response when unauthenticated', async () => {
    const authError = NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    mockGetAuthenticatedAdmin.mockResolvedValue({ error: authError });

    const res = await POST(
      makeRequest({ currentEta: '2026-09-10', reason: 'carrier delay' }),
      makeParams(),
    );

    expect(res).toBe(authError);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('surfaces a 500 if the RPC errors for an unexpected reason', async () => {
    rpcMock.mockResolvedValue({ error: { message: 'connection reset' } });

    const res = await POST(
      makeRequest({ currentEta: '2026-09-10', reason: 'carrier delay' }),
      makeParams(),
    );

    expect(res.status).toBe(500);
  });
});
