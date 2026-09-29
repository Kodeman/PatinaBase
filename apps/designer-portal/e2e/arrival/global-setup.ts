/**
 * W3b round-4 fix, extended round-5+1 — the recurring first-test cold-server
 * SR flake (CONTRACT §4c "the first-test cold-server SR flake in the lane").
 * The one arrival-lane red across every round so far (T.5 chromium, U.2
 * mobile-chrome, V.1 webkit, W.2 chromium, this round chromium again) has
 * always been `accessibility.spec.ts:24`, always the run's very first test
 * against a freshly started `next start` process, and always clean on an
 * immediate isolated rerun against the same build. `webServer.url` only
 * confirms the port answers — it never exercises `/desk`, `/doc/[id]`, or a
 * sign-in — so the first real spec still pays for costs every later hit gets
 * for free. This absorbs those costs before any spec's clock starts.
 *
 * Round-4's fix warmed only the Next app (`/desk`, `/doc/[fake-id]`) and the
 * flake still recurred one round later. Both of those are unauthenticated
 * GETs — every real spec instead starts with a full `authenticatedPage`
 * sign-in (`e2e/fixtures/auth.ts`), which round-trips a password grant to the
 * LOCAL Supabase Auth (GoTrue) container directly, not through the Next app.
 * That grant's own first-call cost (password verification, JWT signing key
 * setup) was never warmed by round 4's fix at all — this adds it. The
 * intentionally-wrong credentials exercise GoTrue's password-verification
 * path (the expensive part) without creating any real session; a 400 is the
 * expected, successful outcome of this probe.
 *
 * No literal Supabase key is typed here — the same "not secrets, safe to
 * inline" demo values already committed in `playwright.config.ts`'s own
 * `webServer.env` block (this lane's base config) are read by reference, the
 * same pattern `playwright.arrival.config.ts` itself already uses.
 */
import type { FullConfig } from '@playwright/test';
import base from '../../playwright.config';

async function warm(url: string, init?: RequestInit): Promise<void> {
  try {
    await fetch(url, { redirect: 'manual', ...init });
  } catch {
    // A warm-up probe's own failure is not a test result.
  }
}

export default async function globalSetup(config: FullConfig): Promise<void> {
  const project = config.projects[0];
  const baseURL =
    (typeof project?.use?.baseURL === 'string' ? project.use.baseURL : undefined) ??
    'http://127.0.0.1:3107';

  await warm(`${baseURL}/desk`);
  await warm(`${baseURL}/doc/00000000-0000-0000-0000-000000000000`);
  await warm(`${baseURL}/desk`);

  const baseWebServer = Array.isArray(base.webServer) ? base.webServer[0] : base.webServer;
  const supabaseURL = baseWebServer?.env?.NEXT_PUBLIC_SUPABASE_URL as string | undefined;
  const anonKey = baseWebServer?.env?.NEXT_PUBLIC_SUPABASE_ANON_KEY as string | undefined;
  if (supabaseURL && anonKey) {
    // Deliberately-wrong credentials against the LOCAL demo stack only
    // (guarded by the same `webServer.env` values every spec in this lane
    // already trusts) — exercises GoTrue's password-verification path once
    // before any spec's own sign-in needs it warm. No session is created.
    await warm(`${supabaseURL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'arrival-lane-warmup@patina.invalid',
        password: 'arrival-lane-warmup-not-a-real-credential',
      }),
    });
  }
}
