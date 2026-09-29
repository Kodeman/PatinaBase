/**
 * W3b round-4 fix — the recurring first-test cold-server SR flake
 * (CONTRACT §4c "the first-test cold-server SR flake in the lane"). The
 * one arrival-lane red across every round so far (T.5 chromium, U.2
 * mobile-chrome, V.1 webkit, this round chromium) has always been
 * `accessibility.spec.ts:24`, always the run's very first test against a
 * freshly started `next start` process, and always clean on an immediate
 * isolated rerun against the same server. `webServer.url` only confirms the
 * port answers — it never exercises `/desk` or `/doc/[id]`, so the first
 * spec still pays for each route's one-time cost (Supabase server client
 * construction, the auth middleware's first JWT verify) that every later
 * hit gets for free. This absorbs that cost before any spec's clock starts.
 */
import type { FullConfig } from '@playwright/test';

async function warm(url: string): Promise<void> {
  try {
    await fetch(url, { redirect: 'manual' });
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
}
