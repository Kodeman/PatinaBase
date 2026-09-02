import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// Mocks — the use-direct-orders / use-invoices rig (repo gotcha:
// `vi.mock('@patina/supabase')` no-ops under paths+SWC; mock the concrete
// `@supabase/ssr` module that `createBrowserClient()` actually calls).
// ─────────────────────────────────────────────────────────────────────────────

const supabaseClient = {
  auth: { getUser: vi.fn(), getSession: vi.fn() },
  from: vi.fn(),
  rpc: vi.fn(),
  channel: vi.fn(),
  removeChannel: vi.fn(),
};

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => supabaseClient,
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (config: unknown) => config,
  useInfiniteQuery: (config: unknown) => config,
  useMutation: (config: unknown) => config,
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

// Import AFTER mocks.
import { useVendorProfiles } from '../use-comms';

beforeEach(() => {
  vi.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// FF-01c — the comms vendor picker reads list_vendor_profiles(), not profiles.
//
// The old body was `.from('profiles').select('id, full_name, avatar_url')
// .eq('role','vendor')`. Migration 00555 removes the "Profiles are viewable by
// everyone" policy, and because the hook keeps `if (error) throw`, that read
// does not degrade to an empty list — it throws 42501 and every designer-portal
// screen listing vendors renders an error state. The SECURITY DEFINER RPC
// returns id / full_name / avatar_url and never email, phone or
// stripe_customer_id.
//
// 00555 is not applied on any database yet (local head is 00554), so the RPC is
// mocked here: this suite pins the CALL, not the function's behaviour. The
// executable proof that `anon` cannot execute it and `authenticated` can lives
// in supabase/tests/rls/00555_ios_round_one_security.test.sql (L0.2's file).
// ─────────────────────────────────────────────────────────────────────────────

interface QueryConfig {
  queryKey: unknown[];
  queryFn: () => Promise<unknown>;
  staleTime?: number;
}

describe('useVendorProfiles', () => {
  it('keeps the ["comms","vendor-profiles"] query key', () => {
    const config = useVendorProfiles() as unknown as QueryConfig;
    expect(config.queryKey).toEqual(['comms', 'vendor-profiles']);
  });

  it('calls list_vendor_profiles and never reads the profiles table', async () => {
    supabaseClient.rpc.mockResolvedValue({
      data: [{ id: 'vendor-1', full_name: 'Acme Woodworks', avatar_url: null }],
      error: null,
    });

    const config = useVendorProfiles() as unknown as QueryConfig;
    const rows = await config.queryFn();

    expect(supabaseClient.rpc).toHaveBeenCalledWith('list_vendor_profiles');
    expect(supabaseClient.from).not.toHaveBeenCalled();
    expect(rows).toEqual([{ id: 'vendor-1', full_name: 'Acme Woodworks', avatar_url: null }]);
  });

  it('returns an empty array for null data', async () => {
    supabaseClient.rpc.mockResolvedValue({ data: null, error: null });

    const config = useVendorProfiles() as unknown as QueryConfig;
    await expect(config.queryFn()).resolves.toEqual([]);
  });

  it('throws when the RPC errors', async () => {
    supabaseClient.rpc.mockResolvedValue({ data: null, error: new Error('function not found') });

    const config = useVendorProfiles() as unknown as QueryConfig;
    await expect(config.queryFn()).rejects.toThrow('function not found');
  });
});
