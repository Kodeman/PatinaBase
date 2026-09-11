/**
 * The nudge's three outcomes (00591 · proposal-nudge): the reminder went out,
 * the dispatch failed and can be retried, or the address is suppressed — a
 * settled fact about the recipient that no retry can move.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const invoke = vi.fn();
const invalidateQueries = vi.fn();
const supabaseClient = { from: vi.fn(), rpc, functions: { invoke } };

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => supabaseClient,
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (config: unknown) => config,
  useMutation: (config: unknown) => config,
  useQueryClient: () => ({ invalidateQueries }),
}));

import { useNudgeProposal } from '../use-proposals';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MutationConfig = any;

const nudge = () => (useNudgeProposal() as MutationConfig).mutationFn({ proposalId: 'p1' });

/** What functions.invoke hands back for a non-2xx: a FunctionsHttpError. */
const httpError = (status: number, body: unknown) => ({
  error: {
    name: 'FunctionsHttpError',
    message: 'Edge Function returned a non-2xx status code',
    context: { status, json: async () => body } as unknown as Response,
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  rpc.mockResolvedValue({ data: '2026-09-09T12:00:00.000Z', error: null });
  invoke.mockResolvedValue({ data: { ok: true }, error: null });
});

describe('useNudgeProposal', () => {
  it('stamps the nudge and reports the reminder as dispatched', async () => {
    const res = await nudge();
    expect(rpc).toHaveBeenCalledWith('nudge_proposal', { p_proposal_id: 'p1' });
    expect(res).toEqual({
      last_nudged_at: '2026-09-09T12:00:00.000Z',
      _emailDispatched: true,
      emailSuppressed: false,
    });
  });

  it('reads the 409 body and names a suppressed address as its own outcome', async () => {
    invoke.mockResolvedValue(
      httpError(409, {
        error: 'email_suppressed',
        suppressed: true,
        detail: "This client's address is suppressed after a bounce or complaint.",
      }),
    );
    const res = await nudge();
    expect(res.emailSuppressed).toBe(true);
    // The stamp still landed — the designer DID nudge.
    expect(res.last_nudged_at).toBe('2026-09-09T12:00:00.000Z');
    expect(res._emailDispatched).toBe(false);
  });

  it('keeps a plain dispatch failure retryable rather than calling it suppressed', async () => {
    invoke.mockResolvedValue(httpError(502, { error: 'send_failed', detail: 'provider down' }));
    const res = await nudge();
    expect(res).toMatchObject({ _emailDispatched: false, emailSuppressed: false });
  });

  it('does not claim suppression from a body it cannot read', async () => {
    invoke.mockResolvedValue({
      error: {
        name: 'FunctionsHttpError',
        message: 'Edge Function returned a non-2xx status code',
        context: {
          status: 500,
          json: async () => {
            throw new Error('not json');
          },
        } as unknown as Response,
      },
    });
    const res = await nudge();
    expect(res).toMatchObject({ _emailDispatched: false, emailSuppressed: false });
  });

  it('does not claim suppression when the invocation never returned', async () => {
    invoke.mockRejectedValue(new Error('network'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const res = await nudge();
    expect(res).toMatchObject({ _emailDispatched: false, emailSuppressed: false });
    warn.mockRestore();
  });

  it('lets an RPC refusal through — a cooldown is not a send outcome', async () => {
    rpc.mockResolvedValue({ data: null, error: new Error('nudge_too_soon') });
    await expect(nudge()).rejects.toThrow('nudge_too_soon');
    expect(invoke).not.toHaveBeenCalled();
  });
});
