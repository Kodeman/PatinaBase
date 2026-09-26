const mockShowErrorToast = jest.fn();
const mockLogError = jest.fn();
const mockIsAuthError = jest.fn();
const mockHandleAuthExpiry = jest.fn();

jest.mock('../error-handler', () => ({
  handleApiError: (error: unknown) => error,
  logError: (...args: unknown[]) => mockLogError(...args),
  showErrorToast: (...args: unknown[]) => mockShowErrorToast(...args),
  isAuthError: (...args: unknown[]) => mockIsAuthError(...args),
  isNetworkError: () => false,
  handleAuthExpiry: (...args: unknown[]) => mockHandleAuthExpiry(...args),
  // Deliberately NOT stubbed: the point of the copy tests below is what a real
  // user reads, so the derivation must be the real one.
  toLiveSessionError: jest.requireActual('../error-handler').toLiveSessionError,
}));

// Return teaching follow-ups, loaded lazily by the boundary subscriber.
const mockInvalidateTeachingSignals = jest.fn();
const mockTeachingPatch = jest.fn();
const mockBrowserClient = { tag: 'browser-client' };
const mockCreateTeachingBackend = jest.fn();

jest.mock('../../hooks/use-teaching-data', () => ({
  TEACHING_NOTE_STATE_KEY: ['teaching-note-state'],
  invalidateTeachingSignals: (...args: unknown[]) => mockInvalidateTeachingSignals(...args),
}));

// SWC rewrites `@patina/help-system` to the package's src barrel (patina-testing
// Trap 1), so mock the resolved path, not the specifier.
jest.mock('../../../../../packages/help-system/src/index.ts', () => ({
  createSupabaseTeachingNoteBackend: (client: unknown) => {
    mockCreateTeachingBackend(client);
    return { patch: (...args: unknown[]) => mockTeachingPatch(...args) };
  },
}));

jest.mock('@patina/supabase', () => ({ createBrowserClient: () => mockBrowserClient }));

import { waitFor } from '@testing-library/react';
import { queryClient } from '../react-query';
import {
  firedOn,
  resetTeachingBoundaries,
  setCurrentTeachingSurface,
} from '../teaching/boundaries';

/** The copy that must never survive an alive/inconclusive verdict. */
const EXPIRED_COPY = /session has expired/i;

describe('React Query error surfaces', () => {
  beforeEach(() => {
    queryClient.clear();
    mockShowErrorToast.mockClear();
    mockLogError.mockClear();
    mockIsAuthError.mockReset().mockReturnValue(false);
    mockHandleAuthExpiry.mockReset().mockReturnValue(false);
  });

  it('logs but does not toast a query explicitly marked as a silent background lookup', async () => {
    const failure = new Error('relationship lookup failed');

    await expect(
      queryClient.fetchQuery({
        queryKey: ['designer-client-for-user', 'client-1'],
        queryFn: async () => {
          throw failure;
        },
        meta: { errorSurface: 'silent' },
      }),
    ).rejects.toBe(failure);

    expect(mockLogError).toHaveBeenCalledWith(failure, {
      queryKey: ['designer-client-for-user', 'client-1'],
      meta: { errorSurface: 'silent' },
    });
    expect(mockShowErrorToast).not.toHaveBeenCalled();
  });

  it('keeps the legacy toast for foreground queries without silent metadata', async () => {
    const failure = new Error('foreground query failed');

    await expect(
      queryClient.fetchQuery({
        queryKey: ['foreground-query'],
        queryFn: async () => {
          throw failure;
        },
      }),
    ).rejects.toBe(failure);

    expect(mockShowErrorToast).toHaveBeenCalledWith(failure);
  });

  // `handleAuthExpiry` returning true means "this error is expiry-shaped and I
  // own the surface" — it does NOT mean a navigation happened (it probes the
  // live session first). On the DEAD verdict it redirects and never calls
  // back, so no toast may fire over a page that is about to be replaced.
  // (The redirect itself is error-handler's business — covered there.)
  const expiryOptions = () =>
    expect.objectContaining({ restoreErrorSurface: expect.any(Function) });

  /** Probe verdict DEAD + a redirect that fired: claimed, never handed back. */
  const claimSurface = () => mockHandleAuthExpiry.mockReturnValue(true);

  /** The caller's surface is handed back, with the verdict that explains why. */
  const claimThenRelease = (outcome: 'alive' | 'inconclusive' | 'dead') =>
    mockHandleAuthExpiry.mockImplementation(
      (
        _error: unknown,
        options?: { restoreErrorSurface?: (outcome: string) => void },
      ) => {
        options?.restoreErrorSurface?.(outcome);
        return true;
      },
    );

  /** The single argument the restored toast was called with. */
  const restoredToast = () => {
    expect(mockShowErrorToast).toHaveBeenCalledTimes(1);
    return mockShowErrorToast.mock.calls[0][0] as { message: string };
  };

  it('lets an expiry-shaped query error claim the surface — logged, never toasted', async () => {
    mockIsAuthError.mockReturnValue(true);
    claimSurface();
    const failure = { code: 'PGRST301', message: 'JWT expired' };

    await expect(
      queryClient.fetchQuery({
        queryKey: ['expiring-query'],
        queryFn: async () => {
          throw failure;
        },
      }),
    ).rejects.toBe(failure);

    expect(mockHandleAuthExpiry).toHaveBeenCalledWith(failure, expiryOptions());
    expect(mockLogError).toHaveBeenCalledWith(failure, {
      queryKey: ['expiring-query'],
      meta: undefined,
    });
    expect(mockShowErrorToast).not.toHaveBeenCalled();
  });

  it('lets an expiry-shaped mutation error claim the surface — logged, never toasted', async () => {
    mockIsAuthError.mockReturnValue(true);
    claimSurface();
    const failure = { code: 'PGRST301', message: 'JWT expired' };

    const mutation = queryClient.getMutationCache().build(queryClient, {
      mutationKey: ['expiring-mutation'],
      mutationFn: async () => {
        throw failure;
      },
    });

    await expect(mutation.execute(undefined)).rejects.toBe(failure);

    expect(mockHandleAuthExpiry).toHaveBeenCalledWith(failure, expiryOptions());
    expect(mockLogError).toHaveBeenCalledWith(failure, {
      mutationKey: ['expiring-mutation'],
      meta: undefined,
    });
    expect(mockShowErrorToast).not.toHaveBeenCalled();
  });

  // A 401 whose session turns out to be alive (server-side JWT misconfig) must
  // not vanish: auth errors are excluded from retry, so the surface the cache
  // suppressed is the only signal the user would ever get.
  describe('when the liveness probe does not confirm death', () => {
    beforeEach(() => {
      mockIsAuthError.mockReturnValue(true);
      claimThenRelease('alive');
    });

    // Adapted: previously asserted the raw expiry error was re-toasted. Every
    // error reaching the arbiter is expiry-shaped, so that surface told a user
    // with a demonstrably live session to sign in again — and middleware
    // bounced them right back. The restored surface must be neutral.
    it('restores the query toast with neutral copy — never the expiry copy', async () => {
      const failure = { code: 'PGRST301', message: 'JWT expired' };

      await expect(
        queryClient.fetchQuery({
          queryKey: ['live-session-query'],
          queryFn: async () => {
            throw failure;
          },
        }),
      ).rejects.toBe(failure);

      const shown = restoredToast();
      expect(shown.message).not.toMatch(EXPIRED_COPY);
      expect(shown.message).toMatch(/still signed in/i);
      expect(shown.message).not.toMatch(/sign in again/i);
    });

    it('uses the same neutral copy for an inconclusive verdict', async () => {
      claimThenRelease('inconclusive');
      const failure = { status: 401, message: 'Unauthorized' };

      await expect(
        queryClient.fetchQuery({
          queryKey: ['inconclusive-query'],
          queryFn: async () => {
            throw failure;
          },
        }),
      ).rejects.toBe(failure);

      expect(restoredToast().message).not.toMatch(EXPIRED_COPY);
    });

    it('still honors a silent query — restoring a surface never invents one', async () => {
      const failure = { code: 'PGRST301', message: 'JWT expired' };

      await expect(
        queryClient.fetchQuery({
          queryKey: ['live-session-silent-query'],
          queryFn: async () => {
            throw failure;
          },
          meta: { errorSurface: 'silent' },
        }),
      ).rejects.toBe(failure);

      expect(mockShowErrorToast).not.toHaveBeenCalled();
    });

    // Adapted for the same reason as the query case above.
    it('restores the mutation toast with neutral copy — never the expiry copy', async () => {
      const failure = { code: 'PGRST301', message: 'JWT expired' };

      const mutation = queryClient.getMutationCache().build(queryClient, {
        mutationKey: ['live-session-mutation'],
        mutationFn: async () => {
          throw failure;
        },
      });

      await expect(mutation.execute(undefined)).rejects.toBe(failure);

      const shown = restoredToast();
      expect(shown.message).not.toMatch(EXPIRED_COPY);
      expect(shown.message).toMatch(/still signed in/i);
    });

    it('still honors an inline mutation — the act site renders its own band', async () => {
      const failure = { code: 'PGRST301', message: 'JWT expired' };

      const mutation = queryClient.getMutationCache().build(queryClient, {
        mutationKey: ['live-session-inline-mutation'],
        mutationFn: async () => {
          throw failure;
        },
        meta: { errorSurface: 'inline' },
      });

      await expect(mutation.execute(undefined)).rejects.toBe(failure);

      expect(mockShowErrorToast).not.toHaveBeenCalled();
    });
  });

  // The session really is dead, but the redirect declined (already on an
  // /auth/* page, or loop-bounded by the 30s stamp). The user is staying put,
  // so they get a surface — and here "your session has expired, sign in again"
  // is the truth, not a lie.
  describe('when the session is dead but the redirect declined', () => {
    beforeEach(() => {
      mockIsAuthError.mockReturnValue(true);
      claimThenRelease('dead');
    });

    it('restores the mutation toast with the original expiry error', async () => {
      const failure = { code: 'PGRST301', message: 'JWT expired' };

      const mutation = queryClient.getMutationCache().build(queryClient, {
        mutationKey: ['accept-invite'],
        mutationFn: async () => {
          throw failure;
        },
      });

      await expect(mutation.execute(undefined)).rejects.toBe(failure);

      // Not the neutral copy — the original error, whose code maps to the
      // truthful "your session has expired" message.
      expect(mockShowErrorToast).toHaveBeenCalledWith(failure);
    });

    it('restores the query toast with the original expiry error', async () => {
      const failure = { code: 'PGRST301', message: 'JWT expired' };

      await expect(
        queryClient.fetchQuery({
          queryKey: ['dead-declined-query'],
          queryFn: async () => {
            throw failure;
          },
        }),
      ).rejects.toBe(failure);

      expect(mockShowErrorToast).toHaveBeenCalledWith(failure);
    });
  });
});

describe('Return teaching tagged boundaries', () => {
  const SURFACE = 'designer-portal/document/accounts';

  beforeEach(() => {
    queryClient.clear();
    resetTeachingBoundaries();
    setCurrentTeachingSurface(SURFACE);
    mockInvalidateTeachingSignals.mockReset();
    mockCreateTeachingBackend.mockReset();
    mockTeachingPatch.mockReset().mockResolvedValue({ v: 1, visit: { lastActiveAt: 'patched' } });
  });

  const succeed = (meta?: Record<string, unknown>) =>
    queryClient
      .getMutationCache()
      .build(queryClient, { mutationFn: async () => 'ok', meta })
      .execute(undefined);

  it('does nothing for an untagged mutation success', async () => {
    await succeed({ errorSurface: 'inline', boundaryKey: 'invoice_sent' });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(firedOn(SURFACE, 'invoice_sent')).toBe(false);
    expect(mockInvalidateTeachingSignals).not.toHaveBeenCalled();
    expect(mockTeachingPatch).not.toHaveBeenCalled();
  });

  it('records a tagged success on the current surface, refreshes signals and patches lastActiveAt', async () => {
    const before = Date.now();
    await succeed({ errorSurface: 'inline', teachingBoundary: true, boundaryKey: 'invoice_sent' });

    expect(firedOn(SURFACE, 'invoice_sent', before)).toBe(true);
    expect(firedOn('designer-portal/document/hours', 'invoice_sent')).toBe(false);

    await waitFor(() =>
      expect(queryClient.getQueryData(['teaching-note-state'])).toEqual({
        v: 1,
        visit: { lastActiveAt: 'patched' },
      }),
    );
    expect(mockInvalidateTeachingSignals).toHaveBeenCalledWith(queryClient);
    expect(mockCreateTeachingBackend).toHaveBeenCalledWith(mockBrowserClient);
    expect(mockTeachingPatch).toHaveBeenCalledTimes(1);
    const [path, value] = mockTeachingPatch.mock.calls[0];
    expect(path).toEqual(['visit', 'lastActiveAt']);
    expect(Date.parse(value as string)).toBeGreaterThanOrEqual(before);
  });
});
