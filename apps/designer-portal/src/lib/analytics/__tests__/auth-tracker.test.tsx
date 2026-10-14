/**
 * US-34 F1 — AuthTracker takes its subject from the session store, so a
 * cookie another portal swapped (no auth event in this tab) re-identifies.
 */
import { act, render, waitFor } from '@testing-library/react';
import { PostHogAnalyticsProvider } from '../PostHogProvider';

const mockIdentifyUser = jest.fn();
const mockResetAnalytics = jest.fn();
/** Whose session the shared auth cookie holds right now. */
let mockStoredUser: string | null = 'user-a';

jest.mock('../posthog', () => ({
  initPostHog: jest.fn(),
  identifyUser: (...args: unknown[]) => mockIdentifyUser(...args),
  resetAnalytics: () => mockResetAnalytics(),
  isAnalyticsEnabled: () => true,
  onAnalyticsInit: (callback: () => void) => {
    callback();
    return () => {};
  },
}));
jest.mock('posthog-js', () => ({ __esModule: true, default: { capture: jest.fn() } }));
jest.mock('posthog-js/react', () => ({
  PostHogProvider: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('next/navigation', () => ({
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

// The real session-user store; only Supabase's auth client is faked.
jest.mock('../../../../../../packages/supabase/src/client', () => ({
  createBrowserClient: () => ({
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      getSession: async () => ({ data: { session: { user: { id: 'user-a' } } } }),
      storageKey: 'sb-test-auth-token',
      storage: {
        getItem: async () =>
          mockStoredUser
            ? JSON.stringify({
                access_token: `jwt-${mockStoredUser}`,
                refresh_token: `refresh-${mockStoredUser}`,
                expires_at: 4102444800,
                user: { id: mockStoredUser },
              })
            : null,
      },
    },
  }),
}));
jest.mock('@patina/supabase', () => {
  const store = jest.requireActual('../../../../../../packages/supabase/src/auth/session-user');
  return {
    useSessionUserId: store.useSessionUserId,
    // This tab heard only A's sign-in.
    useSession: () => ({
      session: {
        user: {
          id: 'user-a',
          email: 'leah@studio.test',
          user_metadata: { display_name: 'Leah', role: 'designer' },
        },
      },
    }),
  };
});

describe('AuthTracker', () => {
  const originalKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  beforeAll(() => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = 'phc_test';
  });
  afterAll(() => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = originalKey;
  });

  it('re-identifies when another portal swaps the shared cookie, and resets when it is cleared', async () => {
    render(
      <PostHogAnalyticsProvider>
        <div />
      </PostHogAnalyticsProvider>,
    );
    await waitFor(() =>
      expect(mockIdentifyUser).toHaveBeenCalledWith('user-a', {
        emailDomain: 'studio.test',
        displayName: 'Leah',
        role: 'designer',
      }),
    );
    mockIdentifyUser.mockClear();

    mockStoredUser = 'user-b';
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    // A's profile never describes B.
    await waitFor(() => expect(mockIdentifyUser).toHaveBeenCalledWith('user-b', undefined));
    expect(mockIdentifyUser).toHaveBeenCalledTimes(1);
    expect(mockResetAnalytics).not.toHaveBeenCalled();

    mockStoredUser = null;
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    await waitFor(() => expect(mockResetAnalytics).toHaveBeenCalledTimes(1));
    expect(mockIdentifyUser).toHaveBeenCalledTimes(1);
  });
});
