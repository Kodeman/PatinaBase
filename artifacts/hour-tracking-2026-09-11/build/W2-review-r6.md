# W2 — lane A (DB) adversarial review, round 6

**clean = false** — **two MAJORs**. One is **new this round and is round 5's own fix**: bound **(e2)**
refuses a caller HT-3-d expressly admits (the designer who is an **admin of her honest employer**), and
because bound **(a2)** then blocks every other caller on a project whose studio holds no sibling she
created, **HT-3-a's ruled remedy is unreachable for that shape** until somebody manufactures a junk
project — measured end to end, and covered by no shipped test. The other is round 5's **accomplice half
of W2-R5-01**, which I re-measured independently from scratch: the designer's resolved rate becomes
**99900, a number she set herself**, permanently, while her honest employer reads 0 rows. Round 5's
W2-R5-02 (case (r)) I **down-grade to `note — ruling owed`** on the brief's own severity wording — the
number there is set by the confederate, not by her, and the closure is the already-owed HT-3-b arm (c).
Round 5's W2-R5-03 (the false "cannot move money" sentences) is **discharged**, verified site by site.

**Scope reviewed.** `origin/hour-tracking/integration..hour-tracking/server` = **six** commits,
`c71db49d9` → `9f80b0c09` → `3d36ffb6e` → `7e6701490` → `7d0ffb910` → **`d7a240259`** (round 5's fix;
HEAD == `origin/hour-tracking/server`, working tree clean). Every line of the round-5 delta
(`00606` +174, `time_entry_studio_stamp_test.sql` +483; **two files, nothing else**), the whole of
`00604`–`00607` as they now stand, the `organization_members` / `studio_member_rates` policy sets,
`transfer_studio_ownership` (00484), `is_project_team_member`, the hook diff, the regenerated seed and
types, `W2-impl.md`, `W2-review-r5.md`, `W2-fix-r5.md`, `rulings.md` (HT-10, HT-10-a, HT-36, HT-38).
Lane B is phase 2; its absence is not counted.

---

## Gates re-run by the reviewer (not quoted from the implementer)

All on this program's isolated stack — Postgres `127.0.0.1:54422`, `project_id "patina-hours"`. The
shared 54322 stack was never touched. Nothing was pushed to Strata; no prod anything.

| Command | Result |
|---|---|
| `supabase db reset --workdir …/agent-server` | **clean** — `Finished supabase db reset on branch main.`; ledger shows `00600`–`00607`; every `DO $postcondition$` passed |
| `run-sql-tests.sh -d …/supabase/tests/billing -H 127.0.0.1 -p 54422` | **7 green / 7**, 0 unexpected |
| `run-sql-tests.sh -d …/supabase/tests/commercial …` | **10 green / 16, 6 unexpected** — `authorized_schedule`, `design_services_authority`, `design_services_gap_hardening`, `executed_on_paper`, `trade_rfq`, `trade_scope`. **All six pre-existing and documented** (`supabase/tests/KNOWN_FAILURES.md:69, :97-101`), five aborting in `_countersign_design_services_agreement_impl` (`design services agreement … not found or access denied`). W2 touches no agreement path. They print "unexpected" only because the `-k` allowlist does not normalise from the repo root |
| `run-sql-tests.sh -d …/supabase/tests/rls …` (**all 30**) | **28 green / 30, 2 unexpected** — `design_requests_test.sql` (`FAIL 3b: expected no_scans`) and `studio_titles_test.sql` (`FAIL f: … last_owner_protected`), both **pre-existing and documented** at `supabase/tests/KNOWN_FAILURES.md:114-115` (note: there is **no** `supabase/tests/rls/KNOWN_FAILURES.md`, which is why the runner cannot match them). `time_entry_studio_stamp_test` (18 cases incl. the new (q)/(r)), `time_entry_admin_write_test`, `time_entry_auto_roster_test`, `project_hours_total_test`, `studio_hours_rollup_test`, `studio_member_rates_test`, `project_roster_test`, `people_directory_scope_test`, `00563_proposal_signing_multi_studio.test`, `00584_studio_comember_rls_sweep.test` all green |
| `pnpm --filter @patina/supabase type-check` | clean (`tsc --noEmit`, exit 0) |
| `pnpm --filter @patina/designer-portal type-check` | clean (exit 0) |
| `pnpm --filter @patina/admin-portal build` | **succeeds, exit 0** (the repo's strictest gate; full route table printed) — this is the gate `W2-fix-r5.md` says it did **not** re-run; I did, and it is green |

Run beyond the brief's list:

| Command | Result |
|---|---|
| `python3 scripts/generate-legacy-grants.py` → `git diff --exit-code supabase/seed/00-legacy-grants.sql` | **CLEAN** (baseline + 2623 replayed statements) |
| `SUPABASE_DB_URL=…54422 pnpm db:generate` → `git diff --exit-code packages/supabase/src/database.types.ts` | **CLEAN** |
| `tests/edge_api -f public_rpc_authorization_contract` | **RED at `:171`** (`00511 must not auto-derive a studio for a non-designer lead`) — W1's, carried as **W2-R4-08**; the W2 re-registration at `:548` is never reached, so §0.17's discharge is asserted by no green gate |
| migration-number sweep across every local and remote ref | `00604`–`00607` exist **only** on `hour-tracking/server`; the only other numbers anywhere near the band are lane D's `00614` (`hour-tracking/edge`) and the people-room program's `00621`–`00627`. **No collision** |
| commit hygiene | working tree clean; `supabase/config.toml` skip-worktree'd and in **none** of the six commits; 14 files in the range, all intended; round 5's commit touches exactly two; Conventional Commits throughout |
| live function shapes (`pg_proc`) | `stamp_project_pricing_studio`, `project_pricing_studio_id`, `project_hours_total`, `audit_time_entry_change` all `prosecdef = t`, `search_path = public, pg_temp`; `studio_hours_rollup` INVOKER with `search_path` pinned (HT-38 ✓); `stamp_time_entry_updated_by` INVOKER, `proconfig = NULL` (**W2-R2-18**, carried) |
| object-level probe that the shipped body came from the replay | `prosrc LIKE '%IF v_actor = v_designer_id AND v_designer_has_employer_seat%'` → **present** after the reset |

---

## Discharge of round 5

| Round-5 finding | Status |
|---|---|
| **W2-R5-01 · MAJOR** (she writes her own role, then takes the work) | **Half discharged, half live, and the fix introduced a new MAJOR.** The **sole-actor** form is genuinely closed: re-measured from a fresh fixture (probe P2), after `transfer_studio_ownership` leaves her own row at `admin`, **her own** stamp of her workspace is refused `42501 … a designer may not name a studio she herself administers while she holds an employer seat … (HT-3-d, W2-R5-01)`. The **accomplice** form is live and I reproduced it independently — **W2-R6-02** below. And bound (e2)'s gate is over-broad against honest studios — **W2-R6-01**, new |
| **W2-R5-02 · MAJOR** (the willing designer authors the `created_by` sibling; the confederate's stamp survives the seat's deletion) | **Not closed, correctly pinned** as case (r); `W2-fix-r4.md` note 1 carries the "unwilling victim only" correction (verified at `:52-53`). **Re-graded here to `note — ruling owed`** — see **W2-R6-03** |
| **W2-R5-03 · MINOR** (banner / `COMMENT` / postcondition claiming the act cannot move money) | **DISCHARGED**, verified at all five sites: the banner carries `AMENDED IN ROUND 5`; the bound-(c) postcondition message now says *"It is NOT a claim that the act cannot move money"*; the `COMMENT` says *"THIS ACT CAN STILL MOVE MONEY for a designer with one accomplice account"*; the "ONE LEG OF ROUND 3 IS RETAINED" paragraph carries `CORRECTED IN ROUND 5`; the test header's case-(e) index line now reads *"cannot move money: see (q) and (r)"* |
| **W2-R5-04** (weak project-existence oracle) | carried, NOTE, unchanged |
| **W2-R5-05** (invoiced lock intact; an invoiced row's `notes` still rewritable) | **re-measured through the new owner policy** (probe P4): owner `UPDATE duration_minutes` → `P0001 … only notes (and detaching the invoice) may change`; `DELETE` → `P0001 … cannot be deleted`; `UPDATE notes` → **NO RAISE**. Carried as W2-R2-13, unchanged |

### The ruling's four required test cases, each measured independently of the shipped suite

The brief asks HT-3-d to be pinned by a postcondition and by four cases. Both postconditions are present
(bound (e) by source with the `NOT LIKE '%IF v_designer_id = v_actor THEN%'` guard — see **W2-R6-04** —
and a new one pinning (e2) by source). The four cases exist as `(m)`, `(n)`, `(o)`, `(p)` and are green.
I re-measured all four on fresh fixtures, through RLS, as the actor:

| ruling case | my measurement |
|---|---|
| **(1)** the r4 confederate-admin manoeuvre is refused 42501 and the hour stays `'none'` | **confirmed** (P2-2/3/4/5). Her consent-free `admin` seat, her own 99900 rate card and her own named-studio sibling all succeed first (so the probe is not vacuous); then **both** her stamp and the confederate's are refused `42501 … only from inside its designer's own tier … (HT-3-d)`, the column stays `NULL`, and her next hour is `NULL / none` |
| **(2)** an employer's admin stamps the employer → the hour prices from the employer | **confirmed** (P3-2, P3-5): employer one's **admin** stamps, returns the studio, and her next hour is `25000 / studio_member` |
| **(3)** a designer with no employer stamps her owned studio → prices from it (HT-3-c) | **confirmed** (P3-7/8/9): two owned studios ⇒ baseline `NULL`; she stamps the one she owns; her next hour is `44000 / studio_member` |
| **(4)** with two employers, either employer's admin may stamp their own studio, and the stamp is final | **confirmed** (P3-1/2/3/4/6): the plain-member designer is refused `42501 … only an owner or admin of the studio being named may name it`; employer one's admin stamps project one, employer two's admin stamps project two; each hour prices from its own employer (`25000` / `31000`); re-pointing a stamped project is refused `22023 … this project already names a studio` (bound (b)) |

### The brief's other probes

| probe | result |
|---|---|
| a designer with employers naming her workspace | **refused** — `42501 … one she OWNS only where she holds none (HT-3-d)` before any demotion (P2-2), and `42501 … (HT-3-d, W2-R5-01)` after the demotion (P2-7). Both legs now hold **for her**; the confederate's leg does not (W2-R6-02) |
| an employer admin stamping | **succeeds**, money follows (P3-2/5) |
| a plain rostered member reading a teammate's row / notes / rate columns | **refused** (P4-1/2/3): she reads **1 of 2** rows on the project she is rostered to (her own), **0** of the designer's rows (so `notes` and `hourly_rate_cents` are unreachable), **1** ledger row, **0** rows of the designer's `studio_member_rates`, and **0** rows on a sibling project she is not rostered to |
| `project_hours_total` per role | rostered plain member **ALLOWED** `180 / 180 / 90000` · studio owner **ALLOWED** `180 / 180 / 90000` · outsider **42501**. The aggregate is HT-10-a's own prescription — and on this two-contributor project it discloses the colleague's confidential rate exactly (**W2-R6-06**) |
| the rollup never returns notes | **confirmed on the TYPE and on the rows**: `studio_hours_rollup → TABLE(bucket_key, bucket_label, member_id, member_name, entry_count, total_minutes, billable_minutes, billable_cents, internal_minutes)`; `project_hours_total → TABLE(minutes, billable_minutes, amount_cents)`; `time_entry_ledger` has **no** `notes` column. Per role: owner 2 member buckets with money · rostered plain member **1** bucket (her own, 60 min) · outsider **0 rows, no raise** (INVOKER + RLS, so empty rather than an error — acceptable, no leak) |
| the audit trigger on an admin adjust | **one** row, `action = time_entry.updated`, actor = the admin, `organization_id` = the pricing studio, `old_values` **and** `new_values` present, `updated_by` stamped, duration actually changed (P4-12/13) |
| owner/admin write cannot touch invoiced rows | **confirmed** (P4-14/15/16) |
| *(added)* can a member author her own resolved rate directly? | **no** (P5): her INSERT carrying `hourly_rate_cents = 99900` → `23514 time entry rate provenance and rated amount are server-derived`; `UPDATE hourly_rate_cents` and `UPDATE rated_amount_cents` on her own row → `23514 commercial time authority, rate, amount, billing state, and rate provenance are server-derived`; her own `studio_member_rates` INSERT → `42501` RLS. **The stamp is the only door left to her own number**, which is why W2-R6-02 matters |

---

## Findings

### W2-R6-01 · MAJOR · confidence HIGH · NEW (introduced by round 5's fix; measured 1/1 end to end, through RLS, as the actor)

**Bound (e2) refuses a caller HT-3-d expressly admits, and bound (a2) then refuses everybody else: an
honest designer who is an ADMIN of the studio that should price her cannot have her legacy project
repaired at all, and neither can her employer's OWNER, unless somebody first manufactures a junk
project. HT-3-a's ruled remedy ("the owner fixes 'none' by stamping projects.studio_id") is
measurably unavailable on that shape.**

*Location:* `supabase/migrations/00606_time_entries_studio_read_narrow.sql` bound **(e2)**
(`IF v_actor = v_designer_id AND v_designer_has_employer_seat AND EXISTS (… role IN ('owner','admin'))`)
in combination with bound **(a2)** (`v_actor <> v_designer_id AND NOT EXISTS (sibling … created_by =
v_designer_id)`).

*Why it contradicts the ruling in force:* HT-3-d is exhaustive by its own words — *"may name ONLY a
studio inside the project designer's HT-3-b tier at call time … and the caller must be an owner or admin
of the NAMED studio. **There is no other arm**"* — and it names exactly two refusals, both about **her
own workspace**. An `admin` seat at an honest employer **is** inside the employer tier (`role <> 'owner'`)
and its holder **is** an owner-or-admin of the named studio, so HT-3-d admits her. (e2) refuses her
anyway, and it landed as a code-only narrowing: the orchestrator never ruled candidate (i), and no
amendment to HT-3-d records it.

*Measured (probe P1; fresh fixture; ordinary shapes only — no confederate, no demotion, no consent-free
seat):* the designer is an **`admin` of employer one** and a plain `member` of employer two (so HT-3-b's
employer tier is ambiguous and the project is `'none'` — the exact population section (4) exists for),
and employer one holds **no** project she created:

```
P1-0 baseline pricing studio          = NULL        ← HT-3-a step 3's 'none', honestly arrived at
P1-1 her hour prices                  = NULL / none
P1-2 SHE stamps her employer          → 42501  "a designer may not name a studio she herself
                                                administers while she holds an employer seat …" (e2)
P1-3 the EMPLOYER'S OWNER stamps it   → 42501  "this studio holds no project that this project's
                                                designer both leads and created …"              (a2)
P1-4 column after both refusals       = NULL        ← nobody can repair it
P1-5 she INSERTs a project naming employer one      → OK   (00563's authenticated arm)
P1-6 the EMPLOYER'S OWNER stamps again → returned employer one
P1-7 column                            = employer one
```

(e2) is the **last** bound before the write, so P1-2's message proves every other bound passed: without
(e2) her stamp would have written the column. So this is strictly a round-5 regression of reachability.

*Severity, and the honest limits of it:* it is **not** a permanent dead end — P1-5/P1-6 show the escape,
and it is an escape a studio can actually perform. But the escape is "create a spurious project in your
employer so that your employer may fix your other project", which is not a sentence the product can say,
and `(a2)`'s sibling requirement is **not in HT-3-d at all** (it is round 3's retained anti-takeover
leg). The shape is also **entirely untested**: no case in
`supabase/tests/rls/time_entry_studio_stamp_test.sql` has the project's designer, as actor, name a studio
she administers **honestly** — (e2) is exercised only inside case (q)'s gaming fixture, and cases (n)/(g)
always have a second actor *and* a sibling. `W2-fix-r5.md` calls the narrow form "the narrowest form that
regresses nothing"; the measurement above is the counter-example, and it was not taken.

*What discharges it (orchestrator's call; **possibly with no code change at all**):*
1. **Ratify (e2)** — amend HT-3-d to record the third refusal, and accept that an ambiguous-tier
   admin-designer's repair runs through a colleague plus a sibling project. Then add the honest-shape
   case to the suite (designer-admin refused; her employer's owner refused for want of a sibling; the
   route that does work), so round 7 is not the one to discover it.
2. **Pair (e2) with a relaxation of (a2)** for the employer tier — e.g. admit an owner/admin caller
   without a sibling where the designer holds an **active, non-guest seat** in the named studio *and* the
   named studio is the one whose rate card somebody other than the designer authored. That restores
   HT-3-a's remedy for the honest shape while keeping W2-R3-01's outsider closed.
3. **Reverse (e2)** and close W2-R6-02 by candidate (ii)/(iv) instead (a temporal bound on the tier, or
   on who may author the rate card) — which closes the accomplice half too, the thing (e2) cannot reach.

### W2-R6-02 · MAJOR · confidence HIGH (= W2-R5-01's accomplice half; re-measured independently 1/1, fresh fixture, every write through RLS as the actor)

**The designer's resolved rate still becomes 99900 — a number she wrote herself — permanently, on a
project an honest employer was pricing correctly, with one second account that performs a single
statement. HT-3-d's second operative consequence ("a confederate she seats as admin in her workspace is
refused for the same reason (the workspace is not in the tier)") is false: after
`transfer_studio_ownership` the workspace genuinely IS in the tier.**

*Location:* bound (e)'s `CASE WHEN v_designer_has_employer_seat THEN designer_seat.role <> 'owner' …`
(a **role** test she can write) together with `public.transfer_studio_ownership` (00484:463, DEFINER,
executable by `authenticated`, whose last statement demotes `auth.uid()` to `'admin'`), and bound (e2)'s
`v_actor = v_designer_id` gate, which exempts the account she hands the title to.

*Measured (probe P2, independent of case (q)'s fixture; she is an ordinary hire — plain `member` of two
employer studios, owner of the workspace 00295 provisioned at her designer grant):*

```
P2-2/3 BEFORE the demotion: her stamp and the confederate's are BOTH refused 42501 (HT-3-d)
P2-5   and her hour stays NULL / none                             ← round 4's manoeuvre is closed
P2-6   transfer_studio_ownership(workspace, confederate)  → her own role in her workspace = admin
P2-7   HER stamp                                          → 42501 (e2)        ← round 5's fix holds
P2-8   the CONFEDERATE's stamp                            → NO RAISE (returned the workspace)
P2-9   the column is written, permanently (bound (b))
P2-10  her next hour                                      → 99900 / studio_member / rated 199800
P2-11  the honest employer's OWNER reads                  → 0 rows of her own studio's work
```

*Why MAJOR and not `note — ruling owed`:* it is the brief's second clause **literally** — a member moves
her own resolved rate to a number **she** set (she writes the 99900 into her workspace's
`studio_member_rates` herself; `admin` satisfies `studio_member_rates_admin_insert`), and P5 shows this
is the **only** remaining door to her own number, every direct one being refused `23514`/`42501`. It is
also a contradiction of HT-3-d's own second sentence, which the orchestrator wrote as a statement of what
the ruling **does**. Closing it needs candidate (ii) (who may author the rate card in the studio being
named) or (iv) (a temporal bound on when the tier and the sibling are read); HT-3-b arm (c)'s consent
door does **not** reach it, because the seat exploited is her own 00295 seat. The implementer is right
not to have guessed, and right to have pinned it as loudly-labelled passing assertions (q8–q11) — but it
remains a money-moving hole in shipped code, so it cannot make W2 clean.

### W2-R6-03 · note — ruling owed · confidence HIGH (= W2-R5-02, re-graded down; the shipped case (r) is green and correct)

**The retained `created_by` sibling leg bounds an attacker acting alone and bounds nothing about a
designer who cooperates with him: she authors the sibling herself, his stamp succeeds, and deleting the
seat afterwards does not undo it.** I did not re-measure this one end to end (case (r) asserts every
step, the suite is green, and I verified the mechanism's two doors independently: the consent-free
`organization_members` INSERT in P2, and 00563's authenticated INSERT arm admitting any studio she
belongs to in P1-5).

*Why I grade it below W2-R6-02:* the brief's MAJOR trigger is *"a member moving her own resolved rate to
a number **she** set"*. In case (r) the 99900 is written by the confederate in **his** org, where she is a
plain member and so cannot write it at all (P5-6 measures that refusal). And its closure is the
**already-owed** HT-3-b arm (c) consent door — a ruling, not a code decision. It is the same class as
W2-R2-03 / W2-R2-04, made irreversible; rule those together.

### W2-R6-04 · MINOR · confidence HIGH (code, verified against the live `prosrc`)

**The postcondition that forbids an actor-gated tier bound now passes while the function contains an
actor-gated refusal, because the guard is a string match on operand order.** The assert reads
`prosrc NOT LIKE '%IF v_designer_id = v_actor THEN%'` and its message says the bound *"must be a property
of (the designer, p_studio_id) applied to EVERY caller"* — and bound (e2), three statements below it, is
`IF v_actor = v_designer_id AND …`. Both sentences are defensible separately (bound **(e)** is indeed not
actor-gated), but a later hand reading that postcondition will conclude the function has no actor gate,
which is exactly the mistake round 4 was written to prevent. *Fix:* scope the message to bound (e) by
name and let the new (e2) postcondition own the actor gate, or match on the tier `CASE` expression rather
than on one spelling of an `IF`.

### W2-R6-05 · NOTE · confidence HIGH (code)

**Bound (e2)'s `designer_standing.role IN ('owner', 'admin')` has an unreachable `'owner'` arm.**
`organization_members` is UNIQUE on `(user_id, organization_id)` (verified on the live schema), so there
is exactly one seat per designer per studio; (e2) runs only when `v_designer_has_employer_seat`, and in
that branch bound (e) has already required that seat's role to be `<> 'owner'`. Harmless, but it reads as
if (e2) also covers the owned tier, which it deliberately does not (the `COMMENT` says so).

### W2-R6-06 · note — ruling owed · confidence HIGH (measured)

**`project_hours_total`'s `amount_cents` lets a rostered plain member recover a colleague's confidential
per-person rate exactly, by subtraction — the same number HT-10-a's amendment narrowed both read policies
to hide.** Measured (P4): the teammate reads **1 of 2** rows (her own, 60 min at her own 40000), **0**
rows of the designer's `studio_member_rates`, **0** of the designer's hours rows — and
`project_hours_total` answers her `180 / 180 / 90000`. `90000 − 40000 = 50000` over the designer's
`180 − 60 = 120` minutes ⇒ **25000/hour**, the designer's confidential studio rate, which is exactly the
disclosure W1-R10-03 and HT-10-a's amendment exist to stop. The inversion is exact on any
two-contributor project and partial beyond. **This is HT-10-a's own prescription** (*"one small SECURITY
DEFINER `project_hours_total(p_project_id)` returning minutes / billable_minutes / amount_cents only"*),
so it is not a defect against any ruling in force and nothing should be changed on a guess — the
orchestrator may want to rule whether `amount_cents` is owner/admin-only (with minutes staying open to
the roster), or to accept the disclosure knowingly. Lane B inherits the same question for any per-phase
money it renders to a rostered member.

### W2-R6-07 · NOTE · confidence MEDIUM (reasoned from code and from the DEFINER grants; not measured end to end)

**Bound (e2)'s actor gate is movable as well as her role: `reassign_project_lead` (SECURITY DEFINER,
EXECUTE to `authenticated`) changes `projects.designer_id`, i.e. the very `v_designer_id` the gate
compares against.** Pointing the project's lead at her confederate makes `v_actor <> v_designer_id`, so
(e2) no longer fires for her. It creates **no new class** — she still needs the confederate to author
(a2)'s `created_by` sibling, which is W2-R6-02's accomplice — so I did not build the fixture. Worth
recording because it shows (e2) raises the cost of the sole-actor route by **one statement**, not by one
accomplice; any closure aimed at (e2)'s gate rather than at the tier/rate-card should expect this.

---

## Carried from rounds 2–5 — each re-checked this round

| id | Severity · confidence | State |
|---|---|---|
| **W2-R4-08** (= W2-R2-10) | MINOR · HIGH | **Live, re-run.** `tests/edge_api -f public_rpc_authorization_contract` red at `:171`; the W2 re-registration at `:548` is never reached, so §0.17's discharge is asserted by no green gate. W1's, ruling owed (W2-R2-19). Still absent from any `KNOWN_FAILURES.md` — correctly, since it is an unruled disagreement rather than documented residue |
| **W2-R3-06 · W2-R2-03 · W2-R2-04** | note — ruling owed · HIGH | Live. W2-R6-03 is W2-R2-04 made irreversible; rule them with HT-3-b arm (c) |
| **W2-R2-05** | MINOR · HIGH | Live — `fetchTimeSummary` / `useSectionLoggedMinutes` / `usePhaseActualMinutes` untouched; a rostered member still under-counts per phase |
| **W2-R2-06** | MINOR · HIGH | Live — `project_pricing_studio_id` is still a per-row plpgsql DEFINER call inside three RLS policies and the view; `useTimeEntryLedger` still has no default `limit` (`limit` is optional, applied only `if (limit)`). No performance measurement this round either |
| **W2-R2-07** | MINOR · HIGH | Live — `00604`'s helper still has no caller assert and is called from five places; any authenticated caller learns any project's pricing studio |
| **W2-R2-09** | MINOR · HIGH | Live — `zzzz_audit_time_entry_change_trg` is `AFTER UPDATE OR DELETE` with **no `WHEN`**; one ordinary self-edit by a plain member writes a full audit row |
| **W2-R2-11** | MINOR · HIGH | Live — `apps/designer-portal/src/lib/react-query.ts:309` still defines `studioReport` for the deleted hook |
| **W2-R2-12** | NOTE · HIGH | Live — `00604`'s second profiles assert is still a tautology |
| **W2-R2-13** | note — ruling owed · HIGH | Live — an invoiced row's `notes` are rewritable by the studio owner through the **new** policy (P4-16), by `guard_invoiced_time_entry`'s own column list |
| **W2-R2-14 / W2-R4-10** | note — ruling owed · HIGH | Live — the author reads none of her own edit's trace; her studio's owner does. Carried to lane B |
| **W2-R2-15 · W2-R2-17** | NOTE · HIGH | Live — `00604` coalesces a missing rate to `0`; `TimeEntryLedgerRow.project_id`/`user_id` non-nullable in TS against a LEFT JOIN |
| **W2-R2-18** | NOTE · MEDIUM | Live — `stamp_time_entry_updated_by` INVOKER with `proconfig = NULL` |
| **W2-R4-11 · W2-R4-12** | NOTE | Carried to lane B as stated; `00607` carries the second in the file |
| **W2-R5-04 · W2-R5-05** | NOTE · HIGH | Live, both re-measured (the project-existence oracle; the invoiced lock + rewritable notes) |
| `W2-impl.md` findings 2–5 | acknowledged | unchanged |

### Pre-existing failures, listed separately as the brief asks

Eight, none of them W2's, all documented in `supabase/tests/KNOWN_FAILURES.md`, all identical to the
r1–r5 baseline: six in `commercial` (`:69`, `:97-101`) and two in `rls` (`:114-115`). One of them is worth
one sentence to the orchestrator because it **touches W2-R6-02's mechanism**: `studio_titles_test.sql`
`FAIL f` is *"demoting the sole active owner should raise `last_owner_protected`"* — the guard that is
supposed to stand in the way of exactly the ownership move W2-R6-02 exploits is **already not firing** on
this stack. It is pre-existing and out of W2's scope, but any closure that leans on ownership-transfer
hygiene should know it.

---

## What I did not verify

- **Lane B, entirely** — phase 2 by scope, not a finding. No `hours-ledger.tsx`, no lens, no HT-35 band
  or opt-out, no Desk card, no copy deck, no Sanity article, no `hours-ledger-scope.test.tsx`, no
  `e2e/document/hours.spec.ts`.
- `pnpm --filter @patina/designer-portal test` / `lint`, and the `DATA_MODE=live` e2e line — outside the
  brief's gate list and lane-B-shaped. (Per patina-verification, no lint result outside designer-portal
  would have meant anything anyway.)
- **W2-R6-01's counterfactual by installation.** I did not re-install the round-4 body to watch P1-2
  succeed; I relied on (e2) being the last bound before the write and on its message being the one
  returned, which proves every earlier bound passed.
- **W2-R6-03 end to end** (case (r)'s twelve steps) and **W2-R6-07** (the `reassign_project_lead` route).
  I verified their mechanisms in isolation instead, and said so above.
- **Concurrency and volume.** No two-simultaneous-stamp race (W2-R4-06's fix is read-the-row-count, not a
  lock); no performance measurement of W2-R2-06's per-row DEFINER policy call.
- **The portal.** W2-R6-02's two statements are both live product affordances
  (`account-studio-page.tsx:1554` "Make owner"; member add on the same page) — I read the code, I did not
  drive the UI. No portal caller for the stamp exists yet, so W2-R6-01's harm is currently a DB-level
  reachability fact rather than a broken button.
- **No prod anything.** Every command ran against `127.0.0.1:54422`. Nothing was pushed to Strata. W1's
  constraint stands (W1 must not reach Strata ahead of `00606`). **The Strata population of
  `projects.studio_id IS NULL` is still uncounted** — it sizes W2-R6-01, W2-R6-02, W2-R6-03, W2-R2-02 and
  HT-3-d's residue, and it is one read-only query. **Sixth round of asking.**
- I staged and committed nothing; `supabase/config.toml` remains skip-worktree'd and untouched. My probe
  scripts live in the session scratchpad, not in the repo, and every one of them ends in `ROLLBACK` —
  verified: the stack holds no probe fixtures.
