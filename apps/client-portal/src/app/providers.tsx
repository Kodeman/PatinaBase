'use client';

/**
 * Application Providers
 * Wraps the app with necessary context providers.
 * Auth is handled by Supabase via useAuth() -- no session provider needed.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Toaster } from '@patina/design-system';
import { PostHogAnalyticsProvider } from '@/lib/analytics/PostHogProvider';

interface ProvidersProps {
  children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            retry: 2,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <PostHogAnalyticsProvider>
        {children}
        <Toaster />
      </PostHogAnalyticsProvider>
    </QueryClientProvider>
  );
}
