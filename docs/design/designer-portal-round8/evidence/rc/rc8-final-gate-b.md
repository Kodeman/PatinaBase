# RC-8 final browser gate (GATE-B) on 29832f2e9

## Header

| Field | Value |
|---|---|
| Worktree / branch | `/Users/kody/Code/patina-r8-evidence` / `r8-evidence` |
| Tested tip | `29832f2e9`. At 13:19Z, before E8, the branch moved to `eedc00446` (GATE-A's `rc8-final-gate-a.md`, docs only: `git diff --stat 29832f2e9 eedc00446` = 1 file, +263). The code tree under test is the same at both SHAs. |
| Date | 2026-10-30, 12:55–14:37Z |
| Owned stack | `project_id` `patina-rc8-gate-b`. Block 561: API 56121, DB 56122, shadow 56120, pooler 56129, studio 56123, inbucket 56124, analytics 56127, inspector 56183 |
| E2 stack | Its runner's own stack: `patina-rc8-gate-b-e2`, block 561 (run while `patina-rc8-gate-b` was down) |
| Dev ports | 3910 (round-8 config; E2 designer), 3912 (E2 client), 3000 (legacy G3), 3410 (pieces) |
| Migration head | `00905`, 831 ledger rows, `scope_editions = false` at start, on every fresh stack |
| Stack recipe | `rc7-common.md`: scratch copy of `supabase/` plus only the five `.temp` pins. `supabase start -x studio,mailpit,logflare,vector,edge-runtime,imgproxy,postgres-meta`; edge-runtime is on only for E3, with `EMAIL_DEV_MODE=dry_run`. `cron.launch_active_jobs = off` as `supabase_admin` on the own container. `rc7_owned.stack('patina-rc8-gate-b')` marker. Stopped `--no-backup` before every restart. |
| Locks | `$LOCKS/browser` held 07:54:56 CDT (12:54:56Z) → 14:37Z by `RC8-GATE-B`. No heavy slot was used. |
| Resources | df 239–251 GiB free; swap 19.4–25.1 GB used of 20.5–26.6 GB; vm_stat free 9.2–19.0 GB at each lane start |

Fresh stacks (all head 00905, cron off):

| sysid | Used for |
|---|---|
| 7702443609946984490 | E2 runner (`patina-rc8-gate-b-e2`) |
| 7702447304027017257 | E3 |
| 7702448249198010410 | E4 + E5 (one invocation) |
| 7702448919520509994 | E6 |
| 7702449868821704744 | E8 |
| 7702455111866474538 | E8 re-run (RC7-E8-2, webkit) |
| (not recorded; same recipe) | E8 order-dependence repro |
| 7702457049073307690 | round-8 first slice |
| 7702466846053224491 | first-slice re-run (`field-subject-return`) |
| 7702467375690842154 | G3 legacy + pieces (lens seed) |

## Verdict

**FAIL: 2 non-fixme tests did not pass.**
- **Failed (twice):** `field-subject-return.spec.ts:55` on both engines. This is a stale spec assertion (a test defect), not a product defect.
- **Flaky (failed once, passed on re-run):** webkit `rc7-e8-a11y.spec.ts:926` (RC7-E8-2). The failure depends on spec order and reproduces every time in that order. It exposes a real product contrast violation: the folio "studio" toggle.

Everything else passed: E2 18/18, E3, E4, E5, E6, the rest of E8, the rest of the first slice, legacy G3 and pieces. Every skip is a declared fixme or a declared capability/viewport skip.

## Per-spec results

P / F / S = passed / failed / skipped. The duration is the sum of test durations from the JSON reporter.

### E2 journey (runner, fresh stack)

| Spec | Project | P | F | S | Duration |
|---|---|---:|---:|---:|---:|
| `rc7-e2-consumer-journey` (9 tests: acceptance R1–R3, paper P, completion A/F/D, replace-form, paper-mismatch) | chromium | 9 | 0 | 0 | 406.5 s |
| same | webkit-iphone | 9 | 0 | 0 | 347.4 s |

Runner result: `18 passed (13.3m)`, `JOURNEY run1 PASSED`, `RESULT: PASSED`. Review-and-send first taps were `taps=1` on every request: chromium 6/6, webkit 6/6, so OBS-1 did not recur. Teardown: `supabase stop --no-backup exit=0; containers left 0; volumes left 0`. The receipt shows `numberedHead 00905` and `cronLaunchActiveJobs off`.

### RC-7 lanes

| Spec | Project | P | F | S | Duration | Skips |
|---|---|---:|---:|---:|---:|---|
| `rc7-e3-agreement-lineage` | chromium | 2 | 0 | 0 | 37.6 s | — (RC7-E3-5 test now runs and passes) |
| | webkit-iphone | 2 | 0 | 0 | 25.8 s | |
| `rc7-e3-arrangements` | chromium | 2 | 0 | 0 | 0.7 s | |
| | webkit-iphone | 2 | 0 | 0 | 0.6 s | |
| `rc7-e3-audience` | chromium | 0 | 0 | 1 | 0 s | A14 placeholder fixme (`:12`) |
| | webkit-iphone | 0 | 0 | 1 | 0 s | same |
| `rc7-e3-field` | chromium | 2 | 0 | 1 | 12.3 s | RC7-E3-2 fixme (`:203`) |
| | webkit-iphone | 2 | 0 | 1 | 16.0 s | same |
| `rc7-e3-lineage` | chromium | 1 | 0 | 0 | 15.9 s | |
| | webkit-iphone | 1 | 0 | 0 | 14.7 s | |
| `rc7-e4-cabinetry` | chromium | 2 | 0 | 0 | 20.0 s | |
| | webkit-iphone | 2 | 0 | 0 | 18.4 s | |
| `rc7-e5-hours-claim` | chromium | 1 | 0 | 0 | 14.3 s | |
| | webkit-iphone | 1 | 0 | 0 | 15.4 s | |
| `rc7-e6-entry` | chromium | 2 | 0 | 0 | 33.8 s | |
| | webkit-iphone | 2 | 0 | 0 | 19.0 s | |
| `rc7-e6-ffe` | chromium | 1 | 0 | 0 | 11.5 s | |
| | webkit-iphone | 1 | 0 | 0 | 13.9 s | |
| `rc7-e6-maker` | chromium | 1 | 0 | 0 | 9.6 s | |
| | webkit-iphone | 1 | 0 | 0 | 8.6 s | |
| `rc7-e6-nested` | chromium | 1 | 0 | 0 | 12.8 s | |
| | webkit-iphone | 1 | 0 | 0 | 12.2 s | |
| `rc7-e6-role-read` | chromium | 1 | 0 | 0 | 5.9 s | |
| | webkit-iphone | 1 | 0 | 0 | 6.3 s | |
| `rc7-e8-a11y` | chromium | 4 | 0 | 1 | 157.8 s | RC7-E8-6 fixme (`:903`) |
| | webkit-iphone | 3 | **1** | 1 | 177.5 s | RC7-E8-6. **Failed: RC7-E8-2 (`:926`); see Flakes** |
| `rc7-e8-perf` | chromium | 5 | 0 | 1 | 56.2 s | RC7-E8-5 fixme (`:508`) |
| | webkit-iphone | 2 | 0 | 4 | 48.7 s | RC7-E8-5 fixme; `layout-shift` capability skips: `:447` ×2 (settled-scroll CLS), `:487` (RC7-E8-4) |
| `rc7-e8-visual` | chromium | 3 | 0 | 0 | 25.6 s | |
| | webkit-iphone | 3 | 0 | 0 | 32.9 s | |
| `rc7-e8-zoom` | chromium | 7 | 0 | 2 | 279.7 s | RC7-E8-7 (`:894`), RC7-E8-3 (`:908`) fixmes |
| | webkit-iphone | 7 | 0 | 2 | 303.1 s | same |

Lane totals:
- E3: 14 passed, 4 skipped (2.8m).
- E4 + E5: 6 passed (1.7m).
- E6: 12 passed (2.8m).
- E8: 34 passed, 11 skipped, 1 failed (18.7m).

E8 fixtures: activation fixture exit 0 (`{"scope_editions": true, "c4_create": true, "c6_complete": true}`); E7 `mixed-fixture.sql` exit 0, 0 ERROR.

E8 axe `incomplete` color-contrast by surface: chromium 1/5/8/5/0/0, webkit 0/4/7/3/0/0. These are identical to E8H/FIX13.

**Fixme note:** RC7-E8-5 is still `test.fixme` at `rc7-e8-perf.spec.ts:508`, although the synthesis records it as fixed by FIX10 (`89bc6e36b`). The flip is owed. This gate did not run it.

### Round-8 first slice (`ls e2e/round8/*.spec.ts | grep -v rc7`, 34 files)

| Spec | chromium P/F/S | webkit-iphone P/F/S | Duration (chromium / webkit) |
|---|---|---|---|
| `accounts-paper` | 3/0/0 | 3/0/0 | 16.0 / 13.4 s |
| `arrangements` | 1/0/0 | 1/0/0 | 10.4 / 13.2 s |
| `audience-work` | 1/0/0 | 1/0/0 | 8.7 / 9.3 s |
| `buying-paper` | 3/0/0 | 3/0/0 | 13.0 / 14.9 s |
| `cabinetry-cp01` | 1/0/0 | 1/0/0 | 6.6 / 8.2 s |
| `composition` | 7/0/0 | 7/0/0 | 38.0 / 48.8 s |
| `configured-placement` | 4/0/0 | 4/0/0 | 52.4 / 50.6 s |
| `drawer-clearance` | 3/0/0 | 3/0/0 | 19.1 / 22.5 s |
| `evidence-folio` | 1/0/0 | 1/0/0 | 15.1 / 14.9 s |
| `ffe-lenses` | 3/0/0 | 3/0/0 | 27.1 / 35.5 s |
| `ffe-operations` | 3/0/0 | 3/0/0 | 20.2 / 24.7 s |
| `ffe-read-failure` | 1/0/0 | 1/0/0 | 10.5 / 8.6 s |
| `ffe-unfold` | 10/0/0 | 9/0/1 (`:495`, declared chromium-only) | 84.2 / 92.5 s |
| **`field-subject-return`** | **1/1/0** | **1/1/0** | 18.5 / 21.2 s |
| `first-slice` | 2/0/0 | 2/0/0 | 22.7 / 30.5 s |
| `hours-paper` | 2/0/0 | 2/0/0 | 10.1 / 12.0 s |
| `identity-lineage` | 4/0/0 | 4/0/0 | 40.6 / 45.7 s |
| `library-resources` | 1/0/0 | 1/0/0 | 13.8 / 19.5 s |
| `library-return` | 1/0/0 | 1/0/0 | 16.1 / 18.4 s |
| `paper-frame` | 3/0/0 | 1/0/2 (`:55`, `:68`, width < 1180) | 19.6 / 16.2 s |
| `people-resources` | 1/0/0 | 1/0/0 | 15.4 / 15.9 s |
| `phone-line-editor` | 9/0/0 | 9/0/0 | 99.1 / 128.5 s |
| `purchase-lens` | 1/0/0 | 1/0/0 | 7.5 / 8.8 s |
| `rc4b-presentation` | 6/0/0 | 5/0/1 (`:113`, desktop width only) | 35.9 / 37.4 s |
| `receiving-paper` | 2/0/0 | 2/0/0 | 5.9 / 6.7 s |
| `resource-returns` | 3/0/0 | 3/0/0 | 29.9 / 31.6 s |
| `responsive` | 9/0/0 | 9/0/0 | 96.7 / 94.1 s |
| `return-hold` | 1/0/0 | 1/0/0 | 8.1 / 9.0 s |
| `scale-profile` (36/80/500/2,000 lines) | 4/0/0 | 4/0/0 | 62.5 / 74.5 s |
| `smoke` | 1/0/0 | 1/0/0 | 7.0 / 9.0 s |
| `states` | 7/0/0 | 7/0/0 | 46.5 / 54.7 s |
| `studio-journeys` | 4/0/0 | 4/0/0 | 22.4 / 24.2 s |
| `studio` | 3/0/0 | 3/0/0 | 18.1 / 19.5 s |
| `zoom-accessibility` | 15/0/0 | 15/0/0 | 81.3 / 92.6 s |

Totals: `2 failed, 4 skipped, 238 passed (36.7m)`. JSON: expected 238, skipped 4, unexpected 2, flaky 0. The four skips are the same declared webkit skips as in RC-6 G4.

## G3 legacy results (fresh stack plus `scripts/the-document-lens-seed.sql`)

| Spec | Project | P | F | S | Duration |
|---|---|---:|---:|---:|---:|
| `document/quiet-responsive-shell` | chromium | 12 | 0 | 0 | 84.9 s |
| `document/margin-handoffs` | chromium | 4 | 0 | 1 | 30.9 s |
| `document/desk-error-state` | chromium | 2 | 0 | 0 | 42.8 s |
| `document/pieces-build-room` (pieces config) | chromium | 37 | 0 | 0 | 307.9 s |
| same | webkit-iphone | 4 | 0 | 33 | 26.9 s |

- **Legacy:** `18 passed, 1 skipped (2.7m)`. The skip is the `margin-handoffs.spec.ts:195` fixme, as in RC-6. `desk-error-state` 20-load passed.
- **Pieces:** `41 passed, 33 skipped (5.8m)`. The 33 skips are the spec's own `test.skip(browserName !== 'chromium', WALK_ONLY)`. RC-6's flaky 502 did not recur.
- **Stack proof:** the owned stack's Kong logged 8,727 `/rest|/auth/v1` requests between 14:28:15 and 14:36:56Z. Neither dev log mentioned `54321`.

## Commands (verbatim)

Every lane except E2 ran through `$G/run-lane.sh <lane> <tag>` (`$G` = `<session scratchpad>/rc8-gate-b`). For each lane it:
- checks df and vm_stat, and refuses a busy 3910;
- calls `restart.sh` (stop `--no-backup`, then start `-x …`, cron off, owned marker);
- reads the keys from `supabase status -o env` (never printed);
- asserts the URLs are `127.0.0.1:56121` / `:56122`;
- exports `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`, `PLAYWRIGHT_DESIGNER_PORT=3910`, `PLAYWRIGHT_OUTPUT_DIR`, `PLAYWRIGHT_JSON_OUTPUT_NAME` and `RC7_OWNED_STACK=patina-rc8-gate-b`;
- applies the lane fixtures, then runs, from `apps/designer-portal`:

```
pnpm exec playwright test -c playwright.round8.config.ts <specs> --project=chromium --project=webkit-iphone --workers=1 --reporter=list,json [extra]
```

Per lane:

```
# E2 (worktree root)
RC7_E2_PORT_BLOCK=561 RC7_E2_PROJECT=patina-rc8-gate-b-e2 RC7_E2_DESIGNER_PORT=3910 RC7_E2_CLIENT_PORT=3912 \
  node apps/designer-portal/e2e/round8/rc7-e2-run.mjs --evidence $G/runs/e2-r1 --runs 1 --workdir $G/e2-work

# E3 (edge-runtime on, EMAIL_DEV_MODE=dry_run)
export RC7_E3_API_PORT=56121 RC7_E3_DB_PORT=56122 RC7_E3_SYSTEM_IDENTIFIER=<sysid>
psql $DB_URL -X -v ON_ERROR_STOP=1 -v e3_system_identifier=<sysid> -f e2e/round8/rc7-e3-arrangements-fixture.sql   # exit 0
node e2e/round8/rc7-e3-preflight.mjs   # "RC7-E3 preflight ok: 127.0.0.1:56121/56122, system identifier 7702447304027017257"
specs: rc7-e3-{agreement-lineage,arrangements,audience,field,lineage}.spec.ts

# E4 + E5 (one stack, one invocation)
export RC7_E4_STACK=patina-rc8-gate-b RC7_E5_API_PORT=56121 RC7_E5_DB_PORT=56122
specs: rc7-e4-cabinetry.spec.ts rc7-e5-hours-claim.spec.ts

# E6 (fresh stack)
specs: rc7-e6-{entry,ffe,maker,nested,role-read}.spec.ts

# E8 (fresh stack). Harness debt: the activation fixture names marker patina-rc7-e8, so a scratch copy substitutes patina-rc8-gate-b
sed 's/patina-rc7-e8/patina-rc8-gate-b/g' e2e/round8/rc7-e8-activation-fixture.sql > $G/e8-activation-gate-b.sql
psql -X -1 -v ON_ERROR_STOP=1 -v owned_port=56122 -v owned_system_id=<sysid> $DB_URL -f $G/e8-activation-gate-b.sql            # exit 0
psql -X -1 -v ON_ERROR_STOP=1 -v owned_port=56122 -v owned_system_id=<sysid> $DB_URL -f e2e/round8/rc7-e7-fixtures/mixed-fixture.sql   # exit 0, 0 ERROR
specs: rc7-e8-{a11y,perf,visual,zoom}.spec.ts
re-run:      ... --project=webkit-iphone -g "RC7-E8-2"
order repro: ... --project=chromium --project=webkit-iphone -g "RC7-E8-2|1280@200: drawing/evidence viewer"

# First slice (fresh stack)
specs: $(ls e2e/round8/*.spec.ts | grep -v rc7)
re-run: ... -g "mocked contextual Field payload"

# G3 ($G/run-g3.sh: fresh stack, then lens seed, then pre-started dev servers that Playwright reuses)
docker exec -i supabase_db_patina-rc8-gate-b psql -U postgres -d postgres -v ON_ERROR_STOP=1 < scripts/the-document-lens-seed.sql   # exit 0
# env: NEXT_PUBLIC_SUPABASE_URL=SUPABASE_URL=http://127.0.0.1:56121, owned anon/service keys,
#      SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:56122/postgres, NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live
NEXT_PUBLIC_FLAG_OVERRIDES=procurement-workspace-pilot:true,the-document-pilot:true,client-invite-letter:true pnpm exec next dev --webpack -p 3000
pnpm exec playwright test e2e/document/quiet-responsive-shell.spec.ts e2e/document/margin-handoffs.spec.ts e2e/document/desk-error-state.spec.ts --project=chromium --workers=1 --output=$G/runs/g3-r1/legacy-results --reporter=list,json
NEXT_PUBLIC_FLAG_OVERRIDES=<same>,ask-the-paper:true,one-voice:true pnpm exec next dev --webpack -p 3410
PLAYWRIGHT_OUTPUT_DIR=$G/runs/g3-r1/pieces-results pnpm exec playwright test e2e/document/pieces-build-room.spec.ts --config playwright.pieces.config.ts --reporter=list,json
```

Setup: `pnpm exec turbo run build --filter=@patina/designer-portal^... --filter=@patina/client-portal^...` gave 8/8 cached (FULL TURBO).

## Flakes and failures

### F-1 (failed twice): `field-subject-return.spec.ts:55`, both engines. This is a test defect

- **First error:** `field-subject-return.spec.ts:61`, `expect(getByLabel('Note context')).toContainText('plan print · recorded-print-only')`. The received text was `Source Field capture · Subject Print · Room Return to room · Print Print · Issue Not recorded · …`. It failed identically on chromium and webkit, in the slice run and in the re-run on a fresh stack (sysid 7702466846053224491).
- **Root cause:** the spec asserts the raw-identifier subject label that RC7-E3-3 removed on purpose.
  - `4684cca74` and `f9e2c941d` (2026-10-29) changed `apps/designer-portal/src/components/document/margin-bodies.tsx`. The subject is now `kindLabel · subjectLabel`, or the bare `kindLabel` (`:851-862`), and the Print row is `subjectLabel ?? 'Print'` (`:900`). The old `${kind.replaceAll('_',' ')} · ${id}` form is gone.
  - The spec's mocked `margin_notes` row (`:41`) carries `subject_kind: 'plan_print', subject_id: 'recorded-print-only'` and no `subject_print_label`, so the product correctly renders "Print".
  - The spec was last edited on 2026-10-26 (`b9277ef0c`), before the fix. No RC-7/RC-8 gate ran the first slice, so the drift went unseen. RC-6 G4 passed it at `c066bc47a`.
- **Severity / confidence:** low (test-only) / high.
- **Proposed fix (spec only):** at `:61`, assert `Subject` = `Print` and the `Print` row = `Print`. Or add `subject_print_label` to the mock at `:41` and assert `Print · <label>`, while keeping a negative assertion that `recorded-print-only` is not rendered. The test steps after `:61` (room return, amendment trigger) were not reached in either run.

### F-2 (flaky, order-dependent): webkit `rc7-e8-a11y.spec.ts:926` RC7-E8-2. It exposes a product contrast defect

- **First error:** `color-contrast serious` on surfaces `f01` and `spec`, 1 node each: `.da-score-hover.block #8b7355 on #faf7f2 = 4.19:1 (9.0pt (12px), need 4.5:1)`. The other four surfaces were empty.
- **Re-run:** on a fresh stack, `--project=webkit-iphone -g RC7-E8-2` gave 1 passed (1.7m). By the gate rule, this makes it flaky.
- **Order repro (deterministic):** one invocation on a fresh stack, `-g "RC7-E8-2|1280@200: drawing/evidence viewer"`, both projects.
  - chromium RC7-E8-2 ✓;
  - chromium zoom ✓;
  - **webkit RC7-E8-2 ✘** with the identical node;
  - webkit zoom ✓.
- **Root cause, in two parts:**
  1. **Trigger (harness order).** `rc7-e8-zoom.spec.ts:821-856` `beforeAll` files one *private* print on the F01 job through `file_plan_prints`. Every print owns a `project_documents` row (00429), so the F01 job and its FF&E unfold gain a folio file.
     - In a both-project run, chromium zoom runs before webkit a11y, so only webkit RC7-E8-2 sees that file.
     - Chromium a11y runs before any print exists.
     - E8H and FIX13 ran one project per invocation, so they never had a print present at a11y time.
     - Global teardown deletes the prints afterwards (`global-teardown.ts:59-62`). The post-run readback found 0 `plan_prints`.
  2. **Product defect.** The private folio file's visibility toggle renders the word "studio" in `var(--color-aged-oak, #8B7355)` at 11 px mono. See `apps/designer-portal/src/components/document/folio-strip.tsx:99-103` (style; aged-oak at `:102`) and `:111-115` (the `da-score-hover block` span). Aged-oak on `--color-off-white` `#FAF7F2` is 4.20:1 by computation (4.30:1 on `#FCFAF6`), below 4.5:1 (WCAG 1.4.3 AA).
     - It is the only aged-oak `.da-score-hover.block` on the job paper or the FF&E unfold. `member-title-line.tsx:82` has the same pattern but renders only on the account page.
     - It shows on any job with a studio-only folio file, so it is not limited to the fixture.
     - FIX13 did not cover it, because no E8 fixture has a private folio file when a11y runs.
- **Severity / confidence:** medium (1.4.3 AA, real data) / high for the cause and the node. The identification is by selector, colour and the trigger, not by a DOM dump of the node.
- **Proposed fixes:**
  - **Product:** use quiet ink (or `--color-mocha`) for the "studio" state at `folio-strip.tsx:102`, as FIX13 did elsewhere.
  - **Harness:** make the a11y spec seed its own private folio file, so the check covers this node in both engines and does not depend on spec order.

## Expected fixmes and skips seen

- **RC7-E8-3, -6, -7:** fixme on both engines, as briefed.
- **Lane fixmes from the synthesis's open-defects table:** A14 (`rc7-e3-audience.spec.ts:12`), RC7-E3-2 (`rc7-e3-field.spec.ts:203`) and RC7-E8-5 (`rc7-e8-perf.spec.ts:508`; fixed by FIX10 but not yet flipped).
- **WebKit `layout-shift` skips:** `rc7-e8-perf.spec.ts:447` ×2 and `:487`.
- **Declared viewport/engine skips:** first slice (4) and pieces WebKit (33).
- **Legacy:** the `margin-handoffs:195` fixme.

## Not verified

- **Screen reader:** no VoiceOver or NVDA pass.
- **Real devices:** `webkit-iphone` is Playwright WebKit emulation; no physical iPhone or Safari.
- **WebKit CLS:** WebKit exposes no `layout-shift`, so no WebKit CLS number exists (3 capability skips).
- **RC7-E8-5 returning-reader CLS:** still a fixme in the spec, so it was not run here.
- **Second runs:** each spec ran once per project, as briefed. Only the two failures were re-run.
- **Steps after the failing assertion:** F-1's steps after `:61` were not exercised.
- **Real zoom:** emulated only, as in E8.
- **Production:** nothing was touched (no Strata, PostHog or Cloudflare). The production-Sanity help fetch is blocked only in E2 (existing harness debt).

## Teardown proof

- Final `supabase stop --workdir <scratch>/rc8-gate-b-stack.* --no-backup`: exit 0.
- The E2 runner self-reported `containers left 0; volumes left 0`.
- `lsof -iTCP -sTCP:LISTEN`: no listener on 3000, 3410, 3910, 3912, 56120–56129 or 56183.
- `docker ps -a` / `docker volume ls`: 0 `patina-rc8-gate-b*` containers and 0 volumes.
- `$LOCKS/browser`: the owner line was `RC8-GATE-B Fri Oct 30 07:54:56 CDT 2026`; it was removed at 14:37Z. `$LOCKS` holds no `browser`, `heavy-1` or `heavy-2` directory.
- Port block 616 was never used. 54321/54322 were never touched, and no `--linked` command ran.
- The E8 visual spec's rewrites of `evidence/rc/visual-rc7/*` and `next-env.d.ts` were restored with `git checkout`. Copies of the captures are in `$G/runs/e8-r1/visual-rc7-copy/`.
- The worktree is clean apart from this file.
- Raw logs and JSON reports are in `$G/runs/` (session-scoped).
