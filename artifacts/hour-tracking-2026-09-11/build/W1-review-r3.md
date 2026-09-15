# W1 — adversarial review, round 3

**clean = false** — 1 blocker (lane A, money), 1 blocker (wave-level: lane B absent for the third round), 1 major, 2 minor, 5 notes.

Reviewer context: separate from the implementer. Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-server`, branch `hour-tracking/server`, DB = the program's own stack `patina-hours` (127.0.0.1:54422). Every finding below was **measured** on a clean `supabase db reset`, not inferred.

Diff under review — `git log --oneline origin/hour-tracking/integration..hour-tracking/server`:

```
945e04796 fix(time): W1 review round 2 — name the studio that prices the hour, shut the pay-rate door
f0cf9a177 fix(time): W1 review round 1 — close the resolver's open door, stop re-pricing a signed hour
906b94ab6 test(time): pin rate resolution, studio-rate authorization, and the rate-free insert
d048bad36 feat(time): studio-rate hooks, and rate provenance on the entry type
b39ba9ec2 feat(time): W1 rate truth — the server owns the rate on every project kind
```

14 files, +3608 / −8. Migrations `00598`–`00601` read line by line against `00412:2344-2400`, `00412:2615-2630`, `00578:2599-2820` and `00177:25-86`.

---

## Findings

### W1-R3-01 · BLOCKER · confidence HIGH · a studio member can set the rate her own hours bill at

`supabase/migrations/00599_resolve_time_rate_cents.sql:163-184` (the `studio_id IS NULL` fallback ladder) together with `supabase/migrations/00598_studio_member_rates.sql:213-226` (`studio_member_rates_admin_insert`).

HT-3 rules the per-member studio rate is set **owner/admin only**; HT-1 rules the server owns the rate so that "a client-supplied rate is discarded". As shipped, a plain studio `member` sets her own number one table over, and the resolver then prefers it over the rate her studio owner set.

The mechanism is three shipped facts composing:

1. `fc_provision_studio_on_designer` (trigger on `profiles`, confirmed installed) auto-provisions a **personal** `design_studio` for any `is_designer` profile that holds no `organization_members` row yet, and seats her as **`owner`**. A designer who signed up before joining a studio therefore holds two studios and is owner of one of them. Round 2's own banner states this is the deterministic shape on Strata (`00599:84-96`).
2. `studio_member_rates_admin_insert` asks only for `is_org_admin_or_owner(studio_id)` + subject membership. In her personal studio she satisfies both **about herself**.
3. `projects.studio_id` is NULL on essentially every project — `activate_proposal_as_project` never sets it (probed: the function body contains no `studio_id`; 5 of 6 seeded `projects` rows are NULL) — so the fallback ladder is the live path, and its **first** key is `EXISTS (a studio_member_rates row for p_user_id in this studio)`. When both studios hold a row the key ties, and the next key `(membership.role = 'owner') DESC` hands it to the **personal** studio.

Measured end to end (`scratchpad/probe1.sql`, all writes through RLS as the member):

```
baseline (Leah's studio rate only)        cents=15000  source=studio_member
member self-inserts 99900 in her own studio → "self-set rate INSERT through RLS SUCCEEDED"
after self-set                            cents=99900  source=studio_member
her live-path entry (120 min)   hourly_rate_cents=99900  rated_amount_cents=199800
                                rate_source=studio_member  billing_state=authorized
```

`$1,998.00` on a two-hour entry, `authorized`, which flows into `project_unbilled_time` → the studio balance → the invoice composer → `claim_time_entries`' invoice lock.

Scope: the harm lands on projects where the member **is** `projects.designer_id` (the ladder enumerates the designer's studios). It needs no malice — a designer who carried a solo rate before joining a studio has that old number beat her studio's silently and deterministically, because of the owner tiebreak. Round 2's W1-R2-02 fix is what made it deterministic: it turned a 50/50 coin flip into a reliable win for the studio whose rate nobody else controls.

**Exact fix** (minimal, inside the ladder round 2 already owns) — put "this is a real studio, not a one-person workspace" **above** the rate-existence key, so a solo designer's only studio still ties and keeps working:

```sql
    ORDER BY (SELECT count(*) FROM public.organization_members peer
               WHERE peer.organization_id = studio.id
                 AND peer.status = 'active'
                 AND peer.role <> 'guest') > 1 DESC,
             EXISTS (
               SELECT 1 FROM public.studio_member_rates AS priced
               WHERE priced.studio_id = studio.id
                 AND priced.user_id   = p_user_id
             ) DESC,
             (membership.role = 'owner') DESC,
             membership.joined_at NULLS LAST,
             membership.created_at,
             studio.created_at,
             studio.id
```

plus a `00599` postcondition pinning the new first key, and a new case in `supabase/tests/billing/time_rate_resolution_test.sql` shaped exactly like `probe1.sql` (member = plain `member` of a multi-member studio and `owner` of her personal one; both studios hold a rate; assert the multi-member studio's rate wins and that the self-set number never prices an hour).

Alternatives the orchestrator may prefer instead of / in addition to the above, both larger: (a) tighten `studio_member_rates_admin_insert`/`_update` to refuse a row where `user_id = auth.uid()` unless a *second* active owner/admin exists in that studio — note this forbids a solo owner setting her own rate, which is a behaviour change Leah would feel; (b) populate `projects.studio_id` so the fallback is never reached — out of W1's scope and backfill-adjacent (P-4).

### W1-R3-02 · MAJOR · confidence HIGH · an ordinary duration edit silently re-prices a pre-00600 unbilled row

`supabase/migrations/00601_classifier_rate_resolver.sql:180-186` (delta 5).

Delta 5 invokes P-4 by name — *"invoiced and unbilled history keep their amounts"* — but applies it only when the chain answers `'none'`. When the chain **has** an answer, a legacy row's snapshot is overwritten. So the rule is honoured exactly where it costs nothing and dropped where it moves money.

Measured (`scratchpad/probe4.sql`): a pre-W1 unbilled entry on a non-services project carrying its own `$175.00` snapshot, whose author has a studio rate of `$150.00` covering `started_at`. She corrects the duration — the only edit `useUpdateTimeEntry` even offers (`packages/supabase/src/hooks/use-time-tracking.ts:395-404`: `started_at, duration_minutes, notes, phase_key, task_id, billable, activity`, no rate column):

```
before               hourly_rate_cents=17500  rated_amount_cents=17500  rate_source=(NULL)
after duration edit  hourly_rate_cents=15000  rated_amount_cents=30000  rate_source=studio_member
```

The rate moved $175 → $150 and the row stopped being identifiable as legacy. A `billable` off/on round trip does the same through the non-billable branch at `:204-210` (`OLD.billing_authority_id IS NULL` → `NEW.hourly_rate_cents := v_rate_cents`). Invoiced rows are safe — `guard_invoiced_time_entry` (`00177:51-84`, untouched) refuses a duration change once `invoice_id` is set — so the exposure is exactly unbilled history, which is the half P-4 names.

Test case `(i)` looks like it covers this and does not: its member has **no** studio rate, so it only exercises the `'none'` arm that already preserves.

**Exact fix** — extend delta 5 to preserve a pre-00600 snapshot as well, and pin it:

```sql
  IF TG_OP = 'UPDATE'
     AND OLD.hourly_rate_cents IS NOT NULL
     AND (v_rate_source = 'none' OR OLD.rate_source IS NULL)
  THEN
    v_rate_cents  := OLD.hourly_rate_cents;
    v_rate_source := OLD.rate_source;
  END IF;
```

with a `00601` postcondition on `OLD.rate_source IS NULL` and a new `time_rate_resolution_test.sql` case: legacy row (`rate_source` NULL, snapshot 17500) + an author who **does** hold a studio rate → a duration edit keeps 17500 and re-prices only the amount. This is additive against every existing case — `(j)`/`(k)` are bound (`OLD.rate_source = 'authority'`), `(o)` is `'studio_member'`, `(a)`/`(d)`/`(e)` are INSERTs. If the orchestrator rules the other way (HT-1 beats P-4 on an edit), it must be a recorded ruling beside HT-6-a with the assert flipped, not the silent default it is now.

### W1-R3-03 · BLOCKER (wave-level, dispatch not lane A) · confidence HIGH · W1 lane B is still entirely absent

Third round reporting this (W1-R1-14, W1-R2-10). Verified against the branch tip: the only `apps/` file in the whole diff is `apps/designer-portal/src/hooks/__tests__/use-time-tracking-authority.test.tsx`. Every other row of plan-v2 §2's "Portal files" table is missing:

- `apps/designer-portal/src/components/document/account/account-studio-page.tsx` — no "Studio rates" section (grep: `useStudioMemberRates` absent; the only `hourly` hits are the pre-existing agreement rate card at `:83, :434, :615, :1118-1165, :1349`).
- `apps/designer-portal/src/components/document/account/studio-rate-rows.tsx` — **file does not exist**.
- `apps/designer-portal/src/components/document/hours-ledger.tsx` — no rate column, no rate-source column, no "rate pending" (grep for `rate_source|rate pending|hourly_rate`: zero hits).
- `apps/designer-portal/src/lib/document/authority-hours.ts:68-74` — `timeRateProvenance` **still returns `null`**; HT-26's discriminated result is not built.
- `apps/designer-portal/src/components/document/pending-time-authorization-band.tsx` — no doorway.
- `apps/designer-portal/src/lib/analytics/document-events.ts` — neither `time_entry_logged` nor `time_rate_unresolved` exists (lane D, which plan-v2 §2 puts in **this** wave so the data accumulates before any iOS capability decision — HT-27).
- `apps/designer-portal/src/lib/document/__tests__/authority-hours.test.ts` — present but **not extended** (no `timeRateProvenance` never-null assertion, no "rate pending").

Consequence: **Done-when #3's render half and Done-when #5 are unverifiable at this commit**, and W1 is not passable as a wave. `@patina/supabase` now exports `useStudioMemberRates` / `useSetStudioMemberRate` with no consumer, so HT-3's ruled surface ("edited on a studio settings page, owner/admin only, dated") does not exist anywhere a human can reach.

**Fix:** dispatch lane B against plan-v2 §2's Portal files table, then re-run Done-when #3 and #5 with `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live` (§0.24) before the wave is called done. Not a defect in lane A's work.

### W1-R3-04 · MINOR · confidence HIGH · a caller-supplied `effective_to` defeats the W1-R1-06 non-overlap invariant

`supabase/migrations/00598_studio_member_rates.sql:122-128` (`IF NEW.effective_to IS NULL THEN …` — the self-close is skipped when the caller supplies a value) and `:214-226` (the INSERT policy does not pin `effective_to`; the GRANT at `:244` is table-wide, not column-scoped).

W1-R1-06 was fixed so that "exactly one rate row covers every date in the span" — asserted as case `(g6)` in `supabase/tests/rls/studio_member_rates_test.sql:373`. An owner/admin can still break it through the REST API by sending `effective_to` on the insert. Measured (`scratchpad/probe3.sql`, all three inserts as the owner through RLS):

```
10000  2026-08-12 → 2026-08-21
30000  2026-08-22 → 2026-09-10      ← backdated, explicit effective_to
20000  2026-09-01 → (open)
rows covering 2026-09-06: 2
```

The same shape can leave **no open row at all** (insert a row with `effective_to` set and nothing later), after which every new hour resolves `'none'` and prints "rate pending" until somebody inserts again. Money stays deterministic (tier 2 takes the greatest `effective_from ≤ date`, so `20000` wins the overlap) and no shipped surface does this — `useSetStudioMemberRate` never sends `effective_to` — which is why this is minor rather than major. But the invariant the file asserts is reachable-breakable by the only role allowed to write.

**Exact fix** — let the trigger own the column outright: in `close_prior_studio_member_rate`, replace the conditional with an unconditional recompute, and refuse a supplied value from a non-`postgres` caller:

```sql
  IF current_user IS DISTINCT FROM 'postgres' AND NEW.effective_to IS NOT NULL THEN
    RAISE EXCEPTION 'effective_to is closed by the ladder, never by hand — write a new dated row'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT min(r.effective_from) - 1 INTO NEW.effective_to
  FROM public.studio_member_rates r
  WHERE r.studio_id = NEW.studio_id
    AND r.user_id   = NEW.user_id
    AND r.effective_from > NEW.effective_from;
```

plus a `studio_member_rates_test.sql` case asserting the refusal and re-asserting `(g6)` after it.

### W1-R3-05 · MINOR · confidence HIGH · `resolve_time_rate_cents` is GRANTed to `authenticated` with no caller anywhere

`supabase/migrations/00599_resolve_time_rate_cents.sql:365-366`.

Re-verified independently of W1-R2-11: `grep -rn resolve_time_rate_cents apps packages services supabase/functions` returns **one** hit, a doc comment in `use-time-tracking.ts:91`. `has_function_privilege` on the live stack: `authenticated: true`, `anon: false`, `service_role: true`. The classifier reaches it at trigger depth ≥ 1 as `postgres` and needs no grant. Three of the four asserts in the function exist **only** to defend a door nobody walks through, and two of them (W1-R1-01, W1-R2-03) were authored in response to measured leaks out of that door.

The fix-round doc declines to revoke because plan-v2 `:226-228` writes the GRANT into the signature block and §0.16 asks for one. That reading is defensible but it leaves a GRANTed `SECURITY DEFINER` reader of signed rate cards and confidential pay with zero callers. **Still an owed ruling for the orchestrator.** If ruled: one line (`REVOKE EXECUTE … FROM authenticated`), extend `00599`'s `anon` postcondition to `authenticated`, and re-home `l1`/`l2`/`m3`/`m4` onto the trigger path.

### W1-R3-06 · NOTE · confidence HIGH · the W1-R2-03 pay-rate gate holds incidentally, not structurally

Measured (`scratchpad/probe2.sql`): a plain `member` of a multi-member studio who is the designer of a `studio_id`-NULL project and owner of her own personal studio asks the RPC for a **colleague's** rate at depth 0 → `42501 only a studio owner or admin may resolve another member's rate`, and RLS shows her 0 rows of the colleague's rate. Good.

But the reason it refuses is that the colleague **has** a rate row in the multi-member studio, so the ladder's first key picks that studio, where she is only a `member`. If the subject holds no rate row anywhere, the first key ties and the owner tiebreak hands `v_studio_id` to **her own** personal studio — where she *is* owner — so ASSERT 2 passes. Tier 2 then finds nothing, so no pay leaks (tier 1 returns the signed card rate, which `billing_authority_rates_studio_read` already gives a co-member). No harm today; the defence is a property of the ordering rather than a rule about the caller. Fixing W1-R3-01 as proposed also removes this coupling.

### W1-R3-07 · NOTE · confidence MEDIUM · the rate's effective date is UTC on both sides, which is right, and invisible to the person typing it

`00599:340-342` anchors on `(p_at AT TIME ZONE 'UTC')::date` (W1-R1-11) and `packages/supabase/src/hooks/use-studio-member-rates.ts:52` stamps `new Date().toISOString().slice(0,10)` — also UTC. Consistent, so no off-by-one between writer and reader. The residue: a studio west of UTC typing a rate after ~17:00 local stamps **tomorrow's** date, and hours already logged that local afternoon keep the old rate. Worth one sentence in lane B's copy (or an explicit ruling that the effective date is the studio's local day) rather than a code change in W1.

### W1-R3-08 · NOTE · confidence HIGH · the brief's literal commercial invocation cannot be green; the worktree's own script is the gate

Running the **main checkout's** `scripts/run-sql-tests.sh` with `-d <worktree absolute path>` prints rows as `.codex/worktrees/agent-server/supabase/tests/…`, which matches nothing in `KNOWN_FAILURES.md`, so the six pre-existing commercial reds report as `unexpected-fail`. Reproduced both ways this round (numbers in Gates below). W1-fix-r2.md §W1-R2-06 diagnosed this correctly. Later waves' gate lines should read `<worktree>/scripts/run-sql-tests.sh -d supabase/tests/<dir> -k supabase/tests/KNOWN_FAILURES.md -H 127.0.0.1 -p 54422`.

### W1-R3-09 · NOTE · confidence HIGH · a W0 test's primary rows no longer exercise the live classifier

`supabase/tests/billing/time_unbilled_view_repair_test.sql:130-153` now writes case `(b)`'s two rows with `aac_classify_project_time_entry_authority_trg` **disabled**. That is the honest way to manufacture a pre-W1 snapshot, and the live-path sibling row `b3` (+ asserts `live0`, `live1`, `b5`) compensates. Recorded so a later reader does not mistake a green `(b)` for classifier coverage. No change requested.

### W1-R3-10 · NOTE · confidence HIGH · no program rule violated beyond the findings above

Checked explicitly, each against the live stack or the file:

| Rule | Result |
|---|---|
| §0.2 numbering (W1 = `00598`–`00603`) | `00598`–`00601` present; `00602`/`00603` deliberately unused (§2 rows). Ledger head `00601` + the imported `20260910152111`. No collision on any ref. |
| §0.5 no flags | no `useFeatureFlag` / PostHog gate / `ComingSoon` anywhere in the diff. |
| §0.6 no backfill | no `UPDATE … SET hourly_rate_cents` over history; `00602` left empty. |
| §0.7 client rate | `rate_source` + `rated_amount_cents` **raise** on INSERT (`00600:129-132`, case `(b)`); `hourly_rate_cents` + `billing_state` discarded and replaced — measured, probe5: supplied `99999` → stored `15000 / studio_member / lead_designer / authorized`. Matches the §0.7 amendment verbatim. |
| §0.8 both column lists | `aab_` list = 00412's six + `rate_source, rate_role` (`00600:174-178`); the `IS DISTINCT FROM` chain carries both (`:150-151`); `aac_` list = 00412's eight + `rate_role` (`:190-194`). Postconditions assert all three via `pg_get_triggerdef`. |
| §0.10 no `notes` in a rollup | no rollup in W1. |
| §0.11 running-timer slot | `uniq_project_time_entries_running_timer` present and untouched; no W1 file names it. |
| §0.12 invoiced lock | `guard_invoiced_time_entry` untouched; `00600:226-233` asserts it is still installed. |
| §0.13 never key a policy on `projects.studio_id` | no policy in W1 references it; `00599` *reads* it in a DEFINER function, which is not a policy key. |
| §0.14 / §0.15 helpers | only `is_org_admin_or_owner`; `organization_members.role` / `member_role` used correctly (`00598:224`). |
| §0.16 DEFINER contract | `resolve_time_rate_cents` — DEFINER, `SET search_path = public, pg_temp`, three asserts, `REVOKE … FROM PUBLIC, anon`, `GRANT … TO authenticated`. (See W1-R3-05 on whether that GRANT should exist.) `close_prior_studio_member_rate` DEFINER with `REVOKE ALL` from every role and a documented no-direct-caller rationale. No bare extension function in any W1 file. |
| §0.17 00484 quartet | all four `Team can …` policies present after reset, unmodified; nothing dropped or re-qualified, so the 00484 registration contract is not engaged. |
| §0.19 / §0.20 generated files | after a fresh `db:generate` + `generate-legacy-grants.py`, `git status --short` is **empty**. Grep `^\s*(GRANT|REVOKE)` over W1 files → `00598, 00599, 00600, 00601`, all four represented in the regenerated seed. |
| §0.21 hook names | no rename; `useStudioMemberRates`/`useSetStudioMemberRate` added and re-exported from `hooks/index.ts`. |
| 00578 graft fidelity | diffed `00601` against `00578:2599-2820` line by line: the three immutability raises, the `FOR UPDATE` project lock, the retainer ladder and 00575's F-2 nullable-ceiling delta are byte-identical; the five deltas are exactly the ones the banner declares. `00600`'s guard diffed against `00412:2344-2384`: the three deltas declared, nothing else moved. |
| commit hygiene | five commits; `git show --stat` per commit — files match messages, no stray paths, **`supabase/config.toml` absent from all five**, working tree clean. |

---

## Gates re-run (this reviewer, clean stack)

| Command | Result |
|---|---|
| `supabase db reset --workdir .codex/worktrees/agent-server` | `Finished supabase db reset on branch main.` — applies clean through `00601`; ledger head `00601` (+ `20260910152111`) |
| object probe (psql 54422) | `studio_member_rates` exists, RLS on, **3** policies (SELECT/INSERT/UPDATE, no DELETE); `resolve_time_rate_cents(uuid,uuid,timestamptz,text)` secdef=true; `close_prior_studio_member_rate` secdef=true; `guard_studio_member_rate_history` secdef=false; `project_time_entries.rate_source` + `.rate_role` text |
| `scripts/run-sql-tests.sh -d …/supabase/tests/billing -H 127.0.0.1 -p 54422` (main-checkout script, brief's form) | total 6 · green **6** · unexpected-fail 0 · **6/6** |
| `scripts/run-sql-tests.sh -d …/supabase/tests/commercial -H 127.0.0.1 -p 54422` (main-checkout script, brief's form) | total 16 · green 10 · **unexpected-fail 6** — allowlist-key artefact, see W1-R3-08 |
| `<worktree>/scripts/run-sql-tests.sh -d supabase/tests/commercial -k supabase/tests/KNOWN_FAILURES.md -H 127.0.0.1 -p 54422` | total 16 · green 10 · expected-fail **6** · unexpected-fail 0 · **16/16** — the six are the documented pre-existing `_countersign_design_services_agreement_impl` aborts, **unchanged** |
| `<worktree>/scripts/run-sql-tests.sh -d supabase/tests/rls -k … -H 127.0.0.1 -p 54422` | total 26 · green 24 · expected-fail 2 · **26/26** — `studio_member_rates_test.sql` **PASS** |
| `… -d supabase/tests/rls -f time_entry -k … ` | 1/1 PASS (`time_entry_auto_roster_test.sql`; note `-f time_entry` does **not** match the new `studio_member_rates_test.sql`) |
| `… -d supabase/tests/billing -f rate` | 1/1 PASS (`time_rate_resolution_test.sql`, 15 cases (a)–(o)) |
| `pnpm db:generate` (SUPABASE_DB_URL → 54422) then `git diff --exit-code packages/supabase/src/database.types.ts` | clean |
| `python3 <worktree>/scripts/generate-legacy-grants.py` | `baseline + 2609 replayed statements`; `git status --short` **empty** |
| `pnpm --filter @patina/supabase type-check` | `tsc --noEmit`, no output |
| `pnpm --filter @patina/supabase test` | 101 files · **1251 passed** · 12 skipped |
| `pnpm --filter @patina/designer-portal type-check` | `tsc --noEmit`, no output |
| `pnpm --filter @patina/designer-portal test -- src/hooks/__tests__/use-time-tracking-authority.test.tsx src/lib/document/__tests__/authority-hours.test.ts` | 2 suites · **10 tests passed** |
| `pnpm --filter @patina/designer-portal test` (full) | 573 suites · **7260 passed** |
| `pnpm --filter @patina/designer-portal lint` | **0 errors**, 201 warnings (all pre-existing) |
| `pnpm --filter @patina/admin-portal build` | exit 0 — the strict gate after a `packages/*` edit |

## Done-when, SQL-probed

| # | Done-when | Verdict |
|---|---|---|
| 1 | commercial green **unchanged**; billing + rls green | **PASS** — 16/16, 6/6, 26/26 (worktree script + `-k`) |
| 2 | `INSERT … (hourly_rate_cents) VALUES (99999)` as `authenticated` on a non-services project stores the resolver's value | **PASS**, probed: insert succeeded, stored `hourly_rate_cents=15000 rated_amount_cents=30000 rate_source=studio_member rate_role=lead_designer billing_state=authorized` |
| 3 | a rate typed on `/desk?account=studio` appears on the next entry with `rate_source='studio_member'` | **SQL half PASS** (probe1/probe4/probe5 all show `studio_member` from a `studio_member_rates` row). **Render half UNVERIFIABLE** — lane B absent (W1-R3-03) |
| 4 | a new hire's services entry carries non-NULL rate + amount and `billing_state='pending_authorization'` (and is **not** promotable — HT-6-b) | **PASS** — `time_rate_resolution_test.sql` cases (c1)–(c5) green; non-promotability pinned at (c4) |
| 5 | a two-role member's ledger row prints the role she picked | **DB half PASS** (case (e): Vendor card 9000 chosen over Lead designer 25000, `rate_role='vendor'` stored). **Ledger render UNVERIFIABLE** — lane B absent |

Plus, unasked and worth stating: **Done-when #2's sibling invariant is broken** — the rate the server owns can be authored by the member herself (W1-R3-01), and a pre-00600 unbilled row's amount does not survive an edit (W1-R3-02).

## Not verified

- **Strata untouched.** No `supabase db push`, no prod mutation, no read of prod beyond what is quoted from earlier rounds' docs.
- Lane B / lane D surfaces (no files to check) and therefore no `DATA_MODE=live` render pass.
- iOS, edge functions, services — W1 touches none.
- `client-portal` / `manufacturer-portal` gates — not in W1's gate list and nothing they consume changed beyond `@patina/supabase` exports, which `admin-portal build` already covers.
- Concurrency: I did not test two simultaneous `studio_member_rates` inserts racing the `BEFORE INSERT` close (`uniq_studio_member_rates_open` should serialize, untested).
