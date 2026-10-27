import { createServerClient } from '@supabase/ssr';
import { SUPABASE_AUTH_STORAGE_KEY } from '@patina/supabase';
import { request, type FullConfig } from '@playwright/test';

/** Compile authenticated entries before a browser opens its HMR connection. */
export async function warmAuthenticatedRoutes(config: FullConfig, routes: readonly string[]): Promise<void> {
  const api = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '');
  const baseURL = config.projects[0].use.baseURL!;
  if (api.hostname !== '127.0.0.1' || new URL(baseURL).hostname !== 'localhost') {
    throw new Error('Authenticated route warmup requires local Supabase and a localhost portal.');
  }

  const cookies: Array<{ name: string; value: string }> = [];
  const client = createServerClient(api.href, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { storageKey: SUPABASE_AUTH_STORAGE_KEY },
    cookies: { getAll: () => [], setAll: (values: Array<{ name: string; value: string }>) => { cookies.push(...values); } },
  });
  const { error } = await client.auth.signInWithPassword({
    email: process.env.DESIGNER_E2E_EMAIL ?? 'designer@patina.dev',
    password: process.env.DESIGNER_E2E_PASSWORD ?? 'password123',
  });
  if (error) throw error;

  const warmup = await request.newContext({
    baseURL, extraHTTPHeaders: { Cookie: cookies.map(({ name, value }) => `${name}=${value}`).join('; ') },
  });
  try {
    for (const route of routes) {
      const response = await warmup.get(route, { timeout: 120_000, maxRedirects: 0 });
      if (response.status() !== 200) throw new Error(`Authenticated warmup ${route}: HTTP ${response.status()}`);
    }
  } finally {
    await warmup.dispose();
  }
}
