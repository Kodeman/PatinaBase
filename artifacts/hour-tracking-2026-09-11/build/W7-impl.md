# W7 — rate cards bind to the roster role enum · W4's portal follow-commits · HT-35

**Branch** `hour-tracking/portal` · **worktree** `/Users/kody/Code/patina-merged/.codex/worktrees/agent-portal`
**Built on** `origin/hour-tracking/integration` @ `fd28a9542` (*"chore(time): merge W5 — the bookkeeper's Friday"*). `git fetch && git merge --ff-only origin/hour-tracking/integration` reported **Already up to date** — the lane tip and the integration tip were the identical commit. No merge commit, no conflicts.
**Commits** `2e7567e61` (00618/00619 + SQL tests + types + grants) · `513d7cbd3` (the role picker) · `3f7df185d` (W4's portal follow-commits) · `b6c0c1dc0` (HT-35). Pushed.
**Local stack** `patina-hours` — API `http://127.0.0.1:54421`, Postgres `127.0.0.1:54422`. This stage owned the reset.

Ruled inputs delivered: **HT-4**, **HT-41** (on a bound card), **HT-15** (W4's portal half), **HT-35**. Under **P-5** (no flags — there is none), **P-4** (no hour re-priced), §0.2, §0.3, §0.4, §0.16, §0.19, §0.20, §0.23.

---

## Files

| File | Status | What |
|---|---|---|
| `supabase/migrations/00618_authority_rate_role_binding.sql` | new, 1969 lines | the `roster_role` column on both rate tables, the normalisation, four grafted bodies, HT-35's two `profiles` columns, 30 postconditions |
| `supabase/migrations/00619_countersign_rate_binding_carry.sql` | new, 716 lines | `_countersign_design_services_agreement_impl` grafted from `00578:6011-6641` with ONE column added to ONE INSERT |
| `supabase/tests/billing/time_rate_resolution_test.sql` | extend, +217 | case **(al)**, four questions, per role |
| `supabase/tests/commercial/agreement_fee_schedules_test.sql` | extend, +60 | the countersign carry, end to end through the live rail; and the door's refusal of a value outside the four |
| `apps/designer-portal/.../agreement/part-kinds.ts` | modify | `ROSTER_RATE_ROLES`, `PartRole.rosterRole`, `readRoles` carries it |
| `apps/designer-portal/.../agreement/part-editor.tsx` | modify | the free-text role field becomes the enum picker |
| `apps/designer-portal/.../agreement/__tests__/part-editor-role-picker.test.tsx` | new, 148 lines | 7 cases |
| `packages/supabase/src/hooks/use-time-tracking.ts` | modify | `projectId` optional, `studioId` added, `'internal'` source, billable forced false, null-safe invalidation |
| `apps/designer-portal/src/components/document/hours-ledger.tsx` | modify | the add row's studio door; the `— internal —` group; an internal row's honest rendering |
| `apps/designer-portal/src/components/document/log-time-sheet.tsx` | modify | the ⌘K verb's studio door |
| `apps/designer-portal/src/hooks/use-viewer-studio.ts` | modify | `useInternalTimeStudio` |
| `apps/designer-portal/src/hooks/document-time-provider.tsx` | modify | HT-35's band, the opt-out's effect on `hold`, `startManually` |
| `apps/designer-portal/src/components/document/account/account-profile-page.tsx` | modify | HT-35's opt-out, "The clock" |
| `packages/supabase/src/hooks/use-time-autostart.ts` | new, 131 lines | the preference, its fetcher, its two writes |
| `packages/supabase/src/hooks/index.ts` | modify | the four new exports |
| `apps/designer-portal/src/lib/analytics/document-events.ts` | modify | `time_autostart_disclosed` / `time_autostart_opted_out`, built at last |
| `packages/supabase/src/database.types.ts` | regenerated | +12 lines (two `roster_role`, two `profiles` columns) |
| `supabase/seed/00-legacy-grants.sql` | regenerated | +18 lines; worktree's own `python3 ./scripts/generate-legacy-grants.py` per §0.20 — 2646 statements |
| four existing specs | modify | mocks widened for the new hooks and the new `p_studio_id` key |

`supabase/config.toml` was never staged. No iOS file, no edge function, no `next-env.d.ts` (the dev server's rewrite of it was reverted).

---

## 00618, and the three deviations from plan-v2 §8, each named

### The column, and the normalisation

`roster_role text` on **both** `proposal_service_rates` (what the picker writes) and `project_billing_authority_rates` (what the resolver reads), each with a named CHECK over the four billable roster roles. `'client'` IS a `project_team_members.role` value (`00084:164-165`) and is deliberately excluded — a signed rate card may not price the homeowner's own hours. A postcondition INSERTs `'client'` and requires a `check_violation`, and distinguishes it from the FK error so an admitted value cannot pass as a refusal.

The normalisation stamps `roster_role` on `proposal_service_rates` rows whose `role_name` normalize-matches, **and only where the answer is unambiguous inside its own (proposal, version)**: a card carrying both "Lead designer" and "lead_designer" is left NULL, because today's label match already strands it at `count(*) = 2` and stamping both would move nothing while hiding the collision behind a column.

**Deviation 1 — it does not touch `project_billing_authority_rates`.** Those rows are the immutable snapshot of a signed contract; `guard_billing_authority_rates_immutable` raises on any UPDATE, by design. And stamping them buys nothing: the legacy label leg is kept verbatim in both grafted bodies, so a roster_role-NULL snapshot prices exactly as it did yesterday. A postcondition asserts no snapshot row was written. Signed paper is not renormalised to tidy a column.

The `proposal_service_rates` write suspends that table's two guards for the single statement and re-enables them (`00399:5117`, `00461:1252`, `00572:1730` idiom) — they are application-write contracts and this is a schema-evolution statement running as the table owner, deriving each value from the row's own label. No money moves.

### The four grafted bodies

Each is its head's body extracted **by line range** (not retyped) with exactly the delta its banner names:

| body | head | delta |
|---|---|---|
| `_project_agreement_terms` | `00575:2249-2317` | `roster_role` on the INSERT, from `v_rate->>'rosterRole'` |
| `upsert_agreement_parts` | `00578:5095-5768` | validate `rosterRole` at the door (in the room's words), refuse the same role twice on one card, carry it into `v_rates` |
| `resolve_time_rate_cents` | `00615:380-654` | tier 1 asks `roster_role` FIRST; the label leg is kept and gains `roster_role IS NULL` |
| `classify_project_time_entry_authority` | `00613:126-506` | the same two legs, said about the row the entry BINDS to |

**Deviation 2 — the classifier is in this file, and §8 names only the resolver.** The resolver hands cents and provenance; `classify_project_time_entry_authority` picks the `project_billing_authority_rates` row the entry binds to, from its own copy of the same label match (`00613:401-421`). Grafted into one of the two, HT-4 resolves `'authority'` and the row still lands `pending_authorization` with a NULL `authority_rate_id` — which is defect #2 arriving under a new name, and which makes §8's own Done-when ("a default two-role rate card prices a new hire's entry with `rate_source='authority'`") unreachable. A postcondition pins the two legs together; case (al1b) measures the binding, not only the price.

The label leg's new `roster_role IS NULL` clause is load-bearing in both bodies: without it a studio that binds one card and labels another "Lead designer" gets two answers to one question and no caller can tell which priced the hour.

**Deviation 3 — HT-35's two `profiles` columns ride in 00618.** `time_autostart_opt_out boolean NOT NULL DEFAULT false` and `time_autostart_disclosed_at timestamptz`. HT-35's surfaces were descoped from W2 for want of a column and scoped to this stage by the orchestrator; the preference must be per-member and cross-device (`user_settings` has none, `profiles` has none, `profiles.help_state` is the help system's own cache), plan-v2 reserves HT-35 no number, and this program's block is spent but for 00618 and 00619. The columns are additive, defaulted, and touch no other wave's objects and no hour. A postcondition pins the DEFAULT to `false` — the column is the opt-OUT, so a default of `true` would silently stop the automatic timer for the whole studio.

### 00619

One delta, in the one place. Verified by grep over every migration: the eight `INSERT INTO public.project_billing_authority_rates` sites (`00412:1094`, `00414:869`, `00475:848`, `00511:4552`, `00566:799`, `00575:1797`, `00577:2469`, `00578:6562`) are all redefinitions of the same lineage — the first two under its pre-extraction name `countersign_design_services_agreement`. There is no second door to keep in step. The postconditions re-assert 00578's own invariants on the grafted body, including the two shapes `public_sd_hardening_contract_test.sql` pins on this function (`'commercialDocumentId'`, `app_private.issue_invoice_for_actor( v_retainer_invoice_id, … )`), so a bad graft fails at replay rather than in a suite.

---

## The tests, and where they went

**Case (al)** went into `supabase/tests/billing/time_rate_resolution_test.sql`, **not** into `supabase/tests/commercial/design_services_authority_test.sql`, which plan-v2 §8 names. That file is one of the six documented pre-existing failures and aborts at `:177`, 44 lines before its first authority assert — a case appended to it would never execute. W1-R1-15 already ruled on exactly this: *"the SOLE gate for the classifier is `supabase/tests/billing/time_rate_resolution_test.sql`; grow it, not the commercial suite, when the classifier changes."*

Its four questions:

- **al1** a card bound to `lead_designer` prices the lead under the label "Principal designer" — the shipped default that stranded every entry — and **al1b** the row BINDS to that card (`authority_rate_id`, `billing_state = 'authorized'`).
- **al2** the new hire: bound `support_designer` under the label "Associate", `rate_source='authority'`, 120 min × 11000 = 22000. Before 00618 this row was NULL-rated and `pending_authorization` for ever.
- **al3** a legacy label-only card (`roster_role` NULL) still resolves exactly as it did.
- **al4** HT-41 on a bound two-role card: neither label matches, so the member's pick is the only thing that can decide, and it decides the BOUND card.

The **countersign carry** went where §8 asks, in `commercial/agreement_fee_schedules_test.sql` (green), on the file's own live rail — `upsert_agreement_parts` → send → sign → countersign — asserting the binding on the projected rate, the untouched label beside it, the snapshot row, and that every snapshot row EQUALS the source row it froze (carried, never re-derived).

`part-editor-role-picker.test.tsx`: exactly four values, `'client'` absent, no free-text field, the picker writes binding AND label, a legacy label survives as the unchosen state, `+ Add a role` seeds the first unused role and is spent at four, and a role already on the card is not offered twice.

Added beyond the plan's named set, because the controls are new and would otherwise ship untested: three HT-15 cases in `hours-ledger-add-row.test.tsx` (the door writes `projectId: null` + `studioId` + `billable: false` + `source: 'internal'`; the pill is held with its reason; the `— internal —` group renders with no document and no rate) and seven HT-35 cases in `document-time-provider.test.tsx` (default-on starts; opted-out starts nothing; `startManually` opens the same clock as `timer_manual`; the band offers it; the disclosure appears once and stamps; never again once stamped; silent on the Desk).

---

## Gates, verbatim, as run

| Command | Result |
|---|---|
| `supabase db reset --workdir …/agent-portal` | **clean** — 00618 and 00619 applied, every postcondition passed |
| `scripts/run-sql-tests.sh -d …/supabase/tests/billing -H 127.0.0.1 -p 54422` | **9 / 9 green**, 0 unexpected (case (al) confirmed executing by its own NOTICE) |
| `scripts/run-sql-tests.sh -d …/supabase/tests/commercial -H 127.0.0.1 -p 54422` | **10 green / 16**, **6 unexpected — the identical documented six** (`authorized_schedule`, `design_services_authority`, `design_services_gap_hardening`, `executed_on_paper`, `trade_rfq`, `trade_scope`; `KNOWN_FAILURES.md:97-101`, matched by name when the suite is run worktree-relative with `-k`). `agreement_fee_schedules_test.sql` is green WITH its new asserts |
| `scripts/run-sql-tests.sh -d …/supabase/tests/rls -H 127.0.0.1 -p 54422` | **29 green / 31**, **2 unexpected — the documented pair** (`design_requests_test`, `studio_titles_test`) |
| `pnpm --filter @patina/supabase type-check` | clean |
| `pnpm --filter @patina/designer-portal type-check` | clean |
| `pnpm --filter @patina/designer-portal test` | **580 suites / 7401 tests, all pass** |
| `pnpm --filter @patina/designer-portal lint` | **0 errors**, 201 warnings (all pre-existing) |
| `pnpm --filter @patina/admin-portal build` | **compiled successfully** — the §0.24 type-integrity gate |
| `pnpm --filter @patina/client-portal type-check` | clean |
| `pnpm --filter @patina/client-portal test` | **151 suites / 2475 tests, all pass** |
| `pnpm db:generate` → `git diff --exit-code packages/supabase/src/database.types.ts` | regenerated and committed; clean afterwards |
| `python3 ./scripts/generate-legacy-grants.py` (the **worktree's own** copy) | 2646 statements, seed committed |

---

## Every changed control, measured at 390 and 1440

A live Chromium pass against `next dev -p 3100` on the isolated stack (`NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54421`, `DATA_MODE=live`), signed in as the seeded designer. Ports 3000/3002 were never touched; the server was killed and the walk scripts and their fixture rows removed afterwards.

| Control | 1440 | 390 |
|---|---|---|
| The rate card's role picker | x=385 w=517 h=43, options `["Principal designer","Lead designer","Support designer","Bookkeeper","Vendor"]`, page overflow 0 | x=41 w=155 h=43 (right edge 196 of 390), same options, page overflow 0 |
| its rate field beside it | x=915 → 1055, h=43 | x=209 → 349, h=43 |
| Hours add row · Document select | x=382 w=186 h=50 | x=46 w=140 h=50 |
| Hours add row · Add act | x=1005 w=44 **h=44** | x=46 w=289 **h=44** |
| Hours add row · billable pill (held, internal) | x=382 w=113 **h=44**, disabled | x=46 w=113 **h=44**, disabled |
| Hours sheet page overflow | 0px | 0px |
| the `— internal —` group and its row | rendered, x=382 w=668 | rendered, x=46 w=289 |
| ⌘K Log time · Document select (with the studio option) | x=514 w=473 | x=41 w=307 (right edge 348 of 390) |
| ⌘K Log time · Log it act | x=863 w=64 **h=44** | x=285 w=64 **h=44** |
| ⌘K Log time · the internal sentence | visible | visible |
| HT-35 opt-out on the profile page | x=442, page overflow 0px | x=46, page overflow 0px |

**Nothing is off-screen at either width, and no page scrolls sideways.** One reading in the first pass showed the Log time select at w=473 at 390; a clean re-probe on a freshly laid-out page measured w=307 inside a 354px card — the first figure was a stale layout from the same page reused across the resize, not a defect.

**One thing to say plainly rather than bury:** the role picker is **43px**, not 44. It is the design system's own `<Select>`, at the identical height as the `<Input>` it replaced and as the two shipped `<Select>`s two rows below it in the same editor (cadence, activation) — measured, all three 43px. The row's height did not change. Raising it means changing a shared control used across the portal, which is not this wave's to do.

---

## Deliberately NOT done

- **`useUpdatePhaseEstimates` is NOT deleted**, and `project_phases.estimated_hours` gets no writer — HT-39 is unruled (plan-v2 §8), so no migration was written for it. `00620` was spent by W2.
- **No edge function, no cron** — HT-34 moved to W4 (lane D, `00614`).
- **No `user_id` column on the rate card** — HT-4 is an ENUM binding, not a person binding; architecture.md's `head+24` is dropped by the ruling.
- **The studio Agreement-defaults rate card** (`account-studio-page.tsx:1119`) still carries a free-text role field and the placeholder "Principal designer". It is outside plan-v2 §8's named file list and is left alone. The consequence is benign and visible: `materialize_standard_parts` (`00575:3073`) seeds a new agreement's rate card from those defaults, so a studio whose defaults carry labels gets rows with `roster_role` NULL — the picker shows each as the unchosen state under its own label, the designer converts it by picking, and the server prices it by its label until she does. **Owed: a ruling on whether the studio defaults card gets the same picker.**
- **No e2e run.** `apps/designer-portal/playwright.config.ts` hard-pins its `webServer` to port **3000** and `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321` — the peer program's port and the shared stack, both forbidden to this lane. The equivalent evidence is the live Chromium pass above.

## Owed / worth a line in the ship report

1. The studio Agreement-defaults rate card (above).
2. `supabase/tests/commercial/design_services_authority_test.sql` is still one of the six pre-existing failures, so §8's literal instruction to extend it could not be honoured; the coverage lives in the billing suite instead. The six remain a pre-existing, documented condition of this repo.
3. The role picker at 43px, if the house sheet's 44px floor is to be read as covering form controls as well as acts — a design-system change, not a wave change.
