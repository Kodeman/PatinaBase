'use client';

import { useAuth, usePermissions } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';

interface RequireAuthProps {
  children: React.ReactNode;
  requiredRole?: string;
  requiredRoles?: string[];
  requireAllRoles?: boolean;
  fallback?: React.ReactNode;
}

/**
 * Client-side authentication wrapper
 * Redirects to sign in if not authenticated
 * Optionally checks for required roles
 */
export function RequireAuth({
  children,
  requiredRole,
  requiredRoles = [],
  requireAllRoles = false,
  fallback,
}: RequireAuthProps) {
  const { isAuthenticated, isLoading } = useAuth();
  const { hasRole } = usePermissions();
  const hasAnyRole = (roles: string[]) => roles.some(r => hasRole(r as any));
  const hasAllRoles = (roles: string[]) => roles.every(r => hasRole(r as any));
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/auth/signin');
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) {
    return fallback || (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  // Check single required role
  if (requiredRole && !hasRole(requiredRole as any)) {
    router.push('/auth/error?error=AccessDenied');
    return null;
  }

  // Check multiple required roles
  if (requiredRoles.length > 0) {
    const hasRequiredRoles = requireAllRoles
      ? hasAllRoles(requiredRoles)
      : hasAnyRole(requiredRoles);

    if (!hasRequiredRoles) {
      router.push('/auth/error?error=AccessDenied');
      return null;
    }
  }

  return <>{children}</>;
}
