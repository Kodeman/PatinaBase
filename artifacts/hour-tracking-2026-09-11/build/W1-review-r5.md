# W1 — adversarial review, round 5

**clean = false** — 3 blockers (all money/authorization, all measured end to end through RLS), 2 minors carried forward, 5 notes. W1-R4-01 and W1-R4-02 are **discharged for the shapes they name**; W1-R4-01's *repair* is defeated by two new vectors.

Reviewer context: separate from the implementer. Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-server`, branch `hour-tracking/server` @ `0427f2c1e`, DB = the program's own isolated stack `patina-hours` (API 54421 / Postgres 54422). `supabase/config.toml` untouched and still skip-worktree'd (`git ls-files -v` → `S`, absent from every commit). Every finding was **measured against a clean `npx supabase db reset --workdir <worktree>`**, with every write performed **through RLS as the actor named** (`SET LOCAL ROLE authenticated` + a JWT claim), and with a negative control wherever a regression or a fix is claimed.

Diff under review — `git log --oneline origin/hour-tracking/integration..hour-tracking/server`:

```
0427f2c1e fix(time): W1 review round 4 — an arm's-length rate prices the hour, not a proxy the member can buy
fc65be3c2 fix(time): W1 review round 3 — the studio that employs her prices the hour, legacy snapshots survive an edit
945e04796 fix(time): W1 review round 2 — name the studio that prices the hour, shut the pay-rate door
f0cf9a177 fix(time): W1 review round 1 — close the resolver's open door, stop re-pricing a signed hour
906b94ab6 test(time): pin rate resolution, studio-rate authorization, and the rate-free insert
d048bad36 feat(time): studio-rate hooks, and rate provenance on the entry type
b39ba9ec2 feat(time): W1 rate truth — the server owns the rate on every project kind
```

14 files, +4428 / −8. Migrations `00598`–`00601` read line by line; `00601`'s body re-diffed mechanically against `00578:2599-2825` this session (independently of round 4's claim).

---

## The two round-4 findings, re-probed

| finding | probe re-derived this session | shipped result | verdict |
|---|---|---|---|
| **W1-R4-01** (r4b shape: collaborator seat + self-set 99900 + arm's-length 15000) | `scratchpad/probe_r5a_ctrl_noforge.sql` | `rate=15000 src=studio_member amount=30000` | **DISCHARGED for that shape** (was `99900 / 199800`) |
| **W1-R4-02** (r4a shape: priced 18000 in her own one-person studio, plain member of a multi-member studio that never priced her) | `scratchpad/probe_r5_r4a.sql` | `rate=18000 source=studio_member amount=36000` | **DISCHARGED** (was `NULL / none / NULL`) |
| full case list (a)–(s), 19 cases | `supabase/tests/billing/time_rate_resolution_test.sql` | all 19 print `passed`, `All time_rate_resolution assertions passed.` | green |

The *shapes* are closed. The *key* that closes them is not safe: §W1-R5-01 and §W1-R5-02 below each restore the identical `$1,998.00` figure.

---

## Findings

### W1-R5-01 · BLOCKER · confidence HIGH · the arm's-length key is caller-writable — `created_by` is not frozen on the open row, so the member forges it and prices her own hour again

`supabase/migrations/00599_resolve_time_rate_cents.sql:279-284` (the arm's-length key) with `supabase/migrations/00598_studio_member_rates.sql:216-255` (`guard_studio_member_rate_history`) and `:295-299` (`studio_member_rates_admin_update`).

Round 4's repair ranks first on *"this studio holds a rate for her whose `created_by` is not her"*, and the banner's justification (`00599:265-270`) is that *"the member cannot write an arm's-length row about herself: the INSERT policy's `created_by = auth.uid()` leg means her own writes always stamp her own id, and `studio_member_rates_admin_update` is owner/admin-only."* The second half is the hole. She **is** the owner of the personal workspace `00295`'s `fc_provision_studio_on_designer` provisions for every `is_designer` profile, so `studio_member_rates_admin_update` admits her there — and `guard_studio_member_rate_history` freezes only `studio_id`, `user_id`, `created_at` on the open row (`00598:238-244`). `created_by` was **deliberately** unfrozen in round 2 (W1-R2-04, `00598:230-237`) so a studio's second admin could blur-save a correction. Round 4 then made that same un-frozen column the authorization key.

Measured end to end, every write through RLS as the actor named (`scratchpad/probe_r5a.sql`):

```
personal workspace active non-guest members = 2        (she seated a collaborator herself, through RLS)
created_by UPDATE through RLS as her SUCCEEDED = t
her own workspace row now reads created_by = c55…009   (she is c55…008)
RESULT rate=99900 src=studio_member amount=199800 billing_state=authorized
```

`$1,998.00` on a two-hour entry, `billing_state='authorized'` — the identical figure rounds 3 and 4 each reported as closed — flowing into `project_unbilled_time`, the studio balance, the invoice composer and `claim_time_entries`' invoice lock. Two **negative controls** isolate it: with the collaborator seat but **no** `created_by` forge (`probe_r5a_ctrl_noforge.sql`) → `15000 / 30000`; with the forge but **no** seat (`probe_r5a_ctrl_noseat.sql`) → `15000 / 30000`. Both moves are hers, both through shipped policies, and together they flip it. Restoring the shipped function body after my fix experiments reproduced `99900` again, confirming causality.

`studio_member_rates_test.sql` cannot catch it: case (b2) asserts `created_by = auth.uid()` **on INSERT** only, and case (j) asserts the open row's `created_by` records the *last author* — it never attempts an UPDATE that stamps a **different** id. Reach is wider than self-pricing: a studio admin can also re-stamp a *colleague's* rate row `created_by = <the colleague>`, which makes the employing studio's row read self-authored and hands that colleague's pricing to whatever studio wins next.

**Exact fix** (in `guard_studio_member_rate_history`, `00598:238`, alongside the identity raise — it preserves W1-R2-04's blur-save, because the upsert's re-stamp always names the acting admin):

```sql
  IF NEW.created_by IS DISTINCT FROM OLD.created_by
     AND NEW.created_by IS DISTINCT FROM (select auth.uid())
  THEN
    RAISE EXCEPTION 'studio member rate authorship records the actor — created_by may only be re-stamped with your own id'
      USING ERRCODE = 'check_violation';
  END IF;
```

Pin it with a postcondition on the function text, and extend `studio_member_rates_test.sql` case (j) with the UPDATE vector above (stamp a third party's id → must raise). **This fix alone is not sufficient** — see W1-R5-02.

---

### W1-R5-02 · BLOCKER · confidence HIGH · the arm's-length key is manufacturable without any forge: her own second account, seated as `admin` in her own workspace, writes the rate

`supabase/migrations/00599_resolve_time_rate_cents.sql:279-284`, with `organization_members`' INSERT policy `Org owners can insert members` = `is_org_admin_or_owner(organization_id) AND (role <> 'owner')`.

`'admin' <> 'owner'`, so the owner of the auto-provisioned personal workspace may seat a second account there **as an admin**. That admin then satisfies `studio_member_rates_admin_insert` in full (`is_org_admin_or_owner(studio_id)`, `created_by = auth.uid()`, subject is an active non-guest member) and writes her 99900 — a row whose `created_by` is genuinely **not** her, i.e. arm's-length by the key's own definition, with nothing forged.

Measured, every write through RLS as the actor named (`scratchpad/probe_r5b_twoaccount.sql`):

```
personal workspace active non-guest members = 2
VARIANT B: no created_by forge needed
her own workspace row now reads created_by = c55…009
RESULT rate=99900 src=studio_member amount=199800 billing_state=authorized
```

The cost of the attack is one extra signup. This is the third consecutive round in which the first ORDER BY key is a property the member can manufacture (round 3: the member count; round 4: the row's authorship). The pattern is structural: **every** key that asks a question *about a candidate studio* is answerable by a studio she owns. The only keys she cannot manufacture are ones about **her own standing inside the candidate** — she cannot stop being the owner of her personal workspace (`Org admins can update members` and `Members can leave` both carry `role <> 'owner'`, so her own owner row is untouchable by her), and she cannot make herself a plain member there.

**Exact fix, verified in-session** (one key, inserted as the new FIRST ORDER BY term at `00599:279`, keeping every existing key below it unchanged): rank first on *"this studio holds a rate for her **and** she is not the one who runs it"*.

```sql
    ORDER BY EXISTS (
               SELECT 1 FROM public.studio_member_rates AS employer
               WHERE employer.studio_id = studio.id
                 AND employer.user_id   = p_user_id
                 AND membership.role NOT IN ('owner','admin')
             ) DESC,
             EXISTS (                                   -- existing arm's-length key
               SELECT 1 FROM public.studio_member_rates AS arms_length
               …
```

Installed body-only on the live stack (`scratchpad/proposed_ladder_r5b.sql`) and measured:

| probe | shipped | with the fix |
|---|---|---|
| W1-R5-01 (created_by forge) | `99900 / studio_member / 199800` | **`15000 / studio_member / 30000`** |
| W1-R5-02 (second-account admin) | `99900 / studio_member / 199800` | **`15000 / studio_member / 30000`** |
| W1-R4-02 / case (s) shape (`probe_r5_r4a`) | `18000 / studio_member / 36000` | **`18000 / studio_member / 36000`** (unchanged — not re-broken) |
| W1-R4-01 / case (r) shape (`probe_r5a_ctrl_noforge`) | `15000 / studio_member / 30000` | **`15000 / studio_member / 30000`** |
| `time_rate_resolution_test.sql` (a)–(s), 19 cases | all pass | **all pass** (`All time_rate_resolution assertions passed.`) |

A naive alternative — `(membership.role IN ('owner','admin')) ASC` as the first key, i.e. "prefer a studio that employs her" with no rate leg — was measured and **re-breaks W1-R4-02** (`probe_r5_r4a` → `NULL / none / NULL`, `scratchpad/proposed_ladder_r5.sql`): the employing studio wins the key and has no rate for her. The rate leg must be inside the same key. The solo designer is still carried by the existing second key (her only candidate, self-authored, no employment) — case (p), (n) and (s) all stay green.

Move `00599`'s postcondition to pin the new key's text **and** its position above the arm's-length key, and add a test case shaped like `probe_r5b_twoaccount.sql` (the `admin` seat written through RLS is what makes it a different case from (r)).

---

### W1-R5-03 · BLOCKER · confidence HIGH · HT-41's `rate_role` lets a project designer override her hard-coded `lead_designer` and bill the client at the best-paying signed card

`supabase/migrations/00601_classifier_rate_resolver.sql:310-321` (the role-selection ladder) with `:150-172` (delta 1's validation) and `00599:346` / `:355-371` (the resolver's mirror).

`00578:2708-2710` hard-coded `lead_designer` for the project's own designer, **before** any roster read — the roster was never consulted for her. `00601` moves `NEW.rate_role` **above** that branch:

```sql
    IF NEW.rate_role IS NOT NULL THEN
      v_team_role := NEW.rate_role;
    ELSIF v_project_designer_id IS NOT DISTINCT FROM NEW.user_id THEN
      v_team_role := 'lead_designer';
```

and delta 1 validates the pick against `project_team_members`, a table the project designer **writes herself**: `Lead designers manage team members` is an `ALL` policy qualified on `projects.designer_id = auth.uid()` with no `with_check` of its own. So the one actor whose role was previously fixed by the server can now mint any roster role and then name it.

Measured on a services project whose signed cards are `Lead designer` 10000 and `Vendor` 40000, as a designer who is a **plain** studio member, every write through RLS as her (`scratchpad/probe_r5d_selfseat.sql`):

```
self-seat as vendor through RLS SUCCEEDED
RESULT rate=40000 src=authority rate_role=vendor amount=80000   (her own card pays 10000)
```

**Negative control** — identical fixture, `rate_role` omitted (`probe_r5d_ctrl.sql`): `rate=10000 src=authority rate_role=lead_designer amount=20000`. So the `rate_role` argument is precisely the lever, and the regression is W1's, not pre-existing: under 00578 the designer branch was unreachable past. `rate_source` reads `'authority'`, so the row prints as a signed, client-agreed rate; `claim_time_entries` will invoice-lock `$800.00` where the signed card for her role says `$200.00`. No test covers it — case (e) exercises a two-hat member who is **not** the project designer, case (g) only a role she does not hold at all.

**Exact fix** (the designer branch regains precedence; no capability is lost relative to the shipped 00578 baseline, which never consulted her roster):

```sql
    IF v_project_designer_id IS NOT DISTINCT FROM NEW.user_id THEN
      v_team_role := 'lead_designer';
    ELSIF NEW.rate_role IS NOT NULL THEN
      v_team_role := NEW.rate_role;
    ELSE
      SELECT CASE WHEN count(DISTINCT member.role) = 1 THEN min(member.role) END
      …
```

Mirror it in `00599` (where `v_role := NULLIF(btrim(COALESCE(p_rate_role,'')),'')` at `:346` takes the argument before the designer derivation at `:373-384`), add a postcondition pinning the designer branch above the pick in both files, and add a test case shaped like the probe above. If the orchestrator instead wants a designer to be able to bill as a vendor on her own project, that is a **ruling** (it lets an employee choose her own client-billed rate from the card table) and must be recorded, not left to the ordering of two `ELSIF`s.

---

### W1-R5-04 · MINOR · confidence HIGH · W1-R4-04 unchanged and re-measured — the open row's dates are still caller-writable through UPDATE

`supabase/migrations/00598_studio_member_rates.sql:216-255`. Not in round 4's fix brief; re-measured so the orchestrator can rule on it with current evidence (`scratchpad/probe_r5e_dates.sql`, both writes as the studio **owner** through RLS):

```
hand-close of the OPEN row via UPDATE: SUCCEEDED
open rows now = 0
today resolves to = NULL      (0 open rows = every future hour resolves 'none' and invoices at $0)
```

This is the **same un-frozen-UPDATE surface** W1-R5-01 exploits, so one edit to `guard_studio_member_rate_history` closes both: add `effective_from`, `effective_to` **and** the `created_by` actor check to the open row's raise (the exact text is in W1-R4-04 and in W1-R5-01 above). The blur-save idiom is unaffected — PostgREST's `ON CONFLICT DO UPDATE` assigns only payload columns, `effective_from` equals the conflict key and `effective_to` is never sent.

---

### W1-R5-05 · MINOR · confidence HIGH · W1-R4-05 unchanged for a third round — `resolve_time_rate_cents` is GRANTed to `authenticated` with no caller in the repo

`supabase/migrations/00599_resolve_time_rate_cents.sql:481-484`. Re-verified this session: the only repo references outside `supabase/migrations` and `supabase/tests` are a doc comment (`packages/supabase/src/hooks/use-time-tracking.ts:91`), the generated `database.types.ts` entry, and the ACL seed's own REVOKE/GRANT lines. No hook, route, edge function or service calls it. ASSERT 1, 2 and 3 exist only because the door is open — and ASSERT 1/2 are what W1-R1-01 and W1-R2-03 were about.

**Exact fix (either, by ruling):** revoke from `authenticated` and re-home cases l1, l2, m3, m4 onto the trigger path, widening the `anon` postcondition to `authenticated`; **or** keep the GRANT and say so in plan-v2 §2's signature block. Do not leave it implicit for a fourth round.

---

### W1-R5-06 · NOTE · confidence HIGH · W1-R4-06 unchanged — `00598`'s trigger-ordering postcondition is two string literals

`supabase/migrations/00598_studio_member_rates.sql:385-387`: `IF 'aaa_guard_studio_member_rate_insert_trg' >= 'close_prior_studio_member_rate_trg'` is constant-folded and can only fail if someone edits the literals. The real protection is the `pg_trigger` existence assert above it (`:378-384`). Compare the two `tgname`s selected from `pg_trigger` if it is meant to be enforced.

---

### W1-R5-07 · NOTE · confidence HIGH · W1-R4-07 unchanged and re-measured — plan-v2 §2's gate block still carries an invocation that cannot be green

Measured both ways on the same clean stack:

- `/Users/kody/Code/patina-merged/scripts/run-sql-tests.sh -d <abs worktree>/supabase/tests/commercial -H 127.0.0.1 -p 54422` → **6 unexpected failures** (`authorized_schedule`, `design_services_authority`, `design_services_gap_hardening`, `executed_on_paper`, `trade_rfq`, `trade_scope`), because the script prints and matches cwd-relative names and no `KNOWN_FAILURES.md` entry matches `.codex/worktrees/agent-server/supabase/tests/…`.
- `./scripts/run-sql-tests.sh -d supabase/tests/commercial -k supabase/tests/KNOWN_FAILURES.md -H 127.0.0.1 -p 54422` from inside the worktree → **10 green + 6 expected-fail = 16/16, 0 unexpected**.

Same trap for `billing` and `rls`. Fix the plan's §2 gate block (and every later wave's brief) rather than re-deriving this each round.

---

### W1-R5-08 · NOTE · confidence MEDIUM · W1-R4-08 unchanged — `effective_from DEFAULT CURRENT_DATE` is the one date in the chain not explicitly UTC

`00598:81`, against `00599:458-460`'s `(p_at AT TIME ZONE 'UTC')::date` and `useSetStudioMemberRate`'s `new Date().toISOString().slice(0,10)`. They agree on a UTC-configured server and diverge elsewhere. Either pin the default (`DEFAULT (now() AT TIME ZONE 'UTC')::date`) or record that no writer relies on it.

---

### W1-R5-09 · NOTE · confidence HIGH · W1-R4-09 unchanged — `00598`'s idempotency backfills the column, not the constraints

`CREATE TABLE IF NOT EXISTS` + `ADD COLUMN IF NOT EXISTS updated_at` (`:76-93`) means a stack carrying an earlier shape would gain `updated_at` and not the inline `UNIQUE (studio_id, user_id, effective_from)` or the `effective_to >= effective_from` CHECK. No such stack exists; recorded only so "idempotent" is not read as "converges any prior shape".

---

### W1-R5-10 · NOTE · confidence HIGH · dated tier-2 rates make HT-13 backdating a rate lever, by design — record it rather than discover it in W3

`started_at` is in `aac_`'s watched list (`00600:191-192`) but **not** in `aab_`'s, so a member moving an un-invoiced entry's date re-fires the classifier and re-prices the hour at whichever dated `studio_member_rates` row covers the new date (delta 5 preserves only a `'none'` answer or a pre-00600 snapshot, `00601:200-206`). Bounded: the rates she can choose among are ones she cannot write (once W1-R5-01/-02 are closed), and `guard_invoiced_time_entry` freezes `started_at` once `invoice_id` is set (§0.12, verified untouched). Not a defect — but W3 owns "yesterday's hour", so the interaction should be stated there.

---

### W1-R5-11 · NOTE · confidence HIGH · hypotheses tested and refuted this round — recorded so round 6 does not re-spend them

1. **Aiming `projects.studio_id` at her own workspace** (which would skip the whole ladder and read tier 2 straight out of her personal workspace). Refused: `probe_r5c.sql` → `P0001 / studio_id_not_designer_studio`. The **live** `set_project_studio_id` is far past 00317's text — it is `prosecdef = f` (SECURITY **INVOKER**, despite 00317 declaring DEFINER) and, for `current_user = 'authenticated'`, raises unless `TG_OP = 'INSERT'`, so no authenticated UPDATE of the watched columns can land at all. Pre-existing, outside this diff, and it is what keeps the fallback ladder the only live path for a legacy project.
2. **Promoting herself inside the employing studio** to set her own rate arm's-length there. Refused: `Org admins can update members` and `Org admins can delete members` both carry `role <> 'owner'` **and** `is_org_admin_or_owner(organization_id)`, which a plain member does not satisfy.
3. **The `00601` graft.** `sed -n '2599,2825p' 00578_design_build_kind.sql` vs `sed -n '99,432p' 00601`, diffed mechanically and independently of round 4's claim: the only changes are the three new DECLAREs and deltas 1, 2, 4, 5, the W1-R1-02 bound-row preservation, the three server-owned branches and `NEW.rate_source := 'authority'`. Every 00578 invariant — the immutability raise, the bound-provenance raise, the `FOR UPDATE` project lock, the 00575 nullable-ceiling delta, retainer gating, the ceiling sum — is byte-identical. Nothing silently reverted. (The grep winner is confirmed: `00575 → 00578 → 00601`.)
4. **`billing_state` / `rated_amount_cents` coverage.** Every one of the classifier's seven exit branches assigns both, so §0.7(c)'s "discarded rather than refused" for `billing_state` and "discarded" for `hourly_rate_cents` hold on every path; `billing_authority_id` / `authority_rate_id` are NULLed on INSERT (`00601:136-139`) before any branch can read a caller value.
5. **Trigger ordering.** `aaa0_time_entry_auto_roster_trg` → `aaa_guard_time_entry_invoice_insert_trg` → `aac_classify_…` on INSERT; `aab_` (BEFORE UPDATE OF …) sorts before `aac_`; `guard_invoiced_time_entry` sorts after both, so the classifier's new writes are still seen and refused on an invoiced row. One BEFORE INSERT trigger on the guard function, not two (n9 honoured).
6. **Program rules, grep- and catalog-verified across the wave's four migrations and seven commits.** No flag (`useFeatureFlag` / `posthog` / `ComingSoon`: 0 hits in the diff). No backfill (no top-level `UPDATE public.project_time_entries`; `00602`/`00603` absent from disk, deliberately unused). No rollup, so no `notes` in one (the only `notes` token in the four files is inside a comment). `project_time_entries` changed only by `ADD COLUMN IF NOT EXISTS` + two named CHECKs — additive. The guard's column list extended in **both** the `IS DISTINCT FROM` chain and `aab_`'s `BEFORE UPDATE OF` list, with `rate_role` also in `aac_`'s. No policy keyed on `projects.studio_id` (`studio_member_rates.studio_id` is the table's own FK to `organizations`, which §0.13 permits). The running-slot index is verbatim: `CREATE UNIQUE INDEX uniq_project_time_entries_running_timer ON public.project_time_entries USING btree (user_id) WHERE (duration_minutes IS NULL)`.
7. **§0.17's 00484 quartet, measured in `pg_policies`.** All four present with the exact names; `Team can view their project time entries` still `is_project_team_member(project_id)` alone, the other three still carrying the `user_id = auth.uid()` leg. None dropped, renamed or re-qualified. `studio_member_rates` carries exactly 3 policies, no DELETE policy, and `has_table_privilege('authenticated', …, 'DELETE')` is false.
8. **Migration numbers.** `00598`–`00601` on `hour-tracking/server` alone; `00602`/`00603` on no ref. W1's range matches §0's amendment.

---

### W1-R4-03 — deferred, phase 2

Lane B's portal surfaces and the PostHog emitters remain absent (re-confirmed once: `account-studio-page.tsx` 0 hits, `studio-rate-rows.tsx` missing, `hours-ledger.tsx` 0 hits, `authority-hours.ts` 0 hits, `document-events.ts` 0 hits). Per the orchestrator's scope ruling this is **phase-2 work and does not count against clean**. Consequence recorded, not charged: Done-when #3's live-mode render half and Done-when #5's printed role stay unverifiable at this commit.

---

## Gates re-run (this reviewer, clean stack)

| command | result |
|---|---|
| `npx supabase db reset --workdir /Users/kody/Code/patina-merged/.codex/worktrees/agent-server` | **clean** — `00595`…`00601` + `20260910152111` applied, 22 seeds loaded, every postcondition replayed (run twice) |
| `scripts/run-sql-tests.sh -d <worktree>/supabase/tests/billing -H 127.0.0.1 -p 54422` | **6 / 6 green**, 0 unexpected-fail |
| `scripts/run-sql-tests.sh -d <worktree>/supabase/tests/commercial -H 127.0.0.1 -p 54422` | **10 green, 6 unexpected-fail** — the brief's/plan's invocation (see W1-R5-07) |
| `./scripts/run-sql-tests.sh -d supabase/tests/commercial -k supabase/tests/KNOWN_FAILURES.md -H 127.0.0.1 -p 54422` | **10 green + 6 expected-fail = 16 / 16**, 0 unexpected — unchanged from round 4 |
| `scripts/run-sql-tests.sh -d <worktree>/supabase/tests/rls -f time_entry -H 127.0.0.1 -p 54422` | **1 / 1 green** |
| `scripts/run-sql-tests.sh -d <worktree>/supabase/tests/billing -f rate -H 127.0.0.1 -p 54422` | **1 / 1 green** — cases (a)–(s), 19, all print `passed` |
| `./scripts/run-sql-tests.sh -d supabase/tests/rls -k supabase/tests/KNOWN_FAILURES.md …` | **24 green + 2 expected-fail = 26 / 26**, 0 unexpected |
| `./scripts/run-sql-tests.sh -d supabase/tests/rls -f studio_member_rates …` | **1 / 1 green** (cases (a)–(k)) |
| `python3 scripts/generate-legacy-grants.py` → `git status --porcelain -- supabase/seed/00-legacy-grants.sql` | **empty** — baseline + 2610 replayed statements, byte-identical to the committed seed. §0.20's grep re-run: `00595, 00597, 00598, 00599, 00600, 00601` all carry GRANT/REVOKE and all appear in the seed |
| `SUPABASE_DB_URL=…:54422 pnpm --dir <worktree> db:generate` → `git diff --exit-code packages/supabase/src/database.types.ts` | **clean** |
| `pnpm --dir <worktree> --filter @patina/supabase type-check` | **clean** |
| `pnpm --dir <worktree> --filter @patina/supabase test -- src/hooks/__tests__/use-studio-member-rates.test.ts` | **1 file / 7 tests passed** |
| `pnpm --dir <worktree> --filter @patina/designer-portal type-check` | **clean** |
| `pnpm --dir <worktree> --filter @patina/designer-portal test src/hooks/__tests__/use-time-tracking-authority.test.tsx` | **1 suite / 3 tests passed** (incl. the exact-insert-shape assert) |
| `pnpm --dir <worktree> --filter @patina/admin-portal build` | **green** (the one portal whose build enforces types) |
| `git status --porcelain` (worktree) | **empty**; `git ls-files -v supabase/config.toml` → `S` |
| `git show --stat` ×7 commits | only W1 paths; conventional-commit subjects; `supabase/config.toml` in no commit; no `database.types.ts` hand-edit (regenerated clean) |

## Done-when, SQL-probed as the named roles

| Done-when | probe | result |
|---|---|---|
| #1 commercial unchanged; billing + rls green | above | ✅ (commercial via the `-k` invocation; see W1-R5-07) |
| #2 `INSERT … (hourly_rate_cents) VALUES (99999)` on a non-services project stores the resolver's value | case (a) of `time_rate_resolution_test.sql`, re-run green | ✅ |
| #3 a rate typed by the owner appears on the next entry with `rate_source='studio_member'` | `probe_r5a_ctrl_noforge.sql` — owner writes 15000 through `studio_member_rates_admin_insert`, member logs → `15000 / studio_member / 30000` | ✅ in SQL; ❌ the live-mode render half (W1-R4-03, deferred) |
| #4 a new hire's services entry carries non-NULL rate + amount and `pending_authorization` | case (c) + the (c4) non-promotability assert (HT-6-b, owed) | ✅ |
| #5 a two-role member's row records the role she picked | case (e)/(f); and `probe_r5d_selfseat.sql` shows the pick is recorded **and** W1-R5-03's lever | ✅ as a stored `rate_role`; ❌ nothing prints it (deferred) |
| **contra** — the server, not the member, owns the rate (HT-1/HT-3) | `probe_r5a.sql`, `probe_r5b_twoaccount.sql`, `probe_r5d_selfseat.sql` | ❌ **three ways through** (W1-R5-01, -02, -03) |

## Not verified

- **Anything on Strata.** No `db push`, no prod probe, read-only nothing.
- **Lane B's surfaces.** They do not exist (deferred, phase 2), so no live-mode render check, no `timeRateProvenance` behaviour, no PostHog emission was or could be exercised.
- **`designer-portal lint` and the full `designer-portal test` / `supabase test` suites.** Outside the brief's gate list this round; round 4 reported them green at `fc65be3c2` and this round's diff (two SQL files) touches no TS.
- **`client-portal`, `manufacturer-portal`, the three services.** Outside this wave's diff; `admin-portal build` is the shared-package gate and it is green.
- **The six red `commercial` files' contents.** Confirmed pre-existing and documented in `supabase/tests/KNOWN_FAILURES.md`; I did not re-derive that each aborts inside `_countersign_design_services_agreement_impl`.
- **Concurrency.** No two-session race of the close ladder under simultaneous blur-saves on the same `(studio_id, user_id)`; `uniq_studio_member_rates_open` is the backstop and was not raced.
- **W1-R5-02's proposed key under a studio whose OWNER logs her own hours on her own project** (both candidates `owner`, so the new key ties and the ladder falls through to the existing arm's-length/rate keys). Cases (n) and (p) cover adjacent shapes and stayed green, but I did not build that exact fixture — the implementer should, as part of the fix.

## Probe scripts (re-derivable)

`/private/tmp/claude-501/-Users-kody-Code-patina-merged/e257acb8-387e-4b1d-8426-8827597413f6/scratchpad/` — `probe_r5a.sql` (W1-R5-01), `probe_r5a_ctrl_noforge.sql` + `probe_r5a_ctrl_noseat.sql` (its two negative controls, also the r4b re-derivation), `probe_r5b_twoaccount.sql` (W1-R5-02), `probe_r5_r4a.sql` (the r4a re-derivation), `probe_r5c.sql` + `probe_r5c_debug.sql` (the refuted `projects.studio_id` route), `probe_r5d_selfseat.sql` + `probe_r5d_ctrl.sql` (W1-R5-03 and its control), `probe_r5e_dates.sql` (W1-R4-04 re-measured), `proposed_ladder_r5.sql` (the measured-bad alternative), `proposed_ladder_r5b.sql` (the verified fix), `shipped_resolver.sql` (the shipped body, restored after every experiment).
