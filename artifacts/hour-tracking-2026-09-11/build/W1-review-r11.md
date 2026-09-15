# W1 — adversarial review, round 11

**clean = false**

Two MAJOR findings, both NEW and both measured this round, both about the same ruled
sentence: **HT-3-b's employer tier does not decide what it was ruled to decide.**

* **W1-R11-01** — the **member being priced** can make her own number the answer. One
  consent-free seat she writes herself, through RLS, with no second account: her hour on
  her principal's client project comes back `99900 / studio_member / 199800 / authorized`
  and `project_unbilled_time` reports **$1,998.00**. HT-3-b's ruled text says the opposite
  in so many words ("a member can only push the outcome toward 'none', never toward a
  number she set"), and case (ad)'s own banner asserts that the sentence "holds for the
  member being priced". Measured 1/1 with a negative control, twice (stamped path and
  legacy NULL path).
* **W1-R11-02** — on the **live proposal-activation path** the column HT-3-a step 1 reads
  is filled by `set_project_studio_id`'s ambiguity bridge, whose order is
  `(membership.role = 'owner') DESC`. So a hire who owns the workspace `00295` provisioned
  at her designer grant has her client project stamped with **that workspace**, `00602`
  never fires, and **W1-R8-01 arms A and B are both alive**: her own hour `99900 /
  studio_member / 199800 / authorized`, her assistant's `none / $0` while his employer
  priced him at 12000. Measured 1/1 end to end through `public.sign_proposal`. Case (aa)
  cannot see this — it creates its projects **as postgres**, which is the one context
  `00602` governs.

Neither is charged to a missing ruling: HT-3-b is RULED and these contradict it.
**W1-R10-03** (the two wide SELECT policies that expose the per-person rate) was
re-confirmed from `pg_policies` and remains W2's `00606` — **not charged to lane A**, still
a hard precondition on the single deploy.

**Reviewed** `hour-tracking/server` @ `0339b877e` (worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-server`), 16 commits / 16 files /
+7249 −11 against `origin/hour-tracking/integration` (head `00597`). Scope: **lane A DB
only**; lane B is phase 2 and is not counted. Every migration read line by line; every
probe writes through RLS as the actor named, inside a transaction that is rolled back.
Rulings in force this round: HT-3-a, HT-3-b, HT-3-c(a). A designer who NAMED her own
studio pricing from it is **not** treated as a defect (HT-3-c, case (ac)).

---

## Discharge of round 10's findings

| r10 finding | r10 severity | disposition verified this round |
|---|---|---|
| **W1-R10-01** — step 1 reads a caller-supplied column, nothing pinned it | MAJOR | **DISCHARGED.** Case **(ac)** landed: the project INSERT runs through RLS as a plain-`member` designer naming the workspace she owns, with LEG1 (NULL aim refused by 00563) and LEG3 (aimed at the employer → 20000/40000) controls in the same fixture; the failure messages name HT-3-c and the values arm (b) would take. The "trustworthy as a pricing key" sentences are retracted in `00599`'s banner + step-1 comment and in `00602`'s banner. **Residue:** the same claim survives in a third place — see W1-R11-03. |
| **W1-R10-02** — date-blind rate-preference key (4 rounds open) | MAJOR | **DISSOLVED, correctly.** `ORDER BY EXISTS (… studio_member_rates …)` and the `owner_seat.created_at` tiebreak are gone from both bodies. Verified by reading both and by four new postconditions: exactly two `ORDER BY` clauses in `00599`, no `ORDER BY … EXISTS`, no `priced.` alias, `public.studio_member_rates` read exactly once, no qualified `*.created_at`; `00602` carries "no `ORDER BY` at all" and "no `studio_member_rates` read at all". |
| **W1-R10-03** — the per-person rate is readable by every studio co-member | MAJOR (W2's) | **STILL OPEN, not ours.** Re-read live: `Team can view their project time entries` = `is_project_team_member(project_id)`; `time_entries_studio_read` = `is_studio_comember(p.designer_id)` — neither carries a `user_id` leg. Unchanged by this pass. |
| **W1-R10-04** — case (z)'s false justification | MINOR | **PARTLY FIXED.** The parenthetical now reads "the shape a direct PostgREST insert may carry; see HT-3-c and case (ac)" with the measured `useCreateProject` facts. But the two lines above it still carry the retracted premise → W1-R11-03. |
| W1-R10-05 … W1-R10-12 | MINOR | **all carried unchanged** and each re-verified in place this round (see findings W1-R11-04 … W1-R11-11). `git show --stat` on the two commits of this pass is `00599`, `00602`, `time_rate_resolution_test.sql` only, so every region they name is byte-identical. |
| NOTEs 1–8 | — | carried; NOTE 1 re-measured open (privileges table below), NOTE 7 re-confirmed (16/16 with a relative `-k`). |

---

## Findings

### W1-R11-01 · MAJOR (blocker-class) · confidence HIGH (measured 1/1 on two surfaces, with a negative control in the same fixture) · the MEMBER BEING PRICED can move her own resolved rate to a number she set — HT-3-b's central claim is false as built, and case (ad) records the opposite

**Where.** `00599:299-334` (step 2's employer tier) and `00602:140-173` (the identical
stamp). The two bodies are correct against the ruling's letter; the defect is in the
ruling's stated *property*, which the shipped design does not have, and which the test
file and `rulings.md` both assert that it does:

* `time_rate_resolution_test.sql:3440-3443` — *"HT-3-b's own text says a member 'can only
  push the outcome toward none, never toward a number she set', and for the MEMBER BEING
  PRICED that is what cases (x) and (aa8) measure. **This case measures the other actor,
  and the sentence does not cover it.**"*
* `rulings.md` HT-3-b ruling cell — *"HT-3-b's sentence … holds for the member being
  priced (cases (x), (aa8)); it does not cover a third party aimed at a designer with no
  employer seat."*

**The member being priced can BE that third party.** She needs exactly what an ordinary
designer signup already gives her: an organization she owns. `00295`'s
`fc_provision_studio_on_designer` hands one to every `is_designer` profile whose designer
grant precedes any membership row — the default self-signup order, and the same
precondition cases (aa), (ac) and (ad) each assert for somebody else.

**Measured** (`probe_r11d.sql` / `probe_r11e.sql`, every write through RLS as the actor
named, rolled back). Studio S; its principal seated first then granted `studio_owner`, so
she owns S and holds **no** employer seat — the shape `rulings.md` itself names as "every
studio principal". The hire is an ordinary designer signup (so she owns workspace `W`)
seated a plain **`member`** of S, and priced **20000** by the principal in S on HT-3's own
surface:

```
CONTROL (no manoeuvre, legacy or stamped alike)
  her hour on the principal's project        → rate=20000 src=studio_member amount=40000   ($400.00)

THE MANOEUVRE — two statements, both hers, both through RLS, nothing forged
  INSERT organization_members(principal, W, 'member','active')   → ALLOWED
        (`Org owners can insert members`: is_org_admin_or_owner(W) AND role <> 'owner';
         nothing about the invitee, no consent, no invitation)
  INSERT studio_member_rates(W, herself, 99900)                  → ALLOWED
        (studio_member_rates_admin_insert: 00295 made her W's owner)

SURFACE 1 — the principal's next project, created in a NULL-studio context
  00602 stamp                               → W        (her ONE employer tier is now W)
  her hour on it                            → rate=99900 src=studio_member amount=199800 state=authorized
  project_unbilled_time                     → resolved=99900 amount=199800   ($1,998.00)

SURFACE 2 — a LEGACY project (studio_id genuinely NULL: the pre-00563 Strata population)
  00599 step 2 itself, no stamp involved    → rate=99900 src=studio_member amount=199800
  project_unbilled_time                     → resolved=99900 amount=199800   ($1,998.00)
```

This is the identical `$1,998.00` rounds 3–8 each reported closed, reached by the one actor
HT-3-b was chosen in order to exclude. It is an `authorized` `studio_member` row
indistinguishable from a legitimate one, so it is not a `'none'` row W2's composer can
filter, and `claim_time_entries` will invoice-lock it.

**Why (ad) does not pin it.** (ad)'s seater is a third `stranger` account
(`…d003`); its asserts are about a principal's **assistant** being priced by a stranger.
Delete the stranger and the same door opens under the hand of the subject herself — and the
sentence the file and the ruling both rely on ("holds for the member being priced") is what
breaks. Cases (x) and (aa8) cannot catch it: (x)'s puppet is a *second account's* workspace
and (aa8)'s second seat only makes the tier **ambiguous** (two employers → `'none'`),
whereas here the designer's employer tier goes from **empty to exactly one**, which is the
one transition that produces a number instead of `'none'`.

**Exposure on Strata.** Surface 2 needs no project creation at all — every legacy
`studio_id IS NULL` project of a principal who holds no employer seat is live today.
Surface 1 needs a NULL-studio creation context (seed / migration / service, per `00602`'s
own NOTE-5 analysis). The authenticated direct-INSERT path is *not* a surface: with two
candidates `00563` raises (the pre-existing W1-R8-12 denial-of-service).

**Exact fix.**
1. **Required this round, whichever way it is ruled:** add a leg to case **(ad)** in which
   the seater **is** the member being priced (fixture above: principal with no employer
   seat, subject an ordinary designer signup seated a plain `member`), asserting today's
   `99900 / studio_member / 199800 / authorized` plus the `project_unbilled_time` pair on
   **both** surfaces, with the failure messages naming HT-3-b arm (c) and the `20000 /
   40000` the assert takes when it lands. Then **correct the two places that state the
   false property**: `time_rate_resolution_test.sql:3440-3443` and HT-3-b's ruling cell in
   `rulings.md` — the sentence must read that a member can push the outcome toward
   `'none'` **or, when the project's designer holds no employer seat, toward a number the
   member set in an organization she owns.**
2. **The closure is HT-3-b arm (c)** (seats land `status = 'invited'`; only the named user
   activates her own seat), which is **already OWED** — so no new ruling is needed to
   record this, only to close it. The code-only narrowings are the ones rounds 5 and 6
   rated blocker-grade, and "read the owned tier first" restores W1-R8-01; I found no
   fourth option that does not key on the member being priced (which HT-3-a forbids).
   Do **not** patch it in a fix round.

---

### W1-R11-02 · MAJOR (blocker-class) · confidence HIGH (measured 1/1 end to end through `public.sign_proposal`) · on the live proposal-activation path the stamp is the designer's OWNED workspace, not her employer — so HT-3-b is inert where real projects are created, and W1-R8-01 arms A and B are both still live

**Where.** `00599:299-334` + `00602:136-173` are reachable **only** when
`projects.studio_id` is NULL at their fire time. On every live creation path the column is
filled earlier, by `set_project_studio_id` (00317 → 00511 → **00563**), and that function
carries **its own, different** rule for the same question:

* one candidate studio → its discovery fills it (any role) — agrees with HT-3-b by
  accident;
* **more than one candidate, inside the activation bridge** → read live from
  `pg_get_functiondef`:
  `ORDER BY EXISTS (sibling project for this designer+client) DESC, (membership.role = 'owner') DESC, membership.joined_at NULLS LAST, membership.created_at, membership.organization_id`.
  **Owner first** — the exact preference HT-3-b was ruled to invert. A shipped test asserts
  that order (`supabase/tests/rls/00563_proposal_signing_multi_studio.test.sql:180-213`).
* `00602`'s trigger is named `zzz_…` so it fires **after** `set_project_studio_id` (on
  purpose, and correctly — firing first breaks 00563's fail-closed refusal), and its first
  statement is `IF NEW.studio_id IS NOT NULL … RETURN NEW`. So it never sees these rows.

**Measured** (`probe_r11a.sql`; the fixture is case (aa)'s, built from scratch; the signature
and every rate write go through RLS as the actor named; rolled back). Leah owns studio S.
Her hire is an ordinary designer signup (`00295` → workspace `W`) seated `admin` in S. Leah
prices the hire **20000** and the assistant **12000** in S; the hire prices herself **99900**
in W. Then **the client signs the proposal** — the ordinary way a project is created:

```
PRE   : hire owns W; 00563 candidate count = 2 → the ambiguity bridge decides
PRE   : the bridge's own ORDER BY would pick W
SIGN  : public.sign_proposal(...) as the client → status=accepted newly_signed=true project=f85adbe4…
LIVE  : projects.studio_id = W          ← the workspace she owns, NOT S
ARM A : her own client-billed hour   → rate=99900 src=studio_member amount=199800 state=authorized
ARM B : the assistant's hour         → rate=NULL  src=none          amount=NULL   state=authorized
VIEW  : project_unbilled_time        → hire resolved=99900 amount=199800  ($1,998.00)
                                      asst resolved=0     amount=0       ($0.00, employer priced him 12000)
```

Both arms of W1-R8-01 — the finding HT-3-b exists to close, on the program's own customer
shape, with no attacker, no manoeuvre and no extra signup — are **alive on the path that
creates real projects**. `00602`'s banner (`:85-95`) and case (aa)'s banner both state they
are "both gone"; case (aa1) asserts `studio_id = S`, but its project INSERT at
`time_rate_resolution_test.sql:2832` runs **as postgres**, i.e. in the one context
(`session_user = 'postgres'`, 00563's migration bypass) where `00563` leaves the column NULL
and `00602` therefore decides. The suite is green and the defect is untouched by it.

This is not HT-3-c. HT-3-c's ruled question is a project *whose designer NAMED* its
`studio_id`; here nobody named anything — a server rule chose, and chose against the ruling.

**Exact fix** (inside this program's own files; `00563` is not redefined —
`patina-db-migrations` step 2, and `00602`'s banner is right to refuse it):

1. Mint `00603` (reserved and free) with a companion `BEFORE INSERT FOR EACH ROW` trigger on
   `public.projects` named to sort **before** `set_project_studio_id`, whose whole body is
   `PERFORM set_config('app.project_studio_id_named', CASE WHEN NEW.studio_id IS NULL THEN '0' ELSE '1' END, true); RETURN NEW;`
   (BEFORE ROW triggers all fire for one row before the next, so the flag is per row).
2. In `set_project_studio_id_owned` (still last), when
   `current_setting('app.project_studio_id_named', true) = '0'` **and** the designer's
   employer tier holds exactly one candidate, set `NEW.studio_id` to that candidate —
   overriding a value `00563` derived, never one the caller named (HT-3-c stands untouched).
   Keep `00563`'s answer when the caller named the column, and keep it when the employer
   tier is empty or ambiguous, so no new `studio_id IS NULL` row is created behind
   `00563`'s fail-closed check.
3. Pin it with a case that creates the project through `public.sign_proposal` (the probe
   above is a ready fixture), asserting `studio_id = S`, `20000 / 40000` for the hire and
   `12000 / 24000` for the assistant — and add `00602`'s existing tier postconditions to the
   new body.
4. **One sub-question for the orchestrator, stated rather than inferred:** HT-3-b says an
   ambiguous tier is `'none'`, but on the activation path `'none'` is unreachable without
   either leaving `studio_id` NULL (which `00563`'s fail-closed check forbids for
   authenticated callers) or refusing the signature. Step 2 (a) above deliberately leaves
   `00563`'s answer standing in the ambiguous case. If HT-3-b's "more than one is 'none'"
   is meant to bind the activation bridge too, that **is** an edit to the signing ceremony
   and needs saying out loud.

---

### W1-R11-03 · MINOR · confidence HIGH (code-read) · the retracted "trustworthy as a pricing key" claim survives in a third place — case (z)'s comment, which is the one a later reader of the test file will lean on

`supabase/tests/billing/time_rate_resolution_test.sql:2616-2618`: *"This is what makes
00317's anti-aiming guard **load-bearing for pricing** (00317:31-47, head 00563), and why
the column stays banned as an RLS POLICY key."* That is the same sentence W1-R10-01 measured
false and the fix pass retracted in `00599`'s banner, `00599`'s step-1 comment and `00602`'s
banner. Case (z)'s own fixture is now the counter-example: it names a studio whose rate
differs from the fallback's.

**Exact fix:** replace with the retraction's wording — the guard **bounds** the column to
studios the lead designer actively belongs to (`role <> 'guest'`) and does not choose among
them; what makes step 1 final is **HT-3-c arm (a)** — and cross-reference case (ac).

### W1-R11-04 · MINOR · carried unchanged (r10 W1-R10-05) · a scheduled future raise makes that day's rate uncorrectable, and the future row cannot be withdrawn

`00598:197-212`, `:242-245`, `use-studio-member-rates.ts:100-111` — all three regions
byte-identical this round. Re-derived from the shipped bodies: a future row closes the
open row at `effective_from - 1`; if that open row's `effective_from` is **today**, the
blur-save's upsert on `(studio_id, user_id, effective_from)` then targets a **closed** row
and `guard_studio_member_rate_history` raises *"a closed studio member rate row is history"*.
There is no DELETE policy and `effective_from`/`effective_to` are frozen, so the future row
cannot be withdrawn either. No test exercises a future `effective_from` at all.
**Fix as r10 stated:** either target the row **covering** today in `useSetStudioMemberRate`,
or rule that a future-dated row may be withdrawn by its author while
`effective_from > CURRENT_DATE` (one arm in the guard + a DELETE policy restricted to that
predicate, which also closes W1-R8-10).

### W1-R11-05 · MINOR · carried unchanged (r10 W1-R10-06) · delta 4 stamps a `rate_role` that did not price the hour

`00601:262-264` assigns `v_rate_role`; `00599:470` and `:490` — the role-matched return and
the **single-card fallback** — both hand back `v_role` (the member's own pick) while a card
of a different `role_name` supplies the cents. Done-when #5 is satisfied in the one way
`00601:255-261`'s own rationale forbids. **Fix:** return the card's normalized `role_name`,
or `NULL`, on the fallback return; add the fixture as a case.

### W1-R11-06 · MINOR · carried unchanged (r10 W1-R10-07) · a pre-`00600` BOUND row's NULL provenance is relabelled `'authority'` by an ordinary duration correction

`00601:476` (`NEW.rate_source := 'authority';`) sits outside both the `v_is_bound` handling
(`:470-474`) and delta 5's preservation block (`:278-284`), while `00600`'s own column
comment defines NULL as "a row written before 00600". **Fix:** stamp `'authority'` only when
`v_is_bound` is false **or** `OLD.rate_source IS NOT NULL`; add a bound-legacy-row case.

### W1-R11-07 · MINOR · carried unchanged (r10 W1-R10-08) · `00598` still justifies its `created_by` actor-check by a key `00599` now REFUSES by name

`00598:71-86`, `:277-295`, `:450` call `created_by` *"00599's arm's-length key"*;
`00599:681-683` raises if `arms_length` reappears. **Fix:** keep the check (it is right), and
restate its rationale as authorship provenance alone.

### W1-R11-08 · MINOR · carried unchanged (r10 W1-R10-09) · the member chooses among a studio's historical rates by choosing the date, and an UNBOUND row is silently re-priced when its date moves

`00599:507-511`; `00601:278-284`; `started_at` is in `aac_`'s watched list and
`useUpdateTimeEntry` accepts it. **Fix:** one line beside HT-13 ruling whether a date edit
re-prices an unbound row or keeps its snapshot; pin today's behaviour meanwhile.

### W1-R11-09 · MINOR · carried unchanged (r10 W1-R10-10, **6th round**) · `00598`'s trigger-ordering postcondition compares two string literals, while `00602` does the same check correctly

`00598:436`: `IF 'aaa_guard_studio_member_rate_insert_trg' >= 'close_prior_studio_member_rate_trg'`
is constant-folded. `00602:228` reads both `tgname`s from `pg_trigger` and compares the
values, and says so (W1-R7-07). The wave is internally inconsistent about its own idiom.
**Fix:** apply `00602`'s form in `00598`.

### W1-R11-10 · MINOR · carried unchanged (r10 W1-R10-11) · `00598`'s W1-R7-03 postconditions are whitespace-sensitive

`00598:456-457`, `:460-461` match `'NEW\.effective_to   IS DISTINCT FROM OLD\.effective_to'`
with three literal spaces against `pg_get_functiondef` output (the body at `:271` happens to
carry three). Any reformat fails the replay with a message about a protection that is in
fact present. **Fix:** `\s+` between the tokens.

### W1-R11-11 · MINOR · carried unchanged (r10 W1-R10-12) · the invoiced-entry lock's frozen list does not carry W1's new derived columns

Read live this round: `guard_invoiced_time_entry` freezes `project_id, phase_key, task_id,
user_id, started_at, duration_minutes, billable, hourly_rate_cents` and has **no** postgres
exemption — but not `rate_source`, `rate_role` (new) nor `rated_amount_cents`,
`billing_state` (pre-existing). No caller can reach them (`aab_` raises for every
non-postgres actor — measured), so the residue is that a future **postgres-context rail**
could rewrite an invoiced row's provenance and amount silently. §0.12 forbids touching the
lock, so this is an owed decision recorded beside HT-6-a/HT-6-b, not a fix-round edit.

### W1-R11-12 · MINOR · confidence HIGH (code-read) · the comment `00602` added to a shipped test now describes the pre-HT-3-b rule

`supabase/tests/rls/00563_proposal_signing_multi_studio.test.sql:118-125`: *"00602 … stamps
projects.studio_id at INSERT **from a studio the lead designer OWNS**"*. After HT-3-b the
stamp is employer-first and the owned tier is the fallback. **Fix:** one word — "from the
lead designer's one EMPLOYER studio, or her one OWNED studio when she has no employer".

---

## NOTEs

1. **`service_role` still holds EXECUTE on `resolve_time_rate_cents`** (carried r9/r10).
   Measured this round: `PUBLIC=f anon=f authenticated=f service_role=t`, while
   `close_prior_studio_member_rate`, `set_project_studio_id_owned`,
   `guard_studio_member_rate_*` and `classify_project_time_entry_authority` are `f` for all
   four. `00599:564-574`'s postconditions assert only `anon` and `authenticated`. Inside a
   service_role call `auth.uid()` is NULL so all three asserts bypass — no escalation
   (service_role reads the table directly) but inconsistent with its own siblings. Fix: add
   `service_role` to the REVOKE and the postcondition, or say in the banner why it is kept.
2. **Plan-v2 §2 is stale in four places** (carried): it still shows
   `GRANT EXECUTE … TO authenticated` (shipped: REVOKEd, W1-R7-04) and still lists `00602`
   as UNUSED (shipped: the HT-3-a/HT-3-b stamp). Both deviations are ratified in-file; the
   plan is not. **Extended this round:** §0.20's own grep,
   `grep -lE '^\s*(GRANT|REVOKE)' supabase/migrations/006*.sql`, **cannot match `00595`–
   `00599`** — and `00598` carries four REVOKEs and two GRANTs, `00599` one REVOKE. The
   obligation is discharged at HEAD (regeneration is byte-identical, below) but the rule as
   written would let a later wave skip a regeneration it owes. Write the glob `00[56]*`.
3. **W1-R10-03 is the deploy's hard precondition**, re-confirmed from `pg_policies` (quals
   quoted above). W1 is the first wave to write a per-person rate onto
   `project_time_entries`; **W1 must not reach Strata ahead of `00606`.** Say it in the
   deploy chain, not only in a ruling.
4. **`00601` delta 1a's owner/admin exemption is dead on a NULL-`studio_id` project**
   (carried NOTE 6) — and HT-3-b **enlarges** that population, because an ambiguous tier now
   leaves the column NULL where round 8's ownership-only rule would have stamped something.
   No case exercises it.
5. **A project stamped with a foreign workspace makes that workspace's owner the exempt
   actor** in `00601` delta 1a (`is_org_admin_or_owner(projects.studio_id)`). In cases (ad)
   and W1-R11-01 that is the stranger / the subject. No new hole today — `project_time_entries`
   has no INSERT policy that admits a non-co-member, non-rostered actor — but the exemption
   is now pointing at somebody the studio never chose. Recorded, not charged.
6. **The `commercial` suite's six reds are pre-existing** and the brief's invocation omits
   `-k`: run from the worktree with a **relative** `-k supabase/tests/KNOWN_FAILURES.md` and
   it is **16/16, 0 unexpected** (re-measured, NOTE 7 of r10 confirmed). All six abort inside
   `_countersign_design_services_agreement_impl` before any authority-rate assert, which is
   why `time_rate_resolution_test.sql` is the classifier's only real gate.
7. **Lane B is absent** (phase 2): Done-when #3's live-mode render half and Done-when #5's
   *printed* role stay unverifiable. Both DB halves are verified below.
8. **`00602` changed a shipped test's fixture**, not a shipped behaviour (carried r10 NOTE 4);
   documented honestly in the test and the banner, wording now stale (W1-R11-12).

---

## Hypotheses tested and REFUTED this round (so round 12 does not re-spend them)

- **Can the member being priced influence step 2 through a key in the query itself?** No.
  Both tiers read only `v_designer_id` / `NEW.designer_id` seats plus `organizations.type`
  and `.status`, and `guard_organization_admin_columns` freezes `type` and `status` against
  an org admin. Flipping either can only *remove* a candidate, i.e. push toward the
  legitimate studio or toward `'none'`. The only lever is the seat INSERT (W1-R11-01).
- **Can she deactivate a seat to break a tie in her favour?** Only toward `'none'` or toward
  the remaining (legitimate) candidate; the same direction as above.
- **Does the seat manoeuvre move an already-stamped project?** No. `00602` is INSERT-only
  (postcondition on `tgtype & 16`), `set_project_studio_id` raises on an authenticated
  `studio_id` UPDATE, and step 1 reads the stored column — which is why W1-R11-01 needs
  either a legacy NULL row or a project created after the seat.
- **Does the stamp fire on `UPDATE … SET studio_id = NULL` as postgres?** No — but
  `set_project_studio_id`'s **discovery** re-fills it when the designer has exactly one
  candidate, which is worth knowing before writing a legacy-shaped fixture.
- **Can a plain member reach `resolve_time_rate_cents` as an RPC?** No —
  `42501 permission denied for function resolve_time_rate_cents` (measured as `authenticated`).
- **Does `00600`'s INSERT branch refuse `rate_source` / `rated_amount_cents`?** Yes, `23514`
  for both (measured); `hourly_rate_cents` and `billing_state` are discarded as §0.7(c) ratifies.
- **Is the 00484 quartet intact?** Yes — all four read live with their registered quals, and
  no new policy was added to `project_time_entries` or `projects`.

---

## Program-rule compliance (each checked, not assumed)

| rule | verdict | evidence |
|---|---|---|
| §0.1 additive to `project_time_entries` | PASS | two `ADD COLUMN IF NOT EXISTS`; one new table; no new hours surface |
| §0.2 hand-numbered, no collision | PASS | `00598`–`00602`; integration head `00597`; `00603` free and absent |
| §0.3 banner / idempotent / RLS in the same file | PASS | all five carry banners + lineage; `ENABLE ROW LEVEL SECURITY` + 3 policies inside `00598` |
| §0.4 redefine from the grep winner | PASS | `00600` grafts the guard from `00412`; `00601` grafts the classifier from `00578`, lineage `00412 → 00575 → 00578 → 00601`, four postconditions pin 00578/00575's invariants by raise text |
| §0.5 no flags | PASS | zero `useFeatureFlag` / posthog / `ComingSoon` in the whole diff (grep) |
| §0.6 / P-4 no backfill | PASS | the only DML in the five files is the close-ladder `UPDATE` **inside** `00598`'s trigger function; `00602` is BEFORE INSERT with a postcondition refusing an UPDATE event |
| §0.7 client rate discarded, every kind | PASS | measured: `99999` on a non-services project carrying `change_order_terms.hourly_rate_cents = 17500` stored as **15000 / studio_member / 30000 / authorized** |
| §0.7c two refusals + two discards | PASS | `rate_source`, `rated_amount_cents` → `23514`; `hourly_rate_cents`, `billing_state` silently replaced |
| §0.8 guard list in BOTH places | PASS | `aab_` is `BEFORE UPDATE OF … rate_source, rate_role` and the chain carries both; `aac_` carries `rate_role`; three postconditions in `00600` |
| §0.9 / §0.10 rollup INVOKER, no notes | N/A | W1 adds no rollup; `notes` appears in no return shape in the diff |
| §0.11 one running-timer slot | PASS | `uniq_project_time_entries_running_timer ON (user_id) WHERE duration_minutes IS NULL` read live, unchanged; no migration names it |
| §0.12 invoiced lock untouched | PASS (with W1-R11-11) | body read live, identical; `00600` postcondition asserts it is still installed |
| §0.13 no RLS policy keyed on `projects.studio_id` | PASS | no new policy on `project_time_entries` / `projects`; `studio_member_rates`' three key on its **own** `studio_id` via `is_org_admin_or_owner`. (`00601` delta 1a and `00599` read the column in trigger/function bodies, which §0.13 permits.) |
| §0.14 only `is_org_admin_or_owner` | PASS | zero new `user_is_org_member` call sites |
| §0.15 `organization_members.role` of type `member_role` | PASS | `designer_seat.role <> 'guest'`, `<> 'owner'`, `= 'owner'` |
| §0.16 / 00484 DEFINER contract | PASS (NOTE 1) | all four DEFINERs pin `search_path = public, pg_temp`; `PUBLIC/anon/authenticated` revoked on every one; `extensions.gen_random_uuid()` and `pg_catalog.pg_trigger_depth()` schema-qualified |
| §0.17 the 00484 quartet immutable | PASS | all four read live with their registered quals; `00484`'s assert replayed clean |
| §0.19 / §0.20 generated files | PASS | both regenerate to an empty diff (below); see NOTE 2 on the rule's own glob |
| §0.21 hook names | PASS | new module only; no rename, no default export |
| §0.22 zero-tap path | PASS | `rateRole?` optional; no required field added to `CreateTimeEntryInput`, pinned by the new jest case |

**Plan items, signature-exact:** `00598`'s table (columns, `UNIQUE (studio_id, user_id,
effective_from)`, `CHECK (hourly_rate_cents > 0)`), the three policy **names**
(`studio_member_rates_read_self_or_admin`, `_admin_insert`, `_admin_update`), the asserted
`count(*) = 3` and no DELETE policy; `00599`'s
`(uuid, uuid, timestamptz, text) RETURNS TABLE (cents integer, source text, role text)`,
`STABLE`, `SECURITY DEFINER` — **one ratified deviation**: `authenticated` is REVOKEd, not
GRANTed (W1-R7-04; plan stale, NOTE 2); `00600`'s two columns with their exact CHECK sets
(read from `pg_constraint`); `00601`'s five deltas plus delta 1a; `00602` repurposed per
HT-3-a/HT-3-b (plan stale, NOTE 2); `00603` unused and absent.

---

## Gates re-run (this reviewer, clean stack, project `patina-hours`, `127.0.0.1:54422`)

| command | result |
|---|---|
| `npx supabase db reset --workdir …/agent-server` | **clean**, exit 0 — `00598`…`00602` applied, every postcondition replayed, 27 seeds loaded, `Finished supabase db reset` |
| `run-sql-tests.sh -d …/supabase/tests/billing -H 127.0.0.1 -p 54422` | **6 / 6 green**, 0 unexpected |
| `run-sql-tests.sh -d …/supabase/tests/commercial -H 127.0.0.1 -p 54422` | 10 green / **6 unexpected-fail as the brief invokes it**; from the worktree with relative `-k supabase/tests/KNOWN_FAILURES.md` → **16 / 16, 0 unexpected** (NOTE 6) |
| `run-sql-tests.sh -d …/supabase/tests/rls -f time_entry -H … -p 54422` | **1 / 1 green** |
| `run-sql-tests.sh -d …/supabase/tests/billing -f rate -H … -p 54422` | **1 / 1 green** — `time_rate_resolution_test.sql`, cases (a)–(ad) |
| `run-sql-tests.sh -d …/supabase/tests/rls -f studio_member_rates -H … -p 54422` | **1 / 1 green** |
| *beyond the brief:* whole `rls` directory with relative `-k` | **26 / 26** (24 green + 2 documented pre-existing) — includes `00563_proposal_signing_multi_studio.test.sql` |
| `python3 …/scripts/generate-legacy-grants.py` → `git status --porcelain -- supabase/seed/00-legacy-grants.sql` | **empty** (baseline + 2610 replayed statements, byte-identical); the seed carries `00598`'s statements under its own comment |
| `SUPABASE_DB_URL=…:54422 pnpm --dir … db:generate` → `git diff --exit-code -- packages/supabase/src/database.types.ts` | **exit 0** |
| `pnpm --dir … --filter @patina/supabase type-check` | exit **0** |
| `pnpm --dir … --filter @patina/designer-portal type-check` | exit **0** |
| `pnpm --dir … --filter @patina/admin-portal build` | exit **0** |

---

## Done-when, SQL-probed through RLS as the roles the tests name

| # | claim | result |
|---|---|---|
| 1 | `commercial` green unchanged; `billing` + `rls` green | **PASS** (the six commercial reds are pre-existing and documented — NOTE 6) |
| 2 | `INSERT … (hourly_rate_cents) VALUES (99999)` as `authenticated` on a non-services project stores the resolver's value | **PASS** — stored `15000 / studio_member / 30000 / authorized`, with `change_order_terms.hourly_rate_cents = 17500` on the project proving the legacy leg is cut |
| 3 | a rate typed on the studio surface appears on the next entry with `rate_source='studio_member'` | **DB half PASS** (the owner's 15000, written through RLS, priced the member's next entry); render half unverifiable — lane B absent |
| 4 | a new hire's services entry carries non-NULL rate + amount and `pending_authorization`, and is **not** promotable | **PASS via the suite** — cases (c)/(c4) green, (c4) asserting 0 promotable rows with a message naming HT-6-b |
| 5 | a two-role member's row records the role she picked | **DB half PASS via the suite** (cases (e)/(f)/(g)); see W1-R11-05 for the fallback where the stamped role did not price the hour. Printed half unverifiable — lane B absent |
| — | §0.8 immutability on a classified row | **PASS** — `rate_source`, `rate_role`, `hourly_rate_cents` UPDATEs all `23514` |
| — | the resolver is unreachable as an RPC | **PASS** — `42501 permission denied for function resolve_time_rate_cents` as `authenticated` |
| — | **HT-3-b delivers the employer tier on the paths that create projects** | **FAIL** — W1-R11-02 (activation bridge), and W1-R11-01 for the property the ruling rests on |

---

## Commit hygiene

16 commits, Conventional Commits throughout, explicit pathspecs only. `git show --stat` on
every commit shows no stray file: no `.env*`, no `supabase/config.toml` (still `S` in
`git ls-files -v` and in **zero** commits), no artifacts, no lockfile churn. The
GRANT/REVOKE-bearing commits carry the regenerated `supabase/seed/00-legacy-grants.sql`, and
the seed is byte-identical after a fresh regeneration at HEAD. This round's two commits
touch only `00599`, `00602` and `time_rate_resolution_test.sql`. Nothing was run in the main
checkout; every git and pnpm invocation used `-C` / `--dir` against the worktree.

## Not verified

- **Nothing on Strata** — no `db push`, no prod probe. Not sized: how many live projects
  have a lead designer who is not their studio's owner **and** owns a `00295` workspace
  (W1-R11-02's population), nor how many legacy `studio_id IS NULL` projects belong to a
  principal with no employer seat (W1-R11-01 surface 2).
- **Lane B** — every portal file in plan-v2 §2 below the first two is still absent (phase 2).
- **Concurrency** — no two-session race between a seat INSERT and a project INSERT (which
  under HT-3-b decides between "exactly one" and "ambiguous"), and none on
  `close_prior_studio_member_rate` against `uniq_studio_member_rates_open`.
- **`00601`'s retainer / ceiling arms** — exercised only by the six `commercial` files that
  abort pre-authority.
- **Designer-portal lint** and `pnpm --filter @patina/designer-portal test` were not run
  (outside the brief's gate list; the diff touches one designer-portal test file only).
