'use client';

import { ReactNode } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { ShieldAlert } from 'lucide-react';

interface AdminGateProps {
  children: ReactNode;
  fallbackMessage?: string;
}

export function AdminGate({ children, fallbackMessage = 'You need admin privileges to access this page.' }: AdminGateProps) {
  const { user, isLoading, isAuthenticated } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-pulse text-muted-foreground">Checking permissions...</div>
      </div>
    );
  }

  const isAdmin = isAuthenticated && user?.roles?.includes('admin');

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center p-8">
        <ShieldAlert className="w-16 h-16 text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold text-foreground mb-2">Access Restricted</h2>
        <p className="text-muted-foreground max-w-md">{fallbackMessage}</p>
      </div>
    );
  }

  return <>{children}</>;
}
