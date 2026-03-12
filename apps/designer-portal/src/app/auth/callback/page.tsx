'use client';

import { useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createBrowserClient } from '@patina/supabase';
import { Suspense } from 'react';

/**
 * OAuth callback page.
 * Handles the client-side redirect after OAuth authentication.
 * For fragment-based responses (e.g., Apple Sign In with response_mode=fragment),
 * the token is in the URL hash and needs client-side processing.
 * For code-based responses, the route handler (route.ts) handles the exchange.
 */
function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const processed = useRef(false);

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;

    const handleCallback = async () => {
      const supabase = createBrowserClient();

      try {
        // Check if there's already a session (route handler may have set it)
        const { data: { session }, error } = await supabase.auth.getSession();

        if (error) {
          console.error('[Auth Callback Page] Session error:', error.message);
          router.replace('/auth/signin?error=OAuthCallback');
          return;
        }

        if (session) {
          // Session exists — redirect to intended destination
          const callbackUrl = searchParams.get('callbackUrl') || searchParams.get('next') || '/';
          router.replace(callbackUrl);
          return;
        }

        // No session yet — wait briefly for auth state change (fragment-based flow)
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
          (event, session) => {
            if (event === 'SIGNED_IN' && session) {
              subscription.unsubscribe();
              const callbackUrl = searchParams.get('callbackUrl') || searchParams.get('next') || '/';
              router.replace(callbackUrl);
            }
          }
        );

        // Timeout: if no session after 5 seconds, redirect to sign in
        setTimeout(() => {
          subscription.unsubscribe();
          router.replace('/auth/signin?error=OAuthCallback');
        }, 5000);
      } catch (err) {
        console.error('[Auth Callback Page] Exception:', err);
        router.replace('/auth/signin?error=OAuthCallback');
      }
    };

    handleCallback();
  }, [router, searchParams]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Completing sign in...</p>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background">
          <div className="text-center space-y-4">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <p className="text-sm text-muted-foreground">Loading...</p>
          </div>
        </div>
      }
    >
      <CallbackContent />
    </Suspense>
  );
}
