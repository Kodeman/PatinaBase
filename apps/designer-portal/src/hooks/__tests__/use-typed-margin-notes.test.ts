import { createElement, type ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCreateMarginNote, useEscalateNoteToDecision } from '../use-margin-notes';
import { useMarginItems } from '../use-margin-items';

const mockFrom = jest.fn();
const mockRpc = jest.fn();
jest.mock('@patina/supabase', () => ({
  createBrowserClient: () => ({ from: mockFrom, rpc: mockRpc }),
}));
jest.mock('../use-auth', () => ({ useAuth: () => ({ user: { id: 'designer' } }) }));

function query(data: unknown, error: unknown = null) {
  const response = { data, error };
  const chain = {
    select: jest.fn(), eq: jest.fn(), or: jest.fn(), insert: jest.fn(), update: jest.fn(),
    single: jest.fn().mockResolvedValue(response),
    maybeSingle: jest.fn().mockResolvedValue(response),
    then: (resolve: (value: typeof response) => unknown) => Promise.resolve(response).then(resolve),
  };
  for (const method of ['select', 'eq', 'or', 'insert', 'update'] as const) {
    chain[method].mockReturnValue(chain);
  }
  return chain;
}

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  return { client, wrapper };
}

beforeEach(() => {
  mockFrom.mockReset();
  mockRpc.mockReset();
  Object.defineProperty(globalThis.crypto, 'randomUUID', {
    configurable: true, value: () => 'new-decision',
  });
});

describe('typed margin note writes', () => {
  it.each([
    ['project_room', 'room-a'], ['plan_print', 'print-a'], ['plan_issue', 'issue-a'],
    ['ffe_item', 'item-a'], ['purchase_order', 'order-a'],
    ['field_capture', 'capture-a'], ['coordination_item', 'coordination-a'],
  ] as const)('preserves the recorded %s subject without replacing its legacy anchor', async (kind, id) => {
    const notes = query({ id: 'note' });
    mockFrom.mockReturnValue(notes);
    const { wrapper, client } = setup();
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useCreateMarginNote(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({
        projectId: 'project', proposalId: null, body: 'Private note',
        anchorKind: 'line', anchorId: 'legacy-line', subject: { kind, id },
      });
    });
    expect(notes.insert).toHaveBeenCalledWith(expect.objectContaining({
      subject_kind: kind, subject_id: id, anchor_kind: 'line', anchor_id: 'legacy-line',
    }));
    for (const key of [['margin-items'], ['document-state'], ['project-ffe-items', 'project'], ['coordination-items', 'project']]) {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: key });
    }
  });

  it('writes explicit null subjects for legacy callers', async () => {
    const notes = query({ id: 'note' });
    mockFrom.mockReturnValue(notes);
    const { wrapper } = setup();
    const { result } = renderHook(() => useCreateMarginNote(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ projectId: 'project', proposalId: null, body: 'Legacy' });
    });
    expect(notes.insert).toHaveBeenCalledWith(expect.objectContaining({ subject_kind: null, subject_id: null }));
  });

  it('keeps legacy escalation working without copying the private sentinel into any decision payload field', async () => {
    const sentinel = 'PRIVATE-N02-SENTINEL-8b42-do-not-disclose';
    const notes = query(null);
    mockFrom.mockImplementation((table: string) => {
      if (table === 'projects') return query({ designer_id: 'designer', client_id: 'client' });
      if (table === 'designer_clients') return query({ id: 'relationship' });
      if (table === 'margin_notes') return notes;
      throw new Error(`Unexpected table ${table}`);
    });
    mockRpc.mockResolvedValue({ data: { id: 'new-decision' }, error: null });
    const { wrapper } = setup();
    const { result } = renderHook(() => useEscalateNoteToDecision(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync({ noteId: 'note', projectId: 'project', body: sentinel }))
        .resolves.toEqual({ id: 'new-decision' });
    });
    expect(mockRpc).toHaveBeenCalledTimes(1);
    const [name, args] = mockRpc.mock.calls[0];
    expect(name).toBe('create_client_decision');
    expect(JSON.stringify(args)).not.toContain(sentinel);
    expect(args.p_payload).toMatchObject({ title: 'Decision from a studio note', context: null, status: 'draft' });
    expect(notes.update).toHaveBeenCalledWith(expect.objectContaining({ escalated_to_decision_id: 'new-decision' }));
    expect(notes.eq).toHaveBeenCalledWith('id', 'note');
  });
});

describe('typed margin note reads', () => {
  const row = { kind: 'note', item_id: 'note', project_id: 'project', payload: { body: 'private' } };

  it('augments only the matching project note under the existing margin cache identity', async () => {
    const view = query([row, { ...row, item_id: 'mismatch' }, { ...row, item_id: 'legacy' }]);
    const notes = query([
      { id: 'note', project_id: 'project', subject_kind: 'plan_print', subject_id: 'print-a' },
      { id: 'mismatch', project_id: 'other-project', subject_kind: 'plan_issue', subject_id: 'secret-issue' },
    ]);
    mockFrom.mockImplementation((table: string) => table === 'margin_items' ? view : notes);
    const { wrapper, client } = setup();
    const { result } = renderHook(() => useMarginItems('project', null), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.[0].payload).toMatchObject({ body: 'private', subject_kind: 'plan_print', subject_id: 'print-a' });
    for (const item of result.current.data!.slice(1)) {
      expect(item.payload).toMatchObject({ subject_kind: null, subject_id: null });
    }
    expect(client.getQueryData(['margin-items', 'project'])).toEqual(result.current.data);
    expect(notes.select).toHaveBeenCalledWith('id, project_id, subject_kind, subject_id');
    expect(notes.or).toHaveBeenCalledWith('project_id.eq.project');
  });

  it('surfaces a refused metadata read rather than presenting an empty or fabricated subject', async () => {
    const refusal = new Error('metadata read refused');
    mockFrom.mockImplementation((table: string) => table === 'margin_items' ? query([row]) : query(null, refusal));
    const { wrapper } = setup();
    const { result } = renderHook(() => useMarginItems('project', null), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBe(refusal);
    expect(result.current.data).toBeUndefined();
  });
});
