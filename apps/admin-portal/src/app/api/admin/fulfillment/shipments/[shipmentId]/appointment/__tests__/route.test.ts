/**
 * @jest-environment node
 *
 * Tests for POST /api/admin/fulfillment/shipments/[shipmentId]/appointment.
 *
 * Regression (I11, Wave F integration gap): this route originally called
 * fulfillment_confirm_appointment with THREE named params
 * (p_shipment_id, p_confirmed_at, p_actor), but migration 00363 shipped the
 * RPC with only TWO (p_shipment_id, p_actor — it always stamps now()
 * server-side). The mismatch produced PGRST202 ("Could not find the
 * function ...") at runtime — a raw 500, since the route's error handling
 * only recognized Postgres's 42883 (undefined_function), not PostgREST's
 * schema-cache-miss code for the same underlying condition.
 *
 * This file locks the RPC call's argument shape so a future signature drift
 * fails a build instead of shipping a 500, and covers both the 42883 and
 * PGRST202 branches of the graceful-degradation fallback.
 *
 * Uses the `node` test env (not jsdom) so `next/server`'s NextRequest can be
 * constructed directly — mirrors client-portal's proposals/[id]/sign route
 * test.
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

describe('POST /api/admin/fulfillment/shipments/[shipmentId]/appointment', () => {
  const shipmentId = 'ship-1';
  let rpcMock: jest.Mock;

  function makeRequest(body: Record<string, unknown> = {}): NextRequest {
    return new NextRequest(
      `http://localhost:3001/api/admin/fulfillment/shipments/${shipmentId}/appointment`,
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
      mode: 'ltl',
      appointmentConfirmedAt: null,
      deliveredAt: null,
      inspectionWindowDays: 5,
    });
  });

  it('calls fulfillment_confirm_appointment with exactly {p_shipment_id, p_actor} — the 00363 signature lock', async () => {
    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith('fulfillment_confirm_appointment', {
      p_shipment_id: shipmentId,
      p_actor: 'admin@patina.cloud',
    });

    // Regression guard: p_confirmed_at must NOT be sent. 00363 never shipped
    // that parameter — an extra/renamed arg is exactly what produces
    // PostgREST's PGRST202 (or Postgres's 42883) at runtime.
    const calledArgs = rpcMock.mock.calls[0][1] as Record<string, unknown>;
    expect(calledArgs).not.toHaveProperty('p_confirmed_at');
    expect(Object.keys(calledArgs).sort()).toEqual(['p_actor', 'p_shipment_id']);
  });

  it('falls back to an honest 501 on PGRST202 (PostgREST schema-cache miss) — the gap this route shipped with', async () => {
    rpcMock.mockResolvedValue({
      error: {
        code: 'PGRST202',
        message:
          'Could not find the function public.fulfillment_confirm_appointment(p_actor, p_confirmed_at, p_shipment_id) in the schema cache',
      },
    });

    const res = await POST(makeRequest(), makeParams());
    const json = await res.json();

    expect(res.status).toBe(501);
    expect(json).toMatchObject({ code: 'not_implemented' });
  });

  it('falls back to an honest 501 on 42883 (Postgres undefined_function) — the pre-existing safety net', async () => {
    rpcMock.mockResolvedValue({
      error: {
        code: '42883',
        message: 'function public.fulfillment_confirm_appointment(uuid, text) does not exist',
      },
    });

    const res = await POST(makeRequest(), makeParams());
    const json = await res.json();

    expect(res.status).toBe(501);
    expect(json).toMatchObject({ code: 'not_implemented' });
  });

  it('returns 404 and never calls the RPC when the shipment does not exist', async () => {
    mockLoadShipmentForGate.mockResolvedValue(null);

    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(404);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('passes through the auth failure response when unauthenticated', async () => {
    const authError = NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    mockGetAuthenticatedAdmin.mockResolvedValue({ error: authError });

    const res = await POST(makeRequest(), makeParams());

    expect(res).toBe(authError);
    expect(rpcMock).not.toHaveBeenCalled();
  });
});
