/**
 * `useStampProjectPricingStudio` — the repair act, and the keys it must refresh.
 *
 * The Hours sheet reads the stamped pricing studio off the DOCUMENT, on its own
 * key (`['document-hours-project-studio', projectId]`), because the week's
 * entries are `.eq('user_id', me)`-filtered and cannot answer for a house the
 * viewer has logged nothing on. Left uninvalidated, a SUCCESSFUL stamp kept
 * printing "no studio yet — hours here read 'rate pending'" and kept offering
 * the door 00606 then refused as already-named: the repair visibly failed to
 * repair.
 *
 * The useQuery/useMutation identity mocks are the use-studio-member-rates rig —
 * a hook call returns its own config object, so the test reads the query key and
 * invokes `mutationFn` / `onSuccess` directly.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn(() => Promise.resolve({ data: 'studio-1', error: null }));
const supabaseClient = { rpc, from: vi.fn(), auth: { getUser: vi.fn() } };

vi.mock('../../client', () => ({ createBrowserClient: () => supabaseClient }));

const invalidateQueries = vi.fn();
vi.mock('@tanstack/react-query', () => ({
  useQuery: (config: unknown) => config,
  useMutation: (config: unknown) => config,
  useQueryClient: () => ({ invalidateQueries }),
}));

// Import AFTER mocks.
import {
  useCreateTimeEntry,
  useDeleteTimeEntry,
  useStampProjectPricingStudio,
  useUpdateTimeEntry,
} from '../use-time-tracking';

beforeEach(() => {
  vi.clearAllMocks();
  rpc.mockReturnValue(Promise.resolve({ data: 'studio-1', error: null }));
});

const invalidatedKeys = () => invalidateQueries.mock.calls.map((c) => c[0].queryKey);

describe('useStampProjectPricingStudio', () => {
  it('names the studio through the server act and returns its verdict', async () => {
    const mutation = useStampProjectPricingStudio() as unknown as {
      mutationFn: (input: unknown) => Promise<unknown>;
    };

    await expect(
      mutation.mutationFn({ projectId: 'project-1', studioId: 'studio-1' }),
    ).resolves.toBe('studio-1');
    expect(rpc).toHaveBeenCalledWith('stamp_project_pricing_studio', {
      p_project_id: 'project-1',
      p_studio_id: 'studio-1',
    });
  });

  it('surfaces the server’s refusal rather than pre-judging standing', async () => {
    rpc.mockReturnValue(
      Promise.resolve({
        data: null,
        error: new Error('this project already names a studio'),
      }) as never,
    );
    const mutation = useStampProjectPricingStudio() as unknown as {
      mutationFn: (input: unknown) => Promise<unknown>;
    };

    await expect(
      mutation.mutationFn({ projectId: 'project-1', studioId: 'studio-1' }),
    ).rejects.toThrow('this project already names a studio');
  });

  it('invalidates the key the document’s pricing studio is read on', () => {
    const mutation = useStampProjectPricingStudio() as unknown as {
      onSuccess: (data: unknown, input: unknown) => void;
    };

    mutation.onSuccess('studio-1', { projectId: 'project-1', studioId: 'studio-1' });

    const keys = invalidatedKeys();
    expect(keys).toContainEqual(['document-hours-project-studio', 'project-1']);
    expect(keys).toContainEqual(['document-hours-pending-authorization']);
    // And the reads that were already refreshed, which stay refreshed.
    expect(keys).toContainEqual(['document-hours-week']);
    expect(keys).toContainEqual(['projects']);
    expect(keys).toContainEqual(['time']);
  });
});

/**
 * W4 (HT-15) / W7-R4-07 — the hour that belongs to no document still belongs to
 * the studio's reads.
 *
 * All three mutations guarded their invalidation on `if (projectId)`, so a
 * studio hour logged through the ⌘K verb (which closes on success and refetches
 * nothing of its own) left the scope lens, the studio rollup, the CSV/statement
 * export and the Hours week showing the totals from before it. The Hours add
 * row hid the defect by refetching its own three queries by hand.
 */
describe('an internal hour invalidates the studio reads (W7-R4-07)', () => {
  const STUDIO_KEYS = [
    ['time'],
    ['desk-contents-unbilled-time'],
    ['document-hours-week'],
  ];

  it('createTimeEntry: a project-less write still refreshes them', () => {
    const mutation = useCreateTimeEntry() as unknown as {
      onSuccess: (data: unknown, input: unknown) => void;
    };
    mutation.onSuccess({}, { projectId: null, studioId: 'studio-1' });
    expect(invalidatedKeys()).toEqual(expect.arrayContaining(STUDIO_KEYS));
  });

  it('updateTimeEntry: and so does an edit to one', () => {
    const mutation = useUpdateTimeEntry() as unknown as {
      onSuccess: (data: unknown, input: unknown) => void;
    };
    mutation.onSuccess({}, { projectId: null });
    expect(invalidatedKeys()).toEqual(expect.arrayContaining(STUDIO_KEYS));
  });

  it('deleteTimeEntry: and so does taking one back', () => {
    const mutation = useDeleteTimeEntry() as unknown as {
      onSuccess: (data: unknown, input: unknown) => void;
    };
    mutation.onSuccess(undefined, { projectId: null });
    expect(invalidatedKeys()).toEqual(expect.arrayContaining(STUDIO_KEYS));
  });

  it('a PROJECT hour refreshes the studio reads as well as its own four', () => {
    const mutation = useCreateTimeEntry() as unknown as {
      onSuccess: (data: unknown, input: unknown) => void;
    };
    mutation.onSuccess({}, { projectId: 'project-1' });
    expect(invalidatedKeys()).toEqual(
      expect.arrayContaining([
        ...STUDIO_KEYS,
        ['projects', 'project-1', 'time-entries'],
        ['projects', 'project-1', 'time-tracking'],
        ['projects', 'project-1', 'unbilled-time'],
        ['projects', 'project-1', 'key-metrics'],
      ]),
    );
  });
});
