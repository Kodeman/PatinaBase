# W2 — lane A (DB) fix pass, round 11 · HT-3-g

**Two commits on `hour-tracking/server`, pushed (`origin/hour-tracking/server` = HEAD = `99910ac70`).**

| commit | files |
|---|---|
| `b8c373ea0` · `feat(time): HT-3-g — the pricing studio is a stamped column, not a derivation` | `00606`, `00615`, **`00620` (new)**, `supabase/seed/00-legacy-grants.sql`, `packages/supabase/src/database.types.ts` |
| `99910ac70` · `test(time): HT-3-g — every exploit fixture of rounds 4-11 re-measured` | **`tests/billing/legacy_project_studio_stamp_test.sql` (new)**, `tests/billing/time_rate_resolution_test.sql`, `tests/billing/time_entry_ledger_test.sql`, `tests/rls/time_entry_studio_stamp_test.sql` |

`supabase/config.toml` stays skip-worktree'd (`S`) and is in **none** of the thirteen commits on this branch (`git log … -- supabase/config.toml` → 0). Nothing reached Strata. Every command ran against this program's own stack, Postgres `127.0.0.1:54422`, `--workdir …/agent-server`; the shared 54322 stack was never touched.

Outside the tracked tree (this program's own documents, in the main checkout's untracked `artifacts/` — no git command was run there): `rulings.md` carries the new **HT-3-g** row and the three rewritten residual cells, and `build/plan-v2.md` carries the `00620` number-bookkeeping correction.

---

## What HT-3-g asked for, and what landed

### 1 · `00615` — NO READ-TIME DERIVATION (HT-3-g(1))

- **`resolve_time_rate_cents`** loses HT-3-b's step 2 **entirely**. The studio step is `projects.studio_id`, read in the same statement as `designer_id`; where it is NULL the body falls through to tier 3 and answers `'none'`. `v_project_author`, `v_employer_studios` and `v_owned_studios` are gone from the DECLARE block. Lineage `00599 → 00615` unchanged; HT-3-e(2)'s tier-2 clause and every one of 00599's re-asserted properties are untouched.
- **`project_pricing_studio_id`** becomes **one column read** (`LANGUAGE sql`, still `STABLE SECURITY DEFINER` with a pinned `search_path`). Lineage `00604 → 00615`. DEFINER is retained for a **new** reason, recorded in the banner and the `COMMENT`: as INVOKER it would answer NULL wherever RLS on `projects` hides the row, and `00606`'s owner/admin read policy keys on the answer, so an owner's read of her own studio's hours would follow her own project visibility.
- **Everything that asks that function therefore follows the stamped column and fails CLOSED on NULL** — `00604`'s ledger view, `00605`'s owner/admin write policies and its audit trigger's `organization_id`, `00606`'s `time_entries_owner_admin_read`, `00607`'s `project_hours_total` owner leg. No policy, grant or trigger was edited to achieve it.
- **HT-3-b's tier rule survives as ONE shared body** — `public.designer_tier_pricing_studio(p_designer_id) RETURNS TABLE (studio_id uuid, tier text)`, `tier ∈ employer | owned | none`, `STABLE SECURITY DEFINER`, `search_path` pinned, **EXECUTE held by no role** (the INSERT stamp is a DEFINER trigger function owned by `postgres` and `00620` runs as the migration role, so both reach it as the owner). It returns the **tier** and not only the studio because its two callers treat the tiers differently: at INSERT a single employer candidate overrides a studio `00563` merely DERIVED (W1-R11-02) while an owned candidate only fills a still-NULL column (`00603`'s open question); `00620` writes either.
- **`set_project_studio_id_owned`** (lineage `00602 → 00603 → 00615`) now calls that body instead of spelling the two tiers inline. `v_caller_named` / HT-3-c arm (a), the employer-overrides-DERIVED rule and the owned-arm's `NEW.studio_id IS NULL` guard are all preserved verbatim in behaviour.
- **HT-3-f(2) is DISSOLVED**: `owned_tier_prices_project` is deleted from the file, so the function never exists. It gated a derivation that no longer happens, and a postcondition in both `00615` and `00620` now asserts `to_regprocedure(...) IS NULL` so it cannot be resurrected as a filter on the one-off stamp — under it the honest principal of the HT-3-f(2) COST NOTE would be left at `'none'` for ever with no act available to anybody.

**Postconditions rewritten, and non-vacuous by construction.** `00615` now pins, by source: the resolver reads `public.organization_members` **exactly once** (HT-3-e(2)'s owner-seat question about the subject being priced — 00599's own assert pins it at two and is superseded by number, deliberately); the resolver mentions no `designer_seat`, no tier array, no `role <> 'owner'`, no `project.created_by` and **not even the shared body's name**; the callable form mentions `organization_members` **not at all**, plus no tier marker, no `ORDER BY`, no `studio_member_rates` and no `created_by`; neither hour-pricing body **calls** the tier rule; the INSERT stamp **does** call it and reads `organization_members` through nothing else; the shared body itself is employer-before-owned, "exactly one answers" in both tiers, two membership reads, and carries no ordering key, no date, no rate-existence key, no project authorship and nothing about the caller or the member being priced.

Two comments had to be **described rather than spelled** because `prosrc` includes comments and the asserts are `NOT LIKE` over it — the function name in the resolver's step-1 comment, and the actor-vs-designer comparison in `00606`'s bound (d). Both say so in place, so the next hand does not "restore" the wording and red the migration.

### 2 · `00620_legacy_project_studio_stamp.sql` — THE ONE-OFF STAMP (HT-3-g(2))

One bounded statement inside a `DO` block, plus its proofs. **The rule is the shared body and nothing else** — spelled inline it would drift from `00602`'s stamp, which is its only other caller.

```sql
WITH tiered AS (
  SELECT project.id AS project_id, answer.studio_id
  FROM public.projects AS project
  CROSS JOIN LATERAL public.designer_tier_pricing_studio(project.designer_id) AS answer
  WHERE project.studio_id IS NULL AND project.designer_id IS NOT NULL)
UPDATE public.projects AS project SET studio_id = tiered.studio_id
  FROM tiered WHERE project.id = tiered.project_id
   AND tiered.studio_id IS NOT NULL AND project.studio_id IS NULL;
```

- **`RAISE NOTICE` with the counts**, as the ruling asks. Measured on this stack (replayed in a rolled-back transaction to capture the text, the migration itself being idempotent): `00620 HT-3-g(2) one-off legacy stamp: 5 projects carried studio_id NULL; 0 stamped from HT-3-b's tier rule; 5 left NULL`. The five are the seeded projects of **one** designer who owns **two** active studios and holds no employer seat — an ambiguous owned tier, which HT-3-b makes an answer rather than a contest. That is the correct outcome and it is the shape of cost note (i) below.
- **Idempotent**, and stated as a property of the end state rather than by running it twice: a postcondition asserts there is no project whose designer's tier ANSWERS left with `studio_id NULL`, so a replay matches no row. The companion test additionally runs the statement a second time and asserts `ROW_COUNT = 0`.
- **P-4, proved rather than asserted**: the `DO` block counts `project_time_entries` and sums their `hourly_rate_cents` before and after, and raises if either moves. No hour is re-rated in either direction; hours logged before a stamp keep their `'none'`.
- **The `00563` guard admits it, verified rather than assumed.** `set_project_studio_id` is `BEFORE INSERT OR UPDATE` on `projects`; the migration role satisfies `v_postgres_migration` (`session_user = 'postgres'` with role `none`/`postgres`, 00563:106-107) and takes the early `RETURN NEW` at 00563:349 **after** the UPDATE-immutability checks, which forbid only `id`, `created_at`, `created_by` and `designer_id` — none of which this statement touches. The candidate-discovery block above that return is skipped because `NEW.studio_id` is NOT NULL by then. **No trigger was disabled**; a postcondition asserts `set_project_studio_id` still exists, is still ENABLED, and is still `00563`'s body, and the banner records the disable/re-enable remedy (never a DROP) should a later change to that guard ever refuse the statement.
- **No audit row, deliberately**: `stamp_project_pricing_studio` writes one because a PERSON acted; this is a migration with no actor and a row claiming one would be false. The ledger and the NOTICE are its trace. Stated in the banner rather than left as an omission.

### 3 · `00606` — DESIGNERS NEVER STAMP (HT-3-g(3))

The shipped body is now **four tests**, in this order, and the banner carries an explicit old→new map so the archaeology above it is not mistaken for the current shape:

| | test |
|---|---|
| (a) | the caller is an **owner or admin of the studio named** — unchanged |
| (a1) | that studio **EMPLOYS this project's designer**: an active, non-guest `organization_members` row with `role <> 'owner'` in an active `design_studio`. **ONE** read, a property of *(the designer, p_studio_id)* |
| (b) | a stamped project is **final** — unchanged, and now also the whole of what round 9's bound (c) did |
| (c) | the employer-tier gate (using (a1)), **positioned** after (b) and before (d) and the write |
| (d) | HT-3-e(1)'s **arm's-length rate**, now unconditional |

**Deleted:** bound (c)'s derivation read and confirm arm (there is nothing to confirm — the callable form is the column); bound (d)'s `00563` seat test and bound (e)'s tier `CASE`, both strictly implied by (a1); round 3's `created_by` **sibling** leg (the owned tier's half of standing); and bound (a2)'s **designer skip** (`v_actor <> v_designer_id`), the gap W2-R11-01 form A walked through in one statement. `v_designer_has_employer_seat` and `v_derived` are gone.

**Postconditions** pin all four removals by source — no `designer_seat.role = 'owner'`, no tier-branch variable, no `sibling`, no derivation read, no actor-vs-designer comparison **in either direction** (equality is round 5's reversed `(e2)`; inequality is round 3's skip) — plus the gate's **position** (after bound (b)'s sentence, before the arm's-length leg and before the write) and an `organization_members` read count of exactly one.

**A designer can still stamp** — but only a studio that EMPLOYS her, and only as its owner or admin (case (x) x7's shape, which W2-R6-01 rated a MAJOR for refusing). She gains nothing: an employer-tier seat is `role <> 'owner'` by definition, so HT-3-e(2) ignores any number she wrote for herself there.

---

## The judgment call, reported rather than assumed

HT-3-g(3) names **two conditions** ("owner/admin of the named studio AND the named studio is in the designer's EMPLOYER tier") and **four removals** ("no owned-tier arm, no sibling leg, no confirm arm, no designer arm"). **HT-3-e(1)'s arm's-length-rate leg is in neither list, so it is KEPT**, unconditionally, there being one tier.

Why that reading: the removals are enumerated precisely, and the leg **narrows** the act rather than widening it. What it costs an honest employer is only what it had to do anyway — a studio that has not priced the designer gets nothing from a stamp, because her hour prices `'none'` after it too. What it bounds: a one-account designer whose only rate rows in a studio carry her own id (cases (q) q7/q8). What it does **not** bound, and is not claimed to: the HT-3-f(4) outsider, who authors her rate in his own org under his own id and is arm's-length *by the test*, which asks about the **subject's** authorship.

**If the orchestrator reads the two conditions as exhaustive, the removal is one `IF`**, and cases (q) q7/q8 and (u)'s first legs move with it.

---

## Four costs, recorded as cost notes and each asserted as PASSING

1. **An ambiguous or empty tier has no act behind it.** A legacy project whose designer's employer tier is ambiguous or empty prices `'none'`, `00620` leaves it NULL by design — and where she holds **no employer seat at all**, **no party may stamp it**. Case **(o)** measures it in full: her own stamp of the studio she owns refused `42501` (o3), her hour `'none'` (o4), the colleague who would notice reading **0** rows (o5), her own 00295 workspace refused (o6 — W2-R4-03's residue dissolved), her **co-principal** (an admin of the very studio that should take the hours) refused because her only seat there is an owner seat (o7), and the tier rule answering nothing for her (o7b). The repair available to this shape is a **seat** change, not a stamp.
2. **HT-3-g(3)'s seat test is a LIVE-seat test** — W2-R8-03's fourth face. Once a hire has LEFT, her former employer may no longer stamp its own legacy project (case **(am)** am5, `42501`). So the act is one a studio must take **while the seat is live**, which is also the argument for `00620` running at ship. A seat-HISTORY test is not schema-answerable today (`organization_members` rows are DELETED, not closed), so changing it is a ruling.
3. **The HT-3-f(2) COST NOTE's self-repair is withdrawn.** The principal's own stamp of her own studio, which that note named as the repair and which case (ak) ak5 measured SUCCEEDING through round 11, is now **REFUSED** (ak5/ak5b). `00620` is what hands her the studio instead, measured by asking the same shared body the migration asks (ak5c) and by running the migration's own statement on her fixture (ak5d) before the money comes back at 31000 / 62000 (ak6).
4. **No backfill in either direction (P-4).** An hour logged before a stamp keeps its `'none'`: ai5, aa7f, ak6b, w-family, and `g9` of the new file.

## Two residuals re-measured, and they SURVIVE

- **HT-3-e(3)** (a second account she transfers her workspace to authors her rate there). `transfer_studio_ownership`'s last statement demotes `auth.uid()` to `admin` (00484:524-536), so the workspace **is** in her own employer tier and the account holding the title **is** its owner. Case **(q)** q13/q14/q15/q16 green on the HT-3-g bodies. Answer stays visibility, not another bound.
- **HT-3-f(4)** (the consent-free outsider). His seat in HIS org is an employer-tier seat for her — the one fact HT-3-g(3) asks about the designer — and he authored her rate there. Case **(z)** green: z3b the seat IS employer-tier, z4 his **stamp** succeeds (the confirm arm it used to ride on is gone), z5b her removal of the bogus seat undoes nothing, z6 his number on her hour, z7 her repair refused. Two differences recorded: the baseline is now `'none'` rather than her own 28000, so what he takes is a project nobody had stamped yet; and the **owed UNPIN is owed more sharply**, because a stamp is now the only writer of the column and there is no derivation to fall back to.

## One residual DISSOLVED

**HT-3-f(3)** (a legacy project she created herself while employed, then left). New case **(aj-ii)**: aj3 the answer is nothing, aj4 her hour is `'none'` where the residual's whole content was 99900, aj5 her own stamp of her workspace refused `42501`, aj6 the tier rule answering her own studio so `00620` is what would hand it to her at ship. What survives is **creation-time naming**, which is HT-3-c arm (a) and was never this residual — case (aj) is relabelled to what it always measured (its fixture inserts the project *after* she leaves, so `00563`'s one-candidate discovery had already written the column; the old label said "derivation").

---

## Tests — what moved, and why

**New file · `supabase/tests/billing/legacy_project_studio_stamp_test.sql`** (8th billing file). The tier rule on **all five shapes** — one employer → that employer/`employer`; two employers → NULL/`none`; owned only → that studio/`owned`; nothing → NULL/`none`; and **the honest principal** whose assistant opened her project → her own studio/`owned`, the leg that proves HT-3-f(2) is deliberately absent from the shared body. Then `00620`'s statement **copied verbatim** over the fixture (g1–g6), idempotence (g7), the money after the stamp (g8), P-4 (g2, g9), and the **live migration's end state** re-asserted (h1) so a seed change that reintroduces an unstamped-but-answerable project is caught by the suite as well as by the migration.

**Two new cases in `rls/time_entry_studio_stamp_test.sql`:**

- **(al) — W2-R11-01 form A, REFUSED.** The brief's second trigger word for word: one account, no seat change of any kind, a legacy project her **assistant** opened. al1 her one statement refused `42501` **with the message asserted** (every bound in the function raises 42501, so the message is what distinguishes the tier refusal from a standing refusal), al3 her hour `'none'` where round 11 measured 99900 / 199800 frozen for ever, **al4 the control twin in the same fixture reading identically**, al5/al5b the employer repairing **both** projects, al6 her hour at the employer's 26000 / 52000, al7 the employer reading all three hours (round 11 measured it reading **0** of the pinned project's).
- **(am) — W2-R11-01 form G, REFUSED, plus the cost of acting too late.** am0 the employer stamps one of two identical projects while her seat is live; am1 she leaves (1 row); am2 her stamp of her own workspace on the twin refused `42501` with the message; am3 the twin's hour `'none'`; am4 the stamped project still pricing the employer's 26000 **after** she has left; **am5 the employer now refused the twin** (cost note 2); am6 the employer reading 1 of 2.

**Rewritten rather than deleted, each naming HT-3-g in its failure message:**

| case | was | is |
|---|---|---|
| billing (x) x4/x5 | withdrawing the puppet seat restored the employer's 15000 — the DoS was self-reversing | the DoS is **sticky at the read** (x4/x4b), and the real employer's **stamp** is what ends it (x5/x5a), with the earlier hour keeping `'none'` (x5b) |
| (aa) aa7–aa7f | step 2 priced the legacy project 20000 / 12000 | `'none'` for the hire **and** her assistant, then Leah's stamp, then 20000 / 12000, then P-4 |
| (ad-ii) ad8–ad10 | W1-R11-01 reached the same 99900 on the LEGACY surface with no project creation at all | that surface is **dissolved**; the creation surface (ad7) stands and HT-3-b arm (c) is still OWED |
| (ai) | HT-3-f(2)'s closure, keyed on `created_by` | `'none'` from the start (ai0/ai1), the employer's stamp (ai2/ai3), and **probes C and D2 moving NOTHING** on a stamped column (ai4/ai6c) — the closure no longer asks who opened the project |
| (aj) / (aj-ii) | one case labelled as the residual | (aj) relabelled to creation-time naming; **(aj-ii)** is the residual's own shape, dissolved |
| (ak) ak5–ak5d | her own stamp SUCCEEDED, "the repair the ruling names" | her own stamp **REFUSED**, and 00620's rule is the repair |
| ledger (b2)/(b4b) | step 2's employer tier priced a NULL-studio project and the ledger named it | the three bodies **agree that there is no studio**, which is the equivalence that case exists for |
| rls (e) | HT-3-f(1)'s confirm of a derived studio | the act itself, its idempotence and its finality |
| rls (o) | the owned tier was her repair, and its residue was permitted | the owned tier is **nobody's**, W2-R4-03's residue dissolved, and the cost asserted in full (o3–o7b) |
| rls (q), (r), (w), (y), (z) | `'the honest employer prices this at baseline'` preconditions | `'none'` baselines, with the harm restated as *what the act writes* rather than *what the derivation moved*; (y) gains y6 (the employer's money after its stamp) |

**Two fixture repairs, reported because they are test-side changes and not behaviour:** case (x)'s and case (ai)'s fixtures never granted their lead designer the **designer domain role**, because nothing in them used to write `projects.studio_id` after INSERT. The stamp does, and `00563`'s fail-closed check (00563:352-362) asks the lead for it. The grant is added with a comment, after the seats and rates are settled, and it is not a pricing key. Case (ai)'s entry ids `…b5` and case (aa)'s `…b6/b7` were renumbered to avoid primary-key collisions with legs added later in the same file.

---

## Gates, verbatim, as run (all after the FINAL reset)

| command | result |
|---|---|
| `supabase db reset --workdir /Users/kody/Code/patina-merged/.codex/worktrees/agent-server` | **clean, through `00620`** — `Finished supabase db reset on branch main.` then `{"target":"local","version":"","message":"Reset local database."}`; `00606`, `00615` and `00620` all ran their postcondition `DO` blocks (they RAISE on failure). Ledger tail: `00607, 00615, 00620, 20260910152111` |
| `scripts/run-sql-tests.sh -d …/agent-server/supabase/tests/billing -H 127.0.0.1 -p 54422` | **8 green / 8**, `unexpected-fail: 0` (the new `legacy_project_studio_stamp_test.sql` among them) |
| `scripts/run-sql-tests.sh -d …/agent-server/supabase/tests/commercial -H 127.0.0.1 -p 54422` | **10 green / 16, 6 unexpected — all pre-existing and documented** (listed below) |
| `scripts/run-sql-tests.sh -d …/agent-server/supabase/tests/rls -H 127.0.0.1 -p 54422` | **28 green / 30, 2 unexpected — both pre-existing and documented.** `time_entry_studio_stamp_test.sql` PASS, `project_hours_total_test.sql` PASS, `studio_hours_rollup_test.sql` PASS, `time_entry_admin_write_test.sql` PASS, `studio_member_rates_test.sql` PASS, `00563_proposal_signing_multi_studio.test.sql` PASS |
| `pnpm --dir …/agent-server --filter @patina/supabase type-check` | **clean** (`tsc --noEmit`, exit 0, no output) |
| `pnpm --dir …/agent-server --filter @patina/designer-portal type-check` | **clean** (`tsc --noEmit`, exit 0, no output) |
| `pnpm --dir …/agent-server --filter @patina/admin-portal build` | **succeeds**, exit 0, full route table |
| `python3 ./scripts/generate-legacy-grants.py` (the **worktree's** copy, per §0.20) → `git diff` | baseline + **2630** replayed statements, diff **empty** after commit |
| `SUPABASE_DB_URL=…54422 pnpm db:generate` → `git diff --exit-code` on `database.types.ts` | **clean, exit 0** after commit |

**Pre-existing failures, listed separately as the brief asks — eight, none of them W2's.** Six in `commercial` are the documented countersign/grant family (`authorized_schedule`, `design_services_authority`, `design_services_gap_hardening`, `executed_on_paper`, `trade_rfq`, `trade_scope`); two in `rls` are documented (`design_requests_test.sql` `FAIL 3b`, `studio_titles_test.sql` `FAIL f`). `commercial/direct_order_attribution_test.sql` — the clock-dependent ninth entry W2-R10-05 documented — **passed** in this pass, the runs not having fallen inside its 00:00–02:00 UTC window. The runner's default `-k` points at a per-directory `KNOWN_FAILURES.md` that does not exist, so it counts all of them as "unexpected"; the documented set lives in `supabase/tests/KNOWN_FAILURES.md`.

**Still red and still W1's:** `supabase/tests/edge_api/public_rpc_authorization_contract_test.sql` at `:171` (W2-R4-08 / W2-R2-10) — not in this round's gate list, not touched, ruling owed. **Twelfth round of asking.**

---

## Reported, not assumed

1. **One real trap, found and closed inside this pass.** The first full gate run was done against a stack reset with the **stale** grants seed — the seed still named the deleted `owned_tier_prices_project`, its guard swallowed the `undefined_function`, and the baseline's blanket `GRANT EXECUTE` therefore left `designer_tier_pricing_studio` holding `anon`/`authenticated`/`service_role` EXECUTE. `00615`'s own postcondition passed (it runs at migration replay, **before** the seed), so nothing was red. Probing the installed ACL rather than trusting the assert caught it. The seed was regenerated, the stack **reset again**, and every gate above was re-run on the corrected state: `designer_tier_pricing_studio` now holds `{postgres=X/postgres}` and nothing else. **The lesson, for §0.20:** regenerating the ACL seed is not the last step — the reset after it is, because the seed runs after the migrations and can re-grant what a migration revoked.
2. **Probed on the installed objects, not the files.** `stamp_project_pricing_studio`: owned-tier arm **false**, sibling **false**, derivation read **false**, employer gate **true**, `public.organization_members` reads **1**. `project_pricing_studio_id`: body is `SELECT project.studio_id FROM public.projects AS project WHERE project.id = p_project_id` and nothing else. `resolve_time_rate_cents`: `organization_members` reads **1**, tier-rule call **false**. `designer_tier_pricing_studio`: DEFINER, ACL `{postgres=X/postgres}`. `owned_tier_prices_project`: **does not exist**.
3. **Behaviour beyond `00606`/`00615`/`00620` changed by consequence, and it is intended.** Because `project_pricing_studio_id` is now the column, `00605`'s owner/admin **write** policies and its audit trigger's `organization_id`, `00606`'s owner/admin **read**, and `00607`'s `project_hours_total` owner leg all fail closed on an unstamped project. The suites that own those objects (`time_entry_admin_write_test`, `project_hours_total_test`, `studio_hours_rollup_test`, `time_entry_ledger_test`) are green; the ledger test's own equivalence legs were rewritten to say so explicitly rather than passing by accident.
4. **HT-3-e(1)'s retained leg is the one place I exercised judgment** — set out above with the one-`IF` removal if the orchestrator reads HT-3-g(3)'s two conditions as exhaustive.
5. **Not done, and out of this lane:** lane B's two copy obligations (the principal's sentence, her admin's empty project lens) — now **three**, because HT-3-g adds a third: lane B owes the studio a way to SEE that a project prices `'none'` and a way to perform the stamp, since the whole repair is a human act and `00620` only covers rows that exist at ship. Also untouched: `plan-v2` §W6's `00616` file, W2-R6-06's inherited ruling (`amount_cents` owner/admin-only), W2-R2-13's invoiced-`notes` hole, and the **Strata count of `projects.studio_id IS NULL`** split by `created_by = designer_id` — which HT-3-g makes **less** load-bearing than it was (the split no longer separates a repair from a taking), but the plain count of `studio_id IS NULL` now **sizes `00620`'s own NOTICE**, so it is still worth one read-only query before the ship. **Twelfth round of asking.**
6. **No prod anything.** No `supabase db push`, no `functions deploy`, no Strata connection. W1's ordering constraint stands and grows one link: `00599`/`00601` must not reach Strata ahead of `00606`/`00615`, and **`00620` must be last** — it reads the shared tier body `00615` defines.
