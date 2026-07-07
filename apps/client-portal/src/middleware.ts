import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createAdminClient, createMiddlewareClient } from '@patina/supabase/client';
import type { Database } from '@patina/supabase';

type RoleDomain = Database['public']['Enums']['role_domain'];

// Domains permitted on the client portal shell. `consumer` covers app_user
// and client roles (homeowners engaging designers); `admin` covers staff
// (super_admin, support_agent, ml_operator, quality_control) who need
// cross-portal access for ops/support.
const CLIENT_PORTAL_DOMAINS: readonly RoleDomain[] = ['consumer', 'admin'];

// Returns true when the user has at least one role whose domain permits the
// client portal. Fails open on missing service-role key or transient errors so
// a misconfigured shell or DB blip doesn't lock users out — the protected
// branch falls back to the existing behavior. Migration 00126 guarantees every
// user has ≥1 user_roles row, so an empty result here is a real "no permitted
// role" state, not a stale-account false negative.
async function userHasClientPortalRole(userId: string): Promise<boolean> {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return true;
  try {
    const adminClient = createAdminClient(serviceRoleKey);
    const { data } = await adminClient
      .from('user_roles')
      .select('roles!inner(domain)')
      .eq('user_id', userId)
      .in('roles.domain', CLIENT_PORTAL_DOMAINS);
    return (data ?? []).length > 0;
  } catch {
    return true;
  }
}

export async function middleware(req: NextRequest) {
  const requestHeaders = new Headers(req.headers);
  if (req.nextUrl.pathname.startsWith('/proposals')) {
    const forwarded = req.headers.get('x-forwarded-for');
    const realIp = req.headers.get('x-real-ip');
    const clientIp = forwarded?.split(',')[0]?.trim() || realIp;
    if (clientIp) {
      requestHeaders.set('x-client-ip', clientIp);
    }
  }

  const res = NextResponse.next({ request: { headers: requestHeaders } });

  const supabase = createMiddlewareClient(req, res);
  const { data: { user } } = await supabase.auth.getUser();

  const isAuthPage = req.nextUrl.pathname.startsWith('/auth') || req.nextUrl.pathname.startsWith('/login');
  // The invite landing page is auth-adjacent but valid for both signed-in and
  // signed-out users — RLS-protected token lookup happens server-side.
  const isInviteLanding = req.nextUrl.pathname.startsWith('/auth/invite/');
  // /quiz + /quiz/results are pre-auth by design (Aesthete Engine §7.1):
  // anonymous visitors take the style quiz; the localStorage session key is
  // the capability, claimed on signup via claim_quiz_session.
  const isQuizPage = req.nextUrl.pathname === '/quiz' || req.nextUrl.pathname.startsWith('/quiz/');
  // /share/[token] is a public, VIEW-ONLY window onto a proposal (Wave 2 · C2):
  // the token is resolved server-side via resolve_document_share() — no session,
  // no RLS-authed data, no verdict/sign affordances.
  const isSharePage = req.nextUrl.pathname.startsWith('/share/');
  const isPublicPage =
    req.nextUrl.pathname === '/' ||
    req.nextUrl.pathname.startsWith('/demo') ||
    isInviteLanding ||
    isQuizPage ||
    isSharePage;
  const isApiRoute = req.nextUrl.pathname.startsWith('/api');
  const isUnauthorizedPage = req.nextUrl.pathname === '/unauthorized';
  const isAuthenticated = !!user;

  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || 'localhost:3002';
  const protocol = req.headers.get('x-forwarded-proto') || 'http';
  const baseUrl = `${protocol}://${host}`;

  if (isApiRoute) return res;
  if (req.headers.get('rsc') === '1' || req.headers.get('next-router-prefetch') === '1') return res;

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
  // with no consumer/admin role would be redirected to `/`, then bounced back
  // to `/unauthorized` from a deeper protected route — the round trip causes
  // the QR signin page to re-render mid-flight and looks like a reload loop.
  if (isAuthenticated && isAuthPage && !isInviteLanding) {
    if (!(await userHasClientPortalRole(user!.id))) {
      return redirectWithCookies(new URL('/unauthorized', baseUrl));
    }
    const callbackUrl = req.nextUrl.searchParams.get('callbackUrl');
    if (callbackUrl) {
      return redirectWithCookies(new URL(callbackUrl, baseUrl));
    }
    return redirectWithCookies(new URL('/', baseUrl));
  }

  if (!isAuthenticated && !isAuthPage && !isPublicPage) {
    const loginUrl = new URL('/auth/signin', baseUrl);
    loginUrl.searchParams.set('callbackUrl', req.nextUrl.pathname);
    return redirectWithCookies(loginUrl);
  }

  // For authenticated users on protected pages (not auth, not public, not unauthorized),
  // verify they have a role whose domain permits access to the client portal.
  // With SSO cookie carry across .patina.cloud, a designer or manufacturer user
  // could otherwise land on the client shell.
  if (isAuthenticated && !isAuthPage && !isPublicPage && !isUnauthorizedPage) {
    if (!(await userHasClientPortalRole(user!.id))) {
      return redirectWithCookies(new URL('/unauthorized', baseUrl));
    }
  }

  return res;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|_next/webpack-hmr|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
