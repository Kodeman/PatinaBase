# W1 — implementation report (lane A, DB + package hooks)

**Worktree** `/Users/kody/Code/patina-merged/.codex/worktrees/agent-server`
**Branch** `hour-tracking/server` (pushed: `85f875907..906b94ab6`)
**Commits** `b39ba9ec2` (migrations) · `d048bad36` (hooks) · `906b94ab6` (tests)
**Plan** `artifacts/hour-tracking-2026-09-11/build/plan-v2.md` §0 + §2 (W1), lane A only
**Local DB** the program's own isolated stack, `project_id "patina-hours"` — API `:54421`,
Postgres `127.0.0.1:54422`, Studio `:54423`. `supabase/config.toml` is skip-worktree'd and was
never staged. The shared stack on `:54322` was never touched.

Everything plan-v2 assigns to **lane A in W1** landed: migrations `00598–00601` (with `00602`/`00603`
deliberately unused), the two package/hook items, and every SQL and unit test the plan names for this
lane. Nothing from another wave or lane was built. Three places where the plan's literal text could
not hold are named below with what shipped instead — all three are visible in the migration banners
as well as here.

---

## 1 · Migrations (at the plan's assigned numbers)

| # | File | What landed |
|---|---|---|
| **00598** | `supabase/migrations/00598_studio_member_rates.sql` | `public.studio_member_rates` + its RLS, policies, grants, and the open-row trigger |
| **00599** | `supabase/migrations/00599_resolve_time_rate_cents.sql` | `public.resolve_time_rate_cents(...)` — the one rate chain |
| **00600** | `supabase/migrations/00600_time_entry_rate_provenance.sql` | `rate_source` + `rate_role` columns; `guard_commercial_time_entry_derived_fields` redefined; `aaa_`/`aab_`/`aac_` triggers re-created |
| **00601** | `supabase/migrations/00601_classifier_rate_resolver.sql` | `classify_project_time_entry_authority` redefined, lineage `00412 → 00575 → 00578 → 00601` |
| **00602** | — | **UNUSED, deliberately.** architecture.md's one-off re-rating backfill; **P-4** deletes it. No file exists. |
| **00603** | — | **UNUSED, deliberately.** architecture.md's renumber headroom. No file exists. |

**Number check (§0.2a), re-run immediately before the commits**, across every ref after
`git fetch --all --prune`:

```
refs/heads/build/people-room-crm-2026-09-11 :: 00592 00593 00594
refs/remotes/origin/build/people-room-crm-2026-09-11 :: 00592 00593 00594
refs/heads/hour-tracking/integration :: 00595 00596 00597
refs/heads/hour-tracking/server      :: 00595 00596 00597   (before this wave)
```
`00598–00601` existed on **no ref**. Nothing collided; nothing was renumbered.

### Signatures, SECURITY modes, grants — as shipped

```sql
-- 00598
CREATE TABLE IF NOT EXISTS public.studio_member_rates (
  id uuid PK, studio_id uuid → organizations, user_id uuid → profiles,
  hourly_rate_cents integer NOT NULL CHECK (> 0),
  effective_from date NOT NULL DEFAULT CURRENT_DATE, effective_to date,
  created_by uuid → profiles, created_at timestamptz,
  UNIQUE (studio_id, user_id, effective_from),
  CHECK (effective_to IS NULL OR effective_to >= effective_from));
CREATE UNIQUE INDEX uniq_studio_member_rates_open ON … (studio_id, user_id) WHERE effective_to IS NULL;

CREATE OR REPLACE FUNCTION public.close_prior_studio_member_rate() RETURNS trigger
  LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.close_prior_studio_member_rate() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER close_prior_studio_member_rate_trg BEFORE INSERT ON public.studio_member_rates FOR EACH ROW …;

ALTER TABLE public.studio_member_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY studio_member_rates_read_self_or_admin … FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_org_admin_or_owner(studio_id));
CREATE POLICY studio_member_rates_admin_insert … FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin_or_owner(studio_id) AND created_by = auth.uid());
CREATE POLICY studio_member_rates_admin_update … FOR UPDATE TO authenticated
  USING (public.is_org_admin_or_owner(studio_id)) WITH CHECK (public.is_org_admin_or_owner(studio_id));
-- no DELETE policy
REVOKE ALL ON TABLE public.studio_member_rates FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.studio_member_rates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.studio_member_rates TO service_role;

-- 00599
CREATE OR REPLACE FUNCTION public.resolve_time_rate_cents(
  p_project_id uuid, p_user_id uuid, p_at timestamptz, p_rate_role text DEFAULT NULL
) RETURNS TABLE (cents integer, source text, role text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;
REVOKE EXECUTE … FROM PUBLIC, anon;  GRANT EXECUTE … TO authenticated;

-- 00600
ALTER TABLE public.project_time_entries
  ADD COLUMN IF NOT EXISTS rate_source text,  -- CHECK authority|studio_member|profile_default|none
  ADD COLUMN IF NOT EXISTS rate_role   text;  -- CHECK lead_designer|support_designer|bookkeeper|vendor
CREATE OR REPLACE FUNCTION public.guard_commercial_time_entry_derived_fields() … SECURITY INVOKER;
REVOKE ALL ON FUNCTION … FROM PUBLIC, anon, authenticated, service_role;
-- aaa_guard_time_entry_invoice_insert_trg  BEFORE INSERT (name kept — n9, no second trigger)
-- aab_…_derived_fields_trg  BEFORE UPDATE OF … , rate_source, rate_role
-- aac_classify_…_trg        BEFORE INSERT OR UPDATE OF … , rate_role

-- 00601
CREATE OR REPLACE FUNCTION public.classify_project_time_entry_authority() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION … FROM PUBLIC, anon, authenticated, service_role;
```

`00599`'s caller assert: `auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() AND NOT
is_org_admin_or_owner(<the project's studio>)` → `insufficient_privilege`. The studio is
`projects.studio_id` with `_agreement_studio_id`'s fallback ladder (`00576:536-556`) for legacy NULL
rows — a **resolver** input, never a policy key (§0.13).

**Redefinitions, and the body each was grafted from** (`grep -rln "CREATE OR REPLACE \(VIEW\|FUNCTION\)[^(]*<name>" supabase/migrations/*.sql | sort | tail -1`, re-run this session):

- `guard_commercial_time_entry_derived_fields` → winner **`00412`** (only definition), grafted from
  `00412:2344-2384` verbatim, three deltas (§0.7a/b/c).
- `classify_project_time_entry_authority` → winner **`00578`**, grafted from `00578:2599-2820`
  verbatim, five deltas. All three 00578 raises, the stable-project `FOR UPDATE` lock (whose exact
  text a commercial test matches with a regex) and 00575's F-2 nullable-ceiling delta are
  byte-identical, and `00601` carries postconditions that raise if any of them is ever lost.

**Generated files, both committed with the migrations:**
- `python3 .codex/worktrees/agent-server/scripts/generate-legacy-grants.py` →
  `supabase/seed/00-legacy-grants.sql` (+48 lines). `grep -lE '^\s*(GRANT|REVOKE)'` confirms all four
  new files carry one, so the regeneration was owed (§0.20).
- `pnpm --dir … db:generate` with `SUPABASE_DB_URL` pointed at `127.0.0.1:54422` →
  `packages/supabase/src/database.types.ts` (+102 lines: `rate_source`, `rate_role`,
  `studio_member_rates`, `resolve_time_rate_cents`). Generated, never hand-edited.

---

## 2 · Package / hook items (lane A)

| File | Change |
|---|---|
| `packages/supabase/src/hooks/use-studio-member-rates.ts` | **new.** `useStudioMemberRates(studioId)`, `useSetStudioMemberRate()`. Keys: list `['studio-member-rates', studioId]`, entity `['studio-member-rate', userId]`. The mutation invalidates both plus `['document-hours-week']` and `['document-hours-unbilled']` (the two keys `hours-ledger.tsx:105,159` actually read) |
| `packages/supabase/src/hooks/use-time-tracking.ts` | `rate_source` / `rate_role` on `ProjectTimeEntry` with exported `TimeRateSource` / `TimeRateRole`; `CreateTimeEntryInput.rateRole`; the insert row builder passes `rate_role` through and still sends no rate, amount, billing state or provenance |
| `packages/supabase/src/hooks/index.ts` | exports the new module and the two new types; every existing name unchanged (§0.21) |

Two decisions inside the hook worth the orchestrator's eye:

1. **The write is an UPSERT on `(studio_id, user_id, effective_from)`.** Lane B's page saves on blur
   (HT-3's idiom), so a second edit on the same day would otherwise hit the table's UNIQUE
   constraint. The 00598 UPDATE policy already admits exactly the actors the INSERT policy does, so
   this needs no extra DB surface.
2. **`created_by` is stamped from `auth.getUser()`**, because `studio_member_rates_admin_insert`'s
   `WITH CHECK` requires `created_by = auth.uid()` — a caller that omits it is refused, not ignored.

`@patina/supabase` is source-resolved (`"main": "./src/index.ts"`), so no dist rebuild is owed; the
`admin-portal` build is the type gate that proves it (§0.24) and it passed.

---

## 3 · Tests

| Path | What it pins |
|---|---|
| `supabase/tests/billing/time_rate_resolution_test.sql` (new, 9 cases) | (a) the browser's 99999 discarded on a non-services project, studio rate + amount + state + recorded role stored; (b) a supplied `rate_source` raises, a supplied `rated_amount_cents` raises, neither row exists; (c) a services entry with no card for her role takes the studio rate and stays `pending_authorization` (no longer NULL-stranded against `00577:2493-2496`); (d) the no-authority-covering-`started_at` branch is server-owned; (e) HT-41 two roles + a pick → that card (9000, `authority`); (f) two roles, no pick → the studio rate (12000, `studio_member`), `rate_role` NULL; (g) an unheld `rate_role` raises; (h) `rate_source`, `rate_role` **and** `hourly_rate_cents` frozen on an already-classified **non-services** row; (i) P-4 — a legacy snapshot survives an edit and re-prices the new duration |
| `supabase/tests/rls/studio_member_rates_test.sql` (new, 8 cases) | per role: owner ✓, admin ✓, `created_by` must be the actor, member = own row only and no self-raise, guest = no writes and no colleague's row (**and** the honest half: the self leg has no status test, so a guest reads their own row), cross-studio owner = nothing on any verb, **nobody may DELETE** (privilege, not a zero-row no-op), and the open-row ladder forwards **and** backdated |
| `packages/supabase/src/hooks/__tests__/use-studio-member-rates.test.ts` (new, 7 tests) | both query keys; the read's filter + double ordering; the upsert's exact payload key set, `onConflict` target, default and explicit `effective_from`; the no-session refusal; the four invalidated keys in order |
| `apps/designer-portal/src/hooks/__tests__/use-time-tracking-authority.test.tsx` (extended, +1 test) | `useCreateTimeEntry` sends exactly ten columns, none of them a rate/amount/billing-state/provenance, and `rate_role` passes through. This is plan-v2's "assert it in a test so a future edit cannot reintroduce one" — placed in the spec that already guards this module's write shape rather than in a new file |
| `supabase/tests/billing/time_unbilled_view_repair_test.sql` (W0's, **fixture amended, asserts unchanged**) | see §5.1 |

---

## 4 · Gate outputs (verbatim)

### `supabase db reset --workdir /Users/kody/Code/patina-merged/.codex/worktrees/agent-server`

```
Applying migration 00595_time_entry_claim_and_source.sql...
Applying migration 00596_project_unbilled_time_repair.sql...
Applying migration 00597_time_entry_auto_roster.sql...
Applying migration 00598_studio_member_rates.sql...
Applying migration 00599_resolve_time_rate_cents.sql...
Applying migration 00600_time_entry_rate_provenance.sql...
Applying migration 00601_classifier_rate_resolver.sql...
Finished supabase db reset on branch main.
```

Object probes bracketing the suites that follow (§0.2a's rule — the ledger proves nothing):

```
 proname                                    | prosecdef
 classify_project_time_entry_authority      | t
 guard_commercial_time_entry_derived_fields | f
 resolve_time_rate_cents                    | t
 close_prior_studio_member_rate             | f

 project_time_entries_rate_role_ck   CHECK (rate_role IS NULL OR rate_role IN (lead_designer, support_designer, bookkeeper, vendor))
 project_time_entries_rate_source_ck CHECK (rate_source IS NULL OR rate_source IN (authority, studio_member, profile_default, none))

 studio_member_rates policies: _admin_insert (INSERT) · _admin_update (UPDATE) · _read_self_or_admin (SELECT)   [3, no DELETE]

 tgname                                             | carries rate_role
 aab_guard_commercial_time_entry_derived_fields_trg  | t
 aac_classify_project_time_entry_authority_trg       | t
 guard_invoiced_time_entry                           | (present, untouched)

 delete_priv=false anon_exec=false      -- authenticated has no DELETE on studio_member_rates; anon cannot EXECUTE the resolver
```

### `scripts/run-sql-tests.sh -d …/supabase/tests/billing -H 127.0.0.1 -p 54422`

```
PASS  billing/invoice_checkout_integrity_test.sql
PASS  billing/invoice_links_test.sql
PASS  billing/studio_invoice_test.sql
PASS  billing/time_claim_atomicity_test.sql
PASS  billing/time_rate_resolution_test.sql
PASS  billing/time_unbilled_view_repair_test.sql
total: 6   green: 6   expected-fail: 0   unexpected-fail: 0   effective-green: 6 / 6
```

### `scripts/run-sql-tests.sh -d …/supabase/tests/commercial -H 127.0.0.1 -p 54422`

```
total: 16   green: 10   expected-fail: 0   unexpected-fail: 6   effective-green: 10 / 16
unexpected failures:
  - commercial/authorized_schedule_test.sql
  - commercial/design_services_authority_test.sql
  - commercial/design_services_gap_hardening_test.sql
  - commercial/executed_on_paper_test.sql
  - commercial/trade_rfq_test.sql
  - commercial/trade_scope_test.sql
```

**"Commercial green unchanged" holds, and here is the evidence rather than the claim.** This is the
same set of six W0 proved pre-existing by removing the hour-tracking migrations entirely. I added a
second, independent bracket: the first error of each of the six, which shows none of them reaches a
rate, provenance or classifier assert —

```
authorized_schedule            :308  design services agreement d7300000… not found or access denied
design_services_authority      :177  design services agreement d5300000… not found or access denied
design_services_gap_hardening  :128  proposal d6300000… failed canonical project provenance
executed_on_paper              :214  design services agreement ea300000… not found or access denied
trade_rfq                      :154  design services agreement d9300000… not found or access denied
trade_scope                    :196  design services agreement d8300000… not found or access denied
```

All six abort inside the countersign ceremony (`_countersign_design_services_agreement_impl`), which
`00601` does not touch. They read "unexpected" rather than "expected-fail" only because the runner,
invoked from the main checkout, prints worktree-prefixed paths that `KNOWN_FAILURES.md`'s
repo-root-relative entries cannot match (W0's note 2) — passing `-k` does not change it.

### `scripts/run-sql-tests.sh -d …/supabase/tests/rls -f time_entry -H 127.0.0.1 -p 54422`

```
PASS  rls/time_entry_auto_roster_test.sql
total: 1   green: 1   unexpected-fail: 0   effective-green: 1 / 1
```

### `scripts/run-sql-tests.sh -d …/supabase/tests/billing -f rate -H 127.0.0.1 -p 54422`

```
PASS  billing/time_rate_resolution_test.sql
total: 1   green: 1   unexpected-fail: 0   effective-green: 1 / 1
```

### Two suites beyond the brief's list, run because W1 changes write-path behaviour

```
-f studio_member_rates : PASS  rls/studio_member_rates_test.sql     total: 1  green: 1
whole rls dir          : total: 26  green: 24  unexpected-fail: 2
                         - rls/design_requests_test.sql   ← documented in KNOWN_FAILURES.md:114
                         - rls/studio_titles_test.sql     ← documented in KNOWN_FAILURES.md:115
```
Identical to W0's baseline (it read 25 files / 23 green / the same 2); the 26th file is this wave's.

### TypeScript, unit tests, build

```
pnpm --filter @patina/supabase type-check       → clean (no output)
pnpm --filter @patina/designer-portal type-check → clean (no output)
pnpm --filter @patina/supabase test -- use-studio-member-rates
   ✓ src/hooks/__tests__/use-studio-member-rates.test.ts (7 tests)
   Test Files 1 passed (1)   Tests 7 passed (7)
pnpm --filter @patina/designer-portal test -- use-time-tracking-authority
   PASS src/hooks/__tests__/use-time-tracking-authority.test.tsx
   Tests: 3 passed, 3 total
pnpm --filter @patina/designer-portal test        (full suite)
   Test Suites: 573 passed, 573 total
   Tests:       7260 passed, 7260 total
pnpm --filter @patina/designer-portal lint        → ✖ 201 problems (0 errors, 201 warnings)
pnpm --filter @patina/admin-portal build          → built (the only portal whose build enforces types)
git diff --exit-code packages/supabase/src/database.types.ts  → clean after the commit
```

Two advisory, pre-existing signals, named so nobody reads them as this wave's:
- the pre-push hook's "Affected verification has advisory failures" is **`@patina/client-portal lint`**
  — 10 errors, every one a React-hooks rule inside client-portal components. W1 touched no
  client-portal file.
- the pre-commit hook flags Prettier drift on `database.types.ts` (generated — never hand-formatted),
  on `use-time-tracking.ts` (which **already** failed `prettier --check` at `HEAD~2`, before this
  wave), and on the two files written in the same house style as their siblings.

---

## 5 · Where the plan's literal text could not hold (all three also in the migration banners)

### 5.1 `time_unbilled_view_repair_test.sql`'s case-(b) fixture had to move

W0's "rated entry" fixture supplied `hourly_rate_cents = 15000` on a non-services project. **HT-1 is
exactly the ruling that a supplied rate is discarded**, so after `00601` that row read `0 / 0` and
(b2) failed. I amended the **fixture, not the asserts**: the two rows are now written with
`aac_classify_project_time_entry_authority_trg` disabled for that one insert — which is what a pre-W1
row IS, a snapshot rate already on the row, and exactly the state case (b) measures (does the VIEW
print the rate that priced the line). The alternative — giving the vendor a `studio_member_rates` row
— would have rated **both** entries and destroyed (b4)'s rate-less arm. Figures unchanged:
`15000 / 22500 / 0-0`. `ALTER TABLE … DISABLE TRIGGER` is transactional, so the file's `ROLLBACK`
restores it. **Flagged because a W0 assertion moved under W1's feet; the orchestrator may want it
re-reviewed.**

### 5.2 §0.7(c)'s four column names are not all refusable — two are refused, two are discarded

§0.7(c) says the guard's INSERT branch should "reject a caller-supplied
rate/amount/billing_state/rate_source". As shipped:

- **`rate_source`, `rated_amount_cents` → REJECTED** (`check_violation`). Both nullable, no default,
  so a supplied value is detectable; and `00578` did not own `rated_amount_cents` on every branch.
- **`hourly_rate_cents` → DISCARDED, not rejected.** The same wave's Done-when requires
  `INSERT … (hourly_rate_cents) VALUES (99999)` to **succeed** with the resolver's value stored, and
  the plan's own first test says "discarded and replaced". A raise would also break any legacy writer
  that still sends a rate. `00601` owns the column on every branch, so the rate never survives.
- **`billing_state` → cannot be refused at all.** It is `NOT NULL DEFAULT 'authorized'`
  (`00412:283`), so a caller-supplied `'authorized'` is indistinguishable from the default. `00601`
  sets it on every branch, so it too is discarded.

### 5.3 P-4 preservation: a legacy snapshot is kept, with NULL provenance

HT-1 read literally ("the server owns the rate on every branch") would have the classifier NULL the
rate of **any** row it re-classifies when the chain has no answer — including an existing, unbilled
row carrying a snapshot, on an ordinary duration edit. That is the `00596` write-down class (HT-6-a)
all over again, and P-4 says unbilled history keeps its amounts. So `00601` keeps `OLD.hourly_rate_cents`
when `TG_OP = 'UPDATE'` and the chain answers `'none'`, and leaves `rate_source` **NULL** — the legacy,
unknown-provenance value — rather than `'none'`, so HT-26's "rate pending" is never printed beside a
row that does have a rate. Pinned as case (i). **If this reading is wrong it is two lines in `00601`
and one test case.**

### 5.4 `billable` — the sentence read as a constraint, not a feature

Plan §2's `00601` row says "`billable` stays client-set; the classifier may only **downgrade** it to
false when no authority covers the work, never upgrade it, recording the reason through
`billing_state` + `rate_source`". `00578` downgrades nothing, and an actual downgrade would make the
row **non-promotable** by a later signed addendum — defeating the same migration's repair of the
stranded no-rate branch. So nothing was added: `billable` is untouched, and the reason is recorded
through `billing_state = 'pending_authorization'` + `rate_source`. Named here rather than assumed.

---

## 6 · Deferred, with the reason

| Item | Why it is not here |
|---|---|
| `account-studio-page.tsx` "Studio rates" section + `studio-rate-rows.tsx` | **lane B** (HT-3's page), phase 2 — the brief scopes me to lane A's DB items |
| `hours-ledger.tsx` rate + rate-source column, "rate pending" | **lane B**, and §11 gives the file to W2: W1's column lands as a follow-commit after W2's lens |
| `authority-hours.ts` `timeRateProvenance` (stop returning `null`) | **lane B** (row rendering) |
| `pending-time-authorization-band.tsx` badge → doorway (HT-26) | **lane B** |
| `apps/designer-portal/src/lib/document/__tests__/authority-hours.test.ts` (extend) | tests lane B's change; it would assert nothing before that code exists |
| `time_entry_logged` / `time_rate_unresolved` PostHog events | **lane D** owns `document-events.ts` for the whole program (§11's conflict table) |
| `project_hours_total(p_project_id)` (HT-10-a) | **W2**, lane A — ruled after plan-v2 was written, assigned to W2, not W1 |
| `00602` / `00603` | unused by design (P-4 / headroom) |
| Prod apply | **not done, and not asked for.** P-3 is one ship after W7. No `supabase db push`, nothing touched on Strata; everything above is the isolated local stack (`:54422`) |

## 7 · Assumptions I could not verify locally

- **The studio a project belongs to.** `00599` reads `projects.studio_id` first and falls back to the
  designer's primary active non-guest design studio. On Strata, legacy projects with a NULL
  `studio_id` whose designer belongs to **two** active studios will resolve to the first by
  `(role = 'owner') DESC, joined_at, created_at, id` — deterministic, but it is a choice, and the only
  fixtures I could build have one studio per designer.
- **HT-6-a's existing `$0` rows.** W1 gives NEW entries a server-owned rate; it does not re-rate the
  one Strata row HT-6-a measured. P-4 forbids the backfill that would, and `00601`'s preservation arm
  only protects a row that still carries a rate — a row already written down to NULL by `00596` stays
  there. That remains Kody's owed ruling, unchanged by this wave.
