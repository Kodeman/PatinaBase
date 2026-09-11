# Architecture draft — hour tracking build-out (Opus plan agent, 2026-09-11)

A first engineering blueprint, produced read-only before the panel sat. It is an INPUT to the panel and to the architecture stage, not a decision. The feasibility seat audits it; the architecture stage reconciles it with the synthesis. Verified anchors: `public.project_time_entries` (00177:13–41), classifier `classify_project_time_entry_authority` (00412:2400–2618), invoiced lock (00177:47+), view redefinition (00412:2671), RLS block (00177:129–154), `projects.studio_id` + `set_project_studio_id` + `_primary_studio_for` (00317), `user_is_org_member(user, org, min_role)` (00021:484), `is_studio_comember(owner)` (00556:51), `is_project_team_member` (head 00484:626).

## §0 · Two integrity holes found while reading (drive Wave 0)

1. **Non-services projects trust the browser's rate.** `classify_project_time_entry_authority` only owns the rate for design-services projects. For any other project: `NEW.rated_amount_cents := round(duration/60 * NEW.hourly_rate_cents)` (00412:2448–2453) with no server check. A `member` can set their own bill rate on every non-services project.
2. **A new hire's rate is NULL.** On a services project where the member has no single matching authority role (00412:2511–2571 — exact-1 role match, else exact-1 rate, else nothing), the entry lands `billing_state='pending_authorization'` with `hourly_rate_cents = NULL`. "What is the bill rate" is today unanswerable for any new hire — the requirement's core question failing.

Migration numbers: mint from origin/main head + 1 after `git fetch` (local is stale at 00580; origin at 00591).

## Wave 0 — Server contract + rate authority (prereq for everything) — **L (6–10 days)**

**Goal:** one server-owned answer for rate, billable, and write atomicity.

**Server contract: add a narrow RPC layer, keep PostgREST for reads.** (a) The one-running-timer partial unique index (00177:39–41) makes start/stop a read-modify-write now raced by two clients (desk + Field) — the client currently interprets a `23505`; (b) the rate hole requires the server to compute the rate; (c) iOS needs an idempotent, client-minted-id write that survives replay.

RPCs, all **SECURITY INVOKER** so RLS stays the authorization spine (00484's contract) — they buy atomicity and idempotency, not privilege:
- `log_time(p_entry_id uuid, p_project_id, p_started_at, p_duration_minutes, p_activity, p_billable, p_notes, p_phase_key, p_task_id, p_source)` — `INSERT … ON CONFLICT (id) DO NOTHING RETURNING` (replay-safe).
- `start_timer(...)` — takes the running slot or returns the existing running row instead of raising; `stop_timer(p_entry_id, p_raw_seconds, p_idle_seconds, p_duration_minutes)`; `discard_timer`.
- `adjust_time_entry(p_entry_id, …)` / `delete_time_entry(p_entry_id)` — the only paths that may touch someone else's row (admin+, Wave 1).

DB:
- New `public.studio_member_rates(id, studio_id, user_id, hourly_rate_cents, effective_from date, effective_to date NULL, created_by, created_at)` — append-only; trigger closes the prior open row. Unique `(studio_id, user_id, effective_from)`.
- New SECURITY DEFINER helper `resolve_time_rate_cents(p_project_id, p_user_id, p_at) → (cents int, source text)`: authority rate → `studio_member_rates` → `profiles.default_hourly_rate_cents` → 0.
- `project_time_entries ADD COLUMN rate_source text CHECK (rate_source IN ('authority','studio_member','profile_default','none'))`.
- Rewrite `classify_project_time_entry_authority` to own `hourly_rate_cents` on **every** path, calling the resolver; keep existing immutability raises verbatim. Services-with-no-role-match gets a visible studio_member rate while keeping `billing_state='pending_authorization'` — you can see the cost, you still can't invoice it without an addendum.
- Extend `guard_commercial_time_entry_derived_fields` column list with `rate_source`.
- RLS on `studio_member_rates`: SELECT own row or `user_is_org_member(auth.uid(), studio_id, 'admin')`; INSERT/UPDATE admin+ only.

Portal: repoint `use-time-tracking.ts` mutations at the RPCs. iOS/edge/PostHog: none.

Tests / gates: new `supabase/tests/billing/time_rate_resolution_test.sql` (non-services browser rate ignored; new-hire services entry gets studio rate + stays pending; replayed `log_time` inserts once; two concurrent `start_timer` yield one running row). `supabase db reset` clean; `scripts/run-sql-tests.sh -d supabase/tests/billing`; `pnpm --filter @patina/designer-portal type-check`.

Effort justification: rewriting the 220-line classifier under its immutability contract plus the commercial SQL suite is the cost, not the new table.

## Wave 1 — The four views + the permission model — **L**

**Permission model (using `organization_members.member_role`):**

| role | sees | may edit |
|---|---|---|
| `owner`, `admin` | every entry in the studio — all members, all projects, per-entry notes | own + others' (via `adjust_time_entry`, audited) |
| `member` | own entries everywhere; **aggregate** hours on projects they're rostered to (existing `is_project_team_member` SELECT already grants per-entry read there — keep) | own only |
| `guest` | own only; no studio scope | own only |
| `projects.designer_id` | unchanged project-wide manage policy (00177:135) | unchanged |

DB:
- Fact view `public.time_entry_ledger` (`security_invoker=true`): entry columns + `studio_id`, `resolved_rate_cents`, `amount_cents` (prefer `rated_amount_cents`), `rate_source`, `is_running`, `day/iso_week/month` buckets. **LEFT JOIN profiles** — the inner join is the row-dropping hazard 00555:3024 already flagged.
- `studio_hours_rollup(p_from date, p_to date, p_scope text /* me|member|project|studio */, p_subject uuid, p_group_by text /* day|week|month|member|project|activity */)` — **SECURITY DEFINER**, returns `(bucket, label, minutes, billable_minutes, amount_cents)`. DEFINER because studio-wide totals cannot come from an invoker view without widening row RLS (which would leak other members' notes). First statement asserts `user_is_org_member(auth.uid(), p_studio_id, 'admin')` for `member|studio` scope, else forces `user_id = auth.uid()`.
- New RLS SELECT policy `studio admins read studio time` using `user_is_org_member(auth.uid(), (SELECT studio_id FROM projects WHERE id = project_id), 'admin')`.

Portal: move the hooks to `packages/supabase/src/hooks/use-time-tracking.ts` (the app-local file is the anomaly). Keep the document-coupled pieces (`document-time-provider.tsx`, `time-derivation.ts`) app-local. Delete the dead JS aggregator `useStudioTimeReport` (use-time-tracking.ts:689) in favour of the RPC. Inside the existing ledger, not new routes (D9/§6):
- `hours-ledger.tsx` gains a **scope lens** — "mine / <member> / this project / the studio" — admin-gated. Not a page, not a tab bar.
- `desk-contents.tsx` already labels `hours: 'time in hand'` — that card becomes the studio week total for admins, own week for members.

Effort: the RPC + two RLS-sensitive read paths + reworking a 751-line ledger to be scope-aware.

## Wave 2 — Studio rate card + internal/admin time — **M (3–5)**

- `studio_member_rates` edited in the **People Room member profile** (blur-save per R40/R70), not a settings page. `profiles.default_hourly_rate_cents` has zero TypeScript references — leave as tier 3.
- Internal time: `project_time_entries ALTER COLUMN project_id DROP NOT NULL`, `ADD COLUMN studio_id uuid` (backfill from `projects.studio_id`, trigger mirroring 00317), `CHECK (project_id IS NOT NULL OR billable = false)`. Classifier short-circuits `project_id IS NULL → nonbillable`. RLS gains own-row policies keyed on `studio_id` when `project_id IS NULL`. *Rejected alternative:* a per-studio sentinel "Internal" project — pollutes every project list, roster, board, invoice path. Nullable `project_id` is additive per O3/R4.
- `billable` becomes a first-class toggle in **every** capture affordance. It already reconciles with `billing_state` (00412:2444–2447 → `nonbillable`, `rated_amount_cents = 0`); no new state.

## Wave 3 — Frictionless web capture — **M**

- `command-bar.tsx`: a **"Log time"** verb (same capture-lead pending-flag pattern as "Draw an invoice"), parsing "90m Maple St design" inline; project defaults to the open document.
- `hours-ledger.tsx` batch row: add billable toggle + rate readout (`rate_source`).
- Keyboard: `g h` exists; add `t` on a document to focus the log strip. No new route — R77 ledger is the home.
- `log-strip.tsx` / `MobileTimerSheet`: repoint to RPCs, surface the resolved rate.

PostHog: `time_entry_logged` (`surface` = log_strip|ledger|command_bar|field_sheet|widget|intent, `source`, `activity`, `billable`, `rate_source`, `duration_minutes`, `latency_ms`), `time_timer_started`, `time_timer_stopped` (`adjusted`, `idle_minutes`), `time_entry_adjusted`, `time_entry_deleted`, `time_scope_viewed` (`scope`, `group_by`), `time_rate_unresolved` (the alarm — `rate_source='none'`), `time_export_taken`.

Tests: jest on the command-bar verb + ledger scope lens; first Playwright spec for hours. Gates: `pnpm --filter @patina/designer-portal type-check && pnpm --filter @patina/designer-portal test`, then `lint`.

## Wave 4 — iOS manual capture (Patina Field) — **M**

- New `LogTimeSheet` reachable two ways: `FieldCompanionActionID.logTime` (enum has two cases today, `FieldCompanionPresentation.swift:51`) and a Browse tile in `WorkDashboardScreen.swift`. Pre-fill project from `CaptureSessionContextStore`, duration from elapsed-since-visit-open.
- Read-only "My hours this week" via `studio_hours_rollup` (own scope needs no new permission).
- **Reuse the outbox, don't extend the visit record.** Add `TimeEntryOutboxRecord` in `CaptureKit/Domain/` as a sibling of `FieldVisitCloseRecord` (copy the `@Attribute(.unique)` client-minted id + `retryDelay(attempt:)`), generalize `VisitCloseOutboxDrainer` into a two-queue drainer. `FieldVisitCloseRecord` is load-bearing and tested — leave it alone.
- `SupabaseFieldWriteGateway.insertTimeEntry` switches to `client.rpc("log_time", …)`; PK collision on replay still gives idempotency.

**Decision — may Field start a running timer? No, not in v1.** The index is one running row per *user, globally*, and R19 auto-starts a desk timer on document pick-up. A Field-started timer would either 23505 or silently steal the desk slot. Field stays completed-entry-only, with elapsed-since-arrival pre-fill — feels like a timer without owning the slot.

Gates: `ruby apps/mobile/Capture/scripts/generate_project.rb` then `apps/mobile/Capture/scripts/capture-gate.sh all`; physical-device pass for the offline drain (airplane-mode log → reconnect → row present).

## Wave 5 — Widget + App Intents + Live Activity — **L**

- New **`CaptureWidgets`** widget-extension target (directory exists empty, absent from the pbxproj — `generate_project.rb` must learn it) and a shared **App Group** so extension and app see one SwiftData store.
- `LogTimeIntent` (`AppIntents`) with a `ProjectAppEntity` + `@ParameterSummary` so Siri/Spotlight handles "log 30 min on Maple St"; the widget's interactive button invokes the same intent. **Intents write to the App Group outbox, never the network** — a Siri invocation with no signal must not silently fail.
- Live Activity for a running visit: new `ActivityAttributes` alongside the sync-status activity, driven from visit open/close.

Effort: a new signed target, App Group entitlement, generator changes; the intent body is small.

## Wave 6 — Exports, invoice hand-off, nudges — **M**

- **Fix `project_unbilled_time` drift.** The 00412 redefinition (00412:2671–2687) still resolves `resolved_rate_cents` through `change_order_terms → profiles.default_hourly_rate_cents → 0` even for rows bound to an authority rate, and INNER JOINs `profiles`. Rewrite: `COALESCE(rated_amount_cents, …)` first, rate from the Wave-0 resolver, LEFT JOIN profiles, `billing_state='authorized'` filter retained. Keep the name — `hours-ledger.tsx:162`, `use-time-tracking.ts:159,706` and `supabase/tests/commercial/design_services_authority_test.sql:221,349,362` all read it.
- CSV from `time_entry_ledger`, generated in-browser (same direction as `rooms/library/import-parse.ts`); per-client statement reuses the R75 invoice-composer hand-off unchanged.
- **Nudges — deliberately minimal.** One edge function `supabase/functions/time-nudges/` on an hourly `cron.schedule` + `public.invoke_edge_function` (pattern at 00572:1224). Two rules only: (a) running timer > 8h → one quiet Record row (R82 ledger), no push, no email; (b) "unlogged day" is **opt-in per member and weekly-only**, piggybacked on `notification-digest`. A daily "you forgot to log" notification is the engagement loop Vision §6 forbids; ship (a), ship (b) dark.

Gates: `scripts/run-sql-tests.sh -d supabase/tests/commercial` (existing assertions must still pass); `deno test` for the function.

## Approval / lock workflow — recommendation: not in v1

For 2–6 people it is duplicated machinery. `pending_authorization` already gates money against the signed ceiling, and `guard_invoiced_time_entry` (00177:47) already makes invoiced entries immutable — *that is the lock*. Ship instead: admin `adjust_time_entry` with an audit row; revisit submit/approve/lock-week past ~10 heads.

## Top 5 risks

1. **Classifier rewrite blast radius** — 220 lines holding ceiling accrual, retainer gating, project-level `FOR UPDATE`, three immutability raises; a subtle change silently re-rates history. Mitigation: resolver is a separate function; classifier change is one `IF` branch plus a call; commercial SQL suite gates.
2. **RLS vs the studio rollup** — a DEFINER rollup is the only way to totals without widening row RLS; a missing `user_is_org_member` assert leaks one studio's hours to another. Needs its own SQL test per role.
3. **Running-timer slot contention** across desk + Field + widget + intent, all under one global partial unique index.
4. **`project_id` nullability** ripples into every existing join on `project_time_entries` (view, invoice attach, `issue_invoice`, the 00412 ceiling sums) — each needs an explicit NULL stance.
5. **Migration collision** — multi-wave parallel work needs worktrees + reserved number ranges per `patina-parallel-work`.

## Needs ruling (candidates)

- **R19 amendment:** does a Field-originated timer ever own the single running slot, or is Field permanently completed-entry-only?
- **New (rate authority):** the server owns `hourly_rate_cents` on *every* project, overriding any client-supplied value — non-services projects lose client-set rates.
- **New (studio rate card):** a per-member studio rate exists, lives in the People Room member profile, edited by owner/admin only.
- **New (internal time):** `project_id` may be NULL for non-billable studio/admin time, instead of a sentinel project.
- **§4/§6 amendment:** an unlogged-day nudge exists at all — and if so, opt-in and weekly, never daily.
- **R77 amendment:** the Hours ledger grows an admin-gated scope lens (mine / member / project / studio).
- **D9 affirmation:** ⌘K "log time" and a Field Browse tile are capture outside a document — confirm this doesn't breach "capture in document, review in drawer".
