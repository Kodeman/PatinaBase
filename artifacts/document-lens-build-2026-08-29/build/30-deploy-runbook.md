# Deploy runbook — designer portal, "The Smart Lens" (R127)

This is a Kody-run deploy. Agents are hook-blocked from running `deploy-lens.sh`
and from any Bash command that names it or invokes `wrangler` — that block is
intentional (same policy that guards `deploy-life.sh` and `deploy-a.sh`). This
document exists so Kody can run the deploy without re-deriving any of the
reasoning below.

## The one-line invocation

Run from the repo root, on `main`, after the PR merges:

```
bash artifacts/document-lens-build-2026-08-29/build/deploy-lens.sh
```

**Rehearse first.** Before the real run, do a dry run — same command, same
preconditions (on `main`, in sync with `origin/main`), but it stops before
touching production:

```
LENS_DRY_RUN=1 bash artifacts/document-lens-build-2026-08-29/build/deploy-lens.sh
```

This is Wave 6's rehearsal step. It runs phases 0–3 (preflight, wrangler-vars
resolution, gates, before-version capture) and stops with `DRY RUN OK` /
exit 0 — nothing is deployed. Only run the real command once the dry run
passes clean.

## Preconditions

1. **The PR is merged to `main`.** In particular, `useLensDensity(` must be
   called somewhere under `apps/designer-portal/src/app` (the density hook
   mounted at the page level), and `apps/designer-portal/src/app/globals.css`
   must declare `--doc-band-height` and `--doc-region-gap`. As of this
   writing none of that is true on `main` — the lens work lives only on
   unmerged `document-lens/*` branches. The script's phase-2 gate will fail
   loudly (tripwire or "no tests found") if run before the merge — that
   failure is correct behavior, not a bug in the script.
2. **You are on `main`, checked out from the canonical repo location** — not
   a worktree under `.codex/worktrees/` or similar. The script refuses to
   run from a worktree (checked two ways: `git rev-parse --git-common-dir`
   must equal `.git`, and the checkout path must not contain
   `.codex/worktrees` or `worktrees/`).
3. **`main` is in sync with `origin/main`** — no staged changes, no dirty
   `apps/`/`packages/` tree, not ahead or behind origin. The script fetches
   and checks this itself and refuses otherwise; if it refuses, `git pull
   --ff-only` (or resolve whatever local divergence it reports) and re-run.
4. **`wrangler` is authenticated as you.** Check with:
   ```
   npx wrangler whoami
   ```
   If that doesn't show your Cloudflare account, run `npx wrangler login`
   first. The script does not check this itself — a deploy step failing on
   auth is self-evident, but confirming first saves a false-start.
5. **Nothing else is deploying the designer portal concurrently.** This
   program's own record (`artifacts/document-lens-build-2026-08-29/`) should
   be the only pending designer-portal change.
6. **The pre-deploy live version is expected to be `9c0c2cdd-2041-4848-a193-93d9e8fb0b71`**
   (the version "The Life Review" shipped, per `docs/design/the-document/DECISIONS.md`
   `R126-deploy`). Phase 3 checks this and only WARNs — not fails — if it's
   different, since something else may have legitimately deployed the portal
   since this runbook was written. If it warns, confirm the live version is
   still what you expect before continuing.

## What the script does, step by step

**[0/6] Preflight (git state).** Refuses to run from a worktree; refuses if
not on `main`; refuses if the index has staged changes or `apps/`/`packages/`
has uncommitted changes; fetches `origin` and refuses unless `git status -sb`
reads exactly `## main...origin/main` (not ahead, not behind). Prints the
commit SHA it's about to deploy (`DEPLOY_SHA`) and the merge's first parent
(`PARENT_SHA` — the source-level rollback target), and writes both to
`build/deploy-lens-before.txt`.

**[1/6] Resolve env from `wrangler.jsonc`, not hand-pasted exports.** A Node
script (inlined in `deploy-lens.sh`, no separate file) strips JSONC comments,
parses `apps/designer-portal/wrangler.jsonc`'s **top-level** `vars` block only
(never an `env.*.vars` sub-block, so a staging value can never leak into a
production export), and `export`s every `NEXT_PUBLIC_*` key found there
verbatim. It then refuses to proceed if `NEXT_PUBLIC_SUPABASE_URL` or
`NEXT_PUBLIC_SUPABASE_ANON_KEY` is empty, if the URL points at
`127.0.0.1`/`localhost`, or if any resolved value contains an unresolved
placeholder marker (`<` or `value>`). Resolved values print to the log —
anything named `*KEY*`/`*SECRET*`/`*TOKEN*` prints only its first 8 characters
plus a length, so no secret is ever echoed in full.

**[2/6] Gates.** Runs, from the repo root:
```
pnpm --filter @patina/designer-portal type-check
pnpm --filter @patina/designer-portal test -- \
  src/lib/document/__tests__/shadow-gate.test.ts \
  src/lib/document/__tests__/contrast.test.ts \
  src/components/document/__tests__/lens-band.test.tsx \
  src/hooks/__tests__/use-lens-density.test.tsx \
  src/components/document/region/__tests__/use-region-fold.test.tsx
```
then three source tripwires:
- `git grep -n 'data-job-ticket\|doc-seam-height\|SEAM_HEIGHT_VAR' -- apps/designer-portal/src ':!*.test.ts' ':!*.test.tsx' ':!**/__tests__/**'`
  must find **nothing** — the retired job-ticket sentinel and seam-height
  plumbing must be entirely gone from designer-portal PRODUCT source. Test
  files are excluded by pathspec (not `-e`, which would also skip named
  matches in product code) because a sanctioned NEGATIVE assertion is allowed
  to name these strings while proving them gone — e.g. `lens-band.test.tsx`'s
  "`--doc-seam-height` reads `''`" check and the e2e
  `quiet-responsive-shell.spec.ts` computed-`''` check. A hit in a
  non-test file still fails the gate.
- `git grep -q -- '--doc-band-height'` and `--doc-region-gap` in
  `apps/designer-portal/src/app/globals.css` — the two R127 tokens must be
  declared.
- `git grep -q 'useLensDensity(' apps/designer-portal/src/app` — the density
  hook must actually be mounted, not just defined.

All must pass before anything is built or deployed.

**[3/6] Record the rollback target.** Runs `npx wrangler deployments list
--name patina-designer-portal`, appends the tail to `build/deploy-lens-before.txt`
(alongside the `DEPLOY_SHA`/`PARENT_SHA` phase 0 already wrote there), and
checks the bottom row (the currently-live version — the list is oldest-first)
against the expected `9c0c2cdd-2041-4848-a193-93d9e8fb0b71` (WARN only if
different). **`LENS_DRY_RUN=1` stops here**, prints `DRY RUN OK`, exits 0.

**[4/6] Deploy.** Runs `./infra/deploy-portal.sh designer` — the only correct
deploy path (it rebuilds workspace-package dists first via Turborepo, so a
stale dist can never ship). Nothing here calls `opennextjs-cloudflare build`
or `wrangler deploy` directly.

**[5/6] Capture the post-deploy version.** Re-runs `wrangler deployments
list`, writes the tail to `build/deploy-lens-after.txt` (bottom row = the new
live version).

**[6/6] Verify.** Waits 8s for edge propagation, then probes, signed-out-capable:
- `GET https://app.patina.cloud/desk` (no redirect-follow) — expects `307`.
- `GET https://app.patina.cloud/auth/signin` — expects `200`; its served HTML
  is where CSS/JS chunk URLs are discovered (it's the one page reliably
  servable with no session — `/desk` never returns a body, it redirects).
- Fetches every discovered `/_next/static/css/*.css` chunk and greps the
  combined CSS for `--doc-band-height`, `--doc-region-gap`,
  `--doc-landing-clear`, and `data-density` — all must be **present** (proves
  the new bundle, not a stale cached one, is live) — and for `doc-seam-height`
  — must be **absent**.
- `GET https://app.patina.cloud/api/version` — liveness only (2xx). Per
  AGENTS.md, `/version` returns static defaults on the live path, so a
  version *string* proves nothing; this only confirms the route answers.
- Fetches every discovered `/_next/static/chunks/*.js` chunk and greps for
  `data-job-ticket` — **WARN only** if found (chunks are many; this is a
  corroborating signal, not authoritative — the phase-2 source tripwire
  already proved this pre-deploy). Prints the count of JS chunks fetched.

Prints PASS/FAIL/WARN per probe. On any FAIL: exits non-zero and prints,
verbatim:
```
npx wrangler rollback 9c0c2cdd-2041-4848-a193-93d9e8fb0b71 --name patina-designer-portal --yes
```
plus the parent SHA recorded in phase 0, for checking out the pre-merge state
of `main` if you also want to revert the commit.

## What PASS looks like

Every probe line in phase 6 reads `PASS:` and the script prints:
```
==> RESULT: PASS — production looks correct.
    Live version: <new-version-id>
```
and exits 0. A `WARN:` line (pre-deploy version mismatch in phase 3, or
`data-job-ticket` seen in a JS chunk in phase 6) does not fail the run by
itself — read it, decide if it's expected, and move on.

## Record afterward

Once PASS:
1. Note the **after-version** id from `build/deploy-lens-after.txt` (bottom
   row).
2. Note every probe's PASS/FAIL/WARN line from the script's own output.
3. Write `I152-deploy` in `docs/design/the-document/DECISIONS.md` with: the
   deployed commit SHA, the before/after version ids, the probe output
   verbatim (not paraphrased), and a line marking **Kody's signed-in walk of
   a real project on prod is OWED** until the walk below is done and its
   findings recorded.

## Kody's signed-in walk (do this after PASS, on a real project)

Short and imperative — one project, three widths, the shapes this program
changed:

1. **Open a real project's document at 1440px.** Confirm the band reads at a
   declared **56px** — not taller, not collapsing/expanding as you scroll.
2. **Scroll past several regions.** Watch the **ladder rail** track your
   position — segments should light up/dim as regions cross the lens line,
   never stutter or jump.
3. **Trigger the `+N MORE` state** (scroll to a spot with more than the
   band's visible line-2 items) and **open the sheet**. Confirm it's a real
   standing sheet (not a popover), reachable by keyboard, and closing it
   returns focus to the word you opened it from.
4. **Scroll so a region opens ahead of you** (before you reach it) — confirm
   this reads as intentional (lookahead), not a glitch, and that the region
   that just passed shows **`CLOSED BY YOU`** if you'd explicitly folded it
   (not silently reopened).
5. **Resize to 1280px.** Repeat steps 1–4 at this tier — same band height,
   ladder still present in its 1280 form, room sub-rungs behave.
6. **Resize to 390px (mobile).** Open the **Margin sheet** — confirm it lists
   the ladder/sections content and the `Put down` control is the one timer
   doorway at this width.
7. Record what differed from the above (if anything) as a short note next to
   `I152-deploy` — this walk is the one piece of verification the script
   cannot do for you (everything above requires a signed-in session on real
   project data).

## The incident this script (and its predecessor) are built against

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
this file/script or resolved by the script itself from the committed,
reviewed `wrangler.jsonc`.

## Why the GitHub Actions deploy workflow isn't used

`.github/workflows/integration.yml` is `workflow_dispatch`/`workflow_call`/
nightly-cron only — it does not run on pull requests. `.github/workflows/deploy-production.yml`
is `workflow_dispatch`-only — merging to `main` never triggers a deploy.
`ai-quality-gate.yml` and `policy-quality.yml` run on every PR but cover
policy checks and an affected build/type/lint/test pass — not a production
deploy, and not the shipped-bundle verification (chunk greps, live probes)
this runbook depends on. A manual, Kody-run script with its own pre- and
post-deploy verification remains the trustworthy path.

## Rehearsal: the ship-bar server (chromium + webkit on the production build) — D-B41

The production standalone sends `Content-Security-Policy: … upgrade-insecure-requests` (`next.config.js:138-140`) and `Secure` session cookies. WebKit applies both to `localhost`, so against `http://localhost:3000` it rewrites every asset to `https:` (41 TLS failures), never hydrates, and can never sign in — see `build/triage/webkit-signin.md`. The rehearsal keeps the build exactly as it ships and fronts it with local TLS.

**One-time (Kody — writes the login keychain, not an agent action):**

```bash
mkcert -install
mkdir -p ~/.patina/tls
mkcert -cert-file ~/.patina/tls/localhost.pem -key-file ~/.patina/tls/localhost-key.pem localhost 127.0.0.1 ::1
```

**Each rehearsal:**

```bash
# 1. the standalone, exactly as the W4-int PROD run started it (build/e2e-baseline.md "W4-int PROD run")
cd apps/designer-portal && pnpm build
PORT=3000 HOSTNAME=127.0.0.1 node .next/standalone/apps/designer-portal/server.js &

# 2. the TLS front — build/tls/Caddyfile is committed, the key never is
caddy run --config artifacts/document-lens-build-2026-08-29/build/tls/Caddyfile --adapter caddyfile &

# 3. preflight — paste the output, do not paraphrase it
curl -skI https://localhost:3443/auth/signin | grep -i content-security-policy   # must show upgrade-insecure-requests
curl -sI  http://localhost:3000/auth/signin | head -1                                # the standalone behind it

# 4. the ship bar — both engines, on that server
PLAYWRIGHT_BASE_URL=https://localhost:3443 npx playwright test e2e/document --config playwright.ship-bar.config.ts --project=chromium --project=webkit
```

`build/tls/Caddyfile`:

```
localhost:3443 {
  tls /Users/kody/.patina/tls/localhost.pem /Users/kody/.patina/tls/localhost-key.pem
  reverse_proxy 127.0.0.1:3000
}
```

`playwright.ship-bar.config.ts` (W6 integration lane) — a NEW file, not an edit to `playwright.config.ts` (that file carries the local Supabase demo `service_role` JWT in its `webServer.env` block, and the pre-commit secret scan reads a changed file's full staged content, so any edit to it re-triggers the JWT finding and blocks the commit): `import base from './playwright.config'`, spreads `base`, sets `use.baseURL: process.env.PLAYWRIGHT_BASE_URL ?? base.use?.baseURL`; `ignoreHTTPSErrors` when the URL is `https:`; `webServer: undefined` unconditionally (this config only ever targets an already-running server). Every command in this section runs with `--config playwright.ship-bar.config.ts`.

PASS = the webkit sign-in fixture passes (the exact failure this section exists for), then the whole `e2e/document` basket green in both engines. Never: strip the directive, run the standalone with `NODE_ENV=development`, or pass certificate-ignoring flags to the browsers.

## Rollback recipe (quick reference)

If `deploy-lens.sh` reports FAIL, or a problem surfaces later:

```
npx wrangler rollback 9c0c2cdd-2041-4848-a193-93d9e8fb0b71 --name patina-designer-portal --yes
```

`9c0c2cdd-2041-4848-a193-93d9e8fb0b71` is the version that was live
immediately before this program's deploy (what "The Life Review" shipped —
see `R126-deploy`). If phase 3's WARN fired because the actual pre-deploy
version differed, use the id from `build/deploy-lens-before.txt` (bottom row)
instead. Rollback of the Worker bundle is independent of the git history; you
do not need to revert the merge commit to roll back what's served, though you
should still do so before re-attempting the deploy — checkout the parent SHA
printed in the script's phase-0/failure output, in a worktree, and re-run
`deploy-lens.sh` from there once ready.
