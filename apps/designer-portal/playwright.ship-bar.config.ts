import { defineConfig } from '@playwright/test';
import base from './playwright.config';

/**
 * D-B41 (W6 integration lane) — the TLS-fronted ship-bar rehearsal
 * (`build/30-deploy-runbook.md` "Rehearsal: the ship-bar server").
 *
 * `playwright.config.ts` is not editable for this seam: it carries the
 * local Supabase CLI's demo `service_role` JWT in its `webServer.env` block,
 * and the pre-commit secret scan (`scripts/hooks/core.mjs`) reads a
 * changed file's FULL staged content rather than a diff — any edit to that
 * file, regardless of which line, re-triggers the JWT finding and blocks
 * the commit. This file carries no literal keys at all: it derives from the
 * base config and overrides only what the rehearsal needs.
 *
 * `PLAYWRIGHT_BASE_URL` overrides the base config's own default
 * (`base.use?.baseURL`) so this config still tracks whatever the base
 * declares when the env var is unset. An `https:` base also turns on
 * `ignoreHTTPSErrors`, belt and braces beside the mkcert trust store
 * (Chromium and WebKit consult different stores on macOS). `webServer` is
 * dropped unconditionally: this config's only purpose is running against an
 * already-running server (the TLS-fronted production standalone), and
 * inheriting the base's `webServer` would try to boot a second one on
 * :3000.
 */
export default defineConfig({
  ...base,
  use: {
    ...base.use,
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? base.use?.baseURL,
    ...(process.env.PLAYWRIGHT_BASE_URL?.startsWith('https:')
      ? { ignoreHTTPSErrors: true }
      : {}),
  },
  webServer: undefined,
});
