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
import { useStampProjectPricingStudio } from '../use-time-tracking';

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
