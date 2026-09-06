import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createAdminClient, createMiddlewareClient } from '@patina/supabase/client';
import { safeAuthReturnPath } from '@patina/supabase/auth';
import { CLIENT_AUTH_DESTINATION } from '@/lib/client-auth-destination';
import {
  resolvePortalDecision,
  type RoleDomain,
  type RoleLookup,
} from '@/lib/portal-access';
import { retiredRouteTarget } from '@/lib/retired-routes';

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
  // Nothing is stamped onto the request here any more: the `/proposals` page
  // tree is retired and folds before it renders, and the two routes that
  // record a signing IP (`/api/proposals/[id]/sign`, `/api/trade-scopes/[id]/
  // accept`) never matched that stamp — API routes short-circuit below —
  // reading `cf-connecting-ip` / `x-forwarded-for` directly instead.
  const requestHeaders = new Headers(req.headers);

  const res = NextResponse.next({ request: { headers: requestHeaders } });

  // Apple fetches this exact extensionless path without a user session while
  // deciding whether namespaced client.patina.cloud/field/sr_* links should
  // open Patina Field; legacy Field Coordination links intentionally stay web.
  // Return the route untouched before initializing auth; redirects, cookies,
  // or HTML here invalidate Universal Links for every guest request.
  if (req.nextUrl.pathname === '/.well-known/apple-app-site-association') return res;

  const supabase = createMiddlewareClient(req, res);
  const { data: { user } } = await supabase.auth.getUser();

  const isAuthPage = req.nextUrl.pathname.startsWith('/auth') || req.nextUrl.pathname.startsWith('/login');
  // The invite landing page is auth-adjacent but valid for both signed-in and
  // signed-out users — RLS-protected token lookup happens server-side.
  const isInviteLanding = req.nextUrl.pathname.startsWith('/auth/invite/');
  // Recovery callbacks establish a temporary authenticated session before the
  // password is changed. Let that session reach the reset screen instead of
  // treating it like an already-signed-in visit and redirecting it away.
  const isRecoveryFlow =
    req.nextUrl.pathname === '/auth/reset-password' ||
    (req.nextUrl.pathname === '/auth/callback' &&
      req.nextUrl.searchParams.get('type') === 'recovery');
  // /quiz + /quiz/results are pre-auth by design (Aesthete Engine §7.1):
  // anonymous visitors take the style quiz; the localStorage session key is
  // the capability, claimed on signup via claim_quiz_session.
  const isQuizPage = req.nextUrl.pathname === '/quiz' || req.nextUrl.pathname.startsWith('/quiz/');
  // /share/[token] is a public, VIEW-ONLY window onto a proposal (Wave 2 · C2):
  // the token is resolved server-side via resolve_document_share() — no session,
  // no RLS-authed data, no verdict/sign affordances.
  const isSharePage = req.nextUrl.pathname.startsWith('/share/');
  // /field/[token] is the same login-less pattern for a field party (Field
  // Coordination Wave 4): the token is resolved server-side via
  // resolve_field_link() — a contractor on a jobsite phone has no Patina
  // account and never will (R46-style tracked, login-less courts).
  const isFieldPage = req.nextUrl.pathname.startsWith('/field/');
  // /rfq/[token] is the same login-less pattern for a trade party asked for a
  // number (Trade Scope RFQ dispatch, Phase 2): the token is resolved
  // server-side via resolve_trade_rfq_link() — a sub or installer replying to
  // an ask has no Patina account and never will.
  const isRfqPage = req.nextUrl.pathname.startsWith('/rfq/');
  // /evidence/[token] is the same login-less pattern for a client asked to
  // photograph receiving-exception damage (Back of House S7): the token is
  // resolved server-side via fulfillment_evidence_token_context() — a client
  // tapping a link from a text/email has no reason to have a session.
  const isEvidencePage = req.nextUrl.pathname.startsWith('/evidence/');
  // /plans/[token] is the same login-less pattern for a party holding a plan
  // transmittal (Plan Room, 00429): the token is resolved server-side via
  // resolve_plan_transmittal() — a sub or fabricator handed a drawing set has
  // no Patina account and never will.
  const isPlansPage = req.nextUrl.pathname.startsWith('/plans/');
  // /pay/[token] is the same login-less pattern for whoever holds an invoice
  // link (00574): the token is resolved server-side via resolve_invoice_link()
  // — the homeowner paying a bill has no account and, in the payer-less case
  // the feature exists for, has no profile row to have one with. The prefix
  // deliberately covers /pay/return/<nonce> (the Stripe return hop) and
  // /pay/dead (the static sheet it lands on when the nonce names nothing).
  const isPayPage = req.nextUrl.pathname.startsWith('/pay/');
  // /piece/[id] is the public face of a shared piece (SP-03). A homeowner texts
  // the link to her husband, who has no Patina account and may never have one;
  // redirecting him to /auth/signin is the same dead end the share already was.
  // The read behind it is anon-scoped by RLS (products_catalog_select_anon,
  // 00152:298) — no session data is reachable from here.
  const isPiecePage = req.nextUrl.pathname.startsWith('/piece/');
  // /preferences/unsubscribe is the landing page GET /api/unsubscribe redirects
  // to after applying the token. The recipient clicking it from an email has no
  // session more often than not; gating it bounced her to
  // /auth/signin?callbackUrl=/preferences/unsubscribe, i.e. a sign-in wall in
  // front of an outcome page for an action already taken.
  const isUnsubscribeOutcomePage =
    req.nextUrl.pathname === '/preferences/unsubscribe' ||
    req.nextUrl.pathname === '/preferences/unsubscribe/';
  // Bearer-URL surfaces must never be cached by an intermediary: the HTML is
  // keyed on the token URL, so a cached copy would keep serving a revoked
  // link's sheet list. force-dynamic + meta tags govern Next and crawlers that
  // read the document — these headers govern everything in between.
  //
  // S8: this covers ALL six bearer prefixes, not just /plans. The other four
  // have carried neither header since they shipped — /share, /rfq, /evidence
  // and /field are the same kind of address as /plans, and /pay is the one
  // that reaches a till. Widening it costs nothing and closes four gaps.
  if (isPlansPage || isPayPage || isSharePage || isFieldPage || isRfqPage || isEvidencePage) {
    res.headers.set('Cache-Control', 'private, no-store, max-age=0');
    res.headers.set('X-Robots-Tag', 'noindex, nofollow');
  }
  // `/` is NOT public. It used to be a bare redirect to `/projects`; it now
  // renders the client's house, so it needs the same signed-out redirect and
  // the same portal-role gate `/projects` had — otherwise a designer or
  // manufacturer carrying the .patina.cloud SSO cookie lands on the client
  // shell instead of /wrong-portal.
  const isPublicPage =
    isInviteLanding ||
    isQuizPage ||
    isSharePage ||
    isFieldPage ||
    isRfqPage ||
    isEvidencePage ||
    isPlansPage ||
    isPayPage ||
    isPiecePage ||
    isUnsubscribeOutcomePage;
  const isApiRoute = req.nextUrl.pathname.startsWith('/api');
  // The wrong-portal interstitial is the redirect target for wrong-role users;
  // it must be exempt from the gate or a wrong-role user would loop. /unauthorized
  // is kept exempt too — it now redirects to /wrong-portal (back-compat shim).
  const isWrongPortalPage = req.nextUrl.pathname === '/wrong-portal';
  const isUnauthorizedPage = req.nextUrl.pathname === '/unauthorized';
  const isAuthenticated = !!user;

  const baseUrl = req.nextUrl.origin;
  const requestedPath = `${req.nextUrl.pathname}${req.nextUrl.search || ''}`;

  if (isApiRoute) return res;
  // Helper: create a redirect that preserves Supabase auth cookies from res.
  // Use the object-set form so domain/secure/sameSite/path/httpOnly/TTL
  // attributes carry over — the (name, value) shorthand drops them, which
  // would defeat the cross-subdomain cookie scoping from Task 2.1.
  const redirectWithCookies = (url: URL, status?: number) => {
    const redirect = status
      ? NextResponse.redirect(url, status)
      : NextResponse.redirect(url);
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
  if (isAuthenticated && isAuthPage && !isInviteLanding && !isRecoveryFlow) {
    // Sanitized: an absolute or protocol-relative callbackUrl would otherwise
    // be an open redirect via `new URL(callbackUrl, baseUrl)` below, since
    // new URL() ignores its base argument when the first argument already
    // parses as an absolute URL. Keep this on the shared auth redirect policy.
    // Sign-in lands on `/` — the client's active project page. `/projects` (the
    // old list) is itself retired below, so landing there would only cost a hop.
    const callbackUrl = safeAuthReturnPath(
      req.nextUrl.searchParams.get('callbackUrl'),
      CLIENT_AUTH_DESTINATION,
    );
    const decision = resolvePortalDecision(
      await getClientPortalRoleLookup(user!.id),
      callbackUrl,
    );
    if (decision.action === 'redirect') {
      return redirectWithCookies(new URL(decision.to, baseUrl));
    }
    if (decision.action === 'skip') {
      // Auth pages are always allowed through even when the check is skipped
      // (no marker header — that is reserved for protected routes), but we log.
      logRoleCheckSkipped(decision.reason, req.nextUrl.pathname, user!.id);
    }
    return redirectWithCookies(new URL(callbackUrl, baseUrl));
  }

  if (!isAuthenticated && !isAuthPage && !isPublicPage) {
    const loginUrl = new URL('/auth/signin', baseUrl);
    loginUrl.searchParams.set('callbackUrl', requestedPath);
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
      requestedPath,
    );
    if (decision.action === 'redirect') {
      return redirectWithCookies(new URL(decision.to, baseUrl));
    }
    if (decision.action === 'skip') {
      logRoleCheckSkipped(decision.reason, req.nextUrl.pathname, user!.id);
      res.headers.set('x-patina-role-check', 'skipped');
    }
  }

  // The old route tree is retired: every authenticated destination is now a
  // section of the one project page. Mail, SMS, cron notifications and
  // Universal Links sent before the cutover still carry the old addresses, so
  // they are answered here with a permanent redirect to the anchor.
  //
  // Deliberately after the sign-in gate: an unauthenticated visitor is sent to
  // /auth/signin with the OLD path as callbackUrl, comes back to it, and is
  // folded then — which keeps the anchor. Folding first would hand sign-in a
  // bare `/` and drop the section she was asked to come to.
  const retired = retiredRouteTarget(req.nextUrl.pathname);
  if (retired) {
    const target = new URL(retired.path, baseUrl);
    req.nextUrl.searchParams.forEach((value, key) => {
      target.searchParams.set(key, value);
    });
    for (const [key, value] of Object.entries(retired.params ?? {})) {
      target.searchParams.set(key, value);
    }
    // The fragment goes on last — a URL's hash always follows its query, and
    // the Threshold reads both (`?invoice=`/`?order=` name the row, `#letterbox`
    // names the section).
    if (retired.anchor) target.hash = retired.anchor;
    const folded = redirectWithCookies(target, 308);
    // 308 is permanent, and a permanent redirect with no ceiling may be cached
    // by a browser or an intermediary for good. The anchors are a design
    // decision and will move; an hour is long enough to spare the round trip
    // on a mail campaign's burst and short enough that a changed map reaches
    // everyone the same day.
    // `private` is load-bearing, not decoration: redirectWithCookies copies
    // the refreshed Supabase auth cookies onto this response, so a bare
    // `max-age` would invite any intermediary that honours it alone to hold
    // one homeowner's session and hand it to the next reader of the same URL.
    folded.headers.set('Cache-Control', 'private, max-age=3600');
    return folded;
  }

  return res;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|_next/webpack-hmr|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
