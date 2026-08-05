const mockGetSession = jest.fn();
const mockGetUser = jest.fn();

jest.mock('@patina/supabase', () => ({
  createBrowserClient: () => ({
    auth: { getSession: mockGetSession, getUser: mockGetUser },
  }),
}));

import {
  AppError,
  handleApiError,
  isAuthError,
  isSessionExpiredError,
} from '../error-handler';

describe('error-handler — session expiry detection (PT-D-2-T6-1)', () => {
  describe('isSessionExpiredError', () => {
    it('detects a Supabase PostgrestError with PGRST301 (JWT expired)', () => {
      // Supabase surfaces an expired token as a plain object, NOT an Axios error.
      const postgrestError = {
        code: 'PGRST301',
        message: 'JWT expired',
        details: null,
        hint: null,
      };
      expect(isSessionExpiredError(postgrestError)).toBe(true);
    });

    it('detects a Supabase AuthError with status 401', () => {
      const authError = { name: 'AuthApiError', status: 401, message: 'Unauthorized' };
      expect(isSessionExpiredError(authError)).toBe(true);
    });

    it('detects a refresh-token failure by code', () => {
      expect(
        isSessionExpiredError({ code: 'refresh_token_not_found', message: 'nope' })
      ).toBe(true);
    });

    it('detects expiry by message fragment when no code/status is present', () => {
      expect(isSessionExpiredError(new Error('JWT expired'))).toBe(true);
      expect(
        isSessionExpiredError(new Error('Session from session_id claim in JWT does not exist'))
      ).toBe(true);
    });

    it('does NOT treat a generic 403 / permission error as expiry', () => {
      expect(isSessionExpiredError({ status: 403, message: 'forbidden' })).toBe(false);
      expect(isSessionExpiredError(new Error('Something else went wrong'))).toBe(false);
    });
  });

  describe('handleApiError maps Supabase expiry to a 401 AppError', () => {
    it('produces TOKEN_EXPIRED + statusCode 401 for a JWT-expired PostgrestError', () => {
      const appError = handleApiError({ code: 'PGRST301', message: 'JWT expired' });
      expect(appError).toBeInstanceOf(AppError);
      expect(appError.code).toBe('TOKEN_EXPIRED');
      expect(appError.statusCode).toBe(401);
      expect(isAuthError(appError)).toBe(true);
    });

    it('passes an existing AppError through without re-wrapping', () => {
      const original = new AppError({ code: 'UNAUTHORIZED', message: 'x' }, 401);
      expect(handleApiError(original)).toBe(original);
    });
  });

  describe('handleApiError maps the 00187 invoice-guard CHECK violation (W3-T3b)', () => {
    it('translates 23514/chk_line_items_ffe_kind into the friendly billed-item message', () => {
      // Shape Postgres/PostgREST surfaces when deleting a project_ffe_items
      // row that a live invoice line bills (FK ON DELETE SET NULL violates
      // the invoice guard).
      const appError = handleApiError({
        code: '23514',
        message:
          'update or delete on table "project_ffe_items" violates check constraint "chk_line_items_ffe_kind" on table "invoice_line_items"',
      });
      expect(appError).toBeInstanceOf(AppError);
      expect(appError.code).toBe('FFE_ITEM_BILLED');
      expect(appError.statusCode).toBe(409);
      expect(appError.message).toBe(
        'This item is on an invoice — void the invoice before removing it.'
      );
    });

    it('leaves other 23514 CHECK violations on the generic path', () => {
      const appError = handleApiError({
        code: '23514',
        message: 'new row violates check constraint "some_other_check"',
      });
      expect(appError).toBeInstanceOf(AppError);
      expect(appError.code).not.toBe('FFE_ITEM_BILLED');
      expect(appError.message).toBe(
        'new row violates check constraint "some_other_check"'
      );
    });
  });

  describe('isAuthError now recognizes Supabase-shaped expiry', () => {
    it('returns true for a raw Supabase JWT-expired error', () => {
      expect(isAuthError({ code: 'PGRST301', message: 'JWT expired' })).toBe(true);
    });

    it('still returns true for the legacy AppError codes', () => {
      expect(isAuthError(new AppError({ code: 'UNAUTHORIZED', message: 'x' }))).toBe(true);
      expect(isAuthError(new AppError({ code: 'TOKEN_EXPIRED', message: 'x' }))).toBe(true);
    });
  });

  describe('handleAuthExpiry / redirectToSignIn', () => {
    const originalLocation = window.location;
    let warnSpy: jest.SpyInstance;

    const setLocation = (pathname: string, search = '') => {
      delete (window as unknown as { location?: Location }).location;
      (window as unknown as { location: Partial<Location> }).location = {
        pathname,
        search,
        assign: jest.fn(),
      };
    };

    // The probe chains dynamic-import → getSession → getUser → redirect; one
    // macrotask turn drains every microtask queued along the way.
    const flushLivenessProbe = () =>
      new Promise((resolve) => setTimeout(resolve, 0));

    const aliveSession = () => ({
      data: {
        session: { expires_at: Math.floor(Date.now() / 1000) + 3600 },
      },
      error: null,
    });

    beforeEach(() => {
      // The module-level redirect de-dupe flag persists across calls; reset the
      // module registry so each test starts from a clean "no redirect in flight".
      jest.resetModules();
      // The sessionStorage stamp is deliberately reload-proof, so it also
      // survives between tests — clear it or the first navigation gags the rest.
      window.sessionStorage.clear();
      // jsdom location is not configurable enough to spy on assign; replace it.
      setLocation('/desk', '?filter=open');
      mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
      // Stage 2 of the probe. Only reached when stage 1 returns a live session.
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'user-1' } },
        error: null,
      });
      warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
      warnSpy.mockRestore();
      (window as unknown as { location: Location }).location = originalLocation;
    });

    it('redirects to sign-in with the current path as callbackUrl once the session is confirmed dead', async () => {
      const { handleAuthExpiry: freshHandle } = await import('../error-handler');
      const handled = freshHandle({ code: 'PGRST301', message: 'JWT expired' });
      expect(handled).toBe(true);

      await flushLivenessProbe();
      expect(window.location.assign).toHaveBeenCalledWith(
        '/auth/signin?callbackUrl=%2Fdesk%3Ffilter%3Dopen'
      );
    });

    it('returns false (no redirect) for a non-expiry error', async () => {
      const { handleAuthExpiry: freshHandle } = await import('../error-handler');
      const handled = freshHandle(new Error('network blip'));
      expect(handled).toBe(false);

      await flushLivenessProbe();
      expect(mockGetSession).not.toHaveBeenCalled();
      expect(window.location.assign).not.toHaveBeenCalled();
    });

    it('claims the error surface synchronously, before the probe has run', async () => {
      const { handleAuthExpiry: freshHandle } = await import('../error-handler');
      expect(freshHandle({ status: 401, message: 'Unauthorized' })).toBe(true);
      expect(freshHandle({ status: 403, message: 'forbidden' })).toBe(false);
      // The verdict is async — nothing has navigated yet.
      expect(window.location.assign).not.toHaveBeenCalled();
    });

    it('does not redirect when already on an /auth page', async () => {
      setLocation('/auth/signin', '');
      const { redirectToSignIn: freshRedirect } = await import('../error-handler');
      freshRedirect('test');
      expect(window.location.assign).not.toHaveBeenCalled();
    });

    it('de-dupes a burst of expiry errors into a single probe and a single navigation', async () => {
      const { handleAuthExpiry: freshHandle } = await import('../error-handler');
      freshHandle({ code: 'PGRST301', message: 'JWT expired' });
      freshHandle({ code: 'PGRST301', message: 'JWT expired' });
      freshHandle({ code: 'PGRST301', message: 'JWT expired' });

      await flushLivenessProbe();
      expect(mockGetSession).toHaveBeenCalledTimes(1);
      expect(window.location.assign).toHaveBeenCalledTimes(1);
    });

    it('does NOT navigate when the session is still alive (server-side JWT misconfig)', async () => {
      mockGetSession.mockResolvedValue(aliveSession());

      const { handleAuthExpiry: freshHandle } = await import('../error-handler');
      expect(freshHandle({ status: 401, message: 'Unauthorized' })).toBe(true);

      await flushLivenessProbe();
      expect(mockGetUser).toHaveBeenCalledTimes(1);
      expect(window.location.assign).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('session is alive — not redirecting')
      );
    });

    it('hands EVERY surface folded into one probe its error back when the session is alive', async () => {
      // A burst of 401s is a burst of distinct surfaces (a query and a
      // mutation, two pages). All of them suppressed their own toast on the
      // strength of `true`; all of them are owed it back.
      mockGetSession.mockResolvedValue(aliveSession());

      const { handleAuthExpiry: freshHandle } = await import('../error-handler');
      const firstSurface = jest.fn();
      const secondSurface = jest.fn();

      expect(
        freshHandle(
          { code: 'PGRST301', message: 'JWT expired' },
          { restoreErrorSurface: firstSurface }
        )
      ).toBe(true);
      expect(
        freshHandle(
          { status: 401, message: 'Unauthorized' },
          { restoreErrorSurface: secondSurface }
        )
      ).toBe(true);

      await flushLivenessProbe();
      expect(mockGetSession).toHaveBeenCalledTimes(1);
      expect(firstSurface).toHaveBeenCalledTimes(1);
      expect(secondSurface).toHaveBeenCalledTimes(1);
      expect(window.location.assign).not.toHaveBeenCalled();
    });

    it('treats a server-revoked session as dead even though getSession reads fresh', async () => {
      // Admin revoke / global sign-out / deleted account: the local token is
      // still within its lifetime, so only the getUser round-trip catches it.
      mockGetSession.mockResolvedValue(aliveSession());
      mockGetUser.mockRejectedValue({ status: 401, message: 'invalid claim' });

      const { handleAuthExpiry: freshHandle } = await import('../error-handler');
      const surface = jest.fn();
      freshHandle({ status: 401, message: 'Unauthorized' }, { restoreErrorSurface: surface });

      await flushLivenessProbe();
      expect(window.location.assign).toHaveBeenCalledTimes(1);
      expect(window.location.assign).toHaveBeenCalledWith(
        '/auth/signin?callbackUrl=%2Fdesk%3Ffilter%3Dopen'
      );
      expect(surface).not.toHaveBeenCalled();
    });

    it('treats an authoritative getUser 401 as dead — exactly one navigation', async () => {
      mockGetSession.mockResolvedValue(aliveSession());
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: {
          name: 'AuthApiError',
          status: 401,
          message: 'User from sub claim in JWT does not exist',
        },
      });

      const { handleAuthExpiry: freshHandle } = await import('../error-handler');
      const surface = jest.fn();
      freshHandle({ status: 401, message: 'Unauthorized' }, { restoreErrorSurface: surface });

      await flushLivenessProbe();
      expect(window.location.assign).toHaveBeenCalledTimes(1);
      // The page is being replaced — no toast over a navigating document.
      expect(surface).not.toHaveBeenCalled();
    });

    it('skips the getUser round-trip when there is no local session at all', async () => {
      // beforeEach already stubs getSession as session-less.
      const { handleAuthExpiry: freshHandle } = await import('../error-handler');
      freshHandle({ code: 'PGRST301', message: 'JWT expired' });

      await flushLivenessProbe();
      expect(mockGetUser).not.toHaveBeenCalled();
      expect(window.location.assign).toHaveBeenCalledTimes(1);
    });

    it('treats a hung probe as inconclusive — surfaces the error and clears the de-dupe', async () => {
      jest.useFakeTimers();
      try {
        mockGetSession.mockResolvedValue(aliveSession());
        mockGetUser.mockReturnValue(new Promise(() => {})); // never settles

        const { handleAuthExpiry: freshHandle } = await import('../error-handler');
        const surface = jest.fn();
        freshHandle({ status: 401, message: 'Unauthorized' }, { restoreErrorSurface: surface });

        await jest.advanceTimersByTimeAsync(6_000);
        expect(window.location.assign).not.toHaveBeenCalled();
        expect(surface).toHaveBeenCalledTimes(1);

        // The de-dupe promise must be gone, or the hung probe would swallow
        // every later 401 and a genuinely dead session could never redirect.
        mockGetSession.mockClear();
        mockGetUser.mockResolvedValue({ data: { user: { id: 'u' } }, error: null });
        freshHandle({ status: 401, message: 'Unauthorized' });
        await jest.advanceTimersByTimeAsync(0);
        expect(mockGetSession).toHaveBeenCalledTimes(1);
      } finally {
        jest.useRealTimers();
      }
    });

    // Was: "treats a returned-but-expired session as dead". That premise was
    // the clock-skew bug — `expires_at` is compared against the *client's*
    // clock, so a workstation running a few minutes fast makes every freshly
    // issued token read expired and boots a live session without one network
    // call. When a session object exists, getUser() is the arbiter.
    it('does NOT treat a client-clock-expired session as dead — getUser arbitrates', async () => {
      mockGetSession.mockResolvedValue({
        data: { session: { expires_at: Math.floor(Date.now() / 1000) - 60 } },
        error: null,
      });
      // beforeEach already stubs getUser as a live user.

      const { handleAuthExpiry: freshHandle } = await import('../error-handler');
      const surface = jest.fn();
      freshHandle({ status: 401, message: 'Unauthorized' }, { restoreErrorSurface: surface });

      await flushLivenessProbe();
      expect(mockGetUser).toHaveBeenCalledTimes(1);
      expect(window.location.assign).not.toHaveBeenCalled();
      expect(surface).toHaveBeenCalledWith('alive');
    });

    it('does NOT navigate when the liveness probe itself fails', async () => {
      mockGetSession.mockRejectedValue(new Error('Failed to fetch'));

      const { handleAuthExpiry: freshHandle } = await import('../error-handler');
      const surface = jest.fn();
      expect(
        freshHandle({ status: 401, message: 'Unauthorized' }, { restoreErrorSurface: surface })
      ).toBe(true);

      await flushLivenessProbe();
      expect(window.location.assign).not.toHaveBeenCalled();
      // Inconclusive is not silence — the caller gets its surface back.
      expect(surface).toHaveBeenCalledTimes(1);
    });

    it('suppresses a second navigation while the sessionStorage stamp is fresh', async () => {
      // Simulates the reload that resets the module-level flag: a redirect
      // already fired moments ago, so this one must not bounce again.
      window.sessionStorage.setItem('patina:auth-redirect-at', String(Date.now()));

      const { handleAuthExpiry: freshHandle } = await import('../error-handler');
      freshHandle({ code: 'PGRST301', message: 'JWT expired' });

      await flushLivenessProbe();
      expect(window.location.assign).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('possible redirect loop')
      );
    });

    it('navigates again once the sessionStorage stamp is stale', async () => {
      window.sessionStorage.setItem(
        'patina:auth-redirect-at',
        String(Date.now() - 60_000)
      );

      const { handleAuthExpiry: freshHandle } = await import('../error-handler');
      const surface = jest.fn();
      freshHandle({ code: 'PGRST301', message: 'JWT expired' }, { restoreErrorSurface: surface });

      await flushLivenessProbe();
      expect(window.location.assign).toHaveBeenCalledWith(
        '/auth/signin?callbackUrl=%2Fdesk%3Ffilter%3Dopen'
      );
      // Navigation actually fired — the surfaces are dropped on purpose.
      expect(surface).not.toHaveBeenCalled();
    });

    // auth-js RETURNS its errors on `{ data, error }` rather than throwing, so
    // "offline" and "the server rejected your token" arrive in the same shape.
    // Only the second may end in a hard redirect; treating the first as death
    // signs a user out of a live session the moment their wifi blinks.
    describe('a probe that never got an answer is not a death sentence', () => {
      /** What auth-js hands back when fetch itself failed. */
      const retryableFetchError = () => ({
        name: 'AuthRetryableFetchError',
        __isAuthError: true,
        status: 0,
        message: 'Failed to fetch',
      });

      it('treats a retryable getUser transport error as inconclusive', async () => {
        mockGetSession.mockResolvedValue(aliveSession());
        mockGetUser.mockResolvedValue({
          data: { user: null },
          error: retryableFetchError(),
        });

        const { handleAuthExpiry: freshHandle } = await import('../error-handler');
        const surface = jest.fn();
        freshHandle({ status: 401, message: 'Unauthorized' }, { restoreErrorSurface: surface });

        await flushLivenessProbe();
        expect(window.location.assign).not.toHaveBeenCalled();
        expect(surface).toHaveBeenCalledWith('inconclusive');
      });

      it('treats a 429 getUser AuthApiError as inconclusive', async () => {
        mockGetSession.mockResolvedValue(aliveSession());
        mockGetUser.mockResolvedValue({
          data: { user: null },
          error: {
            name: 'AuthApiError',
            __isAuthError: true,
            status: 429,
            message: 'Request rate limit reached',
          },
        });

        const { handleAuthExpiry: freshHandle } = await import('../error-handler');
        const surface = jest.fn();
        freshHandle({ status: 401, message: 'Unauthorized' }, { restoreErrorSurface: surface });

        await flushLivenessProbe();
        expect(window.location.assign).not.toHaveBeenCalled();
        expect(surface).toHaveBeenCalledWith('inconclusive');
      });

      it('treats a 503 getUser AuthApiError as inconclusive', async () => {
        mockGetSession.mockResolvedValue(aliveSession());
        mockGetUser.mockResolvedValue({
          data: { user: null },
          error: { name: 'AuthApiError', status: 503, message: 'Service unavailable' },
        });

        const { handleAuthExpiry: freshHandle } = await import('../error-handler');
        const surface = jest.fn();
        freshHandle({ status: 401, message: 'Unauthorized' }, { restoreErrorSurface: surface });

        await flushLivenessProbe();
        expect(window.location.assign).not.toHaveBeenCalled();
        expect(surface).toHaveBeenCalledWith('inconclusive');
      });

      it('treats a retryable stage-1 getSession error as inconclusive', async () => {
        // The refresh never reached the server — `session: null` here means
        // "could not ask", not "the server said no".
        mockGetSession.mockResolvedValue({
          data: { session: null },
          error: retryableFetchError(),
        });

        const { handleAuthExpiry: freshHandle } = await import('../error-handler');
        const surface = jest.fn();
        freshHandle({ status: 401, message: 'Unauthorized' }, { restoreErrorSurface: surface });

        await flushLivenessProbe();
        expect(mockGetUser).not.toHaveBeenCalled();
        expect(window.location.assign).not.toHaveBeenCalled();
        expect(surface).toHaveBeenCalledWith('inconclusive');
      });

      it('still treats an authoritative stage-1 getSession rejection as dead', async () => {
        mockGetSession.mockResolvedValue({
          data: { session: null },
          error: {
            name: 'AuthApiError',
            status: 400,
            code: 'refresh_token_not_found',
            message: 'Invalid Refresh Token: Refresh Token Not Found',
          },
        });

        const { handleAuthExpiry: freshHandle } = await import('../error-handler');
        freshHandle({ status: 401, message: 'Unauthorized' });

        await flushLivenessProbe();
        expect(window.location.assign).toHaveBeenCalledTimes(1);
      });
    });

    // A dead session whose redirect is refused must not end in silence: no
    // toast, no navigation, and auth errors are never retried.
    describe('a dead verdict whose redirect declines still owes the caller a surface', () => {
      it('drains the surfaces with the dead verdict when already on an /auth page', async () => {
        // /auth/accept-invite is an authenticated page — its Accept button runs
        // through the MutationCache and used to fail with zero feedback here.
        setLocation('/auth/accept-invite', '?token=abc');

        const { handleAuthExpiry: freshHandle } = await import('../error-handler');
        const surface = jest.fn();
        freshHandle({ code: 'PGRST301', message: 'JWT expired' }, { restoreErrorSurface: surface });

        await flushLivenessProbe();
        expect(window.location.assign).not.toHaveBeenCalled();
        // 'dead' — so the caller shows the truthful expiry copy, not the
        // neutral "you're still signed in" copy.
        expect(surface).toHaveBeenCalledWith('dead');
      });

      it('drains the surfaces with the dead verdict when the stamp is still fresh', async () => {
        window.sessionStorage.setItem('patina:auth-redirect-at', String(Date.now()));

        const { handleAuthExpiry: freshHandle } = await import('../error-handler');
        const surface = jest.fn();
        freshHandle({ code: 'PGRST301', message: 'JWT expired' }, { restoreErrorSurface: surface });

        await flushLivenessProbe();
        expect(window.location.assign).not.toHaveBeenCalled();
        expect(surface).toHaveBeenCalledWith('dead');
      });
    });

    describe('redirectToSignIn reports whether the page is being replaced', () => {
      it('returns false when a guard declines and true when it navigates', async () => {
        const { redirectToSignIn: freshRedirect } = await import('../error-handler');

        setLocation('/auth/signin', '');
        expect(freshRedirect('on auth page')).toBe(false);

        setLocation('/desk', '');
        window.sessionStorage.setItem('patina:auth-redirect-at', String(Date.now()));
        expect(freshRedirect('stamped')).toBe(false);

        window.sessionStorage.clear();
        expect(freshRedirect('for real')).toBe(true);
        expect(window.location.assign).toHaveBeenCalledTimes(1);

        // Already in flight — the document is on its way out either way.
        expect(freshRedirect('again')).toBe(true);
        expect(window.location.assign).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('toLiveSessionError — honest copy when the session turned out fine', () => {
    it('replaces the expiry copy with neutral copy and keeps the original code for logs', async () => {
      const { toLiveSessionError: freshDerive, getErrorMessage } = await import(
        '../error-handler'
      );

      const derived = freshDerive({ code: 'PGRST301', message: 'JWT expired' });

      expect(getErrorMessage(derived)).not.toMatch(/session has expired/i);
      expect(getErrorMessage(derived)).toMatch(/still signed in/i);
      expect(derived.details).toMatchObject({ originalCode: 'TOKEN_EXPIRED' });
      expect(derived.statusCode).toBe(401);
    });
  });
});
