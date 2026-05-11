export {
  createClient,
  createBrowserClient,
  createServerClient,
  createMiddlewareClient,
  createAdminClient,
} from './client';
export type { Database, Json } from './database.types';
export * from './hooks';
export { isOAuthProviderEnabled, ENABLED_OAUTH_PROVIDERS, type OAuthProvider } from './lib/oauth-providers';

// Server-side auth utilities are available via '@patina/supabase/server'
// Do NOT re-export here — server.ts uses next/headers which breaks client components
