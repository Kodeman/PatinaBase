import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => ({
    functions: { invoke },
  }),
}));

vi.mock('@tanstack/react-query', () => ({
  useMutation: (config: unknown) => config,
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

import type { InviteMemberInput, InviteMemberResult } from '../use-organizations';
import { useInviteMember } from '../use-organizations';

type MutationConfig = {
  mutationFn(input: InviteMemberInput): Promise<InviteMemberResult>;
};

const BASE_INPUT: InviteMemberInput = {
  organizationId: 'org-1',
  email: 'jamie@example.com',
  role: 'member',
};

beforeEach(() => {
  invoke.mockReset();
});

describe('useInviteMember — email_status contract', () => {
  it('normalizes a pre-contract 200 response (no email_status field) to "sent"', async () => {
    invoke.mockResolvedValue({
      data: { email: 'jamie@example.com', status: 'invited' },
      error: null,
    });
    const mutation = useInviteMember() as unknown as MutationConfig;

    const result = await mutation.mutationFn(BASE_INPUT);

    expect(result).toMatchObject({
      email: 'jamie@example.com',
      email_status: 'sent',
    });
  });

  it('passes through a contract email_status of "suppressed" without throwing', async () => {
    invoke.mockResolvedValue({
      data: {
        email: 'jamie@example.com',
        email_status: 'suppressed',
        email_error: 'unsubscribed',
      },
      error: null,
    });
    const mutation = useInviteMember() as unknown as MutationConfig;

    const result = await mutation.mutationFn(BASE_INPUT);

    expect(result).toEqual(
      expect.objectContaining({
        email_status: 'suppressed',
        email_error: 'unsubscribed',
      }),
    );
  });

  it('passes through a contract email_status of "failed" (200) without throwing', async () => {
    invoke.mockResolvedValue({
      data: {
        email: 'jamie@example.com',
        email_status: 'failed',
        email_error: 'smtp timeout',
      },
      error: null,
    });
    const mutation = useInviteMember() as unknown as MutationConfig;

    const result = await mutation.mutationFn(BASE_INPUT);

    expect(result.email_status).toBe('failed');
    expect(result.email_error).toBe('smtp timeout');
  });

  it('normalizes the legacy 502 send_failed shape to email_status: "failed" instead of throwing', async () => {
    const response = {
      json: async () => ({ error: 'send_failed', detail: 'smtp connection refused' }),
    };
    invoke.mockResolvedValue({
      data: null,
      error: { message: 'FunctionsHttpError', context: response },
    });
    const mutation = useInviteMember() as unknown as MutationConfig;

    const result = await mutation.mutationFn(BASE_INPUT);

    expect(result).toEqual({
      email: 'jamie@example.com',
      organizationId: 'org-1',
      email_status: 'failed',
      email_error: 'smtp connection refused',
    });
  });

  it('still throws for a real invite failure (already_member)', async () => {
    const response = { json: async () => ({ error: 'already_member' }) };
    invoke.mockResolvedValue({
      data: null,
      error: { message: 'FunctionsHttpError', context: response },
    });
    const mutation = useInviteMember() as unknown as MutationConfig;

    await expect(mutation.mutationFn(BASE_INPUT)).rejects.toThrow(
      'already_member',
    );
  });

  it('throws when the function returns 200 with its own error field', async () => {
    invoke.mockResolvedValue({
      data: { error: 'membership_upsert_failed' },
      error: null,
    });
    const mutation = useInviteMember() as unknown as MutationConfig;

    await expect(mutation.mutationFn(BASE_INPUT)).rejects.toThrow(
      'membership_upsert_failed',
    );
  });
});
