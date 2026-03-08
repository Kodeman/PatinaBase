'use client';

import { useAuth } from '@/hooks/use-auth';
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
  const { isAuthenticated, isLoading, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      const signInUrl = `/auth/signin?callbackUrl=${encodeURIComponent(window.location.pathname)}`;
      router.push(signInUrl);
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
  if (requiredRole) {
    const userRoles = user?.roles || [];
    if (!userRoles.includes(requiredRole)) {
      router.push('/auth/error?error=AccessDenied');
      return null;
    }
  }

  // Check multiple required roles
  if (requiredRoles.length > 0) {
    const userRoles = user?.roles || [];
    const hasRequiredRoles = requireAllRoles
      ? requiredRoles.every(role => userRoles.includes(role))
      : requiredRoles.some(role => userRoles.includes(role));

    if (!hasRequiredRoles) {
      router.push('/auth/error?error=AccessDenied');
      return null;
    }
  }

  return <>{children}</>;
}
