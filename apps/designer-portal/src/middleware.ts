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
  // The landing page is the ONLY page an authenticated designer gets bounced
  // off (into /desk). Kept separate from `isPublicPage` below, which is the
  // wider "reachable while signed out" set.
  const isLandingPage = req.nextUrl.pathname === '/';
  // R91 (via the R21 dissolve): /preferences and /preferences/unsubscribe are
  // REAL pages that must answer while signed OUT — the emailed unsubscribe link
  // carries a one-time token and the page's own apply flow validates it. A
  // signed-out bounce to /auth/signin would break the contract printed in every
  // email footer. They stay reachable signed IN too (a designer editing their
  // own notification preferences), so they are public-not-landing: no /desk
  // bounce, and no designer-role gate.
  const isPreferencesPage =
    req.nextUrl.pathname === '/preferences' ||
    req.nextUrl.pathname === '/preferences/unsubscribe';
  const isPublicPage = isLandingPage || isPreferencesPage;
  const isApiRoute = req.nextUrl.pathname.startsWith('/api');
  const isUnauthorizedPage = req.nextUrl.pathname === '/unauthorized';
  const isAuthenticated = !!user;
  // /auth/accept-invite must stay reachable for ANY authenticated user,
  // including one with no designer/admin role (e.g. a freshly-invited
  // collaborator) — the page's useAcceptInvitation hook calls the
  // accept_workspace_invitation RPC, which does its own token/identity
  // validation. Without this exemption the authenticated-user branches below
  // treat it like any other /auth page and bounce the user to /desk or
  // /unauthorized before the RPC ever runs.
  const isAcceptInvitePage = req.nextUrl.pathname.startsWith('/auth/accept-invite');

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

  // A callbackUrl is only ever minted by this middleware, and it is always a
  // path + query on THIS origin. Anything else — an absolute URL, a
  // protocol-relative `//evil.example`, a backslash-smuggled variant — is an
  // open-redirect attempt (or junk) and is dropped in favour of /desk. Resolved
  // relative to baseUrl, so the round-trip preserves ?account= / ?book= /
  // ?token= doorway queries without ever leaving the portal.
  const safeCallbackUrl = (raw: string | null): URL | null => {
    if (!raw) return null;
    const value = raw.replace(/\\/g, '/');
    if (!value.startsWith('/') || value.startsWith('//')) return null;
    try {
      const url = new URL(value, baseUrl);
      if (url.origin !== new URL(baseUrl).origin) return null;
      return url;
    } catch {
      return null;
    }
  };

  // Authenticated user on an auth page: send them home (or to callbackUrl),
  // but first verify they belong on this portal. Without this gate, a user
  // with no designer/admin role would be redirected to `/`, then bounced back
  // to `/unauthorized` from a deeper protected route — the round trip causes
  // the QR signin page to re-render mid-flight and looks like a reload loop.
  if (isAuthenticated && isAuthPage && !isAcceptInvitePage) {
    if (!(await userHasDesignerPortalRole(user!.id))) {
      return redirectWithCookies(new URL('/unauthorized', baseUrl));
    }
    const callbackUrl = safeCallbackUrl(
      req.nextUrl.searchParams.get('callbackUrl'),
    );
    if (callbackUrl) {
      return redirectWithCookies(callbackUrl);
    }
    return redirectWithCookies(new URL('/desk', baseUrl));
  }

  // Authenticated user on the public landing page: send them into the app.
  // Mirror the auth-page role gate so a user without a designer/admin role
  // doesn't bounce `/` -> `/desk` -> `/unauthorized` (one redirect, not two).
  if (isAuthenticated && isLandingPage) {
    if (!(await userHasDesignerPortalRole(user!.id))) {
      return redirectWithCookies(new URL('/unauthorized', baseUrl));
    }
    return redirectWithCookies(new URL('/desk', baseUrl));
  }

  // Redirect unauthenticated users to login. The callbackUrl carries the SEARCH
  // as well as the path: every desk doorway is addressed by query
  // (/desk?book=orders&po=…, /desk?account=notifications) and the R21 permanent
  // redirect table lands cold links there, so dropping the query would turn a
  // signed-out click on an emailed invoice link into a plain Desk.
  if (!isAuthenticated && !isAuthPage && !isPublicPage) {
    const loginUrl = new URL('/auth/signin', baseUrl);
    loginUrl.searchParams.set(
      'callbackUrl',
      `${req.nextUrl.pathname}${req.nextUrl.search}`,
    );
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
