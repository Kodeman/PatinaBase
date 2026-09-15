# W2 — lane A (DB) fix pass, round 10

**Commit `4ca12439d` — `fix(time): W2-R10 — the confirm belongs to the employer`** on
`hour-tracking/server` (pushed; `origin/hour-tracking/server` = HEAD). Five files, +708 / −22.
`supabase/config.toml` stays skip-worktree'd (`S`) and is in none of the eleven commits. Nothing
reached Strata; every command ran against this program's own stack, Postgres `127.0.0.1:54422`,
`--workdir …/agent-server`. The shared 54322 stack was never touched.

| file | delta |
|---|---|
| `supabase/migrations/00606_time_entries_studio_read_narrow.sql` | +125 / −9 — bound (c) amended, its postcondition re-pinned, banner + `COMMENT` |
| `supabase/migrations/00615_self_authored_rate_requires_ownership.sql` | +29 / −7 — the two vacuous ordering asserts, the membership-read count, one `COMMENT` clause |
| `supabase/tests/rls/time_entry_studio_stamp_test.sql` | +393 / −7 — cases **(y)** and **(z)**, legs **x7/x8** |
| `supabase/tests/billing/time_rate_resolution_test.sql` | +168 — case **(ak)** |
| `supabase/tests/KNOWN_FAILURES.md` | +1 — the ninth failure, documented with its window |

Outside the tracked tree (this program's own documents, in the main checkout's `artifacts/`, which is
untracked — no git command was run there): `rulings.md` carries the three new records, and
`build/plan-v2.md` carries the two number-bookkeeping corrections and the grants-seed gate line.

---

## What was applied

### 1 · HT-3-f(1) AMENDED — the confirm belongs to the employer (W2-R10-01)

`00606` bound (c), which round 9 opened as a CONFIRM, is split:

```
v_derived := public.project_pricing_studio_id(p_project_id);
IF v_derived IS NOT NULL THEN
  IF v_derived IS DISTINCT FROM p_studio_id THEN      -- unchanged: another studio prices it
    RAISE … 'another studio already prices this project''s hours …';
  END IF;
  IF NOT v_named_is_employer_seat THEN                -- NEW: the confirm is the employer's
    RAISE … 'a studio already prices this project''s hours — there is nothing to repair';
  END IF;
END IF;
```

- `v_named_is_employer_seat` is bound (a1)'s existing fact (active, non-guest seat in the named
  studio with `role <> 'owner'`, active `design_studio`) — no new read, no new query.
- The owned-tier refusal is the **pre-round-9 sentence, word for word** (`git show
  ef4cc2d57:…00606…` line 514) and the same `22023`, so the refusal a reviewer measured as the
  negative control is literally the one that ships.
- The caller still has to be an owner/admin of the studio named (bound (a), untouched), and bounds
  (a2), (b), (d), (e) are untouched.
- Not reached where the derivation is silent: a legacy project that is honestly `'none'` is still
  repairable by HT-3-a's stamp, including by the designer herself in the owned tier (case (ak) ak5
  measures exactly that path after the amendment).

**Postcondition, non-vacuous by construction.** The existing bound-(c) assert lost its
`IS NOT NULL AND` spelling (the code no longer reads that way) and a second assert was added that
pins both the literal and its POSITION:

```
prosrc LIKE '%IF NOT v_named_is_employer_seat THEN%'
AND position('v_derived := public.project_pricing_studio_id(p_project_id)' in prosrc)
      < position('IF NOT v_named_is_employer_seat THEN' in prosrc)
AND position('IF NOT v_named_is_employer_seat THEN' in prosrc)
      < position('(d) 00563''s own bound' in prosrc)
```

A gate above the derivation read would not be bound (c) at all, and a gate below bound (d) would
refuse callers bound (d) already refuses for another reason. Probed on the installed body after the
clean reset: both comparisons `t`.

### 2 · The ordering postconditions made non-vacuous (W2-R10-04)

`00615`'s HT-3-f block pinned `position('v_employer_studios' …) < position('v_owned_studios' …)` for
the callable form and the INSERT stamp; in both bodies the first occurrence of each is the DECLARE
block, so the assert measured declaration order. Both now pin the **tier READS** — the `into
<array>` that consumes each SELECT — in the lowercased source those two texts are built from, plus a
`> 0` leg so a missing literal fails loudly rather than comparing zeros:

```
position('into v_employer_studios' in v_callable) < position('into v_owned_studios' in v_callable)
position('into v_employer_studios' in v_stamp)    < position('into v_owned_studios' in v_stamp)
```

The resolver's own copy was already anchored that way and is unchanged. Probed: the callable form's
lowercased definition contains `into v_employer_studios` (`t`).

Carried half of the same class, also fixed: the callable form's membership-read count now counts
`public\.organization_members` rather than the bare table name, so a later hand who merely *names*
the table in a comment inside that body no longer reds the migration. Still a spelling heuristic —
the behaviour is measured by cases (ai)/(aj)/(ak) and (e)/(w)/(x)/(y)/(z).

### 3 · HT-3-f(4) recorded, and measured as passing (W2-R10-02)

Recorded in `rulings.md`, in `00606`'s bound (c) banner and in the function's `COMMENT`: the
employer-tier bound does **not** reach the consent-free outsider, because his seat in his own org IS
an employer-tier seat; the owed closure is HT-3-b arm (c)'s consent door (the People-room program's),
and **this program records that an owner-initiated UNPIN / re-derivation act is owed WITH that door**
— a ruling owed, not built here.

New case **(z)** of `time_entry_studio_stamp_test.sql` asserts the taking **succeeding**, loudly
labelled, so the next round moves a test instead of re-finding it: z0/z0b her own workspace pricing
her own book at 28000 → z1 his consent-free seat + her rate under his id → z3 the derivation moving
to his org → **z4 his confirm SUCCEEDS** → z5 she removes the bogus seat and the derivation no longer
reverts (the column is final) → z6 her next hour prices `99900 / studio_member / 199800`, his number
→ z7 her own repair refused, with the owed act named in the assertion message.

### 4 · The designer's own hand, refused — case (y)

The `w`-shaped case the review asked for, in the DESIGNER's hand, on HT-3-f(3)'s own shape (she
created the project herself; her employer tier is empty; the derivation names the workspace she
owns):

| leg | assertion |
|---|---|
| y0 / y1 | the derivation names her workspace; the column is NULL |
| **y2** | **her confirm of her own workspace is REFUSED** — `22023`, and `SQLERRM` must carry the pre-round-9 sentence, so it is bound (c)'s owned-tier arm speaking and not a standing refusal wearing the same clothes; the column stays NULL (y2b) |
| y3 | and it costs her nothing she has today — her hour still prices `99900 / studio_member` from the derivation, with no pin (HT-3-a arm (a), HT-3-f(3)) |
| y4 / y4b | an honest employer hires her and prices her 26000; unpinned, the project follows HT-3-b and her hour prices `26000 / studio_member / 52000` — the money a pre-employment pin would have frozen at 199800 |
| y5 | and HT-3-f(1)'s ruled remedy is intact: that employer's owner may still pin it |

### 5 · W2-R10-03's shape — case (ak), billing suite, beside (ai)/(aj)

An honest studio, no manoeuvre: the principal owns her studio and holds no employer seat; her
ASSISTANT (an `admin` of that same studio) opened her legacy project. ak0 the shape · ak1 the
derivation answers NULL · **ak2 her hour prices `NULL / none / NULL`** where her studio's 31000 would
have priced it · ak3 her own studio's admin reads **0** of the hours · ak4 that admin's repair is
refused `42501` (the owned tier's sibling leg) · **ak5 her own stamp of her own studio SUCCEEDS** ·
ak6 her next hour prices `31000 / studio_member / 62000`, and ak6b the earlier hour keeps its
`'none'` (P-4). So HT-3-f(2)'s ruled sentence holds, which is why it is recorded as a cost and not a
contradiction — and **lane B owes the principal a sentence and her admin an explanation for an empty
project lens**.

### 6 · W2-R10-07 — the capability restored to both parties, measured (legs x7/x8)

Case (x) gained a second legacy project of the same shape (x2 stamps the first and bound (b) then
makes it final, so a fresh one was needed) and two legs: **x7** the admin-designer of an HONEST
employer repairs her own legacy project by naming that employer — HT-3-d admits her, W2-R6-01 rated
refusing her a MAJOR, and it is also the amended confirm in her hand on the side of the line that is
hers (a1 is an employer-tier studio) — and **x8** her hour there still prices `'none'`, so the column
is standing and not pricing.

### 7 · W2-R10-08, W2-R10-05, W2-R10-06, W2-R8-04 — the notes with a concrete action

- **W2-R10-08** — `owned_tier_prices_project`'s `COMMENT` now says `projects.created_by` is NOT NULL
  (an INSERT of NULL raises `23502`), so its two NULL legs are defensive and no legacy row reaches
  `'none'` through a NULL author. Probed: the comment carries `W2-R10-08` (`t`).
- **W2-R10-05** — `commercial/direct_order_attribution_test.sql` is now documented in
  `supabase/tests/KNOWN_FAILURES.md` with the **window named**: fails only between 00:00 and 02:00
  UTC, at `:488`, because the tie fixture's two `designer_clients` rows (`NOW() - 2 hours` /
  `- 1 hour`) fall on different UTC dates in that window and the attribution rule groups by day.
  **Re-measured this pass, not inherited:** at `01:35 UTC` the file fails with exactly
  `two roster designers on one day must file the order uncredited, got da000000-…-00d2`, and the same
  file in the same minute under `PGTZ=America/Chicago` runs to `ROLLBACK` with no error. Not this
  program's file; the entry names the one-expression repair for whoever owns it. (The file was already
  prettier-drifted before this pass — checked against `HEAD~1`'s copy — so the pre-commit formatting
  warning is pre-existing, not introduced.)
- **W2-R10-06** — `plan-v2.md` §0.20 now carries the rule: always invoke the **worktree's** copy,
  `python3 ./scripts/generate-legacy-grants.py` from the lane's `--workdir`, never the absolute
  main-checkout path, because the script resolves the repo root from its own location and the hazard
  is silent in the dangerous direction. This pass regenerated from the worktree's copy: *"wrote
  …/agent-server/supabase/seed/00-legacy-grants.sql — baseline + **2630** replayed statements"*, and
  `git diff` on that path is empty (this round adds no GRANT or REVOKE). Nothing was run in the main
  checkout.
- **W2-R8-04** — the collision the two documents prescribed is gone: `plan-v2.md:25` and `:708` now
  say `00615` is **spent by W2**, that W5 mints nothing, that `00616–00617` stay W6's and that the
  only unspent number in the range is `00617`; the ship note is instructed to say `00615` is W2's
  rather than unused. `rulings.md`'s own sentence ("W5 mints from `00616`") is corrected to match.

---

## Gates, verbatim, as run

| command | result |
|---|---|
| `supabase db reset --workdir /Users/kody/Code/patina-merged/.codex/worktrees/agent-server` | **clean** — `Finished supabase db reset on branch main.`, then `{"target":"local","version":"","message":"Reset local database."}`; both migrations' postcondition blocks ran (they raise on failure) |
| `scripts/run-sql-tests.sh -d …/agent-server/supabase/tests/billing -H 127.0.0.1 -p 54422` | **7 green / 7**, `unexpected-fail: 0` — `time_rate_resolution_test.sql` PASS, and its notice line confirms case **(ak)** |
| `scripts/run-sql-tests.sh -d …/agent-server/supabase/tests/commercial -H 127.0.0.1 -p 54422` | **9 green / 16, 7 unexpected — all pre-existing, none W2's** (listed below) |
| `scripts/run-sql-tests.sh -d …/agent-server/supabase/tests/rls -H 127.0.0.1 -p 54422` | **28 green / 30, 2 unexpected — both pre-existing and documented.** `time_entry_studio_stamp_test.sql` PASS; its notices confirm cases **(x)** (with x7/x8), **(y)** and **(z)** |
| `pnpm --dir …/agent-server --filter @patina/supabase type-check` | **clean** (`tsc --noEmit`, no output) |
| `pnpm --dir …/agent-server --filter @patina/designer-portal type-check` | **clean** (`tsc --noEmit`, no output) |
| `pnpm --dir …/agent-server --filter @patina/admin-portal build` | **succeeds**, full route table |
| `python3 ./scripts/generate-legacy-grants.py` (worktree's copy) → `git diff` | baseline + **2630** statements, diff **empty** |
| `SUPABASE_DB_URL=…54422 pnpm --dir …/agent-server db:generate` → `git diff` | diff **empty** — no public-schema change this round (function bodies and comments only) |

**Pre-existing failures, listed separately as the brief asks — nine, none of them W2's.** Six in
`commercial` are the documented countersign/grant family (`authorized_schedule`,
`design_services_authority`, `design_services_gap_hardening`, `executed_on_paper`, `trade_rfq`,
`trade_scope`); the **seventh in that directory is `direct_order_attribution_test.sql`**, the
clock-dependent one this pass documented (W2-R10-05) — it fails in this run because the run fell at
01:35 UTC, inside its window. Two in `rls` are documented: `design_requests_test.sql` (`FAIL 3b`) and
`studio_titles_test.sql` (`FAIL f`). The runner's default `-k` points at a per-directory
`KNOWN_FAILURES.md` that does not exist, so it counts all of them as "unexpected"; the documented set
lives in `supabase/tests/KNOWN_FAILURES.md` (the plan's own gate line passes `-k` explicitly).

**Still red and still W1's:** `supabase/tests/edge_api/public_rpc_authorization_contract_test.sql` at
`:171` (W2-R4-08 / W2-R2-10) — not in this round's gate list, not touched, ruling owed. **Eleventh
round of asking.**

---

## Reported, not assumed

1. **Case (y)'s y2 is a real measurement of this change.** Before the amendment that call SUCCEEDED
   (the review measured it as probe D1 and as W2-R10-01's whole finding); after it the call raises
   `22023` with the pre-round-9 message, which is why y2 asserts the MESSAGE and not only the
   SQLSTATE — bound (a2), (d) and (e) all raise `42501`, so a message check is what distinguishes
   bound (c)'s arm from a standing refusal.
2. **The amendment is one condition on one arm.** No read added, no policy touched, no grant changed,
   no type changed; `set_project_studio_id` is still 00563's body and no trigger is recreated. That
   is why `database.types.ts` and the ACL seed both regenerate to an empty diff.
3. **HT-3-f(4) is measured as OPEN, deliberately.** Case (z) will go red the day the consent door or
   the unpin lands — its assertion messages say so and name which leg to rewrite.
4. **What HT-3-f(2)'s cost note does NOT claim.** ak3 measures the admin's *read* (0 rows) and not
   `project_hours_total`'s `42501`; the latter was measured by the reviewer as probe I2c and is not
   re-asserted here, because the function's own per-role coverage lives in
   `rls/project_hours_total_test.sql`.
5. **Not done, and out of this lane:** lane B's two copy obligations (the principal's sentence and the
   admin's empty-lens explanation), `plan-v2` §W6's `00616` file itself, the `v_org_reads`-class
   spelling gates beyond the two touched here, and the **Strata count of `projects.studio_id IS NULL`
   split by `created_by = designer_id`** — still uncounted, now eleven rounds asked, one read-only
   two-column query, and it is what sizes W2-R10-01, W2-R10-03, W2-R8-02, HT-3-f(3) and this
   program's ship note.
6. **No prod anything.** No `supabase db push`, no `functions deploy`, no Strata connection. W1's
   ordering constraint stands: `00599`/`00601` must not reach Strata ahead of `00606`/`00615`, and
   `00615` now carries three rules.
