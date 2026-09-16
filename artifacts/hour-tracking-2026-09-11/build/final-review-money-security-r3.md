# Final integration review — money + security — round 3

`clean = false`

**0 blockers · 2 majors · 5 minors · 6 notes.**

Branch `hour-tracking/integration` @ `b030275f8`, worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-integration`; `origin/main`
(`b88fd4c5`) is an ancestor. Every measurement below ran on the isolated stack
**patina-hours** (Postgres `127.0.0.1:54422`). Every mutation ran inside a transaction
that was **rolled back**; nothing was reset. **Strata was not touched, by any means,
read-only included.** 54321/54322 were never contacted. No file in the repo was written
by this review except this report.

**Round-2 verdict: five of the six majors are discharged.** Four were fixed in code and
verified here independently of `final-fix-r2.md`; one (MS-14) was correctly closed as
documentation rather than code. The two that remain open are the two that were never
closable in a fix pass — **MS-06** (a measurement nobody can take while the PostHog token
is dead — reproduced a **fourth** time this session) and **MS-15 / HT-10-b** (a ruling
escalated to Kody). Both are carried forward unchanged in kind; MS-15's blast radius is
**larger than round 2 recorded**, and that is measured below.

Nothing new of blocker weight was found. The five new minors are three corrections to
carried remedies that would not have worked as written, one new client-facing instance of
an already-ruled residual, and one stale exported type.

---

## §A — Round-2 findings, verified one by one

| Round-2 finding | Claimed | **Verified this round** |
|---|---|---|
| **P2-B1** blocker | FIXED | **DISCHARGED** — §A.1 |
| **MS-11** major | FIXED | **DISCHARGED** — §A.2. Takes **n7-02** with it |
| **MS-12** major (ruling owed) | FIXED + ruled | **DISCHARGED** — §A.3, re-measured across seven org shapes |
| **MS-13** major | FIXED | **DISCHARGED** — §A.4 |
| **MS-14** major | DOCUMENTED, not repaired | **DISCHARGED as documented** — §A.5, failure re-measured |
| **MS-15** major (ruling owed) | RULED (HT-10-b), escalated, NOT closed | **STILL OPEN — and wider than recorded.** §B.1 |
| **MS-06 / W7-R6-04** major | NOT closed | **STILL NOT CLOSED** — reproduced this session. §B.2 |
| **P2-M1** | applied | **CONFIRMED** — `ship-checklist.md` §0a present |
| **P2-M3** | FIXED | **Code confirmed** (config merge + the skipping case). E2E not re-run in this lens |

### A.1 — P2-B1, the instant window

Catalog, not the fix report:

```
studio_hours_rollup(p_studio_id uuid, p_from timestamptz, p_to timestamptz,
                    p_group_by text, p_user_id uuid, p_project_id uuid)   -- ONE row
```

The `(uuid, date, date, text, uuid, uuid)` overload is **gone**, not shadowed — a single
`pg_proc` row, so no caller passing a bare date string can bind the wrong one by accident.
`prosecdef = f` (INVOKER, as HT-38 requires), `proconfig = search_path=public, pg_temp`,
and the EXECUTE grants follow the **new** identity (`anon f / authenticated t /
service_role t`), so no orphaned grant survives the signature change.

Portal half read in full: `useTimeEntryLedger` filters `.gte('started_at', from)
.lt('started_at', to)` (`use-time-tracking.ts:968-969`); `hours-ledger.tsx:687-693`
derives `fromInstant`/`toInstant` from `weekStart`/`weekEnd` and keeps `fromDate`/`toDate`
for the export filename and the analytics `period` only. The studio CSV read
(`:698-701`) and all three render sites (`:1107`, `:1135`, `:1169`) take the instants.

### A.2 — MS-11 + n7-02, the Hours band's own read

`hours-ledger.tsx:403-419` now reads

```ts
.from("project_unbilled_time")
.select("id, project_id, user_id, duration_minutes, amount_cents, "
      + "authority_rate_id, billing_state, rate_source")
.eq("user_id", userData.user.id)          // n7-02
```

and splits at `:423-432`: `unbilledRows` = priced, `ratePendingUnbilled` = pending. The
balance (`:466-472`), the document count (`:479`) and `billingTargetRows` (`:492-499`) all
draw from the **priced** set, so "Bill it" can no longer be enabled onto an untickable
composer. The held-back hours are named, not hidden — `:1207-1209` prints
`· {N} awaiting a rate`, and `:1195` suppresses the money clause entirely when the whole
balance is unpriced, so `$0.00 · 2H 00M` is gone. `unbilledById` is deliberately still
built from all rows (`:451-461`) and supplies only an amount fallback that is 0 either
way. `user_id` is a real column of the view (`information_schema`, 15 columns, confirmed).

### A.3 — MS-12, the legacy stamp's designer-domain gate

`00620` asks `public.has_designer_domain_role(project.designer_id)` in the tiered CTE
(`:512`), in **all three** per-key counters (`:555`, `:563`, `:573`), in postcondition (a)
(`:646`), and reports a fourth count `v_left_non_designer` (`:544-548`). The preflight
`ms-05-strata-legacy-stamp-preflight.sql` carries the matching
`left_null_non_designer_lead` column, so MS-05's pre-push read and the statement describe
the same rows.

**Ship-hazard probes — no raise on any shape Strata can hold.** One rolled-back
transaction each:

```
has_designer_domain_role(NULL)               -> f      (no raise; the body's own guard)
has_designer_domain_role(unknown uuid)       -> f
designer_tier_pricing_studio(NULL)           -> none / NULL
designer_tier_pricing_studio(unknown uuid)   -> none / NULL
removed seat                                 -> none / NULL
guest seat                                   -> none / NULL
suspended design_studio                      -> none / NULL
manufacturer org                             -> none / NULL
TWO active employer seats (ambiguous)        -> none / NULL   <- refuses to guess
one active + one suspended                   -> employer / the ACTIVE one
owner seat only                              -> owned
owner of TWO studios                         -> none / NULL   <- refuses to guess
```

Because `has_designer_domain_role` is NULL-safe in its own body (`SELECT p_user_id IS NOT
NULL AND EXISTS (…)`), the CTE is safe against Postgres reordering the `designer_id IS NOT
NULL` conjunct ahead of or behind it. `00620`'s three ASSERTs are arithmetic identities
over its own statement and cannot fail on data.

### A.4 — MS-13, the third function reaches prod

The function diff is exactly three directories:

```
supabase/functions/digest-dispatcher/{index,status,status.test}.ts
supabase/functions/qbo-export/index.ts
supabase/functions/time-nudges/{index,logic,index.test}.ts
```

`ship-checklist.md:91-93` deploys all three by name, and the pre-flight row at `:40` now
names `qbo-export`. The guard itself is byte-identical in both exporters
(`time-export.ts:70-79`, `qbo-export/index.ts:169-178`), and all fourteen CSV columns pass
through `csvField` (`time-export.ts:120-134`, `:141`).

### A.5 — MS-14, re-measured

Second-run replay of every one of the 25 files, each inside a rolled-back transaction
against the already-applied stack:

```
IDEMPOTENT-OK    00595 00597 00598 00599 00600 00601 00602 00603 00604 00605 00606 00607
IDEMPOTENT-OK    00608 00610 00611 00612 00613 00614 00615 00616 00617 00618 00619 00620
IDEMPOTENT-FAIL  00596 :: ERROR: cannot drop columns from view
```

Unchanged from round 2 — which is the correct outcome, because the fix was documentation.
`00596`'s banner (`:33-49`) now states the loss in the file: true only on a first run and
only up to `00617`; the view's live column list is `00617`'s; one `db push --include-all`
applies in version order so the chain is unaffected; and both wrong repairs are named and
forbidden. Mirrored in the checklist. **Disposition: accepted as a documented residual.**

---

## §B — MAJORS (2, both carried)

### B.1 · MS-15 / HT-10-b · MAJOR · ruling escalated · confidence HIGH (measured) — the exposure is **bulk and per-member**, not one row at a time

The ruling landed (`rulings.md`, HT-10-b) and the checklist carries it (§2.8). The policy
is as recorded — read straight off `pg_policy`:

```
Designers manage their project time entries | ALL | permissive
  EXISTS (SELECT 1 FROM projects p
           WHERE p.id = project_time_entries.project_id AND p.designer_id = auth.uid())
```

no `user_id` leg, where `Team can view their project time entries` and
`time_entries_studio_read` both carry one.

Measured per role, one rolled-back transaction, studio S, rostered member M priced 27500
by owner O, D = the project's own designer and a **plain `member`**:

```
owner              : rate_card_rows=1 | M's entry notes='MATE PRIVATE NOTE' rate=27500
admin              : rate_card_rows=1 | M's entry notes='MATE PRIVATE NOTE' rate=27500
LEAD(plain member) : rate_card_rows=0 | M's entry notes='MATE PRIVATE NOTE' rate=27500   <-
guest              : rate_card_rows=0 | (none) (none)
outside-owner      : rate_card_rows=0 | (none) (none)
client             : rate_card_rows=0 | (none) (none)
```

**What round 2 did not measure, and what this round adds.** The exposure is not per-row
and is not confined to `project_time_entries`. A plain-member lead of N projects reads,
in one query, every teammate's name beside every teammate's resolved rate and amount,
through the views this program built — and the rollup does the naming for her:

```
lead: studio_member_rates rows visible = 0            (RLS denies her the cards)
lead: time_entry_ledger WHERE studio_id = S
        ledger: <member 3> / E One / 120min / rate=31000 / amt=62000
        ledger: <member 4> / E Two /  60min / rate=42000 / amt=42000
lead: studio_hours_rollup(S, …, 'member')
        (member 3, name, 1 entry, 120 min, 62000 cents, 0)
        (member 4, name,  1 entry,  60 min, 42000 cents, 0)
lead: teammates' notes rows readable = 2
```

`studio_hours_rollup` is SECURITY INVOKER over a `security_invoker` view, so it behaves
correctly — it returns exactly what RLS allows. The door is upstream, in the 00177 ALL
policy. The consequence is that HT-10-b's blast radius is **the studio's whole per-member
pay book across every project she leads**, and the studio-scope CSV export is the same
read. `useViewerStudio` filters the studio scope to `owner|admin` in the UI, but a UI
filter is not the boundary; a hand-built PostgREST call is the same query.

**Two more things the ruling's text does not cover, both measured:**

* The policy is `ALL`, not `SELECT`. A plain-member lead can also **UPDATE and DELETE** a
  teammate's hour: `7a lead UPDATEs teammate notes: rows=1`, `7b lead DELETEs teammate
  hour: rows=1`. HT-10-b names only reads. Mitigations verified: the write is audited
  (`zzzz_audit_time_entry_change_trg` is `AFTER DELETE OR UPDATE`; one `audit_logs` row
  landed), the money snapshot is not re-resolved to the lead's own rate
  (`8b rate after lead edit = 20000`, the teammate's own), and `guard_invoiced_time_entry`
  (head `00177`, **untouched by this program** — no file in 00595–00620 redefines it)
  freezes an invoiced row. This is pre-existing, not introduced here.
* `project_unbilled_time` carries `notes` in its column list, and it is `security_invoker`,
  so the same actor reads teammates' notes through that view too.

**Disposition: must be ruled before ship, not fixed here.** Graded MAJOR because it is
deliberate, documented in `00606:83-95`, pinned by a passing test, and now recorded in
`rulings.md`. **If Kody reads HT-10-a as binding on every read path, this is a BLOCKER**
and the ship waits. If the exception stands, option (b) — a GRANT-level column split on
`hourly_rate_cents` / `rated_amount_cents` / `notes` plus a definer correction RPC — is
owed, and the ruling text should be amended to say that the exception covers **writes and
bulk reads**, not one row at a time, because that is what it actually is.

### B.2 · MS-06 / P2-M2 / W7-R6-04 · MAJOR · carried, still unverifiable — the two flag rollouts

Retried this session with the tool loaded. Verbatim:

```
mcp__plugin_posthog_posthog__exec  ->  MCP server "plugin:posthog:posthog"
                                       requires re-authorization (token expired)
```

Fourth failed attempt across three rounds. The project is not in doubt — the tool's own
active-environment block names project **326191 "Patina Website"**, token
`phc_D6Rf7ZYD5L7cTCgP1aBIV6kgANIFGnsbEgoYPXpsaNG`, the exact literal in
`apps/designer-portal/wrangler.jsonc:33`. **The two rollout percentages remain unread.**

Gating re-read in code this round, and it is worse-shaped than "one card is hidden":

* `account-sheet.tsx:105` gates the **entire** `AccountStudioPage` on `studio-workspaces`.
* The **Studio rates** card (HT-3 tier 2 — the only per-member rate door in the product)
  lives at `account-studio-page.tsx:1719-1760` and is gated only on `canManage &&
  user?.id` — i.e. it inherits `studio-workspaces` and nothing else.
* `agreement-parts` (`:199`) gates HT-4's agreement rate card on top of that.

So if `studio-workspaces` is not at 100%, a studio has **no door to price anybody**, every
hour resolves `rate_source = 'none'`, and the program ships inert behind a permanent
"awaiting a rate" band. `useFeatureFlag` is fail-closed. **Hard pre-ship gate; the
checklist's top banner is correct and must not be pushed past.**

---

## §C — MINORS (5)

* **R3-m1 · MINOR · NEW (correction to a carried remedy) — MS-07's one-line fix does not
  close W6-R3-07.** The disposition in round 2 reads "One `RAISE` in `log_time` closes
  this and W7-R5-07 together." It does not. Measured: `project_time_entries` carries nine
  CHECK constraints and **none** bounds `started_at` *or the span end*:
  ```
  activity_ck · authority_shape_check · billing_state_check · duration_minutes_check
  internal_scope_ck · rate_role_ck · rate_source_ck · rated_amount_check · source_ck
  ```
  W7-R5-07 (noon-UTC) is a **`started_at` in the future** — a `p_started_at > now() + …`
  guard closes it, and a `+400d` insert is still accepted today (`d started_at +400d:
  WRITTEN state=authorized`). W6-R3-07 is **not**: `FieldLogTimeDraft`'s no-visit path
  anchors `startedAt = now − 30m` (`FieldLogTime.swift:138-141`) and `step(by:)`
  (`:155-157`) moves **only** `durationMinutes`, up to `maximumMinutes = 12*60`. The
  filed `started_at` is in the PAST; it is the implied END that lands ~11.5 h in the
  future, and nothing stores or checks the end. The guard that closes both is on
  `p_started_at + (p_duration_minutes || ' minutes')::interval`, not on `p_started_at`.
  Both remain open; the remedy line should be corrected before it is implemented.

* **R3-m2 · MINOR · NEW (correction to a carried remedy) — MS-08's one-line fix would
  mislabel a legacy row that DOES carry a rate.** `FieldHours.swift:98` is still
  `if row.rateSource == "none" { return "Rate pending" }`, so a NULL `rate_source` row
  falls through to **"Billable"** — confirmed unchanged. But the proposed
  `rateSource == nil || rateSource == "none"` is wrong: `rate_source` has no backfill
  (P-4), so **every row on Strata today is NULL**, and most of them carry a real legacy
  `hourly_rate_cents`. The portal already distinguishes the two — `timeRateProvenance`
  (`authority-hours.ts:141-173`) keys on the **rate value**: a NULL-source row with a rate
  is `"Legacy rate"` (kind `rated`), one without is `"rate not recorded"` (kind
  `unrecorded`), and only `rate_source === 'none'` is `"rate pending"`. iOS cannot make
  that distinction: `FieldHourRow` carries **no rate column** and
  `SupabaseFieldHoursService.swift:39-40` does not select one. The correct fix is to add
  the rate to the query and mirror `timeRateProvenance`'s three states — not a one-liner.

* **R3-m3 · MINOR · NEW — P2-n1's UTC-date residual reaches the **homeowner's folio**,
  a surface the ruling did not scope.** `buildTimeLineDraft` (`time-billing.ts:115-120`)
  builds HT-21's dated sub-table with `date: e.started_at.slice(0, 10)` — the **UTC**
  calendar date of a timestamptz PostgREST returns in UTC — and
  `invoice-sheet.tsx:894-902` renders those dates to the client on the pay-link sheet.
  An hour the timer filed at 21:34 CDT on the 13th is billed to the homeowner as the
  **14th**. P2-n1's residual row scopes the ruling to *"the `day` / `iso_week` BUCKET
  LABELS … because 00604 derives both buckets `AT TIME ZONE 'UTC'`"* — this is a third
  site, in portal code, on an external money document. No hour is omitted, no figure is
  wrong, and HT-13-a's date-only entries (stored at noon UTC) are unaffected. **Record it
  under P2-n1 rather than leave it to be found on a client's invoice.**

* **R3-m4 · MINOR · carried, reproduced verbatim — MS-09.** `scripts/run-sql-tests.sh:94`
  still cannot run in a sandboxed agent session:
  `mktemp: mkdtemp failed on /var/folders/…: Operation not permitted`, then
  `/known_failures.normalized: Operation not permitted` ×24 and `error: no .sql files
  found`. Third reviewer, third round, same failure; every reviewer pays the cost of
  hand-rolling the loop. One line: `mktemp -d "${TMPDIR:-/tmp}/run-sql-tests.XXXXXX"`.

* **R3-m5 · MINOR · carried, unchanged — MS-10.** `studio_member_rates_admin_update` has
  no subject guard where `studio_member_rates_admin_insert` has one. Re-confirmed as an
  asymmetry, not an exploit: `guard_studio_member_rate_history` freezes the identity
  columns and the resolver prices off `projects.studio_id` regardless. **Accept as
  residual.**

---

## §D — NOTES (6)

* **N-01 · note (carried)** — `project_hours_total` remains an arithmetic channel on a
  two-contributor project (total − mine = the colleague's). Ruled by HT-10; the program
  strictly narrows the prior state.
* **N-02 / N-13 · note (carried, unchanged)** — `stamp_time_entry_updated_by` is still the
  **only** function this program adds with no pinned `search_path` (`proconfig` NULL) and
  still EXECUTE-granted to `anon` and `authenticated`. Re-measured across six of the
  program's trigger functions: every other one is `search_path=public, pg_temp` and closed
  to both roles. No exploit — SECURITY INVOKER, body is three lines referencing only
  `auth.uid()`, and a direct call raises "trigger functions can only be called as
  triggers". A quality-bar gap on both halves of patina-db-migrations' checklist,
  surviving its third round.
* **N-03 · note (carried)** — `audit_time_entry_change` files `organization_id =
  project_pricing_studio_id(OLD.project_id)`, NULL for exactly the population `00620`
  leaves NULL (now larger, because of MS-12's gate), so those HT-23 trace rows are
  readable only by the actor who made the edit.
* **N-06 / N-10 · note (carried, both unaddressed)** — allowlist hygiene.
  `capture_enrichment/target_type_visibility_test.sql` is red and **still not in**
  `KNOWN_FAILURES.md` (`FAIL c2`, the `00584 field_captures_studio_*` cause already
  documented for its sibling). `document/close_project_readiness_test.sql` **is**
  allowlisted but under a message that no longer matches: the allowlist says *"permission
  denied for table project_ffe_items"*, and it now aborts 100+ lines earlier at `:331`
  with `studio_id_not_designer_studio`. Neither is this program's (`set_project_studio_id`
  head is `00563`; nothing in 00595–00620 redefines it or `has_designer_domain_role`).
  Two allowlist lines.
* **N-07 · note (ruled residual, accepted)** — `time-nudges`' `running_timer` arm is
  ungated by design (D-R2-01, recorded in the function header, `00614`'s banner and
  `config.toml`). Any holder of the publishable anon key can POST and force a service-role
  sweep; the response carries counts only, the two partial UNIQUE indexes make the writes
  idempotent, and each such POST also opens a `job_runs` row.
* **N-15 · note · NEW — a stale exported type documents the window backwards.**
  `TimeEntryFilters` (`use-time-tracking.ts:150-159`, re-exported at
  `hooks/index.ts:2170`) documents `to` as *"ISO timestamp upper bound on started_at
  (inclusive)"*. It has **zero consumers anywhere in the repo** (grepped across every
  `.ts`/`.tsx`), and the only window the program actually implements is **exclusive**
  (`.lt('started_at', to)`). A hand writing the next caller against the package's exported
  type would build an inclusive window and double-count the boundary hour in two adjacent
  weeks. Delete it, or correct the comment to match `TimeEntryLedgerParams`.

---

## §E — Gates run, verbatim

### (a) SQL suite — every file under `supabase/tests`, `ON_ERROR_STOP=1`, `-H 127.0.0.1 -p 54422`

`scripts/run-sql-tests.sh` could not run (R3-m4), so the same loop ran by hand.

**188 files · 163 PASS · 25 FAIL.** **22 of the 25 are in `KNOWN_FAILURES.md`.** The three
that are not, each re-verified as not this program's:

| File | Why it is not this program's |
|---|---|
| `capture_enrichment/target_type_visibility_test.sql` | `FAIL c2`, the `00584 field_captures_studio_*` cause. No migration in 00595–00620 defines a policy on those tables. **N-06** — allowlist it |
| `edge_api/catalog_roles_remote_conformance_negative_test.sql` | Isolated-stack artifact: `:45-55` hard-refuses any port but `54322`, then `SELECT 1/0`. Passes on the ordinary stack |
| `proposals/proposal_copy_immutability_test.sql` | `proposals column census drifted` — `subject`, added by `00590_engagement_subject.sql`, which is **on `origin/main`** (`6801d9879`). No migration in 00595–00620 alters `public.proposals`, and the program does not touch the test file (`git diff --name-only` → 0) |

All **nineteen** hour-tracking / adjacent files pass:

```
PASS billing/{legacy_project_studio_stamp, time_claim_atomicity, time_entry_ledger,
              time_log_rpc, time_rate_resolution, time_unbilled_view_repair}_test.sql
PASS field/time_entry_activity_travel_test.sql
PASS rls/{internal_time, project_hours_total, studio_hours_rollup, studio_member_rates,
          time_entry_admin_write, time_entry_auto_roster, time_entry_studio_stamp}_test.sql
PASS rls/00563_proposal_signing_multi_studio.test.sql
PASS commercial/{agreement_fee_schedules, agreement_parts}_test.sql
PASS edge_api/public_rpc_authorization_contract_test.sql
PASS edge_api/public_sd_hardening_contract_test.sql
```

The contract test's diff against `origin/main` is still **one VALUES row** (`:533-546`)
with its paragraph; the `:161-171` assertion this program broke in round 1 is untouched,
and the file is **not** in `KNOWN_FAILURES.md`.

### (b) Migration idempotence — second run of every file, each in a rolled-back transaction

24 of 25 clean; `00596` fails, now documented — §A.5. None of the 25 contains
`CONCURRENTLY`, `ALTER TYPE … ADD VALUE` or `VACUUM`, so the transactional replay is a
faithful second-run test.

### (c) Edge functions

```
deno test --allow-all --config supabase/functions/deno.json time-nudges/ digest-dispatcher/
  ok | 18 passed | 0 failed (73ms)
deno check --config supabase/functions/deno.json qbo-export/index.ts    -> clean
```
No `deno.lock` at the repo root or in the worktree afterwards (checked both).

### (d) Type-checks

```
@patina/supabase        type-check  clean
@patina/designer-portal type-check  clean
@patina/client-portal   type-check  clean
```

### (e) Unit suites

```
@patina/supabase          102 files / 1259 passed | 12 skipped
@patina/designer-portal   581 suites / 7445 tests passed (32.5s)
@patina/client-portal     151 suites / 2475 tests passed (12.6s)
```

### (f) `pnpm --dir apps/admin-portal build` → **green**

The repo's strictest gate (no `ignoreBuildErrors`, `typedRoutes:true`), and
`packages/supabase` is in this diff. Full route manifest emitted, no type errors.

### (g) `pnpm --dir apps/designer-portal lint` → **0 errors**, 201 warnings

Unchanged posture. Lint outside designer-portal is not trusted and was not run
(patina-verification: no other package's ESLint config resolves).

### (h) Generated types in sync

`supabase gen types typescript --db-url …54422`, written to a scratch file (the committed
file was **not** touched). The only differences from `packages/supabase/src/
database.types.ts` are the CLI's cosmetic parenthesisation in the trailing generic helper
block (`TableName extends (X extends …)`), affecting four declarations and **no table,
function, enum or column**. **In sync.**

### (i) ACL seed regenerates to an empty diff

`python3 scripts/generate-legacy-grants.py` → *baseline + **2650** replayed statements*;
`git diff -- supabase/seed/00-legacy-grants.sql` → **empty**, `git status --short` on it →
empty. 00607's grants follow the new `timestamptz` signature.

### (j) `_shared` edge-function files

`git diff --name-only origin/main...HEAD | grep -c '_shared'` → **0**. **No importer
cascade.** Three function directories changed; all three are in the checklist's deploy
list.

### (k) `00614`'s cron target, and the digest exclusion

```
time-nudges-hourly | 0 * * * * | SELECT public.invoke_edge_function('time-nudges', '{"rule":"running_timer"}'::jsonb); | active=t
```

`'time-nudges'` matches the directory `supabase/functions/time-nudges/` and the
`[functions.time-nudges]` block in `config.toml` exactly; a guarded unschedule precedes
it. **Correct.**

Digest exclusion holds for **both** types. `DIGEST_EXCLUDED_TYPES` (`status.ts:21-38`)
carries `time_entry_running_long` **and** `time_weekly_unlogged_reminder`, both
string-identical to `logic.ts:61-62`'s constants and to `00614:79-86`'s two partial UNIQUE
index predicates, and the set is applied at `digest-dispatcher/index.ts:275`. Pinned by a
passing test.

### (l) `supabase/config.toml`

`git ls-files -v` → `S supabase/config.toml` (skip-worktree, as required). The **committed
blob**'s only delta vs `origin/main` is the 22-line `[functions.time-nudges]` block with
its verify_jwt paragraph. The live file's `project_id = "patina-hours"` and ports
54421/54422/54429 are **not** staged and will not ship. Verified by reading the diff, not
the file.

---

## §F — Attacks run, and what they found

Each executed through RLS on the isolated stack with `SET LOCAL ROLE authenticated` +
`request.jwt.claims`, inside a rolled-back transaction.

| Attack | Result |
|---|---|
| **Can an account move its own resolved rate?** | **No.** Self-authored rate card INSERT → *"new row violates row-level security policy for table studio_member_rates"*; direct UPDATE of her own snapshot → *"commercial time authority, rate, amount, billing state, and rate provenance are server-derived"*. Snapshot before 27500, after 27500 |
| **Can a member read a teammate's row / notes / rate?** | **Only the project's own lead — MS-15/HT-10-b, §B.1.** Every other role reads nothing: guest 0, outside owner 0, client 0 |
| **Can an invoice reach a pending or internal hour?** | **No.** `claim PENDING → 0`, `claim INTERNAL → 0`, `claim PRICED → 1` (control). `claim_time_entries` requires `invoice_id IS NULL AND billable AND duration_minutes IS NOT NULL AND (billing_state='authorized' OR NULL) AND rate_source IS DISTINCT FROM 'none'` |
| **Can one account hold the running slot twice?** | **No.** Second running row → `duplicate key value violates unique constraint "uniq_project_time_entries_running_timer"` |
| **Can a member log on a project she cannot see?** | **She can see it.** A studio co-member reads the project (`is_studio_comember`) before she is rostered and logs through `time_entries_studio_insert_own`; the auto-roster trigger then rosters her. This is HT-25's ruled door, and it grants no collateral read — her own read policies all carry `user_id = auth.uid()` |
| **Can a member log on behalf of somebody else?** | **No.** `log_time` binds `user_id := auth.uid()` unconditionally, is SECURITY INVOKER, and `ON CONFLICT (id) DO NOTHING` + a re-SELECT under RLS makes a guessed id either her own row or `insufficient_privilege`. Replay-safe: a second call with the same id returns the original row, so the iOS outbox re-drain cannot double-bill |
| **Can the classifier raise on a legacy shape?** | **No.** A project with `studio_id` NULL — the population `00620`'s new gate deliberately enlarges — prices gracefully for both the lead and a rostered member: `state=authorized source=none`, and `log_time` accepts it. A caller with *no* relationship is refused (`resolve_time_rate_cents: no relationship to project`), which is correct |
| **Can the rate ROLE be moved to buy a higher rate?** | **No.** `rate_role='ceo'` → *"rate_role ceo is not a role this member holds on the project"*; zero duration → CHECK refusal |
| **Can an internal hour be made billable, or named onto a foreign studio?** | **No.** `billable=true` internal → RLS refusal (`internal_time_own_insert` requires `billable = false`); foreign `studio_id` → `time_entry_studio_id_not_member` (00611's guard) |
| **Does `notes` leak through any rollup?** | **No.** `time_entry_ledger` has 0 `notes` columns; neither `studio_hours_rollup`'s nor `project_hours_total`'s result type contains it; the CSV omits it by construction |
| **Is the invoiced lock untouched?** | **Yes.** `guard_invoiced_time_entry`'s head is `00177`; no file in 00595–00620 redefines it, and its `BEFORE DELETE OR UPDATE` trigger is in place |
| **`00620` against every Strata shape** | **No raise on any of twelve shapes** — §A.3 |

---

## §G — Carried items, dispositioned

| Item | Verified state this round | Disposition |
|---|---|---|
| **W6-R3-01** note field 20px / null AX label | Not re-measured (iOS AX; no device or Simulator in this lens) | **Accept as residual** — hand to the iOS reviewer |
| **W6-R3-02** `log()` swallows a failed `store.save()` then dismisses | Not re-measured; no `W6-fix-r*.md` exists | **Accept as residual** — local to the outbox, which re-drains idempotently (verified server-side: `log_time`'s `ON CONFLICT DO NOTHING` makes a replay free). Not a money or read exposure |
| **W6-R3-06** `rate_source` NULL renders "Billable" | **Confirmed present**, `FieldHours.swift:98` | **MS-08 stands — but the stated one-line fix is wrong.** See **R3-m2**: the row carries no rate column, so the fix must add one and mirror `timeRateProvenance`'s three states |
| **W6-R3-07** stepping duration with no open visit files a future span | **Confirmed present**, `FieldLogTime.swift:138-141` / `:155-157`; server half re-measured (nine CHECKs, none on `started_at` or the span end) | **Open. MS-07's remedy does not close it** — see **R3-m1**. The guard must bound `p_started_at + duration`, not `p_started_at` |
| **W6-R3-10** V4 stepper/billable gated on `projectID` | **Confirmed in code** — `canLog` is `(projectID?.nilIfBlank) != nil` (`FieldLogTime.swift:152-154`); never measured on a device at 390 | **Accept as residual** — and the ship report must say plainly that those two controls have never been measured at 390 |
| **W7-R6-03** an emptied rate card passes readiness | **Confirmed** — `readiness.ts:306-331`: R-7, `ZERO_RATE_BLOCKER` and `UNBOUND_ROLE_BLOCKER` are each guarded on `roles.length > 0`, so a rate-card part with zero roles asks nothing. Money consequence re-verified benign: no tier-1 rate means the resolver falls through and the hour is visibly stranded (`rate_source` `'none'` / `pending_authorization`), never silently zeroed — `claim_time_entries` refuses both | **Accept as residual, with that reason recorded** |
| **W7-R6-05 / W7-R5-03** sub-44px `Remove` | Not re-measured (UI lens) | **Accept as residual** — §A deviation, outside this lens |
| **W7-R5-02** no `sortOrder` re-index after `Remove` | Not re-measured (UI lens) | **Accept as residual** |
| **W7-R5-04** trim drops the tail, not the unbindable row | Not re-measured (UI lens) | **Accept as residual** |
| **W7-R6-04** the studio half of HT-4 sits behind `agreement-parts` | **COULD NOT VERIFY — fourth attempt, token still expired.** Gating re-read in code and found broader than recorded: `studio-workspaces` gates the whole page, and with it HT-3's per-member rate door, not just HT-4's card | **MUST VERIFY BEFORE SHIP — MS-06 (§B.2).** Not dispositioned |
| **W7-R5-07** noon-UTC can file `started_at` in the future | **Confirmed open** — a `+400d` `started_at` writes and is `authorized` | **Folded into MS-07**, which *does* close this one (unlike W6-R3-07) |
| **n7-02** studio money under the word "mine" | **FIXED** — `.eq("user_id", …)` verified on the band's own query | **Closed** |
| **n7-05** a two-studio viewer reads only the alphabetical first | **FIXED** at round 1 (S-1/S-2), unchanged | **Closed** |
| **n7-06** same-day second save re-authors | Unchanged; no money consequence (a subject who re-stamps herself makes `created_by = user_id`, which the resolver closes to `'none'`) | **Accept as residual** — authorship display only |
| **W3-R5-m3** Enter submits with no note | Not re-measured (UI lens) | **Accept as residual** |
| **W3-R5-m5** e2e serial-mode first case pre-existing red | Not re-run (portal e2e outside this lens) | **Accept as residual, pre-existing** |
| **P2-n1 residual** (UTC bucket labels) | Open by decision — and **found at a third site, client-facing** | **Accept as residual, but amend the ruling** — see **R3-m3** |

---

## §H — What I did NOT verify

* **Strata / prod was not touched** — not by SQL, not read-only, not by the CLI. MS-05's
  eight numbers are unmeasured and remain a pre-push step.
* **The `agreement-parts` and `studio-workspaces` rollouts** — §B.2, reproduced.
* **iOS** — no Simulator, no device. W6-R3-01, -02, -10 are dispositioned on code reading
  only; MS-08 and W6-R3-07 on code reading plus a measured server half. `capture-gate.sh`
  was not re-run (nothing under `apps/mobile` moved after round 1's green).
* **Portal e2e / Playwright** — not run. P2-M3's fix was read, not executed; W3-R5-m5
  carried unverified.
* **`@patina/design-system`'s vitest suite** — not run (it hung twice in round 2; I did
  not retry). Not run is not green.
* **A full `supabase db reset`** — deliberately not run; I am not the named agent. The
  idempotence evidence is a second-run replay against the already-applied stack, which is
  the strictly harder half and is what surfaced MS-14.
* **`pnpm lint` outside designer-portal** — its config does not resolve elsewhere, so a
  green there would prove nothing.
* **MS-11's render half** — the band's inputs and query were measured and the JSX at
  `hours-ledger.tsx:1187-1244` was read, not rendered.

---

## §I — What must happen before the push

1. ⛔ **MS-06** — read the `studio-workspaces` and `agreement-parts` rollout percentages in
   the PostHog UI (project 326191) and write both numbers into the ship report. Hard gate.
   `studio-workspaces` is the one that decides whether the program ships working or inert.
2. ⛔ **MS-15 / HT-10-b** — Kody's ruling. **Blocker if HT-10-a binds every read path.**
   If the exception stands, amend the ruling text: it covers **bulk, per-member reads and
   writes**, not one row at a time (§B.1).
3. ⚠ **MS-05** — run `ms-05-strata-legacy-stamp-preflight.sql` on Strata and fill §1②a's
   eight values. Read `left_null_ambiguous` and `left_null_non_designer_lead` first — the
   second is new and, on a legacy book, is likely to be the largest of them.
4. ⚠ **P2-M1** — run the push from the linked, up-to-date main checkout (§0a).
5. ⚠ **N-11** — stage the ship commit with explicit pathspecs; never `git add -A`.

Recommended and cheap, not gating: **MS-07 corrected per R3-m1** (bound the span end, not
the start), **MS-08 corrected per R3-m2** (add the rate column first), **R3-m3** (one line
in `rulings.md` under P2-n1), **MS-09 / R3-m4** (one line in `run-sql-tests.sh`),
**N-06 / N-10** (two allowlist lines), **N-15** (delete or correct `TimeEntryFilters`).
