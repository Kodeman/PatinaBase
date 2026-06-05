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
      const code = searchParams.get('code');
      const next = searchParams.get('callbackUrl') || searchParams.get('next') || '/portal';

      try {
        // PKCE flow: GoTrue redirected back with `?code=` — exchange it
        // explicitly. Relying on supabase-js auto-detect alone races the 5s
        // timeout below, so we drive the exchange here.
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            console.error('[Auth Callback Page] exchangeCodeForSession:', error.message);
            router.replace('/auth/signin?error=OAuthCallback');
            return;
          }
          router.replace(next);
          return;
        }

        // Fragment flow (legacy implicit, or Apple response_mode=fragment):
        // tokens land in the URL hash; supabase-js parses them on init and
        // fires SIGNED_IN. We poll briefly via getSession + a state listener.
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) {
          console.error('[Auth Callback Page] Session error:', error.message);
          router.replace('/auth/signin?error=OAuthCallback');
          return;
        }
        if (session) {
          router.replace(next);
          return;
        }

        const { data: { subscription } } = supabase.auth.onAuthStateChange(
          (event, session) => {
            if (event === 'SIGNED_IN' && session) {
              subscription.unsubscribe();
              router.replace(next);
            }
          }
        );

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
