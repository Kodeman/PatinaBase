import { revalidatePath } from 'next/cache';
import { createServiceClient } from '@patina/supabase/server';
import { submitRfqResponse } from '../actions';

jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }));
jest.mock('@patina/supabase/server', () => ({ createServiceClient: jest.fn() }));

const validToken = 'a'.repeat(64);

function mockAdmin(submitResult: { data: unknown; error: unknown }) {
  const rpc = jest.fn().mockResolvedValueOnce(submitResult);
  (createServiceClient as jest.Mock).mockReturnValue({ rpc });
  return rpc;
}

describe('submitRfqResponse', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects a malformed token before any RPC call', async () => {
    const result = await submitRfqResponse('not-a-token', { amountCents: 100 });
    expect(result).toEqual({ status: 'invalid' });
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it('rejects a negative amount before any RPC call', async () => {
    const result = await submitRfqResponse(validToken, { amountCents: -1 });
    expect(result).toEqual({ status: 'invalid' });
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it('writes by token alone, with no pre-resolve RPC call before it', async () => {
    const rpc = mockAdmin({
      data: {
        ok: true,
        amountCents: 415_000,
        respondedAt: '2026-07-09T00:00:00Z',
        replayed: false,
      },
      error: null,
    });
    await submitRfqResponse(validToken, { amountCents: 415_000, note: 'Includes delivery' });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('submit_trade_rfq_response', {
      p_token: validToken,
      p_amount_cents: 415_000,
      p_note: 'Includes delivery',
    });
  });

  it('reports saved on a fresh response and revalidates the guest page', async () => {
    mockAdmin({
      data: {
        ok: true,
        amountCents: 415_000,
        respondedAt: '2026-07-09T00:00:00Z',
        replayed: false,
      },
      error: null,
    });
    const result = await submitRfqResponse(validToken, { amountCents: 415_000 });
    expect(result).toEqual({
      status: 'saved',
      amountCents: 415_000,
      respondedAt: '2026-07-09T00:00:00Z',
    });
    expect(revalidatePath).toHaveBeenCalledWith(`/rfq/${validToken}`);
  });

  it('reports replayed on an identical resubmit', async () => {
    mockAdmin({
      data: {
        ok: true,
        amountCents: 415_000,
        respondedAt: '2026-07-09T00:00:00Z',
        replayed: true,
      },
      error: null,
    });
    const result = await submitRfqResponse(validToken, { amountCents: 415_000 });
    expect(result.status).toBe('replayed');
  });

  it('reports bid_locked once this party’s own bid has already been selected', async () => {
    mockAdmin({ data: null, error: { message: 'bid_locked' } });
    const result = await submitRfqResponse(validToken, { amountCents: 415_000 });
    expect(result).toEqual({ status: 'bid_locked' });
  });

  it('classifies bid_window_closed from submit alone — no pre-resolve short-circuit masks it as invalid', async () => {
    // A pre-resolve call would have seen this ask's already-revoked token
    // (the post-signature delta revokes on close) and answered NULL — the
    // same answer a token that never existed gives — hiding the true "the
    // work was awarded" outcome behind a generic 'invalid'. Only ONE rpc
    // call is made here: submit_trade_rfq_response is the sole classifier.
    const rpc = mockAdmin({ data: null, error: { message: 'bid_window_closed' } });
    const result = await submitRfqResponse(validToken, { amountCents: 415_000 });
    expect(result).toEqual({ status: 'bid_window_closed' });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('submit_trade_rfq_response', {
      p_token: validToken,
      p_amount_cents: 415_000,
      p_note: null,
    });
  });

  it('reads as invalid when submit itself reports the token no longer resolves', async () => {
    mockAdmin({ data: null, error: { message: 'invalid_rfq_link' } });
    const result = await submitRfqResponse(validToken, { amountCents: 415_000 });
    expect(result).toEqual({ status: 'invalid' });
  });

  it('reads as invalid on an unrecognized RPC error, without leaking the raw message', async () => {
    mockAdmin({ data: null, error: { message: 'some internal detail' } });
    const result = await submitRfqResponse(validToken, { amountCents: 415_000 });
    expect(result).toEqual({ status: 'invalid' });
  });

  it('reads as invalid when the RPC resolves with no row at all', async () => {
    mockAdmin({ data: null, error: null });
    const result = await submitRfqResponse(validToken, { amountCents: 415_000 });
    expect(result).toEqual({ status: 'invalid' });
  });
});
