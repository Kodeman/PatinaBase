### I152-deploy · The Smart Lens — 2026-08-30

`build/deploy-lens.sh` shipped R127's ruled direction — "The Smart Lens" — to production, on Kody's
in-session ask, from the repo root on `main` at **`fab79cdd3`** (`DEPLOY_SHA`, per
`build/deploy-lens-before.txt`). Live now: the declared 56px lens band replacing the job ticket; the
rail as a data-derived ladder of the paper's own stops with a travelling reading window; regions
opening ahead of the reader in one direction, never taken back, at a single 240px threshold; the
pre-work spreads carrying real regions; one `--doc-region-gap` token; no feature flag. Result
**PASS** — on the corrected probe set, and after one spurious FAIL described below.

Before → after: **`9c0c2cdd-2041-4848-a193-93d9e8fb0b71`** (the version "The Life Review" shipped, per
`R126-deploy`) → **`55907643-6bca-4b2f-84ed-9e715554cb83`** (created 2026-08-30T20:27:59.570Z, per
`build/deploy-lens-after.txt`).

**This deploy also carries PR #39's portal surface** (public `/privacy` + `/terms`, and the
`isPublicPage` middleware allowance that lets them serve signed out) — CL-R4, the capture program's
Chrome Web Store precondition. `main` had moved to `fab79cdd3` (PR #39's merge) after I152's own
merge `5178d7d8e`, and this portal-only deploy ships `main`'s tip as the house requires. Its
migrations **00541/00542 remain unpushed** (the extension program's to push); the legal pages are
static and read neither, so the deploy order holds.

Gates run before deploy (phase 2), verbatim from the run:

- `type-check` — `tsc --noEmit`, clean.
- `jest` — the five Document suites `PASS`: `lens-band.test.tsx`, `use-lens-density.test.tsx`,
  `use-region-fold.test.tsx`, `contrast.test.ts`, `shadow-gate.test.ts`.
  `Test Suites: 5 passed, 5 total` · `Tests: 154 passed, 154 total`.
- Source tripwires — `OK: no data-job-ticket / doc-seam-height / SEAM_HEIGHT_VAR in
  apps/designer-portal/src (test files excluded)` · `OK: --doc-band-height declared in globals.css` ·
  `OK: --doc-region-gap declared in globals.css` · `OK: useLensDensity( called under
  apps/designer-portal/src/app`.

Probes, verbatim from the verifying run:

```
    PASS: GET /desk -> 307 (expected 307)
    PASS: GET /auth/signin -> 200 (expected 200)
    PASS: found 3 served CSS chunk(s)
    PASS: --doc-band-height found in served CSS
    PASS: --doc-region-gap found in served CSS
    PASS: --doc-landing-clear found in served CSS
    PASS: data-density found in the served document-route chunk (page-2d98df3d12077926.js)
    PASS: doc-seam-height absent from served CSS
    PASS: GET /api/version -> 200 (liveness only)
    Fetched 31 JS chunk(s) from /auth/signin's manifest.
    PASS: data-job-ticket not found in 31 fetched JS chunk(s)

==> RESULT: PASS — production looks correct.
```

Independently of the script: `wrangler deployments list --name patina-designer-portal`'s bottom row
(the list is oldest-first) reads `55907643-6bca-4b2f-84ed-9e715554cb83`, created
2026-08-30T20:27:59.570Z; `curl -sI https://app.patina.cloud/desk` → `HTTP/2 307`,
`location: /auth/signin?callbackUrl=%2Fdesk`; and a hand-run grep of the three served CSS chunks
(246,488 bytes) finds `--doc-band-height:56px;` and `--doc-region-gap:24px;` present and
`doc-seam-height` absent. **The declared 56px band is live, at its ruled value.**

#### The one FAIL, and why it was the probe

The first verifying run printed **10 PASS and one FAIL**: `data-density NOT found in served CSS`.
Nothing was rolled back, and the deploy was correct. Two defects in `deploy-lens.sh`'s own probe
block, both now fixed in the same commit as this entry:

1. **A category error.** `data-density` is a DOM attribute the region components write
   (`care-band.tsx`, `money-region.tsx`, `ffe-section.tsx`, `project-approval-document.tsx`), never a
   CSS hook — no `[data-density…]` selector exists anywhere in the portal, and `globals.css` names
   the string only inside the OD-12 comment at ~line 1122, which the production minifier strips. The
   probe grepped served CSS for it, so it would FAIL on every correct build. It is now checked
   JS-side (probe 3b) against the document route's own served chunk, located by hash from the build
   just shipped; `curl` needs `-g/--globoff` there, because the path contains `[id]` and curl would
   otherwise read it as a character-range glob. The check WARNs, never FAILs, if the chunk name is
   not derivable.
2. **A `pipefail` trap, latent in every string probe.** `printf '%s' "$big" | grep -qF -- "$needle"`
   is unsafe under `set -o pipefail`: `grep -q` exits at its first match, `printf` then takes SIGPIPE
   (141), and `pipefail` promotes that to the pipeline's status — so a **found** string reports as
   not found whenever the payload is large enough that printf is still writing when grep leaves. It
   is deterministic on the 712KB document-route chunk (which does contain `data-density`, three
   times, byte-identical to the local build). All four string probes now use a pure-bash `contains()`
   — no pipe, no subprocess, no early-exit signal.

The corrected probe block was re-run against the same live version and returned all PASS, as quoted
above. Worth stating plainly: the CSS-token probes that passed on the first run passed by luck of
match position, not by correctness, and would have been capable of the same false FAIL.

Rollback: redeploy the prior Worker version `9c0c2cdd-2041-4848-a193-93d9e8fb0b71`:

```
npx wrangler rollback 9c0c2cdd-2041-4848-a193-93d9e8fb0b71 --name patina-designer-portal --yes
```

At the source level the pre-lens commit is **`dab057537`** — *not* `PARENT_SHA` as recorded in
`build/deploy-lens-before.txt`. That file's `PARENT_SHA=5178d7d8e` is the first parent of this
deploy's `fab79cdd3`, i.e. the pre-#39 tip, and `5178d7d8e` **is** the lens merge itself; reverting
to it would keep the lens and drop only PR #39. The script's FAIL banner calls `PARENT_SHA` "the
pre-merge tip of main", which is true of `fab79cdd3`'s merge but not of the lens — read it with that
care.

Signed-in walk of `app.patina.cloud` — a real project's document at 1440/1280/390, the band, the
ladder, the standing sheet, a region opening ahead, the 390 Margin sheet — **owed to Kody**, per
RESUME ruling 7 (no Kody session before ship). Checklist and full detail in
`build/30-deploy-runbook.md`'s "Kody's signed-in walk" section. The TLS-fronted WebKit ship-bar run
(D-B41) is also still owed, and is unaffected by this deploy.

*Entries add: I152-deploy · last id = I152-deploy*
