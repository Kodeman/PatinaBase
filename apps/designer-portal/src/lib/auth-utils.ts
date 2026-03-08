import { auth } from '@/lib/auth';
import { createServerClient } from '@patina/supabase/server';
import { redirect } from 'next/navigation';
import { cache } from 'react';

/**
 * Server-side authentication utilities
 * Use these in server components and API routes
 */

/**
 * Get the current session (cached for the request)
 * Use in server components
 */
export const getSession = cache(async () => {
  return await auth();
});

/**
 * Get the current user from the session
 * Use in server components
 */
export const getCurrentUser = cache(async () => {
  const session = await auth();
  return session?.user || null;
});

/**
 * Require authentication - redirects to signin if not authenticated
 * Use in server components
 */
export async function requireAuth() {
  const session = await auth();

  if (!session) {
    redirect('/auth/signin');
  }

  return session;
}

/**
 * Require designer role - redirects to error page if not designer
 * Use in server components
 */
export async function requireDesigner() {
  const session = await auth();

  if (!session) {
    redirect('/auth/signin');
  }

  const roles = session.user?.roles || [];

  if (!roles.includes('designer') && !roles.includes('admin')) {
    redirect('/auth/error?error=AccessDenied');
  }

  return session;
}

/**
 * Require client role - redirects to error page if not client
 * Use in server components
 */
export async function requireClient() {
  const session = await auth();

  if (!session) {
    redirect('/auth/signin');
  }

  const roles = session.user?.roles || [];

  if (!roles.includes('client')) {
    redirect('/auth/error?error=AccessDenied');
  }

  return session;
}

/**
 * Require specific role - redirects to error page if role not present
 * Use in server components
 */
export async function requireRole(role: string) {
  const session = await auth();

  if (!session) {
    redirect('/auth/signin');
  }

  const roles = session.user?.roles || [];

  if (!roles.includes(role)) {
    redirect('/auth/error?error=AccessDenied');
  }

  return session;
}

/**
 * Check if user has specific role
 * Use in server components
 */
export async function hasRole(role: string): Promise<boolean> {
  const session = await auth();
  const roles = session?.user?.roles || [];
  return roles.includes(role);
}

/**
 * Check if user has any of the specified roles
 * Use in server components
 */
export async function hasAnyRole(rolesToCheck: string[]): Promise<boolean> {
  const session = await auth();
  const roles = session?.user?.roles || [];
  return rolesToCheck.some(role => roles.includes(role));
}

/**
 * Check if user has all of the specified roles
 * Use in server components
 */
export async function hasAllRoles(rolesToCheck: string[]): Promise<boolean> {
  const session = await auth();
  const roles = session?.user?.roles || [];
  return rolesToCheck.every(role => roles.includes(role));
}

/**
 * Get authorization header with access token
 * Use in server-side API calls
 *
 * SECURITY: This uses the Supabase server client to retrieve the access token
 * from HTTP-only cookies, NOT from the session object.
 */
export async function getAuthHeader(): Promise<Record<string, string>> {
  try {
    const supabase = await createServerClient();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.access_token) {
      return {};
    }

    return {
      Authorization: `Bearer ${session.access_token}`,
    };
  } catch (error) {
    console.error('[Auth Utils] Failed to get access token:', error);
    return {};
  }
}
