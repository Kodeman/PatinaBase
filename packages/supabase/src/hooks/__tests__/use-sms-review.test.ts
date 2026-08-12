import { describe, expect, it, vi } from 'vitest';

const invalidateQueries = vi.fn();

vi.mock('@tanstack/react-query', () => ({
  useMutation: (config: unknown) => config,
  useQuery: (config: unknown) => config,
  useQueryClient: () => ({ invalidateQueries }),
}));

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => ({ rpc: vi.fn() }),
}));

import { useReviewSmsMessage } from '../use-sms-review';

describe('useReviewSmsMessage workflow invalidation', () => {
  it('invalidates the affected project workflow after applying a field effect', () => {
    const config = useReviewSmsMessage() as unknown as {
      onSuccess: (
        data: { action: string; result: Record<string, unknown> },
        input: { messageId: string; action: 'apply'; projectId: string },
      ) => void;
    };

    config.onSuccess(
      { action: 'apply', result: {} },
      { messageId: 'message-1', action: 'apply', projectId: 'project-1' },
    );

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['project-workflow', 'project-1'],
    });
  });
});
