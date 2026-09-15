# W1 — adversarial review, round 12

**clean = false**

One MAJOR finding, new and measured this round. Both of round 11's MAJORs are
**DISCHARGED** as the fix pass reports them — but the one they left behind, by the
reviewer's own prescription, is load-bearing and nothing pins it:

* **W1-R12-01** — on the **live activation path** an **AMBIGUOUS employer tier is not
  `'none'`**. `00603` deliberately hands that case back to `set_project_studio_id`'s
  ambiguity bridge, whose remaining tiebreak keys — `membership.joined_at`, then
  `membership.created_at` — are **written by whoever seats the member**. So the MEMBER
  BEING PRICED moves her own resolved rate to a number she set **even when the project's
  designer already holds an employer seat**: the one shape HT-3-b's ruling cell (as
  corrected in round 11) states is safe, and the shape cases (x), (aa8) and (ad-ii)'s own
  banner each assert resolves to `'none'`. Measured 1/1 end to end through
  `public.sign_proposal` — `99900 / studio_member / 199800 / authorized`,
  `project_unbilled_time` `$1,998.00` — against **three** controls in the same fixture
  that each read `12000 / studio_member / 24000` and stamp the employer studio.

HT-3-b is RULED and says "any tier with more than one candidate is `'none'`", so this is
not charged to a missing ruling. It is, however, the direct consequence of the course
`W1-R11-02`'s own "Exact fix" item 2 prescribed, and the implementer flagged the ceremony
half of it as an OPEN SUB-QUESTION. What is new is the **measured consequence** (a member
pricing herself, not a $0 denial-of-service) and the **absence of any pin**.

**W1-R10-03** (the two wide SELECT policies that expose the per-person rate) re-confirmed
live from `pg_policies` — still W2's `00606`, **not charged to lane A**, still a hard
precondition on the single deploy.

**Reviewed** `hour-tracking/server` @ `a0f5ed0ac` (worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-server`), 17 commits / 17 files /
+8151 −32 against `origin/hour-tracking/integration` (head `00597`). Scope: **lane A DB
only**; lane B is phase 2 and is not counted. `00603` read line by line; `00598`, `00599`,
`00600`, `00601`, `00602` are byte-identical to round 11 and were re-read in their
load-bearing regions plus probed behaviourally. Every probe writes through RLS as the
actor named, inside a transaction that is rolled back. Rulings in force: HT-3-a, HT-3-b,
HT-3-c(a), HT-10-a. A designer who NAMED her own studio pricing from it is not a defect.

---

## Discharge of round 11's findings

| r11 finding | r11 severity | disposition verified this round |
|---|---|---|
| **W1-R11-01** — the MEMBER BEING PRICED can move her own resolved rate to a number she set | MAJOR | **DISCHARGED as pinned + corrected, exactly as the review required.** Leg **(ad-ii)** landed with its control in the same fixture (`ad5a`/`ad5` → `20000 / studio_member / 40000`), both surfaces (`ad6`/`ad7`/`ad7b` stamped, `ad8a`/`ad8`/`ad9` legacy NULL), every failure message naming HT-3-b arm (c) and the values it takes when arm (c) lands. `time_rate_resolution_test.sql:3440-3452` replaced with the corrected property; HT-3-b's ruling cell in `rulings.md` corrected in both of the places that stated the false one, and `(ad)` → `(ad-i)` throughout. Not patched — correct, per the review. **Residue:** the same retracted sentence survives verbatim in **`00599`'s own banner and step-2 comment** → W1-R12-02; and the corrected property is itself still too generous → W1-R12-01. |
| **W1-R11-02** — HT-3-b inert on the live activation path; W1-R8-01 arms A and B both alive | MAJOR | **DISCHARGED for the exactly-one-employer case, which is what it measured.** `00603` built as the finding's "Exact fix" specified: `aaa_project_studio_id_named_trg` (BEFORE INSERT FOR EACH ROW, sorts first of all BEFORE-INSERT triggers on `projects` — read from `pg_trigger`) records the per-row NAMED/DERIVED flag; `set_project_studio_id_owned` (still `zzz_`, still last) overrides a DERIVED studio with a single employer candidate. `set_project_studio_id` NOT redefined. Case **(ae)** pins the live path through `public.sign_proposal` (`studio_id = S`, 20000/40000 and 12000/24000, both view rows, plus leg `ae5` for HT-3-c). Verified independently below, including the two mechanisms the banner asserts. **Residue:** the ambiguous arm → W1-R12-01. |
| W1-R11-03 … W1-R11-12 | MINOR | **all carried unchanged**, each re-verified in place this round (W1-R12-04 … W1-R12-13). `git show --stat a0f5ed0ac` is `00603`, the grants seed and two test files only, so every region they name is byte-identical. |
| NOTEs 1–8 | — | carried; NOTE 1 re-measured open, NOTE 6 re-measured both ways, NOTE 2 **extended** (W1-R12-N2). |

### The two mechanisms `00603` rests on, verified rather than taken on trust

* **Does `set_config(…, true)` survive the return of a function that carries a `SET
  search_path` clause?** YES on this Postgres — measured with a paired control (a function
  with the `SET` clause and one without; both left the GUC readable at `'0'` after
  returning). Had it not, `v_caller_named` would read NAMED on every row and `00603` would
  be a no-op that the suite could not see. This was the single load-bearing assumption in
  the file and it holds.
* **Is the flag really per ROW, not per statement?** YES — one multi-row
  `INSERT … VALUES (named),(unnamed)` and its reverse both stamped correctly (named row
  keeps the OWNED studio it named, unnamed row gets the EMPLOYER studio), 2/2 in each
  order.

---

## Findings

### W1-R12-01 · MAJOR (blocker-class) · confidence HIGH (measured 1/1 end to end through `public.sign_proposal`, with three negative controls in the same fixture) · on the live activation path an AMBIGUOUS employer tier is NOT `'none'` — it is whatever `00563`'s bridge picks on a tiebreak key the seating caller writes, so the MEMBER BEING PRICED prices herself even when the project's designer HOLDS an employer seat

**Where.**
`supabase/migrations/00603_project_studio_id_named_vs_derived.sql:200-222` — the
`ELSIF COALESCE(array_length(v_employer_studios,1),0) = 0 AND NEW.studio_id IS NULL` arm.
Read literally: when the employer tier holds **two or more**, neither branch fires and
`NEW.studio_id` keeps whatever `set_project_studio_id` derived. The live bridge it defers
to (read from `pg_get_functiondef('public.set_project_studio_id()')`, lines 177-189 of the
live body) orders candidates:

```
ORDER BY EXISTS (sibling project for this designer+client) DESC,
         (membership.role = 'owner') DESC,
         membership.joined_at NULLS LAST,
         membership.created_at,
         membership.organization_id
```

`organization_members.joined_at` is **nullable with no default** and
`created_at` is `NOT NULL DEFAULT now()` — both are ordinary, caller-suppliable columns,
and `guard_org_membership_changes()` (read live) constrains only `role`, `status`,
`organization_id` and `user_id`. `Org owners can insert members` is
`is_org_admin_or_owner(organization_id) AND role <> 'owner'` — **nothing about the
invitee**. So the two date keys `00599`/`00602`/`00603` each spent a review round deleting
from their own bodies are still in charge of the same question, one trigger later, and are
written by the member who benefits.

**Measured** (`/tmp/claude/probe_r12a.sql`, every write through RLS as the actor named,
rolled back). The fixture is this program's own customer shape plus one ordinary designer
signup — **no stranger account, no forged column, no privileged role**:

* Leah owns studio `S` (seated `owner` first, `studio_owner` second → no employer seat).
* `D`, the project's **lead designer**, is seated `admin` in `S` **first** and granted
  `studio_designer` **second**, so `00295` provisions her nothing — she is a hire with
  **exactly one employer seat**, the shape HT-3-b's cell calls safe.
* `M`, the **member being priced**, is an ordinary designer signup (grant first → `00295`
  gives her workspace `W_M`, which she OWNS) and a plain `member` of `S`.
* Leah prices `M` **12000** in `S`, through RLS, on HT-3's own surface.

```
THE MANOEUVRE — two statements, both M's own, both ALLOWED through RLS
  INSERT studio_member_rates(W_M, herself, 99900)            (she is W_M's owner)
  INSERT organization_members(D, W_M, 'member','active',
                              joined_at = '2000-01-01')      (Org owners can insert members)

  → D's candidate studios = 2; her EMPLOYER tier is AMBIGUOUS, so 00603 stands aside

THE SIGNATURE — public.sign_proposal(...) as the CLIENT, the ordinary way a project is born
  projects.studio_id            = W_M          ← the workspace M owns, NOT S
  M's hour on that project      = 99900 / studio_member / 199800 / authorized
  project_unbilled_time         = resolved 99900, amount 199800   ($1,998.00)
  D's own hour (arm B)          = NULL  / none  / NULL

CONTROL A  no seat manoeuvre at all      → stamp S · M's hour 12000 / studio_member / 24000
CONTROL B  the same seat, joined_at NULL → stamp S · M's hour 12000 / studio_member / 24000
           (NULLS LAST loses the bridge's order — the MANUFACTURED DATE is the whole lever)
CONTROL C  the same seat, status='invited'
           (HT-3-b arm (c)'s shape)      → stamp S · M's hour 12000 / studio_member / 24000
```

**Why this is a finding and not a restatement of W1-R11-01.** (ad-ii) and HT-3-b's
corrected cell both scope the exception precisely: *"when the project's designer holds
**no** employer seat"*, and they both say in so many words that a second seat aimed at a
designer who **already holds** one "can only push it toward `'none'`" / "their extra seat
makes the designer's employer tier AMBIGUOUS (two employers → `'none'`)". Here the
designer holds an employer seat, the tier IS ambiguous, and the answer is **99900**, not
`'none'`. Three statements of the ruling in force are false as built:

1. HT-3-b's ruled *"any tier with more than one candidate is `'none'`"* — true in `00599`
   step 2 and in `00603`'s own two tiers, false on the path that creates real projects.
2. HT-3-b's cell: *"a consent-free seat aimed at a designer who ALREADY HOLDS an employer
   seat can only push it toward `'none'` (the pre-existing W1-R8-12 denial-of-service,
   reversible)."*
3. `time_rate_resolution_test.sql:3444-3452` and `:3604-3631`: *"Cases (x) and (aa8)
   measure only the first half: their extra seat makes the designer's employer tier
   AMBIGUOUS (two employers → `'none'`)."* True of (x) and (aa8) — which create their
   projects **as postgres**, where `00563` leaves the column NULL and step 2 answers — and
   false of the live path, which is exactly the blind spot W1-R11-02 was about.

The row is `authorized` `studio_member`, indistinguishable from a legitimate one, so it is
not a `'none'` row W2's composer can filter, and `claim_time_entries` will invoice-lock it.

**Exposure.** The activation path only (`public.sign_proposal` /
`_activate_proposal_as_project_impl`, which does **not** name `studio_id` — verified in
its live body's INSERT column list, so every signed project is DERIVED and therefore
governed by `00603`). The authenticated direct-INSERT path is not a surface: with two
candidates `00563` raises (the pre-existing W1-R8-12 denial-of-service). The
postgres/seed path is not a surface either: there `00603` stamps nothing and `00599`
step 2 reports `'none'` for an ambiguous tier — which is why the green suite cannot see
this.

**Exact fix.**
1. **Required this round, whichever way it is ruled:** a new leg pinning it as built, on
   the **live** path (the probe above is a ready fixture: hire seated `admin` **before**
   her designer grant so she owns nothing, `M` an ordinary designer signup seated plain
   `member`, `M` seats the designer in `W_M` with `joined_at` backdated, the client signs).
   Assert today's `studio_id = W_M`, `99900 / studio_member / 199800 / authorized`, the
   `project_unbilled_time` pair, **and** the `12000 / 24000` control in the same fixture,
   with the failure messages naming HT-3-b arm (c) **and** `00603`'s OPEN SUB-QUESTION and
   stating the values the assert takes when either lands.
2. **Correct the three statements above** — HT-3-b's ruling cell (the "already holds an
   employer seat → only toward `'none'`" sentence and the "(x)/(aa8): two employers →
   `'none'`" sentence), (ad-ii)'s banner, and `00599`'s banner (see W1-R12-02). The
   property that actually holds: *a member can push the outcome toward `'none'` only where
   the decision is `00599` step 2's or `00603`'s; on the activation path an ambiguous tier
   is decided by `00563`'s bridge on `joined_at`/`created_at`, both of which the seating
   caller writes.*
3. **Do NOT patch `00603`'s ambiguous arm in a fix round.** Clearing the column there
   either refuses the client's signature or smuggles a NULL past `00563`'s fail-closed
   check — `00603`'s banner is right about that, and it is the OPEN SUB-QUESTION already
   on the table. **What this finding adds is that the sub-question is not cosmetic.** The
   two closures, both rulings:
   * **HT-3-b arm (c)** (seats land `status = 'invited'`; only the named user activates her
     own seat) closes it completely and is **already OWED** — measured as CONTROL C above:
     with the identical manoeuvre at `status='invited'` the stamp is `S` and the hour is
     `12000 / 24000`. No new ruling needed to record this one, only that one closed.
   * or a ruling that an ambiguous employer tier must **fail closed on the activation
     path** (refuse the signature, or leave the column NULL and amend `00563`'s check) —
     which is the edit to the signing ceremony `00603`'s banner says must be ruled.
   I looked for a third, code-only closure inside this program's files and found none that
   does not either key on the member being priced (HT-3-a forbids it) or re-introduce a
   ranking key among the employer candidates (rounds 4-7 rated every such key
   blocker-grade). Restricting the bridge's answer to the employer tier does not help:
   both candidates here **are** employer-tier seats.

---

### W1-R12-02 · MINOR · confidence HIGH (code-read) · the sentence round 11 retracted in `rulings.md` and in the test file still stands verbatim in `00599`'s banner and in its step-2 comment — the two places a future grafter reads first

`supabase/migrations/00599_resolve_time_rate_cents.sql:136-138`: *"the choice is
independent of the member being priced, so a member **can only push the outcome toward
'none' — never toward a number she set**."* And `:288-290`: *"…so the worst a member can
do to the answer is **push it to 'none'**."* Both are the sentence W1-R11-01 measured
false and the round-11 fix pass corrected in `time_rate_resolution_test.sql:3440-3452`
and in HT-3-b's ruling cell. `00599` is the resolver; its banner is the contract every
later wave will graft from.

**Exact fix:** replace both with the corrected property (and, after W1-R12-01, the
further-corrected one), cross-referencing legs (ad-i)/(ad-ii) and the new live-path leg.

### W1-R12-03 · MINOR · confidence HIGH (code-read) · `00602`'s banner asserts the claim W1-R12-01 refutes, and `00603` does not retract it

`supabase/migrations/00602_projects_studio_id_on_insert.sql:98-99` (*"ambiguity is 'none'
under HT-3-b"*) and `:104-108` (*"a second seat can make a designer's tier ambiguous — a
$0 denial-of-service (the pre-existing W1-R8-12), **never somebody else's number**"*).
Measured false on the activation path. `00603` supersedes the function but its banner
retracts only the owner-first half.

**Exact fix:** one paragraph in `00603`'s banner retracting `00602:98-108` by line, with
the measured values, beside the existing OPEN SUB-QUESTION.

### W1-R12-04 · MINOR · carried unchanged (r11 W1-R11-03) · the retracted "trustworthy as a pricing key" claim survives in case (z)'s comment

`supabase/tests/billing/time_rate_resolution_test.sql:2615-2618`: *"This is what makes
00317's anti-aiming guard **load-bearing for pricing** …"* — retracted in `00599`'s
banner, `00599`'s step-1 comment and `00602`'s banner, not here. Re-read this round,
byte-identical. **Fix as r11 stated:** the guard **bounds** the column to studios the lead
designer actively belongs to (`role <> 'guest'`) and does not choose among them; what
makes step 1 final is **HT-3-c arm (a)** — cross-reference case (ac).

### W1-R12-05 · MINOR · carried unchanged (r11 W1-R11-04) · a scheduled future raise makes that day's rate uncorrectable, and the future row cannot be withdrawn

`00598:197-212`, `:242-245`, `packages/supabase/src/hooks/use-studio-member-rates.ts:100-111`
— all three regions byte-identical; re-derived from the shipped bodies this round. A future
row closes the open row at `effective_from - 1`; if that open row's `effective_from` is
**today**, the blur-save's upsert on `(studio_id, user_id, effective_from)` then targets a
**closed** row and `guard_studio_member_rate_history` raises *"a closed studio member rate
row is history"* (read live at `00598:240-246`). No DELETE policy exists and
`effective_from`/`effective_to` are frozen, so the future row cannot be withdrawn either.
No test exercises a future `effective_from`. **Fix:** either target the row **covering**
today in `useSetStudioMemberRate`, or rule that a future-dated row may be withdrawn by its
author while `effective_from > CURRENT_DATE` (one arm in the guard + a DELETE policy
restricted to that predicate, which also closes W1-R8-10).

### W1-R12-06 · MINOR · carried unchanged (r11 W1-R11-05) · delta 4 stamps a `rate_role` that did not price the hour

`00601:255-264` assigns `NEW.rate_role := v_rate_role`; `00599:470` (role-matched) and
`:490` (the **single-card fallback**) both return `v_role` — the member's own pick — while
a card of a different `role_name` supplies the cents. Done-when #5 is satisfied in the one
way `00601:256-261`'s own rationale forbids. **Fix:** return the card's normalized
`role_name`, or `NULL`, on the fallback return; add the fixture as a case.

### W1-R12-07 · MINOR · carried unchanged (r11 W1-R11-06) · a pre-`00600` BOUND row's NULL provenance is relabelled `'authority'` by an ordinary duration correction

`00601:476` (`NEW.rate_source := 'authority';`) sits outside both the `v_is_bound`
handling (`:470-474`) and delta 5's preservation block (`:278-284`), while `00600`'s own
column comment (`00600:93-98`) defines NULL as "a row written before 00600". **Fix:** stamp
`'authority'` only when `v_is_bound` is false **or** `OLD.rate_source IS NOT NULL`; add a
bound-legacy-row case.

### W1-R12-08 · MINOR · carried unchanged (r11 W1-R11-07) · `00598` still justifies its `created_by` actor-check by a key `00599` now REFUSES by name

`00598:78`, `:284-285`, `:450` call `created_by` *"00599's arm's-length key"*;
`00599:681-683` raises if `arms_length` reappears. **Fix:** keep the check (it is right —
authorship may only be re-stamped with the actor's own id) and restate its rationale as
authorship provenance alone.

### W1-R12-09 · MINOR · carried unchanged (r11 W1-R11-08) · the member chooses among a studio's historical rates by choosing the date, and an UNBOUND row is silently re-priced when its date moves

`00599:507-511`; `00601:278-284`; `started_at` is in `aac_`'s watched list (read live) and
`useUpdateTimeEntry` accepts it. **Fix:** one line beside HT-13 ruling whether a date edit
re-prices an unbound row or keeps its snapshot; pin today's behaviour meanwhile.

### W1-R12-10 · MINOR · carried unchanged (r11 W1-R11-09, **7th round**) · `00598`'s trigger-ordering postcondition compares two string literals

`00598:436`: `IF 'aaa_guard_studio_member_rate_insert_trg' >= 'close_prior_studio_member_rate_trg' THEN`
— constant-folded at parse time, so it can never fire. `00602:228` and now **`00603:261-290`**
both read the names from `pg_trigger` and compare the values, and say so. The wave is
inconsistent with its own idiom two files to one. **Fix:** apply `00603`'s form in `00598`.

### W1-R12-11 · MINOR · carried unchanged (r11 W1-R11-10) · `00598`'s W1-R7-03 postconditions are whitespace-sensitive

`00598:456-457`, `:460-461` match
`'NEW\.effective_to   IS DISTINCT FROM OLD\.effective_to'` with three literal spaces
against `pg_get_functiondef` output (the body at `:271` happens to carry three). Any
reformat fails the replay with a message about a protection that is in fact present.
**Fix:** `\s+` between the tokens.

### W1-R12-12 · MINOR · carried unchanged (r11 W1-R11-11) · the invoiced-entry lock's frozen list does not carry W1's new derived columns

Re-measured live this round against `pg_get_functiondef('public.guard_invoiced_time_entry()')`:
freezes `hourly_rate_cents` = **true**; `rate_source`, `rate_role`, `rated_amount_cents` =
**false** (and `billing_state` likewise, pre-existing). No caller can reach them — `aab_`
raises `23514` for every non-postgres actor (measured again this round) — so the residue is
that a future **postgres-context rail** could rewrite an invoiced row's provenance and
amount silently. §0.12 forbids touching the lock, so this is an owed decision recorded
beside HT-6-a/HT-6-b, not a fix-round edit.

### W1-R12-13 · MINOR · carried unchanged (r11 W1-R11-12) · the comment `00602` added to a shipped test describes the pre-HT-3-b rule

`supabase/tests/rls/00563_proposal_signing_multi_studio.test.sql:127-129`: *"00602 …
stamps projects.studio_id at INSERT **from a studio the lead designer OWNS**"*. After
HT-3-b the stamp is employer-first and the owned tier is the fallback; after `00603` it
also overrides a DERIVED value. **Fix:** "from the lead designer's one EMPLOYER studio, or
her one OWNED studio when she has no employer — and, since 00603, over a studio
`set_project_studio_id` derived."

### W1-R12-14 · MINOR · confidence HIGH (code-read) · new · section 2 of the `00563` rls test now re-implements `00603`'s own rule to compute what it expects, so it can no longer fail for choosing the **wrong rule**

`supabase/tests/rls/00563_proposal_signing_multi_studio.test.sql:185-214`: `v_expected` is
derived by the test from `pg_temp.candidate_studios()` — employer tier when it holds
exactly one, else `00317`'s order — which is precisely the algorithm under test. The assert
now only catches a **third** answer (NULL, or a studio outside the candidate set); a future
migration that swapped the two tiers, or restored owner-first, would keep it green because
the test would swap with it. The fixture's employer studio is a **constant**
(`59000000-…-0001`, the id the pre-`00603` run reported as "got").

**Exact fix:** keep the computed branch for its diagnostic message, and add
`ASSERT v_expected = '59000000-0000-4000-8000-000000000001'` (with the fixture's own
reason) so the rule itself is pinned to a literal for this fixture.

### W1-R12-15 · MINOR · confidence HIGH (code-read) · new · the fixture `UPDATE projects SET studio_id = NULL` added for section 2 sits in the shared pre-savepoint fixture, so sections 3-5 run against it too

`supabase/tests/rls/00563_proposal_signing_multi_studio.test.sql:127-137` nulls
`studio_id` for the `(designer, client)` pair inside the **shared** fixture DO block, at
line 137 — **before** `SAVEPOINT s_order` (line 181). Its comment justifies it for section
2 alone. All five sections are green today, so this is a latent fixture-scope defect rather
than a live one, and the shape it creates (a NULL-studio project for a designer with two
candidates) is one no live path can produce after `00602`/`00603`.

**Exact fix:** move the `UPDATE` inside `SAVEPOINT s_order`, or state in its comment that
it is deliberately global and why sections 3-5 are unaffected.

---

## NOTEs

1. **`service_role` still holds EXECUTE on `resolve_time_rate_cents`** (carried r9/r10/r11).
   Re-measured: `PUBLIC=f anon=f authenticated=f service_role=t`, while
   `close_prior_studio_member_rate`, `set_project_studio_id_owned`,
   `record_project_studio_id_named`, `guard_studio_member_rate_*` and
   `classify_project_time_entry_authority` are `f` for all four. `00599:564-574`'s
   postconditions assert only `anon` and `authenticated`. Inside a service_role call
   `auth.uid()` is NULL so all three asserts bypass — no escalation (service_role reads the
   table directly) but inconsistent with its own siblings. Fix: add `service_role` to the
   REVOKE and the postcondition, or say in the banner why it is kept.
2. **Plan-v2 §2 is now stale in FIVE places** (r11 NOTE 2 extended): it still shows
   `GRANT EXECUTE … TO authenticated` (shipped: REVOKEd, W1-R7-04); it still lists `00602`
   as UNUSED (shipped: the HT-3-a/HT-3-b stamp); it now also lists **`00603` as UNUSED**
   (shipped: the W1-R11-02 fix); §0.20's own grep `grep -lE '^\s*(GRANT|REVOKE)'
   supabase/migrations/006*.sql` **cannot match `00595`–`00599`**, of which `00598` carries
   four REVOKEs and two GRANTs and `00599` one REVOKE — write the glob `00[56]*`; and
   **W1's whole reserved range `00598–00603` is now consumed**, so the plan's renumber
   headroom is gone and a merge-time collision must bump a W2-or-later number, never a W1
   one. All four code deviations are ratified in-file; the plan is not.
3. **W1-R10-03 is the deploy's hard precondition**, re-confirmed live this round:
   `Team can view their project time entries` = `is_project_team_member(project_id)`;
   `time_entries_studio_read` = `EXISTS (… is_studio_comember(p.designer_id))` — neither
   carries a `user_id` leg, and W1 is the first wave to write a per-person rate onto
   `project_time_entries`. **W1 must not reach Strata ahead of `00606`.** Say it in the
   deploy chain, not only in a ruling.
4. **`project_unbilled_time` returns `notes`** (column list read live:
   `id, project_id, phase_key, task_id, user_id, started_at, duration_minutes, notes,
   resolved_rate_cents, amount_cents, billing_authority_id, authority_rate_id,
   billing_state`). Pre-existing (`00412`), untouched by W1, and not a rollup — but §0.10
   binds W2's rollup, so W2 must not inherit this shape by reading the view.
5. **`00601` delta 1a's owner/admin exemption** is dead on a NULL-`studio_id` project
   (carried NOTE 4/6) and, in both W1-R11-01's and W1-R12-01's measured shapes, the exempt
   actor is the **foreign workspace's owner** — i.e. the manoeuvring member. Not reachable
   through RLS today (every INSERT policy on `project_time_entries` requires
   `user_id = auth.uid()`), so recorded, not charged.
6. **The `commercial` suite's six reds are pre-existing** and the brief's invocation omits
   `-k`. Measured both ways this round: as the brief invokes it, 10 green / 6
   unexpected-fail; from the worktree with a **relative** `-k supabase/tests/KNOWN_FAILURES.md`,
   **16/16, 0 unexpected**. All six abort inside
   `_countersign_design_services_agreement_impl` before any authority-rate assert, which is
   why `time_rate_resolution_test.sql` is the classifier's only real gate.
7. **Lane B is absent** (phase 2): Done-when #3's live-mode render half and Done-when #5's
   *printed* role stay unverifiable. Both DB halves verified below.
8. **`00603` changed one shipped test's behaviour**, in the open:
   `00563_proposal_signing_multi_studio.test.sql` sections 2 and 3 (see W1-R12-14/15). The
   whole `rls` directory is **26/26** (24 green + 2 documented pre-existing) including that
   file.
9. **Reviewer's own contamination, disclosed:** my GUC-survival probe created two
   functions (`public._zz_probe_setter*`) outside a transaction, which made `db:generate`
   dirty until I dropped them. They were dropped and the regeneration below is clean — do
   not read that intermediate as a wave defect.

---

## Hypotheses tested and REFUTED this round (so round 13 does not re-spend them)

- **Is `00603`'s flag defeated by the `SET search_path` clause on the function that writes
  it?** No — measured: a `set_config(…, true)` inside a function carrying a `SET` clause is
  still readable after the function returns (paired control with a clause-free function).
- **Is the flag per statement rather than per row?** No — a two-row `INSERT` with one named
  and one unnamed row stamps each correctly, in both orders.
- **Can a caller pre-set `app.project_studio_id_named` to defeat the flag?** No — the
  `aaa_` trigger rewrites it unconditionally for every row, after any caller statement and
  before `set_project_studio_id` or the `zzz_` stamp can read it. Reading a MISSING flag as
  NAMED can only leave `00563`'s answer standing.
- **Is `aaa_project_studio_id_named_trg` actually first?** Yes — read from `pg_trigger`:
  the BEFORE-INSERT set on `public.projects` is
  `aaa_project_studio_id_named_trg < guard_project_authority_insert_trg <
  guard_project_closeout_evidence_insert_trg < set_project_studio_id <
  zzz_set_project_studio_id_owned_trg`, and neither intervening guard reads or writes
  `studio_id` (both bodies grepped).
- **Does any live creation path NAME `studio_id` and so keep HT-3-b inert?**
  No. `_activate_proposal_as_project_impl` (head `00579`, read live) omits `studio_id` from
  its INSERT column list, and `packages/supabase/src/hooks/use-projects.ts` never sends it —
  so HT-3-c arm (a) protects a shape only a direct PostgREST insert produces, and `00603`'s
  override governs every shipped path.
- **Does `00603`'s override break `00563`'s authorization?** No. It fires last, so every
  `00563` refusal is reached first, and the only value it can write is one of the named
  designer's own active non-guest `design_studio` seats — inside the set `00317`'s
  anti-aiming guard admits. `00563` section 5a (a direct authenticated INSERT by a
  two-studio designer still RAISES) is green.
- **Does the exploit in W1-R12-01 also reach the postgres/seed path, or a direct
  authenticated INSERT?** No — the former reports `'none'` (ambiguous tier, no stamp), the
  latter raises in `00563`. It is the activation path only.
- **Can a member reach `resolve_time_rate_cents` as an RPC?** No —
  `42501 permission denied for function resolve_time_rate_cents` (measured as
  `authenticated`).
- **Does `00600`'s INSERT branch refuse `rate_source` / `rated_amount_cents`?** Yes, `23514`
  for both (measured); `hourly_rate_cents` and `billing_state` are discarded as §0.7(c)
  ratifies.
- **Is the 00484 quartet intact, and did any new policy land on `project_time_entries`?**
  Yes / no — all four read live with their registered quals and the nine policies on the
  table are the pre-existing set.

---

## Program-rule compliance (each checked this round, not assumed)

| rule | verdict | evidence |
|---|---|---|
| §0.1 additive to `project_time_entries` | PASS | two `ADD COLUMN IF NOT EXISTS`; one new table; no new hours surface |
| §0.2 hand-numbered, no collision | PASS | `00598`–`00603`; integration head `00597`; enumerated across every ref — `00598`–`00603` exist on `hour-tracking/server` alone, nothing else holds them; peer program mints from `00621` |
| §0.3 banner / idempotent / RLS in the same file | PASS | all six carry banners + lineage; `CREATE OR REPLACE` / `IF NOT EXISTS` / `DROP TRIGGER IF EXISTS` throughout; `ENABLE ROW LEVEL SECURITY` + 3 policies inside `00598` |
| §0.4 redefine from the grep winner | PASS | `00600` grafts the guard from `00412`; `00601` grafts the classifier from `00578` (lineage `00412 → 00575 → 00578 → 00601`, four postconditions pinning 00578/00575 invariants by raise text); `00603` grafts `set_project_studio_id_owned` from `00602` and explicitly refuses to re-derive `set_project_studio_id` (head `00563`) or `activate_proposal_as_project` (head `00579`) — both verified untouched in the diff |
| §0.5 no flags | PASS | zero `useFeatureFlag` / posthog / `ComingSoon` in the whole diff (grep) |
| §0.6 / P-4 no backfill | PASS | the only DML in the six files is the close-ladder `UPDATE` **inside** `00598`'s trigger function; both `00603` triggers are BEFORE INSERT with a postcondition refusing an UPDATE event (`tgtype & 16`) and requiring BEFORE-INSERT-ROW on both (`count = 2`) |
| §0.7 client rate discarded, every kind | PASS | measured: `99999` on a **non-services** project carrying `change_order_terms.hourly_rate_cents = 17500` stored as **15000 / studio_member / 30000 / authorized** |
| §0.7c two refusals + two discards | PASS | `rate_source`, `rated_amount_cents` → `23514`; `hourly_rate_cents`, `billing_state` silently replaced |
| §0.8 guard list in BOTH places | PASS | read from `pg_trigger`: `aab_` is `BEFORE UPDATE OF project_id, billing_authority_id, authority_rate_id, hourly_rate_cents, rated_amount_cents, billing_state, rate_source, rate_role` and the `IS DISTINCT FROM` chain (`00600:148-155`) carries the same eight; `aac_` carries `rate_role`; one BEFORE INSERT trigger on the guard function, not two (n9) |
| §0.9 / §0.10 rollup INVOKER, no notes | N/A | W1 adds no rollup; `notes` appears in no return shape the wave creates (see NOTE 4 for the pre-existing view) |
| §0.11 one running-timer slot | PASS | `CREATE UNIQUE INDEX uniq_project_time_entries_running_timer ON public.project_time_entries USING btree (user_id) WHERE (duration_minutes IS NULL)` read live, unchanged; no migration in the diff names it |
| §0.12 invoiced lock untouched | PASS (with W1-R12-12) | body read live, identical; `00600` postcondition asserts it is still installed; `guard_invoiced_time_entry` trigger unchanged in `pg_trigger` |
| §0.13 no RLS policy keyed on `projects.studio_id` | PASS | no new policy on `project_time_entries` or `projects`; `studio_member_rates`' three key on its **own** `studio_id` via `is_org_admin_or_owner`. (`00599` step 1, `00601` delta 1a and `00603` read the column in function/trigger bodies, which §0.13 permits.) |
| §0.14 only `is_org_admin_or_owner` | PASS | zero new `user_is_org_member` call sites in the diff |
| §0.15 `organization_members.role` of type `member_role` | PASS | `designer_seat.role <> 'guest'`, `<> 'owner'`, `= 'owner'` in both bodies |
| §0.16 / 00484 DEFINER contract | PASS (NOTE 1) | all five DEFINERs pin `search_path = public, pg_temp`; `PUBLIC/anon/authenticated` revoked on every one (`has_function_privilege` measured `f`); `extensions.gen_random_uuid()` and `pg_catalog.pg_trigger_depth()` schema-qualified |
| §0.17 the 00484 quartet immutable | PASS | all four read live with their registered quals; `00484`'s assert replayed clean on a full reset |
| §0.19 / §0.20 generated files | PASS | both regenerate to an empty diff (below); see NOTE 2 on the rule's own glob |
| §0.21 hook names | PASS | new module only; no rename, no default export |
| §0.22 zero-tap path | PASS | `rateRole?` optional; no required field added to `CreateTimeEntryInput`; pinned by the jest case "creates an entry without sending any rate, amount, billing state or provenance" (run, green) |

**Plan items, signature-exact:** `00598`'s table (columns, `UNIQUE (studio_id, user_id,
effective_from)`, `CHECK (hourly_rate_cents > 0)`), the three policy **names**
(`studio_member_rates_read_self_or_admin`, `_admin_insert`, `_admin_update`) and no DELETE
policy (read from `pg_policies`: exactly those three); `00599`'s
`(uuid, uuid, timestamptz, text) RETURNS TABLE (cents integer, source text, role text)`,
`STABLE`, `SECURITY DEFINER` — **one ratified deviation**: `authenticated` is REVOKEd, not
GRANTed (W1-R7-04; plan stale, NOTE 2); `00600`'s two columns with their exact CHECK sets
(read from `pg_constraint`: `('authority','studio_member','profile_default','none')` and
`('lead_designer','support_designer','bookkeeper','vendor')`); `00601`'s five deltas plus
delta 1a; `00602` repurposed per HT-3-a/HT-3-b and `00603` repurposed per W1-R11-02 (plan
stale both times, NOTE 2).

---

## Gates re-run (this reviewer, clean stack, project `patina-hours`, `127.0.0.1:54422`)

| command | result |
|---|---|
| `npx supabase db reset --workdir …/agent-server` | **clean**, exit 0 — `00598`…`00603` applied, every postcondition replayed, 27 seeds loaded, `Finished supabase db reset` |
| `run-sql-tests.sh -d …/supabase/tests/billing -H 127.0.0.1 -p 54422` | **6 / 6 green**, 0 unexpected |
| `run-sql-tests.sh -d …/supabase/tests/commercial -H 127.0.0.1 -p 54422` | 10 green / **6 unexpected-fail as the brief invokes it**; from the worktree with relative `-k supabase/tests/KNOWN_FAILURES.md` → **16 / 16, 0 unexpected** (NOTE 6) |
| `run-sql-tests.sh -d …/supabase/tests/rls -f time_entry -H … -p 54422` | **1 / 1 green** |
| `run-sql-tests.sh -d …/supabase/tests/billing -f rate -H … -p 54422` | **1 / 1 green** — `time_rate_resolution_test.sql`, cases (a)–(ae) |
| `run-sql-tests.sh -d …/supabase/tests/rls -f studio_member_rates -H … -p 54422` | **1 / 1 green** |
| *beyond the brief:* whole `rls` directory with relative `-k` | **26 / 26** (24 green + 2 documented pre-existing) — includes the amended `00563_proposal_signing_multi_studio.test.sql` |
| `python3 …/scripts/generate-legacy-grants.py` → `git status --porcelain -- supabase/seed/00-legacy-grants.sql` | **empty** — baseline + **2612** replayed statements, byte-identical |
| `SUPABASE_DB_URL=…:54422 pnpm --dir … db:generate` → `git diff --exit-code -- packages/supabase/src/database.types.ts` | **exit 0** (after dropping my own probe functions — NOTE 9) |
| `pnpm --dir … --filter @patina/supabase type-check` | exit **0** |
| `pnpm --dir … --filter @patina/designer-portal type-check` | exit **0** |
| `pnpm --dir … --filter @patina/admin-portal build` | exit **0** |
| *beyond the brief:* `pnpm --filter @patina/supabase test` | **101 files / 1251 passed**, 12 skipped |
| *beyond the brief:* `pnpm --filter @patina/designer-portal test -- …use-time-tracking-authority.test.tsx` | **3 / 3 passed** |

---

## Done-when, SQL-probed through RLS as the roles the tests name

| # | claim | result |
|---|---|---|
| 1 | `commercial` green unchanged; `billing` + `rls` green | **PASS** (the six commercial reds are pre-existing and documented — NOTE 6) |
| 2 | `INSERT … (hourly_rate_cents) VALUES (99999)` as `authenticated` on a non-services project stores the resolver's value | **PASS** — stored `15000 / studio_member / 30000 / authorized`, with `change_order_terms.hourly_rate_cents = 17500` on the project proving the legacy leg is cut |
| 3 | a rate typed on the studio surface appears on the next entry with `rate_source='studio_member'` | **DB half PASS** (the owner's 15000, written through RLS as the owner, priced the member's next entry); render half unverifiable — lane B absent |
| 4 | a new hire's services entry carries non-NULL rate + amount and `pending_authorization`, and is **not** promotable | **PASS via the suite** — cases (c)/(c4) green, (c4) asserting 0 promotable rows with a message naming HT-6-b |
| 5 | a two-role member's row records the role she picked | **DB half PASS via the suite** (cases (e)/(f)/(g)); see W1-R12-06 for the single-card fallback where the stamped role did not price the hour. Printed half unverifiable — lane B absent |
| — | §0.8 immutability on a classified row | **PASS** — `rate_source` and `hourly_rate_cents` UPDATEs both `23514` |
| — | the resolver is unreachable as an RPC | **PASS** — `42501 permission denied for function resolve_time_rate_cents` as `authenticated` |
| — | **HT-3-b delivers the employer tier on the path that creates real projects — ONE employer** | **PASS** — case (ae) green, and independently re-measured through `public.sign_proposal`: stamp `S`, hire `20000/40000`, assistant `12000/24000` |
| — | **HT-3-b delivers `'none'` for an AMBIGUOUS tier on that same path** | **FAIL** — W1-R12-01: `99900 / studio_member / 199800 / authorized` and `$1,998.00`, against three controls at `12000 / 24000` |

---

## Commit hygiene

17 commits, Conventional Commits throughout, explicit pathspecs only. `git show --stat` on
every commit shows no stray file: no `.env*`, no `supabase/config.toml` (still `S` in
`git ls-files -v` and present in **zero** commits), no artifacts, no lockfile churn —
verified by grepping the whole branch's `--name-only` log. 17 files total, all under
`packages/supabase`, `apps/designer-portal/src/hooks/__tests__`, `supabase/migrations`,
`supabase/seed` and `supabase/tests`. The GRANT/REVOKE-bearing commits carry the
regenerated `supabase/seed/00-legacy-grants.sql`, byte-identical after a fresh
regeneration at HEAD. This round's single commit (`a0f5ed0ac`) touches `00603`, the grants
seed and two test files. The tracked worktree is clean. Nothing was run in the main
checkout; every git and pnpm invocation used `-C` / `--dir` against the worktree.
`rulings.md` is edited in the main checkout only (untracked on this branch), as the fix
pass states.

## Not verified

- **Nothing on Strata** — no `db push`, no prod probe. Not sized: how many live projects
  have a lead designer with **two or more** active non-guest non-owner seats (W1-R12-01's
  population), nor how many of those seats were written by somebody other than the studio
  that employs her.
- **Lane B** — every portal file in plan-v2 §2 below the first two is still absent (phase 2),
  so Done-when #3's render half and #5's printed half remain unverifiable.
- **Concurrency** — no two-session race between a seat INSERT and a project INSERT (which
  under HT-3-b decides between "exactly one" and "ambiguous", and under `00603` between
  "override" and "leave the bridge in charge"), and none on
  `close_prior_studio_member_rate` against `uniq_studio_member_rates_open`.
- **`00601`'s retainer / ceiling arms** — exercised only by the six `commercial` files that
  abort pre-authority.
- **Designer-portal `lint`** and the full `pnpm --filter @patina/designer-portal test` were
  not run (outside the brief's gate list; the one touched designer-portal spec was run and
  is green).
- **`00563`'s other ORDER BY keys** — the sibling-project preference was not exercised as
  an attack surface; only `joined_at` (and, by inspection, `created_at`, which is
  `NOT NULL DEFAULT now()` and therefore also caller-suppliable) were measured.
