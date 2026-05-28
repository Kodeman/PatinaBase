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
export { getCookieDomain } from './lib/cookie-domain';
export {
  resolveVendor,
  type ResolveVendorInput,
  type ResolvedVendor,
} from './lib/vendors';
export {
  captureProduct,
  type CaptureProductInput,
  type CaptureProductResult,
  type CaptureProductDestination,
} from './mutations/capture-product';

// Server-side auth utilities are available via '@patina/supabase/server'
// Do NOT re-export here — server.ts uses next/headers which breaks client components
