# Deploy runbook — designer portal, "The Life Review" (Q04 CSS gate + hover wash)

This is a Kody-run deploy. Agents are hook-blocked from running `deploy-life.sh`
and from any Bash command that names it or invokes `wrangler` — that block is
intentional (same policy that guards `deploy-a.sh`). This document exists so
Kody can run the deploy without re-deriving any of the reasoning below.

## The one-line invocation

Run from the repo root, on `main`, after the PR merges:

```
bash artifacts/document-life-directions-2026-08-28/build/deploy-life.sh
```

## Preconditions

1. **The PR is merged to `main`.** In particular, `src/lib/document/__tests__/shadow-gate.test.ts`
   must exist on `main` — as of this writing it exists only in the unmerged
   `document-life/*` worktree branches (`agent-life-ffe`, `agent-life-foundation`,
   `agent-life-document`, `agent-life-integration`, `agent-life-desk`). The
   script's gate step will fail loudly (jest: "no tests found") if run before
   the merge — that failure is correct behavior, not a bug in the script.
2. **You are on `main`, checked out from the canonical repo location** — not a
   worktree under `.codex/worktrees/` or similar. The script refuses to run
   from a worktree path.
3. **`main` is in sync with `origin/main`** — no staged changes, no dirty
   `apps/`/`packages/` tree, not ahead or behind origin. The script fetches and
   checks this itself and refuses otherwise; if it refuses, `git pull
   --ff-only` (or resolve whatever local divergence it reports) and re-run.
4. **`wrangler` is authenticated as you.** Check with:
   ```
   npx wrangler whoami
   ```
   If that doesn't show your Cloudflare account, run `npx wrangler login`
   first. The script does not check this itself — a deploy step failing on
   auth is self-evident, but confirming first saves a false-start.
5. **Nothing else is deploying the designer portal concurrently.** This
   program's own record (`artifacts/document-life-directions-2026-08-28/`)
   should be the only pending designer-portal change.

## What the script does, step by step

1. **Preflight (git state).** Refuses to run from a worktree; refuses if not
   on `main`; refuses if the index has staged changes or `apps/`/`packages/`
   has uncommitted changes; fetches `origin` and refuses unless
   `git status -sb` reads exactly `## main...origin/main` (not ahead, not
   behind). Prints the commit SHA it's about to deploy and the parent SHA
   (the rollback target if this deploy needs to be reverted at the source
   level).

2. **Resolve env from `wrangler.jsonc`, not hand-pasted exports.** This is the
   direct lesson of the 2026-08-26 incident (below): a Node script (inlined in
   `deploy-life.sh`, no separate file) strips JSONC comments, parses
   `apps/designer-portal/wrangler.jsonc`'s **top-level** `vars` block only
   (never an `env.*.vars` sub-block, so a staging value can never leak into a
   production export), and `export`s every `NEXT_PUBLIC_*` key found there
   verbatim. It then refuses to proceed if `NEXT_PUBLIC_SUPABASE_URL` or
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` is empty, if the URL points at
   `127.0.0.1`/`localhost`, or if any resolved value contains an unresolved
   placeholder marker (`<` or `value>`). Resolved values print to the log —
   anything named `*KEY*`/`*SECRET*`/`*TOKEN*` prints only its first 8
   characters plus a length, so no secret is ever echoed in full (the anon key
   is client-side by design, but there's no reason to paste the whole thing
   into a log either).

3. **Gates.** Runs, from the repo root:
   ```
   pnpm --filter @patina/designer-portal type-check
   pnpm --filter @patina/designer-portal test -- \
     src/lib/document/__tests__/shadow-gate.test.ts \
     src/lib/document/__tests__/contrast.test.ts
   ```
   `shadow-gate.test.ts` is the Q04 CSS gate — it enforces the D4 "zero
   shadow" rule at the CSS level (ESLint's `no-restricted-syntax` D4 block in
   `eslint.config.mjs` only covers `.ts`/`.tsx`, not `globals.css`, so a raw
   `box-shadow` written directly into CSS has no other linter watching it;
   this test is that missing coverage — it asserts elevation is expressed only
   via the `--elevation-sheet` token, never a raw `box-shadow` declaration).
   `contrast.test.ts` is the pre-existing F56 guard (WCAG AA on every `-ink`
   token). Both must pass before anything is built or deployed.

4. **Record the rollback target.** Runs `npx wrangler deployments list --name
   patina-designer-portal`, keeps the last 25 lines, and writes them to
   `build/deploy-life-before.txt`. The list is oldest-first, so **the bottom
   row is the currently-live version** — that row's version id is the one to
   roll back to if this deploy goes wrong. The script also tries to
   auto-parse that id for the rollback command it prints on failure.

5. **Deploy.** Runs `./infra/deploy-portal.sh designer` — the only correct
   deploy path (it rebuilds workspace-package dists first via Turborepo, so a
   stale dist can never ship; see that script's own header for the incident
   that made it necessary). Nothing here calls `opennextjs-cloudflare build`
   or `wrangler deploy` directly.

6. **Verify.** Waits 8s for edge propagation, then:
   - Re-runs `wrangler deployments list`, keeps the last 8 lines, writes them
     to `build/deploy-life-after.txt` (bottom row = the new live version).
   - `GET https://app.patina.cloud/desk` (no redirect-follow) — expects `200`
     or `307` (the unauthenticated auth-redirect).
   - Follows redirects on the same URL, pulls every `/_next/static/css/*.css`
     reference out of the served HTML, fetches each one, and greps the
     combined CSS for:
     - `--elevation-sheet` — must be **present** (proves the shadow-gate's
       token, not a raw shadow, is what's actually live).
     - `--doc-rail-stock` — must be **present** (proves the new bundle is
       live at all, not a stale cached one).
     - `folio-face` — must be **absent** (the dead selector this program
       removed; its reappearance would mean a stale or wrong build shipped).
   - `GET https://app.patina.cloud/api/version` — liveness only. Per
     AGENTS.md, `/version` returns static defaults on the live path, so a
     version *string* proves nothing; this probe only confirms the route
     answers with a 2xx.
   - Prints PASS/FAIL per probe. On any FAIL: exits non-zero and prints the
     rollback instruction — checkout the parent commit of the deployed SHA in
     a worktree and re-run this script, or roll the Worker back directly with
     `npx wrangler rollback <before-version-id> --name patina-designer-portal
     --yes` (before-version id read from `build/deploy-life-before.txt` if it
     wasn't auto-captured).

## The incident this script is built against

At 2026-08-26T19:49:14Z a hand-pasted `export NEXT_PUBLIC_SUPABASE_ANON_KEY=...`
command carried literal placeholder text instead of a real secret. `next
build` inlined that placeholder into the client bundle that shipped to
`app.patina.cloud` (version `0d66c4a2-0c2b-472c-a2fe-e57ae6014068`). It was
rolled back one minute later (19:50:51Z) to
`d9a307bd-11ee-4c32-99a3-268e6cb11388`. Full record:
`docs/design/the-document/DECISIONS.md` entry `I150-deploy`, and
`artifacts/document-wayfinding-directions-2026-08-25/build/deploy-1.md`. The
rule this script exists to enforce: **no value in a deploy command is ever
hand-pasted or left as a placeholder** — every value is either a literal in
this file or resolved by the script itself from the committed, reviewed
`wrangler.jsonc`.

## Why the GitHub Actions deploy workflow isn't used

Plainly: it isn't ready, so this script exists instead.

- `.github/workflows/integration.yml` (DB reset, SQL tests, edge-function
  tests, portal e2e) is `workflow_dispatch`/`workflow_call`/nightly-cron only
  — it does not run on pull requests, and its nightly cron has been **red
  since 2026-08-23**. It is not a trustworthy gate right now.
- `.github/workflows/deploy-production.yml` is `workflow_dispatch`-only —
  merging to `main` never triggers a deploy, and (per repo history at the
  time of writing) it has **never been run**. There is no evidence it works
  end-to-end against this repo's current shape.
- `ai-quality-gate.yml` and `policy-quality.yml` do run on every PR, but they
  cover policy checks and an affected build/type/lint/test pass — not a
  production deploy, and not the shipped-bundle verification (chunk greps,
  live probes) this runbook depends on.

Until `deploy-production.yml` has a proven run and `integration.yml`'s nightly
is green again, a manual, Kody-run script with its own pre- and post-deploy
verification is the more trustworthy path — the same reasoning that produced
`deploy-a.sh` for the Wayfinding program's deploy on 2026-08-26.

## Rollback recipe (quick reference)

If `deploy-life.sh` reports FAIL, or a problem surfaces later:

```
cd apps/designer-portal
npx wrangler rollback <before-version-id> --name patina-designer-portal --yes
```

`<before-version-id>` is the bottom-row version id from
`build/deploy-life-before.txt` (captured automatically by the script before it
deployed) — the version that was live immediately before this deploy ran.
Rollback of the Worker bundle is independent of the git history; you do not
need to revert the merge commit to roll back what's served, though you should
still do so before re-attempting the deploy (checkout the parent commit
printed in the script's preflight/failure output, in a worktree, and re-run
`deploy-life.sh` from there once ready).
