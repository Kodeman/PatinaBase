# Arrival v3 — production ship record (US-14)

Contract: `artifacts/arrival-production-2026-09-27/design/CONTRACT.md` — §4g is the ship ruling. Ship
head: `e2aabbe367ef04f69dc755980ee10567c695cfd1` on `arrival-prod/w3-integration`, merged to `main`.
No feature flag; 100 % of production on the first deploy (§0.1).

## Ship

- **SHAs.** Pre-merge `main` = `c5d6090c8e8b08ed60a2f16df2104d193bfc02b5`. Docs commit
  `039f2cb38caaf787c68f2666da98220cd6638fa3` (16 md files: 15 new + the tracked `qa/arrival-lane.md`
  update, identical on both parents so no conflict). Merge `649f1c14f79e229a26a06894cde8bba173dd9e77`
  (`git merge --no-ff --no-edit e2aabbe36`; parents `039f2cb38` + `e2aabbe36`; `diff --name-only`
  outside `artifacts/arrival-production-2026-09-27` = 0 lines). One follow-up doc commit
  `6b3cf072df302c73e90efb06a3887a206c5ecb67` (1-line reword of `research/gates-deploy.md:98`, forced by
  the pre-push retired-deploy-reference gate refusing "retired deployment platform procedure" —
  deviation, not a code change). Deployed `main` head = `6b3cf072d`. Push:
  `7dbd203bc..6b3cf072d main -> main`. Gates on `main` post-merge: designer-portal type-check EXIT=0,
  0 `error TS`; `test -- src/lib/arrival src/components/document/arrival` EXIT=0, 17/17 suites,
  385/385 tests.
- **Migration.** `supabase migration list --linked` (Strata, ref `bkvcixdmuyejfzcijpdg`) showed only
  `00675` pending (local≠remote), everything through `00674` already applied. Dry run:
  `supabase db push --include-all --dry-run` → "Would push … 00675_arrival_anchors.sql". Real push:
  `supabase db push --include-all` → "Applying migration 00675_arrival_anchors.sql…" →
  `{"upToDate":false,"dryRun":false,"migrations":["00675_arrival_anchors.sql"],"message":"Finished
  supabase db push."}`. `supabase_migrations.schema_migrations` now carries `00675 arrival_anchors`.
- **Prior deployment (before ship).** `wrangler deployments list --name patina-designer-portal` bottom
  row: Created 2026-09-26T12:44:52.428Z, Version 96580aea-2388-4fdc-b372-b23cbb606947 (Created
  2026-09-26T12:44:49.828Z) — same version confirmed via `versions list`. Rollback worktree
  `.codex/worktrees/agent-arr-rollback` staged detached at `c5d6090c8` (the code behind that live
  version — `apps/designer-portal` and `packages/` have no diff between `d8ef1392a` and `c5d6090c8`).
- **Deploy.** Start `2026-09-29T18:33:57Z`. `DEPLOY_EXIT=0`. Phase tail: 8 `NEXT_PUBLIC_*` vars
  exported, Turborepo build, OpenNext bundle (`handler.mjs` 18091460 bytes), chunk gate (252 client
  chunks, resolved PostHog key literal in 11), "Uploaded 22 files (270 already uploaded)", "Current
  Version ID: 9c599663-30ce-4ccf-8116-0ab15478a3f1", "Done: designer portal deployed to production." 0
  ERROR/refusal lines; 3 non-blocking warnings (wrangler multi-env, esbuild direct-eval, node DEP0190).
  Post-deploy bottom row: Created 2026-09-29T18:35:43.840Z (after start), Version
  9c599663-30ce-4ccf-8116-0ab15478a3f1 (Created 18:35:40.643Z) — confirmed a second time unsandboxed
  during verification, byte-identical.
- **CSP before/after (§4c seam guard).** Before: `curl -sI https://app.patina.cloud/auth/signin`
  carries `upgrade-insecure-requests` once, full policy unremarkable (self + PostHog + Supabase +
  api.patina.cloud origins only). `ARRIVAL_E2E`/`NEXT_PUBLIC_FLAG_OVERRIDES` unset in both shells.
  After: live `/auth/signin` = HTTP 200, CSP still carries `upgrade-insecure-requests` once, byte-
  identical to before ("CSP identical to before: yes").
- **Chunk counts / live file list.** Local `.open-next/assets` vs. live, 4 files hashed
  (sha256, 16-hex truncation), all matched: `css/6cc8a4a5864085df.css` (`--arr-ok` ×1, live
  `4c0bd6df4dcd6100`); `chunks/60-068dd654e3ec2828.js` (`arrival_ended` ×1, `8e3b4c9f5af9b2bd`);
  `chunks/7982-b38e0cca8cc061bc.js` (`data-arr-played` ×1, `801e025cace732c9`);
  `chunks/app/(document)/layout-fb94b909178bf6b2.js` (`arr-pre` ×1, `mark_arrival` ×1,
  `data-arrival-ready` ×1, `48db1630c70ebfd2`). Verification independently fetched all 36 unique
  `/_next/static` refs off the live sign-in page: 36/36 HTTP 200, 0 non-200. `grep 127.0.0.1|
  localhost:54321` across all 36 live bodies and across the entire local `.open-next` static tree: 0
  hits for the local Supabase port string; one unrelated PostHog vendor cookie-domain-check literal
  flagged as benign, not a seam leak. `/api/version` 200; `/desk` signed out → 307 to
  `/auth/signin?callbackUrl=%2Fdesk`; live sign-in HTML's `BUILD_ID` `USc9UIbLuAv5G0TAYFNWo`, all 39 of
  its static refs exist in the new local build (0 missing).
- **Bundle sizes (whole files — the arrival modules share these chunks with other code).**
  `css/6cc8a4a5864085df.css`: raw 3871 B, gzip -9 1239 B. `chunks/60-068dd654e3ec2828.js`
  (`arrival_ended`): raw 9004 B, gzip 3734 B. `chunks/7982-b38e0cca8cc061bc.js` (`data-arr-played`):
  raw 185668 B, gzip 56811 B. `chunks/app/(document)/layout-fb94b909178bf6b2.js` (`arr-pre` /
  `mark_arrival`): raw 206826 B, gzip 55074 B. The lane-build arrival-code-only attribution (CONTRACT
  §4g) is ≈ 45.7 KB minified / 18.0 KB gzip of arrival JS + 3.9 KB CSS — smaller than the whole-file
  figures above because those chunks also carry non-arrival code.
- **RPC ACL.** Anon `POST .../rest/v1/rpc/mark_arrival {"p_scope":"desk"}` → HTTP 401,
  `{"code":"42501","message":"permission denied for function mark_arrival"}`. Anon
  `GET .../rest/v1/arrival_anchors?select=count` → HTTP 401, `{"code":"42501","message":"permission
  denied for table arrival_anchors"}`. Catalog: `mark_arrival` is `SECURITY DEFINER`,
  `search_path=public, pg_temp`; `role_routine_grants` shows EXECUTE for `authenticated`/`postgres`/
  `service_role` only, no `anon` row; `role_table_grants` on `arrival_anchors` shows `authenticated`
  SELECT-only, `postgres`/`service_role` ALL, no `anon` row; `arrival_anchors` has `relrowsecurity`
  true and, at ship time, 0 rows (no authenticated write was made — read-only probes only).
- **`wrangler tail`.** Two 45 s windows via `perl -e 'alarm 45; exec …'` (no `timeout` binary on this
  shell). Quiet window: 0 lines (ambiguous alone). Traffic window: 3 requests generated
  (`/api/version`, `/auth/signin`, `/desk`) → exactly 3 captured lines, all `outcome: "ok"`, all
  `exceptions: []`, all on `scriptVersion.id = 9c599663-30ce-4ccf-8116-0ab15478a3f1`, statuses
  200/200/307 matching the requests. 0 error/exception lines.
- **Verification verdict: verified.** All checked items PASS (bottom row, chunk counts, liveness,
  RPC ACL, tail, main-head/merge structure). One noted non-blocking caveat (the PostHog vendor cookie
  literal, above). No signed-in walk was performed or attemptable by an automated agent — arrival
  declines under `navigator.webdriver` by design (CONTRACT §3) — and none of this checklist can close
  that gap.

## Evidence at the ship head (`e2aabbe36`)

- **Lane — `qa/arrival-lane.md` §AA.5.** 99 test instances (33 unique × 3 projects) at `e2aabbe36`:
  **chromium** 27 passed / 1 flake-then-pass / 5 skipped; **mobile-chrome** 32 passed / 1 skipped, 0
  failed; **webkit** 27 passed / 1 flake-then-pass / 5 skipped. The one flake is
  `accessibility.spec.ts:24` — the documented first-test cold-server SR race (8th+ occurrence across
  rounds), confirmed flake-then-pass by an isolated rerun clean on all three projects (§AA.4). §AA.7:
  the mobile-chrome real-touch swipe/tap proof (`touch-wait-gesture.spec.ts:152/200`, CONTRACT §4e)
  ran for real (not `test.fixme`) and passed both cases outright.
- **Legacy — `qa/arrival-lane.md` §AC.** Two consecutive quiet-window passes of the 36-file legacy
  regression, byte-identical to `qa/legacy-baseline.md`: 45 passed / 37 failed / 4 skipped / 86 did-
  not-run in both passes; failing-file set (29 files) identical to the baseline by `cmp` and sha256 in
  both passes (`comm -23`/`comm -13` against the baseline both empty). The round-8 3-file reds
  (`mood-board/project-board-paths`, `people/bring-forward`, `people/call-sheet`) did not reproduce
  once the shared local Postgres was quiet (load ~5 vs. ~40, 0 non-idle backends) — read as
  contention, not an arrival-code or test-order regression (§AC.4).
- **Review — round 9 (CONTRACT §4g).** Doctrine, react-next and ship-risk lenses all clean at
  `e2aabbe36`: 0 majors, 2 minors deferred (below), confidence 0.45, 28 notes. No further code round.

## First-day watch (CONTRACT §4g)

PostHog query, in words: count `arrival_ended` events with `how = 'declined'` and `cause` in
(`hidden`, `late`), grouped by `surface` (`desk` / `document`), as a share of **all** `arrival_ended`
events for that surface, over the first 24 h after deploy (started 2026-09-29T18:33:57Z). **Above
25 %** on either surface → investigate the readiness marks (not the 1.2 s hidden cap itself). **Above
50 %** on either surface → redeploy the prior version using the rollback command below. This monitor
was **not yet set up** as part of this ship — it is owed alongside the walk.

## Rollback

Worktree: `/Users/kody/Code/patina-merged/.codex/worktrees/agent-arr-rollback` (detached at
`c5d6090c8`, the pre-merge `main` head — code behind the prior live version `96580aea`). Command:

```
cd /Users/kody/Code/patina-merged/.codex/worktrees/agent-arr-rollback
unset ARRIVAL_E2E NEXT_PUBLIC_FLAG_OVERRIDES
eval "$(node -e '<the JSONC export recipe reading apps/designer-portal/wrangler.jsonc production vars>')"
/Users/kody/Code/patina-merged/infra/deploy-portal.sh designer
```

`deploy-portal.sh:43` sets `REPO_ROOT` from `git rev-parse --show-toplevel` (the cwd), so this builds
the rollback worktree's code; `wrangler.jsonc`/`deploy-portal.sh` have no diff between `c5d6090c8` and
`6b3cf072d`. Faster lever, used live 2026-08-26 per the incident record:
`npx --prefix apps/designer-portal wrangler rollback 96580aea-2388-4fdc-b372-b23cbb606947 --name
patina-designer-portal --yes`. Migration `00675` stays either way (additive; `pl-*` session keys are
inert on the prior code).

## Deferred to the first post-ship patch (CONTRACT §4f/§4g)

- `closeGesture(true)` at the top of `herScroll()` — a wheel/scroll key that arrives while a touch/pen
  press that already ended the wait is still down is not currently counted as her scroll.
- Engine `onCancel`: on a stationary long-press on the act in Acts 1–2 that the browser takes over
  (`pointercancel` with no `touchmove` — e.g. an iOS/Android link-preview or context menu), only clear
  the press; advance the card on `early()` instead of leaving it to the 10 s hold timer. Never a yank
  or a broken page either way — just a longer hold today.
- Optional: measure the put-down landing's `HARD_ENTRY_READY_MS` window from the Desk commit instead
  of from the unplayed decision, if "never a yank" is later read strictly (today it can land the
  roster row up to ~12–16 s after put-down for a reader who hasn't scrolled).

## Owed to Kody

- The signed-in walk on a real screen, phone and VoiceOver: Desk plays; a Document plays; Escape;
  Skip; a Stripe-return decline; a put-down lands the row; on the iPhone, one put-down with a swipe
  during the wait (the roster row must **not** land) and one with a tap during the wait (the row
  **does** land).
- Retire the rollback worktree (`agent-arr-rollback`) after that walk.
- Push of any fix from the deferred list above.
- The deferred lists carried at CONTRACT §4c–§4g stay open as recorded there (lazy-loading the engine
  chunk, the wall-clock watchdog during a focus-paused hold, the body-mutation guard's third-party-node
  rate, href suppressions on modifier/middle clicks, and the rest).
- The v1 limitation D3 accepted: no since-line / "nothing new" fact ships this round; a v2 reader
  normalizes `arrival_anchors` rows through `document_state` (never inside the SECURITY DEFINER RPC).
- Open R-DM rulings (R-DM1–7, R-DM8–38) stay assumed as built per the resume record; not reopened by
  this ship.
  this ship.

## Post-ship patch 1 — 2026-09-30

**Symptom.** Production arrivals could show their own hidden cap: the root (Document or Desk) surfaced
before its ready waterfall settled, then the 1.2 s hidden cap could decline the entry `hidden` while
readiness was still catching up underneath — the before-matrix is CONTRACT §4h's soft/hard latency
cells at +0/+150/+350.

**Cause.** Hidden cap vs. ready waterfall (CONTRACT §4h): the root showed as soon as it could render,
and the hidden cap ran from that same commit, independent of how far the surface's own ready
conditions (the paper's reads, the lens gate, the Desk's second-wave reads) still had to go.

**What changed.**
- The wait now holds "Picking up…" over the hidden paper (Document) or the skeleton (Desk), chrome
  visible, until the entry cap (4 s soft / 8 s hard), instead of showing the root immediately and
  declining `hidden` 1.2 s later.
- The Document's ready mark now waits for the lens resolve pass, bounded `LENS_RESOLVE_MAX_MS` (3 s)
  from the paper's first layout — a §3 amendment, narrowed from "never global `useIsFetching`" to "the
  paper's own queries, by denylist."
- The lens gate's count excludes a denylist of four chrome query families
  (`OFF_PAPER_QUERY_KEYS` in `use-lens-density.ts`): `inboxKeys.unreadCount()`,
  `['procurement-unread-count']`, `['help-content', …]`, `['document-time-today']` — so those chrome
  reads no longer hold the lens open.
- A press, key, wheel or swipe still ends the hold at once, same as before the patch.

**Rulings (Kody, 2026-09-30, interview).**
1. Late-hold bound — entry caps as built (4 s soft / 8 s hard of "Picking up…"/skeleton, chrome
   visible); watch PostHog `arrival_ended` `how='declined'` `cause='late'` per surface, >10% → revisit.
2. The four +350 ms latency cells — rig limit (HTTP/1.1 six connections + serial `auth.getUser` lock);
   stay `test.fail`; the first-24 h PostHog `arrival_ended` watch (late/hidden/mutation per surface) is
   the acceptance gate.
3. Lens gate — accept the scoped denylist (four chrome query families, bounded 3 s) as a §3 amendment
   ("never global `useIsFetching`" → "the paper's own queries, by denylist"); recorded in
   `docs/vision/VISION-DECISIONS.md` V12.
4. Follow-ups to ticket, not in this ship: warm Desk/Document hold gap; Desk reads outside ready
   (`useRunningTimer`, `useProfile`); m9 paint + denylist dedupe next to the key owners.

**Evidence at `99df90280`** (branch `arrival/hidden-cap-fix`, worktree `agent-arr-hidden`, six commits
over main `989a8762d`): review clean; arrival lane green (3 projects); legacy 36 byte-identical to
baseline; designer-portal jest 8854/8854 passed.

**Rollback.**
- Patch only: `npx --prefix /Users/kody/Code/patina-merged/apps/designer-portal wrangler rollback
  9c599663-30ce-4ccf-8116-0ab15478a3f1 --name patina-designer-portal --yes` (returns to arrival v3 as
  shipped, without patch 1).
- Full revert: worktree `agent-arr-rollback`, or Worker version `96580aea-2388-4fdc-b372-b23cbb606947`
  (pre-arrival).

**24 h PostHog watch thresholds** (per `surface`, `desk` / `document`):
- `arrival_ended` `how='declined'` `cause='late'`, share of all `arrival_ended` for that surface:
  **>10% → revisit** the late-hold bound (ruling 1) / accept the +350 rig-limit ruling as closed
  (ruling 2). §4g's existing `hidden`+`late` thresholds (25% investigate, 50% roll back) still stand
  independently.
- `arrival_ended` `how='mutation'`, share of **played** runs for that surface: **>10% → find the read**
  still printing into the root after ready (Document: the soft +150 lens ruling is no longer
  theoretical; Desk: a second-wave read beyond the round-5 studio-members fix).

**Deploy record (filled by the deploy step).**
- `DEPLOYED_VERSION: f596093d-4815-4325-b748-1346ea692bdb`
- `DEPLOYED_AT: 2026-09-30T23:23:54.250Z`
- `MERGE_SHA: 3cad15918d6ed8fea544f10f940f60d593be6d1e`
