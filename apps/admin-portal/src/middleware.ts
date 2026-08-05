import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createMiddlewareClient } from '@patina/supabase/client';
import { safeAuthReturnPath } from '@patina/supabase/auth';
import { createClient } from '@supabase/supabase-js';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();

  // Create Supabase client for middleware (refreshes session via cookies)
  const supabase = createMiddlewareClient(req, res);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAuthPage =
    req.nextUrl.pathname.startsWith('/auth') ||
    req.nextUrl.pathname.startsWith('/login');
  const isPublicPage = req.nextUrl.pathname === '/';
  const isApiRoute = req.nextUrl.pathname.startsWith('/api');
  const isUnauthorizedPage = req.nextUrl.pathname === '/unauthorized';
  const isAuthenticated = !!user;

  const baseUrl = req.nextUrl.origin;

  // API routes pass through (auth handled per-route)
  if (isApiRoute) {
    return res;
  }

  // Helper: create a redirect that preserves Supabase auth cookies from res.
  // Use the object-set form so domain/secure/sameSite/path/httpOnly/TTL
  // attributes carry over — the (name, value) shorthand drops them, which
  // would defeat the cross-subdomain cookie scoping from Task 2.1.
  const redirectWithCookies = (url: URL) => {
    const redirect = NextResponse.redirect(url);
    res.cookies.getAll().forEach((cookie) => {
      redirect.cookies.set({
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path,
        secure: cookie.secure,
        sameSite: cookie.sameSite as 'lax' | 'strict' | 'none' | undefined,
        httpOnly: cookie.httpOnly,
        expires: cookie.expires,
        maxAge: cookie.maxAge,
      });
    });
    return redirect;
  };

  // Callback, recovery, MFA enrollment, signout, and friendly error pages need
  // to remain reachable with an authenticated session. In particular,
  // Supabase recovery establishes a session before the user chooses a new
  // password, and MFA enrollment starts at AAL1.
  const allowsAuthenticatedSession = [
    '/auth/callback',
    '/auth/reset-password',
    '/auth/mfa-enroll',
    '/auth/signout',
    '/auth/error',
  ].includes(req.nextUrl.pathname);

  // Redirect authenticated users away from entry-only auth pages.
  if (isAuthenticated && isAuthPage && !allowsAuthenticatedSession) {
    const callbackUrl = safeAuthReturnPath(
      req.nextUrl.searchParams.get('callbackUrl'),
      '/dashboard',
    );
    return redirectWithCookies(new URL(callbackUrl, baseUrl));
  }

  // Redirect unauthenticated users to login
  if (!isAuthenticated && !isAuthPage && !isPublicPage) {
    const loginUrl = new URL('/auth/signin', baseUrl);
    loginUrl.searchParams.set(
      'callbackUrl',
      safeAuthReturnPath(
        `${req.nextUrl.pathname}${req.nextUrl.search}`,
        '/dashboard',
      ),
    );
    return redirectWithCookies(loginUrl);
  }

  // For authenticated users on protected pages (not auth, not public, not unauthorized),
  // verify they have an admin-domain role
  if (isAuthenticated && !isAuthPage && !isPublicPage && !isUnauthorizedPage) {
    try {
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

      if (!serviceRoleKey || !supabaseUrl) {
        return redirectWithCookies(
          new URL('/auth/error?error=Configuration', baseUrl),
        );
      }

      const adminClient = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      const { data: adminRoles, error: roleError } = await adminClient
        .from('user_roles')
        .select('role_id, roles!inner(domain)')
        .eq('user_id', user!.id)
        .eq('roles.domain', 'admin');

      if (roleError) {
        return redirectWithCookies(
          new URL('/auth/error?error=Configuration', baseUrl),
        );
      }
      if (!adminRoles || adminRoles.length === 0) {
        return redirectWithCookies(new URL('/unauthorized', baseUrl));
      }

      const { data: profile, error: profileError } = await adminClient
        .from('profiles')
        .select('mfa_enforced')
        .eq('id', user!.id)
        .maybeSingle();

      if (profileError) {
        return redirectWithCookies(
          new URL('/auth/error?error=Configuration', baseUrl),
        );
      }

      const mfaEnforced = !!(profile as { mfa_enforced?: boolean } | null)
        ?.mfa_enforced;

      if (mfaEnforced) {
        const { data: aal, error: aalError } =
          await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (aalError) {
          return redirectWithCookies(
            new URL('/auth/error?error=Configuration', baseUrl),
          );
        }
        if (aal?.currentLevel !== 'aal2') {
          const enrollUrl = new URL('/auth/mfa-enroll', baseUrl);
          enrollUrl.searchParams.set(
            'callbackUrl',
            safeAuthReturnPath(
              `${req.nextUrl.pathname}${req.nextUrl.search}`,
              '/dashboard',
            ),
          );
          return redirectWithCookies(enrollUrl);
        }
      }
    } catch {
      return redirectWithCookies(
        new URL('/auth/error?error=Configuration', baseUrl),
      );
    }
  }

  return res;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|_next/webpack-hmr|favicon.ico|auth/error|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
