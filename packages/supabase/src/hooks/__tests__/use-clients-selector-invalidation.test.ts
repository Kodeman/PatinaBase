/**
 * SQ-1223 R3: every designer_clients write here advances the row's updated_at
 * (the 00014 BEFORE UPDATE trigger) or adds a newer row, so the newest-row
 * selector behind useDesignerClientForClientUser may now choose another
 * relationship. Each write re-reads that selector.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const invalidateQueries = vi.fn(() => Promise.resolve());

vi.mock('@tanstack/react-query', () => ({
  useQuery: (config: unknown) => config,
  useMutation: (config: unknown) => config,
  useQueryClient: () => ({ invalidateQueries }),
}));

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => ({ from: vi.fn(), rpc: vi.fn() }),
}));

import {
  useAddClient,
  useInviteAndLinkClient,
  useUpdateClientContact,
  useUpdateClientNotes,
  useUpdateClientStatus,
} from '../use-clients';

type MutationConfig = {
  onSuccess?: (data: unknown, variables: Record<string, unknown>) => unknown;
};

const SELECTOR = { queryKey: ['designer-client-for-user'] };

describe('SQ-1223 R3: designer_clients writes re-read the newest-relationship selector', () => {
  beforeEach(() => invalidateQueries.mockClear());

  it.each([
    ['useUpdateClientStatus', useUpdateClientStatus],
    ['useUpdateClientNotes', useUpdateClientNotes],
    ['useUpdateClientContact', useUpdateClientContact],
    ['useAddClient', useAddClient],
    ['useInviteAndLinkClient', useInviteAndLinkClient],
  ])('%s invalidates every designer-client-for-user read', async (_name, hook) => {
    const config = (hook as () => unknown)() as MutationConfig;
    await config.onSuccess?.(undefined, { clientId: 'dc-1', designerClientId: 'dc-1' });

    expect(invalidateQueries).toHaveBeenCalledWith(SELECTOR);
  });
});
