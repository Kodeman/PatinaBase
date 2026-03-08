export {
  createClient,
  createBrowserClient,
  createServerClient,
  createMiddlewareClient,
  createAdminClient,
} from './client';
export type { Database } from './database.types';
export * from './hooks';

// Server-side auth utilities are available via '@patina/supabase/server'
// Do NOT re-export here — server.ts uses next/headers which breaks client components
