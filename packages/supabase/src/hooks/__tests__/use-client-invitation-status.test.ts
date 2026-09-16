import { describe, it, expect, vi } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// 00581's `client_invitation_status(uuid)` RPC returns a snake_case row
// (`invitation_id`); the rest of the codebase expects the camelCase
// `ClientInvitationStatus.invitationId`. This proves the mapping — and that
// a zero-row / null result becomes `null`, and an RPC error propagates rather
// than being swallowed as "no letter" (client-letter-line.tsx's fail-closed
// branch depends on the error actually reaching React Query as `isError`).
//
// Mock at the leaf: src/client.ts wraps @supabase/ssr's createBrowserClient
// (mirrors use-nurture-reviews-filter.test.ts, which avoids needing real env).
// ─────────────────────────────────────────────────────────────────────────────

let rpcResult: { data: unknown; error: unknown } = { data: null, error: null };

const rpc = vi.fn(() => Promise.resolve(rpcResult));
const supabaseClient = { rpc };

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => supabaseClient,
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (config: unknown) => config,
}));

// Import AFTER the mocks are wired up.
import {
  useClientInvitationStatus,
  clientInvitationStatusKeys,
} from '../use-client-invitation-status';

function queryConfigFor(designerClientId: string | undefined) {
  return useClientInvitationStatus(designerClientId) as unknown as {
    queryKey: unknown;
    queryFn: () => Promise<unknown>;
    enabled: boolean;
  };
}

describe('clientInvitationStatusKeys', () => {
  it('scopes the query key to one designer_client_id', () => {
    expect(clientInvitationStatusKeys.all).toEqual(['client-invitation-status']);
    expect(clientInvitationStatusKeys.one('dc1')).toEqual(['client-invitation-status', 'dc1']);
  });
});

describe('useClientInvitationStatus', () => {
  it('is disabled with an empty key when there is no designer_client_id yet', () => {
    const config = queryConfigFor(undefined);
    expect(config.enabled).toBe(false);
    expect(config.queryKey).toEqual(['client-invitation-status', '']);
  });

  it('is enabled once a designer_client_id is given', () => {
    expect(queryConfigFor('dc1').enabled).toBe(true);
  });

  it('maps the RPC\'s snake_case invitation_id onto camelCase invitationId', async () => {
    rpcResult = {
      data: [{ state: 'sent', at: '2026-09-08T14:00:00.000Z', invitation_id: 'inv-1' }],
      error: null,
    };
    const result = await queryConfigFor('dc1').queryFn();
    expect(result).toEqual({
      state: 'sent',
      at: '2026-09-08T14:00:00.000Z',
      invitationId: 'inv-1',
    });
    expect(rpc).toHaveBeenCalledWith('client_invitation_status', { p_designer_client_id: 'dc1' });
  });

  it('returns null when the household has no invitation row at all', async () => {
    rpcResult = { data: [], error: null };
    expect(await queryConfigFor('dc1').queryFn()).toBeNull();
  });

  it('returns null when the RPC hands back null instead of an array', async () => {
    rpcResult = { data: null, error: null };
    expect(await queryConfigFor('dc1').queryFn()).toBeNull();
  });

  it('throws on an RPC error rather than reporting "no letter sent"', async () => {
    rpcResult = { data: null, error: new Error('permission denied') };
    await expect(queryConfigFor('dc1').queryFn()).rejects.toThrow('permission denied');
  });
});
