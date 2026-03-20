import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createMiddlewareClient } from '@patina/supabase/client';
import { createClient } from '@supabase/supabase-js';

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

  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || 'localhost:3001';
  const protocol = req.headers.get('x-forwarded-proto') || 'http';
  const baseUrl = `${protocol}://${host}`;

  const isRSCRequest = req.headers.get('rsc') === '1';
  const isPrefetch = req.headers.get('next-router-prefetch') === '1';

  // API routes pass through (auth handled per-route)
  if (isApiRoute) {
    return res;
  }

  // RSC/prefetch requests pass through
  if (isRSCRequest || isPrefetch) {
    return res;
  }

  // Helper: create a redirect that preserves Supabase auth cookies from res
  const redirectWithCookies = (url: URL) => {
    const redirect = NextResponse.redirect(url);
    res.cookies.getAll().forEach((cookie) => {
      redirect.cookies.set(cookie.name, cookie.value);
    });
    return redirect;
  };

  // Redirect authenticated users away from auth pages
  if (isAuthenticated && isAuthPage) {
    const callbackUrl = req.nextUrl.searchParams.get('callbackUrl');
    if (callbackUrl) {
      return redirectWithCookies(new URL(callbackUrl, baseUrl));
    }
    return redirectWithCookies(new URL('/dashboard', baseUrl));
  }

  // Redirect unauthenticated users to login
  if (!isAuthenticated && !isAuthPage && !isPublicPage) {
    const loginUrl = new URL('/auth/signin', baseUrl);
    loginUrl.searchParams.set('callbackUrl', req.nextUrl.pathname);
    return redirectWithCookies(loginUrl);
  }

  // For authenticated users on protected pages (not auth, not public, not unauthorized),
  // verify they have an admin-domain role
  if (isAuthenticated && !isAuthPage && !isPublicPage && !isUnauthorizedPage) {
    try {
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

      if (serviceRoleKey && supabaseUrl) {
        const adminClient = createClient(supabaseUrl, serviceRoleKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        });

        const { data: adminRoles } = await adminClient
          .from('user_roles')
          .select('role_id, roles!inner(domain)')
          .eq('user_id', user!.id)
          .eq('roles.domain', 'admin');

        if (!adminRoles || adminRoles.length === 0) {
          return redirectWithCookies(new URL('/unauthorized', baseUrl));
        }
      }
    } catch {
      // If role check fails, allow through (fail-open for now, API routes still enforce)
    }
  }

  return res;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|_next/webpack-hmr|favicon.ico|auth/error|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
