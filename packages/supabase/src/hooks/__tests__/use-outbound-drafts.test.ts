import { beforeEach, describe, expect, it, vi } from 'vitest';

const { from, rpc, invoke, invalidateQueries } = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), invoke: vi.fn(), invalidateQueries: vi.fn() }));
vi.mock('../../client', () => ({ createBrowserClient: () => ({ from, rpc, functions: { invoke } }) }));
vi.mock('@tanstack/react-query', () => ({
  useQuery: (config: unknown) => config,
  useMutation: (config: unknown) => config,
  useQueryClient: () => ({ invalidateQueries }),
}));
import { docKeys } from '../../query-keys';
import { outboundDraftKeys, useOutboundDrafts, useDiscardOutboundDraft, useSendOutboundDrafts } from '../use-outbound-drafts';

beforeEach(() => { from.mockReset(); rpc.mockReset(); invoke.mockReset(); invalidateQueries.mockReset(); });

describe('outbound draft hooks', () => {
  it('scopes the list query by project and uses its stable query key', async () => {
    const chain: any = { select: vi.fn(() => chain), eq: vi.fn(() => chain), order: vi.fn(async () => ({ data: [{ id: 'd1' }], error: null })) };
    from.mockReturnValue(chain);
    const query: any = useOutboundDrafts({ projectId: 'p1' });
    expect(query.queryKey).toEqual(outboundDraftKeys.list('p1'));
    await expect(query.queryFn()).resolves.toEqual([{ id: 'd1' }]);
    expect(chain.eq).toHaveBeenCalledWith('project_id', 'p1');
  });

  it('sends selected IDs as one batch and invalidates drafts when settled', async () => {
    invoke.mockResolvedValue({ data: { results: [{ id: 'd1', ok: true }] }, error: null });
    const mutation: any = useSendOutboundDrafts();
    await expect(mutation.mutationFn(['d1'])).resolves.toEqual({ results: [{ id: 'd1', ok: true }] });
    expect(invoke).toHaveBeenCalledWith('outbound-draft-send', { body: { draftIds: ['d1'] } });
    mutation.onSettled();
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: outboundDraftKeys.all });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: docKeys.desk() });
  });

  it('discards via the guarded RPC and invalidates cached drafts and the Desk', async () => {
    rpc.mockResolvedValue({ data: { id: 'd1', status: 'discarded' }, error: null });
    const mutation: any = useDiscardOutboundDraft();
    await mutation.mutationFn('d1');
    expect(rpc).toHaveBeenCalledWith('discard_outbound_draft', { p_id: 'd1' });
    mutation.onSuccess();
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: outboundDraftKeys.all });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: docKeys.desk() });
  });
});
