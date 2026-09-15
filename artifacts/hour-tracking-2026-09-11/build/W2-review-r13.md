# W2 — lane A (DB) adversarial review, round 13 · HT-3-g

**clean = false — ONE MAJOR.** Round 12's closure is real and it is not vacuous: remove the key
from the statement and the suite reds at `g10` with the taking reproduced verbatim. But the key it
installed asks a question **about a person whose standing is in the same hand as the tier it keys**, and
W2-R12-01 reproduces through it — measured 1/1 in three independent forms on my own fixtures, with
negative controls in identical fixtures. The narrowest of the three needs **one statement by a plain
member** and no second party at all: `00620`'s owned tier is keyed on the AUTHOR holding a live,
active, non-guest seat in an **active `design_studio`**, and that is FALSE for four of the five author
standings a legacy row can have — a seatless author, a `guest` seat, a seat in a suspended studio, a
seat in a non-`design_studio` org — plus the author being the designer herself (the recorded g11
control). Where the author is a colleague whose seat she can reach, **she can make it false herself**:
as an `admin` of her employer she sets that row `status = 'removed'`, or `role = 'guest'`, or deletes
it — each one statement, each admitted by `Org admins can update/delete members`, and
`guard_org_membership_changes` guards only owner-role transitions.

Everything else in the brief's probe list is where round 12 left it: no read-time derivation anywhere
that prices, reads, writes or aggregates an hour; designers cannot stamp a studio they own; the tier
rule is one shared body no role can execute; the new key is DEFINER, STABLE and reachable by nobody
(`{postgres=X/postgres}` probed); every prior exploit shape of rounds 4–11 is refused except the
HT-3-f(4) consent-free outsider, which still succeeds and is now **wider than it was** (note
W2-R13-03: his one seat redirects an honest sole proprietor's WHOLE legacy book at ship, and she
cannot repair any of it).

Besides the MAJOR: **one new note** (the NOTICE cannot see the reassignments the key admitted),
**one carried note widened and re-measured** (HT-3-f(4) at ship), **two round-12 notes NOT discharged**
(W2-R12-03's banner mis-citation, W2-R12-05's case-sensitive postcondition — both verified live,
neither touched by the fix pass), and the carried set each re-measured.

**Scope reviewed.** `origin/hour-tracking/integration..hour-tracking/server` = **fourteen** commits,
`c71db49d9` → … → `99910ac70` → **`217107400`** (HEAD == `hour-tracking/server`, tracked tree clean).
Round 12's delta is **five** files in one commit — `00620` (+216), `billing/legacy_project_studio_stamp_test.sql`
(+273/−?), `billing/time_rate_resolution_test.sql` (+12/−?), `seed/00-legacy-grants.sql` (+6),
`database.types.ts` (+4) — read line by line. Also read in full: `00620` entire (banner, predicate,
statement, NOTICE, all six postconditions); the installed bodies of `designer_tier_pricing_studio`,
`stamp_project_pricing_studio`, `project_pricing_studio_id`, `set_project_studio_id`,
`guard_org_membership_changes`, `guard_organization_admin_columns`, `is_project_team_member`; every
policy on `project_time_entries`, `organization_members` and `organizations`; every trigger on
`project_time_entries` and `organizations`; `legacy_project_studio_stamp_test.sql` entire;
`rulings.md` (HT-1, HT-3-a…g incl. the round-12 amendment, HT-10, HT-10-a, HT-36, HT-38, W2-R9-02/03/04);
`plan-v2.md` §0 and §3; `W2-review-r12.md` and `W2-fix-r12.md`. Lane B is phase 2; its absence is not
counted.

---

## Gates re-run by the reviewer

All on this program's isolated stack — Postgres `127.0.0.1:54422`, `--workdir …/agent-server`. The
shared 54322 stack was never touched. Nothing reached Strata; no prod anything.

| Command | Result |
|---|---|
| `supabase db reset --workdir …/agent-server` | **clean, through `00620`** — exit 0; `Applying migration 00604, 00605, 00606, 00607, 00615, 00620`; all 27 seed files; `Finished supabase db reset on branch main.` then `{"target":"local","version":"","message":"Reset local database."}`. `00606`/`00615`/`00620`'s postcondition `DO` blocks all ran (they RAISE on failure). Ledger tail: `00605, 00606, 00607, 00615, 00620, 20260910152111` |
| `run-sql-tests.sh -d …/tests/billing -H 127.0.0.1 -p 54422` | **8 green / 8**, `unexpected-fail: 0` (`legacy_project_studio_stamp_test.sql` PASS, `time_rate_resolution_test.sql` PASS, `time_entry_ledger_test.sql` PASS) |
| `run-sql-tests.sh -d …/tests/commercial …` | **10 green / 16, 6 unexpected — all pre-existing and documented** (listed below) |
| `run-sql-tests.sh -d …/tests/rls …` | **28 green / 30, 2 unexpected — both pre-existing and documented.** `time_entry_studio_stamp_test.sql` PASS, `project_hours_total_test.sql` PASS, `studio_hours_rollup_test.sql` PASS, `time_entry_admin_write_test.sql` PASS, `studio_member_rates_test.sql` PASS, `time_entry_auto_roster_test.sql` PASS, `00563_proposal_signing_multi_studio` PASS, `00584_studio_comember_rls_sweep` PASS |
| billing + rls again with `PGTZ=America/Chicago` | **billing 8/8 · rls 28/30 — byte-identical summaries, the same two unexpected files.** W2-R9-04 stays closed |
| `pnpm --dir …/agent-server --filter @patina/supabase type-check` | **clean** — `tsc --noEmit`, exit 0, no output |
| `pnpm --dir …/agent-server --filter @patina/designer-portal type-check` | **clean** — `tsc --noEmit`, exit 0, no output |
| `pnpm --dir …/agent-server --filter @patina/admin-portal build` | **succeeds**, exit 0, full route table |

Run beyond the brief's list:

| Command | Result |
|---|---|
| `python3 ./scripts/generate-legacy-grants.py` **from the worktree** → `git status` | **CLEAN** — baseline + **2631** replayed statements, no diff (matches the fix report). `00620` carries one top-level `REVOKE`, and the seed carries it |
| `SUPABASE_DB_URL=…54422 pnpm db:generate` → `git diff --exit-code database.types.ts` | **CLEAN**, exit 0 |
| `psql -f supabase/tests/edge_api/public_rpc_authorization_contract_test.sql` | **RED at `:171`** (`00511 must not auto-derive a studio for a non-designer lead`) — W1's; **fourteenth round of asking** (W2-R4-08 / W2-R2-10) |
| negative control — the key removed from both copies of the statement in `legacy_project_studio_stamp_test.sql` (2 replacements) | **ERROR: FAIL g10** — the taking reproduces verbatim. Case (h) is **not vacuous**; the fix report's claim is confirmed independently |
| migration-number sweep over **every** local and remote ref | `00604`–`00607` + `00615` + `00620` exist only on `hour-tracking/server` (+ origin twin); `00614` only on `hour-tracking/edge`; the peer people-room program holds `00621`+; `00608`–`00613` and `00616`–`00619` exist on no ref. **No collision** |
| commit hygiene | tracked tree clean; `supabase/config.toml` still `S` (skip-worktree) and in **none** of the fourteen commits (`git log … -- supabase/config.toml` = 0); the round-12 commit touches exactly the five intended files; Conventional Commits (`fix(time):`) |
| the live migration's end state | `projects` 6 · `studio_id IS NULL` **5** · NULL rows whose designer's tier answers **at all** = **0** · NULL + answers + key false = **0**. So `00620`'s postcondition (a) holds as an end-state query after seeds, and the 5 residual NULLs are not rows the key left — the tier rule answers nothing for them |
| probe hygiene | every probe transaction ended in `ROLLBACK`; after all of them, `projects` rows matching my fixture prefixes = **0**, and the billing suite re-ran **8/8** identical |

---

## Findings

### W2-R13-01 · MAJOR · confidence HIGH · NEW (W2-R12-01 not discharged — measured 1/1 in three independent statement forms, each with a negative control in an identical fixture)

**`00620`'s owned-tier key asks whether the project's AUTHOR holds a live, active, non-guest seat in an
active `design_studio` other than the studio being written. That fact is not outside the manoeuvre — it
is either already false on an ordinary legacy row, or it is one statement of hers away. The round-12
closure narrows W2-R12-01's population; it does not close it. In its narrowest form the taking needs
ONE statement by a PLAIN MEMBER, no admin seat, no second party, and no touch of anybody else's row.**

*Location.* `supabase/migrations/00620_legacy_project_studio_stamp.sql` `:159-181` — the predicate's
four `WHERE` legs (`status = 'active'`, `role <> 'guest'`, `type = 'design_studio'`,
`status = 'active'`), each of which is a fact about a *person* rather than about the project;
`:246-249` — the statement's key; `00606`'s bound (b) (final) and bound (c) (no owned-tier arm for the
employer to repair) are unchanged and are what make each write irreversible.

#### Form S — the minimal one. A PLAIN MEMBER, ONE statement, a seatless author.

Fixture: employer E (active `design_studio`, owner OE, rate 26000 for her authored by OE); she is a
plain `member`; she owns workspace W with her own 99900 authored by herself (HT-3-e(2)'s owner
exemption prices it); one legacy project of E's, `designer_id` = her, `created_by` = an author who
holds no active non-guest seat in any active `design_studio` (an ex-contractor, a platform hand, an
assistant whose seat somebody else closed long ago).

```
S0   her tier while seated                      = E / employer
S0b  the author key, BEFORE any act of hers      = FALSE      ← already false; nothing to manufacture
S1   ONE statement: the shipped `Members can leave` DELETE on her own seat   → 1 row
S2   her tier after it                           = W / owned
S3   00620's statement verbatim (key included) → the project now names W
S4   her 120-minute hour on it                   = 99900 / studio_member / 199800
S5   E's OWNER reads 0 rows of its own project's hours
S6   E's OWNER repairing it                      → REFUSED 22023 "this project already names a studio"
```

#### Form H — where the author IS a colleague, she makes the key false herself.

Fixture: the same, except she is an `admin` of E and the author is E's assistant A, seated `member` at
E (i.e. exactly the fixture the program's own case (h) uses, where the key correctly leaves the row).
Two statements, both hers, both on rows her own shipped policies admit; `guard_org_membership_changes`
guards only owner-role transitions, so neither is refused.

```
X0   her tier = E / employer      ·   author key = TRUE   (case (h)'s state — the row WOULD be left)
X1   statement 1 — `Org admins can update members`: the AUTHOR's row SET status = 'removed' → 1 row
X2   statement 2 — her OWN row SET status = 'removed' (W2-R9-01 probe D2)                   → 1 row
X3   her tier = W / owned   ·   author key = FALSE
X4   00620's statement → E's legacy project (its assistant opened it) now names HER WORKSPACE W
X6   her 120-minute hour on it        = 99900 / studio_member / 199800 / authorized
X7   E's OWNER reads 0 of that project's hours
X8   E's OWNER repairing it           → REFUSED 22023
X9   E's OWNER's project_hours_total  → REFUSED 42501 "the caller is not on this project"
```

*Negative control — the identical fixture with X1/X2 never performed:*

```
X2'  her tier = E / employer    ·   X4' 00620 stamps the project to EMPLOYER E
X6'  her hour = 26000 / studio_member / 52000
X7'  E's OWNER reads 1 of the hours  ·  X8' E's repair SUCCEEDS  ·  X9' 120 / 120 / 52000
```

*Two quieter spellings of X1, both measured, both 1 row:* `role = 'guest'` on the author's row (the
seat **stays on the roster**, merely as a guest — the quietest form available), and an outright
`DELETE` under `Org admins can delete members`. Each leaves the key FALSE and each produces X4–X9
identically.

*And the control that says this is an `admin` act, not a member act:* a plain `member` of E attempting
either statement on the author's row touches **0 rows, no raise**, and the key stays TRUE. So form H
belongs to the same actor class as W2-R9-01 probe D2, which this program already treats as in scope.

#### The key's whole surface, measured as a matrix (10 shapes, `00620`'s statement run verbatim)

| shape | tier answer | author key | stamped? |
|---|---|---|---|
| one employer (any author) | employer | — (not asked) | **yes** |
| two employers | none | — | no |
| owned; author = the designer herself | owned | false | **yes** (g11's recorded control) |
| no seat at all | none | — | no |
| owned; author holds a LIVE seat in another active `design_studio` | owned | **true** | **no** ← the only shape the key blocks |
| owned; author SEATLESS | owned | false | **yes** |
| owned; author's only other studio is `suspended` | owned | false | **yes** |
| owned; author's only other seat is `role = 'guest'` | owned | false | **yes** |
| owned; author's only other org is type `manufacturer` | owned | false | **yes** |
| two owned | none | — | no |

*Why MAJOR, stated so the orchestrator can re-grade rather than re-derive.*

1. **It satisfies the brief's manoeuvre limb word for word** — *"a manoeuvre by ONE account, with no
   second party, that moves its own resolved rate on a project it did not create to a number it set."*
   Form S is one statement by one account on her own row, under a policy that shipped long before this
   program; form H is two statements by one account, the second of which is probe D2 itself. No second
   party acts in either. The projects are ones she did not create (that is the premise of both), and her
   resolved rate moves from the employer's 26000 — which the negative control proves would otherwise
   apply — to the 99900 she wrote for herself in a workspace she owns, permanently.
2. **The key does not reduce her agency, it relocates it.** Round 12's reasoning is that the author's
   standing is a fact she cannot manufacture because `00563` freezes `created_by`. `created_by` is
   indeed frozen — but the key does not read `created_by`, it reads *the author's seats*, and those are
   exactly as movable as her own. Where the author is a colleague she administers, she moves them; where
   the author is not seated anywhere, she need not.
3. **The employer still has no window and no remedy.** `00606` and `00620` land in the same push, and
   HT-3-g(3) gives the owned tier no stamp arm at all, so every measurement above ends the same way:
   0 rows read, `22023` on the repair, `42501` on the total.
4. **It is attrition in ordinary clothes, exactly as round 12 said of its own form** — the same
   argument that made W2-R12-01 a MAJOR rather than a cost note applies unchanged to a row whose author
   happens to hold no seat, which on a legacy book is the common case, not the exotic one.

*Closures, ranked, so the orchestrator can choose rather than re-derive (I am not the implementer).*

1. **Make the question about the PROJECT's book rather than about a person.** The durable fact that a
   legacy project belongs to a studio is not a live seat; it is the project's own history — an
   `invoices.studio_id` on it, a `proposals`/`designer_clients` relationship, any `projects` row of the
   same client already naming a studio, an `audit_logs` row. Keyed on any such fact, neither her seats
   nor the author's move it, and the honest shapes `00620` exists for (the sole proprietor, the
   HT-3-f(2) principal) still answer. This is the only closure that removes the lever rather than
   narrowing it.
2. **Drop `00620`'s OWNED tier entirely** — stamp the employer tier only, and leave every owned-tier row
   NULL at `'none'`. HT-3-g(2) then writes nothing that any one account can aim; the cost is the honest
   sole proprietor's and the HT-3-f(2) principal's books sitting at "rate pending" until HT-3-g(3)
   gains an owned-tier repair act (which is the owed UNPIN's sibling, and a ruling Kody owes either way).
3. **Freeze the inputs instead of reading them live** — key the owned tier on the designer's and the
   author's seats *as of a timestamp before the program's first commit* (`organization_members.created_at`
   / `joined_at` are on the rows; `status` history is not, which is the gap that makes this partial).
4. **Ruling-only**, with all three forms asserted as PASSING and loudly labelled, and lane B owed a
   visible fact about a project whose hours a studio reads 0 of. That is where round 12 left its own
   form; this finding's point is that the cost is larger than the fifth cost note priced it.

---

### W2-R13-02 · note · confidence HIGH · NEW (the ship cannot see what the key let through)

`00620`'s NOTICE counts `v_left_author` — the rows the key **left** — and that is the cost note (v)
number. It does **not** count the rows the key **admitted** on an owned-tier answer where the author is
**not** the designer: precisely the population W2-R13-01 moves. On this stack both numbers are 0, so
the NOTICE is silent about a class it cannot currently exhibit; on Strata at push time they are the two
numbers a human would want side by side. Three counts, not one: stamped-employer · stamped-owned-self-authored
· stamped-owned-by-another-hand. One extra `count(*) FILTER`.

### W2-R13-03 · note — carried and WIDENED, measured · confidence HIGH (HT-3-f(4) at ship)

The consent-free outsider is still the act's open money door, and `00620` makes it **wider than the
stamp ever was**. Before `00620`, he had to call `stamp_project_pricing_studio` once per project. Now
one seat INSERT, taken at any time before the push and needing no further act by him and no act at all
by her, redirects an honest sole proprietor's **entire** legacy book:

```
C0  her tier as a sole proprietor                      = HER studio / owned
C1  `Org owners can insert members`: he seats her in HIS org, consent-free   → 1 row
C2  her tier after it                                  = HIS org / employer  ← and the EMPLOYER tier is UNKEYED by the author
C3  00620's statement → HER OWN legacy house now names HIS org
C4  her hour on her own house                          = NULL / 'none'   (her own 40000 unreachable)
C5  her own repair                                     → REFUSED 22023 (bound (b): final)
C6  she removes the bogus seat → the column still names HIS org
```

Not a defect of this wave's code and not the brief's manoeuvre limb (he acts, so there is a second
party), and the employer tier's freedom from the author key is a deliberate, reasoned choice. Recorded
because the *consequence* of HT-3-f(4) changed when `00620` landed: the residual's blast radius went
from "one project he bothers to stamp" to "her whole book, automatically, at ship". Closure stays
HT-3-b arm (c)'s consent door plus the owed owner-initiated UNPIN — and the UNPIN is now owed to **her**
as well as to an employer.

### W2-R13-04 · note · confidence HIGH · W2-R12-03 **NOT DISCHARGED**

`00620:89-91` still reads *"case (am) of supabase/tests/billing/legacy_project_studio_stamp_test.sql
measures exactly that shape"*. That file's case letters are `a1 b1 c1 d1 e1 f1 g0…g12a h1…h13` —
there is **no `(am)`** in it; the honest-principal shape is leg **`(e)`** (`FAIL e1`) plus `g5`, and
`(am)` lives in `supabase/tests/rls/time_entry_studio_stamp_test.sql:4021` measuring W2-R11-01 **form G**.
The round-12 fix pass did not touch this line (its file list names only the W2-R12-01 banner section).
One-word fix; it matters because the banner is what the next hand reads to find the measurement.

### W2-R13-05 · note · confidence HIGH · W2-R12-05 **NOT DISCHARGED**

`00606:903`'s `prosrc NOT LIKE '%sibling%'` still passes on capitalisation alone. Probed on the
installed body of `stamp_project_pricing_studio`: `LIKE '%sibling%'` → **f**, `LIKE '%SIBLING%'` → **t**,
case-insensitive match count **2** (both in comments). `00606` was not in round 12's file list. The
removal itself is real (I re-read the installed body: no second `studio_member_rates` read for a
sibling, no `projects` sibling `EXISTS`, no actor-vs-designer comparison in either direction), so this
is a gate that passes for the wrong reason in both directions — an honest hand who lowercases a comment
reds the migration, and a hand who introduces a `Sibling` identifier passes it. Cheapest repair:
`lower(prosrc) NOT LIKE`, or a word-boundary regex.

### W2-R13-06 · note — cost, carried and re-measured · confidence HIGH (W2-R12-04)

Bound (d)'s arm's-length-rate leg still sequences the repair act: a studio must hold a rate row for the
designer written by somebody other than her before it may stamp her legacy project. Unchanged, and the
reading the fix pass reported is the one I would keep — it is the single fact a one-account designer
cannot manufacture (re-measured: foreign `created_by` rate INSERT → `42501` RLS; `original_created_by`
supplied on INSERT → discarded to NULL). Lane B should word the refusal as *"price her first"*, not as
a permission error.

---

## Discharged this round, verified rather than trusted

| id | How it was verified | State |
|---|---|---|
| **W2-R12-02** (the coverage gap: no leg ran `00620`'s statement after a seat change) | cases **(h)** (`g10`, `g10a`, `g10b`, `g11`, `g11a`, `h10`–`h13`) and **(i)** (`g12`, `g12a`) exist, are green, and are **non-vacuous** — with the key removed from both copies of the statement the file reds at `g10` with the taking reproduced. I re-measured the same shape independently | **CLOSED as written.** Superseded by W2-R13-01, which is the same class at the author standings the new leg does not fixture |
| **the round-12 closure's own claims** | each probed on the installed objects, not the file: `project_author_books_elsewhere` is `prosecdef = t`, `provolatile = s`, `proacl = {postgres=X/postgres}` (no role holds EXECUTE); `created_by` is `NOT NULL` on `projects`; `00563` still RAISES on any UPDATE that moves `created_by` and its authenticated-INSERT arm admits only `NEW.created_by = auth.uid()`; `owned_tier_prices_project` does not exist; the employer tier is genuinely unkeyed (shape (i) + my matrix row 1) | **Each true as stated** |
| **HT-3-f(2) not applied** / the two honest shapes | `g11a` re-measured independently: the sole proprietor's own hand, the HT-3-f(2) principal's assistant inside her own studio, and the departed hire's own hand all answer FALSE; leg (e)/`g5` stamps the principal's assistant-opened project to her own studio and `g8` prices it 31000 / 62000 | **Holds** |
| **P-4 across `00620`** | the migration's own `DO` block counts entries and sums `hourly_rate_cents` before/after and raises on movement (ran clean at replay); `g2` the same over the fixture; `g9`/`h10` the pre-stamp hour keeping its `'none'`; my own 10-shape replay moved no entry and the second run wrote 0 rows | **Holds** |
| **the ACL seed and the types** | regenerated from the **worktree's own copy** (2631 statements) → no diff; `db:generate` → `git diff --exit-code` clean | **Still closed** (W2-R10-06's trap re-avoided) |

## Carried — each re-measured this round

| id | Severity · confidence | State |
|---|---|---|
| **HT-3-f(4) / W2-R10-02 / W2-R8-02** | note — ruling owed · HIGH | **Live, and WIDENED — see W2-R13-03.** The isolated clean measurement: he seats her (1 row), writes her rate under his own id, and his stamp **SUCCEEDS**; and at ship he need not stamp at all |
| **HT-3-e(3)** (a second account she transfers the workspace to) | note — residual, ruled · HIGH | Live, code unchanged — and it now has a second face at `00620`: `transfer_studio_ownership` demotes her to `admin`, which puts her own workspace in her **EMPLOYER** tier, and the employer tier is unkeyed by the author, so the whole legacy book follows. Two accounts, so outside the brief's limb; recorded beside W2-R13-01 as the same lever one seat-role away |
| **W2-R8-03** (the seat test is a LIVE-seat test) | MINOR · HIGH | Live; HT-3-g cost note (ii). Re-measured as `h12`'s shape on my own fixture: the former employer's owner is refused `42501` after she has left |
| **W2-R8-05 / W2-R12-04** (the arm's-length leg bounds an order, not an actor) | MINOR · MEDIUM | Live — W2-R13-06 |
| **W2-R8-06** (postconditions are spelling gates) | MINOR · HIGH | **Live — W2-R13-05 is the concrete instance, re-probed.** The `position()` asserts are sound |
| **W2-R4-08 (= W2-R2-10)** | MINOR · HIGH | **Live, re-run — red at `:171`**, so W2's re-registration at `:545-548` is never reached and §0.17's discharge is asserted by no green gate. W1's; ruling owed. **Fourteenth round of asking** |
| **W2-R6-06** (a member infers a teammate's confidential rate from the project total) | note — ruling owed · HIGH | **Live, re-measured per role:** `project_hours_total` answers owner, admin, lead designer and plain rostered member **identically** — `180 / 180 / 140000`; non-rostered studio co-member and outsider both `42501`. She knows her own 60 / 40000, so `(140000 − 40000) / (180 − 60) × 60 = 50000` is the lead's rate exactly. Rule whether `amount_cents` is owner/admin-only |
| **W2-R2-13 / W2-R5-05** (invoiced notes) | note — ruling owed · HIGH | **Live, re-measured per role on a real draft invoice:** `duration_minutes`, `billable` and `DELETE` all raise `P0001` for the **owner and the admin alike**; **`notes` rewritten by either → NO RAISE, 1 row** |
| **W2-R2-09** (the audit trigger has no `WHEN`) | MINOR · HIGH | **Live, re-measured two ways:** `zzzz_audit_time_entry_change_trg AFTER DELETE OR UPDATE … FOR EACH ROW`, **no `WHEN`** (every other AFTER trigger on the table has one); one ordinary admin adjust wrote **exactly one** `audit_logs` row — `time_entry.updated`, `organization_id` = the pricing studio, `user_id` = the admin, `old_values` **and** `new_values` present, `updated_by` = the admin, the row re-derived `40000 / studio_member / 60000` at 90 min. `old_values` **carries `notes`** (`old_values ? 'notes'` = t) — no new exposure, but a second copy of free text outside the rollup's frozen shape |
| **W2-R2-07** (no caller assert on `project_pricing_studio_id`) | MINOR · HIGH | **Live, re-measured:** a freshly created authenticated stranger reads **0** project rows through RLS and `public.project_pricing_studio_id(<that id>)` returns **the studio's uuid** — the body is the bare column, so the leaked fact is exactly `projects.studio_id`, gated only on guessing a uuid. §0.16 deviation |
| **`Designers manage their project time entries`** (00177, ALL, no `user_id` leg) | note · HIGH | Live, §0.17-untouched. Re-read on the installed policy set: `ALL` on `EXISTS (… p.designer_id = auth.uid())`, so the lead designer reads and may adjust or delete a colleague's row, notes included. HT-10's "members read own rows" does not reach her |
| **W2-R10-09 / W2-R10-10 / W2-R2-05/06/11/12/15/17/18 · W2-R5-04 · W2-R4-11/12** | note / MINOR | Live; round 12 touched none of those objects |

## HT-3-g's five cost notes, re-measured

| note | measured |
|---|---|
| **(i)** an ambiguous or empty tier prices `'none'`; with no employer seat NO party may stamp | **holds.** Tier rule: two employers → `NULL/none`; no seat → `NULL/none`; two owned → `NULL/none`. `00620` left all three alone |
| **(ii)** the seat test is a LIVE-seat test | **holds** — `h12`'s `42501`, re-measured on my own fixture |
| **(iii)** the HT-3-f(2) COST NOTE's self-repair is withdrawn; `00620` hands her the studio instead | **holds** — leg (e)/`g5`, and `g8`'s 31000 / 62000 |
| **(iv)** no hour is re-rated in either direction (P-4) | **holds** — migration `DO` block, `g2`, `g9`, `h10`, and my own replay |
| **(v)** a project opened by somebody who has since taken a seat elsewhere is left NULL | **holds, and it is the only shape the key reaches** — matrix row 5. The other four author standings pass the key (W2-R13-01) |

## The brief's read/refusal probes, re-measured (every call through RLS as the named actor)

| probe | result |
|---|---|
| the one-off stamp on a fixture with all four tier shapes (I used **ten**) | the matrix above: one employer → that employer/`employer`; two employers → `NULL/none`; owned only → that studio/`owned`; no seat → `NULL/none`; two owned → `NULL/none`; and the five author standings against an owned answer. `00620`'s statement verbatim stamped exactly the 6 it should, left 4, wrote **0** on a second run, and moved no time entry |
| every prior exploit shape of rounds 4–11 under HT-3-g | **all refused** — form A (`42501`, the tier message), the confederate seated `admin` in her workspace (`42501`, same message), she as a plain `member` naming her employer (`42501`, the *standing* message — a distinguishable sentence), self-promotion to `owner` of her employer (**0 rows**, no raise), a second seat for herself in her own org (`23505`), a foreign `created_by` rate INSERT (`42501` RLS), naming `original_created_by` on INSERT (**discarded to NULL**). Also newly probed and **shut**: an authenticated `admin` moving `organizations.status` or `.type` (→ `organization_admin_column_protected`), which would otherwise empty her employer tier AND the author key in one statement. The one that still **succeeds** is the HT-3-f(4) consent-free outsider (W2-R13-03) |
| a plain rostered member reading a teammate's row / notes / rate columns | **refused** — she reads **1 of 2** entry rows (her own) and **0** of the lead's, so `notes` and `hourly_rate_cents` are unreachable; **1** `time_entry_ledger` row; **0** rows of the lead's `studio_member_rates`. Her UPDATE and DELETE of the lead's row each touch **0** rows; rewriting her OWN row's `hourly_rate_cents` raises `23514` |
| `project_hours_total` per role | owner **180/180/140000** · admin **180/180/140000** · lead designer **180/180/140000** · rostered member **180/180/140000** · non-rostered studio co-member **42501 `the caller is not on this project`** · outsider **42501** (W2-R6-06) |
| the rollup never returns notes | **confirmed on the signature, the view and the rows.** `studio_hours_rollup`'s OUT names are exactly `bucket_key, bucket_label, member_id, member_name, entry_count, total_minutes, billable_minutes, billable_cents, internal_minutes` — **0** matching `notes`; `time_entry_ledger` has **0** columns matching `notes`; `prosecdef = f` (INVOKER, HT-38); the view is `{security_invoker=true}` and `anon` holds no privilege on it. Buckets per role: owner **2**, rostered member **1**, non-rostered co-member **0**, outsider **0**; a sixth `p_group_by` literal raises **22023** naming the five legal values |
| the audit trigger | **exactly one** row on an ordinary admin adjust, 0 → 1, with `organization_id` = the pricing studio, `user_id` = the admin, both value bags present, `updated_by` stamped, the row re-derived at 90 minutes |
| owner/admin writes cannot touch invoiced rows | **confirmed for both roles** — `duration_minutes`, `billable` and `DELETE` all raise `P0001 Time entry … is attached to invoice …`; only `notes` passes (W2-R2-13) |

## Doors I checked and found SHUT

| attempt | result |
|---|---|
| an authenticated `admin` moving `organizations.status` / `.type` (one statement that would kill both her employer tier and the author key) | **`organization_admin_column_protected`** — `guard_organization_admin_columns` freezes `status`, `type`, `subscription_tier`, `subscription_expires_at`, `business_verified*` for any caller with a non-NULL `auth.uid()` outside `service_role`. The `Org admins can update organization` policy has no `WITH CHECK`, so this trigger is the whole of the protection — and it holds |
| a plain `member` moving the AUTHOR's seat (the form-H statement without the admin seat) | **0 rows, no raise**, key unchanged — `Org admins can update/delete members` require `is_org_admin_or_owner` |
| any role reaching `project_author_books_elsewhere` | **none** — `proacl = {postgres=X/postgres}`; `authenticated`, `anon`, `service_role` all lack EXECUTE (asserted by postcondition (b2) and probed on the installed ACL) |
| any hour-pricing body naming the new key or the tier rule | **none** — postconditions (c)/(c2) assert it, and I re-read the installed `resolve_time_rate_cents` (reads `organization_members` once, for HT-3-e(2)'s owner-seat question) and `project_pricing_studio_id` (one column read) |
| any function other than the stamp writing `projects.studio_id` | **none besides the INSERT-time triggers** — `stamp_project_pricing_studio` is the only UPDATE writer; `set_project_studio_id` and `set_project_studio_id_owned` are INSERT-path |
| `00620` weakening `00563`'s guard to get its UPDATE through | **no trigger disabled or dropped** — `set_project_studio_id` exists, is ENABLED, and its `prosrc` still carries `studio_id_not_designer_studio`; postcondition (d) asserts both and the migration applied clean |
| re-pointing an already-stamped project | **`22023`** — bound (b) runs before the tier gate; naming the same studio is a no-op `RETURN` |
| DML through `time_entry_ledger` | **not possible** — `pg_relation_is_updatable` = 0. (`authenticated` does hold INSERT/UPDATE/DELETE on the view in `information_schema`, but that is the repo-wide default-privilege shape — `v_project_roster` and `project_unbilled_time` are identical — and the view is not auto-updatable, so there is no write path. Not a finding) |

---

## Pre-existing failures, listed separately as the brief asks

**Eight**, none of them W2's, all documented in `supabase/tests/KNOWN_FAILURES.md`: six in `commercial`
(the countersign/grant family — `authorized_schedule`, `design_services_authority`,
`design_services_gap_hardening`, `executed_on_paper`, `trade_rfq`, `trade_scope`) and two in `rls`
(`design_requests_test.sql` `FAIL 3b`, `studio_titles_test.sql` `FAIL f`). A ninth,
`commercial/direct_order_attribution_test.sql`, is clock-dependent (documented window 00:00–02:00 UTC)
and **passed** in this round's run. The runner's default `-k` points at a per-directory
`KNOWN_FAILURES.md` that does not exist, so it counts all of them as "unexpected"; the plan's gate line
passes `-k` explicitly.

`rls/studio_titles_test.sql` `FAIL f` again touches this program's mechanism and again means the
opposite of what it looks like: the sole-owner demotion it expects to raise `last_owner_protected` is
silently filtered by RLS to 0 rows first, so the seat IS protected and the self-demotion route into the
employer tier stays shut (re-measured above). The file is red for the wrong reason.

**Still red and still W1's:** `supabase/tests/edge_api/public_rpc_authorization_contract_test.sql` at
`:171`. Not in this round's gate list, not touched, ruling owed. **Fourteenth round of asking.**

---

## What I did not verify

- **Lane B, entirely** — phase 2 by scope, not a finding. Its carried copy obligations are unchanged;
  W2-R13-03 adds a fifth (the sole proprietor whose own book now names a stranger's studio needs a
  sentence, and she has no surface on which that project appears).
- **The fourteen commits' TypeScript beyond round 12's delta.** Round 12 touched TypeScript only through
  the generated `database.types.ts` (+4, regenerated clean). `use-time-tracking.ts` and `hooks/index.ts`
  are r1–r8's; I re-ran their gates, not their diffs.
- **`pnpm --filter @patina/designer-portal test` / `lint`, and any `DATA_MODE=live` e2e line** — outside
  the brief's gate list and lane-B-shaped (and per `patina-verification` no lint result outside
  designer-portal would have meant anything).
- **W2-R13-01 over HTTP.** Every statement it needs is an ordinary `authenticated` call the policies and
  grants admit (`Members can leave`; `Org admins can update/delete members`; the rate and entry INSERTs),
  but I drove them through `psql` with the session's JWT claims set, not through PostgREST. The `00620`
  half is a migration statement and has no HTTP form by construction.
- **Strata.** I touched no prod anything and did **not** re-run the fix pass's sizing query. Its reported
  numbers (28 projects, `studio_id IS NULL` = 0, so `00620` a no-op today) are its own measurement, not
  mine; the query is in `W2-fix-r12.md` §9 and must be re-read immediately before the push, because
  W2-R13-01's population is exactly `studio_id IS NULL` rows whose designer's owned tier answers and
  whose author holds no live non-guest seat elsewhere — a count that query reports under
  `owned_tier_answers` minus `owned_left_by_key`.
- **Concurrency and volume.** No two-simultaneous-stamp race (bound (b) plus the re-read `RETURNING` is
  the argument, not a measurement); no measurement of W2-R2-06's per-row DEFINER policy call.
- **Whether W2-R13-01 is a defect or the fifth cost note enlarged.** Both readings are set out with the
  measurements that separate them. Applying the brief's severity discipline literally, form S is one
  account, one statement, no second party, a project she did not create, a number she set — so I grade
  it MAJOR and leave the re-grade to the orchestrator.
- I staged and committed nothing. `supabase/config.toml` remains skip-worktree'd and untouched. Every
  probe script lives in the session scratchpad and ends in `ROLLBACK`; after all of them the `projects`
  table holds **0** rows matching my fixture prefixes and the billing suite re-ran **8/8** identical.
