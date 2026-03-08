'use client';

import { useCallback, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useSession as useSupabaseSession } from '@patina/supabase';
import { Permission, Role, hasPermission, hasRole, type Session } from '@/lib/rbac';

export function useAuth() {
  const { session: supabaseSession, isLoading } = useSupabaseSession();
  const router = useRouter();

  const session: Session | null = useMemo(() => {
    if (!supabaseSession?.user) return null;
    const user = supabaseSession.user;
    const roles = (user.app_metadata?.roles as string[]) ||
                  (user.user_metadata?.roles as string[]) ||
                  ['client'];
    const permissions = (user.app_metadata?.permissions as string[]) || [];
    return {
      user: {
        id: user.id,
        email: user.email || '',
        name: (user.user_metadata?.displayName as string) || (user.user_metadata?.name as string) || null,
        roles,
        permissions,
      },
      accessToken: supabaseSession.access_token,
      expires: supabaseSession.expires_at
        ? new Date(supabaseSession.expires_at * 1000).toISOString()
        : undefined,
    };
  }, [supabaseSession]);

  const isAuthenticated = !!session?.user;
  const user = session?.user ?? undefined;

  const handleSignIn = useCallback(
    async (callbackUrl = '/projects') => {
      router.push(`/auth/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`);
    },
    [router]
  );

  const handleSignOut = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (error) {
      console.error('Logout failed:', error);
    }
    const { createBrowserClient } = await import('@patina/supabase');
    const supabase = createBrowserClient();
    await supabase.auth.signOut();
    router.push('/auth/signin');
  }, [router]);

  return {
    session,
    user,
    status: isLoading ? 'loading' : isAuthenticated ? 'authenticated' : 'unauthenticated',
    isLoading,
    isAuthenticated,
    hasSessionError: false,
    signIn: handleSignIn,
    signOut: handleSignOut,
    refreshSession: async () => {},
  };
}

export function usePermissions() {
  const { session } = useAuth();

  const checkPermission = useCallback(
    (permission: Permission): boolean => {
      return hasPermission(session, permission);
    },
    [session]
  );

  const checkRole = useCallback(
    (role: Role): boolean => {
      return hasRole(session, role);
    },
    [session]
  );

  const checkAnyPermission = useCallback(
    (permissions: Permission[]): boolean => {
      return permissions.some((permission) => hasPermission(session, permission));
    },
    [session]
  );

  const checkAllPermissions = useCallback(
    (permissions: Permission[]): boolean => {
      return permissions.every((permission) => hasPermission(session, permission));
    },
    [session]
  );

  return {
    checkPermission,
    checkRole,
    checkAnyPermission,
    checkAllPermissions,
    hasPermission: checkPermission,
    hasRole: checkRole,
  };
}

export function useRequireAuth(options?: {
  redirectTo?: string;
  requiredRole?: Role;
  requiredPermission?: Permission;
}) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const { checkRole, checkPermission } = usePermissions();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated) {
      const signInUrl = `/auth/signin?callbackUrl=${encodeURIComponent(window.location.pathname)}`;
      router.push(signInUrl as any);
      return;
    }

    if (options?.requiredRole && !checkRole(options.requiredRole)) {
      router.push((options.redirectTo || '/auth/error?error=AccessDenied') as any);
      return;
    }

    if (options?.requiredPermission && !checkPermission(options.requiredPermission)) {
      router.push((options.redirectTo || '/auth/error?error=AccessDenied') as any);
      return;
    }
  }, [
    isAuthenticated,
    isLoading,
    user,
    options?.requiredRole,
    options?.requiredPermission,
    options?.redirectTo,
    checkRole,
    checkPermission,
    router,
  ]);

  return { isAuthenticated, isLoading, user };
}
