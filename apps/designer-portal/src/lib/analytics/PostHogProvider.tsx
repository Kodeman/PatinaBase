'use client';

import { useEffect, Suspense } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import posthog from 'posthog-js';
import { PostHogProvider as PHProvider } from 'posthog-js/react';
import { initPostHog, identifyUser, resetAnalytics, isAnalyticsEnabled } from './posthog';
import { useSession } from '@patina/supabase';

function PageviewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!isAnalyticsEnabled()) return;
    const url = pathname + (searchParams?.toString() ? `?${searchParams.toString()}` : '');
    posthog.capture('$pageview', { $current_url: url });
  }, [pathname, searchParams]);

  return null;
}

function AuthTracker() {
  const { session } = useSession();

  useEffect(() => {
    if (!isAnalyticsEnabled()) return;

    if (session?.user) {
      const emailDomain = session.user.email?.split('@')[1];
      identifyUser(session.user.id, {
        emailDomain,
        displayName: session.user.user_metadata?.display_name || session.user.user_metadata?.full_name,
      });
    } else {
      resetAnalytics();
    }
  }, [session?.user?.id]);

  return null;
}

export function PostHogAnalyticsProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initPostHog();
  }, []);

  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) {
    return <>{children}</>;
  }

  return (
    <PHProvider client={posthog}>
      <Suspense fallback={null}>
        <PageviewTracker />
      </Suspense>
      <AuthTracker />
      {children}
    </PHProvider>
  );
}
