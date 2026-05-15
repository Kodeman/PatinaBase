import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createAdminClient, createMiddlewareClient } from '@patina/supabase/client';
import type { Database } from '@patina/supabase';

type RoleDomain = Database['public']['Enums']['role_domain'];

// Domains permitted on the designer portal shell. `designer` covers studio
// roles (independent_designer, studio_owner, studio_admin, studio_designer);
// `admin` covers staff (super_admin, support_agent, ml_operator, quality_control)
// who need cross-portal access for ops/support.
const DESIGNER_PORTAL_DOMAINS: readonly RoleDomain[] = ['designer', 'admin'];

// Returns true when the user has at least one role whose domain permits the
// designer portal. Fails open on missing service-role key or transient errors
// so a misconfigured shell or DB blip doesn't lock users out. Migration 00126
// guarantees every user has ≥1 user_roles row, so an empty result here is a
// real "no permitted role" state, not a stale-account false negative.
async function userHasDesignerPortalRole(userId: string): Promise<boolean> {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return true;
  try {
    const adminClient = createAdminClient(serviceRoleKey);
    const { data } = await adminClient
      .from('user_roles')
      .select('roles!inner(domain)')
      .eq('user_id', userId)
      .in('roles.domain', DESIGNER_PORTAL_DOMAINS);
    return (data ?? []).length > 0;
  } catch {
    return true;
  }
}

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();

  // Create Supabase client for middleware (refreshes session via cookies)
  const supabase = createMiddlewareClient(req, res);
  const { data: { user } } = await supabase.auth.getUser();

  const isAuthPage = req.nextUrl.pathname.startsWith('/auth') || req.nextUrl.pathname.startsWith('/login');
  const isPublicPage = req.nextUrl.pathname === '/';
  const isApiRoute = req.nextUrl.pathname.startsWith('/api');
  const isUnauthorizedPage = req.nextUrl.pathname === '/unauthorized';
  const isAuthenticated = !!user;

  // Get the actual host from headers (handles proxy scenarios)
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || 'localhost:3000';
  const protocol = req.headers.get('x-forwarded-proto') || 'http';
  const baseUrl = `${protocol}://${host}`;

  // Detect RSC and prefetch requests - let them through
  const isRSCRequest = req.headers.get('rsc') === '1';
  const isPrefetch = req.headers.get('next-router-prefetch') === '1';

  // API routes pass through — auth handled by api-routes middleware
  if (isApiRoute) {
    return res;
  }

  // RSC/prefetch requests pass through
  if (isRSCRequest || isPrefetch) {
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

  // Authenticated user on an auth page: send them home (or to callbackUrl),
  // but first verify they belong on this portal. Without this gate, a user
  // with no designer/admin role would be redirected to `/`, then bounced back
  // to `/unauthorized` from a deeper protected route — the round trip causes
  // the QR signin page to re-render mid-flight and looks like a reload loop.
  if (isAuthenticated && isAuthPage) {
    if (!(await userHasDesignerPortalRole(user!.id))) {
      return redirectWithCookies(new URL('/unauthorized', baseUrl));
    }
    const callbackUrl = req.nextUrl.searchParams.get('callbackUrl');
    if (callbackUrl) {
      return redirectWithCookies(new URL(callbackUrl, baseUrl));
    }
    return redirectWithCookies(new URL('/', baseUrl));
  }

  // Redirect unauthenticated users to login
  if (!isAuthenticated && !isAuthPage && !isPublicPage) {
    const loginUrl = new URL('/auth/signin', baseUrl);
    loginUrl.searchParams.set('callbackUrl', req.nextUrl.pathname);
    return redirectWithCookies(loginUrl);
  }

  // For authenticated users on protected pages (not auth, not public, not unauthorized),
  // verify they have a role whose domain permits access to the designer portal.
  // With SSO cookie carry across .patina.cloud, a manufacturer or pure-client user
  // could otherwise land on the designer shell.
  if (isAuthenticated && !isAuthPage && !isPublicPage && !isUnauthorizedPage) {
    if (!(await userHasDesignerPortalRole(user!.id))) {
      return redirectWithCookies(new URL('/unauthorized', baseUrl));
    }
  }

  return res;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|_next/webpack-hmr|favicon.ico|auth/error|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
