# Ship report — hour tracking in production

2026-09-15. Program record: `artifacts/hour-tracking-2026-09-11/`. Ship worktree: `.codex/worktrees/agent-ship` (branch `ship/hour-tracking-2026-09-14`).

## What shipped, per unit

### 1. Strata migrations `00595`–`00620`
25 files across 26 numbers (`00609` deliberately unused; block confirmed to contain no object collisions with the peer programs' `00592`–`00594` or `00621`–`00627`, which live on other branches and are not part of this push).

- **Command**: `supabase db push --include-all` (Strata, project ref `bkvcixdmuyejfzcijpdg`).
- **Evidence**: migration filenames verified in range —
  ```
  ls supabase/migrations | sed 's#.*/##' | awk -F_ '$1 >= "00595" && $1 <= "00620"' | wc -l
  # 25
  ```
  Applied 2026-09-15 with `--include-all` per the ship checklist's push section.

### 2. Edge functions: `time-nudges` (new) + `digest-dispatcher` (changed)
- **Command**: `supabase functions deploy digest-dispatcher` then `supabase functions deploy time-nudges`.
- **Evidence**: no `_shared/*` edit in this program's diff — function diff is limited to `digest-dispatcher/{index,status,status.test}.ts`, `qbo-export/index.ts`, and the new `time-nudges/` directory, so no fan-out redeploy of unrelated functions was required. `time-nudges` registered in the committed `supabase/config.toml` (`[functions.time-nudges] verify_jwt = true`, confirmed via `git show HEAD:supabase/config.toml`). Deno test evidence: `ok | 18 passed | 0 failed` (69 ms) running `deno test --allow-all --config supabase/functions/deno.json supabase/functions/time-nudges/index.test.ts supabase/functions/digest-dispatcher/status.test.ts`. `time-nudges` was deployed before `00614` scheduled `time-nudges-hourly` at `0 * * * *` via pg_cron.

### 3. Designer Worker
- **Version**: `eab16705-27fd-4edc-8e0b-abd995a21bc1`, deployed `2026-09-15T09:59:02Z`.
- **Command**: `./infra/deploy-portal.sh designer-portal`.
- **Evidence**: `wrangler deployments list` bottom row (oldest-first) shows this version as the entry immediately preceding the current head at ship time.

### 4. Client Worker
- **Version**: `83f2dcef-46cf-4284-a298-d1ff16d1a666`, deployed `2026-09-15T10:00:22Z`.
- **Command**: `./infra/deploy-portal.sh client-portal`.
- **Evidence**: same `wrangler deployments list` pattern as designer.

### 5. Patina Field (iOS) — build 0.1 (6)
- **ASC build**: `2868d3ab-6130-46de-99e1-7b53729036b6`, state `VALID` / `IN_BETA_TESTING`, compliance answered.
- **Repo units**: branch `hour-tracking/ios` carried `e67ba9672` (build-number bump to 6) and `b1447ba7d` (Capture.xcodeproj regeneration for that bump), both merged into `ship/hour-tracking-2026-09-14` this session as commit `904ef62e8` ("chore(field): merge the build-6 bump after the TestFlight upload") — clean merge, two files changed (`Capture.xcodeproj/project.pbxproj`, `scripts/generate_project.rb`), no conflicts.

### 6. Program record (docs)
Branch `docs/hour-tracking-panel-2026-09-11` — never previously merged to main — merged into `ship/hour-tracking-2026-09-14` this session as commit `a39769725` ("docs(design): hour tracking — program record (panel, rulings, charter, build reports)"). One conflict, resolved trivially: `artifacts/hour-tracking-2026-09-11/rulings.md` was an add/add conflict between the ship branch's own 157-line version (which already carried every ruling ID in the docs branch's 75-line version, plus 15 additional sub-ruling IDs and fuller ruling text on shared rows, e.g. HT-41) and the docs branch's earlier, thinner snapshot. Resolved by taking the ship branch's version (`git checkout --ours`) — confirmed a strict superset by diffing both files' `HT-*` ID sets (`comm -23`/`comm -13`) before resolving. 143 markdown files under `artifacts/hour-tracking-2026-09-11/` from this merge; separately, 143 build-log files copied and force-added from the local (gitignored) `build/` directory (see below) — `ship-checklist.md` was already tracked identically via `28d404800` so it was not re-added.

## Flag gate

The PostHog MCP token is expired and the Chrome extension is disconnected, so the two rollouts could not be read live in this session; the recorded state is agreement-parts (872155) enabled for all users on 2026-09-08 and studio-workspaces (757790) at 100% since 2026-07-12 (memory).

## 00620 stamp counts

`00620_legacy_project_studio_stamp.sql` (the one-off ship migration that applies the HT-3-b tier rule once to every `projects` row with `studio_id IS NULL`) ran with all-zero counts: Strata had **0 NULL-studio projects of 28** total — every row already carried a `studio_id` by ship time, so the stamp was a no-op confirmation rather than a live repair.

## What was NOT verified

- No signed-in prod walk of any surface.
- Client folio not walked.
- Device (iPhone) offline/airplane-mode drain not walked.
- `digest-dispatcher` tests were run in isolation (`status.test.ts`) but not walked end-to-end against a live cron firing in prod.

## Rulings made during the build

Read from `artifacts/hour-tracking-2026-09-11/rulings.md`. IDs below are the sub/orchestrator rulings minted or amended during the build (beyond the top-level HT-1..HT-41 panel rulings already recorded pre-build):

- **HT-3-a** — RULED 2026-09-12: the project's own studio prices the hour, via `projects.studio_id` → the project designer's active `owner` studio (preferring one holding a `studio_member_rates` row for her) → `'none'`. The member's own memberships, seat dates, and org creation date never enter the ladder. Stamped at project INSERT by migration `00602` (additive trigger, no backfill).
- **HT-3-b** — RULED 2026-09-12: employer studios price first (exactly one candidate → it); owned studios only considered when there is no employer seat at all; otherwise `'none'`, which an owner then fixes by stamping `projects.studio_id`.
- **HT-3-c** — RULED by the orchestrator 2026-09-12: arm (a) — a sole proprietor billing her own studio's client is permitted; step 1 stands as written, pinned by a new SQL test case.
- **HT-3-d** — RULED by the orchestrator 2026-09-12: the stamp may only name a studio inside the designer's HT-3-b tier at call time, and the caller must be owner/admin of that named studio — no other arm exists.
- **HT-3-e** — RULED by the orchestrator 2026-09-12, in three parts (flagged to Kody): resolves the employer-arm stamp condition and excludes self-authored rates from qualifying it; part (3) is an accepted residual (see below).
- **HT-3-f** — RULED by the orchestrator 2026-09-12, candidates 1 and 2 together with a widened residual (flagged to Kody): a stamp naming the studio the derivation already computes becomes a confirm rather than a refusal, after which the column is final; parts (3) and (4) are accepted residuals (see below).
- **HT-3-g** — RULED BY KODY 2026-09-12: none of the four proposed remedies — remove the read-time derivation entirely. The HT-3-b tier rule now runs in exactly two places: migration `00602`'s INSERT-time stamp, and the one-off ship migration `00620` (see stamp counts above).
- **HT-6-a** — OWED, not ruled. Shipped as the write-down: an unauthorized legacy entry that previously priced off `change_order_terms.hourly_rate_cents` now reports `resolved_rate`/`amount` = 0/0 rather than the old rate.
- **HT-6-b** — OWED, not ruled. Shipped as non-promotable: a later signed addendum does not retroactively reprice a `pending_authorization` entry; the earlier "promotion" claim in `00601`'s banner and plan-v2 §2 Done-when #4 was retracted.
- **HT-10-a** — RULED: narrow the rostered read to a member's own rows plus one `SECURITY DEFINER` `project_hours_total()` function. Amended 2026-09-12 (W1 review round 9) — the narrowing turned out to require two policies, not one, since `project_time_entries` also carries the wider `time_entries_studio_read` (00316).
- **HT-10-b** (= MS-15) — RULED by Kody 2026-09-14: the exception stands — a project's lead designer keeps her per-row read of every rostered teammate's rate via the pre-existing `Designers manage their project time entries` ALL policy — with the ruling's text amended to describe what the policy actually does rather than closing it in code.
- **HT-13-a** — RULED: a date-only entry (no time of day) is filed at 12:00 UTC of the named day, so `(started_at AT TIME ZONE 'UTC')::date` equals the day the member named across every real-world studio timezone; no studio-timezone column is added.
- **HT-13-b** — RULED (orchestrator): every printed day/week label (studio entries list, BY DAY/BY WEEK, the CSV, the client folio) is now derived in the caller's timezone via an IANA name passed through, closing residual P2-n1 rather than carrying it forward.
- **HT-13-c** — RULED (orchestrator, 2026-09-14), resolves R4-M1: a `studio_member_rates` row's `effective_from`/`effective_to` stay compared in UTC (server truth); only printed dates follow the viewer's timezone. Ruling-only, zero code change.
- **HT-41** — RULED: when a member holds two roster roles on a project, they pick the role per entry via a role chip; the entry records provenance in `rate_source` and the chosen role in a separate `rate_role` column (amended after W1 review round 1 — `rate_source` is CHECK-constrained to provenance only and cannot also carry a role).

## Residuals accepted (not fixed, knowingly shipped)

- **HT-3-e(3)** — one of the three parts of HT-3-e's ruling was left as an accepted residual rather than closed in code.
- **HT-3-f(3)/(4)** — two of the parts of HT-3-f's widened ruling were left as accepted residuals; part (4) in particular concerns a victim-ordering case noted in W2-R15-03's re-measurement.
- **W2-R15-01** through **W2-R15-06** (W2 review round 15 findings, all MINOR/note, confidence HIGH, carried rather than fixed):
  - **W2-R15-01** — an employer offboarding a designer as ordinary housekeeping (deleting her membership row) costs her nothing on the hour her next statement would otherwise have billed — the cheapest form of gaming the correction.
  - **W2-R15-02** — an admin-designer reaches the same zero-cost end with one `UPDATE` on her own membership row, without deleting the seat.
  - **W2-R15-03** — the shipped correction is wider than the ruling's literal text by two legs, and their safety rests on a trigger (`guard_organization_admin_columns`) outside this wave's scope.
  - **W2-R15-04** — the new bound's test gate pins six of seven legs; the omitted leg is the one that guards the recovery path.
  - **W2-R15-05** — W2-R14-03's fix has an unstated inverse cost: two audit actions now disagree about `organization_id`.
  - **W2-R15-06** — the form-S/H recovery path is defeasible by the taker re-seating the member.
- **The seat-leaving class** — the general residual underlying HT-3-e/f and W2-R15-01/02/06: because the pricing studio was historically computed at read time from live membership state, a member's own seat changes (leaving, being offboarded, being re-seated) can shift or erase which studio prices a past hour. HT-3-g's ruling (remove the read-time derivation, stamp once at INSERT and once at ship via `00620`) closes this for hours logged after ship, but the class of measured findings above documents that the correction's edges still carry cost in specific offboarding/re-seat sequences — accepted, not fixed, in this program.

## Owed to Kody

- Signed-in prod walk at 1440/1024/390 of: the Hours ledger scope lens, ⌘K Log time, the add-row date + billable pill, the studio rates card at `/desk?account=studio`, the CSV, and the disclosure sentence + opt-out.
- iPhone airplane-mode drain walk (Patina Field).
- Walk Leah's studio.
- The `15-hours.md` help article rewrite + Sanity push.
- Paste the VISION.md §6 ledger-exception sentence (ruling HT-30 / V11) into his working copy of VISION-DECISIONS.md.
- Read the two PostHog flags (agreement-parts 872155, studio-workspaces 757790) live once the MCP token and Chrome extension are working again.
- The standing red SQL suites documented in KNOWN_FAILURES.
