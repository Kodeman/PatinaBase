# Verification gates + deploy recipe — designer-portal (recon for "project arrival" ship)

Scope: this is the VERIFICATION GATES / DEPLOY RECIPE slice of the arrival-mockup recon. Read-only; no commands executed that mutate git, DB, or infra. All commands below are exact and copy-pasteable with absolute paths; none were run in this session — durations/behavior are carried from the cited skills/worked example, not freshly measured.

## (a) The real gates for designer-portal

Source: `.claude/skills/patina-verification/SKILL.md:27` (verification matrix row for `designer-portal`), cross-checked against `apps/designer-portal/package.json:6-25`.

| Gate | Command | Notes / expected duration |
|---|---|---|
| Type | `pnpm --filter @patina/designer-portal type-check` | `tsc --noEmit` — patina-verification:78 gives ~15–40s. **This is the real gate, not `build`**: `next.config.js` sets `typescript.ignoreBuildErrors: true` (patina-verification:27, patina-deploy:44), so a broken type sails through `pnpm --filter @patina/designer-portal build`. |
| Lint | `pnpm --filter @patina/designer-portal lint` | `eslint .` against `apps/designer-portal/eslint.config.mjs` — the **only** flat ESLint config anywhere in the repo that actually resolves (patina-verification:44-50). This is the one package where a lint pass means something; not verified for duration. |
| Unit | `pnpm --filter @patina/designer-portal test` | `jest` via `next/jest` (config: `apps/designer-portal/jest.config.js:1-88`). Duration not measured this session. |
| E2E | `pnpm --filter @patina/designer-portal test:e2e` | `playwright test`, 3 browser projects (chromium/firefox/webkit) per `playwright.config.ts:54-68`. Full 3-browser run is comparatively slow; no measured number in-repo — patina-testing recommends running the single narrowest spec first (below) rather than the full suite while iterating. |

Single-file forms (worked, from `.claude/skills/patina-testing/SKILL.md:67-71`, path existence confirmed this session):
```bash
# Unit — single file
pnpm --filter @patina/designer-portal test -- /Users/kody/Code/patina-merged/apps/designer-portal/src/components/portal/ffe/__tests__/stage-select.test.tsx

# E2E — single spec, all 3 browser projects
pnpm --filter @patina/designer-portal test:e2e -- /Users/kody/Code/patina-merged/apps/designer-portal/e2e/proposals/proposal-client-decline.spec.ts
```
(`e2e/proposals/proposal-build.spec.ts`, named in the computed task, does **not exist** — confirmed by `find`; `proposal-client-decline.spec.ts` does and is the real analog.)

## (b) Playwright's webServer — how it launches and what env it needs

`apps/designer-portal/playwright.config.ts:91-124`. Verbatim mechanics:
- `webServer.command: 'pnpm dev'` — resolves to `next dev --webpack -p 3000` (`package.json:10`). Playwright boots its **own** dev server (not `next build && next start`) unless one is already listening.
- `url: 'http://localhost:3000'`, `reuseExistingServer: !process.env.CI`, `timeout: 120_000`.
- `webServer.env` is merged over `process.env` and **pins**, verbatim:
  - `NEXT_PUBLIC_FLAG_OVERRIDES: 'procurement-workspace-pilot:true,the-document-pilot:true,client-invite-letter:true'`
  - `NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321'`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET` — all local Supabase CLI demo/default values (verbatim literals in the config file; not secrets — same values `supabase status` prints).
- Before Playwright merges its own env, the config's top-of-file `loadEnvFile('.env.local')` / `loadEnvFile('.env')` (lines 6-23) preload the app's dotenv files into `process.env` — **but** the pinned `webServer.env` block above wins for anything it names, specifically to stop a prod-pointed `.env.local` (documented history — comment at lines 106-115) from leaking into the Playwright-driven server. This is the mechanism patina-testing's Trap 3 (`.claude/skills/patina-testing/SKILL.md:57-61`) describes: **a reused, already-running dev server started without these vars serves flag-gated UI off** — kill it and let Playwright boot its own, or restart `pnpm dev` exporting the same `NEXT_PUBLIC_FLAG_OVERRIDES`.
- Playwright's server needs local Supabase **started and reset/seeded** first (`pnpm supabase:start && supabase db reset`, per the config's own top comment) — it does not start Supabase itself.

An arrival flag added to the arrival flow's own spec must be added to this `webServer.env` block, not just `.env.local` (Trap 3, second failure shape).

## (c) Local rendered-verification recipe under agent load

Confirmed in-repo:
- `package.json:13`: `"build": "next build --webpack"` — **`--webpack` is already the committed flag**, not something to add. `"start": "next start"` (no `-p`, defaults to 3000).
- `next.config.js:575` has a `webpack:` config-mutation function present, consistent with `--webpack` being load-bearing (this app is not on Turbopack).
- Next version pinned `~16.2.6` (`package.json:68`).
- The "cannot serve under agent load" claim is a real, previously-hit memory entry, not folklore invented for this task: `feedback_multiwave_workflow_coordination_2026_09_09.md:21-22` — *"`next dev` cannot serve either portal on this Mac under agent load (Watchpack EMFILE, 404 on every route, ulimit already 1048576). Render via `next build --webpack && next start -p <port>`"*. Same recipe repeated in `project_portal_polish_build_2026_09_08.md:92`.

Recipe (LOCAL Supabase target — never run destructively against a URL that isn't 127.0.0.1):
```bash
# 1. Confirm the portal is pointed LOCAL before anything destructive (patina-local-dev:44-49)
grep NEXT_PUBLIC_SUPABASE_URL /Users/kody/Code/patina-merged/apps/designer-portal/.env.local
# want: 127.0.0.1:54321 (or localhost). *.supabase.co = Strata PROD — STOP.

# 2. Free the port (kills an orphaned next dev from a prior session)
lsof -ti :3000 | xargs kill 2>/dev/null; lsof -ti :3000   # expect no output

# 3. Local prod-mode build + serve (the agent-load-safe path)
cd /Users/kody/Code/patina-merged && \
  pnpm --filter @patina/designer-portal build && \
  pnpm --filter @patina/designer-portal start -- -p 3000
```
Env needed for step 3 to hit local Supabase (same trio Playwright pins, sourced from `apps/designer-portal/.env.local` / `supabase status` — do not export prod values here):
```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<local anon key from `supabase status`>
SUPABASE_SERVICE_ROLE_KEY=<local service-role key from `supabase status`>
```
Caveats confirmed in-repo, not this session's own measurement:
- Never run `build`/`start` while `next dev` is live on the same app — they share `.next` and corrupt it (`patina-local-dev` skill, "Common mistakes" table; recovery is `rm -rf apps/<app>/.next`).
- A local prod build served this way has been observed to CSP-block `http://127.0.0.1` storage images (dev-only allowance) — per the same memory entry, "a plate that doesn't paint locally is not a prod defect."
- The arrival flag override for this recipe: `NEXT_PUBLIC_FLAG_OVERRIDES='<flag>:true'` in `.env.local`, restart required (`NEXT_PUBLIC_*` is inlined at start, patina-local-dev:60-63); or a real PostHog local key.

## (d) Deploy invocation — reading the Supabase trio from wrangler.jsonc programmatically

Confirmed: `apps/designer-portal/wrangler.jsonc:26-28,67` — the production `vars` block declares `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_STORAGE_KEY`, and `SUPABASE_ORIGIN_RUNTIME` (all four present in production).

`infra/deploy-portal.sh` **already does exactly this resolution itself**, internally: Phase 0 (lines 79-269) resolves and validates the trio (exported value wins, else `.env.production.local` > `.env.local` > `.env.production` > `.env`, else empty → fail-closed if empty or local-pointed); Phase 0b (lines 271-516) parses `wrangler.jsonc` with a string-aware JSONC-comment stripper (`deploy-portal.sh:332-387`) and exports every other `NEXT_PUBLIC_*` the target env declares, using the **committed literal as the default** and an exported value as an override. So the script does not strictly require you to pre-export the trio — but it resolves the trio from `.env.local` if nothing is exported, and a stale/local-pointed `.env.local` (a documented incident: comment at lines 61-71, "Deploy d8f8f1be") will make Phase 0 either fail (empty) or refuse (local-pointed). The safe, explicit, worked pattern — confirmed against a real deploy report (`artifacts/return-teaching-2026-09-25/build/deploy-report.md:236-257`) — is to export the trio (+`SUPABASE_ORIGIN_RUNTIME` for designer, which carries the D-repoint carve-out) yourself, from the wrangler.jsonc literals, in the same shell as the script call:

```bash
eval "$(node -e '
const fs = require("fs");
const src = fs.readFileSync("/Users/kody/Code/patina-merged/apps/designer-portal/wrangler.jsonc", "utf8");
let out = "", i = 0;
while (i < src.length) {
  const c = src[i];
  if (c === "\"") { out += c; i++; while (i < src.length) { if (src[i] === "\\") { out += src.slice(i, i + 2); i += 2; continue; } out += src[i]; i++; if (src[i - 1] === "\"") break; } continue; }
  if (c === "/" && src[i + 1] === "/") { while (i < src.length && src[i] !== "\n") i++; continue; }
  if (c === "/" && src[i + 1] === "*") { i += 2; while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++; i += 2; continue; }
  if (c === "}" || c === "]") { out = out.replace(/,\s*$/, ""); out += c; i++; continue; }
  out += c; i++;
}
const cfg = JSON.parse(out);
const keys = ["NEXT_PUBLIC_SUPABASE_URL","NEXT_PUBLIC_SUPABASE_ANON_KEY","NEXT_PUBLIC_SUPABASE_STORAGE_KEY","SUPABASE_ORIGIN_RUNTIME"];
for (const k of keys) { if (cfg.vars && cfg.vars[k] !== undefined) process.stdout.write("export " + k + "=" + JSON.stringify(String(cfg.vars[k])) + "\n"); }
')" && /Users/kody/Code/patina-merged/infra/deploy-portal.sh designer
```

**On `PATINA_ALLOW_LOCAL_PROD_DEPLOY` — this variable does not exist in this repo.** Grepped exhaustively (`grep -rn "PATINA_ALLOW_LOCAL_PROD_DEPLOY" scripts/hooks/`, and repo-wide for `.mjs/.js/.sh/.ts/.json`): the **only** hit anywhere is a comment in a one-off historical script, `artifacts/field-companion-w4-2026-09-01/deploy-designer-w4.sh:8-13`, which itself says *"agent-driven prod mutations are hook-blocked (`scripts/hooks/core.mjs` manual-production-approval)... or from an agent session launched with `PATINA_ALLOW_LOCAL_PROD_DEPLOY=1`"* — but no function or check named `manual-production-approval` exists in `scripts/hooks/core.mjs` (1260 lines, read in full for deploy-related logic), and no code anywhere reads that env var. The actual PreToolUse hook (`scripts/hooks/patina-hooks.mjs`, wired in `.claude/settings.json:79-86` as `agent PreToolUse` on every Bash call) is built from `core.mjs`'s `blocking: true` findings, and none of them target `deploy-portal.sh` or `wrangler deploy`: the blocking checks are `retired-production-path` (dead retired-box/GHCR scripts, `core.mjs:7-11,481-493`), `raw-portal-build` (a bare `opennextjs-cloudflare build`, `core.mjs:495-505`), `selective-dev` (bare `pnpm dev`, `core.mjs:469-479`), `explicit-git-paths` (`git add -A`), and `local-db-target` (a DB reset/seed while the portal's Supabase URL isn't local, `core.mjs:507-519`). A correctly-formed `deploy-portal.sh designer` / `wrangler deploy` call is **not** in that blocklist and needs no override env var to run under this hook. The one place `PATINA_PRODUCTION_DEPLOY=1` (a different name) is checked is `executeDeployPlan()` (`core.mjs:1218-1230`), which additionally requires `GITHUB_ACTIONS=true` — that gates a CI-only automated deploy-plan runner, an unrelated code path, not a manual Bash-tool deploy invocation. **Conclusion: no env-var override is needed or exists for a manual `deploy-portal.sh` run; the actual gate is procedural** — `patina-deploy`'s GATE section (`.claude/skills/patina-deploy/SKILL.md:15-20`): prod mutations require an explicit user request in the current session (a "ship X" ask authorizes the full migrate→functions→services→portals→verify chain without per-step re-asking).

## (e) Post-deploy verification

```bash
# 1. Deployment list — OLDEST-FIRST, read the BOTTOM row (patina-deploy:66-68,93)
npx wrangler deployments list --name patina-designer-portal

# 2. Served-chunk grep — fetch live chunks and grep for a marker + placeholder leaks.
#    Pattern confirmed against a real deploy report (return-teaching-2026-09-25/build/deploy-report.md:264-279):
#    it curled specific /_next/static/chunks/<hash>.js paths already known from the local build's
#    .open-next/assets, plus /auth/signin for the webpack runtime manifest, and grepped each for the
#    new code's marker string.
curl -s https://app.patina.cloud/auth/signin | grep -oE '/_next/static/chunks/[A-Za-z0-9._-]+\.js' | sort -u > /tmp/arrival-chunks.txt
while read -r c; do
  curl -s "https://app.patina.cloud${c}" -o /tmp/arrival-chunk.js
  if grep -q "<YOUR ARRIVAL MARKER STRING>" /tmp/arrival-chunk.js; then echo "MARKER FOUND: $c"; fi
  # placeholder-leak check — deploy-portal.sh's own Phase 2.6 chunk gate (lines 553-615) already runs
  # this class of check pre-deploy for every exported NEXT_PUBLIC_* name/value, but re-check post-deploy
  # against the LIVE bundle for the literal placeholder string that leaked in the 2026-08-26 incident:
  grep -l '<wrangler.jsonc value>' /tmp/arrival-chunk.js && echo "PLACEHOLDER LEAK: $c"
  grep -l 'undefined' /tmp/arrival-chunk.js >/dev/null && true  # "undefined" alone is too noisy (legit JS keyword); use it only as a secondary hint, not a hard fail
done < /tmp/arrival-chunks.txt

# 3. Liveness (not freshness — patina-deploy:99-100, patina-verification trap 6)
curl -s https://app.patina.cloud/api/version   # returns static 0.0.0/unknown defaults; proves nothing about freshness
```
Rollback (patina-deploy:102-103 — **no `wrangler rollback` documented in-repo**, treat as unconfirmed if you haven't verified it live this session):
```bash
# Find the previous-good version id: the row immediately ABOVE your new deploy's row in the
# (oldest-first) deployments list.
npx wrangler deployments list --name patina-designer-portal

# Evidenced rollback path = redeploy the last-good commit, not a wrangler rollback command:
git worktree add /tmp/patina-rollback <last-good-sha>
cd /tmp/patina-rollback && <export the same wrangler.jsonc trio per (d)> && ./infra/deploy-portal.sh designer
```

## (f) Single-spec invocations (chromium only for e2e)

```bash
# Jest — single spec file
pnpm --filter @patina/designer-portal test -- /Users/kody/Code/patina-merged/apps/designer-portal/src/components/portal/ffe/__tests__/stage-select.test.tsx

# Playwright — single spec, chromium project only
pnpm --filter @patina/designer-portal test:e2e -- /Users/kody/Code/patina-merged/apps/designer-portal/e2e/proposals/proposal-client-decline.spec.ts --project=chromium
```

## Not confirmed / out of scope for this angle
- No gate command was actually executed this session (recon is read-only); durations quoted are carried from `patina-verification`'s own measurements, not freshly timed.
- Whether the arrival mockup's future spec/flag will collide with any of the three flags already pinned in `playwright.config.ts:104-105` (`procurement-workspace-pilot`, `the-document-pilot`, `client-invite-letter`) was not checked — that's a build-time question for whoever wires the flag, not this recon.
- `wrangler rollback` support was not tested live; treat the redeploy-prior-commit path as the only evidenced rollback per `patina-deploy`.
- The exact marker string to grep for in step (e)/2 depends on the arrival feature's actual implementation, which is out of this angle's scope (see the sibling recon on the arrival mockup itself).
