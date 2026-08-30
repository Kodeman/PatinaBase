### I152-deploy · The Smart Lens live on app.patina.cloud

<!-- fill: one-sentence date suffix for the heading, e.g. "— 2026-0X-XX", matching the day this script is actually run -->

`build/deploy-lens.sh` shipped R127's ruled direction — "The Smart Lens" — to production. Kody ran it
from the repo root on `main`, at the docs commit <!-- fill: DEPLOY_SHA, from build/deploy-lens-before.txt --> (merge
<!-- fill: the merge commit sha of the document-lens PR into main -->, PR <!-- fill: PR number -->). Live now:
the declared 56px lens band replacing the job ticket; the rail as a data-derived ladder of the paper's own
stops with a travelling reading window; regions opening ahead of the reader in one direction, never taken
back, at a single 240px threshold; the pre-work spreads carrying real regions; one `--doc-region-gap`
token; no feature flag. Result <!-- fill: PASS or FAIL, from the script's own RESULT line -->.

Before → after: **`9c0c2cdd-2041-4848-a193-93d9e8fb0b71`** (the version "The Life Review" shipped, per
`R126-deploy`) → <!-- fill: the after-version id, bottom row of build/deploy-lens-after.txt --> (created
<!-- fill: the after-version's creation timestamp, from wrangler deployments list -->, per
`build/deploy-lens-after.txt`).

Probes, verbatim from the run:

- <!-- fill: "GET /desk → 307" or the actual observed status, PASS/FAIL/WARN as printed -->
- <!-- fill: "GET /auth/signin → 200", PASS/FAIL/WARN as printed -->
- <!-- fill: CSS chunk grep result — "--doc-band-height found", "--doc-region-gap found", "--doc-landing-clear found", "data-density found", "doc-seam-height absent" — one line per token, PASS/FAIL/WARN as printed -->
- <!-- fill: "GET /api/version → 2xx", PASS/FAIL/WARN as printed -->
- <!-- fill: JS-chunk grep for data-job-ticket — count of chunks fetched, WARN only if found, as printed -->
- <!-- fill: the script's own closing RESULT line, verbatim, e.g. "==> RESULT: PASS — production looks correct. Live version: <id>" -->

Gates run before deploy (phase 2), verbatim from the run:

- <!-- fill: type-check result -->
- <!-- fill: jest result for shadow-gate.test.ts, contrast.test.ts, lens-band.test.tsx, use-lens-density.test.tsx, use-region-fold.test.tsx -->
- <!-- fill: the three source tripwires' results — data-job-ticket/doc-seam-height/SEAM_HEIGHT_VAR absent; --doc-band-height and --doc-region-gap present in globals.css; useLensDensity( present under apps/designer-portal/src/app -->

Rollback: redeploy prior Worker version `9c0c2cdd-2041-4848-a193-93d9e8fb0b71`, i.e. the prior `main`
commit before this merge, <!-- fill: PARENT_SHA, from build/deploy-lens-before.txt -->:

```
npx wrangler rollback 9c0c2cdd-2041-4848-a193-93d9e8fb0b71 --name patina-designer-portal --yes
```

Signed-in walk of `app.patina.cloud` — a real project's document at 1440/1280/390, the band, the ladder,
the standing sheet, a region opening ahead, the 390 Margin sheet — **owed to Kody**, per RESUME ruling 7
(no Kody session before ship). Checklist and full detail in `build/30-deploy-runbook.md`'s "Kody's
signed-in walk" section. <!-- fill: once walked, replace this paragraph with what Kody found, or "walk confirms the design as built, no findings" -->

<!-- fill: if the walk surfaces any deviation from R127/I152, name it here with the same rigor as a build-time deviations.md row -->

*Entries add: I152-deploy · last id = I152-deploy*
