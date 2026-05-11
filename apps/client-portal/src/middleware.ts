import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createMiddlewareClient } from '@patina/supabase/client';

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

  return res;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|_next/webpack-hmr|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
