/**
 * Designer Portal Authentication
 *
 * Uses Supabase Auth via @patina/supabase.
 * Exports a backward-compatible `auth()` function that returns session-like data
 * so existing middleware and API routes continue to work during migration.
 */
import { createServerClient } from '@patina/supabase/server';

export interface AuthSession {
  user: {
    id: string;
    email: string;
    name?: string | null;
    image?: string | null;
    role?: string;
    roles?: string[];
    permissions?: string[];
  };
  accessToken?: string;
  error?: string;
  expires: string;
}

/**
 * Get the current auth session.
 * Compatible with the previous NextAuth `auth()` signature.
 */
export async function auth(): Promise<AuthSession | null> {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) return null;

    // Get access token for backend proxy
    const { data: { session } } = await supabase.auth.getSession();
    const accessToken = session?.access_token;

    // Extract roles from user metadata or default
    const roles = (user.user_metadata?.roles as string[]) || ['designer'];

    return {
      user: {
        id: user.id,
        email: user.email || '',
        name: user.user_metadata?.displayName || user.user_metadata?.full_name || null,
        image: user.user_metadata?.avatar_url || null,
        role: roles[0] || 'designer',
        roles,
        permissions: (user.user_metadata?.permissions as string[]) || [],
      },
      accessToken,
      expires: session?.expires_at
        ? new Date(session.expires_at * 1000).toISOString()
        : new Date(Date.now() + 86400000).toISOString(),
    };
  } catch (error) {
    console.error('[auth] Failed to get session:', error);
    return null;
  }
}
