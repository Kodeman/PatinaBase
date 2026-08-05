import { beforeEach, describe, expect, it, vi } from 'vitest';

const signInWithOtp = vi.fn();

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => ({
    auth: { signInWithOtp },
  }),
}));

vi.mock('@tanstack/react-query', () => ({
  useMutation: (config: unknown) => config,
  useQueryClient: () => ({ invalidateQueries: vi.fn(), clear: vi.fn() }),
}));

import { AuthFlowError } from '../../auth/errors';
import { useSendEmailOtp, useSendMagicLink } from '../use-auth';

type MutationConfig = {
  mutationFn(input: { email: string; redirectTo?: string }): Promise<void>;
};

beforeEach(() => {
  signInWithOtp.mockReset();
  signInWithOtp.mockResolvedValue({ error: null });
});

describe('useSendEmailOtp', () => {
  it('never creates an account and preserves the callback URL', async () => {
    const mutation = useSendEmailOtp() as unknown as MutationConfig;
    await mutation.mutationFn({
      email: 'client@patina.com',
      redirectTo: 'https://client.patina.cloud/auth/callback?callbackUrl=%2Fprojects',
    });

    expect(signInWithOtp).toHaveBeenCalledWith({
      email: 'client@patina.com',
      options: {
        emailRedirectTo:
          'https://client.patina.cloud/auth/callback?callbackUrl=%2Fprojects',
        shouldCreateUser: false,
      },
    });
  });

  it('throws only presentation-safe error copy', async () => {
    signInWithOtp.mockResolvedValueOnce({
      error: new Error('internal provider secret detail'),
    });
    const mutation = useSendEmailOtp() as unknown as MutationConfig;

    const error = await mutation
      .mutationFn({
        email: 'client@patina.com',
        redirectTo: 'https://client.patina.cloud/auth/callback',
      })
      .catch((caught) => caught);
    expect(error).toBeInstanceOf(AuthFlowError);
    expect(error.message).toBe('We couldn\'t sign you in just now. Please try again.');
    expect(error.message).not.toContain('provider secret');
  });

  it('retains legacy magic-link account creation behavior for compatibility', async () => {
    const mutation = useSendMagicLink() as unknown as MutationConfig;
    await mutation.mutationFn({
      email: 'new-client@patina.com',
      redirectTo: 'https://client.patina.cloud/auth/callback',
    });

    expect(signInWithOtp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({ shouldCreateUser: true }),
      }),
    );
  });
});
