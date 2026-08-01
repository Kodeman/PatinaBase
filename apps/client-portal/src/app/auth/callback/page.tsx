'use client';

import { useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createBrowserClient } from '@patina/supabase';
import { Suspense } from 'react';
import { buildSignInPath, resolveAuthReturnPath } from '@/lib/auth-redirect';

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
      const next = resolveAuthReturnPath(
        searchParams.get('callbackUrl') ?? searchParams.get('next'),
      );
      const retryUrl = buildSignInPath(next, 'OAuthCallback');

      try {
        // PKCE flow: GoTrue redirected back with `?code=` — exchange it
        // explicitly. Relying on supabase-js auto-detect alone races the 5s
        // timeout below, so we drive the exchange here.
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            console.error('[Auth Callback Page] exchangeCodeForSession:', error.message);
            router.replace(retryUrl as any);
            return;
          }
          router.replace(next as any);
          return;
        }

        // Fragment flow (legacy implicit, or Apple response_mode=fragment).
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) {
          console.error('[Auth Callback Page] Session error:', error.message);
          router.replace(retryUrl as any);
          return;
        }
        if (session) {
          router.replace(next as any);
          return;
        }

        let timeoutId: ReturnType<typeof setTimeout> | undefined;
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
          (event, session) => {
            if (event === 'SIGNED_IN' && session) {
              if (timeoutId) clearTimeout(timeoutId);
              subscription.unsubscribe();
              router.replace(next as any);
            }
          }
        );

        timeoutId = setTimeout(() => {
          subscription.unsubscribe();
          router.replace(retryUrl as any);
        }, 5000);
      } catch (err) {
        console.error('[Auth Callback Page] Exception:', err);
        router.replace(retryUrl as any);
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
