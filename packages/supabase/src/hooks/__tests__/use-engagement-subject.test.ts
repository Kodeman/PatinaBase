/**
 * `useUpdateEngagementSubject` (R4) — the subject line reaches the table the
 * `document_state` leg came from, and a blank line saves NULL.
 *
 * The four routes are the whole point of the hook: `document_state` unions
 * projects, proposals, leads and designer_clients, so a write that guessed one
 * table would silently do nothing on three quarters of the papers.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockBuilder = Record<string, any>;

/** `.update(patch).eq('id', …)` — no select; the hook returns void. */
function makeBuilder(result: { error: unknown }): MockBuilder {
  const builder: MockBuilder = {};
  builder.update = vi.fn((patch: unknown) => {
    builder.__patch = patch;
    return builder;
  });
  builder.eq = vi.fn((column: string, value: unknown) => {
    builder.__eq = [column, value];
    return Promise.resolve(result);
  });
  return builder;
}

let builder: MockBuilder;
const from = vi.fn(() => builder);

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => ({ from }),
}));

const invalidateQueries = vi.fn();
vi.mock('@tanstack/react-query', () => ({
  useMutation: (config: unknown) => config,
  useQueryClient: () => ({ invalidateQueries }),
}));

import { useUpdateEngagementSubject } from '../use-engagement-subject';

beforeEach(() => {
  builder = makeBuilder({ error: null });
  from.mockClear();
  invalidateQueries.mockClear();
});

function mutationFnOf(hook: unknown) {
  return (hook as { mutationFn: (input: unknown) => Promise<unknown> })
    .mutationFn;
}

function onSuccessOf(hook: unknown) {
  return (
    hook as {
      onSuccess: (result: unknown, input: unknown) => void;
    }
  ).onSuccess;
}

describe('useUpdateEngagementSubject — one line, four tables', () => {
  it.each([
    ['project', 'projects'],
    ['proposal', 'proposals'],
    ['lead', 'leads'],
    ['relationship', 'designer_clients'],
  ] as const)('writes a %s subject to %s, by id', async (kind, table) => {
    const mutationFn = mutationFnOf(useUpdateEngagementSubject());
    await mutationFn({ kind, id: 'engagement-1', subject: 'Whole-house refresh' });

    expect(from).toHaveBeenCalledWith(table);
    expect(builder.update).toHaveBeenCalledWith({
      subject: 'Whole-house refresh',
    });
    expect(builder.__eq).toEqual(['id', 'engagement-1']);
  });

  it('trims a line the studio typed with stray spaces', async () => {
    const mutationFn = mutationFnOf(useUpdateEngagementSubject());
    await mutationFn({
      kind: 'relationship',
      id: 'dc-1',
      subject: '  Beaverdale foursquare  ',
    });

    expect(builder.update).toHaveBeenCalledWith({
      subject: 'Beaverdale foursquare',
    });
  });

  it.each([[''], ['   '], [null]])(
    'saves NULL for a blank line (%p) — an emptied line is no line',
    async (subject) => {
      const mutationFn = mutationFnOf(useUpdateEngagementSubject());
      await mutationFn({ kind: 'proposal', id: 'proposal-1', subject });

      expect(builder.update).toHaveBeenCalledWith({ subject: null });
    },
  );

  it('throws the write error rather than resolving quietly', async () => {
    builder = makeBuilder({ error: new Error('permission denied') });
    const mutationFn = mutationFnOf(useUpdateEngagementSubject());

    await expect(
      mutationFn({ kind: 'lead', id: 'lead-1', subject: 'Kitchen only' }),
    ).rejects.toThrow('permission denied');
  });

  it('invalidates the document, the desk and the kind’s own list', () => {
    onSuccessOf(useUpdateEngagementSubject())(undefined, {
      kind: 'relationship',
      id: 'dc-1',
      subject: null,
    });

    const keys = invalidateQueries.mock.calls.map(
      (call) => (call[0] as { queryKey: string[] }).queryKey,
    );
    expect(keys).toEqual([
      ['document-state'],
      ['desk-engagements'],
      ['desk'],
      ['designer-clients'],
    ]);
  });
});
