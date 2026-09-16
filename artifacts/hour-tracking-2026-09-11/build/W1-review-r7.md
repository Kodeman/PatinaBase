# W1 — adversarial review, round 7

**clean = false** — 1 blocker, 0 majors, 5 minors, 7 notes. The round-6 blocker (W1-R6-01) is discharged **for the two terms it names** — `membership.joined_at` and `membership.created_at` are gone from the ladder and a postcondition refuses their return, re-measured from scratch. But the **replacement last resort is caller-writable too**: `organizations.created_at` is not server-set, and one `UPDATE` through RLS restores the identical `$1,998.00`. That is the sixth consecutive round in which the key at the bottom of the ladder is a column the subject can write.

Reviewer context: separate from the implementer. Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-server`, branch `hour-tracking/server` @ `090f4fd03`, DB = the program's own isolated stack `patina-hours` (API 54421 / Postgres 54422). `supabase/config.toml` untouched, still skip-worktree'd (`git ls-files -v` → `S`) and in **no** commit of the range. Every finding below was measured against a clean `npx supabase db reset --workdir <worktree>` run by this reviewer, with every write performed **through RLS as the actor named** (`SET LOCAL ROLE authenticated` + a `request.jwt.claims` sub), and with a negative control wherever an exploit is claimed. The four migrations were read line by line; `00601`'s body was re-diffed mechanically against `00578` independently of rounds 4–6.

Diff under review — `git log --oneline origin/hour-tracking/integration..hour-tracking/server`:

```
090f4fd03 fix(time): W1 review round 6 — no pricing tiebreak the seating caller can write
d687c80d4 fix(time): W1 review round 5 — the studio she does not run prices the hour, and a designer cannot pick her own card
0427f2c1e fix(time): W1 review round 4 — an arm's-length rate prices the hour, not a proxy the member can buy
fc65be3c2 fix(time): W1 review round 3 — the studio that employs her prices the hour, legacy snapshots survive an edit
945e04796 fix(time): W1 review round 2 — name the studio that prices the hour, shut the pay-rate door
f0cf9a177 fix(time): W1 review round 1 — close the resolver's open door, stop re-pricing a signed hour
906b94ab6 test(time): pin rate resolution, studio-rate authorization, and the rate-free insert
d048bad36 feat(time): studio-rate hooks, and rate provenance on the entry type
b39ba9ec2 feat(time): W1 rate truth — the server owns the rate on every project kind
```

14 files, +5388 / −8.

---

## The round-6 findings, re-probed from scratch

| finding | probe (this session) | result | verdict |
|---|---|---|---|
| **W1-R6-01** backdated `membership.joined_at` decides the pricing studio | `pg_get_functiondef` on the live body after a clean reset → `~ 'membership\.joined_at'` = **f**, `~ 'membership\.created_at'` = **f**; the ladder now reads `… (membership.role = 'owner') DESC, studio.created_at, studio.id`; the two new postconditions at `00599:761-770` replay; case (x) passes | the two named terms are gone | **DISCHARGED for the two terms named — DEFEATED by the replacement term (§W1-R7-01)** |
| **W1-R6-02** a rate she controls prices the client's hour when no employer has priced her | `rulings.md:72` carries a new **HT-3-a** row, parent HT-3/HT-1, status *OWED — not ruled. Shipped as (a)*; case (s)'s `s2` failure message names it; `00599:262-277` + `:410-414` name it in-body | option (a) taken and recorded, as the round-6 finding allowed | **RECORDED** — carried forward as §W1-R7-02, with one premise in the recorded text now measured false |
| W1-R6-03 open-row dates caller-writable | `00598:233-285` re-read: the freeze names `studio_id`, `user_id`, `created_at`, `created_by`; `effective_from` / `effective_to` still absent | unchanged | **OPEN** (4th round) — §W1-R7-03 |
| W1-R6-04 `resolve_time_rate_cents` GRANTed with no caller | `grep` over `packages apps services supabase/functions`: two hits, a doc comment (`use-time-tracking.ts:91`) and the generated `database.types.ts:35142` | unchanged | **OPEN** (5th round) — §W1-R7-04 |
| W1-R6-05 ASSERT 2 reads the ladder's winner | `00599:476-484` re-read: still `is_org_admin_or_owner(v_studio_id)` | unchanged | **OPEN** (2nd round) — §W1-R7-05 |
| W1-R6-06 delta 4 stamps a role that did not price the hour | **measured end to end this round** (the round-6 finding was code-read only) — `rate=30000 src=authority rate_role=vendor` on a one-card `Principal` authority; control with no pick → `rate_role=NULL` | unchanged, now confirmed | **OPEN** (2nd round) — §W1-R7-06 |
| W1-R6-07 … W1-R6-11 (notes) | all re-read | unchanged | carried as §W1-R7-07 … §W1-R7-11 |
| full case list (a)–(x), 24 cases | `supabase/tests/billing/time_rate_resolution_test.sql` | all print `passed`, `All time_rate_resolution assertions passed.` | green |

---

## Findings

### W1-R7-01 · BLOCKER · confidence HIGH (measured 3/3, negative control 3/3) · the round-6 fix's "server-set" last resort is caller-writable: an org owner can backdate `organizations.created_at` through RLS, and the same $1,998.00 comes back

**Where.** `supabase/migrations/00599_resolve_time_rate_cents.sql:439` (the new last resort `studio.created_at`), its in-body justification at `:403-408`, the banner claim at `:252-256`, and the postcondition rationale at `:753-760`. The refuted premise, quoted verbatim from `:403-406`:

> *"So the last resort is now a fact she has no write path to at all: `organizations` carries NO INSERT policy for `authenticated` (SELECT and UPDATE only), so organizations.created_at is server-set at the signup that provisioned the studio"*

The parenthetical names the door and then walks past it. **`organizations` has an UPDATE policy for `authenticated`, and it is unrestricted by column.** Measured in `pg_policies` this session:

```
Org admins can update organization | UPDATE
  qual: EXISTS (SELECT 1 FROM organization_members
                WHERE organization_id = organizations.id AND user_id = auth.uid()
                  AND role = ANY (ARRAY['owner','admin']) AND status = 'active')
  with_check: (null)
```

The only column guard on that table is `guard_organization_admin_columns` (`00556:118-144`), whose frozen list is `status`, `type`, `subscription_tier`, `subscription_expires_at`, `business_verified`, `business_verified_at` — **`created_at` is not in it**, and 00556's own comment says as much ("Profile-field edits … are unaffected"). So the owner of the puppet workspace writes its `created_at` to any instant.

**Measured, end to end, every write through RLS as the actor named** (`probe_r7a_created_at.sql` — case (x)'s fixture exactly, plus **one** statement). `joined_at` is deliberately **left at `NOW()`**, not backdated, so nothing here depends on the terms round 6 deleted:

```
x0e precondition (employing studio older than puppet) = t
puppet created_at: before=2026-09-12 03:37:02+00  after=2021-09-12 03:37:02+00  backdate succeeded=t
puppet now older than employing studio = t
RESULT rate=99900 src=studio_member amount=199800 billing_state=authorized      ×3 runs, 3/3
```

The one statement, issued as the puppet account through RLS:

```sql
UPDATE public.organizations SET created_at = NOW() - INTERVAL '5 years' WHERE id = v_puppet;
```

**Negative control** (`probe_r7a_ctrl_nobackdate.sql` — the identical fixture with that single line commented out): `RESULT rate=15000 src=studio_member amount=30000` ×3, 3/3. The exploit is isolated to the one `UPDATE`.

`$1,998.00` on a 120-minute entry, `billing_state='authorized'`, `rate_source='studio_member'` — the same figure rounds 3, 4, 5 **and 6** each reported closed — flowing into `project_unbilled_time`, the studio balance, the invoice composer and `claim_time_entries`' invoice lock. Cost of the attack: the same one extra signup round 6 accepted as blocker-grade, plus one `UPDATE`. No test catches it: case (x)'s `x0e` precondition *asserts* the employing studio is older and then never lets anything move it, which is exactly the state this UPDATE changes.

Three further places carry the same refuted premise and must move with the fix:
- `00599:252-256` (banner) — *"a puppet minted today cannot predate the studio that employs her."* False: it can, one UPDATE later.
- `00599:753-760` (the postcondition's own rationale) — *"organizations has no INSERT policy for authenticated, which is why studio.created_at is the last resort above the uuid."* The postcondition itself only bans `membership.joined_at` / `membership.created_at`; nothing pins the replacement.
- `artifacts/hour-tracking-2026-09-11/rulings.md:72` (the **HT-3-a** row) — *"the caller-writable tiebreaks are separately closed by W1-R6-01 (… `organizations.created_at` is server-set because `organizations` has no INSERT policy for `authenticated`)."* A governance record is now carrying a measured-false fact.

**Exact fix, verified in-session.** Freeze `created_at` in the one guard that already exists for this table — a new migration at **`00602`** (W1's reserved-and-unused number; §2 leaves it deliberately free), redefining `guard_organization_admin_columns` grafted verbatim from `00556:118-144` with one added term and a banner lineage `00556 → 00602`:

```sql
      OR NEW.business_verified_at IS DISTINCT FROM OLD.business_verified_at
+     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'organization_admin_column_protected';
```

Measured with that body installed on the live stack (`proposed_fix_r7.sql`), the shipped 00599 untouched:

| probe | shipped | with the fix |
|---|---|---|
| `probe_r7a_created_at.sql` | `99900 / studio_member / 199800` ×3 | **`ERROR: organization_admin_column_protected`** ×3 — the backdate itself is refused |
| `scripts/run-sql-tests.sh -d …/supabase/tests/billing` | 6/6 green | **6/6 green** |
| `scripts/run-sql-tests.sh -d …/supabase/tests/rls` (all 26) | 24 green, 2 **pre-existing documented** fails | **24 green, the same 2** — no new failure |

Then: pin it with a `00602` postcondition asserting `pg_get_functiondef('public.guard_organization_admin_columns()')` carries a `created_at` term; add a `00599` postcondition asserting the same (so a future graft of *either* file cannot silently unpin the ladder's last resort); add a case **(y)** to `time_rate_resolution_test.sql` shaped like `probe_r7a_created_at.sql` — case (x) plus the backdate UPDATE, asserting the UPDATE raises **and** the hour still prices at 15000; and correct the three false-premise texts above plus the HT-3-a row. `00602` contains no GRANT/REVOKE, so §0.20 owes no seed regeneration; it changes no signature, so `database.types.ts` stays clean (both confirmed by inspection of the proposed body).

**Residual the fix does not close, and the reason this belongs in HT-3-a rather than a seventh key.** With `created_at` frozen, the puppet's timestamp is stamped by `fc_provision_studio_on_designer` at its own designer signup — so the attack survives whenever the **puppet account is older than the employing studio**, which needs no backdating at all, only a personal Patina account predating the studio's onboarding. (Verified there is no other write path: `organizations` has no INSERT policy for `authenticated`, and **no** `authenticated`-executable SECURITY DEFINER function in `public` inserts into `organizations` — catalog query over `pg_proc.prosrc`, 0 rows.) The ladder's bottom is a chain of tiebreaks standing in for a rule that has never been ruled. Six rounds is enough: **HT-3-a should be ruled before W2's composer is trusted with these rows**, and the code fix above is the floor, not the answer.

---

### W1-R7-02 · MINOR · confidence HIGH (mechanism re-read; the money path measured in round 6) · carried: HT-3-a is recorded as OWED, so the shipped behaviour is a known, deliberate money path — and one sentence of the record is now false

`00599:427-431` (the bare rate-existence key) · `rulings.md:72`.

Not re-charged as a major: round 6 explicitly offered option (a) as sufficient for clean, the implementer took it, and the record is real — a new `HT-3-a` row with the mechanism, both candidate answers, the asserts that move under (b), and `OWED — not ruled` as its status, plus case (s)'s `s2` message and two in-body pointers. That is the HT-6-a/HT-6-b pattern, correctly applied.

Two things to carry forward rather than re-argue:
1. The row's closing sentence asserts the caller-writable tiebreaks *are* closed because `organizations.created_at` is server-set. §W1-R7-01 measures that false. Amend the row with the fix.
2. Under (a) as shipped, `rate_source='none'` never reaches a real designer's hour on a `studio_id`-NULL project once she owns any workspace, so the `'none'` display state HT-26 rules on is largely unreachable on the live shape — which means **lane B/W2 cannot be the safety net option (a) leans on**, because there is nothing for it to catch. Worth stating when the ruling is taken.

**Exact fix:** none in code under (a). Amend `rulings.md:72`'s final sentence when §W1-R7-01 lands, and put HT-3-a in front of Kody before W2 trusts a mixed-author claim.

---

### W1-R7-03 · MINOR · confidence HIGH (re-measured in round 6, code re-read this round) · fourth round unchanged — the open row's dates are caller-writable, and one UPDATE leaves a member with no rate at all

`supabase/migrations/00598_studio_member_rates.sql:242-285`. `guard_studio_member_rate_history` freezes `studio_id`, `user_id`, `created_at` and polices the `created_by` actor; `effective_from` and `effective_to` are named nowhere. A studio **owner or admin** can therefore hand-close a colleague's open row (`UPDATE … SET effective_to = CURRENT_DATE - 1`), leaving **zero** open rows — every later hour resolves `'none'` and invoices at $0 — or leave two rows covering one day, which the file's own non-overlap invariant (case g6) exists to forbid. Reach is the authorized rate-setter, which is why it stays minor, but the invariant is the point of an append-only table.

**Exact fix** (two lines, inside the raise the round-5 actor check already joins; the blur-save is untouched because PostgREST's upsert assigns only payload columns, `effective_from` is the conflict key and `effective_to` is never sent):

```sql
     OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
     OR NEW.effective_to   IS DISTINCT FROM OLD.effective_to
```

---

### W1-R7-04 · MINOR · confidence HIGH · fifth round unchanged — `resolve_time_rate_cents` is GRANTed to `authenticated` with no caller anywhere in the repo

`00599:633-636`. Re-verified by grep over `packages apps services supabase/functions`: the only hits outside `supabase/migrations` and `supabase/tests` are a doc comment (`packages/supabase/src/hooks/use-time-tracking.ts:91`) and the generated `database.types.ts:35142`, plus the ACL seed's own GRANT/REVOKE lines. ASSERT 1, ASSERT 2's depth gate and ASSERT 3 exist **only** because that door is open, and they are the subject of W1-R1-01, W1-R2-03 and §W1-R7-05. Five rounds is long enough for an implicit answer.

**Exact fix (either, by ruling):** `REVOKE EXECUTE … FROM authenticated` and re-home cases l1/l2/m3/m4 onto the trigger path (widening the `anon` postcondition at `:660-662` to `authenticated`); **or** state the GRANT in plan-v2 §2's signature block as deliberate, naming the lane-B caller that will use it.

---

### W1-R7-05 · MINOR · confidence HIGH · second round unchanged — ASSERT 2 asks about the ladder's winner, so a legitimate owner/admin of the studio that employs the subject can be refused her rate at the RPC boundary

`00599:476-484` reads `v_studio_id` — whatever the ladder picked — not "any studio the caller administers that employs the subject". In §W1-R7-01's fixture the ladder resolves to the puppet, so `is_org_admin_or_owner(v_studio_id)` is false for the real employing studio's owner and her depth-0 call raises `'only a studio owner or admin may resolve another member''s rate'`. Impact today is nil only because of §W1-R7-04; it stops being nil the moment lane B calls the RPC.

**Exact fix:** make the owner/admin leg independent of the ladder —

```sql
     AND NOT EXISTS (
       SELECT 1 FROM public.organization_members AS caller_seat
       JOIN public.organization_members AS subject_seat
         ON subject_seat.organization_id = caller_seat.organization_id
       WHERE caller_seat.user_id = auth.uid()
         AND caller_seat.role IN ('owner','admin') AND caller_seat.status = 'active'
         AND subject_seat.user_id = p_user_id AND subject_seat.status = 'active'
     )
```

— or state that the assert is deliberately scoped to the pricing studio only.

---

### W1-R7-06 · MINOR · confidence HIGH (**measured this round**; round 6 had it code-read only) · delta 4 stamps a `rate_role` that did not price the hour — the exact lie its own rationale says it prevents

`supabase/migrations/00601_classifier_rate_resolver.sql:198-207` with `00599:578-596` (the single-card fallback). Delta 4's comment says the row must record *"the role that priced it"*; the single-card fallback returns the **caller's pick** as its `role` while a differently-named card supplies the cents.

Measured (`probe_r7b_rolelie.sql`, built on the suite's own P4 fixture — one current card, `Principal` 30000, plus the two-hat member seated on P4 with `lead_designer` + `vendor`, writing through RLS as herself):

```
precondition: P4 authority card count = 1
RESULT   rate=30000 src=authority rate_role=vendor amount=30000 state=authorized
the card that priced it is named Principal at 30000
CONTROL (no pick)  rate=30000 src=authority rate_role=<NULL>
```

So the row reads "a signed Vendor rate priced this hour" while the **Principal** card did, and `rate_source='authority'` makes it print as client-agreed. No money moves (on a one-card authority every role resolves to the same cents), which is why it stays minor — but the control proves the dishonesty is introduced *by the pick*, and Done-when #5 ("the row prints the role they picked") is satisfied in a way delta 4's own rationale forbids.

**Exact fix:** on the single-card fallback path return the card's `role_name` normalized back to a `rate_role` value, or `NULL` — not `v_role` — and add a case pairing a pick with a one-card authority (the fixture above is ready-made).

---

### W1-R7-07 · NOTE · confidence HIGH · third round unchanged — `00598`'s trigger-ordering postcondition is two string literals

`00598:422-424`: `IF 'aaa_guard_studio_member_rate_insert_trg' >= 'close_prior_studio_member_rate_trg'` is constant-folded at parse time and can only fail if someone edits the literals. The real protection is the `pg_trigger` existence assert above it. Compare the two `tgname`s **selected from `pg_trigger`** if it is meant to be enforced.

### W1-R7-08 · NOTE · confidence HIGH · third round unchanged — plan-v2 §2's gate block still carries an invocation that cannot be green; re-measured identically this round

- the brief's / plan's form, `scripts/run-sql-tests.sh -d <abs worktree>/supabase/tests/commercial -H 127.0.0.1 -p 54422` → **10 green, 6 unexpected-fail** (`authorized_schedule`, `design_services_authority`, `design_services_gap_hardening`, `executed_on_paper`, `trade_rfq`, `trade_scope`), because the script prints and matches cwd-relative names and no `KNOWN_FAILURES.md` line matches `.codex/worktrees/agent-server/supabase/tests/…`.
- `./scripts/run-sql-tests.sh -d supabase/tests/commercial -k supabase/tests/KNOWN_FAILURES.md -H 127.0.0.1 -p 54422` from inside the worktree → **10 green + 6 expected-fail = 16/16, 0 unexpected.**

All six are the documented pre-existing `_countersign_design_services_agreement_impl` aborts (`supabase/tests/KNOWN_FAILURES.md`). Fix the plan's gate block rather than re-deriving this every round.

### W1-R7-09 · NOTE · confidence MEDIUM · third round unchanged — `effective_from DEFAULT CURRENT_DATE` is the one date in the chain not explicitly UTC

`00598:98`, against `00599:610-612`'s `(p_at AT TIME ZONE 'UTC')::date` and `useSetStudioMemberRate`'s `new Date().toISOString().slice(0,10)` (`use-studio-member-rates.ts:52`). No shipped writer relies on the default — the hook always sends `effective_from` — so either pin it (`DEFAULT (now() AT TIME ZONE 'UTC')::date`) or record that.

### W1-R7-10 · NOTE · confidence HIGH · third round unchanged — `00598`'s idempotency backfills the column, not the constraints

`CREATE TABLE IF NOT EXISTS` + `ADD COLUMN IF NOT EXISTS updated_at` (`:93-110`): a stack carrying an earlier shape would gain `updated_at` and **not** the inline `UNIQUE (studio_id, user_id, effective_from)` or the `effective_to >= effective_from` CHECK. No such stack exists; recorded so "idempotent" is not read as "converges any prior shape".

### W1-R7-11 · NOTE · confidence MEDIUM (not measured) · the bound path sets `rate_source := 'authority'` unconditionally, so a pre-00600 bound row's NULL provenance is relabelled on any edit while its legacy cents snapshot is preserved

`00601:239` (`NEW.rate_source := 'authority';`, outside the `IF NOT v_is_bound` block) against delta 5's own purpose at `:211-227` (*"the provenance stays with the snapshot it describes"*). For a bound row written before 00600, `OLD.rate_source IS NULL`, delta 5 sets `v_rate_source := NULL` — and then `:239` overwrites it with `'authority'` while `hourly_rate_cents` keeps `OLD`'s legacy number. The label is defensible (the row genuinely carries `authority_rate_id`) and no money moves, but the row stops being identifiable as a legacy snapshot, which is the distinction `rate_source IS NULL` was introduced to carry (`00600`'s column comment). Neither case (i) nor case (o) covers a **bound** legacy row. Not measured; no fixture built.

### W1-R7-12 · NOTE · confidence MEDIUM (not measured) · a door that neither §W1-R7-01's fix nor HT-3-a option (b) closes — `Members can leave`

`Members can leave` is a **DELETE** policy on `organization_members`, `(user_id = auth.uid() AND role <> 'owner')` (measured in `pg_policies`). Deleting her own plain seat at the employing studio removes that studio from `00599`'s candidate JOIN entirely, leaving only the puppet — while she keeps access to the project because she is its **designer**, not because of the studio seat. HT-3-a option (b) (`AND membership.role NOT IN ('owner','admin')` as a WHERE) does not help either: in the puppet she *is* a plain member. Worth naming in the HT-3-a ruling: any answer built on "which studio employs her" has a one-statement resignation underneath it. Not measured; recorded.

### W1-R7-13 · NOTE · confidence HIGH · hypotheses tested and refuted this round — recorded so round 8 does not re-spend them

1. **Another write path to `organizations`.** No INSERT policy for `authenticated` (measured: 3 policies, 2 SELECT + 1 UPDATE); and **no** `authenticated`-executable SECURITY DEFINER function in `public` whose body inserts into `organizations` (catalog query over `pg_proc.prosrc` + `has_function_privilege`, **0 rows**). So after the `created_at` freeze the timestamp really is server-set, and the residual is only an older puppet account (§W1-R7-01).
2. **`organizations.type` / `status` as a candidacy lever** (disqualify the employing studio by flipping its type). Refused: both are in `guard_organization_admin_columns`'s frozen list.
3. **The `00601` graft.** Re-extracted both function bodies and diffed them mechanically, comment lines stripped, independently of rounds 4–6: the only changes are the three new DECLAREs, deltas 1/2/4/5, the W1-R1-02 bound-row preservation, the three server-owned branches (`00578`'s non-services, no-authority and no-rate leaves) and `NEW.rate_source := 'authority'`. The immutability raise, the `FOR UPDATE` project lock, the role-derivation ladder, retainer gating and the ceiling sum are otherwise byte-identical. Grep winners confirmed: `classify_project_time_entry_authority` → `00578 → 00601`; `guard_commercial_time_entry_derived_fields` → `00412 → 00600`.
4. **Program rules, grep- and catalog-verified across the wave's four migrations and nine commits.** No flag (0 `useFeatureFlag` / `posthog` / `ComingSoon` / `feature_flag` additions in the whole diff). No backfill (0 top-level `UPDATE … project_time_entries` in the four files; `00602`/`00603` absent from disk). No rollup in W1, so no `notes` in one. `project_time_entries` changed only by `ADD COLUMN IF NOT EXISTS rate_source, rate_role` + two guarded named CHECKs — additive. The guard's list extended in **both** places (`00600:150-151` in the `IS DISTINCT FROM` chain, `00600:175-176` in `aab_`'s `BEFORE UPDATE OF` list) with `rate_role` also in `aac_`'s (`00600:191-192`). No policy keyed on `projects.studio_id`. `guard_invoiced_time_entry` installed, `prosecdef = f`, and `00177` is **not** in the diff at all (`git diff --name-only` → empty). The running-slot index verbatim: `CREATE UNIQUE INDEX uniq_project_time_entries_running_timer ON public.project_time_entries USING btree (user_id) WHERE (duration_minutes IS NULL)`. One BEFORE INSERT trigger on the guard function, not two (n9 honoured).
5. **§0.16 / 00484 contract, measured in `pg_proc`.** `resolve_time_rate_cents`: `prosecdef = t`, `proconfig = {search_path=public, pg_temp}`, `anon_exec = f`, `authed_exec = t`, three caller asserts present, explicit `REVOKE … FROM PUBLIC, anon` + `GRANT … TO authenticated`. `close_prior_studio_member_rate` DEFINER with `anon_exec = f` and `authed_exec = f`. The three guards INVOKER with pinned `search_path` and revoked from everyone. `extensions.gen_random_uuid()` and `pg_catalog.pg_trigger_depth()` schema-qualified (the 00282 42883 trap).
6. **§0.17's 00484 quartet, measured in `pg_policies`.** All four present with the exact names; `Team can view their project time entries` still `is_project_team_member(project_id)` alone; the other three still carry the `user_id = auth.uid()` leg. None dropped, renamed or re-qualified. `studio_member_rates` carries exactly 3 policies, no DELETE policy, and `has_table_privilege('authenticated','public.studio_member_rates','DELETE')` = `false`.
7. **The two `supabase/tests/rls` failures I surfaced by running the whole directory** (`design_requests_test.sql`, `studio_titles_test.sql`) are **pre-existing and documented** at `supabase/tests/KNOWN_FAILURES.md:114-115`; each contains **zero** references to `project_time_entries` / `studio_member_rates` / `rate_source` / `rate_role` / the resolver / the classifier, and both fail identically with and without §W1-R7-01's candidate fix. Not charged against W1. (The brief's gate list runs `rls -f time_entry` only, so these had not been surfaced before.)

---

### W1-R4-03 — deferred, phase 2

Lane B's portal surfaces and the PostHog emitters remain absent (re-confirmed in the diff: `account-studio-page.tsx`, `studio-rate-rows.tsx`, `hours-ledger.tsx`, `authority-hours.ts`, `document-events.ts` — 0 hits / missing). Per the orchestrator's scope ruling this is **phase-2 work and does not count against clean.** Consequence recorded, not charged: Done-when #3's live-mode render half and Done-when #5's printed role stay unverifiable at this commit.

---

## Gates re-run (this reviewer, clean stack)

| command | result |
|---|---|
| `npx supabase db reset --workdir /Users/kody/Code/patina-merged/.codex/worktrees/agent-server` | **clean** — `00595`…`00601` + `20260910152111` applied, 22 seeds loaded, every postcondition replayed |
| `scripts/run-sql-tests.sh -d <worktree>/supabase/tests/billing -H 127.0.0.1 -p 54422` | **6 / 6 green**, 0 unexpected-fail |
| `scripts/run-sql-tests.sh -d <worktree>/supabase/tests/commercial -H 127.0.0.1 -p 54422` | **10 green, 6 unexpected-fail** — the brief's/plan's invocation (§W1-R7-08) |
| `./scripts/run-sql-tests.sh -d supabase/tests/commercial -k supabase/tests/KNOWN_FAILURES.md -H 127.0.0.1 -p 54422` (from the worktree) | **10 green + 6 expected-fail = 16 / 16**, 0 unexpected — all six documented pre-existing |
| `scripts/run-sql-tests.sh -d <worktree>/supabase/tests/rls -f time_entry -H 127.0.0.1 -p 54422` | **1 / 1 green** |
| `scripts/run-sql-tests.sh -d <worktree>/supabase/tests/billing -f rate -H 127.0.0.1 -p 54422` | **1 / 1 green** — cases (a)–(x), 24, all `passed` |
| `scripts/run-sql-tests.sh -d <worktree>/supabase/tests/rls -f studio_member_rates -H 127.0.0.1 -p 54422` | **1 / 1 green** |
| `scripts/run-sql-tests.sh -d <worktree>/supabase/tests/rls -H 127.0.0.1 -p 54422` (whole dir, beyond the brief) | **24 green, 2 unexpected-fail** — both pre-existing and documented (§W1-R7-13.7) |
| `python3 <worktree>/scripts/generate-legacy-grants.py` → `git status --porcelain -- supabase/seed/00-legacy-grants.sql` | **empty** — baseline + 2610 replayed statements, byte-identical to the committed seed. §0.20's grep re-run: `00595, 00597, 00598, 00599, 00600, 00601` all carry GRANT/REVOKE and all appear in the seed |
| `SUPABASE_DB_URL=…:54422 pnpm --dir <worktree> db:generate` → `git diff --exit-code packages/supabase/src/database.types.ts` | **clean** (exit 0) |
| `pnpm --dir <worktree> --filter @patina/supabase type-check` | **clean** (exit 0) |
| `pnpm --dir <worktree> --filter @patina/designer-portal type-check` | **clean** (exit 0) |
| `pnpm --dir <worktree> --filter @patina/admin-portal build` | **green** (exit 0) — the one portal whose build enforces types |
| `git status --porcelain` (worktree) | **empty**; `git ls-files -v supabase/config.toml` → `S`; `git log --name-only … -- supabase/config.toml` over the range → empty |
| `git show --stat` ×9 commits | only W1 paths; conventional-commit subjects (`feat(time)` / `test(time)` / `fix(time)` ×6); `database.types.ts` regenerated, never hand-edited |

## Done-when, SQL-probed as the named roles

| Done-when | probe | result |
|---|---|---|
| #1 commercial unchanged; billing + rls green | above | ✅ (commercial via the `-k` invocation; §W1-R7-08) |
| #2 `INSERT … (hourly_rate_cents) VALUES (99999)` on a non-services project stores the resolver's value | case (a), re-run green on a clean reset | ✅ |
| #3 a rate typed by the owner appears on the next entry with `rate_source='studio_member'` | `probe_r7a_ctrl_nobackdate.sql` — the employing studio's owner writes 15000 through `studio_member_rates_admin_insert`, the member logs → `15000 / studio_member / 30000` ×3 | ✅ in SQL; ❌ the live-mode render half (W1-R4-03, deferred) |
| #4 a new hire's services entry carries non-NULL rate + amount and `pending_authorization` | case (c) + the (c4) non-promotability assert (HT-6-b, owed) | ✅ |
| #5 a two-role member's row records the role she picked | cases (e)/(f) green | ✅ as a stored `rate_role`; ❌ nothing prints it (deferred); and §W1-R7-06 measures one shape where the stored role is **not** the one that priced |
| **contra** — the server, not the member, owns the rate (HT-1 / HT-3) | `probe_r7a_created_at.sql` + its negative control | ❌ **still through** (§W1-R7-01 blocker) |

## Not verified

- **Anything on Strata.** No `db push`, no prod probe, nothing written outside the isolated `patina-hours` stack.
- **Lane B's surfaces.** They do not exist (deferred, phase 2), so no live-mode render check, no `timeRateProvenance` behaviour, no PostHog emission was or could be exercised.
- **`designer-portal lint`, `designer-portal test`, `@patina/supabase test`.** Outside the brief's gate list; this round's diff (`090f4fd03`) is SQL only, and round 5 reported them green.
- **`client-portal`, `manufacturer-portal`, the three services.** Outside this wave's diff; `admin-portal build` is the shared-package gate and it is green.
- **The six red `commercial` files' root cause.** Confirmed listed in `supabase/tests/KNOWN_FAILURES.md`; I did not re-derive that each aborts inside `_countersign_design_services_agreement_impl`.
- **§W1-R7-11** (a pre-00600 **bound** legacy row relabelled `'authority'`) and **§W1-R7-12** (`Members can leave` as a ladder lever) — both code/catalog-read, neither fixture built.
- **Concurrency.** No two-session race of the close ladder under simultaneous blur-saves on the same `(studio_id, user_id)`; `uniq_studio_member_rates_open` is the backstop and was not raced.
- **§W1-R7-01's residual** (a puppet account whose signup predates the employing studio) — reasoned from the frozen-`created_at` semantics and the absence of any other write path, not staged as a fixture.

## Probe scripts (re-derivable)

`/private/tmp/claude-501/-Users-kody-Code-patina-merged/e257acb8-387e-4b1d-8426-8827597413f6/scratchpad/r7/` — `probe_r7a_created_at.sql` (§W1-R7-01, the one-UPDATE exploit on case (x)'s fixture), `probe_r7a_ctrl_nobackdate.sql` (its negative control), `probe_r7b_rolelie.sql` (§W1-R7-06, measured with its own no-pick control), `proposed_fix_r7.sql` (the verified `created_at` freeze), `fn_00578.sql` / `fn_00601.sql` / `a.sql` / `b.sql` (the independent graft diff). The live `guard_organization_admin_columns` body was restored to 00556's after the experiment and verified unpatched; `resolve_time_rate_cents` was never modified on the stack.
