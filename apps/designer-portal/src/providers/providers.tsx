'use client';

/**
 * Application Providers
 * Wraps the app with necessary context providers.
 * Auth is handled by Supabase via useAuth() — no session provider needed.
 */

import { ReactNode, useEffect } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { Toaster, toast as dsToast } from '@patina/design-system';
import { queryClient } from '@/lib/react-query';
import { setToastFunction, type ToastOptions } from '@/lib/error-handler';
import { PostHogAnalyticsProvider } from '@/lib/analytics/PostHogProvider';

// The global react-query handlers (src/lib/react-query.ts) call showErrorToast/
// showSuccessToast, which forward to whatever setToastFunction registers. Bridge
// that to the design-system Toast. The error-handler's variant vocabulary
// ('destructive') differs from the Toast component's ('error'), so translate.
const VARIANT_MAP: Record<
  NonNullable<ToastOptions['variant']>,
  'default' | 'success' | 'error'
> = {
  default: 'default',
  success: 'success',
  destructive: 'error',
};

export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    setToastFunction(
      ({ title, description, variant = 'default', duration }) => {
        dsToast({
          title,
          description,
          variant: VARIANT_MAP[variant] ?? 'default',
          ...(duration ? { duration } : {}),
        });
      },
    );
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <PostHogAnalyticsProvider>{children}</PostHogAnalyticsProvider>
      <Toaster />
      {/* Keep development chrome out of the protected paper/mobile regimes;
          it can otherwise sit over the single edge owner at tablet widths.
          Gated on NODE_ENV so the panel — which exposes every cached query
          payload, this studio's projects included — cannot reach production. */}
      {process.env.NODE_ENV !== 'production' && (
        <div className="hidden min-[1440px]:block">
          <ReactQueryDevtools initialIsOpen={false} />
        </div>
      )}
    </QueryClientProvider>
  );
}
