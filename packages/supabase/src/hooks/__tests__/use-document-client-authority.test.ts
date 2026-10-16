/**
 * K5 "Link a client" standing (00796, repaired per SQ-1066).
 *
 * One read, document_client_link_hold, backs both hooks on one key. Every act
 * that changes the lead or the project's studio must invalidate that key, or a
 * cached answer outlives the server's (SQ-1066 F2): the portal's default
 * staleTime is five minutes and window-focus refetch is off.
 *
 * The useQuery/useMutation identity mocks are the use-time-tracking rig: a hook
 * call returns its own config object.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
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
  useCanLinkDocumentClient,
  useDocumentClientLinkHold,
} from '../use-document-client-authority';
import { useReassignLead } from '../use-project-team';
import { useStampProjectPricingStudio } from '../use-time-tracking';

const LINK_KEY = ['document-client-authority', 'can-link', 'project-1'];

type QueryConfig = {
  queryKey: unknown;
  queryFn: () => Promise<unknown>;
  select: (hold: unknown) => unknown;
  enabled: boolean;
};

type MutationConfig = {
  mutationFn: (input: unknown) => Promise<unknown>;
  onSuccess: (data: unknown, input: unknown) => void;
};

const invalidatedKeys = () => invalidateQueries.mock.calls.map((c) => c[0].queryKey);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useCanLinkDocumentClient', () => {
  it('asks document_client_link_hold and answers yes only when there is no hold', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    const query = useCanLinkDocumentClient('project-1') as unknown as QueryConfig;

    expect(query.queryKey).toEqual(LINK_KEY);
    await expect(query.queryFn()).resolves.toBeNull();
    expect(rpc).toHaveBeenCalledWith('document_client_link_hold', { p_project_id: 'project-1' });
    expect(query.select(null)).toBe(true);
    expect(query.select('lead_not_in_studio')).toBe(false);
    expect(query.select('not_permitted')).toBe(false);
  });
});

describe('useDocumentClientLinkHold', () => {
  it('shares the key and names the hold', async () => {
    rpc.mockResolvedValue({ data: 'lead_not_in_studio', error: null });
    const query = useDocumentClientLinkHold('project-1') as unknown as QueryConfig;

    expect(query.queryKey).toEqual(LINK_KEY);
    await expect(query.queryFn()).resolves.toBe('lead_not_in_studio');
    expect(query.select('lead_not_in_studio')).toBe('lead_not_in_studio');
    expect(query.select(null)).toBeNull();
    expect((useDocumentClientLinkHold(null) as unknown as QueryConfig).enabled).toBe(false);
  });
});

describe('acts that change K5 standing invalidate it', () => {
  it('useReassignLead: a new lead changes who may link', () => {
    const mutation = useReassignLead() as unknown as MutationConfig;
    mutation.onSuccess(undefined, {
      projectId: 'project-1',
      oldDesignerId: 'designer-old',
      newDesignerId: 'designer-new',
    });
    expect(invalidatedKeys()).toContainEqual(LINK_KEY);
  });

  it("useStampProjectPricingStudio: a named studio is what an owner/admin's standing reads", () => {
    const mutation = useStampProjectPricingStudio() as unknown as MutationConfig;
    mutation.onSuccess('studio-1', { projectId: 'project-1', studioId: 'studio-1' });
    expect(invalidatedKeys()).toContainEqual(LINK_KEY);
  });
});
