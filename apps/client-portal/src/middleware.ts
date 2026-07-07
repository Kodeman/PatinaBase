import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createAdminClient, createMiddlewareClient } from '@patina/supabase/client';
import { resolvePortalDecision, type RoleDomain, type RoleLookup } from '@/lib/portal-access';

// Look up the user's role domains. Returns a tri-state so the caller can
// distinguish "no permitted role" (redirect) from "could not check" (skip).
//
// FAIL-OPEN-BUT-LOUD: when the service-role key is missing or the query throws,
// we do NOT silently allow (the old behavior) and we do NOT hard fail-closed
// either — a missing secret would then brick the whole portal, turning a config
// mistake into a total outage. Instead we return `unavailable`; the middleware
// logs it and lets protected requests through with an `x-patina-role-check:
// skipped` marker. Migration 00126 guarantees every user has ≥1 user_roles row,
// so an empty `domains` from a successful lookup is a real "no permitted role"
// state, not a stale-account false negative.
async function getClientPortalRoleLookup(userId: string): Promise<RoleLookup> {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return { status: 'unavailable', reason: 'missing-service-key' };
  try {
    const adminClient = createAdminClient(serviceRoleKey);
    const { data, error } = await adminClient
      .from('user_roles')
      .select('roles!inner(domain)')
      .eq('user_id', userId);
    if (error) return { status: 'unavailable', reason: 'lookup-error' };
    const domains: RoleDomain[] = [];
    for (const row of data ?? []) {
      const roles = (row as { roles?: unknown }).roles;
      if (Array.isArray(roles)) {
        for (const r of roles) {
          const domain = (r as { domain?: RoleDomain } | null)?.domain;
          if (domain) domains.push(domain);
        }
      } else if (roles && typeof roles === 'object' && 'domain' in roles) {
        domains.push((roles as { domain: RoleDomain }).domain);
      }
    }
    return { status: 'ok', domains };
  } catch {
    return { status: 'unavailable', reason: 'lookup-error' };
  }
}

// One structured line per request so a missing/broken role check is visible in
// Cloudflare Workers observability (which captures console output).
function logRoleCheckSkipped(reason: string, path: string, userId: string): void {
  console.error(
    JSON.stringify({
      level: 'error',
      portal: 'client',
      event: 'role_check_skipped',
      reason,
      path,
      userId,
    }),
  );
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
  const isPublicPage =
    req.nextUrl.pathname === '/' || req.nextUrl.pathname.startsWith('/demo') || isInviteLanding || isQuizPage;
  const isApiRoute = req.nextUrl.pathname.startsWith('/api');
  // The wrong-portal interstitial is the redirect target for wrong-role users;
  // it must be exempt from the gate or a wrong-role user would loop. /unauthorized
  // is kept exempt too — it now redirects to /wrong-portal (back-compat shim).
  const isWrongPortalPage = req.nextUrl.pathname === '/wrong-portal';
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
  // to `/wrong-portal` from a deeper protected route — the round trip causes
  // the QR signin page to re-render mid-flight and looks like a reload loop.
  if (isAuthenticated && isAuthPage && !isInviteLanding) {
    const callbackUrl = req.nextUrl.searchParams.get('callbackUrl');
    const decision = resolvePortalDecision(
      await getClientPortalRoleLookup(user!.id),
      callbackUrl || '/',
    );
    if (decision.action === 'redirect') {
      return redirectWithCookies(new URL(decision.to, baseUrl));
    }
    if (decision.action === 'skip') {
      // Auth pages are always allowed through even when the check is skipped
      // (no marker header — that is reserved for protected routes), but we log.
      logRoleCheckSkipped(decision.reason, req.nextUrl.pathname, user!.id);
    }
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

  // For authenticated users on protected pages (not auth, not public, not the
  // interstitials), verify they have a role whose domain permits the client
  // portal. With SSO cookie carry across .patina.cloud, a designer or
  // manufacturer user could otherwise land on the client shell and see
  // confusing empty states.
  if (
    isAuthenticated &&
    !isAuthPage &&
    !isPublicPage &&
    !isUnauthorizedPage &&
    !isWrongPortalPage
  ) {
    const decision = resolvePortalDecision(
      await getClientPortalRoleLookup(user!.id),
      req.nextUrl.pathname,
    );
    if (decision.action === 'redirect') {
      return redirectWithCookies(new URL(decision.to, baseUrl));
    }
    if (decision.action === 'skip') {
      logRoleCheckSkipped(decision.reason, req.nextUrl.pathname, user!.id);
      res.headers.set('x-patina-role-check', 'skipped');
    }
  }

  return res;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|_next/webpack-hmr|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
