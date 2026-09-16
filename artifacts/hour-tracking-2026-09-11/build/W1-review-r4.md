# W1 — adversarial review, round 4

**clean = false** — 2 blockers (1 money/authorization, 1 wave-level dispatch), 1 major, 2 minor, 5 notes.

Reviewer context: separate from the implementer. Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-server`, branch `hour-tracking/server`, DB = the program's own isolated stack `patina-hours` (API 54421 / Postgres 54422). `supabase/config.toml` untouched and still skip-worktree'd (`git ls-files -v` → `S`). Every finding below was **measured** against a clean `npx supabase db reset --workdir <worktree>`, with a negative control where a regression is claimed.

Diff under review — `git log --oneline origin/hour-tracking/integration..hour-tracking/server`:

```
fc65be3c2 fix(time): W1 review round 3 — the studio that employs her prices the hour, legacy snapshots survive an edit
945e04796 fix(time): W1 review round 2 — name the studio that prices the hour, shut the pay-rate door
f0cf9a177 fix(time): W1 review round 1 — close the resolver's open door, stop re-pricing a signed hour
906b94ab6 test(time): pin rate resolution, studio-rate authorization, and the rate-free insert
d048bad36 feat(time): studio-rate hooks, and rate provenance on the entry type
b39ba9ec2 feat(time): W1 rate truth — the server owns the rate on every project kind
```

14 files, +4103 / −8. Migrations `00598`–`00601` read line by line; `00601`'s body diffed mechanically against `00578:2599-2820`.

---

## Findings

### W1-R4-01 · BLOCKER · confidence HIGH · W1-R3-01's escalation survives the round-3 fix — one invited collaborator and a member prices her own hour again

`supabase/migrations/00599_resolve_time_rate_cents.sql:225-230` (the new multi-member key) with `00598:280-293` (`studio_member_rates_admin_insert`).

Round 3's banner (`00599:120-144`) and commit `fc65be3c2` both claim the door is shut: *"A multi-member-studio key now sits above it; a solo designer's only studio still wins by being the only candidate."* The key is a **proxy**, and the member controls the proxy. `organization_members`' only INSERT policy is

```
Org owners can insert members | INSERT | (is_org_admin_or_owner(organization_id) AND (role <> 'owner'))
```

so the owner of the personal workspace `00295`'s `fc_provision_studio_on_designer` hands every `is_designer` profile can seat a second, non-owner member there **through RLS, client-side**. Her workspace is then "multi-member", the new first key ties, the rate-existence key ties (both studios hold a rate), and `(membership.role = 'owner') DESC` hands the pricing back to her own number — the exact tiebreak round 3 identified.

Measured end to end, every write through RLS as the actor named (`scratchpad/probe_r4b.sql`):

```
collaborator INSERT into her own workspace through RLS SUCCEEDED
personal workspace active non-guest members = 2
self-set 99900 INSERT through RLS SUCCEEDED
RESULT rate=99900 src=studio_member amount=199800
```

`$1,998.00` on a two-hour entry — the identical figure round 3 reported as closed — `billing_state=authorized`, flowing into `project_unbilled_time`, the studio balance, the invoice composer and `claim_time_entries`' invoice lock. HT-3 ("owner/admin only") and HT-1 ("the server owns the rate") are both still defeated, and `time_rate_resolution_test.sql` case (p) passes throughout because its fixture leaves the personal workspace at one member (`p0b` asserts `v_peers = 1`).

**Exact fix** (one key, replacing the multi-member key as the first ORDER BY term; keeps the multi-member key as a third-level tiebreak). Rank first on *"this studio holds a rate for this member that the member did not write herself"* — an arm's-length rate is the only kind HT-3 contemplates:

```sql
    ORDER BY EXISTS (
               SELECT 1 FROM public.studio_member_rates AS arms_length
               WHERE arms_length.studio_id = studio.id
                 AND arms_length.user_id   = p_user_id
                 AND arms_length.created_by IS DISTINCT FROM p_user_id
             ) DESC,
             EXISTS (
               SELECT 1 FROM public.studio_member_rates AS priced
               WHERE priced.studio_id = studio.id
                 AND priced.user_id   = p_user_id
             ) DESC,
             ((
               SELECT count(*) FROM public.organization_members AS peer
               WHERE peer.organization_id = studio.id
                 AND peer.status = 'active' AND peer.role <> 'guest'
             ) > 1) DESC,
             (membership.role = 'owner') DESC,
             membership.joined_at NULLS LAST,
             membership.created_at,
             studio.created_at,
             studio.id
```

Verified in-session by replacing only the function body on the live stack (`scratchpad/proposed_ladder3.sql`):

| probe | shipped | with the fix |
|---|---|---|
| this finding (probe B) | `99900 / studio_member / 199800` | **`15000 / studio_member / 30000`** |
| W1-R4-02 (probe A) | `NULL / none / NULL` | **`18000 / studio_member / 36000`** |
| `time_rate_resolution_test.sql` (a)–(q), 17 cases | all pass | **all pass** (`All time_rate_resolution assertions passed.`) |

Note that `created_by` is nullable with `ON DELETE SET NULL`, so a row whose author's profile is gone reads as arm's-length — the safe direction. Add a test case shaped like probe B (the collaborator INSERT through RLS is what makes it a different case from (p)), and move `00599`'s postcondition from `peer\.organization_id = studio\.id[\s\S]*priced\.studio_id = studio\.id` to one that pins the arm's-length key's text **and** its position above the bare rate-existence key. A naive strengthening — adding the solo-workspace escape `OR (member count) = 1` to that first key — was measured and **fails case (p)** (`FAIL p1`), because it re-admits the one-person workspace; the key above must be arm's-length only, with the solo case carried by the second key.

---

### W1-R4-02 · MAJOR · confidence HIGH · round 3's multi-member key is a $0 write-down for a designer who is also a member somewhere else

`supabase/migrations/00599_resolve_time_rate_cents.sql:225-230`.

The new first key asks "is this a real studio", never "is this the studio that holds her rate" — so it can pick a studio with no rate row for her at all. Shape, entirely ordinary: a designer whose own (one-person) studio prices her at $180/h, who is also an active plain **member** of a three-person studio that has never priced her. `projects.studio_id` is NULL on her own project (the live shape), so the ladder decides; the three-person studio wins the multi-member key, tier 2 finds nothing there, and the hour resolves `'none'`.

Measured (`scratchpad/probe_r4a.sql`, writes through RLS):

```
personal studio active non-guest members = 1
RESULT rate=NULL source=none amount=NULL
```

**Negative control** — the same fixture with only the multi-member key removed from the ladder (i.e. round 2's ordering, `scratchpad/probe_r4a_round2.sql`):

```
RESULT rate=18000 source=studio_member amount=36000
```

So this is a regression introduced by round 3, not a pre-existing hole. It is a **major** rather than a blocker because the row prints honestly (`rate_source='none'` → "rate pending", HT-26) rather than carrying a wrong number — but the unbilled view, the studio balance and the composer all read $0, and `claim_time_entries` will invoice-lock $0, which is the mechanism of HT-6-a.

**Exact fix:** the same ladder in W1-R4-01 (verified: `18000 / studio_member / 36000`).

---

### W1-R4-03 · BLOCKER (wave-level, dispatch not lane A) · confidence HIGH · W1 lane B is absent for the fourth round

Confirmed at `fc65be3c2`:

| plan-v2 §2 portal row | state |
|---|---|
| `account-studio-page.tsx` "Studio rates" section | absent — `grep -c 'useStudioMemberRates\|studio_member_rates\|Studio rates'` → **0** |
| `account/studio-rate-rows.tsx` | file does not exist |
| `hours-ledger.tsx` rate + rate-source column, "rate pending" | absent — `grep -c 'rate_source\|rate pending'` → **0** |
| `authority-hours.ts` `timeRateProvenance` | unchanged: still `if (hourlyRateCents == null \|\| hourlyRateCents <= 0) return null;` (`:74`) — HT-26's "never a blank" is unmet |
| `pending-time-authorization-band.tsx` doorway | absent |
| `authority-hours.test.ts` extension | absent |
| PostHog `time_entry_logged` / `time_rate_unresolved` in `document-events.ts` | absent — `grep -c` → **0** |

Consequences for the wave gate, not for lane A's work:

- **Done-when #3** is verified in SQL only (see below); its `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live` render half cannot run.
- **Done-when #5** ("a two-role member's ledger row prints the role they picked") is verified only as a stored `rate_role`; nothing prints it.
- **HT-27** is ruled as *"the PostHog events ship before any iOS extension wave"*, and plan-v2 §2 puts both in **this** wave "so data accumulates before any capability decision rests on it". Neither exists, so the W6 widget/intent decision has no data starting to accumulate.

**Exact fix:** dispatch lane B against plan-v2 §2's portal table and re-run Done-when #3 and #5 in live mode. Nothing for lane A to change.

---

### W1-R4-04 · MINOR · confidence HIGH · the W1-R3-04 refusal is INSERT-only; an owner can still hand-close the open row and still overlap the history through UPDATE

`supabase/migrations/00598_studio_member_rates.sql:130-156` (the new guard is `BEFORE INSERT`) and `:216-255` (`guard_studio_member_rate_history`, `BEFORE UPDATE`, freezes only `studio_id` / `user_id` / `created_at` on the open row).

Round 3 moved `effective_to` out of the caller's hands on the INSERT path. `studio_member_rates_admin_update` allows an owner/admin to UPDATE the open row, and the history guard does not cover either date column, so both failure shapes W1-R3-04 named are still reachable — by exactly the role that is allowed to write here.

Measured, all writes as the studio owner through RLS (`scratchpad/probe_r4c.sql`, `probe_r4d.sql`):

```
hand-close of the OPEN row via UPDATE: SUCCEEDED (the W1-R3-04 guard is INSERT-only)
open rows now = 0  (0 = every future hour resolves rate pending)
today's hour: rate=NULL src=none

open row effective_from moved BACK via UPDATE: SUCCEEDED
rows covering (today-15) = 2  (>1 breaks the (g6) non-overlap invariant)
history: 10000 [2026-08-13..2026-09-01] | 20000 [2026-08-23..open]
```

The first shape is the worse one: zero open rows, and every hour the member logs from then on resolves `'none'` and invoices at $0, with nothing on the page to say why. The second reproduces the precise state case (g6) asserts cannot exist. Money stays deterministic in the overlap case (tier 2 takes the greatest `effective_from`), and no shipped writer sends either column (`useSetStudioMemberRate`'s payload keys are pinned by its vitest test), which is why this is minor and not major — but the invariant this file asserts is breakable through the product's own write policy.

**Exact fix** — add both date columns to the open row's identity raise in `guard_studio_member_rate_history` (already installed, already INVOKER, already `postgres`-exempt so the DEFINER close ladder is unaffected):

```sql
  IF NEW.studio_id      IS DISTINCT FROM OLD.studio_id
     OR NEW.user_id        IS DISTINCT FROM OLD.user_id
     OR NEW.created_at     IS DISTINCT FROM OLD.created_at
     OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
     OR NEW.effective_to   IS DISTINCT FROM OLD.effective_to
  THEN
    RAISE EXCEPTION 'studio member rate dates belong to the ladder — correct the rate, or write a new dated row'
      USING ERRCODE = 'check_violation';
  END IF;
```

This does not break the blur-save idiom: PostgREST's `ON CONFLICT DO UPDATE` assigns only payload columns, `effective_from` equals the conflict key (so `IS DISTINCT FROM` is false) and `effective_to` is never sent. Pin it with a postcondition on the function text and extend `studio_member_rates_test.sql` case (k) with the two UPDATE vectors above.

---

### W1-R4-05 · MINOR · confidence HIGH · `resolve_time_rate_cents` is still GRANTed to `authenticated` with no caller in the repo

`supabase/migrations/00599_resolve_time_rate_cents.sql:423-424`. Unchanged from W1-R3-05, correctly carried forward as an owed orchestrator ruling. Re-verified this round: the only repo reference is a doc comment at `packages/supabase/src/hooks/use-time-tracking.ts:91`; no hook, route, edge function or service calls it. Every defence inside the function (ASSERT 1/2/3) exists only because the door is open.

**Exact fix (either, by ruling):** revoke from `authenticated` and re-home test cases l1, l2, m3, m4 onto the trigger path, widening `00599`'s `anon` postcondition to `authenticated`; **or** keep the GRANT and say so in plan-v2 §2's signature block. Do not leave it implicit for a third round.

---

### W1-R4-06 · NOTE · confidence HIGH · `00598`'s trigger-ordering postcondition never reads the catalog

`supabase/migrations/00598_studio_member_rates.sql:385-387`:

```sql
  IF 'aaa_guard_studio_member_rate_insert_trg' >= 'close_prior_studio_member_rate_trg' THEN
```

Two string literals — constant-folded, and it can only fail if someone edits the literals. The real protection is the existence assert immediately above it (`:378-384`), which does read `pg_trigger`, so a rename fails there. The ordering claim itself is verified as documentation, not enforced. If it is meant to be enforced, compare the two `tgname`s selected from `pg_trigger` for this relation instead.

---

### W1-R4-07 · NOTE · confidence HIGH · the commercial suite is 16/16 only when invoked worktree-relative with `-k`

The brief's literal form (`/Users/kody/Code/patina-merged/scripts/run-sql-tests.sh -d <abs worktree path>/supabase/tests/commercial -H … -p 54422`) reports **6 unexpected failures**; run from inside the worktree as `./scripts/run-sql-tests.sh -d supabase/tests/commercial -k supabase/tests/KNOWN_FAILURES.md -H 127.0.0.1 -p 54422` it reports **10 green + 6 expected-fail = 16/16, 0 unexpected**. The script prints and matches paths relative to the invoking cwd, so an absolute `-d` produces `.codex/worktrees/agent-server/supabase/tests/…` names that no entry in `KNOWN_FAILURES.md` matches. Same trap for `billing` and `rls`. This is W1-R3-08 restated with the exact mechanism; the plan's §2 gate block still carries the invocation that cannot be green.

---

### W1-R4-08 · NOTE · confidence MEDIUM · `effective_from DEFAULT CURRENT_DATE` is the one date in the chain that is not explicitly UTC

`00598:81`. `00599:398-400` anchors tier 2 on `(p_at AT TIME ZONE 'UTC')::date` and `useSetStudioMemberRate` stamps `new Date().toISOString().slice(0,10)`, both UTC; the column default is `CURRENT_DATE`, i.e. the session/server day. They agree on a UTC-configured server (Supabase's default) and diverge on any other. The `COMMENT ON COLUMN` added this round (`:109-111`) names the UTC day as the contract, so either pin the default (`DEFAULT (now() AT TIME ZONE 'UTC')::date`) or note that no writer relies on the default.

---

### W1-R4-09 · NOTE · confidence HIGH · `00598`'s idempotency backfills the column but not the constraints

`CREATE TABLE IF NOT EXISTS` plus `ADD COLUMN IF NOT EXISTS updated_at` (`:92-93`) means a stack carrying an **earlier shape** of `studio_member_rates` gains `updated_at` and not the inline `UNIQUE (studio_id, user_id, effective_from)` or `CHECK (effective_to IS NULL OR effective_to >= effective_from)`. No such stack exists (the table is new, and Strata has never held it), so this costs nothing today — recorded only so the file's "idempotent" claim is not read as "converges any prior shape".

---

### W1-R4-10 · NOTE · confidence HIGH · five hypotheses tested and refuted — recorded so round 5 does not re-spend them

1. **The STABLE resolver and `00597`'s same-statement roster seat.** `resolve_time_rate_cents` is `STABLE` and is called from `aac_` after `aaa0_time_entry_auto_roster_trg` has inserted a seat in the same statement; a stale snapshot would have stranded the first log of every new hire. Probed (`scratchpad/probe_snapshot.sql`): a studio co-member with no roster row logs 60 min → `seats=1 rate=14000 src=studio_member rate_role=support_designer`, identical to her second log. The seat is visible. No finding.
2. **The "verbatim graft" claim.** `sed -n '2599,2825p' 00578` vs `sed -n '99,432p' 00601`, diffed: the only changes are the three new DECLAREs and deltas 1, 2, 4, 5, the non-billable bound-row preservation, the three server-owned branches and `NEW.rate_source := 'authority'`. Every 00578 invariant — the immutability raise, the bound-provenance raise, the `FOR UPDATE` project lock, the 00575 nullable-ceiling delta, retainer gating, the ceiling sum — is byte-identical. Nothing silently reverted.
3. **The invoiced-entry lock (§0.12).** `guard_invoiced_time_entry` sorts **after** `aac_classify_project_time_entry_authority_trg` in `pg_trigger` name order, so the classifier's new `hourly_rate_cents` writes are still seen and refused by the lock on an invoiced row; and every `aac_` watched column except `billing_authority_id` / `authority_rate_id` / `rate_role` is already frozen by it, with those three refused upstream by `aab_`. The lock is neither weakened nor routed around.
4. **Program rules, grep-verified across the wave's four migrations and six commits.** No flag (`useFeatureFlag` / `posthog` / `ComingSoon`: 0 hits in the diff); no backfill (no top-level `UPDATE … project_time_entries`; `00602`/`00603` correctly unused); no rollup and therefore no `notes` in one; the running-slot index `uniq_project_time_entries_running_timer` untouched; no policy keyed on `projects.studio_id` (`studio_member_rates.studio_id` is the table's own FK to `organizations`, which §0.13 permits); `project_time_entries` changed only by `ADD COLUMN IF NOT EXISTS`; the guard's column list extended in **both** the `IS DISTINCT FROM` chain and the `aab_` `BEFORE UPDATE OF` list, with `rate_role` also in `aac_`'s; §0.7(c) shipped as the ratified 2 refusals + 2 discards.
5. **The 00484 contract (§0.17).** All four registered policies present with the exact names and the exact quals §0.17's correction predicts — `Team can view their project time entries` is still `is_project_team_member(project_id)` alone, the other three still carry the `user_id = auth.uid()` leg. None dropped, renamed or re-qualified. `studio_member_rates` carries exactly 3 policies, no DELETE policy, and `authenticated` holds no DELETE.
6. **Migration numbers.** `git fetch --all --prune` then `git ls-tree` per ref: `00598`–`00603` exist on `hour-tracking/server` (and its remote) alone. No sibling branch collides. W1's range matches §0's amendment, with `00602`/`00603` deliberately unused.

---

## Gates re-run (this reviewer, clean stack)

| command | result |
|---|---|
| `npx supabase db reset --workdir <worktree>` | **clean** — applied `00595`…`00601` + `20260910152111`, 22 seeds loaded, every postcondition replayed |
| `scripts/run-sql-tests.sh -d supabase/tests/billing -H 127.0.0.1 -p 54422` | **6 / 6 green**, 0 unexpected-fail |
| `scripts/run-sql-tests.sh -d supabase/tests/commercial -k supabase/tests/KNOWN_FAILURES.md …` | **10 green + 6 expected-fail = 16 / 16**, 0 unexpected-fail (unchanged; see W1-R4-07 for the invocation that matters) |
| `scripts/run-sql-tests.sh -d supabase/tests/rls -k … ` | **24 green + 2 expected-fail = 26 / 26**, 0 unexpected-fail |
| `scripts/run-sql-tests.sh -d supabase/tests/rls -f time_entry …` | **1 / 1 green** |
| `scripts/run-sql-tests.sh -d supabase/tests/billing -f rate …` | **1 / 1 green** (cases (a)–(q) all print `passed`) |
| `python3 scripts/generate-legacy-grants.py` → `git status --short` | **empty** — regenerated seed is byte-identical to the committed one; `00598`/`00599`/`00600`/`00601` REVOKEs all present under their own comments |
| `SUPABASE_DB_URL=…:54422 pnpm db:generate` → `git diff --exit-code packages/supabase/src/database.types.ts` | **clean** |
| `pnpm --filter @patina/supabase type-check` | **clean** |
| `pnpm --filter @patina/supabase test` | **101 files / 1251 tests passed**, 12 skipped |
| `pnpm --filter @patina/designer-portal type-check` | **clean** |
| `pnpm --filter @patina/designer-portal test src/hooks/__tests__/use-time-tracking-authority.test.tsx` | **1 suite / 3 tests passed** (incl. the exact-insert-shape assert) |
| `pnpm --filter @patina/designer-portal test` (full) | **573 suites / 7260 tests passed** |
| `pnpm --filter @patina/designer-portal lint` | **0 errors**, 201 pre-existing warnings |
| `pnpm --filter @patina/admin-portal build` | **green** (the one portal whose build enforces types) |
| `git status --short` (worktree) | **empty**; `git ls-files -v supabase/config.toml` → `S` (skip-worktree, absent from every commit) |

## Done-when, SQL-probed

`scratchpad/donewhen.sql`, every write as the named actor under `SET LOCAL ROLE authenticated` + a JWT claim:

| Done-when | probe | result |
|---|---|---|
| #1 commercial unchanged; billing + rls green | above | ✅ |
| #2 `INSERT … (hourly_rate_cents) VALUES (99999)` on a non-services project stores the resolver's value | a rostered member inserts 120 min with `hourly_rate_cents = 99999` | ✅ `rate=13500 src=studio_member amount=27000 state=authorized role=support_designer` — 99999 discarded |
| #3 a rate typed by the owner appears on the next entry with `rate_source='studio_member'` | the owner writes `13500` through `studio_member_rates_admin_insert`, then the member logs | ✅ in SQL; ❌ the live-mode render half (W1-R4-03) |
| #4 a new hire's services entry carries non-NULL rate + amount and `pending_authorization` | `time_rate_resolution_test.sql` case (c), and its (c4) assert that the row is **not** promotable (HT-6-b, owed) | ✅ |
| #5 a two-role member's row records the role she picked | a member holding `support_designer` + `vendor` logs with `rate_role='vendor'` | ✅ `rate=11000 src=studio_member role=vendor` stored; ❌ nothing prints it (W1-R4-03) |

## Not verified

- **Anything on Strata.** No `db push`, no prod probe. Read-only nothing.
- **Lane B's surfaces** — they do not exist (W1-R4-03), so no live-mode render check, no `timeRateProvenance` behaviour, no PostHog emission was or could be exercised.
- **The six red `commercial` files' contents.** Confirmed pre-existing and documented in `supabase/tests/KNOWN_FAILURES.md`; I did not re-derive that each aborts inside `_countersign_design_services_agreement_impl` (W1-R1-15 established it, and the plan already forbids reading commercial green as authority-path coverage).
- **Non-`designer-portal` lint, `client-portal`, `manufacturer-portal`, services.** Outside this wave's diff; `admin-portal build` is the shared-package gate and it is green.
- **Concurrency.** No two-session test of the close ladder under a simultaneous blur-save on the same `(studio_id, user_id)`; `uniq_studio_member_rates_open` is the backstop and was not raced.
