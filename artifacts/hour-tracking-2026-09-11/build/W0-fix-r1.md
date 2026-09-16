# W0 — review round 1, fixes applied

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-server`, branch `hour-tracking/server`.
Local stack: the program's own port-isolated Supabase project `patina-hours` (Postgres `127.0.0.1:54422`).
Every migration edited **in place** — W0 is unmerged and unapplied to prod, so no "fix" migration was added.

## Disposition

| id | verdict | where |
|---|---|---|
| **m1** | FIXED | `supabase/tests/billing/time_unbilled_view_repair_test.sql` — new design-services arm, case **(c)** (header `:18-40`, fixtures `:87-184`, asserts `:251-312`) |
| **m2** | FIXED | `artifacts/hour-tracking-2026-09-11/build/plan-v2.md` — §0.2a rewritten (`:31`), §0.2 corrected (`:30`), every §1–§7 migration number shifted back **-3** to match the line-25 amendment (74 lines touched) |
| **m3** | FIXED | `supabase/migrations/00597_time_entry_auto_roster.sql` — NULL-actor bypass **removed** (body `:100-120`, banner `:26-45`, COMMENT `:142-148`); pinned by new case **(h)** at `supabase/tests/rls/time_entry_auto_roster_test.sql:266-313` |
| **m4** | FIXED (i) as process + (ii) in the allowlist | `supabase/tests/KNOWN_FAILURES.md:83-101`; every suite below was run worktree-relative with `-k supabase/tests/KNOWN_FAILURES.md` |
| **m5** | FIXED (reporting) | stated below — both Done-when bullets are **fixture-proven, not seed-proven**; no seed row added |
| **m6** | ACCEPTED, no code change | merge-commit instruction recorded below |
| **N1** | FIXED | `supabase/tests/KNOWN_FAILURES.md` — new entry for `field/field_capture_note_routing_test.sql` (field suite now reads 6/6) |
| **N2** | ACCEPTED, no change | footers left as written; merge instruction recorded below |
| **N3** | CARRIED to the owed list | below, and already in plan-v2 §12 risk 5c |
| **N4** | FIXED | `plan-v2.md` §1 "Callers to repoint" — `accounts/invoice-composer.tsx` (claim `:393`, compensating `deleteDraft` `:400`); `overlays/` appeared **once** in the whole file, so §3/§4 needed no edit |
| **N5** | FIXED | `packages/supabase/src/hooks/use-time-tracking.ts:483-496, 527-531` — the 23505 warning degrades to `console.warn`, never to silence |
| **N6** | recorded, no action | `service_role=X/postgres` on `claim_time_entries` is a Supabase default privilege, not a W0 grant; §0.16's requirement (`REVOKE … FROM PUBLIC, anon` + explicit `GRANT … TO authenticated`) is met |

## What each fix does

### m1 — the design-services arm of the repaired view now has an executing guard

`time_unbilled_view_repair_test.sql` case (c) builds the authority fixtures directly
(`proposals` → `proposal_service_rates` → `project_commercial_documents` kind
`design_services`, `is_origin` → `project_billing_authorities` (active, `effective_at`
before the work, ceiling **25000**) → `project_billing_authority_rates` ($100/h,
`role_name` 'Support designer'), plus a `support_designer` roster seat for the author in a
second studio so case (a)'s profile-visibility precondition is untouched). Two 120-minute
entries are inserted carrying **no** `hourly_rate_cents`, so the only rate available to the
classifier is the signed one.

Asserted: (c1) the row binds `billing_authority_id` + `authority_rate_id`, carries the
authority rate `10000`, is `authorized`, and is rated `20000`; (c2) it appears in
`project_unbilled_time`; (c3) `round(120/60 * resolved_rate_cents) = amount_cents` on it;
(c4) its over-ceiling sibling is `pending_authorization` and is **absent** from the view.

**CORRECTED in review round 2 (finding m3).** This report originally claimed "case (b1)'s 'every
row reconciles' sweep now also covers the authority-rated row." That was **false**. `(b1)` runs as
`a7200000-…-001`, the non-services studio's designer; `project_unbilled_time` is
`security_invoker = true`; and case (c)'s rows live in a deliberately separate studio
(`a7210000-…`), so no policy on `project_time_entries` gives that designer SELECT on them. `(b1)`'s
"every row of the view" was two rows, not four. There was no coverage gap — `(c3)` asserts the
reconciliation on the authority-rated row directly — but the sentence overstated what a later wave
could trust. Round 2 also **made it true**: the sweep now runs a second time as
`a7210000-…-001` (new case `(c5)`), with a companion assert that the sweep saw at least one row so
it cannot pass on an empty result set — which is exactly how `(b1)` silently missed this studio.

Two fixture facts worth keeping: the commercial ledger's write guard
(`00414`'s `guard_commercial_ledger_write`) admits `current_user = 'postgres'`, which is the
test session's role, so the countersign ceremony is not needed; and the proposal must stay
`status='draft'`, because `guard_commercial_authored_child` (00575) freezes
`proposal_service_rates` the moment it leaves draft. Nothing in the rate path the classifier
walks reads `proposals.status`.

This guard is deliberately independent of `commercial/design_services_authority_test.sql`,
which still aborts 44 lines before its own `project_unbilled_time` asserts.

### m2 — plan-v2's numbering is self-consistent again

§0.2a claimed the peer program had committed `00595–00597` and demanded a second +3 shift.
Re-verified here, independently: `origin/build/people-room-crm-2026-09-11` (tip `c4ca5b9f1`)
holds `00592_people_cards_affiliations_rules.sql`, `00593_studio_contact_channels.sql`,
`00594_studio_channel_consent.sql` and nothing above; `00595–00597` exist on
`hour-tracking/server` alone; `00598–00600` exist on no ref. The premise was false, the
implementation (files `00595`, `00596`, `00597` on disk) was right.

§0.2a now keeps the lesson (re-check sibling **branches**; a renumber is program-wide) and
drops the false fact. Every `### Migrations (…)` heading and every cross-reference in §0–§12
now matches the line-25 amendment:

| Wave | Range |
|---|---|
| W0 | `00595–00597` (as committed) |
| W1 | `00598–00603` — **W1 mints from 00598** |
| W2 | `00604–00607` |
| W3 | `00608–00609` |
| W4 | `00610–00614` (lane D's cron = `00614`) |
| W5 | none; `00615` reserved, unused |
| W6 | `00616–00617` |
| W7 | `00618–00620` (unchanged — §8 had never taken the second shift, which is what made the file contradict itself) |

§0.20's ACL-seed list is now `00595, 00598, 00599, 00607, 00608, 00614, 00618`; §11's
type-regeneration ownership line and merge-order steps 1/2/4/5 moved with it. The all-branch
number check is still owed immediately before every merge.

### m3 — the auto-roster trigger fails closed when there is no actor

`00597` no longer seats anyone when `auth.uid()` IS NULL. The reviewer's suggested
`current_user <> 'postgres'` discriminator cannot work here and the banner now says so:
inside a SECURITY DEFINER function `current_user` is always the owner (`postgres`), whatever
role called in — that is why 00414's `guard_commercial_ledger_write` can use it (INVOKER)
and this one cannot.

The reason for fail-closed rather than a documented bypass is the direction of the effect:
`00317:38-39`'s precedent bypasses a guard that **refuses** a write, while this trigger
**grants** a privilege — a seat satisfies `Team can view their project time entries`, whose
live qual is `is_project_team_member(project_id)` alone, i.e. SELECT on every row of the
project, notes included. Under a NULL actor the co-membership gate cannot be evaluated at
all (`is_studio_comember` reads `auth.uid()`), so a service_role / cron / migration writer
could otherwise seat a total stranger and hand them that read. Nothing writes
`project_time_entries` server-side today, so the change costs nothing now; a future
server-side writer must seat deliberately. **Re-check before W4/lane D adds any writer.**

Case (h) pins both halves: with no JWT the insert seats **nobody** (h1), and the same member
on the same un-rostered project under her own JWT **is** seated `support_designer` (h2) — so
h1 cannot pass by the trigger having simply stopped working.

### m4 — how the SQL gates are run, and what "commercial green" is worth

(i) `run-sql-tests.sh` defaults `-k` to `<dir>/KNOWN_FAILURES.md`, and no per-directory file
exists, so an absolute `-d …/supabase/tests/commercial` reads every documented failure as
UNEXPECTED. Every run below is worktree-relative with an explicit
`-k supabase/tests/KNOWN_FAILURES.md` (plus `-H 127.0.0.1 -p 54422`). Every wave report
must say it did the same.

(ii) `KNOWN_FAILURES.md` Group 3 now records the **current** failure point for all five
commercial files (four at `design services agreement <uuid> not found or access denied`
inside `_countersign_design_services_agreement_impl`; `design_services_gap_hardening_test` at
`proposal … failed canonical project provenance`), keeps the 2026-08 `designDisposition`
diagnosis for context, and states the consequence outright:

> `supabase/tests/commercial` exercises **10 of its 16 files**, and the four countersign
> files stop BEFORE their authority asserts — never report "commercial green" as coverage of
> the authority rate path.

**For the W1 brief:** the classifier rewrite's DB gate is *the 10 green commercial files plus
W1's own new suites* (`time_rate_resolution_test.sql`, `studio_member_rates_test.sql`), never
"commercial green". Repairing the countersign fixture drift is a pre-existing, separate job
and was not attempted here.

### m5 — the two Done-when bullets are fixture-proven

After a clean reset `project_time_entries` is empty and `project_unbilled_time` returns 0
rows; no seed file writes time entries. So:

- *"a SELECT of `project_unbilled_time` as the owner includes an entry authored by a roster
  vendor who is not an org member"* — proven by `time_unbilled_view_repair_test.sql` case (a),
  which pins the precondition (the designer cannot read the vendor's profile) and then the
  payoff (both entries are in the view).
- *"on any one row: `round(duration_minutes/60.0 * resolved_rate_cents) = amount_cents`"* —
  proven by case (b1) across every row of the view, and by case (c3) on an authority-rated
  row specifically.

No seed row was added (it would be new shared-fixture surface for every other program on a
shared stack). If W2's scope lens wants data to render, seeding one unbilled/authorized
/billable entry is a one-file change at that point.

### N5 — the duplicate-timer warning cannot go silent

`useStartTimer(options?: { toast })` keeps its optional shape (one call site,
`document-time-provider.tsx:137`, already passes a toast) but the handler now routes through
a local `notify()` that falls back to `console.warn('[useStartTimer] …')`. A future ⌘K or
mobile call site that forgets `{ toast }` degrades to the console rather than losing the only
feedback for SQLSTATE 23505.

## Gate outputs

Object probes bracketing the run (after `supabase db reset` on the isolated stack, per §11's
amended reset rule):

```
claim_fn=1
roster_fn_null_guard=true
viewdef_no_profiles=true
source_ck_vals=CHECK ((source = ANY (ARRAY['timer_auto','timer_manual','manual_entry',
  'field_visit','command_bar','field_manual','internal','widget','intent'])))
first BEFORE-INSERT trigger=aaa0_time_entry_auto_roster_trg
```

```
supabase db reset                                  → Finished supabase db reset (548 migrations + 15 seeds)
python3 scripts/generate-legacy-grants.py          → baseline + 2600 replayed statements; seed file UNCHANGED (no grant delta)
run-sql-tests.sh -d supabase/tests/billing    -k …/KNOWN_FAILURES.md → 5/5 green, 0 unexpected
run-sql-tests.sh -d supabase/tests/rls        -k …/KNOWN_FAILURES.md → 23 green + 2 expected-fail = 25/25, 0 unexpected
run-sql-tests.sh -d supabase/tests/commercial -k …/KNOWN_FAILURES.md → 10 green + 6 expected-fail = 16/16, 0 unexpected
run-sql-tests.sh -d supabase/tests/field      -k …/KNOWN_FAILURES.md → 5 green + 1 expected-fail =  6/6, 0 unexpected
pnpm db:generate → git diff --exit-code packages/supabase/src/database.types.ts → exit 0 (in sync, no delta)
pnpm exec turbo build --filter=@patina/supabase --force → 2 successful, 0 cached
pnpm --filter @patina/supabase type-check        → clean (tsc --noEmit)
pnpm --filter @patina/designer-portal type-check → clean (tsc --noEmit)
pnpm --filter @patina/designer-portal test       → 573 suites / 7259 tests passed
pnpm --filter @patina/admin-portal build         → build succeeded (the type-enforcing portal gate)
```

`supabase/tests/rls/project_roster_test.sql`, `people_directory_scope_test.sql` and
`field/time_entry_field_visit_source_test.sql` — the "must stay green unchanged" set — are all
green above.

## Carried forward

- **m6 — the merge commit must say this** (no code change; the tip is correct in every
  respect, only the early history misleads): the numbers in `343252aaa`/`ef8fe776f` are
  **pre-renumber** (00592–00594 / V10 / R151; the shipped set is 00595–00597 / **V11** /
  **R152**), and `project_unbilled_time`'s `profiles` join is **removed outright**, not
  outer-joined — `343252aaa`'s body says "now LEFT JOINs profiles" and the file it shipped
  asserts `NOT LIKE '%JOIN profiles%'`. `f0f97145b` carried six migrations for one commit
  (three duplicates) and `de4b18553` removed the old three, so the series is not bisectable:
  squash `343252aaa..de4b18553` at merge, or carry this paragraph in the merge commit.
- **N2 — expect a textual conflict** in both `DECISIONS.md` and `VISION-DECISIONS.md` (both
  programs append at the identical end-of-file position). Resolve by keeping **both** entries
  in id order, leaving the footers as written, and saying in the merge commit which side
  moved (hour tracking moved: R152 / V11).
- **N3 — owed to Kody:** paste V11's §6 bullet into `docs/vision/VISION.md` after `:73`
  (that file is **untracked**, so no lane can commit it). The bullet cites
  `(V11, 2026-09-11)` — paste the renumbered text.
- **HT-25-a** (owner's removal does not stick) and **HT-10-a**'s downstream work remain as
  recorded in `rulings.md` / plan-v2 §12.
