# W1 — adversarial review, round 6

**clean = false** — 1 blocker, 1 major, 4 minors, 6 notes. **All three round-5 blockers are independently discharged for the shapes they name** (re-measured this session, not taken from the fix report); the round-5 *key* that closes W1-R5-01/-02 is itself manufacturable for the fifth consecutive round, with one extra signup and one caller-writable ORDER BY term.

Reviewer context: separate from the implementer. Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-server`, branch `hour-tracking/server` @ `d687c80d4`, DB = the program's own isolated stack `patina-hours` (API 54421 / Postgres 54422). `supabase/config.toml` untouched, still skip-worktree'd (`git ls-files -v` → `S`) and in **no** commit of the range. Every finding was measured against a clean `npx supabase db reset --workdir <worktree>`, with every write performed **through RLS as the actor named** (`SET LOCAL ROLE authenticated` + a `request.jwt.claims` sub), and with negative controls wherever a fix or a regression is claimed. The four migrations were read line by line; `00601`'s body was re-diffed mechanically against `00578:2599-2825` independently of rounds 4 and 5.

Diff under review — `git log --oneline origin/hour-tracking/integration..hour-tracking/server`:

```
d687c80d4 fix(time): W1 review round 5 — the studio she does not run prices the hour, and a designer cannot pick her own card
0427f2c1e fix(time): W1 review round 4 — an arm's-length rate prices the hour, not a proxy the member can buy
fc65be3c2 fix(time): W1 review round 3 — the studio that employs her prices the hour, legacy snapshots survive an edit
945e04796 fix(time): W1 review round 2 — name the studio that prices the hour, shut the pay-rate door
f0cf9a177 fix(time): W1 review round 1 — close the resolver's open door, stop re-pricing a signed hour
906b94ab6 test(time): pin rate resolution, studio-rate authorization, and the rate-free insert
d048bad36 feat(time): studio-rate hooks, and rate provenance on the entry type
b39ba9ec2 feat(time): W1 rate truth — the server owns the rate on every project kind
```

14 files, +5102 / −8.

---

## The three round-5 blockers, re-probed from scratch

| finding | probe (this session) | result | verdict |
|---|---|---|---|
| **W1-R5-01** `created_by` forge on the open row | `probe_r6c_discharge.sql` — she seats a collaborator, self-sets 99900, then `UPDATE … SET created_by = <collaborator>` through RLS as her | `created_by forge refused = t`, recorded author still **her own id** (`23514`) | **DISCHARGED** |
| **W1-R5-02** second account seated `admin` of **her own** workspace writes her 99900 | `time_rate_resolution_test.sql` case (u), re-run green on a clean reset; the shape's negative control re-derived as `probe_r6a_ctrl_adminseat.sql` → `15000 / 30000` | the employing studio's 15000 prices the hour | **DISCHARGED for that shape** (defeated by a sibling shape — §W1-R6-01) |
| **W1-R5-03** designer picks her own client-billed card | `probe_r6c_discharge.sql` — services project, cards `Lead designer` 10000 / `Vendor` 40000, she self-seats as `vendor` through RLS and names it | `rate=10000 src=authority rate_role=lead_designer amount=20000` | **DISCHARGED** |
| full case list (a)–(w), 23 cases | `supabase/tests/billing/time_rate_resolution_test.sql` | all print `passed`, `All time_rate_resolution assertions passed.` | green |

---

## Findings

### W1-R6-01 · BLOCKER · confidence HIGH · the round-5 employment key is manufacturable with one extra signup, because `membership.joined_at` — the tiebreak that decides it — is written by the puppet studio's own owner

`supabase/migrations/00599_resolve_time_rate_cents.sql:338-343` (the new FIRST key) with `:362-363` (`membership.joined_at NULLS LAST, membership.created_at`).

Round 5's claim is structural and is quoted in the migration banner at `00599:327-337`: *"the keys she CANNOT manufacture are about her own standing INSIDE the candidate … she can neither stop being her workspace's owner nor demote herself there."* That is true of **her own** auto-provisioned workspace. It is false of **someone else's**: `Org owners can insert members` is `is_org_admin_or_owner(organization_id) AND (role <> 'owner')`, so a *second account she controls* — whose own personal `design_studio` 00295's `fc_provision_studio_on_designer` provisions at its designer signup — can seat **her** there as a plain `member`, and then, as that workspace's owner, write her `studio_member_rates` row at any number. She is now a plain member of a studio that holds a rate for her: **key 1 is TRUE for a studio she effectively controls.**

With the studio that really employs her also holding an arm's-length 15000 for her, key 1 ties, the arm's-length key ties, the bare-rate key ties, the multi-member count ties (the puppet workspace has 2 active non-guest members), `(membership.role = 'owner') DESC` ties at false — and the decision falls to **`membership.joined_at`**, a column the puppet's owner supplies on the seating INSERT (nullable, no default, no guard: `guard_org_membership_changes` freezes only `organization_id`/`user_id` on UPDATE and polices the `owner` role).

Measured end to end, every write through RLS as the actor named, on a realistic timeline (the employing studio created 2 years ago, her seat there 1 year ago) — `probe_r6a_real.sql`:

```
puppet workspace active non-guest members = 2   (she was seated through RLS as the puppet)
M role in the puppet workspace = member
puppet rate row created_by = c66…003            (M is c66…002 — genuinely arm's-length, nothing forged)
RESULT rate=99900 src=studio_member amount=199800 billing_state=authorized   ×3 runs, 3/3
```

`$1,998.00` on a 120-minute entry, `billing_state='authorized'`, `rate_source='studio_member'` — the identical figure rounds 3, 4 **and** 5 each reported as closed — flowing into `project_unbilled_time`, the studio balance, the invoice composer and `claim_time_entries`' invoice lock. Two **negative controls** isolate it, both on the same fixture: seat her as `admin` instead of `member` (`probe_r6a_ctrl_adminseat.sql`) → `15000 / 30000`; omit the puppet's rate row (`probe_r6a_ctrl_norate.sql`) → `15000 / 30000`. Without the backdated `joined_at` the same fixture is a **uuid coin flip** (`probe_r6a_ctrl_nobackdate.sql`: 99900 in 5 of 6 runs), which is W1-R2-02's defect returning through the same door.

Cost of the attack: one extra signup — exactly the cost round 5 accepted as blocker-grade for W1-R5-02. No test can catch it today: case (u)'s second account is seated in **her own** workspace (so key 1 stays false there), and case (r)'s second seat never writes a rate.

**Exact fix, verified in-session.** Delete the two caller-writable tiebreaks from the ladder so the last resort is a fact the member cannot write — `organizations` has **no INSERT policy for `authenticated`** (only SELECT/UPDATE), so `organizations.created_at` is server-set:

```sql
             (membership.role = 'owner') DESC,
-            membership.joined_at NULLS LAST,
-            membership.created_at,
             studio.created_at,
             studio.id
```

Installed body-only on the live stack (`proposed_fix_r6.sql`) and measured:

| probe | shipped | with the fix |
|---|---|---|
| `probe_r6a_real.sql` (puppet seat, employing studio priced her) | `99900 / studio_member / 199800` ×3 | **`15000 / studio_member / 30000` ×3** |
| `time_rate_resolution_test.sql` (a)–(w), 23 cases | all pass | **all pass**, 0 unexpected-fail |

Pin it with a postcondition that the ladder's text carries **no** `membership.joined_at` / `membership.created_at` term, and add a case shaped like `probe_r6a_real.sql` (the `member` seat in a *second account's* workspace is what makes it a different case from (u)).

**And raise it to the orchestrator as a ruling, not a sixth key.** Five rounds have now each closed one manufacturable key and shipped the next one; `studio.created_at` is merely the first term in the chain she has no write path to, not a principle. The unanswered question is *which studio prices an hour on a project whose `studio_id` is NULL* — see W1-R6-02. `rulings.md` carries **no** row for it.

---

### W1-R6-02 · MAJOR · confidence HIGH (mechanism) / MEDIUM (scope — dischargeable by a ruling) · when no studio that employs her has priced her, a rate she controls still prices the client's hour, at any number, deterministically

`supabase/migrations/00599_resolve_time_rate_cents.sql:350-354` (the bare rate-existence key) — the key the banner at `00599:310-316` says *"carries the solo designer"*.

No ordering of these keys can fix this one. If the studio that employs her has never written a `studio_member_rates` row for her, key 1 is false for every candidate and the ladder falls to "a rate exists here at all" — which her own personal workspace always satisfies, because `studio_member_rates_admin_insert` asks only for `is_org_admin_or_owner(studio_id)` and she is the owner of the workspace 00295 provisions for her. With the one extra signup of W1-R6-01 it is deterministic rather than a tie:

```
probe_r6b_unpriced.sql  (employing studio never priced her; puppet workspace holds 99900 for her as a plain member)
RESULT rate=99900 src=studio_member amount=199800 billing_state=authorized   ×3 runs, 3/3
```

This is not a regression — it is the behaviour **W1-R4-02 demanded**: round 4 called `'none'` on that shape a defect and round 5 recorded `18000 / studio_member / 36000` as its discharge (case (s)). But the round-4 premise — *"the employing studio wins and has never priced her → 'none', $0"* — treats `'none'` as a money bug when HT-26 rules it a **display state**: *"an unresolved rate prints 'rate pending' instead of a blank."* A `rate_source='none'` row is the system saying, correctly, that nobody with authority has priced this person; the $0 that then reaches the composer and `claim_time_entries` is a **lane-B / W2 composer** problem (exclude or flag `rate_source='none'` rows), not a reason to accept a number the subject wrote.

HT-1 ruled *"the server owns `hourly_rate_cents`"*; HT-3 ruled the rate is *"owner/admin only"*. A rate the subject set about herself in a workspace she owns satisfies the letter of both (the server read it; an owner wrote it) and defeats the intent of both. Neither ruling, and no row in `rulings.md`, says which studio may price an hour on a `studio_id`-NULL project — 5 of 6 seeded projects, and the live shape, because `activate_proposal_as_project` never sets the column.

**Exact fix — two candidates, both one edit, and the choice is the orchestrator's:**

(a) **Record the owed ruling** (e.g. `HT-3-a`: *"on a project with no `studio_id`, a studio in which the subject is an owner or admin may price her own hours when no other studio has"*), leave the code as shipped, and pin it in `time_rate_resolution_test.sql` case (s) with a failure message that names the ruling — the pattern HT-6-a/HT-6-b already use. Clean is then reachable without a code change.

(b) **Require the winning studio to be one she does not run**, i.e. make the employment leg a `WHERE`, not an `ORDER BY` key:

```sql
      AND membership.role NOT IN ('owner', 'admin')   -- candidates she does not run
```
with an explicit fall-through to `'none'` when no such candidate exists. This re-breaks case (s) and case (p)/(w) as written, so those asserts move with the ruling — which is precisely why it is governance, not a fix-round reorder.

Do not leave it implicit for a seventh round: the same `$1,998.00` has now been reported closed three times and re-opened four.

---

### W1-R6-03 · MINOR · confidence HIGH · W1-R5-04 / W1-R4-04 unchanged for a third round — the open row's dates are still caller-writable, and one UPDATE leaves a member with no rate at all

`supabase/migrations/00598_studio_member_rates.sql:233-285`. `guard_studio_member_rate_history` freezes `studio_id`, `user_id`, `created_at` and (round 5) checks the `created_by` actor; `effective_from` and `effective_to` are not mentioned. Re-measured, both writes as the studio **owner** through RLS (`probe_r6d_dates.sql`):

```
W1-R5-04 hand-close via UPDATE succeeded = t ; open rows = 0 ; rate covering today = NULL
```

Zero open rows means every future hour for that member resolves `'none'` and invoices at $0, and the same surface can leave two rows covering one day — the non-overlap invariant case (g6) asserts. Reach is any owner **or admin** of the studio, against a colleague.

**Exact fix** (two lines, in the same raise the round-5 actor check joins, which leaves the blur-save untouched — PostgREST's upsert assigns only payload columns, `effective_from` equals the conflict key and `effective_to` is never sent):

```sql
     OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
     OR NEW.effective_to   IS DISTINCT FROM OLD.effective_to
```

---

### W1-R6-04 · MINOR · confidence HIGH · W1-R5-05 / W1-R4-05 unchanged for a fourth round — `resolve_time_rate_cents` is GRANTed to `authenticated` with no caller anywhere in the repo

`supabase/migrations/00599_resolve_time_rate_cents.sql:560-561`. Re-verified this session: the only reference outside `supabase/migrations` and `supabase/tests` is a doc comment (`packages/supabase/src/hooks/use-time-tracking.ts:91`) plus the generated `database.types.ts` entry and the ACL seed's own GRANT/REVOKE lines. ASSERT 1, ASSERT 2's depth gate and ASSERT 3 exist only because that door is open, and W1-R1-01 / W1-R2-03 were both about it.

**Exact fix (either, by ruling):** revoke from `authenticated` and re-home cases l1/l2/m3/m4 onto the trigger path, widening the `anon` postcondition to `authenticated`; **or** state the GRANT in plan-v2 §2's signature block as deliberate. Four rounds is long enough for an implicit answer.

---

### W1-R6-05 · MINOR · confidence HIGH · the studio ladder now leaks into ASSERT 2: once a member has any second studio that wins the ladder, a legitimate owner/admin of the studio that employs her is refused her rate at the RPC boundary

`supabase/migrations/00599_resolve_time_rate_cents.sql:401-409` reads `v_studio_id` — the ladder's winner — and not "any studio the caller administers that employs the subject". In the W1-R6-01 fixture the ladder resolves to the puppet workspace, so `is_org_admin_or_owner(v_studio_id)` is false for the real employing studio's owner and her depth-0 call raises `'only a studio owner or admin may resolve another member''s rate'`. Impact today is nil (W1-R6-04: no repo caller), which is the only reason this is not a major; it will not be nil the moment lane B calls the RPC.

**Exact fix:** make ASSERT 2's owner/admin leg independent of the ladder —
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

### W1-R6-06 · MINOR · confidence HIGH · delta 4 can stamp a `rate_role` that did **not** price the hour — the exact lie its own rationale says it prevents

`supabase/migrations/00601_classifier_rate_resolver.sql:198-207` with `00599:503-521` (the single-card fallback). Delta 4's comment says the row must record *"the role that priced it"*. When a two-hat member picks `vendor`, the authority has **no** Vendor card, and it carries exactly one current card (`Principal`), the resolver's single-card fallback returns `(that card's cents, 'authority', v_role='vendor')` — so the row stores `rate_role='vendor'` while the **Principal** card priced it, and `rate_source='authority'` makes it read as a signed, role-matched rate. Not measured end to end (code-read across both files); the shape exists in the suite's fixtures (`P4`, one `Principal` card) but no case pairs it with a pick.

**Exact fix:** return the role that actually matched — on the single-card fallback path, return the card's `role_name` normalized back to a `rate_role` value, or `NULL` — and add a case pairing a pick with a one-card authority.

---

### W1-R6-07 · NOTE · confidence HIGH · W1-R5-06 unchanged for a third round — `00598`'s trigger-ordering postcondition is two string literals

`supabase/migrations/00598_studio_member_rates.sql:422-424`: `IF 'aaa_guard_studio_member_rate_insert_trg' >= 'close_prior_studio_member_rate_trg'` is constant-folded and can only fail if someone edits the literals. The real protection is the `pg_trigger` existence assert above it. Compare the two `tgname`s selected from `pg_trigger` if it is meant to be enforced.

---

### W1-R6-08 · NOTE · confidence HIGH · W1-R5-07 unchanged — plan-v2 §2's gate block still carries an invocation that cannot be green

Measured both ways on the same clean stack:

- the brief's / plan's form, `scripts/run-sql-tests.sh -d <abs worktree>/supabase/tests/commercial -H 127.0.0.1 -p 54422` → **10 green, 6 unexpected-fail** (`authorized_schedule`, `design_services_authority`, `design_services_gap_hardening`, `executed_on_paper`, `trade_rfq`, `trade_scope`), because the script prints and matches cwd-relative names and no `KNOWN_FAILURES.md` entry matches `.codex/worktrees/agent-server/supabase/tests/…`.
- `./scripts/run-sql-tests.sh -d supabase/tests/commercial -k supabase/tests/KNOWN_FAILURES.md -H 127.0.0.1 -p 54422` from inside the worktree → **10 green + 6 expected-fail = 16/16, 0 unexpected.**

Fix plan-v2 §2's gate block (and every later wave's brief) rather than re-deriving this each round. All six failures are the documented pre-existing `_countersign_design_services_agreement_impl` aborts; I did not re-derive that claim this round.

---

### W1-R6-09 · NOTE · confidence MEDIUM · W1-R5-08 unchanged — `effective_from DEFAULT CURRENT_DATE` is the one date in the chain not explicitly UTC

`00598:98`, against `00599:535-537`'s `(p_at AT TIME ZONE 'UTC')::date` and `useSetStudioMemberRate`'s `new Date().toISOString().slice(0,10)`. Either pin the default (`DEFAULT (now() AT TIME ZONE 'UTC')::date`) or record that no writer relies on it.

---

### W1-R6-10 · NOTE · confidence HIGH · W1-R5-09 unchanged — `00598`'s idempotency backfills the column, not the constraints

`CREATE TABLE IF NOT EXISTS` + `ADD COLUMN IF NOT EXISTS updated_at` (`:93-110`) means a stack carrying an earlier shape would gain `updated_at` and not the inline `UNIQUE (studio_id, user_id, effective_from)` or the `effective_to >= effective_from` CHECK. No such stack exists; recorded so "idempotent" is not read as "converges any prior shape".

---

### W1-R6-11 · NOTE · confidence MEDIUM (not measured) · HT-41 hands the project's designer a lever over a **teammate's** card

`Lead designers manage team members` is an `ALL` policy on `projects.designer_id = auth.uid()` with no `with_check`, and `Designers manage their project time entries` is an `ALL` policy with **no `user_id` leg** (both re-read from `pg_policies` this session). So the project designer may seat a teammate in the best-paying roster role **and** insert the teammate's entry with that `rate_role`. Under 00578 she could already re-seat him and let the `count(DISTINCT role) = 1` collapse pick it up, so the delta W1 adds is only the two-hat case (where 00578 would have collapsed to NULL) — small, but it is the same family as W1-R5-03 and nothing pins it. Recorded, not charged; I did not build the fixture.

---

### W1-R6-12 · NOTE · confidence HIGH · hypotheses tested and refuted this round — recorded so round 7 does not re-spend them

1. **A second `member` row for herself in her own workspace** (which would make key 1 true with no second account at all). Refused: `organization_members` carries `UNIQUE (user_id, organization_id)` — measured in `pg_constraint`.
2. **Creating a puppet `organizations` row directly.** Refused: `organizations` has only SELECT and UPDATE policies — no INSERT policy for `authenticated` — so a puppet studio must be the one `fc_provision_studio_on_designer` auto-provisions at a designer signup. That is what W1-R6-01's probe uses.
3. **Demoting or resigning her own owner seat.** Refused, as round 5 said: `Org admins can update members` and `Members can leave` both carry `role <> 'owner'`.
4. **The `00601` graft.** `00578:2599-2830` vs `00601:116-462`, diffed mechanically and independently of rounds 4 and 5: the only changes are the three new DECLAREs, deltas 1/2/4/5, the W1-R1-02 bound-row preservation, the three server-owned branches and `NEW.rate_source := 'authority'`. The immutability raise, the bound-provenance raise, the `FOR UPDATE` project lock, the 00575 nullable-ceiling delta, retainer gating and the ceiling sum are byte-identical. Grep winner confirmed: `00412 → 00575 → 00578 → 00601`; `guard_commercial_time_entry_derived_fields` winner is `00412 → 00600`.
5. **Program rules, grep- and catalog-verified across the wave's four migrations and eight commits.** No flag (0 `useFeatureFlag` / `posthog` / `ComingSoon` additions in the diff). No backfill (no top-level `UPDATE public.project_time_entries`; `00602`/`00603` absent from disk, deliberately unused). No rollup, so no `notes` in one (the only `notes` token in the four files is inside a comment at `00600:117`). `project_time_entries` changed only by `ADD COLUMN IF NOT EXISTS` + two named CHECKs — additive. The guard's list extended in **both** the `IS DISTINCT FROM` chain (`00600:150-151`) and `aab_`'s `BEFORE UPDATE OF` list (`00600:175-176`), with `rate_role` also in `aac_`'s (`00600:191-192`). No policy keyed on `projects.studio_id`. The invoiced lock is untouched and still installed. The running-slot index is verbatim: `CREATE UNIQUE INDEX uniq_project_time_entries_running_timer ON public.project_time_entries USING btree (user_id) WHERE (duration_minutes IS NULL)`. One BEFORE INSERT trigger on the guard function, not two (n9 honoured); `pg_trigger` order on INSERT is `aaa0_time_entry_auto_roster_trg` → `aaa_guard_time_entry_invoice_insert_trg` → `aac_classify_…`, with `guard_invoiced_time_entry` after both.
6. **§0.16 / 00484 contract on both new DEFINER functions.** `resolve_time_rate_cents`: `prosecdef = t`, `SET search_path = public, pg_temp`, three caller asserts, `REVOKE … FROM PUBLIC, anon`, explicit `GRANT … TO authenticated`; `extensions.gen_random_uuid()` schema-qualified in `00598`, `pg_catalog.pg_trigger_depth()` qualified in `00599` (the 00282 42883 trap).
7. **§0.17's 00484 quartet, measured in `pg_policies`.** All four present with the exact names; `Team can view their project time entries` still `is_project_team_member(project_id)` alone, the other three still carrying the `user_id = auth.uid()` leg. None dropped, renamed or re-qualified. `studio_member_rates` carries exactly 3 policies, no DELETE policy, and `has_table_privilege('authenticated', 'public.studio_member_rates', 'DELETE')` is `false`.
8. **Migration numbers, across every ref** (`git ls-tree` per branch): `00598`–`00601` exist on `hour-tracking/server` alone; the peer people-room branch holds `00592`–`00594`; lane D holds `00614` on `hour-tracking/edge`; `00602`/`00603` exist on no ref. W1's range matches §0's amendment.
9. **`supabase/tests/billing/time_unbilled_view_repair_test.sql`'s edit is a strengthening, not a weakening** — it adds a live-path server-rated sibling row (`b3`, 45 min × 12000 = 9000) plus asserts `live0`, `live1`, `b5`, and moves `a2` from 2 to 3 rows. Its `ALTER TABLE … DISABLE TRIGGER` for the two pre-W1 snapshot rows is transactional and inside the file's own `ROLLBACK`.

---

### W1-R4-03 — deferred, phase 2

Lane B's portal surfaces and the PostHog emitters remain absent (re-confirmed: `account-studio-page.tsx` 0 hits, `studio-rate-rows.tsx` missing, `hours-ledger.tsx` 0 hits, `authority-hours.ts` 0 hits, `document-events.ts` 0 hits in the diff). Per the orchestrator's scope ruling this is **phase-2 work and does not count against clean.** Consequence recorded, not charged: Done-when #3's live-mode render half and Done-when #5's printed role stay unverifiable at this commit.

---

## Gates re-run (this reviewer, clean stack)

| command | result |
|---|---|
| `npx supabase db reset --workdir /Users/kody/Code/patina-merged/.codex/worktrees/agent-server` | **clean** — `00595`…`00601` + `20260910152111` applied, 22 seeds loaded, every postcondition replayed |
| `scripts/run-sql-tests.sh -d <worktree>/supabase/tests/billing -H 127.0.0.1 -p 54422` | **6 / 6 green**, 0 unexpected-fail |
| `scripts/run-sql-tests.sh -d <worktree>/supabase/tests/commercial -H 127.0.0.1 -p 54422` | **10 green, 6 unexpected-fail** — the brief's/plan's invocation (W1-R6-08) |
| `./scripts/run-sql-tests.sh -d supabase/tests/commercial -k supabase/tests/KNOWN_FAILURES.md -H 127.0.0.1 -p 54422` (from the worktree) | **10 green + 6 expected-fail = 16 / 16**, 0 unexpected |
| `scripts/run-sql-tests.sh -d <worktree>/supabase/tests/rls -f time_entry -H 127.0.0.1 -p 54422` | **1 / 1 green** |
| `scripts/run-sql-tests.sh -d <worktree>/supabase/tests/billing -f rate -H 127.0.0.1 -p 54422` | **1 / 1 green** — cases (a)–(w), 23, all `passed` |
| `scripts/run-sql-tests.sh -d <worktree>/supabase/tests/rls -f studio_member_rates -H 127.0.0.1 -p 54422` | **1 / 1 green** (incl. (j4)/(j5)) |
| `python3 <worktree>/scripts/generate-legacy-grants.py` → `git status --porcelain -- supabase/seed/00-legacy-grants.sql` | **empty** — baseline + 2610 replayed statements, byte-identical to the committed seed. §0.20's grep re-run: `00595, 00597, 00598, 00599, 00600, 00601` all carry GRANT/REVOKE and all appear in the seed |
| `SUPABASE_DB_URL=…:54422 pnpm --dir <worktree> db:generate` → `git diff --exit-code packages/supabase/src/database.types.ts` | **clean** |
| `pnpm --dir <worktree> --filter @patina/supabase type-check` | **clean** (exit 0) |
| `pnpm --dir <worktree> --filter @patina/designer-portal type-check` | **clean** (exit 0) |
| `pnpm --dir <worktree> --filter @patina/admin-portal build` | **green** (exit 0) — the one portal whose build enforces types |
| `git status --porcelain` (worktree) | **empty**; `git ls-files -v supabase/config.toml` → `S`; `git log --name-only -- supabase/config.toml` over the range → empty |
| `git show --stat` ×8 commits | only W1 paths; conventional-commit subjects (`feat(time)` / `test(time)` / `fix(time)`); no `database.types.ts` hand-edit (regenerated clean) |

## Done-when, SQL-probed as the named roles

| Done-when | probe | result |
|---|---|---|
| #1 commercial unchanged; billing + rls green | above | ✅ (commercial via the `-k` invocation; W1-R6-08) |
| #2 `INSERT … (hourly_rate_cents) VALUES (99999)` on a non-services project stores the resolver's value | case (a), re-run green | ✅ |
| #3 a rate typed by the owner appears on the next entry with `rate_source='studio_member'` | `probe_r6a_ctrl_norate.sql` — owner writes 15000 through `studio_member_rates_admin_insert`, member logs → `15000 / studio_member / 30000` | ✅ in SQL; ❌ the live-mode render half (W1-R4-03, deferred) |
| #4 a new hire's services entry carries non-NULL rate + amount and `pending_authorization` | case (c) + the (c4) non-promotability assert (HT-6-b, owed) | ✅ |
| #5 a two-role member's row records the role she picked | cases (e)/(f); `probe_r6c_discharge.sql` shows the designer's pick is now correctly **overridden** | ✅ as a stored `rate_role`; ❌ nothing prints it (deferred); see W1-R6-06 for the one shape where the stored role is not the one that priced |
| **contra** — the server, not the member, owns the rate (HT-1 / HT-3) | `probe_r6a_real.sql`, `probe_r6b_unpriced.sql` | ❌ **still through** (W1-R6-01 blocker, W1-R6-02 major/ruling) |

## Not verified

- **Anything on Strata.** No `db push`, no prod probe, nothing written.
- **Lane B's surfaces.** They do not exist (deferred, phase 2), so no live-mode render check, no `timeRateProvenance` behaviour, no PostHog emission was or could be exercised.
- **`designer-portal lint`, the full `designer-portal test` and `@patina/supabase test` suites.** Outside the brief's gate list; round 5 reported them green and this round's diff touches no TypeScript.
- **`client-portal`, `manufacturer-portal`, the three services.** Outside this wave's diff; `admin-portal build` is the shared-package gate and it is green.
- **The six red `commercial` files' contents.** Confirmed pre-existing and documented in `supabase/tests/KNOWN_FAILURES.md`; I did not re-derive that each aborts inside `_countersign_design_services_agreement_impl`.
- **Concurrency.** No two-session race of the close ladder under simultaneous blur-saves on the same `(studio_id, user_id)`; `uniq_studio_member_rates_open` is the backstop and was not raced.
- **W1-R6-06's end-to-end shape** (a pick paired with a one-card authority) and **W1-R6-11** (the designer choosing a teammate's card) — both code-read, neither fixture built.
- **The W1-R6-01 fix under a candidate studio created in the same transaction as the puppet** — `studio.created_at` then ties and the last resort is `studio.id`, a coin flip; measured (99900 in 2 of 3 runs) and the reason the fix is offered as necessary-not-sufficient, with the ruling in W1-R6-02 as the real answer.

## Probe scripts (re-derivable)

`/tmp/claude-501/r6/` — `probe_r6a.sql` + `probe_r6a_real.sql` (W1-R6-01, the second with a realistic studio timeline), `probe_r6a_ctrl_adminseat.sql` / `probe_r6a_ctrl_norate.sql` / `probe_r6a_ctrl_nobackdate.sql` (its three controls), `probe_r6b_unpriced.sql` (W1-R6-02), `probe_r6c_discharge.sql` (the round-5 blockers re-probed), `probe_r6d_dates.sql` (W1-R6-03 re-measured), `shipped_resolver_def.sql` (the shipped body, restored after every experiment — verified restored), `proposed_fix_r6.sql` (the verified W1-R6-01 fix).
