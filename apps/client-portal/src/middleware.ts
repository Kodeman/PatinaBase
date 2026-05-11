import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createMiddlewareClient } from '@patina/supabase/client';
import { createClient } from '@supabase/supabase-js';

// Domains permitted on the client portal shell. `consumer` covers app_user
// and client roles (homeowners engaging designers); `admin` covers staff
// (super_admin, support_agent, ml_operator, quality_control) who need
// cross-portal access for ops/support.
const CLIENT_PORTAL_DOMAINS = new Set(['consumer', 'admin']);

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
  const isPublicPage = req.nextUrl.pathname === '/' || req.nextUrl.pathname.startsWith('/demo') || isInviteLanding;
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

  if (isAuthenticated && isAuthPage && !isInviteLanding) {
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
    try {
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

      if (serviceRoleKey && supabaseUrl) {
        const adminClient = createClient(supabaseUrl, serviceRoleKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        });

        const { data: roleRows } = await adminClient
          .from('user_roles')
          .select('roles!inner(domain)')
          .eq('user_id', user!.id);

        const userDomains = new Set(
          (roleRows ?? [])
            .map((r: { roles?: { domain?: string | null } | { domain?: string | null }[] | null }) => {
              // PostgREST may return the joined `roles` as an object or array
              // depending on relationship cardinality; normalize both shapes.
              const rel = r.roles;
              if (Array.isArray(rel)) return rel[0]?.domain ?? null;
              return rel?.domain ?? null;
            })
            .filter((d): d is string => d != null),
        );

        // Legacy bypass: users with no user_roles row pass through. In current
        // production every profile is backfilled (00126) and the handle_new_user
        // trigger seeds an app_user role on signup, so this branch is largely
        // defensive — but we keep it so a misconfigured fresh account doesn't
        // get locked out of the only shell they could use to self-recover.
        const isPermitted =
          userDomains.size === 0 ||
          Array.from(userDomains).some((d) => CLIENT_PORTAL_DOMAINS.has(d));

        if (!isPermitted) {
          return redirectWithCookies(new URL('/unauthorized', baseUrl));
        }
      }
    } catch {
      // If the role check itself fails (network, transient DB issue), fail open —
      // API routes still enforce roles per-endpoint and we'd rather not lock
      // clients out of the portal on a transient infra blip.
    }
  }

  return res;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|_next/webpack-hmr|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
