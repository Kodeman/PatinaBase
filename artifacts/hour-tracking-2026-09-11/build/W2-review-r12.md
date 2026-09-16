# W2 — lane A (DB) adversarial review, round 12 · HT-3-g

**clean = false — ONE MAJOR.** HT-3-g landed almost exactly: there is no read-time derivation
anywhere that prices, reads, writes or aggregates an hour; designers cannot stamp a studio they own;
the tier rule survives as one shared body with EXECUTE held by nobody; the one-off stamp is idempotent
and answers all nine tier shapes correctly. Every exploit shape of rounds 4–11 that I could
reconstruct is **refused**, measured through RLS.

What is new is that the ruling moved the derivation to **one instant** — and the subject can choose
where she is standing at that instant. `00620` applies HT-3-b's tier rule to the whole legacy book at
ship, reading her LIVE seats; **one ordinary statement of hers before ship** (the shipped
`Members can leave` DELETE on her own `organization_members` row, or, as an `admin`, that row set
`status = 'removed'`) empties her employer tier, so the OWNED tier answers and `00620` writes **her own
workspace** onto her former employer's whole legacy book. Bound (b) then makes every one of those
columns final, HT-3-g(3) gives the employer **no** arm to repair them, and her hours there price at the
number she wrote for herself for ever. Measured 1/1 through RLS in both statement forms, with a
negative control in an identical fixture: **99900 / studio_member / 199800** against the control's
**26000 / studio_member / 52000**; the employer's owner reads **0** rows against the control's **1**,
is refused the repair `22023` and `project_hours_total` `42501`, and its studio rollup returns **0**
project buckets against the control's **1**. One account. No second party. No ownership transfer, no
confederate, no consent-free seat, no forged column, no rate written in anybody else's studio. The
projects are ones she did not create.

Besides it: **four new notes** (one coverage gap, one banner mis-citation, one measured cost of the fix
pass's own judgment call, one case-sensitive postcondition), the carried set each re-measured, and
**round 11's two notes both discharged** — W2-R11-02's coverage gap is closed by the new cases (al)/(am),
and W2-R11-03 dissolves with the confirm arm it described.

**Scope reviewed.** `origin/hour-tracking/integration..hour-tracking/server` = **thirteen** commits,
`c71db49d9` → … → `4ca12439d` → **`b8c373ea0`** → **`99910ac70`** (HEAD == `hour-tracking/server` ==
`origin/hour-tracking/server`, tracked tree clean). Round 11's delta is **nine** files across two
commits — `00606` (+?/−869 rewritten), `00615` (rewritten), **`00620` (new, 219)**,
`seed/00-legacy-grants.sql`, `database.types.ts`; then `billing/legacy_project_studio_stamp_test.sql`
(new, 375), `billing/time_entry_ledger_test.sql`, `billing/time_rate_resolution_test.sql`,
`rls/time_entry_studio_stamp_test.sql` — read line by line. Also read in full: `00615`'s four sections
and every postcondition; `00620` entire; `00606`'s bounds (a), (a1), (b), (c), (d), (f), (g) and its
postconditions; the installed bodies of `resolve_time_rate_cents`,
`project_pricing_studio_id`, `designer_tier_pricing_studio`, `set_project_studio_id_owned`,
`stamp_project_pricing_studio`, `audit_time_entry_change`, `project_hours_total`,
`studio_hours_rollup`, `guard_org_membership_changes`; every policy on `project_time_entries` and
`studio_member_rates`; `rulings.md` (HT-1, HT-3-a…g, HT-3-g's four cost notes, HT-10, HT-10-a, HT-36,
HT-38 verbatim); `plan-v2.md` §0 and §3; `W2-review-r11.md` and `W2-fix-r11.md`. Lane B is phase 2; its
absence is not counted.

**Graft / shape integrity, probed on the INSTALLED objects rather than the files.**
`project_pricing_studio_id` body is exactly
`SELECT project.studio_id FROM public.projects AS project WHERE project.id = p_project_id` and nothing
else — DEFINER, `search_path` pinned, `authenticated` holds EXECUTE, `anon` does not.
`resolve_time_rate_cents` reads `public.organization_members` **once** (HT-3-e(2)'s owner-seat question)
and holds EXECUTE for no authenticated role. `designer_tier_pricing_studio` = DEFINER, `search_path`
pinned, ACL `{postgres=X/postgres}` — **no role holds EXECUTE**. `owned_tier_prices_project`
**does not exist**. `stamp_project_pricing_studio`: owned-tier arm **false**, derivation read **false**,
actor-vs-designer comparison **false in either direction**, `public.organization_members` reads **1**,
employer gate present and positioned *after* bound (b)'s finality sentence and *before* both the
arm's-length leg and the write (all three `position()` comparisons **t** on the installed body).
`studio_hours_rollup` = **SECURITY INVOKER** (HT-38), reads the ledger view, does not read
`organization_members`. `time_entry_ledger` is `security_invoker=true`, `anon` has no SELECT,
`authenticated` does, **0** columns named `notes`. The audit trigger is
`zzzz_audit_time_entry_change_trg AFTER DELETE OR UPDATE … FOR EACH ROW` — **still no `WHEN`**
(W2-R2-09, carried). All four SELECT/ALL policies on `project_time_entries` enumerated: the two
narrowed own-row reads, `time_entries_owner_admin_read` on the pricing studio, and the pre-existing
`Designers manage their project time entries` (§0.17 untouched, carried).

---

## Gates re-run by the reviewer

All on this program's isolated stack — Postgres `127.0.0.1:54422`, `--workdir …/agent-server`. The
shared 54322 stack was never touched. Nothing reached Strata; no prod anything.

| Command | Result |
|---|---|
| `supabase db reset --workdir …/agent-server` | **clean, through `00620`** — `Applying migration 00604…00607, 00615, 00620`, all 22 seed files, `Finished supabase db reset on branch main.` then `{"target":"local","version":"","message":"Reset local database."}`. `00606`, `00615` and `00620` all ran their postcondition `DO` blocks (they RAISE on failure). Ledger tail: `00605, 00606, 00607, 00615, 00620, 20260910152111` |
| `run-sql-tests.sh -d …/tests/billing -H 127.0.0.1 -p 54422` | **8 green / 8**, `unexpected-fail: 0` (`legacy_project_studio_stamp_test.sql` PASS, `time_rate_resolution_test.sql` PASS, `time_entry_ledger_test.sql` PASS) |
| `run-sql-tests.sh -d …/tests/commercial …` | **10 green / 16, 6 unexpected — all pre-existing and documented** (listed below) |
| `run-sql-tests.sh -d …/tests/rls …` (all 30) | **28 green / 30, 2 unexpected — both pre-existing and documented.** `time_entry_studio_stamp_test.sql` PASS, `project_hours_total_test.sql` PASS, `studio_hours_rollup_test.sql` PASS, `time_entry_admin_write_test.sql` PASS, `studio_member_rates_test.sql` PASS, `time_entry_auto_roster_test.sql` PASS, `00563_proposal_signing_multi_studio` PASS, `00584_studio_comember_rls_sweep` PASS |
| the billing + rls suites again with `PGTZ=America/Chicago` | **billing 8/8 · rls 28/30 — byte-identical summaries, same two unexpected files.** W2-R9-04 stays closed |
| `pnpm --dir …/agent-server --filter @patina/supabase type-check` | **clean** (`tsc --noEmit`, exit 0, no output) |
| `pnpm --dir …/agent-server --filter @patina/designer-portal type-check` | **clean** (`tsc --noEmit`, exit 0, no output) |
| `pnpm --dir …/agent-server --filter @patina/admin-portal build` | **succeeds**, exit **0**, full route table |

Run beyond the brief's list:

| Command | Result |
|---|---|
| `python3 ./scripts/generate-legacy-grants.py` **from the worktree** → `git status` | **CLEAN** — baseline + **2630** replayed statements, no diff. `00620` contains **0** top-level GRANT/REVOKE, so it owes no regeneration; the §0.20 grep names `00600–00607` + `00615` and the seed carries them |
| `SUPABASE_DB_URL=…54422 pnpm db:generate` → `git diff --exit-code database.types.ts` | **CLEAN**, exit 0 |
| `psql -f supabase/tests/edge_api/public_rpc_authorization_contract_test.sql` | **RED at `:171`** (`00511 must not auto-derive a studio for a non-designer lead`) — W1's; **twelfth round** (W2-R4-08) |
| migration-number sweep over **every** local and remote ref | `00604`–`00607` + `00615` + `00620` exist only on `hour-tracking/server` (+ origin twin); `00614` only on `hour-tracking/edge`; the peer people-room program holds `00621`–`00627`; `00608`–`00613` and `00616`–`00619` exist on no ref. **No collision** |
| commit hygiene | tracked tree clean; `supabase/config.toml` still `S` (skip-worktree) and in **none** of the thirteen commits (`git log … -- supabase/config.toml` = 0); the two round-11 commits touch exactly the nine intended files and nothing else; Conventional Commits (`feat(time):`, `test(time):`) |
| the live migration's end state | **0** projects with `studio_id IS NULL` whose designer's tier ANSWERS — `00620`'s postcondition (a) as an end-state query, re-measured after seeds. **5** NULL remain, all five the projects of **one** seeded designer (`a0000000-…-04`) whose tier is ambiguous. Matches the fix report's NOTICE counts |

---

## Findings

### W2-R12-01 · MAJOR · confidence HIGH · NEW (measured 1/1 through RLS in two independent statement forms, with a negative control in an identical fixture and a third fixture for the confidentiality half; the brief's manoeuvre trigger word for word)

**HT-3-g removed the recomputation and left the LEVER. `00620` applies HT-3-b's tier rule to the whole
legacy book at one instant, reading the designer's LIVE seats — and the designer chooses where she is
standing at that instant with one ordinary statement she already holds. She leaves her employer before
ship; her employer tier is then empty; the OWNED tier answers her own `00295` workspace; `00620` stamps
that workspace onto EVERY legacy project of hers, her former employer's client work included. Bound (b)
makes each column final, HT-3-g(3) has no arm that lets the employer repair it, and her hours there
price at the number she wrote for herself, for ever. The employer loses the money, the read and the
remedy in one statement it cannot see and cannot answer.**

*Location.* `supabase/migrations/00620_legacy_project_studio_stamp.sql` `:113-127` — the one statement,
`CROSS JOIN LATERAL public.designer_tier_pricing_studio(project.designer_id)` with no bound on WHICH
tier answered; `00615:487-520` — the shared body's OWNED tier, reached "only where she holds no employer
seat anywhere", a condition she controls; `00606:556-598` — bound (c), which gives the employer no
owned-tier arm to undo it; `00606:551-556` — bound (b), which makes it final.

*Form C — probe P4, every write through RLS as her, ONE statement, she is a plain `member`:*

```
X0  her tier with her E seat live              = E  / employer
X1  ONE statement: the shipped `Members can leave` DELETE on her own seat  → 1 row
X2  her tier after it                          = W  / owned          ← the lever
X3  00620 runs at ship                         → stamped 2 rows
X4  BOTH of E's legacy projects (its assistant opened them) now name HER WORKSPACE W
X6  her 120-minute hour on one of them  = 99900 / studio_member / 199800 / authorized
X7  E's OWNER reads 0 of that project's hours
X8  E's OWNER repairing it              → REFUSED 22023 "this project already names a studio"
X9  E's OWNER's project_hours_total     → REFUSED 42501 "the caller is not on this project"
X10 E's studio rollup, project buckets  = 0
X11 HER OWN workspace rollup            = 1 bucket
```

*Negative control — the identical fixture with X1 never performed (no statement at all):*

```
X2' her tier                            = E  / employer
X4' 00620 stamps BOTH projects to        P4 Employer E
X6' her hour                            = 26000 / studio_member / 52000
X7' E's OWNER reads 1 of the hours   ·  X8' E's repair SUCCEEDS
X9' E's OWNER's total = 120 / 120 / 52000  ·  X10' E's rollup = 1 bucket  ·  X11' her own = 0
```

*Form D2 — probe P5, the same in the hand of an `admin`-designer, and she is **never re-seated**:*

```
Y1  `Org admins can update members`: her OWN row SET status = 'removed'  → 1 row
Y2  her tier                            = W / owned
Y3  00620                               → stamped 1 row        Y4  → P5 Workspace W
Y5  her hour, with no seat at E at any point after   = 99900 / studio_member / 199800
```

*The confidentiality half, probe P6 — stated precisely, because only part of it is new:*
after the stamp she reads, adjusts and deletes her former employer's assistant's unbilled row on that
project (1 row each, notes `ASSISTANT-CONFIDENTIAL` in clear). **Those three are NOT new** — she holds
them already through the pre-existing `Designers manage their project time entries` ALL policy, and the
same probe measures her reading that row BEFORE the stamp (W1, 1 row). What IS new is the other side:
**E's owner reads 0 rows of its own project** (W9) where the control reads 1.

*Why MAJOR, stated so the orchestrator can re-grade rather than re-derive.*

1. **It satisfies the brief's manoeuvre trigger word for word.** *"a manoeuvre by ONE account, with no
   second party, that moves its own resolved rate on a project it did not create to a number it set."*
   One account — the DELETE and the `status='removed'` UPDATE are each hers alone, on her own row, under
   policies that shipped long before this program. No second party at any point: E does nothing, and
   form D2 never needs E to re-seat her. Projects she did not create — E's own assistant opened them.
   Her resolved rate moves from the employer's 26000 (the negative control proves it would otherwise
   apply) to the 99900 she wrote in a workspace she owns, permanently.
2. **The employer has NO window in which to protect itself.** `00606` (which creates the stamp at all)
   and `00620` (which applies the rule) land in the **same migration push**. So there is no moment at
   which an employer could pre-emptively stamp its own legacy book, and after the push bound (b) refuses
   it (`22023`, X8). HT-3-g cost note (ii) records that *"once a hire has LEFT, her former employer may
   no longer stamp its own legacy project"* — that records the DENIAL. It does not record that the
   employer's book is not merely left NULL but **positively written to the departed hire's own
   workspace**, which is a different and worse outcome and is recorded nowhere.
3. **The tree asserts the opposite about itself.** Case `(ai)`'s own header says of probes C and D2:
   *"she deletes her own seat and her next hour still prices 26000. The column is not recomputed, so the
   manoeuvre that was W2-R9-01 now changes NOTHING, whoever opened the project."* True — **in the
   post-stamp ordering the case measures**. False in the pre-stamp ordering `00620`'s single instant
   creates, which no leg of any suite exercises (W2-R12-02).
4. **It is HT-3-g's own stated hazard, relocated rather than removed.** `00615`'s banner: *"a studio
   derived when the hour is priced is recomputed on every hour, so every input to it is a lever the
   subject can pull between two hours on the same project: a seat she deletes under the shipped
   `Members can leave` policy (W2-R9-01 probe C) …"*. That exact lever still decides the answer; what
   changed is that one pull now decides the **whole book at once** and **cannot be reversed**, where
   before it decided one hour at a time and the next hour could come back.

*The counter-argument, because it is strong and the orchestrator should weigh it.* **HT-3-g(2) is
Kody's ruling and it prescribes exactly this statement** — *"applies the HT-3-b tier rule ONCE to every
projects row with studio_id IS NULL"*, and HT-3-b's rule is employer-then-owned with no project- or
party-authorship key. The fix pass is faithful. And the act in form C is not even an exploit in its
ordinary clothes: it is **attrition** — a designer who has left a studio, for reasons nobody doubts,
whose former employer's legacy book is then handed to her own workspace with no attacker anywhere.
Read that way this is a ruled cost rather than a defect, and the deliberate form is only the honest
form performed on purpose. I grade it MAJOR because the brief's manoeuvre limb is written as a test of
the MANOEUVRE and not of whether a ruling admits it, because the taking is irreversible with no party
able to undo it, and because the one place in the tree that speaks to this ordering asserts the
opposite. Which reading applies is the orchestrator's call, not mine.

*Candidate closures, in the order I would put them (each a ruling, with its cost stated).*

1. **Key `00620`'s OWNED tier on `projects.created_by`'s own studio standing.** Stamp an owned studio
   only where the project's AUTHOR is not an active non-guest member of some OTHER active design_studio
   — i.e. where the project does not visibly belong to another studio's book. It keeps both honest
   shapes HT-3-g(2) was written for: the sole proprietor (`created_by` = her) and the honest principal
   of the HT-3-f(2) COST NOTE (`created_by` = her own studio's admin, who is in HER studio) both still
   get their studio; the departed hire's employer-opened project is left NULL, which is HT-3-g's own
   safe direction (`'none'`, HT-26's "rate pending"). It is not manufacturable by her: `00563` RAISES on
   any UPDATE that moves `created_by`, and its authenticated-INSERT arm admits only
   `NEW.created_by = auth.uid()`. **Cost:** a project opened by a contractor or an ex-colleague who has
   since taken a seat elsewhere is left NULL, and cost note (ii) then means nobody can stamp it.
2. **Restrict `00620` to `tier = 'employer'` outright.** One predicate, already returned by the shared
   body. **Cost, stated plainly: it re-opens HT-3-g cost note (i) for the whole owned tier** — the
   honest sole proprietor and the honest principal price `'none'` for ever with no act available to
   anybody, which is precisely the trade HT-3-g(2) chose against and the reason HT-3-f(2) was dissolved.
3. **The owner-initiated UNPIN act HT-3-f(4) already records as OWED.** It closes this one too, and it
   is now the third finding in a row whose only real remedy is that same missing instrument. Largest,
   and the only closure that costs the honest shapes nothing.
4. **Ruling-only** — record it as a fifth HT-3-g cost note, in which case the suite **must** carry the
   shape asserted as PASSING and loudly labelled (the `(z)` pattern), because a green suite that
   asserts neither direction will let the next round re-find it or wave it through. Lane B would then
   owe the employer a visible "this project prices `'none'` / prices from *that* studio" fact on its
   project lens, which under this finding it cannot see at all (X7 = 0 rows).

*What sizes it, and it is still uncounted.* The population is exactly the Strata rows where
`projects.studio_id IS NULL` **and** the designer currently holds no active non-guest `role <> 'owner'`
seat **and** owns exactly one active `design_studio`. One read-only query. On this stack the whole NULL
population is 5 rows belonging to one designer with an ambiguous owned tier, so the local number says
nothing. **Thirteenth round of asking, and it is no longer only sizing: it is the count of projects
this finding moves at ship.**

### W2-R12-02 · note · confidence HIGH · NEW (coverage — the suite's silence is what would carry W2-R12-01 into integration)

Independent of how W2-R12-01 is graded, no leg of any suite runs `00620`'s statement **after a seat
change**. The five shapes of `billing/legacy_project_studio_stamp_test.sql` are all honest and all
static — `(a)` one employer, `(b)` two employers, `(c)` owned only, `(d)` nothing, `(e)` the honest
principal — and every one of their projects is inserted before any seat moves. `(ai)` in
`time_rate_resolution_test.sql` runs probes C and D2 **after** the employer's stamp and asserts they
move nothing, which is the opposite ordering. `(am)` in the rls file measures form G's **stamp** being
refused, which is a different act from `00620`.

*Fix, whichever way W2-R12-01 is ruled:* one leg beside `(e)` in the legacy file — a designer with one
employer seat, an owned workspace, her own number in it, and an employer-opened legacy project; the
`Members can leave` DELETE through RLS; then `00620`'s statement verbatim; then the money and the
employer's read. If a closure lands, it asserts the column left NULL and the employer repairing it.
If the closure is ruling-only, it asserts the 99900 and the employer's 0 as PASSING and loudly
labelled.

### W2-R12-03 · note · confidence HIGH · NEW (a migration banner cites a case that is in another file and measures another thing)

`00620:41` — *"case (am) of supabase/tests/billing/legacy_project_studio_stamp_test.sql measures exactly
that shape"*, of the honest principal whose assistant opened her project. `(am)` is **not** in that
file: it is in `supabase/tests/rls/time_entry_studio_stamp_test.sql:3858+` and measures W2-R11-01
**form G** (her stamp of her own workspace on her former employer's project, refused). The legacy file's
honest-principal shape is leg **`(e)`** (`FAIL e1`) plus `g5`. The file's own case letters are
`a1 b1 c1 d1 e1 f1 g0…g9 h1 h2` — there is no `(am)`. One-word fix; it matters because the banner is
what the next hand reads to find the measurement.

### W2-R12-04 · note — cost, measured · confidence HIGH · NEW (the fix pass's own judgment call, priced)

The fix pass kept HT-3-e(1)'s arm's-length-rate leg (bound (d)) because HT-3-g(3) names it in neither
its two conditions nor its four removals, and reported the reading. I agree with the reading — it
narrows the act and it is the one fact a one-account designer cannot manufacture (probe P5: a foreign
`created_by` INSERT is refused `42501` by RLS, a NULL `created_by` likewise, `original_created_by` is
discarded on INSERT and frozen on UPDATE, and self-promotion to `owner` touches 0 rows). But it has a
cost nobody had measured, and it is the **new hire**, not an attacker:

```
V1  the EMPLOYER'S OWNER stamps her legacy project, her seat live, the studio holding
    NO rate row for her yet   → REFUSED 42501 "this studio holds no rate for this
                                project's designer that somebody other than she wrote"
V2  the same owner writes her 22000 first, then stamps  → SUCCEEDS
```

So the repair act is **sequenced**: a studio must price a hire before it may claim her legacy hours.
The remedy is one statement the studio was going to make anyway, and the hour prices `'none'` after a
stamp without a rate in any case — which is the fix pass's own argument and it holds. Recorded so it is
priced rather than discovered, and so lane B words the refusal as *"price her first"* rather than as a
permission error. The one-`IF` removal the fix pass named is still available if Kody reads HT-3-g(3)'s
two conditions as exhaustive.

### W2-R12-05 · note · confidence MEDIUM · NEW (a postcondition that passes for the wrong reason — W2-R8-06's class, with a concrete instance)

`00606`'s postcondition asserts `prosrc NOT LIKE '%sibling%'` to pin HT-3-g(3)'s removal of round 3's
`created_by` sibling leg. `LIKE` is case-sensitive, and the installed body still contains the word twice
— at `prosrc` lines 125 and 135, both in comments, both spelled **`SIBLING`**. So the assert passes
because of the comments' capitalisation, not because the word is absent. Two consequences: an honest
later hand who lowercases one of those comments reds the migration for no behavioural reason, and a hand
who introduces a `Sibling` identifier passes it. The removal itself is real — I probed the installed body
and there is no sibling **code** (no second `studio_member_rates` read, no `projects` sibling EXISTS).
Same for the companion asserts, which are all `prosrc LIKE`/`position()` heuristics over source text;
the behaviour is carried by cases (al), (am), (o), (q), (w), (y), (z) and (ai)/(aj)/(ak). Cheapest
repair: `lower(prosrc) NOT LIKE` on the banned-token asserts, or a word-boundary regex.

---

## Discharged this round, verified rather than trusted

| id | How it was verified | State |
|---|---|---|
| **W2-R11-01 (the round-11 MAJOR)** | **forms A and G both refused, measured independently of cases (al)/(am) on my own fixture.** Form A: she owns W, holds no employer seat, names W on an assistant-opened legacy project → `42501` with the tier message asserted; her hour on it `NULL / none`. Form G: `Members can leave` DELETE (1 row), then her stamp of W on her former employer's project → `42501`, same message. Also refused: the confederate seated `admin` in W; and she as a plain `member` of E naming E (`42501`, the standing message, a different sentence — so the two refusals are distinguishable) | **CLOSED.** The owned tier is nobody's to name, for every caller |
| **W2-R11-02** (the coverage gap round 11 asked for) | cases **(al)** (form A refused, its control twin, the employer repairing both) and **(am)** (form G refused, plus cost note (ii)) exist and are green; I re-measured both shapes independently | **CLOSED.** Superseded by W2-R12-02, which is the same class at the NEXT ordering |
| **W2-R11-03** (the amended confirm closed the owned tier to every caller, wider than its own reasoning) | the confirm arm is **deleted** — `stamp_project_pricing_studio`'s installed body contains no `project_pricing_studio_id` call and no `v_derived`; bound (b) is the whole of finality | **DISSOLVED with the arm it described** |
| **HT-3-f(2) / `owned_tier_prices_project`** | `to_regprocedure('public.owned_tier_prices_project(uuid,uuid)')` IS NULL on the installed stack, and both `00615` and `00620` carry a postcondition forbidding its resurrection | **DISSOLVED, and pinned** |
| **HT-3-f(3)** (a legacy project she created herself while employed, then left) | re-measured: after a stamp, her `Members can leave` DELETE moves nothing (case (ai) ai4/ai6c green, and my probe P4's control confirms the column does not recompute) | **DISSOLVED** |
| **W2-R10-04 / W2-R10-05 / W2-R10-06 / W2-R10-08 / W2-R8-04** | the ACL seed regenerated from the WORKTREE's copy → 2630 statements, clean; `direct_order_attribution_test.sql` passed in this pass (the run fell outside its documented 00:00–02:00 UTC window); number bookkeeping re-swept across every ref and `00620` is W2's with no collision | **Still closed** |
| **W2-R9-02 / W2-R9-03 / W2-R9-04** | `original_created_by` re-measured end to end: an admin-designer's in-place rewrite of her employer OWNER's 26000 → 99900 leaves `created_by` = **her** and `original_created_by` = **his** (F4), her hour then prices **`none`** (F3), and the employer's standing survives. Suites byte-identical under `America/Chicago` | **Still closed** |

## Carried — each re-measured this round

| id | Severity · confidence | State |
|---|---|---|
| **HT-3-f(4) / W2-R10-02 / W2-R8-02** (the consent-free outsider, now the act's only money door) | note — ruling owed · HIGH | **Live, re-measured on my own fixture:** the outsider seats the designer in HIS org consent-free (1 row, `Org owners can insert members`), writes her rate there under his own id, and his **stamp SUCCEEDS**. Closure stays HT-3-b arm (c)'s consent door + the owed UNPIN. **W2-R12-01 closure (3) is the same owed unpin** |
| **HT-3-e(3)** (a second account she transfers the workspace to authors her rate there) | note — residual, ruled · HIGH | Live, code unchanged. `transfer_studio_ownership` demotes her to `admin`, which puts the workspace in her own EMPLOYER tier. Cases (q)/(r) green. Answer stays visibility |
| **W2-R8-03** (the seat test is a LIVE-seat test) | MINOR · HIGH | Live, and now recorded as HT-3-g cost note (ii). **W2-R12-01 is its fifth face and the most expensive**: the same live-seat reading that refuses the employer its repair is what makes `00620` write her workspace instead |
| **W2-R8-05** (the arm's-length leg bounds an order, not an actor) | MINOR · MEDIUM | Live. Still satisfiable by the stamping caller in the same session; still accepts a CLOSED row. W2-R12-04 is its cost from the other side |
| **W2-R8-06** (postconditions are spelling gates) | MINOR · HIGH | **Live, and W2-R12-05 is a concrete instance** — `prosrc NOT LIKE '%sibling%'` passes only because the comments are uppercase. The position asserts are sound (all three probed `t` on the installed body) |
| **W2-R4-08 (= W2-R2-10)** | MINOR · HIGH | **Live, re-run** — red at `:171`, so W2's re-registration at `:545-548` is never reached and §0.17's discharge is asserted by no green gate. W1's; ruling owed. **Twelfth round of asking** |
| **W2-R6-06** (a member infers a teammate's confidential rate from the project total) | note — ruling owed · HIGH | **Live, re-measured per role:** `project_hours_total` answers the owner, the admin, the lead designer and the plain rostered member **identically** — `180 / 180 / 140000`; a non-rostered studio co-member and an outsider both `42501`. She knows her own 60 minutes and her own 40000, so `(140000 − 40000) / (180 − 60) × 60 = 50000` is the lead's rate, exactly. Rule whether `amount_cents` is owner/admin-only. Lane B inherits it |
| **W2-R2-13 / W2-R5-05** (invoiced notes) | note — ruling owed · HIGH | **Live, re-measured per role on a real draft invoice:** `duration_minutes`, `billable` and `DELETE` all raise `P0001 … is attached to invoice …` for the **owner and the admin alike**; **`notes` rewritten by either → NO RAISE, 1 row** |
| **W2-R2-09** (the audit trigger has no `WHEN`) | MINOR · HIGH | **Live, re-measured two ways:** `pg_get_triggerdef` shows `AFTER DELETE OR UPDATE … FOR EACH ROW` with no `WHEN`; one ordinary admin adjust wrote **exactly one** `audit_logs` row (`time_entry.updated`, `organization_id` = the pricing studio, `user_id` = the admin, `old_values` **and** `new_values` present, `updated_by` = the admin, the row re-derived `50000 / studio_member / 75000` at 90 minutes). Note for lane B: `old_values`/`new_values` are `to_jsonb(OLD/NEW)`, so they **carry `notes`** — no new exposure (the readers are the studio's own owner/admin, who already read the row), but it is a second copy of free text outside the rollup's frozen shape |
| **W2-R2-07 (= r1's m2)** (no caller assert on `project_pricing_studio_id`) | MINOR · HIGH | **Live, re-measured and now a bare-column oracle:** a freshly created authenticated stranger reads **0** rows of a seeded project through RLS on `projects`, and `public.project_pricing_studio_id(<that id>)` returns **the studio's uuid**. The body is now the raw column, so the leaked fact is exactly `projects.studio_id`, gated only on guessing a uuid. §0.16 deviation ("a caller assert where it takes a user-supplied scope"). The function's DEFINER justification is sound; the missing assert is separable |
| **`Designers manage their project time entries`** (00177, ALL, no `user_id` leg) | note · HIGH | Live, §0.17-untouched, pinned as case (f4). Re-measured: the project's lead designer reads **2 of 2** rows including a colleague's `notes`, and may adjust and delete them. HT-10's "members read own rows" does not reach her because HT-10-a names only the two policies W2 narrowed |
| **W2-R10-09 (HT-3-f(3)) / W2-R10-10 (`ON DELETE SET NULL`) / W2-R2-05/06/11/12/15/17/18 · W2-R5-04 · W2-R4-11/12** | note / MINOR | Live. HT-3-f(3) is now **dissolved** (above); the rest unchanged — round 11 touched none of those objects |
| `W2-impl.md` findings 2–5 | acknowledged | The "three asserted-equivalent bodies of the pricing rule" finding is **retired by HT-3-g(1)**: there is one shared tier body and one column read, and the equivalence asserts are replaced by absence asserts |

## HT-3-g's own four cost notes, re-measured

| note | measured |
|---|---|
| **(i)** an ambiguous or empty tier prices `'none'` and `00620` leaves it NULL; with no employer seat NO party may stamp | **holds.** Tier rule: two employers → `NULL/none`; no seat → `NULL/none`; two owned → `NULL/none`; guest-only seat → `NULL/none`; a seat in a `suspended` studio → `NULL/none`; a seat in a non-`design_studio` → `NULL/none`. 00620 left every one of them alone. Her own stamp of a studio she owns → `42501` |
| **(ii)** the seat test is a LIVE-seat test, so the employer must act while the seat is live | **holds, and it is the core of W2-R12-01** — with `00606` and `00620` in the same push there is no moment at which the employer can act first |
| **(iii)** the HT-3-f(2) COST NOTE's self-repair is withdrawn; `00620` hands her the studio instead | **holds.** The honest principal's assistant-opened project (`created_by` = her studio's admin) IS stamped to her own studio by `00620`'s verbatim statement (P1 shape 6, and leg (e)/g5) |
| **(iv)** no hour is re-rated in either direction (P-4) | **holds.** `00620`'s own `DO` block counts `project_time_entries` and sums `hourly_rate_cents` before and after and raises on any movement; it ran clean at replay. My own replay of the statement over a 9-shape fixture moved no entry, and the second run wrote **0** rows (idempotent) |

## The brief's read/refusal probes, re-measured (every call through RLS as the named actor)

| probe | result |
|---|---|
| the one-off stamp on a fixture with all four tier shapes (I used **nine**) | one employer → that employer/`employer`; two employers → `NULL/none`; no employer + one owned → that studio/`owned`; no seat → `NULL/none`; no employer + two owned → `NULL/none`; the honest principal (assistant-opened) → her own studio/`owned`; guest-only → `NULL/none`; suspended studio → `NULL/none`; non-`design_studio` → `NULL/none`. `00620`'s statement verbatim stamped exactly the three answerable rows, left six NULL, wrote **0** on a second run, and moved no time entry |
| every prior exploit shape of rounds 4–11 under HT-3-g | **all refused** — form A (`42501`, tier message), form G (`42501`), the confederate `admin` in her workspace (`42501`), the designer as a plain `member` naming her employer (`42501`, the *standing* message), self-promotion to `owner` of her employer (0 rows, no raise), a second seat for herself in her own org (`23505`), a foreign `created_by` rate INSERT (`42501` RLS), a NULL `created_by` rate INSERT (`42501` RLS), naming `original_created_by` on INSERT (discarded to NULL), rewriting `original_created_by` by hand (`23514` identity immutable), and an admin-designer's in-place rewrite of her employer's number (admitted, and priced **`none`**). The one that still **succeeds** is the HT-3-f(4) consent-free outsider — recorded, carried |
| a plain rostered member reading a teammate's row / notes / rate columns | **refused** — she reads **1 of 2** entry rows on the project (her own) and **0** of the lead's, so `notes` and `hourly_rate_cents` are unreachable; **1** `time_entry_ledger` row; **0** rows of the lead's `studio_member_rates`. Her UPDATE and DELETE of the lead's row each touch **0** rows; her rewrite of her OWN row's `hourly_rate_cents` raises `23514 commercial time authority, rate, amount, billing state, and rate provenance are server-derived`. A non-rostered plain studio co-member reads **0** rows and **0** ledger rows |
| `project_hours_total` per role | owner **180/180/140000** · admin **180/180/140000** · lead designer **180/180/140000** · rostered member **180/180/140000** · non-rostered studio co-member **42501 `the caller is not on this project`** · outsider **42501**, same message (W2-R6-06) |
| the rollup never returns notes | **confirmed on the signature, the view and the rows.** `studio_hours_rollup`'s OUT names are exactly `bucket_key, bucket_label, member_id, member_name, entry_count, total_minutes, billable_minutes, billable_cents, internal_minutes` — **0** named `notes`; `time_entry_ledger` has **0** columns named `notes`; the function is **SECURITY INVOKER** (`prosecdef = f`, HT-38) and reads the ledger view, not `organization_members`. Buckets per role: owner **2**, rostered member **1** (her own), non-rostered co-member **0**, outsider **0**, the member passing the LEAD's `p_user_id` **0**; a sixth `p_group_by` literal raises **22023** with the five legal values named |
| the audit trigger | **exactly one** row on an ordinary admin adjust, 0 → 1; `organization_id` = the pricing studio, `user_id` = the admin, both `old_values` and `new_values` present, `updated_by` stamped, the row re-derived at 90 minutes |
| owner/admin writes cannot touch invoiced rows | **confirmed for both roles** — `duration_minutes`, `billable` and `DELETE` all raise `P0001 Time entry … is attached to invoice …`; only `notes` passes (W2-R2-13) |

## Doors I checked and found SHUT

| attempt | result |
|---|---|
| any function other than the stamp writing `projects.studio_id` | **none** — `pg_proc` scan for `UPDATE … projects … SET … studio_id` returns `stamp_project_pricing_studio` alone. Every other writer is an INSERT-time trigger (`set_project_studio_id`, `set_project_studio_id_owned`) |
| she promotes her own `admin` seat at her employer to `owner` (to put it in reach of HT-3-e(2)'s exemption) | **0 rows, no raise** — `guard_org_membership_changes` requires `is_org_owner(…, v_actor)` for any UPDATE into an active owner seat, and RLS filters it to nothing first |
| she holds a SECOND seat in her own org so the owned tier is not her only one | **23505** `duplicate key … organization_members_user_id_organization_id_key` |
| `anon` reaching `stamp_project_pricing_studio`, `project_pricing_studio_id`, `project_hours_total`, `studio_hours_rollup` or `time_entry_ledger` | **no EXECUTE / no SELECT on any of them** |
| any role reaching `designer_tier_pricing_studio` | **none** — ACL `{postgres=X/postgres}`; `authenticated`, `anon` and `service_role` all lack EXECUTE (the 00615 postcondition asserts it, and I probed the installed ACL because the fix pass reported a stale-seed trap that had silently granted it once) |
| `resolve_time_rate_cents` reachable by an authenticated caller | **no EXECUTE** for `anon` or `authenticated` (trigger-path only, W1-R7-04). `service_role` retains it — W1's, pre-existing, not asserted against |
| the employer gate satisfied vacuously (a gate above finality or below the write) | **shut by the postcondition**, and all three `position()` comparisons probed `t` on the installed body |
| re-pointing an already-stamped project | **22023 `this project already names a studio`** — bound (b) runs before the tier gate; naming the same studio is a no-op `RETURN` |
| `00620` weakening `00563`'s guard to get its UPDATE through | **no trigger disabled or dropped** — `set_project_studio_id` exists, is ENABLED, and its `prosrc` still carries `studio_id_not_designer_studio`; `00620`'s own postcondition (d) asserts all three, and the migration applied clean |

---

## Pre-existing failures, listed separately as the brief asks

**Eight**, none of them W2's, all documented in `supabase/tests/KNOWN_FAILURES.md`: six in `commercial`
(the countersign/grant family — `authorized_schedule`, `design_services_authority`,
`design_services_gap_hardening`, `executed_on_paper`, `trade_rfq`, `trade_scope`) and two in `rls`
(`design_requests_test.sql` `FAIL 3b`, `studio_titles_test.sql` `FAIL f`). A ninth,
`commercial/direct_order_attribution_test.sql`, is clock-dependent (documented window 00:00–02:00 UTC,
`:114`) and **passed** in both of this round's runs. The runner's default `-k` points at a per-directory
`KNOWN_FAILURES.md` that does not exist, so it counts all of them as "unexpected"; the plan's own gate
line passes `-k` explicitly.

`rls/studio_titles_test.sql` `FAIL f` again touches this program's mechanism and again means the
opposite of what it looks like: the sole-owner demotion it expects to raise `last_owner_protected` is
instead silently filtered by RLS to 0 rows, so the seat IS protected and the self-demotion route into
the employer tier is shut (re-measured above). The file is red for the wrong reason.

**Still red and still W1's:** `supabase/tests/edge_api/public_rpc_authorization_contract_test.sql` at
`:171` (W2-R4-08 / W2-R2-10). Not in this round's gate list, not touched, ruling owed. **Twelfth round
of asking.**

---

## What I did not verify

- **Lane B, entirely** — phase 2 by scope, not a finding. Its carried copy obligations are unchanged and
  **gain a fourth** under W2-R12-01: the employer needs a visible fact about a project whose hours it no
  longer reads at all, and today it has no surface on which such a project appears.
- **The thirteen commits' TypeScript beyond round 11's delta.** Round 11 touched TypeScript only through
  the generated `database.types.ts` (+11/−? lines, regenerated and clean). `use-time-tracking.ts` and
  `hooks/index.ts` are r1–r8's and were reviewed there; I re-ran their gates, not their diffs.
- **`pnpm --filter @patina/designer-portal test` / `lint`, and any `DATA_MODE=live` e2e line** — outside
  the brief's gate list and lane-B-shaped (and per `patina-verification` no lint result outside
  designer-portal would have meant anything).
- **W2-R12-01 over HTTP.** Every statement it needs is an ordinary `authenticated` call the policies and
  grants admit (`Members can leave`; `Org admins can update members`; the rate and entry INSERTs), but I
  drove them through `psql` with the session's JWT claims set, not through PostgREST. The `00620` half is
  a migration statement and has no HTTP form by construction.
- **The real `00620` against a non-seed population.** I replayed its statement verbatim over my own
  fixtures inside rolled-back transactions; the live migration ran once at reset against the seed book
  (5 NULL, 0 stamped, 5 left NULL). **The Strata population — `projects.studio_id IS NULL` split by
  whether the designer holds an employer seat and owns exactly one studio — is STILL UNCOUNTED**, and
  under W2-R12-01 it is no longer a sizing question but the count of projects the ship moves.
  Thirteenth round of asking.
- **Concurrency and volume.** No two-simultaneous-stamp race (bound (b) plus the re-read `RETURNING` is
  the argument, not a measurement); no measurement of W2-R2-06's per-row DEFINER policy call, which
  `00620` makes cheaper (a column read) but does not remove.
- **Whether W2-R12-01 is a defect or a fifth cost note.** Both readings are set out with the
  measurements that separate them: it is literally what HT-3-g(2) prescribes and literally what the
  brief's manoeuvre limb names, and case (ai)'s own comment reads against it. Which applies is the
  orchestrator's call, not mine.
- **No prod anything.** Every command ran against `127.0.0.1:54422`; nothing was pushed to Strata.
  W1's ordering constraint stands and is unchanged: `00599`/`00601` must not reach Strata ahead of
  `00606`/`00615`, and **`00620` must be last** — it reads the shared tier body `00615` defines. One
  forward-looking consequence worth recording: `00620` holds the program's LAST number, so W3's
  `00608–00609` and W4's `00610–00614` all replay **before** it, and any of them that reads
  `projects.studio_id` or builds a policy keyed on it will see the pre-stamp legacy book.
- I staged and committed nothing. `supabase/config.toml` remains skip-worktree'd and untouched. Every
  probe script lives in the session scratchpad and ends in `ROLLBACK`; the two probes that needed a
  postgres-inserted NULL-studio project disabled `set_project_studio_id` and
  `zzz_set_project_studio_id_owned_trg` **inside** such a transaction and re-enabled both in the same
  statement block. The `billing`, `rls` and `commercial` suites were run after every probe and returned
  identical summaries.
