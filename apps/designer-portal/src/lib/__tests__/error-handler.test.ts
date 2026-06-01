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

    const setLocation = (pathname: string, search = '') => {
      delete (window as unknown as { location?: Location }).location;
      (window as unknown as { location: Partial<Location> }).location = {
        pathname,
        search,
        assign: jest.fn(),
      };
    };

    beforeEach(() => {
      // The module-level redirect de-dupe flag persists across calls; reset the
      // module registry so each test starts from a clean "no redirect in flight".
      jest.resetModules();
      // jsdom location is not configurable enough to spy on assign; replace it.
      setLocation('/portal/decisions', '?filter=open');
    });

    afterEach(() => {
      (window as unknown as { location: Location }).location = originalLocation;
    });

    it('redirects to sign-in with the current path as callbackUrl on expiry', async () => {
      const { handleAuthExpiry: freshHandle } = await import('../error-handler');
      const handled = freshHandle({ code: 'PGRST301', message: 'JWT expired' });
      expect(handled).toBe(true);
      expect(window.location.assign).toHaveBeenCalledWith(
        '/auth/signin?callbackUrl=%2Fportal%2Fdecisions%3Ffilter%3Dopen'
      );
    });

    it('returns false (no redirect) for a non-expiry error', async () => {
      const { handleAuthExpiry: freshHandle } = await import('../error-handler');
      const handled = freshHandle(new Error('network blip'));
      expect(handled).toBe(false);
      expect(window.location.assign).not.toHaveBeenCalled();
    });

    it('does not redirect when already on an /auth page', async () => {
      setLocation('/auth/signin', '');
      const { redirectToSignIn: freshRedirect } = await import('../error-handler');
      freshRedirect('test');
      expect(window.location.assign).not.toHaveBeenCalled();
    });

    it('de-dupes a burst of expiry errors into a single navigation', async () => {
      const { handleAuthExpiry: freshHandle } = await import('../error-handler');
      freshHandle({ code: 'PGRST301', message: 'JWT expired' });
      freshHandle({ code: 'PGRST301', message: 'JWT expired' });
      freshHandle({ code: 'PGRST301', message: 'JWT expired' });
      expect(window.location.assign).toHaveBeenCalledTimes(1);
    });
  });
});
