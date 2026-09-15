# W1 — adversarial review, round 2 (lane A, `hour-tracking/server`)

**clean = false** — 1 blocker, 3 major.

Reviewer context: separate from the implementer. Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-server`,
isolated stack `patina-hours` (Postgres `127.0.0.1:54422`). The shared `:54322` stack was never touched.
No prod mutation, no `supabase db push`, no git write in the main checkout or the worktree.

Diff under review: `origin/hour-tracking/integration..hour-tracking/server` —
`b39ba9ec2` (migrations) · `d048bad36` (hooks) · `906b94ab6` (tests) · `f0cf9a177` (round-1 fixes).
14 files, +3233/−8.

---

## 1 · Gate results, run by the reviewer

| Gate | Result |
|---|---|
| `supabase db reset --workdir …/agent-server` | **clean** — `00595 → 00596 → 00597 → 00598 → 00599 → 00600 → 00601 → 20260910152111`, all 36 seed files, no error |
| `run-sql-tests.sh -d …/supabase/tests/billing` | **FAIL** — `total 6 · green 5 · unexpected-fail 1 · effective-green 5/6`; `time_unbilled_view_repair_test.sql:327` → `ERROR: FAIL live0 (W1-R1-16): the live path must rate this row from studio_member_rates, got NULL`. Reproduced **4/4** |
| `run-sql-tests.sh -d …/supabase/tests/commercial` | `total 16 · green 10 · unexpected-fail 6 · effective-green 10/16` — the same six documented pre-existing aborts (all inside `_countersign_design_services_agreement_impl`), but reported as *unexpected*, with and without `-k …/supabase/tests/KNOWN_FAILURES.md` (see W1-R2-06) |
| `run-sql-tests.sh -d …/supabase/tests/rls -f time_entry` | PASS 1/1 |
| `run-sql-tests.sh -d …/supabase/tests/billing -f rate` | PASS 1/1, and **5/5** on repeat |
| `run-sql-tests.sh -d …/supabase/tests/rls -f studio_member_rates` | PASS 1/1 |
| `run-sql-tests.sh -d …/supabase/tests/rls` (whole dir) | `26 · green 24 · fail 2` — `design_requests_test.sql`, `studio_titles_test.sql`, both documented |
| `run-sql-tests.sh -d …/supabase/tests/field` | `6 · green 5 · fail 1` — `field_capture_note_routing_test.sql`, documented |
| `pnpm --filter @patina/supabase type-check` | clean (`tsc --noEmit`, no output) |
| `pnpm --filter @patina/designer-portal type-check` | clean |
| `pnpm --filter @patina/designer-portal test -- use-time-tracking-authority` | PASS, 3/3 |
| `pnpm --filter @patina/supabase test -- use-studio-member-rates` | PASS, 7/7 |
| `pnpm --filter @patina/designer-portal test` (full) | `573 suites / 7260 tests passed` |
| `pnpm --filter @patina/admin-portal build` | succeeded (the real type gate after a `packages/*` edit) |
| `db:generate` (SUPABASE_DB_URL → `:54422`) + `generate-legacy-grants.py` → `git status --short` | **empty** — generated files in sync |
| commit hygiene (`git show --stat` ×4) | files match messages; no stray paths; **`supabase/config.toml` absent from every commit** |
| migration numbers across every ref (`git fetch --all --prune`, `git ls-tree` per ref) | `people-room-crm :: 00592–00594` · `hour-tracking/integration :: 00595–00597` · `hour-tracking/server :: 00595–00601`. No collision. `00602`/`00603` correctly have no file |

## 2 · Program-rule audit (nothing violated except where a finding says so)

- **Additive only** — `00600` is two `ADD COLUMN IF NOT EXISTS` plus two named CHECKs. No column dropped, retyped or renamed on `project_time_entries`.
- **No flags** — no `useFeatureFlag` / PostHog / `ComingSoon` anywhere in the diff.
- **No backfill** — zero `UPDATE … project_time_entries` statements in `00598–00601`. `00602` (architecture.md's re-rating UPDATE) has no file.
- **Client rate discarded, not trusted** — probed as `authenticated`: `INSERT … (hourly_rate_cents) VALUES (99999)` on a non-services project stored `hourly_rate_cents 13000 · rated_amount_cents 13000 · billing_state authorized · rate_source studio_member · rate_role support_designer`. Done-when #2 holds.
- **Guard column list extended in BOTH places** — live `pg_trigger` reads `aab_… BEFORE UPDATE OF project_id, billing_authority_id, authority_rate_id, hourly_rate_cents, rated_amount_cents, billing_state, rate_source, rate_role` and the function body carries `rate_source`/`rate_role` in the `IS DISTINCT FROM` chain; `aac_… BEFORE INSERT OR UPDATE OF …, rate_role`. §0.8 satisfied, and `00600`'s own postcondition asserts both.
- **No second BEFORE INSERT trigger** (n9) — the live BEFORE-INSERT set is exactly `aaa0_time_entry_auto_roster_trg`, `aaa_guard_time_entry_invoice_insert_trg`, `aac_classify_project_time_entry_authority_trg`.
- **Graft fidelity** — `guard_commercial_time_entry_derived_fields` diffed against `00412:2344-2384` (the only prior body): identical but the three documented deltas. `classify_project_time_entry_authority` diffed against `00578:2599-2820`: identical but the five documented deltas; the `FOR UPDATE` lock text, both immutability raises and 00575's F-2 nullable-ceiling clause are byte-identical and each is re-asserted by a postcondition. `grep … | sort | tail -1` confirms `00412 → 00600` and `00412 → 00575 → 00578 → 00601` are the true lineages, and that `00575` only *mentions* `aac_…_trg` in a comment (so re-creating it from 00412's list reverts nothing).
- **Invoiced lock untouched** — `guard_invoiced_time_entry` still installed, `BEFORE DELETE OR UPDATE`, not redefined. It also sorts after `aa*`, and every column in `aac_`'s watched list except `rate_role` is already frozen by it, so an invoiced row cannot be re-priced through the new resolver.
- **Running-timer slot untouched** — `CREATE UNIQUE INDEX uniq_project_time_entries_running_timer ON public.project_time_entries USING btree (user_id) WHERE (duration_minutes IS NULL)` unchanged; no new writer of a `duration_minutes IS NULL` row.
- **DEFINER contract** — `resolve_time_rate_cents` is DEFINER with `SET search_path = public, pg_temp`, three asserts, `REVOKE EXECUTE … FROM PUBLIC, anon`, `GRANT … TO authenticated`; `has_function_privilege('anon', …)` is false (asserted in-file and probed). `close_prior_studio_member_rate` is DEFINER but `REVOKE ALL … FROM PUBLIC, anon, authenticated, service_role` — no direct caller exists, so no assert is owed.
- **No policy keyed on `projects.studio_id`** — `pg_policies` on `project_time_entries` is unchanged (the 00484 quartet + the four `time_entries_studio_*`), and `studio_member_rates`' three policies key on its own `studio_id` / `is_org_admin_or_owner`. `00599` reads `projects.studio_id` as a *resolver input*, which §0.13 permits explicitly.
- **00484 contract** — no registered policy dropped, renamed or re-qualified; every new policy is a new name. 00484's own replay asserts passed inside the clean reset.
- **`notes` in a rollup** — no rollup exists in W1.
- **ACL seed** — all four new migrations carry a top-level GRANT/REVOKE (`grep -lE '^\s*(GRANT|REVOKE)'`), and `00-legacy-grants.sql` regenerates byte-identical (2609 replayed statements).
- **Plan-item coverage (lane A)** — `00598` table/trigger/RLS/grants, `00599` signature `(uuid, uuid, timestamptz, text DEFAULT NULL) RETURNS TABLE (cents integer, source text, role text)`, `00600` columns + CHECK sets (`profile_default` reserved, `client` excluded), `00601` classifier, the three policy names verbatim, `use-studio-member-rates.ts` with the plan's exact query keys and four-key invalidation set, `CreateTimeEntryInput.rateRole`, the `index.ts` + package-index re-exports (`export * from "./hooks"`), and all three named test files. Nothing from another wave was built.

---

## 3 · Findings

### W1-R2-01 — BLOCKER · confidence high
**`supabase/tests/billing/time_unbilled_view_repair_test.sql:327`** (test), root cause in `supabase/migrations/00599_resolve_time_rate_cents.sql:117-132`

The wave's own gate command fails. On a clean `supabase db reset`, `run-sql-tests.sh -d …/tests/billing` reports
`green 5 · unexpected-fail 1`, aborting at

```
ERROR:  FAIL live0 (W1-R1-16): the live path must rate this row from studio_member_rates, got NULL
```

Reproduced four consecutive times (whole-dir run plus three `-f unbilled` runs). `W1-fix-r1.md`'s
"`billing … total 6 · green 6 · effective-green 6/6`" does not reproduce. The assert is nondeterministic,
not merely broken — see W1-R2-02 — so the implementer's green was luck, not a different code state.

**Fix.** Fix W1-R2-02 (the resolver's studio choice) rather than the test. If the ruling goes the other way
and the ambiguity is accepted, the fixture must pin the studio: add
`studio_id = 'a7200000-0000-4000-8000-0000000000a1'` to the `projects` INSERT at
`time_unbilled_view_repair_test.sql:120-122` — but that would hide the real defect, so do it only after
a deterministic ladder lands, and add a separate case that exercises a designer with two active studios.

---

### W1-R2-02 — MAJOR (blocker-adjacent: it is the cause of W1-R2-01) · confidence high
**`supabase/migrations/00599_resolve_time_rate_cents.sql:117-132`**

For a project with `studio_id IS NULL` — 5 of 6 `projects` rows on a freshly seeded local stack — the studio
whose rate prices the hour is chosen **arbitrarily**. The ladder is

```sql
ORDER BY (membership.role = 'owner') DESC,
         membership.joined_at NULLS LAST,
         membership.created_at,
         studio.id
LIMIT 1
```

and every key above `studio.id` ties, because `public.fc_provision_studio_on_designer`
(`AFTER INSERT OR UPDATE OF is_designer ON profiles WHEN new.is_designer IS TRUE`) auto-provisions a personal
design studio and seats the designer as `owner`, so a designer who also belongs to a real studio holds two
`owner`, `active`, `design_studio` memberships whose `joined_at` and `created_at` are the same
transaction-stable `now()`. The tie therefore falls to a **random uuid**. Measured — the ladder run eight
times over an identical fixture:

```
a4586148-…  713bfa34-…  a7200000-0000-4000-8000-0000000000a1  19623e40-…
25eccd23-…  57fb62fe-…  9e17debd-…                            a7200000-0000-4000-8000-0000000000a1
```

six runs picked the auto-provisioned studio, two picked the studio the owner actually typed the rate into.
When the wrong studio wins, tier 2 misses and the resolver returns `(NULL, 'none')` — so the hour stores
`hourly_rate_cents NULL`, `rated_amount_cents NULL`, `rate_source 'none'`, prints HT-26's "rate pending",
and is invoiced at **$0**. That is precisely the silent money HT-1/HT-26 were ruled to end.

On Strata it is worse than random: a designer's personal studio is provisioned at signup, *before* she joins
a studio, so `joined_at` breaks the tie deterministically in favour of the personal studio — the one studio
that never has `studio_member_rates` rows. Locally, `studio_manager@patina.dev` and `designer@patina.dev`
already hold two active design studios each.

No test covers this. `time_rate_resolution_test.sql` — named in plan §2 as *the sole gate for the classifier* —
never provisions a second studio: its `profiles` INSERT carries `is_designer = true` but hits
`ON CONFLICT (id) DO NOTHING` against the row `auth.users` already created, so `is_designer` never flips and
the trigger never fires (probed). That is why it is green 5/5 while the sibling test flaps.

**Fix.** Make the studio choice meaningful and deterministic, in this order:
1. call `public._agreement_studio_id(p_project_id)` (`00576:536-556`) — the banner at `00599:115-116` already
   claims to mirror its ladder, so call it instead of re-deriving a weaker one;
2. failing that, prefer a studio in which a `studio_member_rates` row exists for `p_user_id`
   (`EXISTS (… WHERE rate.studio_id = studio.id AND rate.user_id = p_user_id)` as the first ORDER BY key);
3. only then the current ladder, with `organizations.created_at` inserted before `studio.id` so the tiebreak
   is never a uuid.
Then add a `time_rate_resolution_test.sql` case whose designer holds **two** active studios (flip `is_designer`
with a separate `UPDATE` so the provisioning trigger fires) and assert the rate resolves from the studio that
owns the project, and a postcondition in `00599` that the functiondef does not end its studio ORDER BY on
`studio.id` alone.

---

### W1-R2-03 — MAJOR · confidence high
**`supabase/migrations/00599_resolve_time_rate_cents.sql:159-166` (ASSERT 2)**

A colleague's confidential hourly rate leaks out of the GRANTed DEFINER resolver. ASSERT 2's designer leg
(`AND v_designer_id IS DISTINCT FROM auth.uid()`) is unconditional, so *any* user who is the designer of *any*
project may resolve *any* `p_user_id`'s rate — including a user with no relationship to that project — even
though `studio_member_rates_read_self_or_admin` gives her nothing. Measured as a plain studio `member` who is
a project designer:

```
NOTICE:  plain-member designer can SELECT colleague rate rows: 0 (expect 0)
NOTICE:  but the GRANTed resolver returns: cents=47500 source=studio_member
```

Since user ids are visible on the roster and in the People room, this is an enumerable read of every
colleague's pay rate by any designer-member of the studio.

**Fix.** The designer leg exists only so the classifier's designer-on-behalf UPDATE keeps working
(W1-R1-05), and that path always runs at trigger depth ≥ 1. Gate it:

```sql
OR (v_designer_id IS NOT DISTINCT FROM auth.uid() AND pg_catalog.pg_trigger_depth() > 0)
```

i.e. keep the leg inside the trigger and refuse it at the RPC boundary. `time_rate_resolution_test.sql`
case (m) exercises the designer path only through an `UPDATE`, so m1/m2 stay green; add a depth-0 assert
that the same call raises `insufficient_privilege`, beside the existing m3.
Complementary (and worth a ruling before the ship, see W1-R2-11): nothing in the repo calls this RPC, so
`REVOKE EXECUTE … FROM authenticated` would close this and W1-R2-02's surface outright.

---

### W1-R2-04 — MAJOR · confidence high
**`packages/supabase/src/hooks/use-studio-member-rates.ts:96-112` × `supabase/migrations/00598_studio_member_rates.sql:156-163`**

In a studio with two owner/admins, the second one cannot correct a rate the first set **today** — the blur-save
idiom HT-3 rules for. `useSetStudioMemberRate` always sends `created_by: auth.uid()` and upserts
`ON CONFLICT (studio_id,user_id,effective_from) DO UPDATE`; PostgREST's DO UPDATE assigns every payload column
from `excluded`, so `created_by` changes, and `guard_studio_member_rate_history`'s identity/authorship freeze
raises. Probed as `authenticated` through the real policies:

```
NOTICE:  same-admin same-day blur-save OK
NOTICE:  SECOND-ADMIN blur-save REFUSED: studio member rate identity and authorship are immutable
rates after | 14000 | 2026-09-11 | (open) | …0001      ← admin B's 15500 lost
```

Nothing catches it: `studio_member_rates_test.sql` cases (a2)/(b2) update `hourly_rate_cents` only, never
`created_by`, and case (h4) only tests re-pointing `user_id`.

**Fix (pick one, the first is smallest).** Drop `created_by` from the guard's freeze for the **open** row —
`00598:156-163` keeps `studio_id`, `user_id`, `created_at` immutable and lets `created_by` record the last
author (or add an `updated_by` column and freeze `created_by`). Alternatively, have the hook not send
`created_by` on the conflict path (select the open row first, then `update()` without it). Either way add an
RLS-test case in which admin B corrects admin A's same-day row and the new value sticks.

---

### W1-R2-05 — MINOR · confidence high
**`supabase/migrations/00601_classifier_rate_resolver.sql:169-177` (delta 5)**

Backdating erases provenance from a row W1 itself wrote. Delta 5 sets `v_rate_source := NULL` whenever the
chain answers `'none'` on an UPDATE of a row that carries a rate — and HT-13 makes backdating a first-class
act, so this is an ordinary path, not an edge. Probed:

```
after insert   | 20000 | 20000 | studio_member
after backdate | 20000 | 20000 | (NULL)        ← started_at moved to 20 days ago, before the rate existed
```

Both `project_time_entries.rate_source`'s COMMENT (`00600:93-97`) and `TimeRateSource`'s doc comment
(`use-time-tracking.ts:91-95`) say NULL means "a row written before 00600", so the column now lies about a
W1-era row, and lane B's rate-source column will render it as legacy.

**Fix.** `v_rate_source := OLD.rate_source;` — keep the provenance with the snapshot it describes (for a
genuinely legacy row `OLD.rate_source` is already NULL, so case (i) is unaffected). Pin it as a case beside (i).

---

### W1-R2-06 — MINOR · confidence high
**`artifacts/hour-tracking-2026-09-11/build/W1-fix-r1.md:65-72` (gate output)**

The reported baselines do not reproduce and will mis-grade later waves. `W1-fix-r1.md` reports commercial
`expected-fail 6 · effective-green 16/16`, rls `expected-fail 2 · 26/26`, field `expected-fail 1 · 6/6`.
Every re-run — from `/Users/kody/Code/patina-merged`, with **and** without
`-k /Users/kody/…/agent-server/supabase/tests/KNOWN_FAILURES.md` — reports `expected-fail 0` and counts the
failures as *unexpected* (commercial 10/16, rls 24/26, field 5/6), because the runner prints worktree-prefixed
paths the repo-root-relative allowlist cannot match. The substance is fine: all nine failures are documented
pre-existing in `KNOWN_FAILURES.md` (the six commercial ones all abort inside
`_countersign_design_services_agreement_impl`, which `00601` does not touch). Only the numbers are wrong.

**Fix.** Either state the real numbers in the report (`10/16`, `24/26`, `5/6`, with the allowlist cross-ref),
or run the suites with `-d supabase/tests/...` relative to the worktree so the printed paths match the
allowlist. Do not add anything to `KNOWN_FAILURES.md`.

---

### W1-R2-07 — MINOR · confidence high
**`packages/supabase/src/hooks/use-studio-member-rates.ts:20-32`**

`StudioMemberRate` omits `updated_at`, which `00598` added in this same fix round and which `select('*')`
returns at runtime. Lane B's dated history rows cannot show when the open row was corrected without a cast.

**Fix.** Add `updated_at: string;` to the interface.

---

### W1-R2-08 — NOTE · confidence high
**`artifacts/hour-tracking-2026-09-11/build/plan-v2.md:205`**

Plan §2's `00598` row says "RLS enabled in this file + **four** policies (below)"; the RLS table at `:239-243`
enumerates three plus "no DELETE policy", and the shipped file asserts `v_policies <> 3`. The code is right.
Fix the plan line to say three so a later reader does not "restore" a missing fourth.

---

### W1-R2-09 — NOTE · confidence medium
**`supabase/migrations/00601_classifier_rate_resolver.sql:185-204`, `00600:174-178`**

`billable` is not in `aab_`'s watched-column list, so a `billable` toggle reaches the classifier with no
derived-field freeze in front of it. For an UNBOUND row that means the non-billable branch re-stamps
`hourly_rate_cents` / `rate_source` from the current chain (`00601:195-197`). No money is at stake today —
the row is non-billable, `rated_amount_cents` is 0, and the bound round trip is rate-stable (case j proves
it) — but the freeze does **not** cover this path. Stated so a later wave does not assume it does. No change
requested in W1.

---

### W1-R2-10 — NOTE · confidence high
**`artifacts/hour-tracking-2026-09-11/build/plan-v2.md:247-259`**

W1 lane B is still absent, as W1-R1-14 recorded: no "Studio rates" section on
`account-studio-page.tsx`, no `studio-rate-rows.tsx`, no `hours-ledger.tsx` rate / rate-source column or
"rate pending", no `authority-hours.ts` `timeRateProvenance` change, no `pending-time-authorization-band.tsx`
doorway, no `authority-hours.test.ts` extension. **Done-when #3's render half and #5 remain unverifiable.**
I verified #3's DB half by SELECT: a rate written through `studio_member_rates_admin_insert` as the owner
prices the next entry at `rate_source='studio_member'`. Orchestrator action, not a lane-A defect.

---

### W1-R2-11 — NOTE · confidence high
**`supabase/migrations/00599_resolve_time_rate_cents.sql:303-306`**

`resolve_time_rate_cents` is `GRANT EXECUTE … TO authenticated` but has **no caller anywhere** in
`apps/`, `packages/`, `services/` or `supabase/functions/` (grepped; the only hits are
`database.types.ts` and a comment). Its one live caller is the classifier, at trigger depth ≥ 1, which runs
as `postgres` and needs no grant. Revoking `authenticated` would delete the entire surface behind W1-R2-03
and the direct-call half of W1-R2-02 at the cost of one line — worth ruling before the ship, and before W2's
lane B is tempted to call it from the browser.

---

## 4 · What I did not verify

- **Strata**: nothing. No `db push`, no prod probe. The `00596` write-down exposure (HT-6-a) and the
  non-promotable `pending_authorization` row (HT-6-b) are unchanged by this round and remain owed rulings.
- **Lane B UI**: nothing renders yet, so no `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live` pass was possible.
- **The six commercial failures' pre-existence** was taken from `KNOWN_FAILURES.md` and from each file's
  first error (all inside the countersign ceremony); I did not re-reset onto
  `origin/hour-tracking/integration` to re-measure them from scratch.
- `pnpm --filter @patina/designer-portal lint` — not run this round (the plan lists it; round 1 reported
  0 errors / 201 pre-existing warnings).
- Trigger *firing order* (`aaa0_` before `aaa_`/`aac_`) was observed to work in every probe but not proved
  against a non-C collation.
