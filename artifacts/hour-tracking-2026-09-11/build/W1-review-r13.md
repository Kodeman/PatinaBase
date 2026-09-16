# W1 — adversarial review, round 13

**clean = true**

Zero blocker/major. Round 12's single MAJOR (**W1-R12-01**) is **DISCHARGED exactly as
that review prescribed** — pinned by a new live-path case, the three false statements
corrected in all five places they stood, `00603`'s ambiguous arm deliberately NOT patched —
and the residue it names is an **owed ruling** (HT-3-b arm (c), already on the table, or a
ruling that an ambiguous employer tier must fail closed on the activation path), which the
severity discipline files as a note, never a major. Round 12's two MINOR items that were
item 2 of its own exact fix (**W1-R12-02**, **W1-R12-03**) are applied in full.

**Two new MINORs this round**, one measured and one code-read. Twelve r12 MINORs and eight
NOTEs carry unchanged.

**The loudest carried items the orchestrator must settle before the single deploy** — both
recorded, neither a lane-A defect:

1. **The W1-R12-01 exposure is still LIVE as built** (by design, pinned): on the activation
   path a member who seats the project's designer in a workspace she owns with a backdated
   `joined_at` prices her own hour at the number she set — `99900 / studio_member / 199800 /
   authorized`, `project_unbilled_time` `$1,998.00` — **even when the designer already holds
   a real employer seat.** Either closure (arm (c), or fail-closed activation) is a ruling.
2. **W1-R10-03 / NOTE 3** re-confirmed live from `pg_policies`: `Team can view their project
   time entries` = `is_project_team_member(project_id)` and `time_entries_studio_read` =
   `is_studio_comember(p.designer_id)`, **neither with a `user_id` leg**, while W1 is the
   first wave to write a per-person rate onto `project_time_entries`. **W1 must not reach
   Strata ahead of W2's `00606`.**

**Reviewed** `hour-tracking/server` @ `9e268065a` (= `origin/hour-tracking/server`, pushed;
worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-server`), **18 commits / 17
files / +8588 −32** against `origin/hour-tracking/integration` (`85f875907`, migration head
`00597`). Scope **lane A DB only**; lane B is phase 2 and is not counted. All six migrations
read line by line; `00601` diffed mechanically against its `00578` graft source; `00600`
diffed against `00412`. Every probe writes **through RLS as the actor named**, inside a
transaction that is rolled back. Rulings in force: HT-3-a, HT-3-b, HT-3-c(a), HT-10-a. A
designer who NAMED her own studio pricing from it is not a defect.

---

## Discharge of round 12's findings

| r12 finding | severity | disposition verified this round |
|---|---|---|
| **W1-R12-01** — an AMBIGUOUS employer tier is not `'none'` on the live activation path, so the member being priced prices herself even when the designer holds an employer seat | MAJOR | **DISCHARGED as prescribed, all three items.** (1) **Pinned** by new case **(af)** (`time_rate_resolution_test.sql:4059-4393`), read line by line: two signatures through `public.sign_proposal` as the CLIENT, the live-path control in the same fixture (`af1` stamp `S`, `af2` `12000 / studio_member / 24000 / authorized`, `af2b` view `12000 / 24000`) and the exploit (`af4` stamp `W_M`, `af5` `99900 / studio_member / 199800 / authorized`, `af5b` view `99900 / 199800`); preconditions `af0` (00295 gave the subject her workspace), `af0b` (the hire begins with **exactly one** employer seat), `af0c` (she owns nothing, so the owned tier and `(role='owner') DESC` cannot confound it), `af3a` (the seat landed **active** `member` — a tripwire for arm (c)), `af3b` (the manufactured `joined_at` is strictly earlier than the real employer seat), `af3c` (the tier now holds two), `af4a` (the signature still lands — a tripwire for the fail-closed closure). Every failure message names **HT-3-b arm (c)** *and* `00603`'s **OPEN SUB-QUESTION** and states the values each closure makes the assert take. Two clients, with the sibling-project key named as the reason. Green in my own run. (2) **The three statements corrected**: `00599:133-155` banner + `:307-317` step-2 comment (retracted, not repaired, with both measurements); `rulings.md` HT-3-b ruling cell (both sentences + the "(x)/(aa8): two employers → 'none'" scoping + the OPEN SUB-QUESTION paragraph); `(ad-i)` and `(ad-ii)` banners. (3) **`00603`'s ambiguous arm NOT patched** — body byte-identical; banner gained "THE OPEN SUB-QUESTION IS NOT COSMETIC" with the measured values, the bridge's remaining keys, the three controls, and why no code-only closure exists. **Residue:** the behaviour is live and is an owed ruling (see the header). |
| **W1-R12-02** — the retracted sentence still stood in `00599`'s banner and step-2 comment | MINOR | **APPLIED.** Both regions retracted in place with the property that does hold. |
| **W1-R12-03** — `00602:98-99` and `:104-108` assert the refuted claim | MINOR | **APPLIED.** `00603:116-128` retracts both **by line** with the measured values, beside the OPEN SUB-QUESTION. |
| W1-R12-04 … W1-R12-15 | MINOR | **all carried unchanged**, each re-located in place this round (line refs in the Carried table below). `git show --stat 9e268065a` is `00599`, `00603` and one test file only, so every other region is byte-identical to round 12. |
| NOTEs 1–8 | — | carried; NOTE 1 re-measured (`service_role` still `t`, everything else `f`), NOTE 3 re-measured live from `pg_policies`, NOTE 6 re-measured both ways. NOTE 9 was the r12 reviewer's own disclosed contamination and does not apply to this round. |

**Stale cite also fixed while there** (unasked, correct): `00563`'s fail-closed check is
`:326-346`, not `:352-362` — I read the live body and confirm `:326-346` is the
`v_active_role = 'authenticated'` qualification block and that `:352-362` is not it.

---

## New findings

### W1-R13-01 · MINOR (note — ruling owed) · confidence HIGH (measured 1/1 with a negative control in the same fixture) · a **W1-era** UNBOUND row is silently re-priced by an ordinary duration edit when the studio BACKDATES a rate row covering its `started_at` — the date did not move, the rate history moved under it, and nothing pins either way

**Where.** `supabase/migrations/00601_classifier_rate_resolver.sql:278-284` (delta 5's
preservation gate) together with `aac_classify_project_time_entry_authority_trg`'s watched
list (read from `pg_trigger`: `project_id, user_id, started_at, duration_minutes, billable,
billing_authority_id, authority_rate_id, hourly_rate_cents, rate_role`), four of which —
`user_id`, `started_at`, `duration_minutes`, `billable` — are **absent** from `aab_`'s list,
so an ordinary caller edit re-fires the classifier without the derived-field guard raising.

Delta 5 preserves a snapshot only when `v_rate_source = 'none' OR OLD.rate_source IS NULL`.
A **W1-era** row carries `rate_source = 'studio_member'`, so when the chain now answers a
*different* number the snapshot is replaced.

**Measured** (`/private/tmp/.../probe_r13c.sql`, every write through RLS as the actor named,
rolled back, stack `127.0.0.1:54422`):

```
fixture  owner O of studio S · lead designer D (admin of S) · member M (plain member of S)
         O prices M 15000 in S from CURRENT_DATE-30, through RLS

T0   M logs 120 min, started_at = NOW() - 10 days   → 15000 / studio_member / 30000
     O inserts a BACKDATED 20000 row from CURRENT_DATE-20 (covers T0), through RLS
     stored rate immediately afterwards              → 15000   (untouched, correct)

     M corrects the duration to 121 — the ONE edit useUpdateTimeEntry offers
     →  20000 / studio_member / 40333      ← RE-PRICED. $300.00 became $403.33.

NEGATIVE CONTROL, same fixture
T1   M logs 60 min at NOW() - 25 days (outside the 20000 span) → 15000
     billable off/on round trip                                → 15000 / studio_member / 15000
     (the chain answers the same number, so nothing moves — the lever is the
      backdated rate row, not the edit)
```

**Why it is new rather than W1-R12-09 or case (q).** W1-R12-09 names the lever as *"an
UNBOUND row is silently re-priced **when its date moves**"*. Here the date did not move.
Case **(q)** (`time_rate_resolution_test.sql:1392-1475`) pins the **pre-00600** arm only —
its row is written with the classifier disabled and carries `rate_source IS NULL`, which is
precisely the arm delta 5 *does* preserve; its q1/q4 asserts read `17500` because of that.
**No case in the suite exercises a W1-era row whose rate history changed underneath it.**
The consequence: two identical hours logged the same day by the same member can carry
different rates for ever, depending only on whether one of them happened to be edited after
a backdated correction — and §0.6/P-4 says "unbilled history keep their amounts".

**Not charged as a major.** It does not let a member move her own resolved rate to a number
**she** set (the 20000 is the owner's, written on HT-3's own surface through
`studio_member_rates_admin_insert`), and closing it needs a ruling, not code:
`00601:278-284`'s own comment already names the generic question — *"If HT-1 is ever ruled
to beat P-4 on an edit, flip the assert in case (q) and record the ruling beside HT-6-a — it
must not become the silent default again"* — but that sentence is about the pre-00600 arm,
does not say that a **W1-era** row IS re-priced today, and nothing pins it.

**Exact fix.** Add a case to `supabase/tests/billing/time_rate_resolution_test.sql` pinning
today's behaviour with the negative control above (the probe is a ready fixture), its failure
message stating the question and the value the assert takes if it is ruled the other way; and
one line beside HT-6-a/W1-R12-09 in `rulings.md` asking it: **does a W1-era unbound row keep
its rate snapshot across an incidental edit when the studio's rate history changed under it,
or does HT-1's "the server owns the rate" re-resolve it?** Restate W1-R12-09 so its lever is
"any `aac_`-watched column outside `aab_`'s list", not `started_at` alone.

---

### W1-R13-02 · MINOR · confidence HIGH (code-read) · new · the fixture comment added to `time_unbilled_view_repair_test.sql` justifies its NAMED `studio_id` by a key HT-3-b deleted two rounds earlier

**Where.** `supabase/tests/billing/time_unbilled_view_repair_test.sql:118-126`:

> *"…leaves her owning TWO studios whose owner seats carry the identical transaction
> timestamp, so **HT-3-a's "oldest owner membership" key** ties and the **studio.id
> determinism backstop** decides between a fixed uuid and a generated one."*

Neither object exists. Round 11 deleted every ordering key from `00599` step 2 and from the
stamp, and both files now carry postconditions that **refuse** `ORDER BY`, `joined_at` and
any qualified `created_at` by name (`00599:620-642`, `00602:284-296`, `00603:399-411`). Under
HT-3-b two owned candidates and no employer resolve to **NULL → `'none'`** — there is no tie
and no backstop.

The **action** the comment justifies is still right, for a different reason: without the
named `studio_id` the designer has two owned candidates, nothing is stamped, the chain reports
`'none'`, and the `live0` assert would read NULL rather than 12000. So this is a wrong
rationale on a correct line — the exact shape `patina-db-migrations` step 2 warns about, in a
file a future grafter reads for the fixture's intent.

**Exact fix.** Replace with: *"…leaves her owning TWO studios and holding no employer seat,
which under HT-3-b is an ambiguous tier — nothing is stamped, `00599` step 3 answers `'none'`,
and `live0` would read NULL. Naming the studio is HT-3-a step 1 and HT-3-c arm (a)."*

---

## Carried MINORs, each re-located in place this round

| id | where, verified this round | unchanged |
|---|---|---|
| W1-R12-04 | `time_rate_resolution_test.sql:2637` — "anti-aiming guard **load-bearing for pricing**", retracted everywhere else | yes |
| W1-R12-05 | `00598:197-212`, `:242-245`; `use-studio-member-rates.ts:100-111` (`effectiveFrom ?? todayISODate()`) — a scheduled future raise makes that day's rate uncorrectable and the future row cannot be withdrawn (no DELETE policy, dates frozen) | yes |
| W1-R12-06 | `00601:255-264` stamps `v_rate_role`; `00599:470` and `:490` (the single-card fallback) both return the member's own pick, so a card of another `role_name` can supply the cents | yes |
| W1-R12-07 | `00601:476` (`NEW.rate_source := 'authority';`) sits outside both the `v_is_bound` handling (`:470-474`) and delta 5's block (`:278-284`), so a pre-00600 BOUND row's NULL provenance is relabelled by a duration correction | yes |
| W1-R12-08 | `00598:78`, `:284-285`, `:450` still call `created_by` "00599's arm's-length key"; `00599:681-683` raises if `arms_length` reappears | yes |
| W1-R12-09 | `00599:507-511`; `00601:278-284`; `started_at` in `aac_`'s list (read from `pg_trigger`) — **see W1-R13-01: the lever is wider than the date** | yes |
| W1-R12-10 | `00598:436` — `IF 'aaa_guard_studio_member_rate_insert_trg' >= 'close_prior_studio_member_rate_trg' THEN`, two string literals, constant-folded; `00602:228` and `00603:319-326` both read the names from `pg_trigger` and say so | yes (8th round) |
| W1-R12-11 | `00598:456-461` match `'NEW\.effective_to   IS DISTINCT FROM OLD\.effective_to'` with three literal spaces against `pg_get_functiondef` output | yes |
| W1-R12-12 | `guard_invoiced_time_entry()` read live: freezes `project_id, phase_key, task_id, user_id, started_at, duration_minutes, billable, hourly_rate_cents` — **not** `rate_source`, `rate_role`, `rated_amount_cents`, `billing_state`. No caller can reach them (`aab_` raises `23514`, measured again); residue is a future postgres-context rail. §0.12 forbids touching the lock | yes |
| W1-R12-13 | `00563_proposal_signing_multi_studio.test.sql:129` — "stamps projects.studio_id at INSERT **from a studio the lead designer OWNS**" | yes |
| W1-R12-14 | same file `:185-214` — `v_expected` is computed from `pg_temp.candidate_studios()` by the rule under test (`:200` `v_expected := v_employers[1]`), so the assert can only catch a *third* answer | yes |
| W1-R12-15 | same file `:136` — `UPDATE public.projects SET studio_id = NULL` sits in the shared pre-savepoint fixture (`SAVEPOINT s_order` is `:181`), so sections 3-5 run against it too | yes |

---

## NOTEs

1. **`service_role` still holds EXECUTE on `resolve_time_rate_cents`** (carried r9–r12).
   Re-measured from `has_function_privilege`: `anon=f authenticated=f service_role=t`, while
   `close_prior_studio_member_rate`, `set_project_studio_id_owned`,
   `record_project_studio_id_named`, `guard_studio_member_rate_*`,
   `guard_commercial_time_entry_derived_fields` and
   `classify_project_time_entry_authority` are **`f` for all four**. Inside a service_role
   call `auth.uid()` is NULL so all three asserts bypass — no escalation (service_role reads
   the tables directly) but inconsistent with its own siblings, and `00599:564-574` asserts
   only `anon` and `authenticated`. Fix: add `service_role` to the REVOKE and the
   postcondition, or say in the banner why it is kept.
2. **Plan-v2 §2 is stale in five places** (carried): it still shows `GRANT EXECUTE … TO
   authenticated` (shipped: REVOKEd, W1-R7-04); it lists `00602` as UNUSED (shipped: the
   HT-3-a/HT-3-b stamp) and `00603` as UNUSED (shipped: the W1-R11-02 fix); §0.20's own grep
   `supabase/migrations/006*.sql` cannot match `00595`–`00599` — **re-verified this round:
   the correct glob `00[56]*` returns `00598, 00599, 00600, 00601, 00602, 00603` among
   others, and the seed does carry all six** (`00-legacy-grants.sql:15651-15721`); and W1's
   whole reserved range `00598–00603` is consumed, so a merge-time collision must bump a
   W2-or-later number. All code deviations are ratified in-file; the plan is not.
3. **W1-R10-03 is the deploy's hard precondition** (see the header). Say it in the deploy
   chain, not only in a ruling.
4. **`project_unbilled_time` returns `notes`** — column list unchanged, pre-existing
   (`00412`), untouched by W1, and not a rollup; §0.10 binds W2's rollup, so W2 must not
   inherit this shape by reading the view.
5. **`00601` delta 1a's owner/admin exemption is wider than "owner" and reaches `admin`, by
   design but worth stating.** A project designer who is an **`admin`** of
   `projects.studio_id` passes `is_org_admin_or_owner`, and her `Designers manage their
   project time entries` policy is `ALL` with a NULL `with_check` and **no `user_id` leg**
   (read from `pg_policies`), so she may INSERT an entry naming a colleague's `user_id` and
   the row carries that colleague's confidential studio rate. This is delta 1a's stated
   exemption ("An owner/admin of the studio that owns the work may still log on a member's
   behalf") and W2's `00606` read-narrowing does not close it, because she reads rows she
   created. Recorded, not charged. On a NULL-`studio_id` project the exemption is dead
   instead (carried NOTE 4/6).
6. **The `commercial` suite's six reds are pre-existing**, and the brief's invocation omits
   `-k`. Measured both ways this round: as the brief invokes it, **10 green / 6
   unexpected-fail**; from the worktree with `-k supabase/tests/KNOWN_FAILURES.md`, **16/16,
   0 unexpected**. `KNOWN_FAILURES.md` is **not** touched by this branch. All six abort inside
   `_countersign_design_services_agreement_impl` before any authority-rate assert (observed
   again in the tail output), which is why `time_rate_resolution_test.sql` is the classifier's
   only real gate.
7. **Lane B is absent** (phase 2): Done-when #3's live-mode render half and Done-when #5's
   *printed* role stay unverifiable. Both DB halves verified below.
8. **`00603` changed one shipped test's behaviour, in the open** —
   `00563_proposal_signing_multi_studio.test.sql` sections 2 and 3 (W1-R12-14/15). The whole
   `rls` directory is **26/26** (24 green + 2 documented pre-existing) including that file.

---

## Hypotheses tested and REFUTED this round (so round 14 does not re-spend them)

- **Can `projects.studio_id` — W1's pricing key — be re-aimed AFTER creation, bypassing
  `00603` entirely?** **No.** `projects_studio_update` is `USING/WITH CHECK
  is_studio_comember(designer_id)`, so any studio co-member may UPDATE the row; and
  `set_project_studio_id` is `BEFORE INSERT OR UPDATE OF id, studio_id, designer_id,
  client_id, proposal_id, created_by, created_at` (read from `pg_trigger`). But its
  authenticated arm (live body, `:54-76`) requires **`TG_OP = 'INSERT'`**, so every
  authenticated UPDATE of `studio_id` raises `studio_id_not_designer_studio`. **Measured**
  (`probe_r13a.sql`): in the (af) shape — designer `D` with exactly one employer seat in `S`,
  subject `M` owning `W_M`, `M` seats `D` in `W_M` — `M`'s `UPDATE projects SET studio_id =
  W_M` **RAISED**, with the control hour reading `12000 / studio_member / 24000` before it.
  Fail-closed.
- **Is there a SECURITY DEFINER rail that writes `projects.studio_id` on UPDATE** (which
  would reach `set_project_studio_id`'s permissive `current_user='postgres'` arm, admitted
  when the actor co-members with the designer in the target studio)? **No.** The ten
  functions that UPDATE `projects` were enumerated from the catalog; none writes `studio_id`
  (`reassign_project_lead` only reads it).
- **Can a plain member mint a `project_time_entries` row for somebody else** (and so read a
  colleague's rate off it)? **No.** Both INSERT policies carry `user_id = auth.uid()` (read
  from `pg_policies`); the only non-self path is the designer's `ALL` policy, and delta 1a
  gates that. NOTE 5's reasoning holds.
- **Is HT-41's role validation vacuous — can the member being priced grant herself the
  better-paying roster role?** **No.** `project_team_members` has no INSERT/UPDATE policy for
  a plain member (only `Lead designers manage team members`, the designer's `ALL`), and
  `00597`'s auto-roster hard-codes `support_designer` (`00597:141-143`).
- **Is there a DEFINER RPC an authenticated caller can reach that rewrites an entry's rate
  columns** (bypassing `aab_` because `current_user = 'postgres'`)? **No.** Only
  `_countersign_design_services_agreement_impl` and `_void_invoice_authorized_legacy_00397`
  are DEFINER and neither is EXECUTE-able by `authenticated`; `claim_time_entries` **is**
  granted to `authenticated` but is **SECURITY INVOKER** (`prosecdef = f`) and sets
  `invoice_id` only — and `invoice_id` is in neither `aab_`'s nor `aac_`'s watched list, so
  claiming does not re-price.
- **Is `00601` a faithful graft of `00578:2599-2820`?** **Yes** — diffed mechanically,
  comments stripped: the delta is **exactly** the three declarations plus deltas 1, 1a, 2, 4,
  5, the five branch assignments and `NEW.rate_source := 'authority'`. Every 00578 invariant
  is byte-present: the authority/rate immutability raise, the bound-provenance raise, the
  `FROM public.projects project WHERE project.id = NEW.project_id FOR UPDATE` lock, the
  superseded-ceiling read, retainer gating and 00575's F-2 nullable-ceiling delta.
- **Is `00600` a faithful graft of `00412:2344-2384`?** **Yes** — the only changes are the
  removed `_is_design_services_project` early exit, the two new `IS DISTINCT FROM` legs, the
  hardened INSERT branch and the two-column trigger-list extension.
- **Does anything in the wave add a policy on `project_time_entries` or `projects`, or key a
  policy on `projects.studio_id`?** **No.** The only `CREATE POLICY` statements in
  `00598`–`00603` are the three on `studio_member_rates`, all keyed on its **own**
  `studio_id` via `is_org_admin_or_owner`. `project_time_entries` carries the pre-existing
  nine; `projects` the pre-existing eight.
- **Is the 00484 quartet intact?** **Yes** — all four read live with their registered quals
  (`Team can view …` = `is_project_team_member(project_id)` alone, as §0.17's correction
  says), and `00484`'s assert replayed clean on a full reset.

---

## Program-rule compliance (each checked this round against the live catalog, not assumed)

| rule | verdict | evidence |
|---|---|---|
| §0.1 additive to `project_time_entries` | PASS | two `ADD COLUMN IF NOT EXISTS`; one new table; no new hours surface, route or table |
| §0.2 / §0.2a hand-numbered, no collision | PASS | `00598`–`00603`; integration head `00597`; enumerated across **every** ref after `git fetch --all --prune` — `00598`–`00603` exist on `hour-tracking/server` (local = `origin`, both `9e268065a`) and **on no other ref**; `00604`–`00606` exist nowhere |
| §0.3 banner / idempotent / RLS same file | PASS | all six carry banners + lineage; `CREATE OR REPLACE` / `IF NOT EXISTS` / `DROP TRIGGER IF EXISTS` throughout; `ENABLE ROW LEVEL SECURITY` + 3 policies inside `00598` |
| §0.4 redefine from the grep winner | PASS | `00600` ← `00412` and `00601` ← `00578` both diffed mechanically (above); `00603` grafts `set_project_studio_id_owned` from `00602` with one arm added and explicitly refuses to re-derive `set_project_studio_id` (head `00563`) or `activate_proposal_as_project` (head `00579`) — both absent from the diff |
| §0.5 no flags | PASS | `git diff … \| grep -icE "usefeatureflag\|posthog\|comingsoon"` → **0** |
| §0.6 / P-4 no backfill | PASS | the only top-level DML in the six files is `00598:197` — the close ladder **inside** the trigger function. Both `00603` triggers read BEFORE INSERT FOR EACH ROW from `pg_trigger`, with a postcondition refusing an UPDATE event (`tgtype & 16`) |
| §0.7 client rate discarded, every kind | PASS | **measured through RLS**: `99999` on a **non-services** project carrying `change_order_terms.hourly_rate_cents = 17500` stored as **15000 / studio_member / 30000 / authorized** — both the client rate and the legacy leg gone |
| §0.7c two refusals + two discards | PASS | **measured**: `rate_source` → `23514`, `rated_amount_cents` → `23514`; `hourly_rate_cents` and `billing_state` silently replaced |
| §0.8 guard list in BOTH places | PASS | read from `pg_trigger`: `aab_` is `BEFORE UPDATE OF project_id, billing_authority_id, authority_rate_id, hourly_rate_cents, rated_amount_cents, billing_state, rate_source, rate_role` (8) and the `IS DISTINCT FROM` chain (`00600:148-155`) carries the same 8; `aac_` carries `rate_role`; exactly **one** BEFORE INSERT trigger on the guard function (n9) |
| §0.9 / §0.10 rollup INVOKER, no notes | N/A | W1 adds no rollup; `notes` appears in no return shape the wave creates (NOTE 4 for the pre-existing view) |
| §0.11 one running-timer slot | PASS | `CREATE UNIQUE INDEX uniq_project_time_entries_running_timer ON public.project_time_entries USING btree (user_id) WHERE (duration_minutes IS NULL)` read live, unchanged; the name appears in **no** file of the wave |
| §0.12 invoiced lock untouched | PASS (with W1-R12-12) | `guard_invoiced_time_entry` trigger still `BEFORE DELETE OR UPDATE … FOR EACH ROW`; body's frozen list identical; `00600` postcondition asserts it is installed |
| §0.13 no RLS policy keyed on `projects.studio_id` | PASS | no new policy on `project_time_entries` or `projects`; `studio_member_rates`' three key on its **own** `studio_id`. (`00599` step 1, `00601` delta 1a and `00603` read the column in function bodies, which §0.13 permits.) |
| §0.14 only `is_org_admin_or_owner` | PASS | zero new `user_is_org_member` call sites in the diff |
| §0.15 `organization_members.role` of type `member_role` | PASS | `designer_seat.role <> 'guest'` / `<> 'owner'` / `= 'owner'` in both bodies; migrations replay clean |
| §0.16 / 00484 DEFINER contract | PASS (NOTE 1) | all five DEFINERs pin `search_path = public, pg_temp` (`proconfig` read live); `PUBLIC/anon/authenticated` = `f` on every one; `extensions.gen_random_uuid()` and `pg_catalog.pg_trigger_depth()` schema-qualified |
| §0.17 the 00484 quartet immutable | PASS | all four read live with their registered quals; `00484`'s assert replayed clean on a full reset |
| §0.19 / §0.20 generated files | PASS | both regenerate to an empty diff (below); the seed carries all six migrations' statements (`00-legacy-grants.sql:15651-15721`) |
| §0.21 hook names | PASS | new module only; `useStudioMemberRates` / `useSetStudioMemberRate` / `studioMemberRateKeys` exported from `hooks/index.ts`; no rename, no default export |
| §0.22 zero-tap path | PASS | `rateRole?` optional; no required field added to `CreateTimeEntryInput`; pinned by the jest case "creates an entry without sending any rate, amount, billing state or provenance" (run, green) |
| §0.25 worktree hygiene | PASS | `supabase/config.toml` still `S` in `git ls-files -v` and in **zero** commits; no `.env*`, no lockfile, no `artifacts/` in any commit |

**Plan items, signature-exact.** `00598`'s table (all columns, `UNIQUE (studio_id, user_id,
effective_from)`, `CHECK (hourly_rate_cents > 0)`); the three policy **names**
(`studio_member_rates_read_self_or_admin`, `_admin_insert`, `_admin_update`) and no DELETE
policy — read from `pg_policies`, exactly those three; table grants read from
`information_schema.role_table_grants`: `authenticated` = `INSERT,SELECT,UPDATE` (no DELETE),
`anon` absent. `00599`'s `(uuid, uuid, timestamptz, text) RETURNS TABLE (cents integer,
source text, role text)`, `STABLE`, `SECURITY DEFINER` — **one ratified deviation**:
`authenticated` is REVOKEd, not GRANTed (W1-R7-04; plan stale, NOTE 2). `00600`'s two columns
with their exact CHECK sets, read from `pg_constraint`:
`('authority','studio_member','profile_default','none')` and
`('lead_designer','support_designer','bookkeeper','vendor')`. `00601`'s five deltas plus delta
1a. `00602` repurposed per HT-3-a/HT-3-b and `00603` repurposed per W1-R11-02 (plan stale both
times, NOTE 2).

---

## Gates re-run (this reviewer, clean stack, project `patina-hours`, `127.0.0.1:54422`)

| command | result |
|---|---|
| `npx supabase db reset --workdir …/agent-server` | **clean** — `00598`…`00603` applied, every postcondition replayed, 27 seeds loaded, `Finished supabase db reset on branch main.` |
| `run-sql-tests.sh -d …/supabase/tests/billing -H 127.0.0.1 -p 54422` | **6 / 6 green**, 0 unexpected (`invoice_checkout_integrity`, `invoice_links`, `studio_invoice`, `time_claim_atomicity`, `time_rate_resolution`, `time_unbilled_view_repair`) |
| `run-sql-tests.sh -d …/supabase/tests/commercial -H 127.0.0.1 -p 54422` | 10 green / **6 unexpected-fail as the brief invokes it**; from the worktree with `-k supabase/tests/KNOWN_FAILURES.md` → **16 / 16, 0 unexpected** (NOTE 6) |
| `run-sql-tests.sh -d …/supabase/tests/rls -f time_entry -H … -p 54422` | **1 / 1 green** |
| `run-sql-tests.sh -d …/supabase/tests/billing -f rate -H … -p 54422` | **1 / 1 green** — `time_rate_resolution_test.sql`, cases (a)–(af) |
| `run-sql-tests.sh -d …/supabase/tests/rls -f studio_member_rates -H … -p 54422` | **1 / 1 green** |
| *beyond the brief:* whole `rls` directory with `-k` | **26 / 26** (24 green + 2 documented pre-existing) — includes the amended `00563_proposal_signing_multi_studio.test.sql` |
| `python3 …/scripts/generate-legacy-grants.py` | baseline + **2612** replayed statements; `git status --porcelain -- supabase/seed/00-legacy-grants.sql` → **empty** |
| `SUPABASE_DB_URL=…:54422 pnpm --dir … db:generate` | `git diff --exit-code -- packages/supabase/src/database.types.ts` → **exit 0** |
| `pnpm --dir … --filter @patina/supabase type-check` | **exit 0** |
| `pnpm --dir … --filter @patina/designer-portal type-check` | **exit 0** |
| `pnpm --dir … --filter @patina/admin-portal build` | **exit 0** |
| *beyond the brief:* `--filter @patina/supabase test -- use-studio-member-rates` | **1 file / 7 passed** |
| *beyond the brief:* `--filter @patina/designer-portal test -- use-time-tracking-authority` | **3 / 3 passed** |

*(The `run-sql-tests.sh` invocations needed `dangerouslyDisableSandbox` — its `mktemp` in
`$TMPDIR` is blocked by the sandbox and the script then reports "no .sql files found", a
false negative, not a test result.)*

---

## Done-when, SQL-probed through RLS as the roles the tests name

| # | claim | result |
|---|---|---|
| 1 | `commercial` green unchanged; `billing` + `rls` green | **PASS** — the six commercial reds are pre-existing and documented in an unmodified `KNOWN_FAILURES.md` (NOTE 6) |
| 2 | `INSERT … (hourly_rate_cents) VALUES (99999)` as `authenticated` on a non-services project stores the resolver's value | **PASS — my own probe, written as the member herself**: stored `15000 / studio_member / 30000 / authorized`, with `change_order_terms.hourly_rate_cents = 17500` on the project proving the legacy leg is cut |
| 3 | a rate typed on the studio surface appears on the next entry with `rate_source='studio_member'` | **DB half PASS — my own probe**: the owner wrote `15000` **through RLS** on `studio_member_rates`, and the member's next entry priced at it. Render half unverifiable — lane B absent |
| 4 | a new hire's services entry carries non-NULL rate + amount and `pending_authorization`, and is **not** promotable | **PASS via the suite** — cases (c)/(c4) green, written through RLS as the hire (`assume_user`); (c4) runs the real promotion predicate (JOIN on `entry.billing_authority_id`, `authority_rate_id IS NOT NULL`) and asserts 0, with a message naming HT-6-b; (c5) asserts why |
| 5 | a two-role member's row records the role she picked | **DB half PASS via the suite** — (e) `vendor` pick → `9000 / authority / rate_role=vendor / authorized` against a `25000` Lead card; (f) no pick → `12000 / studio_member / rate_role NULL`; (g) a role she does not hold → `check_violation`. All three written through RLS as her. See W1-R12-06 for the single-card fallback where the stamped role did not price the hour. Printed half unverifiable — lane B absent |
| — | §0.8 immutability on a classified row | **PASS — my own probe as the author**: `hourly_rate_cents`, `rate_source` and `rate_role` UPDATEs each `23514` |
| — | §0.7c the two refusals | **PASS — my own probe**: `rate_source` and `rated_amount_cents` on INSERT each `23514` |
| — | the resolver is unreachable as an RPC | **PASS — my own probe**: `42501 permission denied for function resolve_time_rate_cents` as `authenticated` |
| — | `studio_member_rates` is append-only to its subject | **PASS — my own probe**: the member's `DELETE` → `42501 permission denied for table studio_member_rates`; a plain-`admin` colleague reads the studio's rows (the admin leg), a plain member only her own |
| — | **HT-3-b delivers the employer tier on the path that creates real projects — ONE employer** | **PASS** — case (ae) green; independently re-measured in my own fixture: a project created by the one-employer hire through RLS stamped `S`, her colleague's hour `12000 / studio_member / 24000` |
| — | **HT-3-b delivers `'none'` for an AMBIGUOUS tier on that same path** | **FAIL, as built and as pinned** — case (af) asserts today's `99900 / studio_member / 199800 / authorized` and `project_unbilled_time` `99900 / 199800`. Owed ruling, not a lane-A defect (header item 1) |

---

## Commit hygiene

18 commits, **Conventional Commits throughout** (`git log --format=%s | grep -vcE
'^(feat|fix|test|docs|chore|refactor)\('` → **0**), explicit pathspecs only. **17 files
total**, all under `packages/supabase`, `apps/designer-portal/src/hooks/__tests__`,
`supabase/migrations`, `supabase/seed` and `supabase/tests`. Across the whole branch's
`--name-only` log: **zero** `.env*`, **zero** `pnpm-lock`, **zero** `artifacts/`, and
`supabase/config.toml` appears in **zero** commits and is still `S` (skip-worktree) in
`git ls-files -v`. The GRANT/REVOKE-bearing commits carry the regenerated
`supabase/seed/00-legacy-grants.sql`, byte-identical after a fresh regeneration at HEAD. This
round's single commit (`9e268065a`) touches `00599`, `00603` and
`time_rate_resolution_test.sql` only. `hour-tracking/server` == `origin/hour-tracking/server`
== `9e268065a` (pushed). Nothing was run in the main checkout; every git and pnpm invocation
used `-C` / `--dir` against the worktree. `rulings.md` is edited in the main checkout only
(untracked on this branch), as the fix pass states.

## Not verified

* **Nothing on Strata** — no `db push`, no prod probe. Not sized: how many live projects have
  a lead designer with two or more active non-guest non-owner seats (the W1-R12-01 surface).
* **Lane B** — absent (phase 2), so Done-when #3's render half and #5's printed half stay
  unverifiable, and no `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live` render check was possible.
* **Concurrency** — no race between a seat INSERT and a signature, or between two blur-saves
  on the same `(studio_id, user_id, effective_from)`.
* **Lint** — not run; outside designer-portal it proves nothing (`patina-verification`), and
  the brief does not name it.
* The twelve carried MINORs were re-**located** rather than re-**measured**; round 12 had just
  re-verified each in place and this round's only commit touches none of their regions except
  `00599`'s and `00603`'s banners.
