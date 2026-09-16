# W2 — lane A (DB) adversarial review, round 8

**clean = false — ONE MAJOR.** It is a **new** door, not a carried one, and it is the brief's second
blocker/major trigger **literally**: *one* account, *no* ownership transfer, *no* confederate, *no*
consent-free seat — an `admin`-designer of an **honest** employer **rewrites the owner's own open
`studio_member_rates` row** from 25000 to **99900 without touching `created_by`**, so the row stays
arm's-length by HT-3-e(2)'s test *and* by HT-3-e(1)'s new stamp leg; she then stamps her legacy project and
her 120-minute hour comes back **99900 / studio_member / 199800**. Measured 1/1 through RLS as her
(probe A). HT-3-e(2) asks *who authored the row*; the open row's **number** is editable by any
owner/admin with authorship left untouched, and the subject of the rate can be that admin. No test in the
tree performs that UPDATE as the rate's own subject.

**What round 7 DID discharge, measured independently and not quoted:**
- **W2-R7-01 — CLOSED.** I rebuilt the ordinary hire from scratch (plain `member` of TWO employers, three
  legacy projects all `created_by` her, zero projects naming either studio): the **24-call sweep is
  refused 24/24 before any rate exists**, all three columns still NULL; the employer then writes **one**
  ordinary rate row and its **ADMIN** performs the repair; her next hour prices at the employer's
  **28000**; the remaining two legacy projects are repaired by the employer's owner; no column is left
  NULL (probe C, C0–C8b). HT-3-a's remedy now reaches somebody on the shape HT-3-d singles out.
- **W2-R7-02 / W2-R7-03 — CLOSED for the form they name.** Her own **INSERT** of a 99900 row in a studio
  she does not own no longer prices: the hour files `NULL / none` (probes A5–A7, D3). Every neighbouring
  door I could find is shut: self-promotion to `owner` → `owner_promotion_requires_owner`; a second owner
  seat for herself → `owner_insert_requires_owner`; `created_by := NULL` → 23514; rewriting a **closed**
  row → 23514; INSERT forging `created_by` = the owner → 42501; a **plain member** rewriting her own open
  row → 0 rows under RLS, value unchanged (probes B1–B8, E9–E9d). The one door left open is the MAJOR
  above, and it is the one nobody tested.
- **W2-R7-06** discharged (s3 now asserts the employer's owner repairing). **W2-R7-05** fixed in the r7
  report (`supabase/tests/KNOWN_FAILURES.md`, no per-directory file — which is still why the runner calls
  eight documented failures "unexpected").

**Scope reviewed.** `origin/hour-tracking/integration..hour-tracking/server` = **eight** commits,
`c71db49d9` → … → `733bcc04c` → **`53daba3e3`** (round 7's fix; HEAD == `hour-tracking/server` ==
`origin/hour-tracking/server`, tracked tree clean). Round 7's delta is **five files** — `00606` ±,
**`00615` NEW**, `supabase/seed/00-legacy-grants.sql` (+6), `time_rate_resolution_test.sql` ±,
`time_entry_studio_stamp_test.sql` ± — and I read every line of it, plus the whole of `00604`–`00607` and
`00615` as they now stand, `00598`'s policies/guards (the rate table's write contract), `00599`'s body
against `00615`'s graft, `guard_org_membership_changes`, `guard_invoiced_time_entry`,
`guard_time_entry_invoice_authority`, the live `project_unbilled_time` view, `use-studio-member-rates.ts`,
`rulings.md` (HT-3-e verbatim) and `plan-v2.md` §0/§3/§W5. Lane B is phase 2; its absence is not counted.

---

## Gates re-run by the reviewer

All on this program's isolated stack — Postgres `127.0.0.1:54422`, `project_id "patina-hours"`. The shared
54322 stack was never touched. Nothing reached Strata; no prod anything.

| Command | Result |
|---|---|
| `supabase db reset --workdir …/agent-server` | **clean** — `Finished supabase db reset on branch main.`; 559 migrations, `00615` applied after `00607`, every `DO $postcondition$` passed |
| `run-sql-tests.sh -d …/supabase/tests/billing -H 127.0.0.1 -p 54422` | **7 green / 7**, `unexpected-fail: 0` |
| `run-sql-tests.sh -d …/supabase/tests/commercial …` | **10 green / 16, 6 unexpected** — `authorized_schedule`, `design_services_authority`, `design_services_gap_hardening`, `executed_on_paper`, `trade_rfq`, `trade_scope`. All six **pre-existing and documented** (`supabase/tests/KNOWN_FAILURES.md:69, :97-101`); five abort inside `_countersign_design_services_agreement_impl` (`design services agreement … not found or access denied`). W2 touches no agreement path |
| `run-sql-tests.sh -d …/supabase/tests/rls …` (all 30) | **28 green / 30, 2 unexpected** — `design_requests_test.sql`, `studio_titles_test.sql`, both **pre-existing and documented** (`:114-115`). `time_entry_studio_stamp_test` (20 cases), `time_rate_resolution_test` (34), `time_entry_admin_write_test`, `time_entry_auto_roster_test`, `project_hours_total_test`, `studio_hours_rollup_test`, `studio_member_rates_test`, `project_roster_test`, `people_directory_scope_test`, `00563_proposal_signing_multi_studio`, `00584_studio_comember_rls_sweep` all green |
| `pnpm --filter @patina/supabase type-check` | **clean** (`tsc --noEmit`, no output) |
| `pnpm --filter @patina/designer-portal type-check` | **clean** |
| `pnpm --filter @patina/admin-portal build` | **succeeds** (exit 0, full route table) |

Run beyond the brief's list:

| Command | Result |
|---|---|
| `python3 scripts/generate-legacy-grants.py` → `git diff --exit-code supabase/seed/00-legacy-grants.sql` | **CLEAN** (baseline + **2624** replayed statements) |
| `SUPABASE_DB_URL=…54422 pnpm db:generate` → `git diff --exit-code database.types.ts` | **CLEAN** |
| `psql -f supabase/tests/edge_api/public_rpc_authorization_contract_test.sql` | **RED at `:171`** (`00511 must not auto-derive a studio for a non-designer lead`) — W1's, carried as **W2-R4-08**; the W2 re-registration at `:545-548` is never reached, so §0.17's discharge is asserted by no green gate. **Eighth round.** |
| migration-number sweep over every local + remote ref and all 13 worktrees | `00604`–`00607` **and `00615`** exist only on `hour-tracking/server` (+ its origin twin); `00614` only on `hour-tracking/edge`. **No collision** |
| commit hygiene | tracked tree clean; `supabase/config.toml` still `S` (skip-worktree) and in **none** of the eight commits; round 7's commit touches exactly the five intended files; Conventional Commits (`fix(time): W2-R7 — HT-3-e`) |
| object probe after the clean reset (`patina-db-migrations` step 7) | `e2_clause = t`, `owner_exempt = t` on `resolve_time_rate_cents`; `e1_arm = t`, `owned_sibling = t`, `tier_split = t` on `stamp_project_pricing_studio`; resolver `prosecdef = t`; `studio_hours_rollup` **INVOKER** (HT-38 ✓); `classify_project_time_entry_authority` references `studio_member_rates` **0** times and `resolve_time_rate_cents` **1** time — the fix's "the classifier needs no redefinition" claim is **true on the live body** |

---

## Findings

### W2-R8-01 · MAJOR · confidence HIGH · NEW (measured 1/1 through RLS as the actor; the brief's second trigger, literally)

**HT-3-e(2) keys on `studio_member_rates.created_by`, i.e. on WHO AUTHORED THE ROW. The open row's
`hourly_rate_cents` is editable by any owner/admin of the studio through
`studio_member_rates_admin_update`, and `guard_studio_member_rate_history` freezes `studio_id`, `user_id`,
`created_at`, `effective_from` and `effective_to` — but NOT the rate, and it only raises on `created_by`
when the actor *moves* it. So an `admin`-designer rewrites the OWNER's number in place, `created_by`
untouched, and the row she now controls is arm's-length by BOTH of HT-3-e's new tests.**

*Location:* `supabase/migrations/00598_studio_member_rates.sql:347` (`studio_member_rates_admin_update`:
`USING/WITH CHECK (public.is_org_admin_or_owner(studio_id))` — no subject exclusion) together with
`:267-273` (the immutable-identity list, which omits `hourly_rate_cents`) and `:290-293` (the `created_by`
re-stamp guard, which passes when `NEW.created_by = OLD.created_by`); the rule it defeats is
`supabase/migrations/00615_self_authored_rate_requires_ownership.sql:391-400`; the act that extends it to
the legacy book is `supabase/migrations/00606_time_entries_studio_read_narrow.sql:467-479`.

*Why MAJOR and not a note:* the brief's own wording — *"lets a SINGLE account with no ownership transfer
move its own resolved rate to a number it set"*. One account. Two statements. It also contradicts a
sentence W1's own suite asserts: `studio_member_rates_test.sql:216` *"FAIL c4: a member must not be able
to raise their own rate"* (asserted for a plain `member`; an `admin`-designer — the actor HT-3-d admits
expressly, case (s) — can). And HT-3-e(2)'s recorded purpose in `rulings.md:76` is *"resolves W2-R7-02 and
W2-R7-03"*: it resolves the INSERT form of that taking and not the UPDATE form.

*Measured, probe A — the case (s) / probe P8 shape exactly, with ONE account and no manoeuvre. She is an
`admin` of an honest employer that prices her 25000 (written by its OWNER) and a plain `member` of a
second employer, so HT-3-b's tier is ambiguous and her two legacy projects are honestly `'none'`:*

```
A0  baseline pricing studio of the legacy project          = NULL          ← honest 'none'
A1  SHE rewrites the OWNER's open rate row to 99900        → rows updated = 1
A2  the row now reads cents=99900 created_by=<the OWNER>   ← authorship UNMOVED, so "arm's length"
A3  HER OWN stamp of the honest employer (HT-3-e(1) arm)   → SUCCEEDED
A4  her 120-minute hour                = 99900 / studio_member / rated 199800   (owner wrote 25000)
A5  control — her own NEW row (created_by = herself)       → INSERT still SUCCEEDS (W1 capability)
A6  her stamp of the second legacy project                → SUCCEEDED
A7  an hour after THAT self-authored INSERT               = NULL / none   ← HT-3-e(2) working as ruled
A8  the employer's card for her now holds 2 rows:
      99900 @ …  closed 2026-09-11  created_by = the OWNER   ← her number, in his name
      77700 @ …  open               created_by = HER         ← ignored, per HT-3-e(2)
```

A5→A7 are the negative control: the door HT-3-e(2) **was** written for is genuinely shut, which is what
makes A1→A4 a finding about the rule's key rather than about its implementation.

*Reachability, stated precisely:* `authenticated` holds `UPDATE` on `public.studio_member_rates`
(`information_schema.role_table_grants`, verified), so this is a one-line PostgREST `PATCH` with her own
session — not a psql-only fact. The portal's own path is **not** the door: `useSetStudioMemberRate`
(`packages/supabase/src/hooks/use-studio-member-rates.ts:101-113`) upserts with `created_by: userId`, so a
number typed in the studio settings UI self-stamps her authorship and HT-3-e(2) ignores it. The door is
the API the same key opens.

*Also worth the orchestrator's eye:* A8 is a **visibility** regression relative to HT-3-e(3)'s answer
("Patina makes it visible rather than impossible"). The 99900 row carries the **owner's** id as author, so
the owner's own rate-card lens attributes her number to himself. `updated_at` moves, and nothing else does.

*Candidate closures (the orchestrator's call, not mine):*
1. **At the guard, one line, no new key:** in `guard_studio_member_rate_history`, when
   `NEW.hourly_rate_cents IS DISTINCT FROM OLD.hourly_rate_cents`, set `NEW.created_by := auth.uid()`
   (the `current_user = 'postgres'` early return keeps the ladder untouched). Authorship then records who
   set the number that is there, which is what HT-3-e(2) reads. The blur-save already sends exactly this.
2. **At the policy:** add `AND studio_member_rates.user_id <> auth.uid()` to
   `studio_member_rates_admin_update`'s `USING`/`WITH CHECK`, i.e. nobody edits their own rate row in a
   studio they do not own. Costs a sole-proprietor nothing (00615's owner exemption already names her) but
   does cost the blur-save on *her own* row in a studio she only administers.
3. **Ruling-only:** accept it as an HT-3-e(4) residual on the same footing as (3), on the ground that an
   admin of a studio is trusted with the whole card anyway. If that is the answer, the suite must say so —
   a case like (s)'s s8 but performing the UPDATE — because today nothing measures it in either direction.
   Both 1 and 2 are W1-file changes and need a ruling + a new migration number, which is why I am not
   choosing.

### W2-R8-02 · note — ruling owed (the heaviest) · confidence HIGH (measured 1/1; severity per the brief, which makes a ruled residue a note)

**HT-3-e(1)'s employer arm admits a complete OUTSIDER, and this is a measured capability REGRESSION against
rounds 3–6, where the same three statements were refused 42501. The ruling names it as residue (i) and
accepts it, so by the brief's severity discipline it is a note — but it is the largest single change this
round makes to what a stranger can do, and if Kody reads residue (i) differently it is a blocker.**

*Location:* `00606:467-479` (the arm's-length-rate leg) + `00598:332-344`
(`studio_member_rates_admin_insert` asks only `is_org_admin_or_owner(studio_id) AND created_by =
auth.uid()`) + the consent-free `organization_members` INSERT.

*Measured, probe F — the attacker owns one org and holds no relationship to the victim, her project or her
employers:*

```
F0  baseline pricing of the victim's legacy project         = NULL
F1  the ATTACKER seats the victim designer in HER OWN org, consent-free   → OK
F2  the ATTACKER writes the victim's rate card there, 88800, created_by = HERSELF
      → OK, and that row is "arm's-length" because the test asks about the SUBJECT's authorship
F3  the ATTACKER stamps the victim's legacy project with her own org      → SUCCEEDED
F4  the victim's next hour                      = 88800 / studio_member   (her employer wrote 25000)
F5  the HONEST employer's owner now reads 0 of the project's entry rows
F6  the ATTACKER reads 1
```

Three authenticated statements, no cooperation from the victim, and the stamp is **final** (bound (b)), so
the project, the money and the audit trail move permanently. Round 3's sibling leg refused exactly this;
HT-3-e(1) dropped it for the employer tier because it also refused every honest employer (24 of 24, which
I reproduced as C1). The ruling's stated closure is the **already-owed HT-3-b arm (c) consent door**. The
implementer reported this rather than hiding it, case (t) asserts it as passing, and `rulings.md` records
it — so the process is right; what is owed is the consent door, and until it lands the exposure is the
Strata `projects.studio_id IS NULL` population.

### W2-R8-03 · MINOR · confidence HIGH (NEW; an honest-studio cost of HT-3-e(2) that rulings.md does not record and no case covers)

**HT-3-e(2)'s owner exemption is a LIVE-seat test (`owner_seat.status = 'active' AND role = 'owner'`), so
an unchanged, honestly-authored rate row STOPS PRICING the moment its subject ceases to be the studio's
owner. A founder who takes a partner in silently falls to `'none'`.**

*Measured, probe D7 (the role change performed as `service_role`, because the authenticated path is
`transfer_studio_ownership`; the probe is about what the RESOLVER then answers, not about the path):*

```
D7-0 the sole proprietor's own 44000 row, while she is owner   → 44000 / studio_member
D7-1 a partner becomes owner; she is now `admin` of the studio she founded
D7-3 the SAME, UNCHANGED row                                   → NULL / none
D7-4 the next hour she logs                                    = NULL / none
```

`rulings.md` records two residues of part (2); this is a third, and it is the inverse of residue (ii) —
residue (ii) is *a member's new row closes the studio's*, this is *no row changes at all and the answer
still moves*. It is arguably the ruling's own logic working (her number in a studio she no longer owns is
exactly what part (2) ignores), which is why it is MINOR and not a contradiction — but it is a "your hours
went rate-pending and nothing changed" support ticket, case (ag) does not cover it (ag4 tests the owner
who is still the owner), and lane B's copy has no sentence for it. *Fix:* one case, one line in
`rulings.md`, and a lane-B "rate pending" reason string — or a ruling that the exemption should read
*whoever owned the studio when the row was written*, which the schema cannot answer today.

### W2-R8-04 · MINOR · confidence HIGH (number bookkeeping — a collision a later wave will walk into)

**`rulings.md:76` and `W2-fix-r7.md` both record "**`00615` is now W2's, and W5 mints from `00616`**".
`00616`–`00617` are **W6's** reserved range (`plan-v2.md:766,770-771`), and `00618`–`00620` are W7's; the
peer program mints from `00621` (`plan-v2.md:25`). There is no free number for W5 to mint from, so the
sentence as written points a later hand at W6's band.** Separately, `plan-v2.md` still says `00615` is
free in two places — line 25 (*"W5 none (`00615` reserved)"*) and line 708 (*"**None.** `00615` is
reserved by charter §3 and is **left unused** — say so in the ship note"*). The ruling only required the
reservation be recorded in the fix log and `rulings.md`, and it was, so this is bookkeeping rather than a
breach — but `plan-v2.md` is what W5/W6/W7 will read. *Fix:* amend those two plan lines to "spent by W2",
and correct the minting sentence to "W5 needs no number; if one is ever required it must be negotiated
above `00620`, not `00616`".

### W2-R8-05 · MINOR · confidence MEDIUM (what the new leg does and does not bound — so nobody mistakes it for a consent test)

**HT-3-e(1)'s arm's-length-rate leg is satisfiable by the stamping caller, in the same session, with one
INSERT — and it accepts a CLOSED/expired row as readily as a current one (`00606:470-478` asks only
`created_by IS NOT NULL AND created_by <> v_designer_id`, with no date predicate).** Measured: probe C's
employer wrote the row (C2) and then stamped (C5); probe F's attacker did both in three statements. So in
the employer tier the leg adds **no** bound against anyone who is already an owner/admin of a studio where
the designer holds an active non-guest seat — the real bounds there are (a) standing, (d) the designer's
seat and (e) the tier. That is the ruling's intended trade ("ORDER: the studio prices her first, then
repairs the project"), and for an honest employer it costs nothing; the finding is that three banner
paragraphs and the `COMMENT` read as though the leg were a bound on *who may stamp*, when measured it is a
bound on *the order of two statements*. *Fix:* one sentence, in `00606`'s banner and the `COMMENT`, saying
so plainly — and, if the orchestrator wants the leg to mean more, a date predicate (a row covering
`now()`) would at least make it a current-relationship test.

### W2-R8-06 · MINOR · confidence HIGH (W2-R7-04's class, in the new asserts — carried and widened)

**`00615`'s fourteen postconditions and `00606`'s new one are regex-on-`prosrc` spelling gates, and two of
them are OCCURRENCE COUNTS over `pg_get_functiondef` output, which includes the body's COMMENTS.**
`count(regexp_matches(v_src,'public\.organization_members','g')) = 3` and the `studio_member_rates = 1`
assert will fail the migration if a later hand so much as *mentions* either table name in a comment inside
the function, and will pass a real fourth read written as `organization_members` unqualified. The asserts
are still worth having (both the fix's negative controls fired on them), but their messages promise a
property they cannot hold — W2-R7-04's exact complaint, now in the replacement. *Fix:* say "spelling
heuristic" in the message, or count against a comment-stripped source.

---

## Carried from rounds 2–7 — each re-checked this round

| id | Severity · confidence | State |
|---|---|---|
| **W2-R4-08** (= W2-R2-10) | MINOR · HIGH | **Live, re-run** (red at `:171`). §0.17's re-registration is asserted by no green gate. W1's; ruling owed (W2-R2-19). **Eighth round of asking** |
| **W2-R6-06** | note — ruling owed · HIGH | **Live, re-measured exactly** (probe E2/E4): `project_hours_total` answers the rostered plain member **and** the studio owner identically, `240 / 240 / 115000`. The teammate knows her own `40000`, so `(115000 − 40000) / (240 − 60) × 60 = 25000` — the designer's confidential rate, by subtraction. HT-10-a prescribes the member's access, so nothing should change on a guess: rule whether `amount_cents` is owner/admin-only. Lane B inherits it |
| **W2-R6-03 · W2-R2-03/04** | note — ruling owed · HIGH | Live. Case (r) green; probe F is the same class with a stranger. Rule with HT-3-b arm (c) |
| **W2-R2-13 / W2-R5-05** | note — ruling owed · HIGH | **Live, re-measured** (E8/E8b/E8c): an invoiced row's `duration_minutes` → `P0001 … only notes … may change`; `DELETE` → `P0001 … cannot be deleted`; the row survives at 60 min; **`notes` rewritten by the studio owner → NO RAISE** |
| **W2-R2-09** | MINOR · HIGH | Live — one ordinary owner adjust wrote **exactly one** audit row (`time_entry.updated`, actor = the owner, `organization_id` = the pricing studio, `old_values` **and** `new_values` present, `updated_by` stamped, duration 120 → 150); the trigger still has no `WHEN`, so a plain member's self-edit writes one too |
| **W2-R2-05 · W2-R2-06 · W2-R2-07 · W2-R2-11 · W2-R2-12 · W2-R2-15 · W2-R2-17 · W2-R2-18 · W2-R5-04 · W2-R4-11/12** | MINOR/NOTE | Live, unchanged — round 7 touched none of those files |
| **W2-R7-04** | MINOR · HIGH | Carried, and widened — **W2-R8-06** |
| `W2-impl.md` findings 2–5 | acknowledged | unchanged |

### The brief's read/refusal probes, re-measured (probe E, every call through RLS as the named actor)

| probe | result |
|---|---|
| a plain rostered member reading a teammate's row / notes / rate columns | **refused** — she reads **1 of 3** entry rows (her own), **0** of the designer's 2 (so `notes` and `hourly_rate_cents` are unreachable), **0** of the designer's `studio_member_rates`, **1** `time_entry_ledger` row. Her own `hourly_rate_cents` rewrite → `23514 commercial time authority, rate, amount, billing state, and rate provenance are server-derived`; her own rate-card INSERT → `42501`; an UPDATE of her own open rate row → **0 rows** under RLS, value unchanged at 40000 |
| `project_hours_total` per role | rostered member **240/240/115000** · studio owner **240/240/115000** · outsider **42501 `the caller is not on this project`** (W2-R6-06 above) |
| the rollup never returns notes | **confirmed on the TYPE and on the rows.** `studio_hours_rollup(uuid,date,date,text,uuid,uuid) → TABLE(bucket_key, bucket_label, member_id, member_name, entry_count, total_minutes, billable_minutes, billable_cents, internal_minutes)`; `project_hours_total(uuid) → TABLE(minutes, billable_minutes, amount_cents)`; `time_entry_ledger` has **0** columns named `notes`. Buckets per role: owner **2**, rostered member **1** (her own), outsider **0 rows, no raise** |
| the audit trigger on an admin/owner adjust | **exactly one** row, 0 → 1, as tabulated above |
| owner/admin writes cannot touch invoiced rows | **confirmed** (E8–E8d) |
| r7's P1/P3/P7/P8 shapes under HT-3-e | P1/P7 → **repaired** (probe C); P8's INSERT form → **`'none'`** (A5–A7, D3); **P8's UPDATE form → 99900 (W2-R8-01)**; P3's ownership-transfer form is HT-3-e(3), ruled |

### Pre-existing failures, listed separately as the brief asks

**Eight**, none of them W2's, identical to the r1–r7 baseline, all in `supabase/tests/KNOWN_FAILURES.md`:
six in `commercial` (`:69`, `:97-101`) and two in `rls` (`:114-115`). One still touches this program's
mechanism: `studio_titles_test.sql` `FAIL f` — *"demoting the sole active owner should raise
`last_owner_protected`"* — is the `guard_org_membership_changes` arm that stands in the way of the
ownership moves HT-3-e(3) accepts. Any future closure leaning on ownership hygiene must know that guard is
already not firing on this stack.

---

## What I did not verify

- **Lane B, entirely** — phase 2 by scope, not a finding.
- `pnpm --filter @patina/designer-portal test` / `lint`, and the `DATA_MODE=live` e2e line — outside the
  brief's gate list and lane-B-shaped (and per `patina-verification` no lint result outside
  designer-portal would have meant anything).
- **W2-R8-01 by installation.** I did not install a guarded `guard_studio_member_rate_history` to watch A4
  fall back to 25000 — the finding is a positive measurement of the shipped bodies, so the counterfactual
  would only confirm the proposed fix, not the finding.
- **The portal for W2-R8-01.** I read `use-studio-member-rates.ts` and the grants; I did not drive a
  PostgREST `PATCH` over HTTP or the studio settings UI. The grant (`authenticated … UPDATE`) and the RLS
  policy are the evidence that the HTTP path exists.
- **Concurrency and volume.** No two-simultaneous-stamp race; no measurement of W2-R2-06's per-row DEFINER
  policy call.
- **No prod anything.** Every command ran against `127.0.0.1:54422`; nothing was pushed to Strata; W1's
  constraint stands (W1 must not reach Strata ahead of `00606`/`00615`). **The Strata population of
  `projects.studio_id IS NULL`** — split by whether the designer's employer tier is ambiguous, and whether
  she is an `admin` anywhere — is **still uncounted**. It sizes W2-R8-01, W2-R8-02 and HT-3-e(3), and it is
  one read-only query. **Eighth round of asking.**
- I staged and committed nothing; `supabase/config.toml` remains skip-worktree'd and untouched. Every probe
  script lives in the session scratchpad and ends in `ROLLBACK`; no probe fixture survives on the stack
  (the suites were re-run after them and are green).
