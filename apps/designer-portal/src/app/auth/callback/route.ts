import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@patina/supabase/server';

/**
 * OAuth callback route handler.
 * Exchanges the authorization code from the OAuth provider for a Supabase session.
 * Supabase Auth redirects here after the user authenticates with Google/Apple.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') || '/';

  if (code) {
    try {
      const supabase = await createServerClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);

      if (error) {
        console.error('[Auth Callback] Code exchange error:', error.message);
        return NextResponse.redirect(
          new URL('/auth/signin?error=OAuthCallback', request.url)
        );
      }

      // Successful code exchange — redirect to the intended destination
      const redirectUrl = new URL(next, request.url);
      return NextResponse.redirect(redirectUrl);
    } catch (err) {
      console.error('[Auth Callback] Exception:', err);
      return NextResponse.redirect(
        new URL('/auth/signin?error=OAuthCallback', request.url)
      );
    }
  }

  // No code present — redirect to sign in with error
  return NextResponse.redirect(
    new URL('/auth/signin?error=OAuthCallback', request.url)
  );
}
