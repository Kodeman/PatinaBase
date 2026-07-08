---
name: patina-verification
description: Use before claiming any Patina change is done, fixed, or passing — before committing, merging, or reporting completion. Use when deciding which command actually gates a given app/package/service (type-check vs build vs test vs lint), or when a green signal looks suspicious — a UI renders data, a suite reports pass, a CI badge is green, or a migration ledger shows a row.
---
# Patina Verification

Last verified: 2026-07-08 (main @ 593876c1, migrations head 00284). Re-verify load-bearing claims if the repo has moved.

## Use when / Don't use when
- USE when: about to claim a change is done/fixed/passing; picking which command actually gates a target (type-check vs build vs test vs lint) before running it; a signal looks too good (UI shows data, a suite says pass, a CI badge is green, a migration ledger has a row) and you need to know whether to trust it.
- DON'T use for: writing or fixing test code itself (patina-testing); authoring migrations (patina-db-migrations) or edge functions (patina-edge-functions); local stack bring-up (patina-local-dev); prod cron/Vault/deploy-freshness playbooks (patina-prod-ops, patina-deploy); Stripe object-state semantics (patina-stripe-payments); iOS builds (patina-ios-verification).
- Boundary: this skill tells you which command is the real gate and how green signals lie in this repo. It does not teach you to write a good test (patina-testing) or drive the running app to observe behavior (this repo's `verify` skill).

## Procedure
1. **Get the target's real gate from the matrix below before running anything.** Script names lie here: a `type-check` script that doesn't exist, a `lint` script with no resolvable config, a `build` that swallows type errors.
2. **Run the narrowest command that exercises your change.** `pnpm --filter <pkg> <task>` for one workspace, or a single test/spec file (patina-testing has the exact forms). Save root `pnpm build|test|type-check` (turbo fan-out) for a final sweep.
3. **Know turbo's silent-skip behavior.** `turbo run <task>` (i.e. root `pnpm build/test/lint/type-check`) only runs a task in workspaces that define that script — for everyone else it exits 0 having done nothing, no warning. Confirmed gaps today: `type-check` is silently skipped for `@patina/orders`, `@patina/media`, `@patina/projects` (none has a `type-check` script — see the correction below); `test` is silently skipped for `@patina/types`, `@patina/shared`, `@patina/catalog-ui`, and `@patina/manufacturer-portal` (none has a `test` script). A green root sweep proves nothing about those. `pnpm --filter <pkg> <task>` is the opposite failure mode: it errors "Missing script" when that one package lacks the task — louder, safer.
4. **Don't trust `pnpm lint` outside designer-portal** — see Lint reality.
5. **Don't trust the docker-publish Actions badge at all** — see CI reality.
6. **Check the false-green traps** for whatever surface you touched before reporting anything.
7. **For any DB-shaped claim, SELECT the row or call the RPC** — don't infer state from a UI render or a migration ledger. Local: `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres"`, or the Supabase MCP `execute_sql` tool.
8. **Report exact results**: command run, verbatim outcome, explicit list of what you did not verify. "Not tested" is a fine thing to say; a guess dressed as a result is not.

### Central verification matrix
| Package | Real type gate | Lint | Unit tests | E2E / other |
|---|---|---|---|---|
| `designer-portal` | `type-check` (`tsc --noEmit`) — `build` is **not** a gate (`next.config.js` sets `typescript.ignoreBuildErrors:true`) | `lint` — own flat `eslint.config.mjs`, the one config in the repo that actually works | `test` (jest via `next/jest`) | `test:e2e` (playwright, 3 projects: chromium/firefox/webkit) |
| `admin-portal` | **`build`** (`next build`) — no `ignoreBuildErrors`, `typedRoutes:true` — the strictest gate in the repo | `lint` (`next lint`); no resolvable config anywhere — see Lint reality | `test` (jest, `testEnvironmentOptions.customExportConditions:['']`) | `test:e2e` (playwright; `webServer` is `undefined` when `CI=true` — a server must already be running) |
| `client-portal` | `type-check` (`ignoreBuildErrors:true`, so `build` is **not** a gate) | `lint` (`next lint`); legacy `.eslintrc.json` only — see Lint reality | `test` (jest; **coverage floor enforced**: lines 70 / branches 60 / functions 70 / statements 70) | `test:e2e` (playwright, chromium-only, `testDir ./tests`) |
| `manufacturer-portal` | `type-check` (`tsc --noEmit`) | `lint` (`next lint`); no local config | **none** — no `test` script | **none** — no `test:e2e` script |
| `orders` | **`build`** (`nest build`) — see correction below; **no `type-check` script exists** | `lint`; **zero config files of any kind** | `test` (jest, root `jest.config.cjs`, `testRegex '.*\.spec\.ts$'`) | `test:e2e` (`jest-e2e.json`, `testRegex '.e2e-spec.ts$'`) — silently excludes one spec, see traps |
| `media` | same as `orders` | `lint`; legacy `.eslintrc.js` only | `test` (same base config) | `test:e2e` script exists but `test/jest-e2e.json` is **missing** — fails immediately, see traps |
| `projects` | same as `orders` | `lint`; legacy `.eslintrc.js` only | `test` (same); **89 tracked `.js` files shadow same-named `.ts` in `src/`**, see traps | `test:e2e` works correctly — 4 specs, all named right |
| `@patina/supabase` | `type-check` (`tsc --noEmit`) | `lint` (`eslint src/`); no flat config — treat as unverified | `test` (`vitest run`) | — |
| `@patina/design-system` | `type-check` (`tsc --noEmit`) | `lint`; no flat config — treat as unverified | `test` (`vitest run`); Storybook on `:6006` (`pnpm --filter @patina/design-system storybook`) is a visual sanity tool, not a pass/fail gate | — |
| `types` / `shared` / `catalog-ui` | `type-check` | `lint`; no flat config | **none** — no `test` script, silently skipped by root `pnpm test` | — |

Edge functions (`supabase/functions/*`, Deno, no `package.json`): `deno test --allow-all --config supabase/functions/deno.json <path>` for pure-logic suites; integration needs the live local stack. Full treatment: patina-edge-functions.
DB (`supabase/tests/**`): plain `psql` scripts with `ON_ERROR_STOP=1` asserts, not a JS runner. Full treatment: patina-db-migrations.

**Correction — the services' real type gate.** None of `orders`/`media`/`projects` has a `type-check` script; grep the matrix again if that's surprising, it isn't there. Their real type gate is **`pnpm --filter <svc> build`** (`nest build`). All three use NestJS's default `tsc` builder (none sets `builder:"swc"` in `nest-cli.json`), and that builder genuinely fails hard: it runs `program.emit()`, collects `getPreEmitDiagnostics`, and calls `process.exit(1)` on any diagnostic — confirmed by reading `@nestjs/cli`'s `lib/compiler/compiler.js` directly. So, unlike the Next.js portals, **`nest build` is a real, strict type gate**, not a build that hides errors. Ignore `services/orders/nest-cli.json`'s `"typeCheck": false` — that flag only affects the `swc` builder; with the default `tsc` builder it is a documented no-op (`@nestjs/cli`'s own `build.action.js` warns exactly this when it would matter). For a `--noEmit`-only check with no `dist/` output, run `npx tsc --noEmit -p services/<svc>/tsconfig.json` directly — no script wraps this.

### Lint reality
`apps/designer-portal/eslint.config.mjs` is the **only** flat ESLint config file (`eslint.config.{js,mjs,cjs}`) anywhere in this repo — confirmed by an exhaustive search. Everything else resolves to nothing:
- `orders` — no ESLint config file of any kind, not even legacy.
- `media`, `projects` — legacy `.eslintrc.js` only; both pin `eslint ^9`.
- `client-portal` — legacy `.eslintrc.json` only; pins `eslint ^9`; `lint` script is `next lint`.
- `admin-portal` — no config file at all; its `next.config.js` claims ESLint "will still run... using the root `eslint.config.js`" — **that file does not exist** in this repo. `admin-portal` also pins `eslint ^8.57.0`, not 9, unlike every other package.

ESLint 9 resolves flat config only by default; legacy `.eslintrc*` needs `ESLINT_USE_FLAT_CONFIG=false`, which is **not set anywhere in this repo** (grepped). So `media`/`projects`/`client-portal`'s legacy configs are as unreachable via plain `eslint` as `orders`' total absence. Whether `next lint` specifically (client-portal, admin-portal) fails loudly, no-ops, or auto-scaffolds a default depends on the installed Next/ESLint fallback behavior, which was not executed to confirm — treat their `pnpm lint` output as **unverified**, not working. Bottom line: don't spend time "fixing lint" outside designer-portal unless explicitly asked, and don't read a pass (or silence) from any other package's lint as meaningful.

Formatting is a narrower story than lint: there is no root `.prettierrc`/`prettier.config.*`, so root `pnpm format`/`format:check` applies plain Prettier defaults repo-wide — **except** `services/media/.prettierrc` and `services/projects/.prettierrc` (identical: `singleQuote`, `trailingComma:"all"`, `printWidth:100`, `tabWidth:2`, `semi:true`), which Prettier auto-discovers per file, so those two service trees format differently from everywhere else including `orders`. `format` is a plain script, not a turbo task (absent from `turbo.json`), so it always runs repo-wide regardless of `--filter`.

### CI reality
No CI gate exists. `.github/workflows/docker-publish.yml` triggers on push to `main` (path-filtered) plus manual `workflow_dispatch` — it has no `pull_request` trigger at all. **The last 40 consecutive runs on `main` (2026-06-24 → 2026-07-08, via `gh run list`) all show `conclusion: failure`**, and commits keep merging to `main` regardless — the badge blocks nothing. `extension-beta.yml` / `extension-cws.yml` are tag-triggered only (`extension-beta-v*` / `extension-v*`) — ordinary pushes and PRs never run them. Nothing in this repo runs tests, type-check, or lint on push or PR. Local verification is the only verification; a green or red Actions badge carries no signal.

### False-green traps
1. **Designer-portal mock fallback.** `apps/designer-portal/src/lib/mock-data.ts`'s `withMockData()` tries the live call and, on **any thrown error** (500, RLS denial, network failure — anything), silently returns mock data, only `console.warn`ing outside production. Controlled by `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE` (default `auto`); `=live` disables the fallback and rethrows instead. Proof of liveness: rerun with `=live`, or SELECT the row you just created, or watch the network call actually return your fresh data. (Full treatment: patina-portal-features, patina-local-dev.)
2. **Stray compiled `.js` in service `src/`, concentrated in `projects`.** The shared `jest.config.cjs` sets `moduleFileExtensions:['js','json','ts']` — `.js` resolves before `.ts`. Verified counts of tracked, non-gitignored compiled artifacts sitting in `src/`: `orders` 17 (11 `.js` + 6 `.d.ts`), `media` 18 (11 `.js` + 7 `.d.ts`), `projects` 284 (100 `.js` + 95 `.d.ts` + 89 `.js.map`). What matters is same-name collisions, not raw counts: **`orders` and `media` have zero** `.js` files shadowing an identically-named `.ts`, but **`projects` has 89** (e.g. `analytics/analytics.controller.{ts,js,d.ts}` all committed together) — those 89 modules will silently `require()` stale compiled output instead of your fresh edit. Check before trusting a green `projects` test that touches a file you edited:
   ```bash
   f=services/projects/src/path/to/file.ts; test -f "${f%.ts}.js" && echo "SHADOWED — stale .js wins over your edit"
   ```
3. **`orders`' Stripe e2e never runs.** `test/integration/stripe-checkout.e2e.spec.ts` — note the **dot** before `spec` — does not match `test/jest-e2e.json`'s `testRegex ".e2e-spec.ts$"`, which requires a **hyphen**. `pnpm --filter @patina/orders test:e2e` reports success while silently never collecting this file. Cross-ref patina-stripe-payments, patina-testing.
4. **`media`'s `test:e2e` isn't gapped, it's absent.** `services/media/test/jest-e2e.json` does not exist (the sibling services each have one). `pnpm --filter @patina/media test:e2e` fails immediately with a missing-config error — at least that's loud, not silent. Don't assume media has working e2e coverage just because the `test:e2e` script name exists in `package.json`. (`projects`' e2e config is correct and its 4 specs are named right — that one genuinely works.)
5. **Ledgers lie.** `pg_cron.job_run_details.status = 'succeeded'` means the scheduled SQL (usually `net.http_post(...)`) was successfully enqueued, not that the target responded 2xx — the real answer lives in `net._http_response`. Similarly, a migrations ledger row doesn't prove a migration applied cleanly (a raw-`psql` apply can bypass it). Probe the object or behavior directly. (Full treatment: patina-prod-ops, patina-db-migrations.)
6. **Prod `/version` reflects the build environment, not the deploy.** `apps/designer-portal/src/app/api/version/route.ts` reads `process.env.APP_VERSION`/`BUILD_SHA`/`BUILD_TIME`/`APP_NAME` with fallbacks (`'0.0.0'`, `'unknown'`, `null`); its own comment says these are "set as Docker ENV in the runner stage." On the live Cloudflare Workers path, neither `infra/deploy-portal.sh` nor the portal's `wrangler.jsonc` `vars` block sets any of the four — confirmed by reading both directly. So hitting `/api/version` in prod today returns the fallback defaults, not real build info. It is **not** a deploy-freshness signal; verify deploys per patina-deploy instead.

### Minimum bar by change type
- **(a) Shared package edit** (`packages/*`): build the package, then `type-check` every consuming portal/service, then `pnpm --filter @patina/admin-portal build` (the repo's strictest gate). A stale compiled `dist/` is a known incident class — CLAUDE.md documents `@patina/utils` shipping `TypeError: proposalTierVisibility is not a function` to prod because a raw OpenNext build bypassed Turborepo's `^build` graph and bundled a pre-existing `dist/`. Always deploy through `infra/deploy-portal.sh`, never a raw `opennextjs-cloudflare build`.
- **(b) Portal feature**: `type-check` (or `build` for admin-portal, the real gate there) + the narrowest relevant unit/e2e spec + a live-data render check (`=live` mode where the mock fallback applies).
- **(c) Service edit** (`orders`/`media`/`projects`): `pnpm --filter <svc> build` (the real type gate — see correction above) + the narrowest `*.spec.ts`; if you touched `services/projects/src`, check for a shadowing `.js` sibling first.
- **(d) Migration**: `supabase db reset` + relevant `supabase/tests/**` + a `database.types.ts` diff — full recipe in patina-db-migrations.
- **(e) Edge function**: `deno test` + `supabase functions serve` + a live curl — full recipe in patina-edge-functions.

## Commands
```bash
# Narrowest first: one workspace, one task
pnpm --filter @patina/designer-portal type-check          # ~15-40s
pnpm --filter @patina/admin-portal build                   # ~1-3min — THE real admin gate
pnpm --filter @patina/orders build                          # nest build — THE real services gate; fails on type errors
npx tsc --noEmit -p services/orders/tsconfig.json            # noEmit-only check; no script wraps this

# Root sweeps (turbo fan-out) — remember the silent-skip list above before trusting these
pnpm type-check   # silently skips orders/media/projects (no script) — NOT proof they type-check
pnpm test         # silently skips types/shared/catalog-ui/manufacturer-portal (no script)
pnpm build

# CI history — confirms the badge is not a gate (read-only)
gh run list --workflow=docker-publish.yml --limit 10 --json conclusion,createdAt

# DB is the authority for data claims — SELECT the row you claim exists, don't infer from the UI
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select ..."
```

## Quality bar
- The command you ran is the one that actually gates that target — checked against the matrix, not assumed from a script name.
- A "green" result outside designer-portal's lint, or from any root turbo sweep, was checked against the silent-skip list first.
- Every data claim ("this row exists," "this status flipped") is backed by a SELECT/RPC call or the Supabase MCP `execute_sql`, not a UI screenshot alone.
- Live-data paths were checked with fallback/mock modes disabled where they exist (`DATA_MODE=live`).
- The report states runtime/output actually observed, plus an explicit list of what was not verified.

## Verification checklist
- [ ] Confirmed the real gate for this target from the matrix (not the first plausible-sounding script name).
- [ ] Ran the narrowest command first; read its actual output, not just the exit code.
- [ ] If using a root `pnpm build/test/type-check` sweep: cross-checked it against the silent-skip list.
- [ ] If the target was orders/media/projects: used `build`, not a nonexistent `type-check` script.
- [ ] If the target touched `services/projects/src`: checked for a shadowing `.js` sibling.
- [ ] If claiming live/DB-backed behavior: SELECTed the row or called the RPC directly.
- [ ] If a portal is on `auto` data mode: re-checked (or reasoned explicitly) with `=live` before trusting rendered data.
- [ ] Did not treat the docker-publish Actions badge, any non-designer-portal lint result, or a migration ledger row as proof of anything.

## Report back
State exactly which command(s) you ran, against which package/service, and the real output — pass/fail counts or error text, not a paraphrase. If you used a root turbo sweep, name which workspaces it silently skipped for that task. If you verified a data claim, show the SELECT/RPC and its result, not just "it works in the UI." Explicitly list what you did **not** verify: gates you didn't run, browsers/OSes not covered, prod not touched, lint not trusted. Never report a package's lint as "clean" outside designer-portal without saying you couldn't confirm its config resolves. If anything here contradicted what you expected going in (e.g. a `type-check` script you assumed existed), say so — don't quietly paper over it.
