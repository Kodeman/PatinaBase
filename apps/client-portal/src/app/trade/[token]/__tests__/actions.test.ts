import { revalidatePath } from 'next/cache';
import { createServiceClient } from '@patina/supabase/server';
import { signTradeAgreement } from '../actions';

jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }));
jest.mock('@patina/supabase/server', () => ({ createServiceClient: jest.fn() }));

const mockHeaders = jest.fn(() => new Headers());
jest.mock('next/headers', () => ({ headers: () => mockHeaders() }));

const validToken = 'a'.repeat(64);

function mockAdmin(result: { data: unknown; error: unknown }) {
  const rpc = jest.fn().mockResolvedValueOnce(result);
  (createServiceClient as jest.Mock).mockReturnValue({ rpc });
  return rpc;
}

describe('signTradeAgreement', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHeaders.mockReturnValue(new Headers());
  });

  it('rejects a malformed token before any RPC call', async () => {
    const result = await signTradeAgreement('not-a-token', { signedName: 'Dana Hall' });
    expect(result).toEqual({ status: 'invalid' });
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it('rejects a name below the floor the signature table itself keeps', async () => {
    const result = await signTradeAgreement(validToken, { signedName: ' D ' });
    expect(result).toEqual({ status: 'invalid' });
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it('signs by token alone, with no pre-resolve RPC call before it', async () => {
    const rpc = mockAdmin({
      data: { status: 'signed', signedName: 'Dana Hall', signedAt: '2026-09-07T15:04:00Z' },
      error: null,
    });
    mockHeaders.mockReturnValue(new Headers({ 'cf-connecting-ip': '198.51.100.7' }));
    await signTradeAgreement(validToken, { signedName: '  Dana Hall  ' });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('sign_trade_agreement_by_token', {
      p_token: validToken,
      p_signed_name: 'Dana Hall',
      p_signed_ip: '198.51.100.7',
    });
  });

  it('passes a null IP rather than a guess when no trusted header is present', async () => {
    const rpc = mockAdmin({
      data: { status: 'signed', signedName: 'Dana Hall', signedAt: null },
      error: null,
    });
    await signTradeAgreement(validToken, { signedName: 'Dana Hall' });
    expect(rpc.mock.calls[0][1].p_signed_ip).toBeNull();
  });

  it('reports saved on a fresh signature and NEVER revalidates the guest page', async () => {
    // S3: the token is revoked in the same transaction as the signature, so a
    // revalidate on the way back would re-render the route against a spent
    // token and replace the just-inked receipt with the not-found page.
    mockAdmin({
      data: { status: 'signed', signedName: 'Dana Hall', signedAt: '2026-09-07T15:04:00Z' },
      error: null,
    });
    const result = await signTradeAgreement(validToken, { signedName: 'Dana Hall' });
    expect(result).toEqual({
      status: 'saved',
      signedName: 'Dana Hall',
      signedAt: '2026-09-07T15:04:00Z',
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('reports already_signed with the ORIGINAL receipt on a replay, never an error', async () => {
    // R16/RC-1: signing the same token twice returns the original signature —
    // it does not raise, and it does not move the date.
    mockAdmin({
      data: {
        status: 'already_signed',
        signedName: 'Dana Hall',
        signedAt: '2026-09-06T11:00:00Z',
      },
      error: null,
    });
    const result = await signTradeAgreement(validToken, { signedName: 'Someone Else' });
    expect(result).toEqual({
      status: 'already_signed',
      signedName: 'Dana Hall',
      signedAt: '2026-09-06T11:00:00Z',
    });
  });

  it('classifies a withdrawn agreement from the returned outcome', async () => {
    mockAdmin({ data: { status: 'agreement_void' }, error: null });
    const result = await signTradeAgreement(validToken, { signedName: 'Dana Hall' });
    expect(result).toEqual({ status: 'agreement_void' });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('classifies a withdrawn agreement from a raised message too', async () => {
    // The RPC may classify on either channel; both must reach the same
    // sentence, so a backend that raises cannot fall through to "invalid".
    mockAdmin({ data: null, error: { message: 'agreement_void' } });
    const result = await signTradeAgreement(validToken, { signedName: 'Dana Hall' });
    expect(result).toEqual({ status: 'agreement_void' });
  });

  it('reads invalid_link as invalid — a dead link never confirms it once existed', async () => {
    mockAdmin({ data: null, error: { message: 'invalid_link' } });
    const result = await signTradeAgreement(validToken, { signedName: 'Dana Hall' });
    expect(result).toEqual({ status: 'invalid' });
  });

  it('reads an invalid_link OUTCOME as invalid as well', async () => {
    mockAdmin({ data: { status: 'invalid_link' }, error: null });
    const result = await signTradeAgreement(validToken, { signedName: 'Dana Hall' });
    expect(result).toEqual({ status: 'invalid' });
  });

  it('reads as invalid on an unrecognized RPC error, without leaking the raw message', async () => {
    mockAdmin({ data: null, error: { message: 'permission denied for table foo' } });
    const result = await signTradeAgreement(validToken, { signedName: 'Dana Hall' });
    expect(result).toEqual({ status: 'invalid' });
  });

  it('reads as invalid when the RPC resolves with no row at all', async () => {
    mockAdmin({ data: null, error: null });
    const result = await signTradeAgreement(validToken, { signedName: 'Dana Hall' });
    expect(result).toEqual({ status: 'invalid' });
  });

  it('accepts a single-row array answer and falls back to the typed name when the row omits it', async () => {
    mockAdmin({ data: [{ status: 'signed' }], error: null });
    const result = await signTradeAgreement(validToken, { signedName: 'Dana Hall' });
    expect(result).toEqual({ status: 'saved', signedName: 'Dana Hall', signedAt: null });
  });

  // S5. The build sheet freezes resolve's DTO but no success shape for this
  // RPC — only the three failure classifications. So the answer is read
  // failure-first: an unrecognised receipt is a committed signature, never
  // "This link is no longer active." shown over real ink.
  it('reads a snake_case receipt as the signature it is', async () => {
    mockAdmin({
      data: { status: 'signed', signed_name: 'Dana Hall', signed_at: '2026-09-07T15:04:00Z' },
      error: null,
    });
    const result = await signTradeAgreement(validToken, { signedName: 'Dana Hall' });
    expect(result).toEqual({
      status: 'saved',
      signedName: 'Dana Hall',
      signedAt: '2026-09-07T15:04:00Z',
    });
  });

  it('reads an ok-shaped answer carrying no classification as a committed signature', async () => {
    mockAdmin({ data: { ok: true, signed_at: '2026-09-07T15:04:00Z' }, error: null });
    const result = await signTradeAgreement(validToken, { signedName: 'Dana Hall' });
    expect(result).toEqual({
      status: 'saved',
      signedName: 'Dana Hall',
      signedAt: '2026-09-07T15:04:00Z',
    });
  });

  it('reads an outcome-keyed answer, not just a status-keyed one', async () => {
    mockAdmin({ data: { outcome: 'already_signed', signedName: 'Dana Hall', signedAt: null }, error: null });
    const result = await signTradeAgreement(validToken, { signedName: 'Someone Else' });
    expect(result).toEqual({ status: 'already_signed', signedName: 'Dana Hall', signedAt: null });
  });

  it('still reads every recognised failure word as its own sentence', async () => {
    for (const word of ['invalid_link', 'not_found', 'expired', 'revoked']) {
      mockAdmin({ data: { status: word }, error: null });
      // eslint-disable-next-line no-await-in-loop
      const result = await signTradeAgreement(validToken, { signedName: 'Dana Hall' });
      expect(result).toEqual({ status: 'invalid' });
    }
    for (const word of ['agreement_void', 'void', 'voided']) {
      mockAdmin({ data: { status: word }, error: null });
      // eslint-disable-next-line no-await-in-loop
      const result = await signTradeAgreement(validToken, { signedName: 'Dana Hall' });
      expect(result).toEqual({ status: 'agreement_void' });
    }
  });
});
