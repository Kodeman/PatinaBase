'use client';

import { useEffect, useRef, useState, Suspense } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import posthog from 'posthog-js';
import { PostHogProvider as PHProvider } from 'posthog-js/react';
import {
  initPostHog,
  identifyUser,
  resetAnalytics,
  isAnalyticsEnabled,
  onAnalyticsInit,
} from './posthog';
import { useSession, useSessionUserId } from '@patina/supabase';

/**
 * True once `initPostHog()` has run.
 *
 * React runs child effects before parent effects, so these trackers' first
 * effect fires while the provider's init effect is still pending —
 * `isAnalyticsEnabled()` is false and that first capture is silently dropped.
 * Their deps (pathname, user id) often don't change afterwards (a cold load
 * on a stable route, a session restored from cache before init), so the first
 * pageview and the first identify were simply lost. Including this in the
 * effect deps re-runs them the moment init lands.
 *
 * Starts false on every mount — even post-init — so hydration is stable and
 * the flip happens exactly once per mount (no duplicate captures).
 */
function useAnalyticsReady(): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => onAnalyticsInit(() => setReady(true)), []);

  return ready;
}

function PageviewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const ready = useAnalyticsReady();

  useEffect(() => {
    if (!ready || !isAnalyticsEnabled()) return;
    const url = pathname + (searchParams?.toString() ? `?${searchParams.toString()}` : '');
    posthog.capture('$pageview', { $current_url: url });
  }, [pathname, searchParams, ready]);

  return null;
}

function AuthTracker() {
  // The subject comes from the session store, which also follows a cookie
  // another portal swapped (US-34 F1); useSession hears only this tab's auth
  // events, so its user describes the subject only while the ids agree.
  const userId = useSessionUserId();
  const { session } = useSession();
  const user = session?.user && session.user.id === userId ? session.user : null;
  const ready = useAnalyticsReady();
  // Who we last told PostHog about. Guards the reset branch below.
  const identifiedUserId = useRef<string | null>(null);

  useEffect(() => {
    if (!ready || !isAnalyticsEnabled()) return;

    if (userId) {
      identifyUser(
        userId,
        user
          ? {
              emailDomain: user.email?.split('@')[1],
              displayName: user.user_metadata?.display_name || user.user_metadata?.full_name,
              role: user.user_metadata?.role || 'designer',
            }
          : undefined,
      );
      identifiedUserId.current = userId;
    } else if (identifiedUserId.current !== null) {
      // Reset only on a real sign-out. Before the ready-gate existed this
      // branch could not run on a cold load (the effect bailed pre-init), and
      // it must stay that way: resetting for a never-identified visitor would
      // mint a fresh anonymous distinct_id on every cold load and shatter
      // anonymous sessions.
      resetAnalytics();
      identifiedUserId.current = null;
    }
  }, [userId, user?.id, ready]);

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
