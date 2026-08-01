import { beforeEach, describe, expect, it, vi } from 'vitest';

const from = vi.fn();
const rpc = vi.fn();
const invalidateQueries = vi.fn();

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => ({ from, rpc }),
}));

vi.mock('@tanstack/react-query', () => ({
  useMutation: (config: unknown) => config,
  useQuery: (config: unknown) => config,
  useQueryClient: () => ({ invalidateQueries }),
}));

import {
  useDeleteCoordinationItem,
  useNudgeCoordinationItem,
  usePublishCoordinationItem,
  useResolveCoordinationItem,
  useUpdateCoordinationItem,
} from '../use-coordination';

const coordinationItem = {
  id: 'coord-1',
  project_id: 'proj-1',
  designer_client_id: 'dc-1',
};

beforeEach(() => {
  from.mockReset();
  rpc.mockReset();
  rpc.mockResolvedValue({ data: coordinationItem, error: null });
  invalidateQueries.mockReset();
});

describe('coordination authority routing', () => {
  it('never forwards caller-supplied resolution attribution', async () => {
    const config = useResolveCoordinationItem('proj-1') as unknown as {
      mutationFn: (input: unknown) => Promise<unknown>;
    };

    await config.mutationFn({
      itemId: 'coord-1',
      answer: 'Approved',
      resolvedBy: 'spoofed-user',
    });

    expect(rpc).toHaveBeenCalledWith('resolve_coordination_item', {
      p_item_id: 'coord-1',
      p_selected_option_id: null,
      p_answer: 'Approved',
      p_revision_id: null,
      p_next_court: null,
      p_resolved_by: null,
    });
  });

  it('routes reminders and publish through checked lifecycle RPCs', async () => {
    const nudge = useNudgeCoordinationItem('proj-1') as unknown as {
      mutationFn: (input: unknown) => Promise<unknown>;
    };
    const publish = usePublishCoordinationItem('proj-1') as unknown as {
      mutationFn: (input: unknown) => Promise<unknown>;
    };

    await nudge.mutationFn({ itemId: 'coord-1' });
    await publish.mutationFn({ itemId: 'coord-1' });

    expect(rpc).toHaveBeenCalledWith('stamp_client_decision_reminder', {
      p_decision_id: 'coord-1',
    });
    expect(rpc).toHaveBeenCalledWith('publish_client_decision', {
      p_decision_id: 'coord-1',
    });
  });

  it('updates the item and its option set atomically', async () => {
    const config = useUpdateCoordinationItem('proj-1') as unknown as {
      mutationFn: (input: unknown) => Promise<unknown>;
    };

    await config.mutationFn({
      itemId: 'coord-1',
      title: 'Final selection',
      options: [{ name: 'Walnut', productId: 'prod-1' }],
    });

    expect(rpc).toHaveBeenCalledWith('update_client_decision', {
      p_decision_id: 'coord-1',
      p_patch: { title: 'Final selection' },
      p_options: [expect.objectContaining({
        name: 'Walnut',
        product_id: 'prod-1',
        sort_order: 0,
      })],
      p_expected_updated_at: null,
    });
    expect(from).not.toHaveBeenCalledWith('client_decision_options');
  });

  it('deletes through the checked cleanup RPC', async () => {
    const config = useDeleteCoordinationItem('proj-1') as unknown as {
      mutationFn: (input: unknown) => Promise<unknown>;
    };

    await config.mutationFn({
      itemId: 'coord-1',
      designerClientId: 'dc-1',
    });

    expect(rpc).toHaveBeenCalledWith('delete_client_decision_draft', {
      p_decision_id: 'coord-1',
    });
    expect(from).not.toHaveBeenCalled();
  });
});
