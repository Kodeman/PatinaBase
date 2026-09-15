# Final integration review — money + security — round 2

`clean = false`

**0 blockers · 6 majors · 4 minors · 7 notes.**

Branch `hour-tracking/integration` @ `5ee33101f` (pushed; `origin/hour-tracking/integration`
is the same sha), worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-integration`,
119 commits on `origin/main`. Every measurement below ran on the isolated stack
**patina-hours** (Postgres `127.0.0.1:54422`). Nothing was reset; every mutation ran inside a
transaction that was rolled back. **Strata was not touched, by any means, read-only included.**
54321/54322 were never contacted.

**Round-1 verdict on the five code fixes: all five discharged, verified independently rather
than taken from the fix report.** The six new majors are (a) three gaps the round-1 fixes left
or opened, (b) one regression the MS-01 fix introduced, (c) one exposure round 1 measured
incorrectly, and (d) MS-06, which is still not verifiable here.

---

## §A — Round-1 blockers and majors: verified, one by one

| Round-1 finding | Claimed | **Verified this round** |
|---|---|---|
| **MS-01** blocker | FIXED via new `00617` | **DISCHARGED** — and re-measured end to end through RLS (§A.1). One read path was missed → **MS-11** |
| **MS-02** blocker | FIXED in `00603` + `00615` | **DISCHARGED** — gate live, contract test green, assertion neither moved nor allowlisted (§A.2). The parallel path in `00620` is ungated → **MS-12** |
| **MS-03** blocker | FIXED (manifest hash) | **DISCHARGED** — manifest hash equals the live body hash byte for byte (§A.3) |
| **MS-04** major | FIXED (both exporters) | **DISCHARGED** — guard present and correct in both files (§A.4). `qbo-export` is not in the ship checklist's deploy list → **MS-13** |
| **MS-05** major | PARTLY CLOSED | **CONFIRMED partly closed** — preflight file exists, §1②a exists with the seven-value table and the "read `left_null_ambiguous` first" instruction. **Still open pre-ship**; Strata's numbers are unmeasured |
| **MS-06 / W7-R6-04** major | NOT CLOSED | **STILL NOT CLOSED** — reproduced this session, §A.6. Carried as the one hard pre-ship gate |
| **S-1 / S-2 / n7-05** major | FIXED | **DISCHARGED**, and the new store is bounded (§A.5) — no foreign studio id is injectable through it |
| **S-3 / S-4** major | already recorded | **CONFIRMED present** in `ship-checklist.md` (§1③ client-before-designer; §1② one `db push --include-all` in version order + the two `roster_role` probes) |

### A.1 — MS-01, re-measured through RLS

Catalog, not the fix report:

```
project_unbilled_time columns: … billing_state, rate_source, rate_role      -- both appended last
claim_time_entries: … AND (billing_state = 'authorized' OR billing_state IS NULL)
                        AND rate_source IS DISTINCT FROM 'none'
```

Live attack, one rolled-back transaction, as the project's own designer (`SET LOCAL role
authenticated` + a `request.jwt.claims` sub), on a studio that has not priced her:

```
 unpriced row      | authorized | none |  (NULL rate) |  (NULL amount)
 D sees it in view | resolved_rate_cents 0 | amount_cents 0 | rate_source none
 D claims unpriced |  claimed = 0
 D claims a PRICED row | claimed = 1
 after            | priced row -> invoice_id set ; unpriced row -> invoice_id NULL
```

The backstop holds against a hand-built call, not just against the portal. `IS DISTINCT FROM`
keeps a pre-00600 legacy NULL claimable, as intended (P-4). The hook split
(`useUnbilledTime` returning `{ entries, ratePendingEntries }`, `useStudioUnbilledTime`
filtering) and the composer's disabled "rate pending" rows with `set the studio rate →` are
present and correct; the composer's prefill seed intersects `initialTimeEntryIds` with the
**priced** set (`invoice-composer.tsx:270-277`), so an unpriced id handed in from anywhere
cannot be ticked. `filterProjectUnbilledEntries` is unchanged and still billing-state only —
the split lives above it.

### A.2 — MS-02

`pg_get_functiondef(set_project_studio_id_owned) ~ 'has_designer_domain_role'` → **t**.
The three files that define the function are `00602`, `00603`, `00615`; `00603` and `00615`
carry the gate (5 and 4 occurrences), `00602` does not — harmless, because `00603` replaces it
two numbers later in the same push and nothing runs between them (note N-14).

`supabase/tests/edge_api/public_rpc_authorization_contract_test.sql` → **exit 0**. The file's
diff against `origin/main` is **one VALUES row** — the `Team can view their project time
entries` qual re-registration at `:533-546` — with the paragraph explaining it. The `:161-171`
assertion this program broke is **untouched**, and the file is **not** in `KNOWN_FAILURES.md`.

### A.3 — MS-03

```
manifest row : 33af21f76ae82453a95a5cbbf8908d07e9cc4df02e09f82dc69dcd2a5786dc6a
live body    : 33af21f76ae82453a95a5cbbf8908d07e9cc4df02e09f82dc69dcd2a5786dc6a
```

`public_sd_hardening_contract_test.sql` → **green**. The manifest paragraph is in the
established shape and names what 00619 changed, that it takes no new lock, and that signature /
arguments / result type / proconfig / prosecdef / ACL / the `issue_invoice_for_actor` call site
/ the `'commercialDocumentId'` anchor are unchanged.

### A.4 — MS-04

Both `apps/designer-portal/src/lib/document/time-export.ts:70-79` and
`supabase/functions/qbo-export/index.ts:169-178` carry the identical guard. The number
exemption is sound: `/^[+-]?\d+(\.\d+)?$/` admits only digits after an optional sign, and every
formula beginning `-` needs an operator, a function name or a cell reference beyond digits.
`\r`/`\n` are flattened before the test, so no leading-newline bypass. `deno check
qbo-export/index.ts` clean; `time-export.test.ts` covers three injection cases plus the
negative-number case.

### A.5 — S-1 / S-2: the new studio store cannot be used to name a studio she does not hold

`selectViewerStudioId` writes a raw uuid into `localStorage['patina.hours.viewer-studio-id']`,
which a viewer controls. All three consumers resolve it by **lookup inside her own membership
list**, never by passing it through:

* `useViewerStudio` — `candidates.find(o => o.id === chosenId) ?? candidates[0]`, candidates
  filtered to `design_studio` + `owner|admin`;
* `useInternalTimeStudio` — same shape, filtered to `design_studio` + non-guest (this one
  writes a **permanent** `studio_id` onto an internal hour, so it mattered);
* `useAccountStudio` — `studio ?? fallback`, both drawn from `useOrganizations()`.

A forged id therefore falls through to `candidates[0]`. Server-side the door is closed twice
over: `studio_hours_rollup` is SECURITY **INVOKER** over the `security_invoker` view
`time_entry_ledger`, so an arbitrary `p_studio_id` returns the caller's own rows and nothing
else, and `guard_time_entry_studio_id` (00611) plus `internal_time_own_insert`
(`is_active_studio_member(studio_id)`) bound the write. **No finding.** Every `localStorage`
access is wrapped in try/catch, including the module-level initial read.

### A.6 — MS-06 / W7-R6-04, reproduced

```
mcp__plugin_posthog_posthog__exec  →  MCP server "plugin:posthog:posthog"
                                      requires re-authorization (token expired)
```

`agreement-parts` and `studio-workspaces` rollout percentages remain **unknown**.
`account-studio-page.tsx:198` reads `useFeatureFlag('agreement-parts')` and the flag layer is
fail-closed, so if it is not at 100% at ship, **HT-4's studio half does not exist in
production**. The checklist's §2.1 gate stands. **Do not push on an assumption.**

---

## §B — MAJORS (6)

### MS-11 · MAJOR · confidence HIGH (data half measured, render half code-read) — the Hours ledger's unbilled balance still counts a rate-pending hour, and still enables "Bill it" on it

MS-01's split landed in the two hooks. `hours-ledger.tsx` does **not** use either of them for
this band — it holds its own raw read:

```ts
// hours-ledger.tsx:385-397   (pre-existing on origin/main; MS-01 did not extend to it)
.from("project_unbilled_time")
.select("id, project_id, duration_minutes, amount_cents, authority_rate_id, billing_state")
```

No `rate_source` column, no filter. Three consequences, all under `scope === "mine"`:

1. `unbilledMinutes` (`:430`) sums the minutes of rate-pending rows; `unbilledCents` (`:434`)
   sums their `amount_cents`, which the view COALESCEs to **0**. So the band at `:1141-1147`
   prints `UNBILLED · ALL TIME  $0.00 · 2H 00M` for a member whose studio has not filled its
   rate card — the exact population MS-01 names. Measured on the stack: such a row does reach
   `project_unbilled_time` with `resolved_rate_cents 0 · amount_cents 0` (§A.1).
2. `billingTargetRows` (`:452-461`) is `filterProjectUnbilledEntries(unbilledRows, …)` —
   billing-state only — so it carries rate-pending ids, and `Bill it` (`:1173`) is **enabled**
   on them. `final-fix-r1.md` states that "the ids `hours-ledger`'s `billingTargetRows` hands
   the composer can no longer be refused by the RPC"; that sentence describes
   `useStudioUnbilledTime`, which this file does not call. **The claim is wrong.**
3. `unbilledProjects` (`:439`) counts a document into "· N documents" on unbillable hours alone.

**No money moves.** The composer's seed intersects against the priced set, so nothing is
ticked, and `claim_time_entries` would refuse anyway — the act dead-ends on a composer whose
Hours list is entirely disabled rows. The defect is a money *figure* that overstates and an
act offered that cannot be taken.

**Fix (small):** select `rate_source` in that query and drop rate-pending rows from
`unbilledRows` (or split them the way the hook does and print the held-back count beside the
band). One line of `.select()`, one filter.

### MS-12 · MAJOR · ruling owed · confidence HIGH (measured, with a negative control) — `00620` applies the tier rule to a lead MS-02's own repair refuses

`00620`'s stamp statement (`:459-484`) calls `designer_tier_pricing_studio(project.designer_id)`
directly. That helper asks `organizations.type/status` and `organization_members.role/status`
and **nothing about a designer-domain role** (body read in full). `00603`/`00615` now do ask.
So the two paths disagree by construction. Measured, same lead, same studio, one transaction:

```
 has_designer_domain_role(non-designer lead)   -> f
 designer_tier_pricing_studio(...)             -> e7000000-…-0001 / employer
 after INSERT  (00603's repaired gate)         -> studio_id  (NULL)      <- refused
 after 00620's stamp statement                 -> studio_id  e7000000-…-0001  <- stamped
```

The consequence is MS-02's sentence, verbatim, on the legacy population: the stamped studio is
the key for `time_entries_owner_admin_{read,update,delete}`, `project_hours_total`'s third leg,
`00604`'s ledger `studio_id` and the audit row's `organization_id` — a read+write grant to that
studio's owner/admin over a project `00511` decided was not theirs. The employer tier is the
*common* shape (a super_admin or an admin-created lead with one studio seat), not the exotic one.

This is open question #3 handed back by `final-fix-r1.md`, now with a measurement. It is a
**ruling**, not a unilateral fix: adding the gate to `00620` moves the very numbers MS-05 asks
to be read first. **If the orchestrator rules the gate binds the backfill, `00620` must gain it
before the push (then it is a blocker); if it rules it does not, record the exception in
`rulings.md` before the push** — it cannot ship as an undocumented disagreement between two
files written in the same week.

### MS-13 · MAJOR · confidence HIGH (checklist read against the diff) — the ship checklist does not deploy `qbo-export`, so half of MS-04's fix never reaches prod

The function diff is now **three** functions:

```
supabase/functions/digest-dispatcher/{index,status,status.test}.ts
supabase/functions/qbo-export/index.ts            <- added by MS-04's fix
supabase/functions/time-nudges/{index,logic,index.test}.ts
```

`ship-checklist.md` §① (`:47-48`) deploys `digest-dispatcher` and `time-nudges` only, and its
pre-flight row at `:21` still asserts *"the function diff is `digest-dispatcher/{index,status,
status.test}.ts` + the new `time-nudges/` only"* — which is now false. Follow the checklist and
the CSV-formula-injection fix ships to the designer portal and **not** to the AP-side export it
was taken in.

**Fix:** add `supabase functions deploy qbo-export` to §① and correct the `:21` row. (`_shared`
is genuinely untouched — `git diff --name-only origin/main...HEAD | grep -c '_shared'` → **0** —
so there is still no importer cascade; §C(h).)

### MS-14 · MAJOR · confidence HIGH (measured) — `00617` broke `00596`'s second-run idempotence

Round 1 measured all 24 migrations `IDEMPOTENT-OK`. Re-run this round, 25 files, each replayed
inside a rolled-back transaction against the already-applied stack:

```
IDEMPOTENT-OK   00595 00597 00598 00599 00600 00601 00602 00603 00604 00605 00606 00607
IDEMPOTENT-OK   00608 00610 00611 00612 00613 00614 00615 00616 00617 00618 00619 00620
IDEMPOTENT-FAIL 00596 :: ERROR: cannot drop columns from view
```

`00596`'s `CREATE OR REPLACE VIEW public.project_unbilled_time` stops at `billing_state`;
`00617` appended `rate_source, rate_role`; Postgres refuses a replace that removes columns. The
file cannot name them — `project_time_entries.rate_source` does not exist until `00600` — so
this is not a fixable ordering bug, it is a property `00596` lost.

**Not a ship-time hazard:** one `db push --include-all` applies in version order, `00596` before
`00617`, and every replay (`db reset`, a fresh stack, `integration.yml`) preserves that order. It
is a broken stated property and a foot-gun: `00596`'s own banner claims *"Column list, order and
types are unchanged so CREATE OR REPLACE VIEW holds"*, which is now true only on a first run, and
any later hand who re-derives the view from `00596`'s body will fail.

**Fix (documentation, not code):** a line in `00596`'s banner — "as of `00617` this body is no
longer standalone-replayable; the view's live column list is `00617`'s" — and a matching line in
the checklist beside the migration list. Do **not** edit `00596` to add the columns (they do not
exist at that number) and do **not** add `DROP VIEW` (dependents).

### MS-15 · MAJOR · ruling owed · confidence HIGH (measured) — a plain-member project lead reads a colleague's confidential per-member rate **and notes**

Round 1's §6 recorded *"Can a member read a teammate's row, notes or rate? **No.**"* That is
**false for the project's own designer**. `Designers manage their project time entries`
(00177:136-137) is an `ALL` policy on `projects.designer_id = auth.uid()` with **no `user_id`
leg**, and HT-10-a's amendment narrowed only the other two.

Measured, one rolled-back transaction. Studio S; owner O; **D a plain `member`** who is
`projects.designer_id` on the project; **M a plain `member`** rostered on it, priced 27500 by O
(arm's-length authorship, so tier 2 answers):

```
 snapshot on M's hour            | hourly_rate_cents 27500 | rate_source studio_member
 D reads M's studio_member_rates | 0 rows                        <- RLS denies her the card
 D reads M's time row            | 27500 | 27500 | 'M private note'   <- she reads it anyway
 O reads M's time row            | 1 row                         (control: owner may)
```

The number RLS refuses her on `studio_member_rates` is handed to her on
`project_time_entries`, together with the free-text note. `resolve_time_rate_cents`'s own
comment gates its designer leg on `pg_trigger_depth() > 0` to stop precisely this leak and
justifies the gate with *"a number RLS gives her nothing of"* — that premise does not hold.

**This is known to the program and was never ruled.** `00606:83-95` states it plainly ("a
project's OWN designer still reads every row of her own project, per-person rate included …
reported to the orchestrator as the residue of HT-10-a"), `00606`'s postcondition (e) pins the
policy as deliberately untouched, and `studio_hours_rollup_test.sql` case (f) asserts it as
shipped behaviour. It appears **nowhere** in `rulings.md` (0 matches) and **nowhere** in
`ship-checklist.md` (0 matches). Neither round-1 review named it.

The implementer's reason is real: the same policy is what lets a designer correct a teammate's
entry (`time_rate_resolution_test.sql` case (ab4), W1-R1-05), and hiding one column from one
actor is a **column privilege**, not a policy — RLS cannot express it. So the choices are (a)
rule the exception and record it, (b) a `GRANT`-level column split on `hourly_rate_cents` /
`rated_amount_cents` / `notes` plus a definer correction RPC, or (c) narrow the designer policy
to own rows and move correction behind the existing admin write path (00605).

**Escalation, stated plainly: if the orchestrator reads HT-10-a's "members read own rows plus
aggregates" as binding on every read path, this is a blocker and the ship must not go without a
ruling.** Graded major because it is deliberate, documented in the migration, and unreachable
by anyone but the project's own lead.

### MS-06 / W7-R6-04 · MAJOR · carried, still unverifiable

See §A.6. The hard pre-ship gate. Carried forward unchanged.

---

## §C — Gates run, verbatim

### (a) SQL suite — every file under `supabase/tests`, `ON_ERROR_STOP=1`, `-H 127.0.0.1 -p 54422`

`scripts/run-sql-tests.sh` still cannot run here (MS-09, reproduced verbatim — `mktemp: mkdtemp
failed on /var/folders/…: Operation not permitted` at `:94`, then `/known_failures.normalized:
Operation not permitted` ×24 and `error: no .sql files found`), so the same loop ran by hand.

**188 files · 163 PASS · 25 FAIL.** All seventeen hour-tracking / adjacent files pass, and the
two files this program broke in round 1 are now green:

```
PASS  supabase/tests/edge_api/public_rpc_authorization_contract_test.sql   (was: ERROR :171)
PASS  supabase/tests/edge_api/public_sd_hardening_contract_test.sql        (was: ERROR :2424)
PASS  supabase/tests/billing/{legacy_project_studio_stamp,time_claim_atomicity,time_entry_ledger,
      time_log_rpc,time_rate_resolution,time_unbilled_view_repair}_test.sql
PASS  supabase/tests/field/time_entry_activity_travel_test.sql
PASS  supabase/tests/rls/{internal_time,project_hours_total,studio_hours_rollup,
      studio_member_rates,time_entry_admin_write,time_entry_auto_roster,
      time_entry_studio_stamp}_test.sql
PASS  supabase/tests/rls/00563_proposal_signing_multi_studio.test.sql
PASS  supabase/tests/commercial/{agreement_fee_schedules,agreement_parts}_test.sql
```

Of the 25 reds, **22 are in `KNOWN_FAILURES.md`**. **Three are not**, each re-verified as not
this program's:

| File | Why it is not this program's |
|---|---|
| `capture_enrichment/target_type_visibility_test.sql` | `FAIL c2` on the `00584` `field_captures_studio_*` cause already documented for its sibling. No migration in `00595-00620` defines a policy on those tables. **N-06 stands** — add the allowlist entry in the same shape |
| `edge_api/catalog_roles_remote_conformance_negative_test.sql` | Isolated-stack artifact, not a defect: `:45-55` hard-refuses any port but `54322` and then `SELECT 1/0`. Will pass on the ordinary stack |
| `proposals/proposal_copy_immutability_test.sql` | `proposals column census drifted` — `subject`, added by `00590_engagement_subject.sql`, which is on `origin/main` and merged in |

### (b) Migration idempotence — second run of every file, each in a rolled-back transaction

24 of 25 clean, **`00596` fails** — see **MS-14**. None of the 25 contains `CONCURRENTLY`,
`ALTER TYPE … ADD VALUE` or `VACUUM`, so the transactional replay is a faithful second-run test.

### (c) Edge functions — `deno test --allow-all time-nudges/ digest-dispatcher/`

```
ok | 18 passed | 0 failed (68ms)
```

### (d) `deno check supabase/functions/qbo-export/index.ts` → clean

### (e) Type-checks

```
@patina/supabase        type-check  clean
@patina/designer-portal type-check  clean
@patina/client-portal   type-check  clean
@patina/design-system   type-check  clean
```

### (f) Unit suites

```
@patina/supabase          102 files / 1259 passed | 12 skipped
@patina/designer-portal   581 suites / 7445 tests passed
@patina/client-portal     151 suites / 2475 tests passed
@patina/design-system     NOT RUN — the suite hangs (>10 min, no output) in this environment.
                          The one file in this diff, InvoicePaper.test.tsx, was run alone:
                          1 file / 3 tests passed. See N-12 — not run is not green.
```

### (g) `pnpm --filter @patina/admin-portal build` → **green** (closes round-1 §7's open gate)

The repo's strictest gate, and `packages/supabase` is in this diff. Full route manifest emitted,
no type errors.

### (h) `pnpm --filter @patina/designer-portal lint` → **0 errors**, 201 pre-existing warnings

### (i) Generated types in sync

`supabase gen types typescript --db-url …54422` against the committed file: the only differences
are cosmetic parenthesisation in the trailing generic helper block (`TableName extends
(X extends …)` vs `TableName extends X extends …`), a CLI-version artifact affecting four
declarations and no table, function, enum or column. **In sync.**
*(Note: `pnpm db:generate` inside the sandbox fails and truncates the file to 0 tables — the
CLI cannot reach the DB without `dangerouslyDisableSandbox`. The file was restored with
`git checkout --` and is byte-identical to HEAD; the worktree was left as I found it.)*

### (j) `_shared` edge-function files

`git diff --name-only origin/main...hour-tracking/integration | grep -c '_shared'` → **0**.
**No importer cascade.** Three function directories changed (`digest-dispatcher`, `qbo-export`,
`time-nudges`) and each needs its own deploy — see **MS-13**.

### (k) `00614`'s cron target, and the digest exclusion

```
time-nudges-hourly | 0 * * * * | SELECT public.invoke_edge_function('time-nudges', '{"rule":"running_timer"}'::jsonb);
```

`'time-nudges'` matches the directory `supabase/functions/time-nudges/` and the
`[functions.time-nudges]` block in `config.toml` exactly; a guarded unschedule precedes it.
**Correct.**

Digest exclusion holds for **both** types: `DIGEST_EXCLUDED_TYPES` (`status.ts:21-38`) carries
`time_entry_running_long` **and** `time_weekly_unlogged_reminder`, both string-identical to
`logic.ts:61-62`'s constants and to `00614`'s two partial UNIQUE index predicates, and the set
is applied at `digest-dispatcher/index.ts:275`. Pinned by the passing test *"hour-tracking nudge
rows never enter the digest collection"*.

### (l) `supabase/config.toml`

`git ls-files -v` → `S supabase/config.toml` (skip-worktree, as required). The **committed blob**
still carries `project_id = "supabase"` and ports 54321/54322 — the isolated-stack edit is not
staged and will not ship.

---

## §D — MINORS (4, all carried unchanged from round 1)

* **MS-07 · MINOR** — `log_time` still accepts a span ending in the future, and such an hour is
  `authorized` and claimable. Re-verified: `project_time_entries` carries nine CHECK constraints
  and **none** bounds `started_at`; `log_time`'s body validates `p_entry_id`, `auth.uid()`,
  `p_billable IS NOT NULL` and `p_duration_minutes >= 1` and nothing else. This is the server
  half of **W6-R3-07** and **W7-R5-07** together. One line:
  `IF p_started_at > now() + interval '1 day' THEN RAISE …`.
* **MS-08 · MINOR** — `FieldHours.swift:98` is still `if row.rateSource == "none"`, so a
  pre-00600 row (`rate_source` NULL, no default, no backfill) reads as **"Billable"** on the
  phone, to the person whose pay it is. One line:
  `if row.rateSource == nil || row.rateSource == "none"`. (**W6-R3-06.**)
* **MS-09 · MINOR** — `scripts/run-sql-tests.sh:94` still cannot run in a sandboxed agent
  session. Reproduced verbatim this round; every reviewer hits it.
  `mktemp -d "${TMPDIR:-/tmp}/run-sql-tests.XXXXXX"`.
* **MS-10 · MINOR** — `studio_member_rates_admin_update` has no subject guard where
  `studio_member_rates_admin_insert` has one. Unchanged; recorded as an asymmetry, not an
  exploit (the history guard freezes identity columns and the resolver prices off
  `projects.studio_id` regardless).

---

## §E — NOTES (7)

* **N-01 · note** — `project_hours_total` remains an arithmetic channel on a two-contributor
  project (total − mine = the colleague's). Ruled by HT-10; the program strictly narrows the
  prior state. Recorded so it is not rediscovered as a regression.
* **N-02 / N-13 · note** — `stamp_time_entry_updated_by` is the only function this program adds
  with **no `SET search_path`** (`proconfig` NULL), **and** it is EXECUTE-granted to `anon` and
  PUBLIC (`has_function_privilege('anon', …)` → **t**). No exploit — it is SECURITY INVOKER, its
  only reference (`auth.uid()`) is schema-qualified, and a direct call raises *"trigger functions
  can only be called as triggers"*. A quality-bar gap on both halves of patina-db-migrations'
  checklist. Every other function this program adds pins `public, pg_temp` and is closed to anon
  (verified across 14 of them).
* **N-03 · note** — `audit_time_entry_change` files `organization_id =
  project_pricing_studio_id(OLD.project_id)`, NULL for exactly the population `00620` leaves
  NULL, so those HT-23 trace rows are readable only by the actor who made the edit.
* **N-04 · note** — `time_entry_ledger` is `arwdDxtm` to `authenticated` and
  `project_unbilled_time` the same plus an `anon` grant. Both are `security_invoker=true` and
  neither is auto-updatable, and **anon is closed in fact** — re-probed this round across five
  relations and seven RPCs: `project_time_entries` 0 rows, `project_unbilled_time` 0 rows,
  `studio_member_rates` / `time_entry_ledger` denied outright, and `project_hours_total`,
  `studio_hours_rollup`, `project_pricing_studio_id`, `resolve_time_rate_cents`,
  `designer_tier_pricing_studio`, `claim_time_entries`, `stamp_project_pricing_studio` all
  `permission denied for function`.
* **N-07 · note (ruled residual, accepted)** — `time-nudges`' `running_timer` arm is ungated by
  design (D-R2-01, recorded in the function header and `00614`'s banner); only the dark
  `weekly_unlogged` arm runs `isServiceRoleCaller`. Any holder of the publishable anon key can
  POST and force a service-role sweep; the response carries counts only, and `00614`'s two
  partial UNIQUE indexes make the writes idempotent. The unnamed cost is that every such POST
  also opens a `job_runs` row (`index.ts:247-249`).
* **N-10 · note (gate hygiene, pre-existing, NEW this round)** —
  `supabase/tests/document/close_project_readiness_test.sql` is allowlisted, but under a message
  that no longer matches what it does. Allowlist says *"permission denied for table
  project_ffe_items"*; it now aborts 100+ lines earlier at `:331` with
  `studio_id_not_designer_studio`, `CONTEXT: PL/pgSQL function set_project_studio_id() line 252`.
  **Not this program's:** `set_project_studio_id`'s head is `00563` (grep over every migration);
  `00595-00620` never redefine it or `has_designer_domain_role`; the projects trigger this
  program adds that sorts *before* it, `aaa_project_studio_id_named_trg`, only writes a
  transaction-local GUC and never touches `NEW.studio_id` (body read in full). The fixture's lead
  holds no designer-domain role and no studio seat, so `00511`'s final leg raises. Update the
  allowlist entry's message so the next reviewer's reds are documented reds.
* **N-11 · note (ship hygiene, NEW this round — RESOLVED during the review)** — mid-review the
  worktree carried `M apps/designer-portal/next-env.d.ts` (a Next dev-server artifact:
  `./.next/types/routes.d.ts` → `./.next/dev/types/routes.d.ts`) and untracked
  `apps/designer-portal/e2e/document/zz-r2-walk.spec.ts`, whose own header read *"TEMPORARY —
  integration review round 2 walk. Deleted at the end of the review."* Neither was mine; both
  were the concurrent product/ship reviewer's, and both are **gone as of my last check**
  (`git status --short` → empty). Recorded because the ship commit must be staged with explicit
  pathspecs, never `git add -A`: a walk spec that reappears is exactly the untracked landmine
  that rule exists for.
* **N-12 · note** — `@patina/design-system`'s vitest suite did not complete (>10 min, no output,
  twice). Only `InvoicePaper.test.tsx` was run, alone, green (3/3). State it as not-run in the
  ship report rather than folding it into "tests pass".
* **N-14 · note** — `00602` defines `set_project_studio_id_owned` **without** MS-02's
  `has_designer_domain_role` gate; `00603` replaces the body one number later in the same push,
  and nothing runs between them, so the ungated body is never live. Recorded only so a later
  hand grepping for the gate does not conclude it is missing.
* **N-08 (updated)** — `00617` is now used; `00609` is the only unused number in the reserved
  `00595`–`00620` range. The checklist already says so.

---

## §F — Carried items, dispositioned

| Item | Verified state this round | Disposition |
|---|---|---|
| **W6-R3-01** note field 20px / null `AXLabel` | Not re-measured (iOS AX, no device/Simulator in this lens) | **Accept as residual** — hand to the iOS reviewer |
| **W6-R3-02** `log()` swallows a failed `store.save()` then dismisses | Not re-measured; no `W6-fix-r*.md` exists | **Accept as residual** — data-loss-shaped but local to the outbox, which re-drains; not a money or read exposure |
| **W6-R3-06** `rate_source` NULL renders "Billable" | **Confirmed still present** — `FieldHours.swift:98` keys the literal `"none"` | **MS-08 — take the one-line fix.** Same sentence as MS-01, second surface |
| **W6-R3-07** stepping duration with no open visit files a future span | **Confirmed still present** — `step(by:)` (`FieldLogTime.swift:158-160`) moves only `durationMinutes`; `startedAt` is anchored at `now − 30m` (`:137`) and never moves. Server half re-confirmed: no CHECK bounds `started_at`, `log_time` unchanged | **MS-07 — cheap, recommended before ship.** One `RAISE` in `log_time` closes this and W7-R5-07 together |
| **W6-R3-10** V4 stepper/billable gated on `projectID` | **Confirmed in code** — `canLog` is `(projectID?.nilIfBlank) != nil` (`FieldLogTime.swift:153-155`); never measured on a device at 390 | **Accept as residual** — and say plainly in the ship report that those two controls have never been measured at 390 |
| **W7-R6-03** an emptied rate card passes readiness | **Confirmed** — `readiness.ts:306-331`, every rate-card check is guarded on `roles.length > 0`, so a card emptied to zero roles asks nothing. Consequence re-verified benign: an emptied card is a *services* shape, the classifier files those `pending_authorization`, `project_unbilled_time` filters on `billing_state='authorized'`, and `claim_time_entries` admits only `authorized OR NULL`. The money is visibly stranded, never silently zeroed | **Accept as residual, with that reason recorded** |
| **W7-R6-05 / W7-R5-03** sub-44px `Remove` | Not re-measured (UI lens) | **Accept as residual** — §A deviation, outside this lens |
| **W7-R5-02** no `sortOrder` re-index after `Remove` | Not re-measured (UI lens) | **Accept as residual** |
| **W7-R5-04** trim drops the tail, not the unbindable row | Not re-measured (UI lens) | **Accept as residual** |
| **W7-R6-04** the studio half of HT-4 sits behind `agreement-parts` | **Could not verify — PostHog MCP token still expired, reproduced this session** | **MUST VERIFY BEFORE SHIP — MS-06.** Not dispositioned |
| **W7-R5-07** noon-UTC can file `started_at` in the future | Re-probed: nine CHECKs on `project_time_entries`, none on `started_at` | **Folded into MS-07** |
| **n7-02** studio money under the word "mine" | **Confirmed still present, and now compounded.** The `unbilled · all time` band renders under `scope === "mine"` but its query (`hours-ledger.tsx:385-397`) carries **no `user_id` filter**, so an owner/admin sees the whole studio's balance under that word — where the week read beside it *is* `.eq('user_id', me)` | **Accept as residual** — re-flagged, and it is the same query MS-11 asks to be repaired, so fix both in one edit |
| **n7-05** a two-studio viewer reads only the alphabetical first | **FIXED** by S-1/S-2 — verified: one module-level choice, three surfaces, `(1 of 2)` caption and `switch`, ordered fallback (§A.5) | **Closed** |
| **n7-06** same-day second save re-authors | Re-checked for money consequence: none. `guard_studio_member_rate_history` re-stamps `created_by` only when `hourly_rate_cents` moves, and COALESCEs the displaced author into `original_created_by`; a subject who re-stamps herself makes `created_by = user_id`, which fails the resolver **closed** to `'none'` | **Accept as residual** — authorship display only |
| **W3-R5-m3** Enter submits with no note | Not re-measured (UI lens) | **Accept as residual** |
| **W3-R5-m5** e2e serial-mode first case pre-existing red | Not re-run (portal e2e outside this lens) | **Accept as residual, pre-existing** |

---

## §G — Attacks run that found nothing (recorded so they are not repeated)

Each executed through RLS on the isolated stack with `SET LOCAL role …` and a
`request.jwt.claims` sub, inside a rolled-back transaction.

* **Can a single account move its own resolved rate?** No new path. The studio step is
  `projects.studio_id` and nothing else; the arm's-length conjunct is present in the installed
  body (00615's HT-3-e(2) delta, read in full); `stamp_project_pricing_studio` is DEFINER and
  carries all three bounds of the corrected HT-3-g(b). The new `localStorage` studio choice adds
  nothing — §A.5.
* **Can the rate *role* be moved to buy a higher rate?** No. `resolve_time_rate_cents` ASSERT 3
  validates the pick at the RPC boundary (`pg_trigger_depth() = 0`) and the classifier validates
  it on every INSERT and on every change (`classify_project_time_entry_authority:67-86`, raising
  *"rate_role X is not a role this member holds on the project"*); the project's own designer has
  her pick **discarded** and forced to `lead_designer` above it (W1-R5-03). Tier 2 does not read
  `rate_role` at all.
* **Can a member read a teammate's row, notes or rate?** **Yes, if she is the project's lead —
  see MS-15.** For every other actor: no. `Team can view their project time entries` and
  `time_entries_studio_read` both carry `user_id = auth.uid()` (read off `pg_policy`);
  `time_entry_ledger` and both rollups carry **no `notes`** in their shapes
  (`pg_get_function_result` + `information_schema.columns`, verified this round); the CSV omits
  notes by construction and says so.
* **Can an invoice reach a pending or internal hour?** No. `claim_time_entries` requires
  `invoice_id IS NULL AND billable AND duration_minutes IS NOT NULL AND (billing_state =
  'authorized' OR billing_state IS NULL) AND rate_source IS DISTINCT FROM 'none'`, and
  `project_time_entries_internal_scope_ck` (`(project_id IS NOT NULL) OR (studio_id IS NOT NULL
  AND billable = false)`) makes an internal hour permanently non-billable. The `$0.00` gap is
  closed (§A.1).
* **Can one account hold the running slot twice?** No.
  `uniq_project_time_entries_running_timer` is `UNIQUE (user_id) WHERE duration_minutes IS NULL`
  — one running row per user across every project and every internal hour.
* **Can a member log on a project she cannot see?** Only via HT-25's ruled auto-roster, which
  grants no collateral read (re-confirmed: every table keyed on `is_project_team_member` already
  carries an `is_studio_comember` policy from the 00584 sweep).
* **`00620` against Strata's real shapes.** Re-probed with a fresh fixture: NULL designer →
  `none`; unknown uuid → `none`; `removed` seat → `none`; `active` non-owner seat → `employer`;
  `guest` seat → `none`; a **suspended** design studio alongside an active one → still
  `employer` (the suspended one is invisible, not ambiguating); a **manufacturer** org alongside
  → still `employer`. **No raise on any shape.** The three ASSERTs are arithmetic identities over
  00620's own statement and cannot fail on data. Over the local population the read-only count
  form answers `0 employer / 0 owned / 5 none`, reproducing round 1. **The one thing it does that
  it should be ruled on is MS-12.**
* **`anon`.** Closed on every new object and RPC — N-04.

---

## §H — What I did NOT verify

* **Strata / prod was not touched** — not by SQL, not read-only, not by the CLI. MS-05's seven
  numbers and MS-06's flag rollout are the two pre-ship checks handed back.
* **The `agreement-parts` and `studio-workspaces` rollouts** — PostHog MCP token expired,
  reproduced (§A.6).
* **iOS** — no Simulator, no device. W6-R3-01, -02, -10 are dispositioned on code reading only,
  and MS-08 / W6-R3-07 on code reading plus the measured server half.
* **Portal e2e / Playwright** — not run. W3-R5-m5 carried unverified.
* **`@patina/design-system`'s full vitest suite** — hangs; only `InvoicePaper.test.tsx` ran
  (N-12).
* **A full `supabase db reset`** — deliberately not run; I am not the named agent. The
  idempotence evidence is a second-run replay against the already-reset stack, which is the
  strictly harder half and is what surfaced MS-14.
* **MS-11's render half** — the band's inputs were measured on the stack; the JSX at
  `hours-ledger.tsx:1141-1185` was read, not rendered.
* **`pnpm lint` outside designer-portal** — its config does not resolve elsewhere, so a green
  there would prove nothing (patina-verification).

---

## §I — What must happen before the push

1. **MS-06** — read the `agreement-parts` rollout in the PostHog UI and say the number in the
   ship report. Hard gate. `studio-workspaces` alongside it.
2. **MS-05** — run `ms-05-strata-legacy-stamp-preflight.sql` on Strata and fill §1②a's seven
   values. Read `left_null_ambiguous` first.
3. **MS-12** — a ruling: does "a non-designer lead is never auto-derived a studio" bind the
   `00620` backfill? Gate it, or record the exception in `rulings.md`.
4. **MS-13** — add `supabase functions deploy qbo-export` to the checklist and correct the
   `:21` row.
5. **MS-15** — a ruling on the lead designer's read of a colleague's rate and notes, recorded in
   `rulings.md`. Blocker if HT-10-a is read as binding on every read path.
6. **MS-11** — one `.select()` + one filter in `hours-ledger.tsx` (takes n7-02 with it).
7. **MS-14** — one banner line in `00596` and one in the checklist.
8. **N-11** — stage the ship commit with explicit pathspecs; `next-env.d.ts` and
   `zz-r2-walk.spec.ts` were both gone at my last check, but the rule is what keeps them out.

Recommended and cheap, not gating: **MS-07** (one `RAISE` in `log_time`), **MS-08** (one line in
`FieldHours.swift`), **MS-09** (one line in `run-sql-tests.sh`), **N-06 / N-10** (two allowlist
entries).
