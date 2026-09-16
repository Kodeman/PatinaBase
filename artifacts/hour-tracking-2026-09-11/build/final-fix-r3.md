# Final fix — integration round 3

Branch `hour-tracking/integration` in
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-integration`, from
`b030275f8` → **`5ffe24667`** (pushed). `origin/main` (`b88fd4c5`) is still an
ancestor. iOS work was done on `hour-tracking/ios` in
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-ios` (`35336ba7a`,
pushed) and merged here as `chore(time): merge ios fixes`.

Three commits:

| sha | |
|---|---|
| `e47f1b2cc` | `fix(time): the day a person reads is the day she worked (HT-13-b, R3-m1, MS-10, N-02)` |
| `9bb6009b3` | `style(time): prettier the folio date cases` |
| `35336ba7a` → `5ffe24667` | `fix(field): an hour nothing priced is not "Billable", and a span grows backwards (R3-m2, W6-R3-07)` + the merge |

**Strata was not touched by any means, read-only included.** No `db push`, no
`functions deploy`, no `wrangler`. 54321/54322 were never contacted; port 3100
was not used this stage.

---

## §1 — One disposition line per round-3 finding

### Money + security lens (`final-review-money-security-r3.md`)

| id | sev | Disposition |
|---|---|---|
| **MS-15 / HT-10-b** | MAJOR (escalation) | **RULED BY KODY 2026-09-14 — the exception stands; ZERO code change.** `rulings.md`'s HT-10-b row is amended to describe what round 3 measured: the exception covers **bulk, per-member reads AND writes on the projects she leads** — the ledger, the rollup (which names each teammate beside her rate), `project_unbilled_time`'s `notes`, the studio CSV, and UPDATE/DELETE because the 00177 policy is `ALL` — not one row at a time. The round-2 preamble that called it an open escalation is rewritten. Option (b) (column split + definer correction RPC) recorded as owed follow-up, not a ship gate. |
| **MS-06 / P2-M2 / W7-R6-04** | MAJOR | **NOT CLOSED — not closable here.** The PostHog token is still expired; I did not retry (a fifth failed attempt adds nothing). `studio-workspaces` and `agreement-parts` rollout percentages remain UNREAD. **Hard pre-ship gate, unchanged** (ship-checklist G1). |
| **R3-m1** (money) | MINOR | **FIXED, as corrected by the finding.** `log_time` (00608, edited in place) raises `invalid_parameter_value` when `p_started_at > now() + interval '26 hours'`. 26 h is the band HT-13-a's noon-UTC convention honestly produces (UTC+14 naming her own today); tighter would refuse real hours. Closes **W7-R5-07**. **W6-R3-07 is closed at its cause instead of by a span-end bound** — see R3-m2/W6-R3-07 below — because a server bound on `start + duration` would have to admit 26 h PLUS a legitimate long span and would then refuse honest hours at the edge. The two date-only doors (`hours-ledger.tsx`, `log-time-sheet.tsx`) carry `max={today}` so neither offers a day the server refuses. New SQL case (f) in `time_log_rpc_test.sql`: +400 d refused, +3 d refused, +25 h accepted, no row left behind. |
| **R3-m2** (money) | MINOR | **FIXED, as corrected by the finding — not the one-liner.** `FieldHourRow` gains `hourlyRateCents` and `SupabaseFieldHoursService` selects `hourly_rate_cents`; `FieldHoursWeek.worthLabel` now mirrors `timeRateProvenance`'s three states, keying on the RATE first: a rate → `Billable` / `Awaiting authorization`; `rate_source = 'none'` → `Rate pending`; NULL source with no rate → `Rate not recorded`. Two new Swift tests pin all four shapes; `WorkMocks` updated so the mock surface reads honestly. |
| **R3-m3** (money) | MINOR | **FIXED, and the ruling was written rather than amended** — see HT-13-b in §2. `buildTimeLineDraft`'s `.slice(0, 10)` is gone; the folio's dates are cut in the studio viewer's zone at compose time (the only honest moment — the client portal renders the persisted string verbatim, and its own `formatShortDate` parses `YYYY-MM-DD` as UTC midnight and prints in UTC, so the stored value is what the homeowner reads). Three jest cases: west of UTC, east of UTC, and the sort key. |
| **R3-m4 / MS-09** | MINOR | **FIXED.** `scripts/run-sql-tests.sh` now uses `mktemp -d "${TMPDIR:-/tmp}/run-sql-tests.XXXXXX"`. ⚠ The fix lives in **this branch's** copy; the gate commands run the **main checkout's** script, which is on stale `main` and still fails in a sandboxed shell — every gate below was therefore run with the sandbox disabled. The repair reaches the gate only after this branch merges to `main`. |
| **R3-m5 / MS-10** | MINOR | **FIXED (accepted-as-residual overturned).** `studio_member_rates_admin_update`'s `WITH CHECK` gains the active, non-guest subject `EXISTS` its sibling INSERT has carried since W1-R1-09. `USING` deliberately NOT narrowed: an admin must still reach the row of a member who has left, and `close_prior_studio_member_rate` is DEFINER (owner, RLS not forced) so the ladder is untouched. Verified on the reset stack by reading `pg_policy.polwithcheck`. |
| **N-01** | note | **Accepted as residual, unchanged.** Ruled by HT-10; the program strictly narrows the prior state. |
| **N-02 / N-13** | note | **FIXED. The function is `public.stamp_time_entry_updated_by()`.** It now carries `SET search_path = public, pg_temp` and `REVOKE ALL ... FROM PUBLIC, anon, authenticated, service_role` — the same shape `audit_time_entry_change()` takes eleven lines below it in the same migration (a trigger function needs no EXECUTE at fire time; Postgres checks the privilege at `CREATE TRIGGER`). **anon had no reason to call it**: no anon-reachable path writes a time entry, and a direct call raises "trigger functions can only be called as triggers". Probed after reset: `proconfig = {search_path=public, pg_temp}`, `has_function_privilege('anon', …) = f`. ACL seed regenerated. |
| **N-03** | note | **Accepted as residual, unchanged.** |
| **N-06 / N-10** | note | **FIXED — two allowlist edits.** `capture_enrichment/target_type_visibility_test.sql` is now a `KNOWN_FAILURES.md` entry naming 00584's four `field_captures_studio_*` policies (the cause already documented for its sibling) and stating that no migration in 00595–00620 defines a policy on those tables. `document/close_project_readiness_test.sql`'s reason is corrected to the raise it actually hits now (`studio_id_not_designer_studio` at `:331`), with the original grant boundary recorded as real but unreachable behind it. |
| **N-07** | note | **Accepted as ruled residual, unchanged** (D-R2-01). |
| **N-15** | note | **FIXED by deletion.** `TimeEntryFilters` had zero consumers anywhere in the repo and documented `to` as an INCLUSIVE bound where the only implemented window is exclusive. Deleted from `use-time-tracking.ts` and from `hooks/index.ts`'s export list, with a comment in its place pointing at `TimeEntryLedgerParams`. |
| **MS-05** | pre-push | **Not run — Strata untouched.** Still §1②a of the checklist. |
| **P2-M1 / R3-M3** | major | **Not closable here** (it is about which checkout runs the push). Checklist §0a stands. |

### Product + ship lens (`final-review-product-ship-r3.md`)

| id | sev | Disposition |
|---|---|---|
| **R3-M1** | MAJOR | **CLOSED. I am the one clean reset.** `supabase db reset --workdir …/agent-integration` was run twice: once to apply the edited migrations, then — after `generate-legacy-grants.py` picked up the two new GRANT/REVOKE deltas — **once more, and that second reset is the state every gate below read.** No hand `psql -f` of any migration file afterwards. Both `roster_role` probes return 1; `studio_hours_rollup` has exactly one `pg_proc` row, the seven-argument one. |
| **R3-M2** | MAJOR | **CLOSED by HT-13-b** (§2), not accepted. Rolled up server-side and printed portal-side in the caller's zone; the `2999-01-01` component case proves the entries list no longer prints `row.day` in any timezone. |
| **R3-M3** | MAJOR | = P2-M1. **Not closable here.** |
| **R3-M4** | MAJOR | = MS-06. **Not closed. Hard pre-ship gate.** |
| **R3-m1** (product) | MINOR | **FIXED.** `time-export.ts` writes `csvField(row.member_name ?? "Unnamed member")` — the word the rollup has always used for the same row (00607). Existing test updated from `'""'` to `'"Unnamed member"'`. |
| **R3-m2** (product) | MINOR | **NOT FIXED — accepted as residual, deliberately.** `+ Add a role` at 69 × 18 is a §A floor miss and belongs with the two carried sub-44px `Remove` acts (W7-R6-05 / W7-R5-03) in **one §A pass**, which is a design act on a surface I cannot measure in this lens. Named in the ship report; not a money or security defect. |
| **R3-n1** | note | **Accepted, pre-existing** (`‹ earlier`, `Bill week → Accounts`). Sweep them with R3-m2. |
| **R3-n2** | note | **Honoured.** The designer-portal suite was run **alone** on the ship pass: `581 passed / 7452 passed`. No intermittent red recurred. |
| **R3-n3** | note | **FIXED.** The stale `/** Local calendar date … the rollup takes dates. */` above `isoDate` now says what is true: not a query bound since P2-B1; it survives for the export filename and the analytics `period`. |
| **R3-n4** | note | **Not fixed — ruling owed, unchanged.** Does the internal-time door need to name its studio for a multi-studio owner? Carried to Kody's walk. |
| **R3-n5** | note | **Recorded, no action.** A local-dev trap (`127.0.0.1:3100` vs `localhost:3100`), not branch content. |
| **R3-n6** | note | Rulings owed: **P2-n1 is now CLOSED** by HT-13-b, and **HT-10-b is RULED**. Still owed: **P2-n3 / W7-R6-03 / S-9**, **HT-25-a**, **HT-6-a**, **HT-6-b**, **R3-n4**. |
| **R3-n7 / S-6** | note | **Not fixed — reproduced and quantified instead.** `run-sql-tests.sh -d <subdir>` still normalizes printed paths against the `-d` root, so a `KNOWN_FAILURES.md` written as `supabase/tests/…` matches nothing when the run root is this worktree — even with an explicit `-k`. Every red below was therefore classified by hand against the file. Fixing the normalization is a change to a shared script's core logic, which is not a low-cost edit and is not this stage's job. |
| **W6-R3-01 / -02 / -10** | residual | **Accepted, unchanged.** No device this session. |
| **W6-R3-06** | residual | **FIXED** — see R3-m2 (money). |
| **W6-R3-07** | residual → **fixed** | **FIXED at its cause.** `FieldLogTimeDraft` gains `endAnchor`: a draft opened with no active visit anchors its END at the moment the sheet opened and every duration change moves the START back. An active visit's observed `startedAt` never moves; `setStartedAt(_:)` (the day picker) drops the anchor. `startedAt` is now `private(set)` so the invariant cannot be bypassed. Three Swift tests. |
| **W7-R6-03 / P2-n3** | residual | **Accepted + ruling owed, unchanged.** |
| **W7-R6-05 / W7-R5-02 / W7-R5-04** | residual | **Accepted, unchanged.** |
| **W7-R5-07** | residual | **CLOSED** by R3-m1's `log_time` bound. |
| **n7-02 / n7-05** | closed | Unchanged. |
| **n7-06** | residual | **Accepted, unchanged.** |
| **W3-R5-m3** | residual | **Accepted, unchanged.** |
| **W3-R5-m5** | resolved | Unchanged. |
| **P2-n1 residual** | open | **CLOSED by HT-13-b.** `rulings.md`'s standing cell rewritten. |

---

## §2 — HT-13-b, as implemented

Recorded in `rulings.md` under a new "Integration round 3" block.

* **00607 (edited in place)** — `p_timezone text DEFAULT 'UTC'` appended **last**, so no
  positional caller moved. `day` / `iso_week` bucket key AND label are cut on
  `(scoped.started_at AT TIME ZONE v_zone)`; an unreadable name raises
  `invalid_parameter_value` in the function's own voice (probed with a cheap
  `PERFORM now() AT TIME ZONE v_zone`, not a `pg_timezone_names` scan). The
  **six-argument instant overload is DROPPED** beside the `date` one — a defaulted
  argument makes a surviving overload ambiguous rather than resolved — and two new
  postconditions pin both that and the zone-derived buckets. `00613`'s two
  `to_regprocedure` strings follow the new signature.
* **`time_entry_ledger` keeps its UTC `day`.** It is the fact view's basis and 00599's.
  The portal derives displayed dates from `started_at` instead, via one new pair of
  helpers in `time-derivation.ts` (`viewerTimeZone()`, `localDateOf()`).
* **The studio entries list** (`ScopeEntryRow`) prints `localDateOf(row.started_at, tz)`.
* **The CSV** carries a caller-supplied `local_date` per row (the sheet knows the zone;
  the builder stays pure), falling back to `row.day`.
* **The client folio** — `buildTimeLineDraft` takes an explicit `timeZone` defaulting to
  the composing viewer's, so the tests cannot be made vacuous by a machine's own zone.
* **No studio timezone column. HT-13-a stands.** The WINDOW is untouched — an instant
  range since P2-B1, and an instant range needs no zone.

---

## §3 — Gates, verbatim

Every command below ran against the **second, final `supabase db reset`**, with no hand
`psql -f` afterwards. The sandbox was disabled for the SQL-suite and `supabase`/`git`/Xcode
commands only (see R3-m4).

```
supabase db reset --workdir /Users/kody/Code/patina-merged/.codex/worktrees/agent-integration
  → Finished supabase db reset on branch main.   (twice; the SECOND is the one every gate reads)

post-reset probes (psql -h 127.0.0.1 -p 54422)
  studio_hours_rollup                        → exactly ONE row:
    studio_hours_rollup(uuid,timestamptz,timestamptz,text,uuid,uuid,text)
  classify_project_time_entry_authority ~ roster_role   → 1
  resolve_time_rate_cents               ~ roster_role   → 1
  stamp_time_entry_updated_by  proconfig → {search_path=public, pg_temp}   anon EXECUTE → f
  studio_member_rates_admin_update WITH CHECK → is_org_admin_or_owner(studio_id)
                                                AND EXISTS(organization_members … active … <> guest)
```

| Gate | Result |
|---|---|
| `run-sql-tests.sh -d …/supabase/tests/billing -H 127.0.0.1 -p 54422` | **9 / 9 PASS, 0 fail.** Includes the new `time_log_rpc_test.sql` case (f) |
| `run-sql-tests.sh -d …/supabase/tests/commercial …` | **10 green · 6 red.** All six are in `KNOWN_FAILURES.md` (`authorized_schedule`, `design_services_authority`, `design_services_gap_hardening`, `executed_on_paper`, `trade_rfq`, `trade_scope`) — the runner reports them "unexpected" only because of R3-n7's path normalization. Both program files (`agreement_fee_schedules`, `agreement_parts`) green |
| `run-sql-tests.sh -d …/supabase/tests/rls …` | **29 green · 2 red.** Both allowlisted (`design_requests_test`, `studio_titles_test`). `studio_hours_rollup_test` (with the new case **(j)**), `studio_member_rates_test`, `internal_time_test`, `project_hours_total_test`, `time_entry_admin_write_test`, `time_entry_auto_roster_test`, `time_entry_studio_stamp_test` all green |
| `run-sql-tests.sh -d …/supabase/tests/field …` | **6 green · 1 red** (`field_capture_note_routing_test`, allowlisted). `time_entry_activity_travel_test` green |
| whole tree, `-d …/supabase/tests` | **188 files · 163 green · 25 red.** **23 of the 25 carry a `KNOWN_FAILURES.md` entry** (verified by matching every red against the file by hand). **Exactly two do not, and both are named standing non-program reds:** `edge_api/catalog_roles_remote_conformance_negative_test.sql` (isolated-stack artifact — the file hard-refuses any port but 54322) and `proposals/proposal_copy_immutability_test.sql` (`proposals column census drifted` by `subject`, added by `00590` **on `origin/main`**). The third standing red, `capture_enrichment/target_type_visibility_test.sql`, is now allowlisted by N-06 |
| `pnpm --filter @patina/supabase type-check` | **PASS**, exit 0, no output |
| `pnpm --filter @patina/designer-portal type-check` | **PASS**, exit 0, no output |
| `pnpm --filter @patina/designer-portal test` (run ALONE, R3-n2) | **PASS — `Test Suites: 581 passed, 581 total / Tests: 7452 passed, 7452 total / Snapshots: 1 passed`, 29.0 s** (7445 → 7452: seven new cases) |
| `pnpm --filter @patina/designer-portal lint` | **PASS — `✖ 202 problems (0 errors, 202 warnings)`.** 201 → 202: one new unused-`eslint-disable` warning class, same posture, zero errors |
| `pnpm --filter @patina/client-portal type-check` | **PASS**, exit 0 |
| `pnpm --filter @patina/client-portal test` | **PASS — `151 passed, 151 total / 2475 passed`** |
| `pnpm --filter @patina/admin-portal build` | **PASS** — full route manifest emitted, no type errors (the repo's strictest gate; `packages/supabase` is in this diff) |
| `deno test --allow-all --config …/functions/deno.json …/functions/time-nudges` | **`ok | 16 passed | 0 failed` (26 ms)**. No `deno.lock` at the worktree root afterwards |
| `pnpm --filter @patina/supabase test` (not in the brief; the package is in the diff) | **PASS — `Test Files 102 passed (102) / Tests 1259 passed | 12 skipped`** |
| iOS — `git -C …/agent-ios merge --ff-only origin/hour-tracking/integration`, `ruby scripts/generate_project.rb`, `scripts/capture-gate.sh all` | **PASS — `✔ build · ✔ tests · ✔ lint · ✔ fc-r3 sweep (inbox) · ✔ fc-r3 sweep (ai) · ✔ principle-4 sweep`**, exit 0. `generate_project.rb` produced **no `.pbxproj` diff** (no file added/removed/renamed). **Simulator only — NOT device-verified.** |
| Generated types | `SUPABASE_DB_URL=…54422 pnpm db:generate` → one line added, `p_timezone?: string` on `studio_hours_rollup`'s Args. Committed. **In sync.** |
| ACL seed | `python3 scripts/generate-legacy-grants.py` → *baseline + **2651** replayed statements* (was 2650). Diff is exactly the three expected lines: the new `stamp_time_entry_updated_by` REVOKE and the two rollup grants re-typed to the seven-argument signature. Regenerated **before** the final reset, so the stack was seeded from it. Committed. |

---

## §4 — What I did NOT do

* **Strata / prod: untouched.** Not by SQL, not read-only, not by the CLI. MS-05's eight
  numbers are still unread.
* **The two PostHog rollout percentages: still UNREAD.** I did not retry the expired
  token. **MS-06 / G1 remains a hard pre-ship gate and nothing here moves it.**
* **No device pass.** Every Field claim is compile-green + sim-verified. The
  `worthLabel` change and the end-anchor change were proved by CaptureKit unit tests, not
  by a phone.
* **Portal e2e / Playwright: not run** this stage (the brief's gate list does not include
  it, and the Hours suite's 8/8 was measured at round 3 on content this round does not
  change — but `hours-ledger.tsx` DID change, so the Hours e2e is **unre-run**, and that
  is a real gap I am naming rather than papering over).
* **No browser walk.** HT-13-b's portal half is proved by jest and by the SQL case, not
  by a render. The `2999-01-01` case makes the entries-list assertion timezone-independent;
  the rollup argument is asserted against the runtime's own `Intl` answer.
* **`@patina/design-system` vitest: not run** (it hung in round 2; not retried).
* **Lint outside designer-portal: not run** — no other flat config resolves.
* **R3-m2 (product, `+ Add a role` 69 × 18) and the two carried sub-44px `Remove` acts:
  not fixed.** One §A pass, deliberately left whole.
* **R3-n7's `-d <subdir>` allowlist normalization: not fixed.** Quantified instead.
