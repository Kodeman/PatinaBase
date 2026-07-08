---
name: patina-testing
description: Use when writing, fixing, or debugging Patina tests — a jest.mock() call is silently ignored, a suite throws an ESM SyntaxError touching @portabletext/react, Playwright e2e is flaky (networkidle races, single-actor collisions, flag-gated UI missing), vitest package tests, NestJS service specs, or Deno edge-function tests. Not for judging whether a passing suite proves the feature works.
---
# Patina Testing

Last verified: 2026-07-08 (main @ 593876c1, migrations head 00284). Re-verify load-bearing claims if the repo has moved.

## Use when / Don't use when
- USE when: writing or debugging a Jest unit test in any portal, a Vitest test in `packages/supabase`/`packages/patina-design-system`, a NestJS service spec, a Playwright e2e spec, or a Deno test under `supabase/functions/`; a `jest.mock()` appears to do nothing; a suite throws `SyntaxError: Unexpected token 'export'` (or similar) touching `@portabletext/react`; an e2e spec is flaky or races the database; flag-gated UI is missing specifically under Playwright.
- DON'T use for: deciding whether a passing suite is trustworthy evidence a feature works, or which command is the real gate for a target (patina-verification); edge-function deploy/config beyond the test command (patina-edge-functions); SQL test scripts under `supabase/tests/` (patina-db-migrations); driving the running app by hand (this repo's `verify` skill).
- Boundary: this skill is about writing and fixing test code and its config. Whether green tests prove the feature works belongs to patina-verification.

## Procedure
1. **Identify the runner and its config file before touching test code.** Four independent systems live here: Jest-in-portals via `next/jest`, Jest-in-services via a shared `jest.config.cjs`, Vitest in 2 packages, Playwright with 3 independent configs, and Deno under `supabase/functions/`. A pattern from one does not carry to another.
2. **Before `jest.mock('@patina/<pkg>', ...)` in `apps/designer-portal` or `apps/admin-portal`, check that app's `tsconfig.json` `paths` first.** If the package is aliased there, it must also appear in that app's `jest.config.js` `moduleNameMapper` with a matching entry, or the mock silently no-ops (Trap 1). Packages absent from `tsconfig.json` `paths` (e.g. `@patina/supabase`) mock fine everywhere via ordinary workspace resolution — no special handling needed; `decisions-panel.test.tsx` and `decision-composer-modal.test.tsx` both `jest.mock('@patina/supabase', ...)` successfully and are the proof.
3. **If a suite throws an ESM `SyntaxError` mentioning `@portabletext/react`** (usually reached via `field-primitives` or the `help-system` barrel), don't fight `transformIgnorePatterns` — mock the leaf module or the direct relative importer instead (Trap 2, two copy-paste fixes below).
4. **Adding a file under `apps/client-portal/src`?** Write its test in the same change — the suite has an enforced coverage floor (70/60/70/70) and a single untested file can tip the whole suite below it.
5. **Naming an e2e spec for a NestJS service:** it must end in exactly `.e2e-spec.ts` (hyphen). A dot (`.e2e.spec.ts`) silently never runs — `orders`' own Stripe e2e spec is the live example; don't repeat it.
6. **Before trusting a green service test that touches `services/projects/src`**, check whether the file you edited has a same-named committed `.js` sibling — 89 exist there and Jest resolves `.js` before `.ts` (full mechanics: patina-verification).
7. **Know which of the 3 independent Playwright configs you're in before writing a spec.** `designer-portal`: `testDir e2e/`, 3 browser projects (chromium/firefox/webkit) — cross-browser by default unless you chromium-pin (step 11). `client-portal`: `testDir tests/`, chromium-only, single project — never write cross-browser handling here, there's only one. `admin-portal`: `testDir e2e/`, 6 projects (desktop×3 + mobile×2 + iPad), and its `webServer` is `undefined` when `CI=true` — a spec that assumes Playwright will boot the server for it will hang against nothing in CI-like conditions; the server must already be running.
8. **Writing Playwright waits:** use `WaitHelpers` (`apps/designer-portal/e2e/utils/wait-helpers.ts`) or a web-first `expect(...)` assertion — never `page.waitForTimeout`. This is a **documented convention only**; see Trap 4 for why the lint rule that appears to enforce it does not.
9. **Asserting a DB write right after a UI action:** don't trust `page.waitForLoadState('networkidle')` as a proxy for "the mutation landed" — the write can complete after network-idle fires (exemplar comment: `e2e/proposals/proposal-boards.spec.ts:194`, "the add mutation races networkidle"). Use `expect.poll(() => queryDb(...))` instead, querying through `e2e/helpers/supabase-admin.ts` — a 600+-line service-role client with seed/query/teardown helpers (`getProposal`, `getBoardItems`-style getters, `insert*` seeders, `deleteProposalCascade`/`resetProposalToSent` teardown). Reuse a helper there before writing a new raw Supabase call in a spec.
10. **Writing a multi-actor e2e spec** (two different signed-in users in one test): copy the pattern in `e2e/fixtures/client-auth.ts` — a dedicated `BrowserContext` per actor, never sharing cookies with the primary `e2e/fixtures/auth.ts` fixture.
11. **Single-actor suites that mutate a shared-user row** (availability status, "one running timer per user" via a partial unique index): pin chromium only — `test.skip(({ browserName }) => browserName !== 'chromium', 'reason')`. Playwright's other two browser projects run in parallel as the *same seeded user* and race each other. Exemplar: `e2e/header/global-header.spec.ts:28-32`.
12. **Deno tests:** pure-logic tests need no permission flags at all; anything touching Supabase/network/env needs broad permissions plus the shared Deno config (Commands below). Full function-testing lifecycle: patina-edge-functions.
13. **Run the single narrowest command first** (forms in Commands) and read its real output before running the full suite.

Browser-automation QA boundary: the Chrome MCP tool (manual/ad-hoc browser driving, distinct from Playwright's own automation) cannot drive Chrome-extension UI, perform a native OS file-picker upload, or fire an HTML5 drag-and-drop event, and its `save_to_disk` action yields no readable file — which is exactly why those interactions belong in a Playwright spec rather than hand-verification. When you must hand-check one of those flows outside Playwright anyway, confirm it by effect (the resulting DB row, API response, or downloaded artifact), not by watching the click appear to succeed.

### Trap 1 — the Jest mock no-op (designer-portal, and structurally admin-portal too)
Mechanics, confirmed in `apps/designer-portal/tsconfig.json` vs `apps/designer-portal/jest.config.js`: `tsconfig.json` `paths` aliases 6 specifiers to package **source** (`@/*`, `@patina/design-system`, `@patina/types`, `@patina/api-client`, `@patina/utils`, `@patina/help-system`); `jest.config.js` `moduleNameMapper` mirrors only 5 of them — **`@patina/help-system` is missing**. `next/jest`'s SWC transform rewrites import specifiers at call sites using `tsconfig.json` paths, but `jest.mock()` registers against the literal string you pass it. When those two disagree, the registered mock id never matches what `require()` resolves at runtime, and `jest.mock('@patina/help-system', ...)` **silently does nothing** — no error, the real module loads. This is documented in-repo at `apps/designer-portal/src/components/portal/ffe/__tests__/stage-select.test.tsx:1-16`.

Rule: **if you add a `tsconfig.json` `paths` alias, mirror it in `jest.config.js` `moduleNameMapper` in the same change**, or don't `jest.mock()` that specifier directly — mock its relative importer instead (Trap 2).

Scope, precisely: `admin-portal`'s `tsconfig.json` carries the identical `@patina/help-system` → `../../packages/help-system/src` alias, and its `jest.config.js` `moduleNameMapper` has **zero** `@patina/*` entries — the same structural gap. No admin-portal test currently `jest.mock()`s `@patina/help-system` or imports `@portabletext/react` (checked directly), so this hasn't bitten anyone there yet — but treat it as trap-prone, not "fine." "Admin-portal has no `@patina/*` path aliases so everything mocks cleanly" is true for every package it imports **except this one**. `client-portal`'s `jest.config.js`, by contrast, uses a generic `'^@patina/([^/]+)/(.*)$'` / `'^@patina/(.*)$'` catch-all that mirrors ALL `@patina/*` packages automatically (including `help-system`) — it does not share this trap.

### Trap 2 — the `@portabletext/react` ESM crash
`transformIgnorePatterns` in the portal Jest configs allow-lists `@patina/`, `@dnd-kit/`, `@tanstack/`, `lucide-react/`, `date-fns/` (designer-portal's exact list) for ESM transformation — **`@portabletext/react` is not on it**, so anything reaching it throws a raw ESM `SyntaxError` under Jest. Two copy-paste fixes, both real in-repo:
```ts
// (a) Mock the leaf module directly — stage-select.test.tsx:13-16
jest.mock('@portabletext/react', () => ({
  PortableText: () => null,
  toPlainText: () => '',
}));
```
```ts
// (b) Mock the direct RELATIVE importer instead — decisions-panel.test.tsx:5-32
// Relative specifiers are untouched by the tsconfig-paths rewrite (Trap 1),
// so this is the safe default when the importer lives inside your own app.
jest.mock('../../activation-wizard/field-primitives', () => {
  const React = require('react');
  return { FieldRow: /* stub */, TextInput: /* stub */, TextArea: /* stub */, Select: /* stub */ };
});
```

### Trap 3 — flag-gated UI under Playwright (webServer env beats .env.local)
`apps/designer-portal/playwright.config.ts` pins the flags e2e needs into the server it starts: `webServer.env.NEXT_PUBLIC_FLAG_OVERRIDES = 'procurement-workspace-pilot:true,the-document-pilot:true'`. Two failure shapes, both real:
- **Reused server without the flags**: with `reuseExistingServer`, an already-running dev server started WITHOUT those vars serves gated UI off — Document-route specs redirect to `/portal` and fail mysteriously (this exact failure was fixed by adding `the-document-pilot` to the config env in `593876c1`). Fix: kill the dev server and let Playwright boot its own, or restart `pnpm dev` with the same `NEXT_PUBLIC_FLAG_OVERRIDES` exported.
- **New flag in the wrong place**: a spec needing another flag must add it to the config's `webServer.env` — the pinned value BEATS `.env.local` for the Playwright-started server, so `.env.local` edits won't reach it.

### Trap 4 — the e2e "no waitForTimeout" rule is not enforced
`apps/designer-portal/e2e/.eslintrc.json` defines `no-restricted-syntax` banning `page.waitForTimeout` — but it's a **legacy** `.eslintrc.json`, and `designer-portal` pins `eslint ^9`, which resolves flat config (`eslint.config.*`) only by default. `apps/designer-portal/eslint.config.mjs` — the config `pnpm lint` / `eslint .` actually uses — explicitly `ignores: ['e2e/**']`. On top of that, `e2e/.eslintrc.json`'s own `extends: ["../../../.eslintrc.json"]` target does not exist anywhere in this repo. **Nothing enforces this rule.** Confirmed empirically: 20 e2e files still call `page.waitForTimeout`, including the two canonical auth fixtures themselves (`e2e/fixtures/auth.ts` and `e2e/fixtures/client-auth.ts`, in their retry backoff). Treat the ban as a documented convention to follow by hand — grep for it yourself before calling a spec done — not something lint or CI will catch (cross-ref patina-verification's CI reality).

## Commands
```bash
# Designer portal — single unit file (jest via next/jest)
pnpm --filter @patina/designer-portal test -- src/components/portal/ffe/__tests__/stage-select.test.tsx

# Designer portal — single e2e spec (playwright; confirmed real path)
pnpm --filter @patina/designer-portal test:e2e -- e2e/proposals/proposal-build.spec.ts

# Vitest package — single file (script is `vitest run`, so this becomes `vitest run <path>`)
pnpm --filter @patina/supabase test -- src/path/to/x.test.ts

# NestJS service — single unit spec
pnpm --filter @patina/orders test -- src/modules/x/x.service.spec.ts

# NestJS service — single e2e spec (mind the exact .e2e-spec.ts suffix)
pnpm --filter @patina/orders test:e2e -- test/carts.e2e-spec.ts

# Deno — pure-logic test, no flags needed
deno test supabase/functions/_shared/render-template.test.ts

# Deno — integration test touching env/network (repo convention; also avoids a stray root deno.lock)
deno test --allow-all --config supabase/functions/deno.json supabase/functions/aesthete-ask/
```

## Quality bar
- Every `jest.mock('@patina/...')` in designer/admin-portal was checked against that app's `tsconfig.json` paths + `jest.config.js` moduleNameMapper before being trusted to fire.
- New client-portal source files ship with tests in the same change — the coverage floor is real.
- No new `page.waitForTimeout` — `WaitHelpers` or a web-first `expect` instead — verified by grep, not by assuming lint would catch it.
- DB-mutation assertions after a UI action use `expect.poll`, not a bare post-`networkidle` read.
- Multi-actor specs use an isolated `BrowserContext` per actor, never sharing the primary fixture's cookies.
- Single-actor suites touching a shared-row resource are pinned to chromium.
- NestJS e2e specs are named exactly `*.e2e-spec.ts`.

## Verification checklist
- [ ] Ran the single narrowest test/spec command for the change and read its real output.
- [ ] Any `jest.mock()` of a `@patina/*` package cross-checked against tsconfig paths + moduleNameMapper.
- [ ] Any suite reaching `@portabletext/react` mocks the leaf or the relative importer, not fighting `transformIgnorePatterns`.
- [ ] New client-portal files have accompanying tests.
- [ ] New NestJS e2e spec file ends in `.e2e-spec.ts` exactly.
- [ ] If touching `services/projects/src`: checked for a `.js` sibling shadowing the edited `.ts` (patina-verification).
- [ ] No `page.waitForTimeout` added; DB assertions use `expect.poll`, not raw post-`networkidle` reads.
- [ ] Multi-actor e2e uses a fresh `BrowserContext`; single-actor shared-row suites are chromium-pinned.

## Common mistakes
| Situation | Wrong move | Right move |
|---|---|---|
| `jest.mock('@patina/help-system', ...)` doesn't seem to apply | Assume the mock is fine, debug the component instead | Check `tsconfig.json` paths vs `jest.config.js` moduleNameMapper for that specifier; mock the relative importer instead |
| Suite throws `SyntaxError: Unexpected token 'export'` | Add the package to `transformIgnorePatterns` and hope | Mock `@portabletext/react` directly, or mock the relative importer that reaches it |
| Want to stop a flaky `waitForTimeout` in e2e | Trust `eslint` / `pnpm lint` to flag it later | It won't — `e2e/.eslintrc.json` is unreachable under ESLint 9; grep for it yourself |
| Asserting a mutation landed | `await page.waitForLoadState('networkidle')` then read | `expect.poll(() => dbHelper(...))` — the write can land after idle fires |
| New NestJS e2e spec doesn't run | Name it `foo.e2e.spec.ts` | Name it `foo.e2e-spec.ts` — testRegex requires the literal hyphen |
| Green `projects` service test after an edit | Trust it | Check for a same-named `.js` sibling in `src/` first — 89 exist and Jest resolves it before your `.ts` |
| `media` e2e "should just work" | `pnpm --filter @patina/media test:e2e` | It fails immediately — `test/jest-e2e.json` doesn't exist for media; author it first |
| Writing a second signed-in actor in an e2e spec | Reuse the `authenticatedPage`/cookies from `e2e/fixtures/auth.ts` | Use a fresh `BrowserContext`, per `e2e/fixtures/client-auth.ts` |
| Availability/timer e2e spec is flaky across browsers | Add retries | Pin chromium only — the 3 browser projects race the same seeded user row |
| Document/procurement specs fail or redirect to `/portal` against a reused dev server | Debug the spec/redirect | The running server lacks the pinned `NEXT_PUBLIC_FLAG_OVERRIDES` (webServer env beats `.env.local`, and only reaches servers Playwright starts) — kill dev and let Playwright boot, or restart dev with the flags |
| Adding an untested file to client-portal | Ship it, tests "later" | Add the test now — the coverage floor (70/60/70/70) can fail the whole suite |
| Running one Deno test | `deno test <file>` from repo root | Pure-logic files need no flags; anything touching env/network needs `--allow-all --config supabase/functions/deno.json` |

## Report back
State which runner and config file governed the test you wrote or fixed, the exact single-file/spec command you ran, and its real output (pass/fail counts or the actual error) — not a paraphrase. If you touched a `jest.mock()` for a `@patina/*` package, say whether you checked it against `tsconfig.json`/`moduleNameMapper` or are relying on an existing pattern. If you added a client-portal file, confirm its test shipped alongside. If you wrote or edited a Playwright spec, state which wait strategy you used and, for multi-actor specs, which fixture pattern. Explicitly flag what you could not verify: e2e run against only chromium locally (not all 3 browser projects), Deno integration tests not run against a live local stack, or a suite you fixed structurally but did not execute. Never claim a NestJS e2e spec "runs in CI" — nothing does; say only that you ran it locally and how.
