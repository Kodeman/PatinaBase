import { beforeEach, describe, expect, it, vi } from 'vitest';

const from = vi.fn();
const select = vi.fn();
const inFilter = vi.fn();
const eq = vi.fn();
let rows: Array<Record<string, unknown>> = [];

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => ({ from }),
}));

const invalidateQueries = vi.fn();

vi.mock('@tanstack/react-query', () => ({
  useQuery: (config: unknown) => config,
  useMutation: (config: unknown) => config,
  useQueryClient: () => ({ invalidateQueries }),
}));

import { useInviteMember, useStudiosEmployingMember } from '../use-organizations';

type QueryConfig = {
  queryKey: unknown[];
  queryFn: () => Promise<string[]>;
  enabled: boolean;
};

beforeEach(() => {
  invalidateQueries.mockReset();
  rows = [];
  from.mockReset().mockImplementation(() => ({ select }));
  select.mockReset().mockImplementation(() => ({ in: inFilter }));
  inFilter.mockReset().mockImplementation(() => ({ eq }));
  eq.mockReset().mockImplementation(() => Promise.resolve({ data: rows, error: null }));
});

describe('member mutation invalidation', () => {
  it('invalidates the employing-member query after an invite', () => {
    const mutation = useInviteMember() as unknown as {
      onSuccess: (data: unknown, variables: { organizationId: string }) => void;
    };

    mutation.onSuccess({}, { organizationId: 'studio-1' });

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['organization-members', 'employing'],
    });
  });
});

describe('useStudiosEmployingMember (SQ-1091)', () => {
  it("reads the member's seats in every candidate studio in one query", async () => {
    const query = useStudiosEmployingMember(['studio-0', 'studio-1'], 'bob') as unknown as QueryConfig;
    expect(query.enabled).toBe(true);

    await query.queryFn();

    expect(from).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith('organization_members');
    expect(inFilter).toHaveBeenCalledWith('organization_id', ['studio-0', 'studio-1']);
    expect(eq).toHaveBeenCalledWith('user_id', 'bob');
  });

  it('keeps only studios where the seat is active and neither guest nor owner (00606)', async () => {
    rows = [
      { organization_id: 'studio-member', role: 'member', status: 'active' },
      { organization_id: 'studio-admin', role: 'admin', status: 'active' },
      { organization_id: 'studio-owner', role: 'owner', status: 'active' },
      { organization_id: 'studio-guest', role: 'guest', status: 'active' },
      { organization_id: 'studio-invited', role: 'member', status: 'invited' },
      { organization_id: 'studio-suspended', role: 'member', status: 'suspended' },
    ];
    const query = useStudiosEmployingMember(
      rows.map((row) => row.organization_id as string),
      'bob',
    ) as unknown as QueryConfig;

    await expect(query.queryFn()).resolves.toEqual(['studio-member', 'studio-admin']);
  });

  it('stays idle with no candidate studio or no member', () => {
    expect((useStudiosEmployingMember([], 'bob') as unknown as QueryConfig).enabled).toBe(false);
    expect((useStudiosEmployingMember(['studio-1'], null) as unknown as QueryConfig).enabled).toBe(false);
  });

  it('throws the read error rather than answering none', async () => {
    eq.mockImplementation(() => Promise.resolve({ data: null, error: new Error('rls') }));
    const query = useStudiosEmployingMember(['studio-1'], 'bob') as unknown as QueryConfig;

    await expect(query.queryFn()).rejects.toThrow('rls');
  });
});
