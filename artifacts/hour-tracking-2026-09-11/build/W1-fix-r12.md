# W1 — fix pass, round 12

**Branch** `hour-tracking/server` @ `9e268065a` (worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-server`). One commit, three
files, `+459 −22`. No schema change: migration **comments** and one new test case.

**Verdict on the round-12 review: the finding is CORRECT and is now pinned.** I
reproduced it independently before writing anything, 1/1 end to end through
`public.sign_proposal`, and measured both of the extra controls the review named.
Nothing was skipped, and nothing the review told me not to patch was patched.

---

## W1-R12-01 — APPLIED as prescribed (pinned, not fixed)

### Reproduced first, on my own fixture

Probe (scratchpad, transaction-wrapped, every write through RLS as the actor named,
rolled back) against the isolated stack `127.0.0.1:54422`:

```
fixture  L owns S (owner seat first, studio_owner second → no employer seat)
         D = the project's LEAD DESIGNER: seated `admin` in S FIRST, studio_designer
             SECOND → 00295 provisions her nothing. ONE employer seat, owns nothing.
         M = the MEMBER BEING PRICED: ordinary designer signup (grant first → 00295
             hands her W_M, which she OWNS) + plain `member` of S
         L prices M 12000 in S · M prices herself 99900 in W_M  (both through RLS)

CONTROL      client I signs          → stamp S   · M's hour 12000 / studio_member / 24000
MANOEUVRE    as M: INSERT organization_members(D, W_M, 'member', 'active',
                    joined_at = 2000-01-01)       → D's employer tier = 2 candidates
THE SIGNATURE client II signs        → stamp W_M · M's hour 99900 / studio_member /
                                       199800 / authorized
                                       project_unbilled_time 99900 / 199800 ($1,998.00)

CONTROL B   identical seat, joined_at NULL       → stamp S · 12000 / 24000
CONTROL C   identical seat, status = 'invited'   → stamp S · 12000 / 24000
            (HT-3-b arm (c)'s shape — arm (c) closes this leg completely)
```

Measured, not inferred:
`organization_members.joined_at` is nullable with **no default**, `created_at` is
`NOT NULL DEFAULT now()`, `guard_org_membership_changes()` (read in
`00484`) constrains only `role`, `status`, `organization_id`, `user_id`, and the
bridge's `ORDER BY` is at **`00563:266-277`** (sibling-project preference →
`(role = 'owner') DESC` → `joined_at NULLS LAST` → `created_at` →
`organization_id`). With both candidates non-owner and no sibling for the second
client, `joined_at` is what decides — which is why CONTROL B reverts to `S`.

**Two clients, not one**, is load-bearing and is stated in the case's comment: the
bridge's FIRST key prefers a studio already holding a project for the same
designer–client pair, so reusing the control's client would let the control's own
project answer and hide the date key.

### (1) The pin — new case `(af)`

`supabase/tests/billing/time_rate_resolution_test.sql` (+399), under a
`REVIEW ROUND 12 (W1-R12-01)` header, after `(ae)`:

* the live path twice through `public.sign_proposal` as the CLIENT — the control
  (`af1`, `af2`, `af2b`: stamp `S`, `12000 / studio_member / 24000 / authorized`,
  view `12000 / 24000`) and the exploit (`af4`: stamp `W_M`; `af5`:
  `99900 / studio_member / 199800 / authorized`; `af5b`: view `99900 / 199800`);
* preconditions that keep the measurement honest and double as tripwires:
  `af0` (00295 gave M her own workspace), `af0b` (D begins with **exactly one**
  employer seat — the shape HT-3-b's cell calls safe), `af0c` (D owns nothing, so
  the owned tier and `(role = 'owner') DESC` cannot confound it), `af3a` (the seat
  landed **active** `member` — if it ever lands `'invited'` or raises, arm (c)
  shipped and the leg should be rewritten as a negative one), `af3b` (the
  manufactured `joined_at` is strictly earlier than D's real employer seat — the
  lever, with CONTROL B's measured values in the message), `af3c` (the tier now
  holds **two**, the state HT-3-b rules `'none'`), `af4a` (the signature still
  lands — if it ever RAISES, the fail-closed closure shipped);
* every failure message names **HT-3-b arm (c)** *and* **`00603`'s OPEN
  SUB-QUESTION**, and states the values each closure makes the assert take
  (`stamp S`, `12000 / studio_member / 24000`, view `12000 / 24000`);
* the two controls not spent as a third signature (joined_at NULL, status
  `'invited'`) are recorded in the case banner with their measured values.

The file's header index gains the round-12 entry, and `(ae)` — which round 11 added
without indexing — is indexed at the same time.

### (2) The three false statements, corrected

| statement | where | now says |
|---|---|---|
| "a consent-free seat aimed at a designer who ALREADY HOLDS an employer seat can only push it toward `'none'`" | `rulings.md` HT-3-b ruling cell | retracted in place with the measured values, the bridge cite, the three controls, and both closures; "any tier with more than one candidate is `'none'`" is scoped to `00599` step 2 and `00603`'s own tiers |
| "(x) and (aa8) … two employers → `'none'`" / "the single transition that yields a number" | `rulings.md` cell; `time_rate_resolution_test.sql` (ad-i) and (ad-ii) banners | scoped: true because (x)/(aa8) create their projects **as postgres**; on the live path an AMBIGUOUS tier also yields a number, and EMPTY → exactly ONE is the transition that yields one on *every* path |
| "the choice is independent of the member being priced, so a member can only push the outcome toward 'none' — never toward a number she set" (W1-R12-02) | `00599:136-138` banner **and** `:288-290` step-2 comment | both retracted in place, with both measurements (W1-R11-01 and W1-R12-01) and the property that actually holds: *a member can push the outcome toward `'none'` only where the decision is step 2's or `00603`'s; where it is `00563`'s bridge the answer is decided on dates the seating caller writes* |

### (3) `00603`'s ambiguous arm — NOT patched

No code changed in `00603`'s body. Its banner gains:

* **"THE OPEN SUB-QUESTION IS NOT COSMETIC (W1-R12-01)"** — the measured values,
  the bridge's remaining keys, the three controls, and the statement that no
  code-only closure exists that does not key on the member being priced (HT-3-a)
  or re-introduce a ranking key among employer candidates (rounds 4-7), including
  why restricting the bridge to the employer tier does not help (both candidates
  *are* employer-tier seats);
* **"RETRACTED BY LINE"** — `00602:98-99` and `00602:104-108` named and retracted
  with the measured values (this is **W1-R12-03**'s exact fix, done here because
  the new case's failure messages reference the sub-question);
* its stale `(ad)`/`(af)` cross-reference corrected to `(ad-i)`, `(ad-ii)` and the
  new `(af)`.

**Stale cite fixed while there:** `00603`'s banner (and my new case comment) cite
`00563`'s fail-closed check as **`:326-346`**, not `:352-362` — `:352-362` is the
`v_actor_is_admin` block. Read from the file.

---

## Not applied, and why

* **W1-R12-02** — applied in full (it is item 2 of W1-R12-01's own exact fix).
* **W1-R12-03** — applied in full (the retraction paragraph above), for the same
  reason.
* **W1-R12-04 … W1-R12-15 and NOTEs 1–9** — MINOR, outside the brief's
  blocker/major scope, untouched and still open. Two of them remain worth the
  orchestrator's attention before the single deploy: **NOTE 3 / W1-R10-03** (the two
  wide SELECT policies — W1 must not reach Strata ahead of W2's `00606`) and
  **W1-R12-05** (a scheduled future raise makes that day's rate uncorrectable).

## Owed rulings, unchanged in number, sharper in consequence

1. **HT-3-b arm (c)** — seats land `status = 'invited'`; only the named user
   activates her own seat. Already OWED. **Measured this round to close W1-R12-01
   completely** (CONTROL C) as well as W1-R11-01.
2. *or* **an ambiguous employer tier must fail closed on the activation path** —
   refuse the signature, or leave the column NULL and amend `00563`'s check. This
   is the edit to the signing ceremony `00603`'s banner flags.

Either closure makes every `(af)` assert read the control's values; `(af)`'s
messages say so, and `af3a`/`af4a` tell a future reader which closure landed.

---

## Gates (all re-run after the edits, isolated stack `patina-hours`, `127.0.0.1:54422`)

| command | result |
|---|---|
| `npx supabase db reset --workdir …/agent-server` | **clean** — `Finished supabase db reset`, all 27 seeds |
| `run-sql-tests.sh -d …/supabase/tests/billing -H 127.0.0.1 -p 54422` | **6 / 6 green**, 0 unexpected |
| `run-sql-tests.sh -d …/supabase/tests/commercial -H … -p 54422` | 10 green / **6 unexpected-fail as the brief invokes it**; from the worktree with relative `-k supabase/tests/KNOWN_FAILURES.md` → **16 / 16, 0 unexpected** (the six are pre-existing, NOTE 6) |
| `run-sql-tests.sh -d …/supabase/tests/rls -f time_entry -H … -p 54422` | **1 / 1 green** |
| `run-sql-tests.sh -d …/supabase/tests/billing -f rate -H … -p 54422` | **1 / 1 green** — `(a)`–`(af)`, and the `(af)` NOTICE fires (verified by running the file under `psql` directly) |
| `run-sql-tests.sh -d …/supabase/tests/rls -f studio_member_rates -H … -p 54422` | **1 / 1 green** |
| `python3 …/scripts/generate-legacy-grants.py` | baseline + **2612** statements, `git status --porcelain -- supabase/seed/00-legacy-grants.sql` **empty** |
| `SUPABASE_DB_URL=…:54422 pnpm --dir … db:generate` | `git diff --exit-code -- packages/supabase/src/database.types.ts` → **exit 0** |
| `pnpm --dir … --filter @patina/supabase type-check` | exit **0** |
| `pnpm --dir … --filter @patina/designer-portal type-check` | exit **0** |
| `pnpm --dir … --filter @patina/admin-portal build` | exit **0** |

## Hygiene

Explicit pathspecs only: `supabase/migrations/00599_resolve_time_rate_cents.sql`,
`supabase/migrations/00603_project_studio_id_named_vs_derived.sql`,
`supabase/tests/billing/time_rate_resolution_test.sql`. `supabase/config.toml` is
still `S` in `git ls-files -v` and in zero commits. No `git add -A`. Every git and
pnpm call used `-C` / `--dir` against the worktree; nothing ran in the main
checkout. `rulings.md` is edited in the main checkout only (untracked on this
branch), as in round 11.

## Not verified

* **Nothing on Strata** — no `db push`, no prod probe. Not sized: how many live
  projects have a lead designer with two or more active non-guest non-owner seats.
* **Lane B** — absent (phase 2), so Done-when #3's render half and #5's printed
  half stay unverifiable.
* **Concurrency** — no race between a seat INSERT and a signature.
* The 12 carried MINORs were not re-measured this round; the review round 12 had
  just re-verified each in place and none of my edits touch their regions except
  `00599`'s and `00603`'s banners.
