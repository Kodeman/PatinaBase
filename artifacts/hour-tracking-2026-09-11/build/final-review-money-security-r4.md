# Final integration review — money + security — round 4

`clean = false`

**0 blockers · 3 majors (2 new, 1 carried) · 4 minors · 8 notes.**

Branch `hour-tracking/integration` @ **`5ffe24667`** (the brief's "head `944e12a5c` + fixes
`5ee33101f`, `b030275f8`" is stale by four commits — `final-fix-r3.md` advanced it to
`5ffe24667` and pushed), worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-integration`; `origin/main`
(`b88fd4c5`) is still an ancestor. Every measurement ran on the isolated stack
**patina-hours** (Postgres `127.0.0.1:54422`). **I did not reset** — the fixer's second
`supabase db reset` is the baseline every probe below read; it is NOT drifted (evidence in
§C). Every mutation ran inside a transaction that was **rolled back**. **Strata was not
touched by any means, read-only included.** 54321/54322 were never contacted; port 3100
was not used. No file in the repo was written by this review except this report — one
accidental truncation of `packages/supabase/src/database.types.ts` (a sandboxed
`pnpm db:generate` that could not reach the Docker socket and emptied the redirect target)
was restored with `git checkout --` in the same minute and is confirmed back at 37 337
lines, `git status` clean on that path.

**Round-3 verdict: every fixable finding is discharged.** All eleven code/doc fixes in
`final-fix-r3.md` were verified here independently of the fix report. The two carried
majors are the two that were never closable in a fix pass — **MS-06** (PostHog token, now
a **fifth** failed attempt) and **MS-15 / HT-10-b**, which Kody RULED on 2026-09-14 and
which is therefore no longer open as a *finding*; it is open only as a stale line in the
ship checklist.

**Two new majors, both found by probing rather than reading.** One is a measured,
user-visible money defect on the homeowner's folio that HT-13-b newly exposed and that no
ruling or report names (R4-M1). The other is that `ship-checklist.md` — the document the
ship operator works from — has not been touched since 01:21 and still contradicts both
rulings now in force (R4-M2).

---

## §A — Round-3 findings, verified one by one

| Round-3 finding | Claimed in `final-fix-r3.md` | **Verified this round** |
|---|---|---|
| **MS-15 / HT-10-b** major | RULED, zero code change | **DISCHARGED as ruled** — §A.1. Exposure re-measured per role; matches the amended text exactly |
| **MS-06 / P2-M2 / W7-R6-04** major | NOT closed, hard gate | **STILL NOT CLOSED** — retried, fifth failure. §B.3 |
| **R3-m1** (future `started_at`) | FIXED, 26 h forward bound | **DISCHARGED** — §A.2, eight-case bound probe + the UTC+14 noon-UTC band |
| **R3-m2** (iOS `worthLabel`) | FIXED, three states + rate column | **DISCHARGED on code + tests** — §A.3. Not run on a device or Simulator in this lens |
| **R3-m3** (folio `.slice(0,10)`) | FIXED, zone at compose time | **DISCHARGED** — §A.4. Client render confirmed UTC-pinned on both readers |
| **R3-m4 / MS-09** (`mktemp`) | FIXED | **DISCHARGED — and I used it.** `run-sql-tests.sh` ran to completion in a sandboxed session, five times. §D.a |
| **R3-m5 / MS-10** (`WITH CHECK`) | FIXED (residual overturned) | **DISCHARGED** — §A.5, exploit re-run through RLS |
| **N-02 / N-13** (`search_path`, REVOKE) | FIXED | **DISCHARGED** — §A.6, and the trigger still fires after the REVOKE |
| **N-06 / N-10** (allowlist) | FIXED, two edits | **DISCHARGED** — §D.a; `capture_enrichment` now classifies EXPECTED-FAIL |
| **N-15** (`TimeEntryFilters`) | FIXED by deletion | **DISCHARGED** — gone from both files; three type-checks green |
| **N-01 · N-03 · N-07** | accepted residuals | **Unchanged, accepted** |
| **MS-05 · P2-M1** | pre-push, not closable | **Unchanged** — §E |

### A.1 — MS-15 / HT-10-b: the ruling stands and the code did not move

`pg_policy`, read off the applied stack:

```
Designers manage their project time entries | polcmd = *  (ALL)
  EXISTS (SELECT 1 FROM projects p
           WHERE p.id = project_time_entries.project_id AND p.designer_id = auth.uid())
```

No `user_id` leg; unchanged from round 3; no file in `00595–00620` redefines it. **Zero
code change, as ruled.**

Exposure re-measured per role, one rolled-back transaction, project `e3` led by a **plain
`member`** (user 7), two teammates' priced hours on it:

```
owner         | rate_cards=2 | others_rows=2 notes=2 max_rate=30000 | ledger_others=2 | rollup=2 | unbilled_notes=2
admin         | rate_cards=2 | others_rows=2 notes=2 max_rate=30000 | ledger_others=2 | rollup=2 | unbilled_notes=2
LEAD (member) | rate_cards=0 | others_rows=2 notes=2 max_rate=30000 | ledger_others=2 | rollup=2 | unbilled_notes=2
member THREE  | rate_cards=1 | others_rows=0 notes=0 max_rate=-     | ledger_others=0 | rollup=1 | unbilled_notes=0
guest         | rate_cards=0 | others_rows=0 notes=0 max_rate=-     | ledger_others=0 | rollup=0 | unbilled_notes=0
outside owner | rate_cards=0 | others_rows=0 notes=0 max_rate=-     | ledger_others=0 | rollup=0 | unbilled_notes=0
```

This is precisely what HT-10-b's amended text describes — bulk, per-member reads through
the ledger, the rollup and `project_unbilled_time`'s `notes`, on the projects she leads,
while RLS still denies her the rate CARDS (`rate_cards=0`). Every other role reads
nothing. **Nothing is wider than the ruling records.**

### A.2 — R3-m1: forward is bounded, and the noon-UTC band survives

Eight cases, each a rolled-back `log_time` call through RLS as the row's own author:

```
log_time +400 days  -> refused   (invalid_parameter_value)
log_time +3 days    -> refused
log_time +27 hours  -> refused
log_time +26h01m    -> refused        <- the edge, from above
log_time +25 hours  -> accepted
log_time +25h59m    -> accepted       <- the edge, from below
log_time now        -> accepted
log_time -400 days  -> accepted       (HT-13: backdating stays unbounded)
```

And the band the bound exists for, computed live rather than assumed:

```
UTC+14 (Pacific/Kiritimati) today = 2026-09-15
  noon-UTC instant = 2026-09-15 12:00:00+00, ahead of now() by 1 day 01:55:16
  -> ACCEPTED
```

`prosrc` carries `interval '26 hours'`; `00608`'s own postcondition asserts it. The two
date-only doors carry `max={isoDate(new Date())}` (`hours-ledger.tsx:1416`), so neither
offers a day the server refuses.

### A.3 — R3-m2: the iOS label mirrors the desk, keyed on the rate

`FieldHoursWeek.worthLabel` now branches `priced → Billable / Awaiting authorization`,
then `'none' → Rate pending`, then `Rate not recorded` — the same three states, in the
same order, as `timeRateProvenance` (`authority-hours.ts:141-173`: `hourlyRateCents > 0` →
`rated`; `rate_source === 'none'` → `pending`; else `unrecorded`). `SupabaseFieldHoursService`
selects `hourly_rate_cents` under `.eq("user_id", userID)` — her own snapshot, no new read
surface. Four shapes pinned by `aLegacyRowIsJudgedOnItsRateAndNotOnANullSource`, and the
helper's default (`hourlyRateCents: 15_000`) keeps the pre-existing assertions honest.

### A.4 — R3-m3: the folio's dates are cut once, in the composing viewer's zone

`buildTimeLineDraft(entries, timeZone = viewerTimeZone())`; `.slice(0, 10)` survives only
as a fallback when `localDateOf` returns `''`. The claim that the client gets no second
chance is **true on both readers**, checked directly rather than taken on trust:

* `apps/client-portal/.../invoice-sheet.tsx:109` — `Date.parse(value.length <= 10 ? \`${value}T00:00:00Z\` : value)` into a formatter built with `timeZone: "UTC"` (`:100`).
* `packages/shared/src/invoice/index.ts:99` (`formatInvoiceDate`, used by the design system's `InvoicePaper` print copy) — same rule, `timeZone: 'UTC'` for bare dates.

So the persisted `YYYY-MM-DD` is rendered verbatim in both places. Three jest cases cover
west of UTC, east of UTC and the sort key, each with an explicit zone so the runner's own
zone cannot make them vacuous.

### A.5 — R3-m5 / MS-10: the asymmetry is closed, and `USING` really is untouched

`polwithcheck` on the applied stack is `is_org_admin_or_owner(studio_id) AND EXISTS(…
organization_members … status='active' … role <> 'guest')`. Run through RLS:

```
1. admin UPDATE (hourly_rate_cents) on an ACTIVE member's rate row -> rows=1
2. subject demoted to guest, same UPDATE                            -> REFUSED
     "new row violates row-level security policy for table studio_member_rates"
3. admin SELECT of that same row                                    -> rows=1   (USING not narrowed)
4. plain member mints her own rate card                             -> REFUSED
```

`close_prior_studio_member_rate` is DEFINER and arrives at
`guard_studio_member_rate_history` as `current_user = 'postgres'`, so the ladder is
untouched.

### A.6 — N-02 / N-13: pinned, revoked, and still armed

```
stamp_time_entry_updated_by()  prosecdef=f  proconfig={search_path=public, pg_temp}
                               proacl={postgres=X/postgres}
                               anon=f  authenticated=f  service_role=f
```

Identical in shape to `audit_time_entry_change()` eleven lines below it. **And the trigger
still fires** — an UPDATE through RLS by the row's own author left
`updated_by = c6070000-…-000000000003`, which is the thing a REVOKE on a trigger function
could plausibly have broken and which the fix report asserted rather than measured.

---

## §B — MAJORS (2 new · 1 carried, unchanged)

### B.1 · R4-M1 · MAJOR · NEW · confidence HIGH (measured) — HT-13-b moved every printed date into the viewer's zone and left the tier-2 rate's own date anchor in UTC, so the homeowner's folio can bill an hour dated the 13th at a rate that began on the 14th

`resolve_time_rate_cents`'s **tier 2** — the per-member studio rate, HT-3's tier and this
program's flagship rate door — picks its row on a **UTC-derived calendar date**
(`00599:535-537`):

```sql
AND rate.effective_from <= (p_at AT TIME ZONE 'UTC')::date
AND (rate.effective_to IS NULL OR rate.effective_to >= (p_at AT TIME ZONE 'UTC')::date)
```

HT-13-b now prints the *same hour's* date in the CALLER's zone, everywhere: the studio
entries list, `BY DAY` / `BY WEEK`, the CSV's Date column, and the client folio's dated
sub-table. West of UTC, an evening hour's two dates differ — and the rate that prices it
is chosen on the one nobody is shown.

Measured, one rolled-back transaction, the exact shape HT-13-b's own banner uses:

```
instant   = 2026-09-13 21:34 America/Chicago  ( = 2026-09-14 02:34+00 )
utc_day   = 2026-09-14      local_day = 2026-09-13
rate card = 10000 closed on 2026-09-13, 44400 effective_from 2026-09-14

priced at 44400 (source studio_member)
printed day label (p_timezone = America/Chicago) = 2026-09-13
```

So the folio, the CSV and the entries list all say **13 September**, and the money on that
line is the rate the studio declared effective **14 September** — a 4.4× step in this
fixture, on an external money document the client can read and the studio cannot reconcile
against its own rate card without knowing the UTC rule.

**What is and is not new.** The resolver's anchor is unchanged by this program, and the
`mine` list has always printed the local day — so the *mismatch* pre-dates HT-13-b on that
one surface. What round 3 changed is that the local date is now the canonical printed date
on **the client's invoice, the bookkeeper's CSV and the studio scope**, where it was the
UTC date before and therefore agreed with the rate's basis. HT-13-b's own text says "day
and week labels **everywhere** are derived in the CALLER's timezone" and explicitly keeps
`time_entry_ledger.day` UTC "as the fact view's basis" — it does not consider that a
second UTC-dated fact, the tier-2 rate span, is now out of step with every label.

**Tier 1 is clean** and was checked: `project_billing_authority_rates` compares
`effective_at <= p_at` / `ended_at > p_at` on the **instant** (`00599:467-468`), which is
zone-free. The defect is confined to `studio_member_rates`, whose `effective_from` /
`effective_to` are plain `date` columns with no zone of their own.

**Disposition: name it and rule it before the push; do not silently ship it.** This is the
same shape P2-n1's residual had, and it deserves the same treatment — a row under HT-13-b
recording that the tier-2 rate span is chosen on the UTC date while every label is cut in
the caller's zone, with the consequence stated (an hour at the day boundary west of UTC
can be priced by the *next* day's card). A code fix is available and small — give
`resolve_time_rate_cents` the same zone the labels take, or compare `effective_from`
against the local date — but it is a ruling, not a tidy, because it changes which rate
prices an hour and because HT-13-a deliberately declined a stored studio timezone.
**Graded MAJOR, not blocker:** no hour is lost, no arithmetic is wrong for the rate
actually chosen, the window is unaffected, and it requires a rate whose `effective_from`
falls on exactly the boundary date.

### B.2 · R4-M2 · MAJOR · NEW · confidence HIGH (read) — `ship-checklist.md` is stale by three hours and contradicts both rulings now in force

`ship-checklist.md` was last written **2026-09-14 01:21**. `rulings.md` was written
**04:37** and `final-fix-r3.md` **04:53**. The checklist is the document the ship operator
works from, and it has not heard about either ruling:

* **§0 banner, and §2 item 3** still read *"⛔ **G3 — MS-15 / HT-10-b is an escalation, not a closed finding** … **If Kody reads HT-10-a as binding on every read path, this is a blocker and the ship waits on his word.**"* Kody ruled on **2026-09-14**: the exception stands, zero code change, and `rulings.md` carries the amended text. An operator following the checklist literally holds a ship on a settled ruling.
* **§2 item 6** still asks someone to *"rule P2-n1's residual now that it is measured"* and offers options (a)/(b)/(c). That is **HT-13-b**, ruled and implemented this round; `rulings.md` marks P2-n1's residual **CLOSED**.
* **§2 item 5** still asks for *"one clean `db reset` + the two `roster_role` probes … by the agent authorised to reset"*. Done — `final-fix-r3.md` §3, and both probes re-confirmed here.
* The §0 line *"Its named residual **P2-n1 is sharper than the ruling says**"* is now false.
* Nothing in the checklist mentions `p_timezone`, the 26-hour `log_time` bound, or the new SQL cases (f) and (j), so a ship-time re-read of the gates does not cover what actually changed.

**Disposition: rewrite §0's banner and §2 before the push.** The gates that genuinely
remain are G1 (MS-06), G2 (P2-M1 / §0a), MS-05's eight Strata numbers, and N-11's explicit
pathspecs — plus R4-M1 above. Graded MAJOR rather than blocker because it is a document,
not behaviour; it becomes a blocker the moment someone runs the push from it.

### B.3 · MS-06 / P2-M2 / W7-R6-04 · MAJOR · carried, still unverifiable — the two flag rollouts

Retried once this session. Verbatim:

```
mcp__plugin_posthog_posthog__exec  call feature-flag-get-all {}
  ->  MCP server "plugin:posthog:posthog" requires re-authorization (token expired)
```

**Fifth failed attempt across four rounds.** The project is not in doubt (the tool's own
active-environment block names project **326191 "Patina Website"**, token
`phc_D6Rf…aNG`, the literal in `apps/designer-portal/wrangler.jsonc:33`). Gating unchanged
since round 3: `account/account-sheet.tsx:105` gates the whole `AccountStudioPage` on
`studio-workspaces`, and HT-3's per-member rate card — the only door to a tier-2 rate —
inherits it. If `studio-workspaces` is not at 100 %, every services hour resolves
`rate_source = 'none'` and the program ships inert. **Hard pre-ship gate, unmoved.**

---

## §C — the stack I read is the fixer's, and it is not drifted

I did not reset. Evidence that the applied stack IS the second reset `final-fix-r3.md` §3
describes, and that the branch and the database agree:

```
supabase_migrations.schema_migrations  -> 00595…00620 present, 00609 absent
                                          (25 files; 00609 has no file, by design)
studio_hours_rollup   -> exactly ONE pg_proc row:
   (uuid, timestamptz, timestamptz, text, uuid, uuid, text)  prosecdef=f
   proconfig={search_path=public, pg_temp}   anon=f authenticated=t service_role=t
   prosrc contains  (scoped.started_at AT TIME ZONE v_zone)::date        -> t
   prosrc contains  THEN to_char(scoped.day,  /  THEN scoped.iso_week    -> absent
log_time              -> prosrc contains interval '26 hours'             -> t
studio_member_rates_admin_update WITH CHECK -> is_org_admin_or_owner(...) AND EXISTS(...)
"Designers manage their project time entries" -> polcmd '*' , no user_id leg (unchanged)
stamp_time_entry_updated_by -> proconfig pinned, proacl {postgres=X/postgres}
```

Every one of those matches the file on `5ffe24667`. No stray objects, no hand-applied
delta. **Not drifted.**

**Migration idempotence — second-run replay of all 27 files under `00590+`, each inside a
rolled-back transaction against the already-applied stack** (`BEGIN;` / `COMMIT;` rewritten
to `SAVEPOINT` / `RELEASE`):

```
IDEMPOTENT-OK    00590 00591 00595 00597 00598 00599 00600 00601 00602 00603 00604 00605
IDEMPOTENT-OK    00606 00607 00608 00610 00611 00612 00613 00614 00615 00616 00617 00618
IDEMPOTENT-OK    00619 00620
IDEMPOTENT-FAIL  00596 :: ERROR: cannot drop columns from view
```

Identical to round 3, which is the correct outcome — MS-14 was closed as documentation and
`00596`'s banner states the loss. The edited files (`00598`, `00605`, `00607`, `00608`,
`00613`) all replay clean.

**Nothing outside the block.** `git diff --name-only origin/main...HEAD -- supabase/migrations/`
returns exactly the 25 files `00595–00620`; no numbered fix migration was added beyond it.

---

## §D — Gates run, verbatim

### (a) SQL suite — `scripts/run-sql-tests.sh -H 127.0.0.1 -p 54422`, whole tree

R3-m4's `mktemp` fix works: **the runner ran, in a sandboxed shell, five times.** No
hand-rolled loop this round.

```
total:             188
green:             162
expected-fail:      23  (documented in supabase/tests/KNOWN_FAILURES.md)
unexpected-fail:     3
note: 1 known-failure file(s) now pass — consider removing from KNOWN_FAILURES.md

unexpected failures:
  - supabase/tests/edge_api/catalog_roles_remote_conformance_negative_test.sql
  - supabase/tests/mood_boards/project_board_share_test.sql       <- R4-m1, intermittent
  - supabase/tests/proposals/proposal_copy_immutability_test.sql
```

Across **five** full runs the count was 162/23/3 twice and 163/23/2 three times; the only
mover is `mood_boards/project_board_share_test.sql` (R4-m1 below). The two standing reds
are the ones round 3 named and neither is this program's:
`catalog_roles_remote_conformance_negative_test.sql` hard-refuses any port but 54322, and
`proposal_copy_immutability_test.sql` fails on `subject`, added by `00590` **on
`origin/main`**. The "1 known-failure now passes" note is
`commercial/direct_order_attribution_test.sql`, the clock-dependent entry that only fails
between 00:00 and 02:00 UTC — it was 10:0x UTC. **N-06 confirmed applied**:
`capture_enrichment/target_type_visibility_test.sql` now classifies EXPECTED-FAIL.

Every hour-tracking and adjacent file is green, including the two new cases:

```
PASS billing/{legacy_project_studio_stamp, time_claim_atomicity, time_entry_ledger,
              time_log_rpc (case f), time_rate_resolution, time_unbilled_view_repair}_test.sql
PASS field/time_entry_activity_travel_test.sql
PASS rls/{internal_time, project_hours_total, studio_hours_rollup (case j),
          studio_member_rates, time_entry_admin_write, time_entry_auto_roster,
          time_entry_studio_stamp}_test.sql
PASS commercial/{agreement_fee_schedules, agreement_parts}_test.sql
PASS edge_api/{public_rpc_authorization_contract, public_sd_hardening_contract}_test.sql
```

### (b) Type-checks

```
@patina/supabase        type-check  exit 0
@patina/designer-portal type-check  exit 0
@patina/client-portal   type-check  exit 0
```

### (c) Unit suites

```
@patina/designer-portal   Test Suites: 581 passed / Tests: 7452 passed / Snapshots: 1   38.8 s
@patina/supabase          Test Files 102 passed / Tests 1259 passed | 12 skipped        5.1 s
@patina/client-portal     Test Suites: 151 passed / Tests: 2475 passed                 13.4 s
```

### (d) `pnpm --filter @patina/admin-portal build` → **green**

The repo's strictest gate (no `ignoreBuildErrors`, `typedRoutes: true`), and
`packages/supabase` is in this diff. Full route manifest emitted, no type errors.

### (e) `pnpm --filter @patina/designer-portal lint` → `✖ 202 problems (0 errors, 202 warnings)`

Unchanged posture from the fix pass. Lint outside designer-portal was not run and would
prove nothing (no other flat config resolves).

### (f) Edge functions

```
deno test --allow-all --config supabase/functions/deno.json time-nudges/ digest-dispatcher/
  ok | 18 passed | 0 failed (70 ms)
```
No `deno.lock` at the worktree root afterwards.

### (g) Generated types in sync

`supabase gen types typescript --db-url …54422` written to a scratch file (the committed
file was not the redirect target). `diff` vs `packages/supabase/src/database.types.ts` is
**40 lines, all of them the CLI's cosmetic parenthesisation in the trailing generic helper
block** (`TableName extends (X extends …)`), across five declarations and **no table,
function, enum or column**. `p_timezone?: string` is present on `studio_hours_rollup`'s
Args. **In sync.**

### (h) ACL seed regenerates to an empty diff

```
python3 scripts/generate-legacy-grants.py
  -> wrote supabase/seed/00-legacy-grants.sql — baseline + 2651 replayed statements
git status --short -- supabase/seed/00-legacy-grants.sql  -> empty
```

### (i) `_shared` edge-function files

`git diff --name-only origin/main...HEAD | grep -c '_shared'` → **0**. No importer cascade;
the three changed function directories are all in the checklist's deploy list.

---

## §E — Attacks run, and what they found

Each executed through RLS on the isolated stack (`SET LOCAL ROLE authenticated` +
`request.jwt.claims`), inside a rolled-back transaction.

| Attack | Result |
|---|---|
| **Does a `day` bucket double-count or drop an hour across the local day boundary?** | **No, in both zones.** A local Mon→Mon instant window with five planted hours (00:15 and 23:45 on the first local day, 23:45 on the LAST local day, and one each side of the window). `America/Chicago`: `sum=75 entries=3 buckets=2 min=2026-09-07 max=2026-09-13 dupes=0`. `Pacific/Auckland`: identical. Every in-window minute counted once; neither out-of-window hour entered; no eighth day; no duplicate bucket key |
| **Can `p_timezone` be abused?** | **No.** `UTC`, `utc`, `' America/Chicago '` (btrimmed), `''`, `EST5EDT`, `PST8PDT`, `+05:30`, and NULL all resolve; `Mars/Olympus`, a 5 000-character string, and `public'; DROP TABLE projects; --` each raise `22023 invalid_parameter_value` in the function's own voice. No dynamic SQL — the zone is a parameter to `AT TIME ZONE`, never an interpolated identifier. `projects` survived |
| **Can a plain member read a teammate's rate / notes?** | **Only the project's own lead — HT-10-b, ruled.** §A.1. Guest 0, outside owner 0, non-lead member 0 |
| **Can a plain member mint or move her own rate?** | **No.** Self-authored INSERT → RLS refusal; the admin UPDATE door now also refuses a non-active / guest subject (§A.5) |
| **Can `log_time` file a future hour?** | **No beyond 26 h**, and the noon-UTC band HT-13-a needs is inside it. §A.2 |
| **Does the REVOKE disarm the `updated_by` stamp?** | **No.** `updated_by` stamped correctly after `REVOKE ALL … FROM PUBLIC, anon, authenticated, service_role`. §A.6 |
| **Does `notes` leak through any new surface?** | **No.** `studio_hours_rollup`'s return type is unchanged and carries no notes column; `00607`'s postcondition (a) asserts it on the TYPE for the new seven-argument identity; the CSV omits it by construction |
| **Is the CSV formula guard intact after `member_name`'s new default?** | **Yes.** `csvField` still neutralises a leading `= + - @` / tab, and `"Unnamed member"` is inert. `local_date` goes through the same field writer |

---

## §F — MINORS (4)

* **R4-m1 · MINOR · NEW · confidence HIGH (measured, reproduced 2/5) — `mood_boards/project_board_share_test.sql` is intermittently red in a WHOLE-TREE run and is not allowlisted, so the ship-pass SQL gate will go red about two runs in five.** It **passes in isolation** and in a `-f mood_boards` run, every time. The failure, captured verbatim from a verbose full run:
  ```
  ERROR: the headline must read as a guest's, got: A guest approved cap pin 11
  CONTEXT: PL/pgSQL function inline_code_block line 30 at ASSERT
  ```
  Cause, read off the file: the assertion at `:888-897` (the ASSERT itself at `:896`) reads
  `SELECT metadata … FROM notification_log … ORDER BY created_at DESC LIMIT 1`, and
  `created_at` defaults to `now()`, which is **constant for the whole transaction** — the
  file's own earlier "cap pin N" fixture (`:489`) has already written notification rows
  with an identical timestamp, so the `LIMIT 1` is decided by heap order, not by time.
  **Not this program's**: the file is absent from `git diff origin/main...HEAD`, nothing
  in `00595–00620` touches mood boards or `notification_log`, and the mechanism is a
  pre-existing tie in the test. It matters here only because the ship pass runs this
  directory and a red it cannot explain will stop an operator. Either add a tie-break
  (`ORDER BY created_at DESC, id DESC` plus a `metadata->>'source' = 'guest_link'` +
  headline filter) or give it a `KNOWN_FAILURES.md` line naming the tie.

* **R4-m2 · MINOR · NEW · confidence HIGH (read) — W6-R3-07's end anchor is droppable by design, so the claim "the invariant cannot be bypassed" overstates the fix.** `FieldLogTimeDraft.setStartedAt(_:)` sets `endAnchor = nil`, and the day picker calls it on every selection change (`LogTimeSheet.swift:230-236`). So: open the sheet with **no** active visit (anchor = now, start = now−30m) → tap **Day** → pick any day → pick today again → the anchor is gone → step the duration to the 12-hour bound → `startedAt` stays at ~now−30m and the implied END is ~11.5 h in the future, which is exactly the shape W6-R3-07 named. The three new Swift tests cover the un-anchored stepper, the visit-anchored stepper, and "naming a day drops the anchor", but not the sequence that re-opens the hole. **Money consequence: none that I can find** — no span end is stored or checked anywhere (nine CHECK constraints on `project_time_entries`, none on `started_at` or an end), `started_at` itself stays in the past so `log_time`'s new bound is satisfied, and the desk's own add row has the identical shape under HT-13. So this is a correction to the *claim*, not a defect to hold the ship for: `final-fix-r3.md` should say the anchor guards the stepper **until she names a day by hand**, which is the deliberate design.

* **R4-m3 · MINOR · NEW · confidence MEDIUM (read) — the future bound lives only in `log_time`, and one live write path does not go through it.** `useUpdateTimeEntry` (`use-time-tracking.ts:598-615`) issues a raw `.from('project_time_entries').update(updates)`, so any caller that put `started_at` in `updates` would move an hour past `now() + 26 h` with nothing to stop it — there is no CHECK constraint and no BEFORE trigger enforcing the bound. **No UI path sends it today** (grepped every `started_at` occurrence in `apps/designer-portal/src`; all of them read, none writes), and iOS logs through `log_time`. Recorded so the next hand that adds a "correct the date" act on the ledger knows the guard is at the RPC and not at the table. R3-m1's corrected remedy asked for exactly this shape, so this is a residual, not a miss.

* **R4-m4 · MINOR · NEW · confidence HIGH (read) — the CSV's documented `local_date` fallback cannot fire.** `time-export.ts:139` is `csvField(row.local_date ?? row.day)` and the field's own doc-comment says *"Absent falls back to `row.day` rather than blanking the cell."* But the only producer (`hours-ledger.tsx:757`) writes `local_date: localDateOf(r.started_at, timeZone)`, and `localDateOf` returns **`''`** — not `null`/`undefined` — for a falsy or unparseable instant, and `??` does not catch `''`. Unreachable today (`project_time_entries.started_at` is `NOT NULL` and PostgREST returns a parseable ISO string; confirmed in `information_schema`), so the cell is always right. One character fixes it (`||` instead of `??`), or the comment should say the producer guarantees a value.

---

## §G — NOTES (8)

* **R4-n1 · note · NEW — the 26-hour bound has zero slack at its own worst case.** At local midnight in UTC+14 the noon-UTC instant of the named day is **exactly** `now() + 26 h`, and the test is strict (`>`), so it passes — but a client clock a few seconds fast at that instant would be refused. HT-13-a's own stated band is **UTC−11 … UTC+11**, for which the worst case is 23 h, leaving three hours of real slack. Recorded rather than widened: loosening the bound weakens the guard, and the exposed shape needs a studio at UTC+12…+14, which HT-13-a does not claim to serve.
* **R4-n2 · note · NEW — `qbo-export` still dates its AP rows `created_at.slice(0, 10)`** (`index.ts:417`, `:446`), i.e. the UTC calendar date, on a money export a bookkeeper reconciles. Pre-existing, outside HT-13-b's scope (which names the studio CSV and the client folio), and unchanged by this program — but it is the same class of question HT-13-b just answered on the AR side, and the two exports will now disagree at the boundary.
* **R4-n3 · note · NEW — the worktree carries uncommitted state that must not be staged.** `git status --short` on `5ffe24667`: ` M apps/designer-portal/next-env.d.ts` (a Next build artifact, rewritten to `./.next/dev/types/routes.d.ts`), `?? apps/designer-portal/e2e/r4-walk/`, `?? apps/designer-portal/playwright.r4walk.config.ts`. None of it is mine and none belongs in the ship commit. **N-11 stands: explicit pathspecs, never `git add -A`.**
* **R4-n4 · note — `supabase/migrations/_pending/` is a tracked directory under `migrations/`**, holding `00106_drop_client_messages.sql`. **Pre-existing on `origin/main`, not this program's**, and `db push` does not read it — recorded only because a directory named like a migration sibling is a trap for whoever runs the push.
* **N-01 · note (carried)** — `project_hours_total` remains an arithmetic channel on a two-contributor project. Ruled by HT-10; the program strictly narrows the prior state.
* **N-03 · note (carried)** — `audit_time_entry_change` files `organization_id = project_pricing_studio_id(OLD.project_id)`, NULL for exactly the population `00620` leaves NULL, so those HT-23 trace rows are readable only by the actor who made the edit.
* **N-07 · note (carried, ruled residual)** — `time-nudges`' `running_timer` arm is ungated by design (D-R2-01). Any holder of the publishable anon key can POST and force a service-role sweep; counts only in the response, idempotent writes behind two partial UNIQUE indexes, and a `job_runs` row per POST.
* **R4-n5 · note — rulings still owed** (per R3-n6, unchanged): **P2-n3 / W7-R6-03 / S-9**, **HT-25-a**, **HT-6-a**, **HT-6-b**, **R3-n4**. Add **R4-M1** to that list if the orchestrator elects to record it rather than fix it.

---

## §H — What I did NOT verify

* **Strata / prod was not touched** — not by SQL, not read-only, not by the CLI. **MS-05's eight numbers are unmeasured** and remain a pre-push step; `ms-05-strata-legacy-stamp-preflight.sql` is ready and carries MS-12's `left_null_non_designer_lead` column.
* **The `studio-workspaces` and `agreement-parts` rollouts** — §B.3, reproduced a fifth time.
* **I did not reset the database.** Idempotence is a second-run replay against the fixer's applied stack, which is the harder half; a from-scratch `db push --include-all` against an empty schema is still unexercised by me.
* **iOS** — no device, no Simulator, no `capture-gate.sh`. R3-m2 and W6-R3-07 are dispositioned on code reading plus the measured server half; the fixer's Simulator-only green is taken at face value.
* **Portal e2e / Playwright** — not run. `hours-ledger.tsx` changed this round and the Hours e2e is **still un-re-run**, which `final-fix-r3.md` §4 names as a real gap; I confirm it is still a gap.
* **No browser walk.** HT-13-b's portal half is proved by jest, by the SQL case (j) and by my own two-zone boundary probe, not by a render.
* **`@patina/design-system` vitest** — not run (it hung in rounds 2 and 3; not retried). Not run is not green.
* **Lint outside designer-portal** — not run; no other flat ESLint config resolves.
* **R4-M1's blast radius on real Strata data** — I measured the mechanism on a fixture. How many live rows sit at a boundary where a tier-2 rate changes on exactly that date is unknown and would need the MS-05 pre-push read to answer.

---

## §I — What must happen before the push

1. ⛔ **MS-06** — read the `studio-workspaces` and `agreement-parts` rollout percentages in the PostHog UI (project 326191) and write both into the ship report. Fifth failed attempt via the tool. `studio-workspaces` decides whether the program ships working or inert.
2. ⛔ **R4-M2** — rewrite `ship-checklist.md` §0's banner and §2. G3 is **settled** (HT-10-b ruled 2026-09-14), §2.5 is **done**, §2.6 is **HT-13-b and implemented**. As it stands the checklist would hold the ship on a ruling Kody has already given.
3. ⛔ **R4-M1** — rule the tier-2 rate anchor: `studio_member_rates.effective_from/_to` are chosen on the **UTC** date while every label HT-13-b introduced is the caller's. Either fix `00599` (the same zone, or the local date) or record it under HT-13-b as a named residual with the consequence stated — an hour dated the 13th on the homeowner's folio can carry the rate that began on the 14th.
4. ⚠ **MS-05** — run `ms-05-strata-legacy-stamp-preflight.sql` on Strata and fill §1②a's eight values; read `left_null_ambiguous` and `left_null_non_designer_lead` first.
5. ⚠ **P2-M1 / R3-M3** — run `supabase db push --include-all` from the linked, up-to-date main checkout (§0a), or it is a silent no-op that reports success.
6. ⚠ **N-11** — stage the ship commit with explicit pathspecs. The worktree currently carries a modified `next-env.d.ts` and two untracked `r4-walk` paths (R4-n3).

Recommended and cheap, not gating: **R4-m1** (a tie-break or an allowlist line for `project_board_share_test.sql`, so the ship-pass SQL gate is deterministic), **R4-m2** (correct the W6-R3-07 claim in `final-fix-r3.md`), **R4-m4** (`||` for `??` in `time-export.ts:139`), **R4-n3/R4-n4** (worktree hygiene).
