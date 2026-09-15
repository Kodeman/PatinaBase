# W1 — fix pass for review round 10 (round 11 of the lane)

**Branch** `hour-tracking/server` @ `0339b877e` (pushed), two commits on `7b3742732`:

| commit | files |
|---|---|
| `5e9e8a91b` `fix(time): HT-3-b ruled — the employer studio prices the hour, ambiguity is 'none'` | `supabase/migrations/00599_resolve_time_rate_cents.sql`, `supabase/migrations/00602_projects_studio_id_on_insert.sql` |
| `0339b877e` `test(time): every case HT-3-b moves is rewritten, and two new pins` | `supabase/tests/billing/time_rate_resolution_test.sql` |

No other file is touched. `supabase/config.toml` is still `S` in `git ls-files -v` and appears in zero commits. `artifacts/…/rulings.md` and this report live in the main checkout only (the program's `artifacts/` tree is untracked there, so it does not exist in the worktree); no git command was run in the main checkout.

---

## What was built

### HT-3-b, in both bodies, identically

`resolve_time_rate_cents`'s step 2 and `set_project_studio_id_owned`'s stamp now read the same rule over the PROJECT DESIGNER's own `organization_members` rows:

```
EMPLOYER tier : studio.type='design_studio' AND studio.status='active'
                AND designer_seat.user_id = <the project's designer>
                AND designer_seat.status='active'
                AND designer_seat.role <> 'guest' AND designer_seat.role <> 'owner'
                → array_agg; EXACTLY ONE → it prices / is stamped
OWNED tier    : the same, with designer_seat.role = 'owner'
                → reached ONLY when the employer tier is EMPTY
                → EXACTLY ONE → it prices / is stamped
otherwise     : v_studio_id / NEW.studio_id stays NULL → step 3 → 'none'
```

The candidates are collected with `array_agg(DISTINCT studio.id)` and decided by `array_length`, so there is no `ORDER BY` and no `LIMIT 1` over a set of candidates anywhere in the choice. Every other key is gone: rate-existence, `owner_seat.created_at`, `joined_at`, `organizations.created_at`, `created_by`, member counts.

### W1-R10-02 — DISSOLVED, not fixed

The finding was that the rate-preference key `ORDER BY EXISTS (… studio_member_rates …)` carried no `effective_from` / `effective_to` span, so a studio holding only a future scheduled raise outranked the studio that can price today and the hour came out `NULL / 'none' / $0`. **That key no longer exists.** HT-3-b makes ambiguity an answer instead of a contest, so there is no preference left to give a date span to, in `00599` or in `00602`. The r8/r9/r10 fix (adding the span to the `ORDER BY`) was deliberately NOT applied — it would have preserved a choosing key the ruling deletes. `effective_from` survives only in tier 2's rate span, where W1-R1-11's UTC anchor lives, and the new postconditions pin that.

### W1-R10-01 — pinned and retracted (HT-3-c arm (a))

* **Retraction, not an edit.** The three sentences in `00599`'s banner / step-1 comment and `00602`'s banner claiming 00317's anti-aiming guard "is what makes the column trustworthy as a pricing key" are replaced by HT-3-c's statement: the guard BOUNDS the column to the studios the lead designer actively belongs to (its authenticated-INSERT arm asks only for `role <> 'guest'`), it does not choose among them, and a project whose designer NAMED its `studio_id` prices from that studio **even when she owns it** — a sole proprietor billing her own studio's client. W2's composer and the studio settings page are named as where a suspicious `studio_member_rates` row is seen.
* **The pin is new case (ac)**, which performs the project INSERT **through RLS** as a plain-`member` designer (studio S priced her 20000; she owns workspace W and priced herself 99900 there):
  * `ac1` LEG1 control — her NULL-aimed authenticated INSERT is REFUSED by 00563 (two candidates), so naming the column is the surface the product pushes her onto;
  * `ac2` / `ac2b` THE PIN — aimed at W: `99900 / studio_member / 199800 / authorized`, and `project_unbilled_time` reports `99900 / $1,998.00`. The failure message names HT-3-c and says that arm (b) would make it `20000 / studio_member / 40000` plus a refusal arm in `00602` beside the stamp;
  * `ac3` LEG3 control — the same designer aimed at S: `20000 / 40000`.

### New postconditions (replacing the deleted keys' ones)

`00599`: `designer_seat.user_id = v_designer_id` · `designer_seat.role <> 'owner'` present · `designer_seat.role = 'owner'` present · employer tier textually BEFORE owned tier · `role <> 'guest'` present · **exactly two** `public.organization_members` reads (was one) · **exactly two** `ORDER BY` clauses in the whole body (tier 1's authority pick, tier 2's rate span) · no `ORDER BY … created_at|joined_at` · no `ORDER BY … EXISTS` and no `priced.` alias · `public.studio_member_rates` read exactly once · no qualified `*.created_at` anywhere. The round-4/5/6/7 refusals (`employer.`, `arms_length`, `peer.organization_id`, `joined_at`, `studio.created_at`) are kept verbatim; the ruled-tiebreak postcondition (`priced.studio_id … owner_seat.created_at`) is deleted with the key it pinned.

`00602`: the same five tier pins against `NEW.designer_id`, plus no `ORDER BY` at all, no `studio_member_rates` read at all, and no `*.created_at` / `joined_at`. The trigger-name ordering check (read from `pg_trigger`, W1-R7-07's correct form), the BEFORE-INSERT-ROW shape check and the EXECUTE check are unchanged.

### Round-10 dispositions

| finding | disposition |
|---|---|
| **W1-R10-01** MAJOR — step 1 reads a caller-supplied column; nothing pinned it | **FIXED (pin) + ruling recorded.** Case (ac) above; arm (a) ruled by the orchestrator, recorded in `rulings.md` as HT-3-c and flagged to Kody; the "trustworthy as a pricing key" sentences retracted in both files. |
| **W1-R10-02** MAJOR (4th round open) — date-blind rate-preference key | **DISSOLVED** with the key's removal (above). Postconditions now make its return impossible in both bodies rather than making it date-aware. |
| **W1-R10-03** MAJOR — `project_time_entries`' two wide SELECT policies still expose the per-person rate | **NOT ours** (routed to W2's `00606` by the HT-10-a amendment). Unchanged by this pass, and still a hard precondition on the single deploy: **W1 must not reach Strata ahead of `00606`.** |
| **W1-R10-04** MINOR — case (z)'s false justification | **FIXED.** The parenthetical now says "the shape a direct PostgREST insert may carry — see HT-3-c and case (ac)", with the measured `useCreateProject` facts. |
| W1-R10-05 … W1-R10-12 | **carried unchanged.** Out of this brief (each is an owed ruling or a `00598`/`00600`/`00601` edit the brief does not name); every region they cite is byte-identical in this pass — the diff touches `00599`, `00602` and the billing test only. |
| NOTEs 1-8 | carried. NOTE 7 re-confirmed: with a RELATIVE `-k` from the worktree the `commercial` suite is 16/16, 0 unexpected; as the brief invokes it (no `-k`) the same six pre-existing files report as unexpected. |

---

## NEW, measured, and charged against the ruling: HT-3-b's consent-door residue

HT-3-b's text says a member "can only push the outcome toward 'none', never toward a number she set". That holds **for the member being priced** — cases (x) and (aa8) measure it. It does **not** cover a third party aimed at a designer who has no employer seat, and a studio's PRINCIPAL is exactly that designer (her seat is `owner`, so her employer tier is empty).

**Measured 1/1 on the isolated stack, every write through RLS as the actor named, rolled back** (`probe_r11.sql`, before the case was written):

```
principal owns studio P, seats her assistant `member` there, prices him 12000 (HT-3's surface)
stranger  = an ordinary designer signup; 00295 provisions it workspace W_s, which it OWNS
stranger  seats BOTH of them in W_s as plain `member`s   → ALLOWED (Org owners can insert members,
                                                            role <> 'owner', no consent, no invite)
stranger  writes the assistant's rate in W_s at 99900    → ALLOWED (studio_member_rates_admin_insert)
principal creates her next client project                 → 00602 stamps W_s  (her ONE employer tier)
assistant's hour on HER client's project                  → rate=99900 src=studio_member amount=199800
                                                            (authorized; her own 12000 ignored)
```

This is the same $1,998.00 rounds 3-8 each reported closed, reached through the door HT-3-b's arm (c) names. It is **pinned as built** by new case **(ad)** (failure messages say "PINS TODAY — HT-3-b(c) OWED" and state that arm (c) makes them `12000 / 24000`), and recorded in the HT-3-b row of `rulings.md`. Nothing is widened or narrowed in code: the three code-only narrowings available here are the ones rounds 5 and 6 rated blocker-grade (prefer a studio with more members / one she does not run / a rate she did not author), reading the owned tier first restores W1-R8-01, and "refuse an employer seat the designer did not accept" **is** arm (c).

**For the orchestrator to rule, not a fix round:** HT-3-b arm (c) (seats land `status='invited'`; only the named user activates her own seat) is the only closure, and it is product-wide.

## The other cost of HT-3-b, recorded rather than discovered later

A designer with **two owned studios and no employer** is priced by neither until a project names one. The commonest shape that reaches it is the principal who also owns the workspace `00295` provisioned at her `is_designer` flip — cases **(n)** and **(w)**, each with the repair asserted beside it (naming the studio at creation → the studio's own rate prices the hour). Round 8 answered `22000` in (w) and `22000` in (n); both are now `'none'`. A follow-on ruling (prefer a studio with more than one active member; or a default studio on her profile) would move `n1-n3` and `w1a-w4` and nothing else in the file.

Two further consequences the rewritten cases now carry, so nobody reads them as regressions:
* a designer who owns a workspace **and** has one employer is priced by the **employer**, on her own projects too, unless the project names a studio — case (p)'s `p4` (16000, was 99900) and case (s);
* `projects.studio_id` is writable **at INSERT only** for an authenticated actor (00563 raises on a later UPDATE of it outside postgres context), so HT-3-b's "the owner fixes 'none' by stamping `projects.studio_id`" is available at creation. Repointing an EXISTING 'none' project is not reachable through RLS today — recorded as owed, not patched (§0.12-style: 00563 is not this program's file to edit).

---

## Gates (verbatim, this pass, project `patina-hours` on `127.0.0.1:54422`)

| command | result |
|---|---|
| `npx supabase db reset --workdir /Users/kody/Code/patina-merged/.codex/worktrees/agent-server` | **clean**, exit 0 — `00598`…`00602` applied, every postcondition replayed, 27 seeds loaded, `Finished supabase db reset` |
| `scripts/run-sql-tests.sh -d …/supabase/tests/billing -H 127.0.0.1 -p 54422` | **6 / 6 green**, 0 unexpected |
| `scripts/run-sql-tests.sh -d …/supabase/tests/commercial -H 127.0.0.1 -p 54422` | 10 green / 6 unexpected-fail **as the brief invokes it**; from the worktree with `-k supabase/tests/KNOWN_FAILURES.md` → **16 / 16, 0 unexpected** (the same six pre-existing files, NOTE 7) |
| `scripts/run-sql-tests.sh -d …/supabase/tests/rls -f time_entry -H 127.0.0.1 -p 54422` | **1 / 1 green** |
| `scripts/run-sql-tests.sh -d …/supabase/tests/billing -f rate -H 127.0.0.1 -p 54422` | **1 / 1 green** — cases (a)–(ad) |
| `scripts/run-sql-tests.sh -d …/supabase/tests/rls -f studio_member_rates -H 127.0.0.1 -p 54422` | **1 / 1 green** |
| `pnpm --dir … --filter @patina/supabase type-check` | exit **0** |
| `pnpm --dir … --filter @patina/designer-portal type-check` | exit **0** |
| `pnpm --dir … --filter @patina/admin-portal build` | exit **0** |
| *beyond the brief:* whole `rls` directory with `-k` | **26 / 26** (24 green + 2 documented pre-existing) — includes `00563_proposal_signing_multi_studio.test.sql`, which the stamp change could have broken |
| `python3 scripts/generate-legacy-grants.py` → `git status --porcelain -- supabase/seed/00-legacy-grants.sql` | **empty** (baseline + 2610 replayed statements, byte-identical — no GRANT/REVOKE changed) |
| `SUPABASE_DB_URL=…:54422 pnpm --dir … db:generate` → `git diff --exit-code -- packages/supabase/src/database.types.ts` | **exit 0** (no schema change) |

## Not done / not verified

* **Nothing on Strata.** No `db push`, no prod probe, and no count of live studios that would land in (n)/(w)'s 'none' (a principal holding two owned studios) or in (ad)'s shape.
* **Lane B** absent (phase 2), so Done-when #3's render half and #5's printed role stay unverifiable.
* **W1-R10-05 … W1-R10-12** untouched by design (see the table).
* **Concurrency** unprobed: no two-session race between a seat INSERT and a project INSERT, which under HT-3-b decides between "exactly one" and "ambiguous".
* Designer-portal **lint** not run (the diff touches no designer-portal source).
