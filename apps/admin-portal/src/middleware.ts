import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createMiddlewareClient } from '@patina/supabase/client';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();

  // Create Supabase client for middleware (refreshes session via cookies)
  const supabase = createMiddlewareClient(req, res);
  const { data: { user } } = await supabase.auth.getUser();

  const isAuthPage = req.nextUrl.pathname.startsWith('/auth') || req.nextUrl.pathname.startsWith('/login');
  const isPublicPage = req.nextUrl.pathname === '/';
  const isApiRoute = req.nextUrl.pathname.startsWith('/api');
  const isAuthenticated = !!user;

  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || 'localhost:3001';
  const protocol = req.headers.get('x-forwarded-proto') || 'http';
  const baseUrl = `${protocol}://${host}`;

  const isRSCRequest = req.headers.get('rsc') === '1';
  const isPrefetch = req.headers.get('next-router-prefetch') === '1';

  // API routes pass through
  if (isApiRoute) {
    return res;
  }

  // RSC/prefetch requests pass through
  if (isRSCRequest || isPrefetch) {
    return res;
  }

  // Redirect authenticated users away from auth pages
  if (isAuthenticated && isAuthPage) {
    const callbackUrl = req.nextUrl.searchParams.get('callbackUrl');
    if (callbackUrl) {
      return NextResponse.redirect(new URL(callbackUrl, baseUrl));
    }
    return NextResponse.redirect(new URL('/dashboard', baseUrl));
  }

  // Redirect unauthenticated users to login
  if (!isAuthenticated && !isAuthPage && !isPublicPage) {
    const loginUrl = new URL('/login', baseUrl);
    loginUrl.searchParams.set('callbackUrl', req.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return res;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|_next/webpack-hmr|favicon.ico|auth/error|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
