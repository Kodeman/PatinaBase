# Architecture — hour tracking build-out

**Status:** the build plan. Inputs: `synthesis.md` (binding where it contradicts the
draft), `briefing/architecture-draft.md` (superseded in the places named below),
`panel/memo-feasibility.md` (effort verdicts, the nullable-`project_id` breakage
list), `panel/memo-critic.md` (the §8 pass/fail that decides what is in v1 at all).

**Eight waves, 30–50 eng-days, critical path 15–25.** Nothing in this plan is a new
route, a tab bar, a page, a dashboard, an approval workflow, or a second hours
surface. Everything lands in `project_time_entries` (R4, additive), in the Hours
ledger (R77), in the People Room, or in Patina Field.

---

## §0 · Rules that bind every wave

| Rule | Why | Source |
|---|---|---|
| **Migration numbers are minted as `origin/main head + n` after `git fetch`, never written as a literal.** Local `main` is stale; Strata/origin head is eleven ahead of the local checkout. Re-check the integration target's tip immediately before merge, not at branch creation. | six-plus renumber incidents in this repo | FS-43; `patina-parallel-work` step 6 |
| **Every classifier edit re-anchors on the head body, not on 00412.** `classify_project_time_entry_authority` has been redefined twice; the head body is `00578:2599-2820`. Every sub-line the draft cites is stale by two redefinitions. | a subtle edit silently re-rates history | FS-10; draft `:3,7,8,63,97` |
| **`is_org_admin_or_owner(_organization_id, _user_id DEFAULT auth.uid())` is the only "owner/admin of this studio" helper this program may call.** `user_is_org_member` is the one un-hardened SECURITY DEFINER helper in this area (no `search_path`, no caller assert, never revoked from PUBLIC) and gets **no new call sites**. | `00484:604-623` vs `00021:484-517` | FS-19 |
| **No RLS policy is ever keyed on `projects.studio_id`.** 00317 refuses it as an RLS gate by design because legacy rows leave it NULL. Where a studio scope is needed, go through `is_studio_comember(projects.designer_id)` as 00316 does. | `00317:15-18` | FS-16 |
| **The column is `organization_members.role` (type `member_role`), not `member_role`.** A policy written from the briefing will not compile. | `00021:136`, type at `:22` | FS-18 |
| **No new SELECT policy on `project_time_entries` in this program.** `time_entries_studio_read` already grants every active non-guest studio co-member SELECT on every studio entry, notes included. The briefing's "No studio-admin policy" and OPS-5 are refuted. | `00316:237-240`; `is_studio_comember` head `00556:51-75` | FS-3, CR-5 |
| **No SECURITY DEFINER rollup.** The draft's rationale is factually false (the rows are already co-member-readable) and its signature carries no `p_studio_id`, so the assert it promises cannot be written. Any rollup RPC this program adds is SECURITY INVOKER. | HT-38 | FS-4 |
| **Every new SECURITY DEFINER function follows the 00484 contract**: `SET search_path`, a caller assert, `REVOKE … FROM PUBLIC` + explicit `GRANT`. | `00484` authorization contract | FS-19 |
| **The zero-tap in-document path is not regressed by any wave.** The entry is written before the strip appears and persists if ignored. No wave may add a required field to it. | `log-strip.tsx:11-12`; `document-time-provider.tsx:283-290`; R20 | FS-27, CR-28, VET-1, LEAH-4, OPS-8 |
| **Totals sit above the rows that produced them.** HT-30's strengthened §6 test: *a total is permitted as the front matter of the rows that produced it; a total with no rows beneath it is a dashboard.* | HT-30 | CR-27 |
| **Gate discipline:** the real gate per target comes from `.claude/skills/patina-verification/SKILL.md`'s matrix, not from a script name. `turbo` silently skips workspaces with no such script. Any designer-portal render check runs with `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live` or the mock fallback fakes it green. | verification skill, false-green trap 1 | FS-42 |

**What the draft got wrong and this plan drops outright:** the DEFINER
`studio_hours_rollup`; the new `studio_id`-keyed RLS SELECT policy; every new call
site on `user_is_org_member`; `stop_timer`/`discard_timer`/`adjust_time_entry`/
`delete_time_entry` as RPCs (an RLS policy is the right mechanism, FS-40); Wave 5
whole (widget + Live Activity, §8 side journeys); and the unlogged-day nudge and
its setting.

---

## §1 · Wave 0 — The live money bugs, and one canonical hook module

**Goal.** Stop the two silent money defects and the constraint archaeology before a
single capability is built on top of them.

**Ships**
- "Bill it" can no longer un-bill entries that were already on the invoice.
- The studio's unbilled balance counts an entry logged by a roster vendor or
  bookkeeper who is not an org member (it silently dropped them).
- The rate printed beside an unbilled amount is the rate that priced the line.
- Every capture surface this program adds has a legal `source` value, bought once.
- Three dated governance entries, zero code: HT-33 (Patina Field is **The Document
  off-desk**, not a fourth surface — without it a literal §8 test parks W6),
  HT-32 (D9 amended to *capture belongs wherever the work happened; review belongs
  only in the drawer ledger, never a page*), HT-30 (§6 strengthened with the
  totals-above-rows test). Plus the HT-1…HT-40 rulings Kody settles.
- One canonical hook module: `packages/supabase/src/hooks/use-time-tracking.ts`.

**DB** (additive to `project_time_entries` per R4; migrations `head+1 … head+3`)
- `head+1` — `public.claim_time_entries(p_invoice_id uuid, p_entry_ids uuid[])`,
  SECURITY INVOKER, one statement, `RETURNS SETOF uuid`. Stamps only the ids passed;
  a conflict rolls the transaction back instead of compensating. Replaces the
  client-side claim whose rollback runs `update({invoice_id:null}).eq('invoice_id',
  invoiceId)` and detaches every entry the invoice already carried
  (`use-time-tracking.ts:604-621`).
- `head+1` — widen the `project_time_entries.source` CHECK (today four values,
  `00198:25-26`, widened once by `00545:149`) with `command_bar`, `field_manual`,
  `internal`, and the reserved `widget`, `intent`. The constraint is already named
  `project_time_entries_source_ck`, dropped and re-added by name at `00545:147-148`
  — no archaeology needed here (00545 is 232 lines).
- `head+2` — redefine `public.project_unbilled_time`, keeping the name (three
  callers plus an existing SQL test read it): **LEFT JOIN `profiles`** in place of
  the INNER JOIN that 00555 documents as row-dropping (`00412:2683-2685`;
  `00555:3024-3026`), and one rate source so the rate printed is the rate that
  priced the line — drop the `change_order_terms → profiles.default_hourly_rate_cents
  → 0` chain (`00412:2676-2682`).
- `head+3` — reserved (renumber headroom only).
- No new policy, no new table, no trigger change.

**Portal**
- Move `apps/designer-portal/src/hooks/use-time-tracking.ts` →
  `packages/supabase/src/hooks/use-time-tracking.ts` and re-export from the package
  index. **Keep app-local:** `document-time-provider.tsx`, `lib/document/time-derivation.ts`,
  `lib/document/authority-hours.ts` (document-coupled, per CR-28).
- `useClaimTimeEntries` → `rpc('claim_time_entries')`; delete the compensating
  detach (`use-time-tracking.ts:616-619`).
- Delete `useTimeEntries` (`:118`), the `useTimeSummary` **hook wrapper only**
  (`:271` — `fetchTimeSummary` keeps three live callers via `use-projects.ts:481`),
  `useReleaseTimeEntries` (`:634`), and the stale section comment at `:653`.
- Callers to repoint: `hours-ledger.tsx:162`, `invoice-composer.tsx:611-616`.

**iOS** none. **Edge/cron** none.

**PostHog events** none. (The set starts in W1.)

**Tests + gates**
- New `supabase/tests/billing/time_claim_atomicity_test.sql`: a partial-claim
  conflict leaves every pre-existing `invoice_id` intact; a roster `vendor` who is
  not an org member appears in `project_unbilled_time`.
- `supabase db reset`
- `scripts/run-sql-tests.sh -d supabase/tests/commercial` — the existing
  `design_services_authority_test.sql:221,349,362` assertions read the view and
  must still pass
- `scripts/run-sql-tests.sh -d supabase/tests/billing`
- `git diff packages/supabase/src/database.types.ts`
- `pnpm turbo build --filter=@patina/supabase` (a fresh consumer type-check against
  a stale `dist/` is the `proposalTierVisibility` incident class)
- `pnpm --filter @patina/supabase type-check && pnpm --filter @patina/supabase test`
- `pnpm --filter @patina/designer-portal type-check && pnpm --filter @patina/designer-portal test`
- `pnpm --filter @patina/admin-portal build` — the repo's strictest gate, mandatory
  after any `packages/*` edit

**Depends on** nothing. This wave runs alone, before any parallelism opens.

**Effort: M (3–5 d).** Three small DB objects plus a mechanical module move; the
real cost is the `source` constraint-name archaeology and re-verifying four call
sites of a view an existing SQL suite asserts on.

**Ship gate.** The SQL test above is green; `run-sql-tests.sh -d
supabase/tests/commercial` is green on an unchanged suite; `admin-portal build`
passes; a live-mode render of the Hours ledger still shows the unbilled balance and
"Bill it" still claims. The three governance entries are committed with dates.

**Flag:** unconditional, precedent: time tracking ships unflagged.

**Droppable under pressure:** the hook move, and only the hook move (CR-28: house
consistency, the first thing to drop). If it drops, every later wave edits
`apps/designer-portal/src/hooks/use-time-tracking.ts` instead — say so in the wave
brief rather than leaving it ambiguous.

---

## §2 · Wave 1 — Rate truth: the server owns the rate, and the rate lives on the person

**Goal.** One server-owned answer for what an hour is worth, on every project kind,
with the source printed on the row — and a place to set it.

**Ships**
- A member can no longer price their own hour. On non-services projects the hour
  stops landing at NULL or $0.
- A new hire's hours price at their studio rate and stay `pending_authorization` —
  visible cost, still un-invoiceable without an addendum. They are no longer
  permanently stranded money.
- Every row prints its rate **and** its `rate_source`; an unresolved rate prints
  "rate pending", never a blank.
- `pending_authorization` becomes a doorway to the authority band / the person's
  rate, instead of a dead static badge.
- A per-member studio rate, set on the member's profile in the People Room,
  blur-save, owner/admin only, with dated history rows.
- Existing stranded rows are re-rated by a one-off backfill.

**DB** (migrations `head+4 … head+9`)
- `head+4` — `public.studio_member_rates(id, studio_id → organizations,
  user_id → profiles, hourly_rate_cents int not null, effective_from date not null,
  effective_to date null, created_by, created_at)`. Append-only; a trigger closes
  the prior open row on insert. `UNIQUE (studio_id, user_id, effective_from)`.
  RLS: SELECT own row OR `is_org_admin_or_owner(studio_id)`; INSERT/UPDATE
  `is_org_admin_or_owner(studio_id)` only; no DELETE policy (history is a fact).
- `head+5` — `public.resolve_time_rate_cents(p_project_id uuid, p_user_id uuid,
  p_at timestamptz) RETURNS record (cents int, source text)`, SECURITY DEFINER per
  the 00484 contract (`SET search_path`, caller assert, REVOKE from PUBLIC +
  explicit GRANT to `authenticated`). Order: the project's signed
  `project_billing_authority_rates` row covering `p_at` → `studio_member_rates` row
  covering `p_at` → `none`. **Both legacy legs are cut, not preserved** (HT-2):
  `change_order_terms->>'hourly_rate_cents'` has only the legacy scope builder as a
  writer (`use-scope-builder.ts:945-950`), and `profiles.default_hourly_rate_cents`
  has no writer anywhere.
- `head+6` — `project_time_entries ADD COLUMN rate_source text CHECK (rate_source
  IN ('authority','studio_member','none'))`; extend
  `guard_commercial_time_entry_derived_fields`'s guarded column list with it.
- `head+7` — redefine `classify_project_time_entry_authority` **from the head body
  at `00578:2599-2820`**, keeping all three immutability raises
  (`:2620-2627`, `:2677-2682`, `:2765-2771`) verbatim, so that it calls the resolver
  and owns `hourly_rate_cents` + `rated_amount_cents` + `rate_source` on **every**
  branch, including the three the draft missed:
  - the non-services early branch (`00578:2648-2653`),
  - the no-authority-covering-`started_at` branch, which today leaves the caller's
    value untouched (`00578:2694-2699`, FS-9),
  - the no-exact-one-role-match branch, which today nulls the rate and strands the
    row for ever (`00578:2765-2771`; promotion filter `00577:2493-2496`).
  `billable` stays client-set (W3 gives it a control everywhere); the classifier may
  only **downgrade** it to false when no authority covers the work, never upgrade it,
  and records the reason through `billing_state` + `rate_source`. That is HT-12's
  one rule and HT-11's "no server change for the pill", reconciled.
- `head+8` — one-off backfill: a pre-flight `SELECT count(*)` of rows whose
  `hourly_rate_cents` would change (FS-124), then an UPDATE of a classifier-watched
  column to re-fire it across stranded rows. Report the count in the ship note.
- `head+9` — reserved.

**Portal** (files to touch)
- `packages/supabase/src/hooks/use-time-tracking.ts` — `rate_source` on the entry
  type; stop sending any rate.
- `apps/designer-portal/src/components/document/hours-ledger.tsx` — rate + rate
  source column; "rate pending" in place of the silent null.
- `apps/designer-portal/src/lib/document/authority-hours.ts:74-88` — the
  provenance label stops returning `null` (HT-26).
- `apps/designer-portal/src/components/document/pending-time-authorization-band.tsx`
  and the `hours-ledger.tsx:660-676` badge — badge becomes a doorway to the
  authority band / the person's rate.
- `apps/designer-portal/src/components/document/people/views/person-profile.tsx`
  (+ a new `people/profile/studio-rate-card.tsx`) — the rate field, blur-save,
  owner/admin only, dated history rows beneath it. The studio team already appears
  in the People Room directory (`views/directory-view.tsx:5,358`), so this is where
  Leah already manages a hire — not a settings maze (LEAH-11).
- New hook module `packages/supabase/src/hooks/use-studio-member-rates.ts`.
- Delete the `profiles.default_hourly_rate_cents` **fallback** (the column drop
  waits until the view rewrite has been live a cycle, FS-22).

**iOS** none. **Edge/cron** none.

**PostHog events** — `time_entry_logged` (`surface`, `source`, `activity`,
`billable`, `rate_source`, `duration_minutes`, `latency_ms`) and
`time_rate_unresolved` (the alarm: `rate_source='none'`), added to
`apps/designer-portal/src/lib/analytics/document-events.ts`. These two ship here, in
the wave that fixes the thing they measure, so the data is accumulating before any
capability decision rests on it (HT-27).

**Tests + gates**
- New `supabase/tests/billing/time_rate_resolution_test.sql`: a browser-supplied
  `hourly_rate_cents` on a non-services project is ignored; a services entry with no
  role match gets the studio rate and stays `pending_authorization`; the
  no-authority-covering-`started_at` branch is server-owned; a member holding two
  roster roles resolves rather than nulling (CR-21); the backfill re-rates a
  previously stranded row and the addendum loop then promotes it.
- `supabase/tests/rls/` additions for `studio_member_rates`, asserted **per role**
  (owner, admin, member, guest, cross-studio).
- `supabase db reset`
- `scripts/run-sql-tests.sh -d supabase/tests/commercial` — **this is the real gate
  for the classifier rewrite**, not a type-check
- `scripts/run-sql-tests.sh -d supabase/tests/billing`
- `scripts/run-sql-tests.sh -d supabase/tests/rls`
- `git diff packages/supabase/src/database.types.ts`
- `pnpm turbo build --filter=@patina/supabase`
- `pnpm --filter @patina/designer-portal type-check && pnpm --filter @patina/designer-portal test`
- `pnpm --filter @patina/designer-portal lint` (the only lint config in the repo
  that resolves)
- `pnpm --filter @patina/admin-portal build`

**Depends on** W0 (the view repair — the rate the resolver produces must be the rate
the view prints).

**Effort: L (6–10 d).** Rewriting a 222-line classifier (`00578:2599-2820`; 201
lines between `BEGIN` and `END`) that holds ceiling accrual,
retainer gating, a project-level `FOR UPDATE` and three immutability raises, under a
commercial SQL suite that must stay green — plus a backfill that re-prices history.
The new table is the cheap part.

**Ship gate.** The commercial suite is green **unchanged**; the new billing suite is
green; the pre-flight count of re-priced rows is recorded in the ship note and
matches the post-backfill count; a live-mode ledger row shows a rate and a source on
a non-services project; a rate typed in the People Room appears on the next entry's
row with `rate_source='studio_member'`.

**Flag:** unconditional, precedent: time tracking ships unflagged.

**Ruling-gated inside this wave:** HT-1 (server owns the rate) and HT-2 (cut both
legacy legs) gate the first line of SQL. HT-3 (the People Room is the rate's home)
gates the portal half. If HT-2 is ruled the other way, `profiles.default_hourly_rate_cents`
returns as tier 3 and `rate_source` gains a `'profile_default'` value — one CHECK,
one resolver branch.

---

## §3 · Wave 2 — The four views: one sheet, one admin-gated scope lens

**Goal.** Kody's four views — mine, a member's, a project's, the studio's — reachable
from one sheet, and the published promise about them made true.

**Ships**
- The Hours ledger grows a scope lens: **mine · a member · this project · the
  studio**. Same day-grouped rows in every scope; only the subject and one column
  change. The lens is absent for non-admins.
- The project lens stops ANDing `user_id`, so opening a house's hours answers the
  house's question instead of returning the opener's own hours as a plausible wrong
  number.
- A member's scope is entered **from the person in the People Room**, not from a
  staff picker inside a money ledger; it defaults to aggregate, with free-text notes
  behind an explicit detail act.
- The studio scope shows hours · billable minutes · **billable amount in dollars**,
  grouped by member (switchable to project / day / week / activity), internal rows in
  an explicit "— internal —" group.
- An owner/admin who is **not** the project's designer can finally fix a member's
  wrong entry (the project's own designer already can, via `00177:136`'s FOR ALL),
  and the fix leaves a trace.
- The live drip email's Hours CTA stops landing on a bare Desk, and the shipped help
  article's two studio-scope sentences become true in the same wave that makes them
  true.
- A one-time dismissible disclosure sentence on a new member's first document open,
  and a per-member auto-start opt-out on their own profile (default on).

**DB** (migrations `head+10 … head+13`)
- `head+10` — `public.time_entry_ledger` fact view, `security_invoker=true`: entry
  columns + `studio_id` (from `projects.designer_id`'s studio, **not** used as a
  policy key) + `resolved_rate_cents` + `amount_cents` (prefer `rated_amount_cents`)
  + `rate_source` + `is_running` + `day` / `iso_week` / `month` buckets.
  **LEFT JOIN `profiles`**, for the same reason as W0's view repair.
- `head+11` — one write widening and one trace: an owner/admin UPDATE **and** DELETE
  policy on `project_time_entries` via `is_org_admin_or_owner`, plus
  `ADD COLUMN updated_by uuid REFERENCES profiles(id)`, and an AFTER trigger writing
  one `public.audit_logs` row (`00021:226-241` — `action`, `resource_type='project_time_entries'`,
  `resource_id`, `old_values`, `new_values`) on any adjust or delete. No new audit
  table, no approval column, no state machine. `guard_invoiced_time_entry`
  (`00177:51-80`) remains the lock: it already forbids DELETE and freezes every
  priced column once `invoice_id` is set.
- `head+12` — reserved, and the home for HT-10 **if** Kody rules `time_entries_studio_read`
  narrowed to owner/admin (plus the project-team read kept). If he rules it kept,
  this migration is not written and the permission model in the deck is described
  honestly as "every non-guest co-member may read; the UI gates the lens".
- `head+13` — reserved, and the home for the INVOKER rollup RPC **if** Kody rules
  HT-37 (`useStudioTimeReport`) deleted rather than wired; see Portal section below.
  This is a separate reserved slot from `head+12` — the two rulings (HT-10, HT-37)
  are independent and either or both may fire, so they cannot share one migration.
  If HT-37 is ruled wired (this plan's default), this migration is not written.
- **No new SELECT policy.** The read the four views need is already granted
  (`00316:237-240`).
- **No rollup RPC.** HT-38: the studio scope renders from the existing client-side
  aggregator, extended with a per-member group-by (~40 lines).

**Portal**
- `hours-ledger.tsx` (751 lines) — the scope lens; remove the `.eq('user_id', me)`
  AND from the project path (`:104-123`); totals render **above** the rows that
  produced them (HT-30); member name as the leftmost fact in member/project/studio
  scopes. Pattern precedent for the lens control:
  `components/document/people/directory/scope-lens.tsx`.
- `packages/supabase/src/hooks/use-time-tracking.ts` — `useStudioTimeReport` is
  **wired, not deleted** (HT-37, FS-5): it is RLS-clean, carries member names, and
  needs a `groupBy` dimension. Its stale section comment goes. *If Kody rules
  delete:* the replacement is an INVOKER rollup RPC in `head+13` and the wave moves
  from M to the low end of L — that is the cost of the ruling, and the eight seats
  who voted delete should see it.
- `components/document/people/views/person-profile.tsx` — "Hours" opens the ledger
  at that member's scope. This is the only door to the member scope.
- `components/document/desk-contents.tsx` — the `hours: 'time in hand'` card stays
  **act-bearing or absent** (HT-29): unbilled hours with "Bill it", or a timer still
  running from yesterday. Never a bare total; a number with no act is the tile §6
  refuses.
- `document-time-provider.tsx` — the one-time auto-start disclosure band (R83 inline
  band pattern) and the per-member opt-out read.
- `components/document/desk-doorway.tsx:19,41` — accept `sheet` as an alias of
  `book` (one character's worth of fix for a live founding-cohort email), or fix the
  copy deck; fix the deck either way at `docs/marketing/founding-onboarding/copy-deck.md:357,379,627`.
- `artifacts/designer-onboarding-learning-2026-09-03/content/wave-1/15-hours.md:9,15`
  — the two sentences become true rather than deleted; push the article to Sanity.

**iOS** none. **Edge/cron** none.

**PostHog events** — `time_scope_viewed` (`scope`, `group_by`),
`time_entry_adjusted` (`by_admin` boolean), `time_entry_deleted`.

**Tests + gates**
- New `apps/designer-portal/src/components/document/__tests__/hours-ledger-scope.test.tsx`
  — the lens is absent for a `member`, present for `owner`/`admin`; the project scope
  does not filter by user; totals precede rows.
- New `supabase/tests/rls/time_entry_admin_write_test.sql` — asserted **per role**:
  an admin may adjust and delete another member's unbilled entry; a plain member may
  not; neither may touch an invoiced one; the audit row exists with both value sets.
- New `apps/designer-portal/e2e/document/hours.spec.ts` — the first hours e2e spec
  (none exists). Must close, never delete, running timers (the one-running-timer
  index).
- `supabase db reset`
- `scripts/run-sql-tests.sh -d supabase/tests/rls`
- `scripts/run-sql-tests.sh -d supabase/tests/commercial`
- `pnpm turbo build --filter=@patina/supabase`
- `pnpm --filter @patina/designer-portal type-check && pnpm --filter @patina/designer-portal test`
- `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live pnpm --filter @patina/designer-portal test:e2e -- e2e/document/hours.spec.ts`
- `pnpm --filter @patina/designer-portal lint`
- `pnpm --filter @patina/admin-portal build`

**Depends on** W0 (view repair, hook module). **Not** on W1 — the lens renders
without `rate_source`, which appears as a column once W1 lands. This is the one place
the panel split (six seats put rate truth first; Leah, the customer, puts visibility
first) and the plan resolves it by running W1 and W2 concurrently rather than by
choosing.

**Effort: M (3–5 d).** A scope lens in a 751-line ledger, a member group-by on an
existing aggregator, one RLS write policy plus a trigger. The DB work the draft
priced as L is already done (`00316:237`, `use-time-tracking.ts:689`).

**Ship gate.** Opening the Okonkwo project lens as the owner shows the house's hours
with every member named, not her own; a plain `member` sees no lens and no other
person's rows in the UI; an admin adjust writes an `audit_logs` row with
`old_values`/`new_values`; the drip CTA lands on the Hours book; the help article in
Sanity matches what the sheet does; the disclosure band appears once for a fresh
member and never again.

**Flag:** unconditional, precedent: time tracking ships unflagged. The trust control
is the disclosure band plus aggregate-by-default, not a flag — shipping the lens
without them is what HT-35/HT-36 forbid, so they are ship-gate items, not follow-ups.

---

## §4 · Wave 3 — Capture with nothing in hand, and yesterday's hour

**Goal.** Every hour a studio member works has a compliant home, including the ones
not spent on an open document and the ones remembered a day late.

**Ships**
- A ⌘K **"Log time"** verb that works with nothing in hand: project, duration, date,
  activity, Enter. 5 interactions, down from 8.
- A **date field** on the ledger add row and the ⌘K form, defaulting to the paged
  week — so paging back a week and adding an entry stops silently mis-dating it into
  today. Nothing in Patina can log yesterday's hour today.
- A **billable pill** at every web capture surface — the log strip, the ledger add
  row, the ledger entry rows, the mobile sheet — seeded from the resolved answer, and
  the reason printed on the row ("non-billable · no agreement").
- The mobile manual form stops accepting input and saving nothing when no document is
  held: a project picker, or disabled with an inline band. Never a silent success.
- `activity` stops lying: "activity not set" where it is unset, instead of a silent
  NULL on the ignore path and `'design'` whenever touched. Never made required.
- `t` on a document opens the log form (not "focus the strip" — the strip exists only
  after a timer stops).
- Starting a timer while another runs stops the incumbent **and still raises the
  log-offer strip** (today the client interprets a `23505`).

**DB** (migrations `head+14 … head+15`)
- `head+14` — `public.log_time(p_entry_id uuid, p_project_id uuid, p_started_at
  timestamptz, p_duration_minutes int, p_activity text, p_billable boolean,
  p_notes text, p_phase_key text, p_task_id uuid, p_source text)`, SECURITY INVOKER,
  `INSERT … ON CONFLICT (id) DO NOTHING RETURNING` — replay-safe for a client-minted
  id, which is what W6 needs. RLS stays the authorization spine.
- `head+14` — `public.start_timer(p_project_id uuid, p_source text)`, SECURITY
  INVOKER: atomically stops the incumbent running row and **returns both rows**, so
  the caller can still raise the chain-out strip. The draft's "returns the existing
  running row instead of raising" would breach R20 and attribute new work to the old
  project (FS-38).
- `head+15` — reserved.
- No `stop_timer`, `discard_timer`, `adjust_time_entry` or `delete_time_entry` RPC:
  those are PostgREST writes under RLS, and W2 already widened the one policy that
  needed widening (FS-40).

**Portal**
- `components/document/command-bar.tsx` (1175 lines) — the "Log time" verb in a
  **non-in-hand** section. It cannot reuse the "Draw an invoice" pattern, which is
  gated on `inHandRow?.project_id` (`:799-810`, in-hand gates `:824-836`) — i.e. it
  appears only when a document is open, which is exactly when the auto-timer is
  already running. **No inline NL parser in this wave** (see §10).
- `components/document/hours-ledger.tsx:275-294, 543-591` — date field, billable
  pill, rate readout on the add row and the entry rows.
- `components/document/log-strip.tsx` — billable pill, static rate/amount readout,
  the `'design'` default removed. Count stays 4 for the adjust path; the zero-tap
  path stays zero.
- `components/document/mobile/mobile-sheets.tsx:1130-1147, 1180-1187, 1219-1231` —
  project picker when `heldProjectId` is null; no silent clear.
- `hooks/document-time-provider.tsx:410-424` (`manualLog` early-returns on `!doc`),
  `:283-290` (the stop payload carries no `activity`), `:319-347` — repoint to
  `start_timer` / `log_time`, carry `billable` and `activity` explicitly.
- `lib/document/registry.tsx` — the `t` binding.
- Delete the `23505` toast branch (`use-time-tracking.ts:480-484`) and the implicit
  `billable: input.billable ?? true` default (`:320, :467`) — once every surface
  carries the control, a missing value is a caught bug, not a quiet `true`.

**iOS** none. **Edge/cron** none.

**PostHog events** — `time_timer_started`; `time_timer_stopped` (`adjusted`,
`idle_minutes`, **and the cumulative-idle-to-raw-elapsed ratio** — R64 is explicitly
"watch with data" and no data has been watched; VET-20 found that the bound fires on
the single longest gap while the cumulative sum is computed and used only for the
annotation string, `time-derivation.ts:100-113` vs `:123-131`). Instrument; do not
touch the 30-minute number.

**Tests + gates**
- `command-bar` jest spec for the verb (present with nothing in hand; writes the
  right `source`); `hours-ledger` jest spec for the date field defaulting to the
  paged week; `mobile-timer-sheet.test.tsx` extended for the no-document case;
  `document-time-provider.test.tsx` extended for the chain-out-still-raises-strip
  contract.
- `supabase/tests/billing/time_log_rpc_test.sql` — a replayed `log_time` inserts
  once; two concurrent `start_timer` calls leave exactly one running row and the
  loser gets the stopped row back.
- `supabase db reset` → `scripts/run-sql-tests.sh -d supabase/tests/billing`
- `pnpm --filter @patina/designer-portal type-check && pnpm --filter @patina/designer-portal test`
- `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live pnpm --filter @patina/designer-portal test:e2e -- e2e/document/hours.spec.ts`
- `pnpm --filter @patina/designer-portal lint`

**Depends on** W1 (the billable pill is seeded from the resolved answer and the rate
readout needs `rate_source`) and W0 (the `source` values `command_bar` / `internal`).

**Effort: M (3–5 d)** — and only with the parser out. With the inline parser it is L:
duration parse + fuzzy project match + activity match + tests inside a 1175-line file.

**Ship gate.** A 45-minute client call is logged in 5 interactions from ⌘K with no
document open; the same entry dated yesterday lands on yesterday; the mobile sheet
with nothing held either logs or says why, never both-neither; a log-strip entry
carries an explicit `billable` and the row prints its reason; two browser tabs
starting timers leave one running row and one offer strip.

**Flag:** unconditional, precedent: time tracking ships unflagged.

**Ruling-gated:** HT-13 (how far back may an entry be dated — Kody sets the bound;
the plan implements "within the paged week, and any date the picker allows" until he
does) and HT-25 (may a member log on a project they are not rostered to — RLS
requires `is_project_team_member` on INSERT, so the ⌘K project list is restricted to
rostered projects until he rules auto-roster-on-first-log).

---

## §5 · Wave 4 — Internal and admin time

**Goal.** The owner's own hours — the ones VISION:31 says are already spoken for
twice — get an honest home, without a sentinel project.

**Ships**
- A time entry with no project: admin, studio, internal. Non-billable by
  construction, in its own "— internal —" group in every scope that shows it, never
  folded into a project total.
- The ⌘K verb and the ledger add row accept an entry with the project token omitted.

**DB** (migrations `head+16 … head+20`)
- `head+16` — `project_time_entries ALTER COLUMN project_id DROP NOT NULL`;
  `ADD COLUMN studio_id uuid REFERENCES organizations(id)`; backfill `studio_id` from
  the project's studio for existing rows; `CHECK (project_id IS NOT NULL OR
  (studio_id IS NOT NULL AND billable = false))`.
- `head+17` — a `studio_id` validation trigger replicating 00317's anti-aiming guard
  (`00317:31-49`): a member may not aim `studio_id` at an organization they are not an
  active member of. Without it, nullable `project_id` is a cross-studio write hole.
- `head+18` — **four new RLS policies** for the `project_id IS NULL` case. This is
  the wave's real cost and the draft's worst mispricing: **all nine** existing
  policies resolve through `project_id` — five through `projects p WHERE p.id =
  project_time_entries.project_id` (`00177:136`; `00316:237,242,248,257`) and four
  through `is_project_team_member(project_id)` (`00177:140,144,148,152`, re-created
  at head by `00484:785,794,803,812`) — so with a NULL `project_id` every one of
  them is false — internal time would be written and then invisible. The new
  policies are own-row SELECT/INSERT/UPDATE/DELETE keyed on the trigger-validated
  `studio_id` via `is_active_studio_member`, plus the owner/admin read and write
  through `is_org_admin_or_owner`.
- **Count re-derived against the ninth policy.** The ninth is `00177:136`'s FOR ALL
  for the project's own `designer_id`. An internal row has no project, so it has no
  project designer and no NULL-case counterpart to restore; owner/admin reach is
  already carried by the `is_org_admin_or_owner` pair named above. **Four new
  own-row policies stands** — the ninth adds none.
- `head+19` — classifier short-circuit: `project_id IS NULL → billing_state =
  'nonbillable'`, `rated_amount_cents = 0`, `rate_source = 'none'`, no rate.
- `head+19` — `margin_items`' time sub-select gains `WHERE project_id IS NOT NULL`
  for hygiene (`00543:262-296`; the portal already filters by `project_id.eq.<id>`,
  `use-margin-items.ts:22-28`, so this is not a sweep).
- `head+20` — reserved.
- **Rejected alternative, recorded:** a per-studio sentinel "Internal" project. It
  would pollute every project list, roster, board and invoice path. Nullable
  `project_id` is additive per O3/R4.
- **NULL stance, stated once:** internal time is non-billable and out of every
  project-scoped read. Every live consumer filters `project_id = <id>` (NULL-safe) or
  is key-filtered client-side (`00412:2671`, `00422:2431-2438`, `00577:2477-2498`,
  `00291:402-436`) — FS-37.

**Portal**
- `hours-ledger.tsx` — the add row's `addValid` stops requiring a project (`:275`);
  internal rows render in their own group with no project column.
- `command-bar.tsx` — the verb accepts no project.
- `packages/supabase/src/hooks/use-time-tracking.ts` — `projectId` becomes optional
  on the create input; `studioId` added.

**iOS** none in this wave (Field's internal time arrives with W6's sheet).
**Edge/cron** none.

**PostHog events** — none new; `time_entry_logged` carries `source='internal'`.

**Tests + gates**
- `supabase/tests/rls/internal_time_test.sql` — an internal row is visible to its
  author; invisible to a member of another studio; visible to its own studio's
  owner/admin; `studio_id` **cannot** be aimed at another organization; a billable
  internal row is refused by the CHECK.
- `supabase db reset`
- `scripts/run-sql-tests.sh -d supabase/tests/rls`
- `scripts/run-sql-tests.sh -d supabase/tests/commercial` (the ceiling sums and
  `issue_invoice` paths must be unaffected)
- `git diff packages/supabase/src/database.types.ts`
- `pnpm --filter @patina/designer-portal type-check && pnpm --filter @patina/designer-portal test`

**Depends on** W1 (the classifier short-circuit lands in the rewritten body) and W3
(the doors that accept a project-less entry).

**Effort: L (6–10 d)** — repriced from the draft's M. Four policies, an anti-aiming
trigger replicating a known pattern, a CHECK, a classifier branch, and an RLS suite
that has to prove the invisible case is not invisible. Five seats wanted M; FS's
policy audit is decisive (§9 dissent 10).

**Ship gate.** An internal entry logged by the owner appears in her own scope and in
the studio scope's "— internal —" group, is absent from every project scope, cannot
be invoiced, and cannot be written against another studio's id — each asserted by the
RLS suite, not by a UI render.

**Flag:** unconditional, precedent: time tracking ships unflagged.

**Ruling-gated:** HT-15. The shape is settled (nullable, not a sentinel); the ruling
Kody owes is the reprice — this is an L, and if it must be an M it ships without the
owner/admin read of internal rows, which means the studio scope under-reports.

---

## §6 · Wave 5 — The bookkeeper's Friday

**Goal.** A file on Friday, and an invoice that names who did the work.

**Ships**
- A per-entry **CSV** from the fact view: `Member, Date, Project, Client, Activity,
  Billable, Duration (min), Rate, Rate Source, Amount, Billing State, Invoiced,
  Invoice #`. The first export of any kind in the product; §4 already promises "Your
  data exports."
- The invoice composer **names the person on every row**, instead of collapsing the
  week into one string that names no person and no day.
- The client's folio keeps **one priced line** plus a dated sub-table beneath it
  (date · hours · rate). The homeowner gets no staffing detail.
- A per-client **statement**, reusing R75's composer selection UI.
- The ledger's existing "Export week → Accounts" act is **renamed** so that
  "Export" means a file.

**DB** none. (The fact view shipped in W2; that is the gate — REP-9: the CSV must not
ship on the drifted view, which is why the repair is W0 and the view is W2.)

**Portal**
- New `apps/designer-portal/src/lib/document/time-export.ts` — in-browser CSV
  generation from `time_entry_ledger`, same direction as
  `lib/document/rooms/library/import-parse.ts`. The column set and delivery copy the
  proven `supabase/functions/qbo-export/index.ts:131-132` blob pattern; there is an
  AP-side precedent and no AR/labour twin.
- `components/document/hours-ledger.tsx` — the Export act beside the studio scope;
  rename the invoice hand-off act.
- `lib/document/invoice-composer.ts:150-161` (`buildTimeLineDraft`) and
  `lib/time-billing.ts:43-54` — name the person per composer row; keep one `kind='time'`
  line on the client's folio and add the dated sub-table.
- `apps/client-portal/src/app/pay/[token]/invoice-sheet.tsx:829-836` — render the
  sub-table beneath the time line's description (the line is an opaque string today).

**iOS** none.

**Edge/cron** none. **No QuickBooks integration** (§8 side journey, C23): the
bookkeeper wants a file on Friday, not a system to learn.

**PostHog events** — `time_export_taken` (`scope`, `row_count`, `period`).

**Tests + gates**
- `apps/designer-portal/src/lib/document/__tests__/time-export.test.ts` — column
  order, escaping, an internal row's empty project cell, an entry by a non-org-member
  roster vendor present (the W0 LEFT JOIN's payoff).
- `apps/designer-portal/src/lib/__tests__/time-billing.test.ts` extended for the
  named-person row.
- `pnpm --filter @patina/designer-portal type-check && pnpm --filter @patina/designer-portal test`
- `pnpm --filter @patina/client-portal type-check && pnpm --filter @patina/client-portal test`
  (client-portal enforces a coverage floor: lines 70 / branches 60 / functions 70 /
  statements 70)
- `pnpm --filter @patina/designer-portal lint`

**Depends on** W2 (`time_entry_ledger`) and W1 (`rate_source` is a column in the
file; without it the CSV prints a rate whose provenance is unknown).

**Effort: M (3–5 d).** In-browser generation against an existing view, plus two
invoice-rendering paths across two portals.

**Ship gate.** A studio-scope CSV opens in a spreadsheet with one row per entry, every
row naming a person and a day; the amounts sum to the ledger's total; a composer row
names the person; the client's folio shows one priced line with a dated sub-table and
no staffing detail.

**Flag:** unconditional, precedent: time tracking ships unflagged.

---

## §7 · Wave 6 — Patina Field: an hour that is not a visit

**Goal.** The field worker can log a drive, a call, a sourcing run or admin time from
a phone with one bar, and can correct a visit's duration before it becomes money.

**Ships**
- A `LogTimeSheet` reachable with no visit in progress: a **7th Browse tile** on the
  Work dashboard and the **expanded** companion state. 3 taps.
- The visit-close offer gains a **stepper**, defaulted to the **active** duration
  (visit start → last Specimen, already sorted) rather than wall clock, plus a
  billable toggle. Today the duration is wall-clock, floored to a minute, and never
  editable — so a visit left open for hours bills the whole clock with one confirm
  tap. D10 is cited as honoured while Field breaches it, and R64's bound exists only
  in TypeScript.
- A `travel` value in the `activity` CHECK, reachable before the truck moves.
- A read-only **"My hours this week"** list on the same tile: day · project · minutes
  · activity · billing state, as plain text. Own scope only — never a member, project
  or studio scope on a camera-first one-handed screen handed to trades.
- Field writes through `log_time`, so a replayed drain inserts once.

**DB** (migrations `head+22 … head+23`)
- `head+22` — widen the `activity` CHECK (`00198:27-29`) with `travel`. Same
  constraint-name care as W0's `source` widening.
- `head+23` — reserved.
- No new policy: Field writes own rows on rostered projects, which RLS already
  permits (`00177:144-146`, `00316:242-246`).

**iOS** (`apps/mobile/Capture`, targets `Capture` + `CaptureKit`)
- New `Capture/Features/Time/LogTimeSheet.swift` — project (pre-filled from
  `CaptureKit/Session/CaptureSessionContext.swift`), duration stepper, activity,
  billable, date. 3 fields.
- `CaptureKit/Companion/FieldCompanionPresentation.swift:51-54` — a third
  `FieldCompanionActionID` case, `logTime`, exposed **only in the expanded state**.
  MOB-11 is binding: the collapsed strip carries exactly one action and that slot is
  "End visit" (`FieldCompanionPresentation.swift:51-64`).
- `Capture/Features/Work/WorkDashboardScreen.swift:349-390` — the 7th Browse tile.
- `Capture/Features/Session/V4VisitReviewScreen.swift:286-316, 346-371` — the
  stepper and billable toggle on the offer; default from
  `CaptureKit/Session/VisitReview.swift:52-58`'s already-sorted Specimen timestamps
  (`VisitReviewComposer.summarize` at `:52-83` is where wall clock is computed today).
- New `CaptureKit/Domain/TimeEntryOutboxRecord.swift` — a **sibling** of
  `FieldVisitCloseRecord`, copying its `@Attribute(.unique)` client-minted id and
  `retryDelay(attempt:)` (`FieldVisitCloseRecord.swift:56-58`). `FieldVisitCloseRecord`
  is load-bearing and covered by 30 tests: leave it alone.
- New `Capture/Features/Session/TimeEntryOutboxDrainer.swift` (~80 lines) — a sibling
  of `VisitCloseOutboxDrainer` (134 lines, visit-specific, covered by 49 tests across
  two suites). **Do not generalize the tested class into a two-queue drainer**; that
  is the larger change, not the smaller (FS-44).
- `Capture/Services/Sync/SupabaseFieldWriteGateway.swift:65-70` — `client.rpc("log_time", …)`
  in place of the raw table insert; `TimeEntryWriteRequest` gains `billable`,
  `activity`, `hourly_rate_cents` omitted (the server owns it after W1).
- `CaptureKit/Persistence/CaptureStore.swift:78-86` — register the new model in
  `schema`.
- Delete `apps/mobile/Capture/CaptureWidgets/` and
  `apps/mobile/Capture/CaptureShareExtension/` — empty directories shaped like
  targets, absent from `Capture.xcodeproj/project.pbxproj:1140-1224`. No third state:
  either they are targets or they are gone, and the widget is not in v1.

**Edge/cron** none.

**PostHog events** — `time_entry_logged` with `surface='field_sheet'` /
`'field_visit'` and `source='field_manual'` / `'field_visit'`, via `posthog-ios`.
This is the data HT-27 requires before any widget or intent decision is taken.

**Tests + gates**
- New `CaptureTests/TimeEntryOutboxRecordTests.swift` and
  `CaptureTests/LogTimeSheetTests.swift`; extend `CaptureTests/VisitReviewTests.swift`
  (19 tests) for the active-duration default and the stepper bound.
- **SwiftData migration assertion** (FS-45): open a store written by the previous
  schema with the new schema and assert `didResetIncompatibleStore == false`. The
  store's open ladder "sets aside an incompatible store and retries"
  (`CaptureStore.swift:293-294`), i.e. the failure mode here is **destroying queued,
  unsynced billable hours**. This assertion is not optional.
- `apps/mobile/Capture/scripts/capture-gate.sh all` — it regenerates the project
  itself (`capture-gate.sh:11,14,22`), so a separate `ruby generate_project.rb` step
  is redundant.
- A **physical-device** pass per `patina-ios-verification`: airplane-mode log →
  reconnect → `SELECT` the row server-side. A green Simulator run does not prove the
  drain.
- `supabase db reset` → `scripts/run-sql-tests.sh -d supabase/tests/field`
  (`time_entry_field_visit_source_test.sql` must still pass with the widened CHECK).

**Depends on** W3 (`log_time`, and the billable semantics the sheet's toggle seeds
from), W1 (the server resolves Field rows' rates), and W0's HT-33 governance entry —
without it a literal §8 test parks this wave as a side journey.

**Effort: M (3–5 d).** The App Group and the group-container store already exist
(`Capture.entitlements:5-8`, `CaptureStore.swift:104`), the outbox pattern is
copyable, and a sibling drainer is smaller than a generalization.

**Ship gate.** On a physical device in airplane mode: a drive is logged from the
Browse tile, the app is killed, the device reconnects, and the row is present
server-side with `source='field_manual'`, `activity='travel'` and an explicit
`billable`. A visit left open for three hours offers the active duration, not three
hours, and the stepper moves it. The SwiftData assertion holds.

**Flag:** unconditional, precedent: time tracking ships unflagged.

**Ruling-gated:** HT-19 (the `travel` value) and HT-16/HT-17 (D10 enforced on Field;
R64's wording extended to any clock-derived duration while the 30-minute number is
left alone pending W3's instrumentation).

---

## §8 · Wave 7 — Rate cards bind to people, and one quiet guard

**Goal.** Remove the string match at the root of the stranded-hours defect, and ship
the one reminder that is act-bearing rather than engagement.

**Ships**
- A rate-card row binds to a **person or a roster role**, not a free-text label. The
  shipped default card label "Principal designer" can never normalize-match the
  roster enum `lead_designer`, so a default two-role card strands every entry on a
  services project. After W1 those entries fall through to the studio rate instead of
  NULL — this wave removes the cause rather than the symptom.
- A timer still running after 8 hours writes **one quiet Record row** (R82). No push,
  no email, no badge.
- `project_phases.estimated_hours` is ruled on and the ruling is executed — re-homed
  with a writer, or dropped with its read. Its only writer has zero callers, so today
  it is a budget you can read and never set; and a **second** estimate column
  (`project_tasks.estimate_minutes`) already feeds the ledger's live readout.

**DB** (migrations `head+24 … head+26`)
- `head+24` — `project_billing_authority_rates ADD COLUMN user_id uuid REFERENCES
  profiles(id)`, `ADD COLUMN roster_role text` (the `project_team_members` role enum,
  `00084:160-164`); the resolver prefers `user_id`, then `roster_role`, then the
  legacy normalize-match of `role_name` for already-materialized rows. Immutability
  and versioning (`source_rate_id` + `version`) unchanged.
- `head+25` — the countersign materialization path that creates those rows from
  `proposal_service_rates` (`00575:1798-1799`, `00577:2470-2471`) carries the binding
  through.
- `head+26` — per the HT-39 ruling: either a writer for `project_phases.estimated_hours`
  or a drop of the column and its read.

**Portal**
- `components/document/rooms/drafting/agreement/part-editor.tsx:423` — the rate-card
  part picks a person or a roster role instead of typing a label; the shipped default
  label at `service-agreement-drafting-room.tsx:238` goes.
- `packages/supabase/src/hooks/use-time-tracking.ts` — delete
  `useUpdatePhaseEstimates` (`:791`) or give it a caller, per HT-39. Not
  both-and-neither.

**iOS** none.

**Edge/cron** — one edge function `supabase/functions/time-nudges/` on an hourly
`cron.schedule` + `public.invoke_edge_function` (pattern at `00572:1221-1225`), with
**one rule only**: a running timer over 8 hours writes a quiet R82 Record row. Rule
(b), the unlogged-day nudge, is **not built — not even dark** (see §10).

**PostHog events** — none new.

**Tests + gates**
- `supabase/tests/commercial/design_services_authority_test.sql` extended: a rate
  card bound to a person resolves for that person regardless of label; a legacy
  label-only card still resolves as before.
- `deno test --allow-all --config supabase/functions/deno.json supabase/functions/time-nudges/`
- `supabase db reset` → `scripts/run-sql-tests.sh -d supabase/tests/commercial`
- `pnpm --filter @patina/designer-portal type-check && pnpm --filter @patina/designer-portal test`

**Depends on** W1 (the resolver this binding feeds).

**Effort: M (3–5 d).** Two additive columns, one materialization path, one part
editor, one small edge function on an existing cron pattern.

**Ship gate.** A default two-role rate card created by the drafting room prices a new
hire's entry with `rate_source='authority'`; a pre-existing label-only card still
prices as before; a 9-hour running timer produces exactly one Record row and no
notification of any kind.

**Flag:** unconditional, precedent: time tracking ships unflagged.

**Ruling-gated:** HT-4 (binding), HT-34 (rule (a) only), HT-39 (phase estimates —
re-home or drop, but rule it).

---

## §9 · Dependencies, critical path, parallelisation

### Dependency table

| Wave | Name | Depends on | Blocks | Effort | Migrations |
|---|---|---|---|---|---|
| **W0** | The live money bugs + one hook module | — | everything | M | `head+1 … +3` |
| **W1** | Rate truth + the studio rate card | W0 | W3, W4, W5, W6, W7 | L | `head+4 … +9` |
| **W2** | The four views (scope lens) | W0 | W5 | M | `head+10 … +13` |
| **W3** | Capture with nothing in hand + backdating | W0, W1 | W4, W6 | M | `head+14 … +15` |
| **W4** | Internal and admin time | W1, W3 | — | L | `head+16 … +20` |
| **W5** | The bookkeeper's Friday | W1, W2 | — | M | (none; `head+21` reserved) |
| **W6** | Patina Field: an hour that is not a visit | W1, W3, W0's HT-33 entry | — | M | `head+22 … +23` |
| **W7** | Rate cards bind to people + one quiet guard | W1 | — | M | `head+24 … +26` |

### Critical path

`W0 → W1 → W2 → W5` — **15–25 eng-days.** The path is "stop the bleeding → make the
number true → make it visible four ways → put it in a file." `W0 → W1 → W3 → W6`
is the same length (15–25) and runs beside it, so the program has two co-critical
paths and W4 and W7 are the only slack.

The single longest item on the path is W1's classifier rewrite. Nothing shortens it;
the commercial SQL suite is the gate and it is not negotiable.

### Parallelisation plan

Per `patina-parallel-work`: one worktree per concurrent agent, named
`.codex/worktrees/agent-<id>` (the `agent-` prefix is what `.gitignore` covers — a
differently named worktree is the precondition behind a real 286-file contamination
commit). Branch per wave: `hour-tracking/w<N>-<slug>`. Reserved migration ranges are
in the table above; every number is re-checked against the integration target's tip
immediately before merge, never trusted from branch creation.

| Stage | Runs concurrently | Worktrees | Shared-state owner | Conflict surface |
|---|---|---|---|---|
| **1** | W0 alone | 1 | W0 owns `supabase db reset` and port 3000 | none — W0 must land before anything forks, because it moves the hook module every later wave edits |
| **2** | **W1 ∥ W2** | 2 | W1 owns `supabase db reset`; W2 runs against W1's reset output or its own port-isolated stack | W1 is DB + People Room + row rendering; W2 is the ledger's lens + policies. Both touch `hours-ledger.tsx`: **W2 owns that file**, W1 lands its rate column as a W2 follow-commit on the integration branch |
| **3** | **W3 ∥ W5** | 2 | W3 owns `supabase db reset` | W3 owns `command-bar.tsx`, `log-strip.tsx`, `mobile-sheets.tsx`, `document-time-provider.tsx` and the ledger add row; W5 owns `invoice-composer*`, `time-billing.ts`, `time-export.ts` and the client portal. No overlap |
| **4** | **W4 ∥ W6 ∥ W7** | 3 | W4 owns `supabase db reset` (its RLS suite needs a clean replay); W6 owns the physical device; W7 owns the edge-function local serve | W4 is policies + the ledger add row's validity; W6 is Swift only; W7 is the agreement part editor + an edge function. No overlap |

Integration through `hour-tracking/integration` into `main`, lowercase
`merge(hours): …` commits, real merges not squashes. Worktrees are **removed at task
end** whether merged or abandoned; `scripts/repo-gc.sh` sweeps stragglers.

**Stage 2 is the one the plan exists to enable.** Six of nine seats put rate truth
ahead of visibility; Leah — the customer — puts the member lens first and explicitly
asked not to have it gated behind the rate rewrite. Running W1 and W2 in separate
worktrees satisfies both without anyone losing the argument, and the only price is
that W2's rate column arrives on the integration branch a few days after its lens.

---

## §10 · Total effort

| Band | Waves | Days |
|---|---|---|
| M (3–5) | W0, W2, W3, W5, W6, W7 | 18–30 |
| L (6–10) | W1, W4 | 12–20 |
| **Total** | **8 waves** | **30–50 eng-days** |

Calendar, at the parallelisation above (2–3 worktrees): **roughly 18–28 working
days.** Critical path 15–25 eng-days.

Deferred-and-priced, for the record: the App Intents path is S–M once a background
drain exists; the widget is XL and deferred whole (FS-W5).

---

## §11 · Top risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| 1 | **The classifier rewrite silently re-rates history.** 222 lines (`00578:2599-2820`), 201 between `BEGIN` and `END`, holding ceiling accrual, retainer gating, a project-level `FOR UPDATE` and three immutability raises, redefined twice already. | highest | The resolver is a **separate** function; the classifier change is one call plus three branch fixes, with the immutability raises copied verbatim. `run-sql-tests.sh -d supabase/tests/commercial` is the gate, not a type-check. The backfill is a separate migration with a pre-flight count that must match the post count. |
| 2 | **Nullable `project_id` writes internal time and then hides it.** All nine policies resolve through `project_id` — five through `projects p` (`00177:136`; `00316:237,242,248,257`), four through `is_project_team_member` (`00177:140,144,148,152`) — and a NULL makes every one false. | high | W4's four new policies land in the **same migration set** as the `DROP NOT NULL`, and the RLS suite asserts the positive case (author sees it), the negative case (cross-studio cannot), and the anti-aiming case (`studio_id` cannot be pointed at another org) before the portal is touched. |
| 3 | **`studio_id` becomes a cross-studio write hole.** A member could aim it at any organization. | high | The 00317 anti-aiming guard (`00317:31-49`) is replicated as a trigger, not assumed from the CHECK. Asserted per role in the RLS suite. |
| 4 | **Migration-number collision across three concurrent worktrees.** Six-plus renumber incidents in this repo's history. | medium | Reserved ranges per wave (§9), provisional until merge, re-checked against the integration tip immediately before each merge. Numbers are written in briefs as `head+n`, never as literals. |
| 5 | **The `activity` CHECK constraint name appears in no migration** (`source`'s name is already known: `project_time_entries_source_ck`, `00545:147-148`). | low | The `activity` widening (W6) uses 00545's name-discovery form (`00545:33-43`); `source` (W0) simply reuses its known name — no archaeology needed. |
| 6 | **A stale `packages/supabase` `dist/` ships a working source and a broken bundle.** This is the `proposalTierVisibility` incident class, and W0 moves the hook module into that package. | medium | `pnpm turbo build --filter=@patina/supabase` before any consumer type-check; `pnpm --filter @patina/admin-portal build` as the wave gate; portal deploys only ever through `./infra/deploy-portal.sh`. |
| 7 | **The SwiftData schema change destroys queued, unsynced billable hours.** The store's open ladder sets aside an incompatible store and retries (`CaptureStore.swift:293-294`). | medium | W6's explicit assertion: open a previous-schema store with the new schema and assert `didResetIncompatibleStore == false`. A green `capture-gate.sh` does not cover this. |
| 8 | **Narrowing `time_entries_studio_read` is a widening-in-reverse.** If HT-10 is ruled "narrow", a cross-cutting RLS change lands mid-program. | medium | It is isolated to its own reserved migration (`head+12`) with a per-role SQL test, and it is the **only** change in that migration, so it can be reverted without touching the lens. |
| 9 | **A green gate that proves nothing.** `turbo` silently skips workspaces with no such script; designer-portal's mock fallback returns mock data on *any* thrown error, including an RLS denial — so a scope lens that is silently denied renders plausible numbers. | medium | Every render check in this program runs `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live`. Every data claim is a `SELECT`, never a screenshot. Per-wave gates are named explicitly in §1–§8 rather than left to `pnpm test`. |
| 10 | **The published promise outruns the build again.** A live drip email and a shipped help article already describe a studio-wide ledger that does not exist. | low | Both are ship-gate items of W2, not follow-ups: the article is true or the sentences are gone before the wave is called shipped. |
| 11 | **R19's consent evidence is one person, who is also the owner.** The ruling is about to govern an employee's documents. | low (trust, not code) | W2 ships the disclosure band and the per-member opt-out as ship-gate items (HT-35), and W2's member scope defaults to aggregate with notes behind an explicit detail act (HT-36). |

---

## §12 · Explicitly NOT in v1

| Capability | Why it is out | Where it is recorded |
|---|---|---|
| **Widget (`CaptureWidgets` target)** | §8 side journey: weak studio moment (the sheet and the web already cover it), neither revenue stream, and "a place you go". Feasibility reprices it XL — a new signed appex in a 295-line generator that knows four targets and has no Embed App Extensions phase, and the existing gate **cannot build it** (`CODE_SIGNING_ALLOWED=NO` makes the App Group inert and SwiftData *traps*). | CR C14; FS-W5, FS-32, FS-33 |
| **App Intents / Siri** | Excellent §8 fit and still blocked: the drainer runs once per owner per launch/reconnect and Capture has no `BGTaskScheduler`, so a Siri-logged hour is invisible until the app is next opened — under a promise of "log from anywhere". Ships when the intent attempts the network with the outbox as fallback, or when a background task exists. | HT-28; FS-31 (blocker); CR C15 |
| **Live Activity for a running visit** | Breaches R69's principle — its stated scope is spine timer + mobile bar only (`DECISIONS.md:2561`) — for the one capability that fails §8 on its own. 3 seats against, 0 for. | HT-31; CR-13 |
| **A running timer owned by Field, the widget or an intent** | The one-running-timer index is per user **globally**; a driveway tap would either raise a `23505` the user cannot read or silently steal the desk timer's slot. Field's Swift type already makes it inexpressible (`durationMinutes` non-Optional). Unanimous. | HT-7; FS-39 |
| **Approval / submit / lock-week workflow** | `guard_invoiced_time_entry` already forbids DELETE and freezes every priced column once `invoice_id` is set — **that is the lock**. A second state machine gives the bookkeeper two locks and the studio "a new system to learn". 6 seats + the draft. | HT-22 context; `00177:51-80`; CR C24 |
| **QuickBooks integration** | The bookkeeper wants a file on Friday. A CSV on the `qbo-export` pattern is the deliverable; an integration is a system to learn. | CR C23; HT-20 |
| **Inline NL parsing in the ⌘K verb** ("90m Maple St design") | The largest single piece of W3 — duration parse + fuzzy project match + activity match + tests — inside a 1175-line file. The verb's value (5 interactions, down from 8) lands without it; the parser is a later S that takes it to 3. | FS-26; §9 dissent 7 |
| **The unlogged-day nudge, and its setting** | The panel split 4–1 for "opt-in, weekly, dark"; the critic says do not build it, not even the setting, because a consent checkbox over an engagement loop is still an engagement loop. Daily in any framing: 0 seats. This plan takes the critic's side because the cost of being wrong is the §4 promise, and the cost of waiting is one setting. | CR-14, C20 vs HT-34; revisit with `time_entry_logged` data |
| **A bare studio week total on the Desk `hours` card** | A number with no act is precisely the tile §6 refuses. The card is act-bearing — unbilled with "Bill it", or a timer still running from yesterday — or it is absent. | HT-29; CR-15, OPS-15 |
| **A member, project or studio scope on Patina Field** | "Mine" is the mobile ceiling in v1: a camera-first one-handed screen is handed to trades. | MOB-8; §4 of the synthesis |
| **Hours on the paper's margin** | Already refused by rule: *time is not a margin item the margin prints: it is the studio's own clock.* Do not touch. | `margin-groups.ts:11-13`; CR C29 |
| **Any second hours surface** — a `/hours` page, an admin-portal route, a tab bar, a staff dropdown ranked by hours | One sheet, one lens (R77, and HT-32's amended D9). OPS-6, REP-3, LEAH-10 and the critic all reject a second surface independently. | HT-8, HT-32 |
| **Hours-vs-estimate reporting** | Two estimate columns exist with different definitions (`project_phases.estimated_hours`, `project_tasks.estimate_minutes`) and one of them has no writer. Reconcile under HT-39 first or the report prints two different meanings of "estimated". | REP-14; FS-20 |
| **A per-member utilisation score, leaderboard, ranking, streak, target, burn-down, progress bar, sparkline or red/green state** | §6, verbatim. | `VISION.md:70-76`; HT-30 |

---

## §13 · What is deleted

| # | Thing | path:line | Wave | Gate before deleting |
|---|---|---|---|---|
| 1 | The compensating detach in `useClaimTimeEntries` — a **live money bug**: it detaches every entry on the invoice | `use-time-tracking.ts:616-619` | W0 | `claim_time_entries` lands first |
| 2 | `project_unbilled_time`'s INNER JOIN on `profiles` | `00412:2683-2685` (hazard `00555:3024-3026`) | W0 | keep the **view name** — `hours-ledger.tsx:162`, `use-time-tracking.ts:159,706`, `design_services_authority_test.sql:221,349,362` |
| 3 | `project_unbilled_time`'s `change_order_terms → profiles.default_hourly_rate_cents → 0` chain | `00412:2676-2682` | W0 | with #2, one redefinition |
| 4 | `useTimeEntries` | `use-time-tracking.ts:118` | W0 | 0 callers |
| 5 | `useTimeSummary` — **the hook wrapper only** | `use-time-tracking.ts:271` | W0 | keep `fetchTimeSummary`: 3 live callers via `use-projects.ts:481` |
| 6 | `useReleaseTimeEntries` | `use-time-tracking.ts:634` | W0 | 0 callers; nothing ever releases an entry |
| 7 | The stale section comment "Studio time report (the Hours book — `/desk?book=hours`)" | `use-time-tracking.ts:653` | W0 | documents a book that never shipped |
| 8 | `projects.change_order_terms->>'hourly_rate_cents'` as a rate leg | `00412:2675`; legacy writer `use-scope-builder.ts:945-950` | W1 | the resolver lands first |
| 9 | The `profiles.default_hourly_rate_cents` **fallback** | `00412:2678,2681`; `00177:111,118` | W1 | the **column** drops a cycle after the view rewrite is live (`database.types.ts:13533,13572,13611` are its only TS references) |
| 10 | The `pending_authorization` dead-end badge and the silently-null provenance label | `hours-ledger.tsx:660-676`; `authority-hours.ts:74-88` | W1 | replaced by a doorway and "rate pending" |
| 11 | The drip link `?sheet=hours` | `copy-deck.md:357,379,627` vs `desk-doorway.tsx:19,41` | W2 | one character; a live founding-cohort CTA lands on a bare Desk today |
| 12 | The help article's two studio-scope sentences | `artifacts/designer-onboarding-learning-2026-09-03/content/wave-1/15-hours.md:9,15` | W2 | **made true**, not deleted — the panel's preference; pushed to Sanity |
| 13 | Gap-matrix rows BIL-04 and BIL-08 | `portal-vs-desk-feature-gap-matrix-v2.md:189,193` | W2 | R75 shipped BIL-04 (`hours-ledger.tsx:380-400`); reopen BIL-08 as the rate-display drift, not as absence |
| 14 | The `23505` toast branch in `useStartTimer` | `use-time-tracking.ts:480-484` | W3 | `start_timer` lands first, returning **both** rows |
| 15 | The implicit `billable: input.billable ?? true` default | `use-time-tracking.ts:320, 467` | W3 | every surface carries the control first; then a missing value is a caught bug |
| 16 | The log strip's `'design'` activity default | `log-strip.tsx:36` | W3 | replaced by "activity not set", never by a required tap |
| 17 | `apps/mobile/Capture/CaptureWidgets/`, `apps/mobile/Capture/CaptureShareExtension/` | empty dirs, absent from `Capture.xcodeproj/project.pbxproj:1140-1224` | W6 | the widget is not in v1, so these go. **No third state** |
| 18 | `useUpdatePhaseEstimates` | `use-time-tracking.ts:791` | W7 | **HT-39 first** — re-home or drop, not both-and-neither |
| 19 | The shipped default rate-card label "Principal designer" | `service-agreement-drafting-room.tsx:238` (enum `00084:163-164`) | W7 | the person/role binding lands first |
| 20 | The draft's DEFINER rollup, its `studio_id`-keyed RLS policy, and every new call site on `user_is_org_member` | `architecture-draft.md:44,50` | — | dropped from the plan outright, not built then removed |
| 21 | Stale line citations throughout `architecture-draft.md` | draft `:3,7,8,63,97` point at `00412`; head is `00578:2599` | W0 | the draft is an input, not a record; this file supersedes it |
| 22 | `useStudioTimeReport` | `use-time-tracking.ts:689-781` | — | **NOT deleted.** HT-37 is contested: eight seats say delete, feasibility says it is RLS-clean, carries member names, needs ~40 lines for a member group-by, and calls its deletion "the single biggest avoidable cost in the program". This plan **wires it** (W2). If Kody rules delete, the INVOKER replacement lands in `head+13` and W2 moves to the low end of L |
| 23 | The stale spec pointer in `docs/design/the-document/CLAUDE.md` | per briefing §2 | W0 | **not re-verified by any seat** — verify the pointer exists before fixing it (FS-146, VET-26) |

---

## §14 · The ruling sheet, mapped to waves

No wave starts until the rulings in its row are settled. Four gate the first line of
code.

| Wave | Rulings that gate it | Rulings it implements |
|---|---|---|
| **W0** | HT-5, HT-6 (both unopposed) | HT-30, HT-32, HT-33 (three dated governance entries, zero code) |
| **W1** | **HT-1, HT-2, HT-3** (HT-1 and HT-2 gate the first line of SQL) | HT-12, HT-26 |
| **W2** | **HT-10, HT-37** (narrow-or-keep; wire-or-delete), HT-8, HT-9, HT-29, HT-35, HT-36, HT-38 | HT-8, HT-9, HT-22, HT-23, HT-29, HT-35, HT-36 |
| **W3** | HT-11, HT-13, HT-14, HT-24, HT-25 | HT-11, HT-13, HT-14, HT-24, HT-17 (instrumentation only) |
| **W4** | **HT-15** (shape settled, reprice owed) | HT-15 |
| **W5** | HT-20, HT-21 | HT-20, HT-21 |
| **W6** | HT-16, HT-17, HT-18, HT-19 | HT-16, HT-17 (scope), HT-18, HT-19 |
| **W7** | **HT-4**, HT-34, HT-39 | HT-4, HT-34 (rule (a) only) |
| **not built** | HT-7, HT-28, HT-31 | recorded as §12 rows |

The four that gate the first line of code: **HT-1** (does the server own the rate on
every project kind), **HT-4** (does a rate-card row bind to a person instead of a
string), **HT-10** (is `time_entries_studio_read` narrowed or kept), **HT-37** (is
`useStudioTimeReport` wired or deleted).
