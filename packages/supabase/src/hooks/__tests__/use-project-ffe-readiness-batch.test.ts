import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpc, abortSignal, invalidateQueries } = vi.hoisted(() => ({
  rpc: vi.fn(), abortSignal: vi.fn(), invalidateQueries: vi.fn(),
}));
vi.mock('../../client', () => ({ createBrowserClient: () => ({ rpc }) }));
vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: unknown) => options,
  useMutation: (options: unknown) => options,
  useMutationState: () => [],
  useQueryClient: () => ({ invalidateQueries }),
}));

import { useProjectFfeReadiness, useTriageProjectFfeItems } from '../use-project-ffe-ga';

type Options = {
  queryKey: unknown[];
  enabled: boolean;
  staleTime: number;
  queryFn: (context?: { signal?: AbortSignal }) => Promise<unknown>;
};
const options = (ids: string[]) => useProjectFfeReadiness(ids) as unknown as Options;
const ready = (selectionId: string) => ({ selectionId, ready: false, missingFields: ['vendor'] });
const batch = (ids: string[]) => ids.map((selectionId) => ({
  selectionId, readiness: ready(selectionId), error: null,
}));
const idsFor = (count: number) => Array.from({ length: count }, (_, i) => `selection-${String(i).padStart(4, '0')}`);

beforeEach(() => {
  rpc.mockReset();
  abortSignal.mockReset();
  invalidateQueries.mockReset();
});

function respond(handler: (name: string, args: Record<string, any>) => unknown) {
  rpc.mockImplementation((name, args) => {
    const response = Promise.resolve().then(() => handler(name, args));
    return Object.assign(response, { abortSignal: (signal: AbortSignal) => {
      abortSignal(signal);
      return response;
    } });
  });
}

const unavailable = { code: '42501', message: 'permission denied for function get_project_ffe_readiness_batch' };

describe('readiness batch transport', () => {
  it('retains canonical sorted unique identity, disabled empty state and stale time', () => {
    expect(options(['b', 'a', '', 'b'])).toMatchObject({
      queryKey: ['project-ffe-readiness', ['a', 'b']], enabled: true, staleTime: 15_000,
    });
    expect(options([])).toMatchObject({ enabled: false, queryKey: ['project-ffe-readiness', []] });
  });

  it('uses the ordered batch and passes through authoritative external payload fields', async () => {
    const external = {
      selectionId: 'a', ready: true, missingFields: [],
      responsibility: { kind: 'external', party: 'GC' }, orderChecklist: null,
    };
    respond((name, args) => ({ data: name.endsWith('_batch') ? [
      { selectionId: 'a', readiness: external, error: null },
      { selectionId: 'b', readiness: ready('b'), error: null },
    ] : args.p_ffe_item_id === 'a' ? external : ready(args.p_ffe_item_id), error: null }));
    await expect(options(['b', 'a', 'a']).queryFn()).resolves.toEqual([external, ready('b')]);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('get_project_ffe_readiness_batch', { p_ffe_item_ids: ['a', 'b'] });
  });

  it.each([100, 101, 500, 2000])('bounds %i IDs to at most 100 per call with exact mock request counts', async (count) => {
    respond((name, args) => ({ data: name.endsWith('_batch') ? batch(args.p_ffe_item_ids) : ready(args.p_ffe_item_id), error: null }));
    const ids = idsFor(count);
    await expect(options(ids).queryFn()).resolves.toEqual(ids.map(ready));
    expect(rpc).toHaveBeenCalledTimes(Math.ceil(count / 100));
    expect(rpc.mock.calls.every(([name, args]) => name === 'get_project_ffe_readiness_batch' && args.p_ffe_item_ids.length <= 100)).toBe(true);
  });

  it.each(['42501', 'PGRST202', '42883'])('falls back on unavailable batch code %s using the singleton signature', async (code) => {
    respond((name, args) => name.endsWith('_batch')
      ? { data: null, error: { ...unavailable, code } }
      : { data: ready(args.p_ffe_item_id), error: null });
    await expect(options(['a', 'b']).queryFn()).resolves.toEqual([ready('a'), ready('b')]);
    expect(rpc).toHaveBeenCalledWith('get_project_ffe_readiness', { p_ffe_item_id: 'a' });
    expect(rpc).toHaveBeenCalledTimes(3);
  });

  it.each([500, 2000])('keeps singleton fallback concurrency at eight for %i IDs', async (count) => {
    let active = 0;
    let peak = 0;
    rpc.mockImplementation(async (name, args) => {
      if (name.endsWith('_batch')) return { data: null, error: unavailable };
      active += 1;
      peak = Math.max(peak, active);
      await Promise.resolve();
      active -= 1;
      return { data: ready(args.p_ffe_item_id), error: null };
    });
    const ids = idsFor(count);
    await expect(options(ids).queryFn()).resolves.toEqual(ids.map(ready));
    expect(peak).toBe(8);
    expect(rpc).toHaveBeenCalledTimes(count + 1);
  });

  it('does not cache unavailability across queries or identities', async () => {
    respond((name, args) => name.endsWith('_batch')
      ? { data: null, error: unavailable }
      : { data: ready(args.p_ffe_item_id), error: null });
    await options(['a']).queryFn();
    respond((name, args) => ({ data: name.endsWith('_batch') ? batch(args.p_ffe_item_ids) : ready(args.p_ffe_item_id), error: null }));
    await expect(options(['b']).queryFn()).resolves.toEqual([ready('b')]);
    expect(rpc.mock.calls.filter(([name]) => name.endsWith('_batch'))).toHaveLength(2);
  });

  it.each(['P0002', '42501', '22P02'])('rejects per-entry refusal %s instead of falling back or fabricating readiness', async (code) => {
    const error = { code, message: 'selection refused' };
    respond((name, args) => ({ data: name.endsWith('_batch')
      ? [{ selectionId: 'a', readiness: null, error }]
      : ready(args.p_ffe_item_id), error: null }));
    await expect(options(['a']).queryFn()).rejects.toEqual(error);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it.each(['XX000', '57014', 'PGRST301'])('propagates unexpected top-level error %s without fallback', async (code) => {
    const error = { code, message: 'unexpected failure' };
    respond(() => ({ data: null, error }));
    await expect(options(['a']).queryFn()).rejects.toEqual(error);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it.each([
    null, {}, [],
    [{ selectionId: 'wrong', readiness: ready('a'), error: null }],
    [{ selectionId: 'a', readiness: null, error: null }],
    [{ selectionId: 'a', readiness: { selectionId: 'a' }, error: null }],
    [{ selectionId: 'a', readiness: ready('a') }],
    [...batch(['a']), ...batch(['a'])],
  ])('rejects malformed or incomplete batch response %#', async (data) => {
    respond((name, args) => ({ data: name.endsWith('_batch') ? data : ready(args.p_ffe_item_id), error: null }));
    await expect(options(['a']).queryFn()).rejects.toThrow();
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('falls back only for the remaining IDs if a later batch becomes unavailable', async () => {
    const ids = idsFor(201);
    respond((name, args) => name.endsWith('_batch')
      ? args.p_ffe_item_ids[0] === ids[0]
        ? { data: batch(args.p_ffe_item_ids), error: null }
        : { data: null, error: unavailable }
      : { data: ready(args.p_ffe_item_id), error: null });
    await expect(options(ids).queryFn()).resolves.toEqual(ids.map(ready));
    expect(rpc.mock.calls.filter(([name]) => name.endsWith('_batch'))).toHaveLength(2);
    const singletonIds = rpc.mock.calls.filter(([name]) => !name.endsWith('_batch')).map(([, args]) => args.p_ffe_item_id);
    expect(singletonIds).toEqual(ids.slice(100));
  });

  it('rejects the whole query on a later per-entry error without returning partial readiness', async () => {
    const ids = idsFor(201);
    const error = { code: '42501', message: 'selection refused' };
    respond((name, args) => ({ data: !name.endsWith('_batch') ? ready(args.p_ffe_item_id)
      : args.p_ffe_item_ids[0] === ids[0]
        ? batch(args.p_ffe_item_ids)
        : args.p_ffe_item_ids.map((selectionId: string) => ({ selectionId, readiness: null, error })), error: null }));
    await expect(options(ids).queryFn()).rejects.toEqual(error);
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('propagates singleton refusal after unavailable batch', async () => {
    const error = { code: 'P0002', message: 'selection missing' };
    respond((name) => ({ data: null, error: name.endsWith('_batch') ? unavailable : error }));
    await expect(options(['a']).queryFn()).rejects.toEqual(error);
  });

  it('preserves authoritative extension fields on the singleton fallback too', async () => {
    const external = { ...ready('a'), externalResponsibility: 'GC', checklist: null };
    respond((name) => name.endsWith('_batch') ? { data: null, error: unavailable } : { data: external, error: null });
    await expect(options(['a']).queryFn()).resolves.toEqual([external]);
  });

  it('forwards cancellation to batches and starts no later chunk after abort', async () => {
    const controller = new AbortController();
    respond((name, args) => {
      controller.abort();
      return { data: name.endsWith('_batch') ? batch(args.p_ffe_item_ids) : ready(args.p_ffe_item_id), error: null };
    });
    await expect(options(idsFor(101)).queryFn({ signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(abortSignal).toHaveBeenCalledWith(controller.signal);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('starts no transport for an already canceled query', async () => {
    respond((_name, args) => ({ data: ready(args.p_ffe_item_id), error: null }));
    const controller = new AbortController();
    controller.abort();
    await expect(options(['a']).queryFn({ signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('forwards cancellation to singleton fallback without launching queued work', async () => {
    const controller = new AbortController();
    respond((name, args) => {
      if (name.endsWith('_batch')) return { data: null, error: unavailable };
      controller.abort();
      return { data: ready(args.p_ffe_item_id), error: null };
    });
    await expect(options(idsFor(100)).queryFn({ signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(rpc.mock.calls.filter(([name]) => !name.endsWith('_batch'))).toHaveLength(8);
    expect(abortSignal).toHaveBeenCalledTimes(9);
  });

  it('keeps mutation invalidation on the canonical readiness prefix', () => {
    const mutation = useTriageProjectFfeItems() as unknown as { onSuccess: (result: unknown, request: { projectId: string }) => void };
    mutation.onSuccess({}, { projectId: 'project-a' });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['project-ffe-readiness'] });
  });
});
