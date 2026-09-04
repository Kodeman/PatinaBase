import { renderHook } from '@testing-library/react';
import { useSession } from '@patina/supabase';

import { useAuth } from '../use-auth';

jest.mock('@patina/supabase', () => ({
  __esModule: true,
  useSession: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  __esModule: true,
  useRouter: () => ({ push: jest.fn() }),
}));

const sessionMock = useSession as jest.Mock;

function session(userMetadata: Record<string, unknown>) {
  return {
    session: {
      access_token: 'token',
      expires_at: 1_800_000_000,
      user: { id: 'u-1', email: 'client@patina.dev', user_metadata: userMetadata },
    },
    isLoading: false,
  };
}

describe('useAuth — the name the session actually carries', () => {
  it('reads displayName, then name, then full_name', () => {
    sessionMock.mockReturnValue(session({ displayName: 'Harper', name: 'H', full_name: 'HV' }));
    expect(renderHook(() => useAuth()).result.current.user?.name).toBe('Harper');

    sessionMock.mockReturnValue(session({ name: 'Harper Vale', full_name: 'HV' }));
    expect(renderHook(() => useAuth()).result.current.user?.name).toBe('Harper Vale');

    // Supabase's own sign-up path and public.profiles both write `full_name`;
    // without it a seeded or invited client reads as nameless.
    sessionMock.mockReturnValue(session({ full_name: 'Client User' }));
    expect(renderHook(() => useAuth()).result.current.user?.name).toBe('Client User');
  });

  it('goes without a name rather than inventing one', () => {
    sessionMock.mockReturnValue(session({}));
    expect(renderHook(() => useAuth()).result.current.user?.name).toBeNull();
  });
});
