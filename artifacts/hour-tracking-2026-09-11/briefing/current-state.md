# Current state — hour tracking in Patina (2026-09-11)

Three read-only exploration reports, verbatim, from the orchestrator's session. Every seat reads §0 then the section for its surface. Line numbers are as of the local checkout on 2026-09-11 (local `main` is ~103 commits behind origin; Strata's migration head is 00591, not 00580 — see §1 note).

## §0 · The map in twelve lines

1. One table: `public.project_time_entries` (00177 → 00198 → 00412 → 00545). Who (`user_id`), what (`activity`, `notes`, `phase_key`, `task_id`), project, `billable`, `hourly_rate_cents`, `billing_state`, `rated_amount_cents`, `source`, `raw_seconds`/`idle_seconds`, `invoice_id`.
2. One running timer per user, globally (partial unique index `WHERE duration_minutes IS NULL`).
3. Rates: design-services projects → immutable `project_billing_authority_rates`; everything else → `hourly_rate_cents` the browser sends, or `profiles.default_hourly_rate_cents`, or 0.
4. No RPC layer — every write is a PostgREST table write gated by RLS + triggers.
5. RLS: project owner manages all; `is_project_team_member()` reads all entries on the project, writes own. No client policy. No studio-admin policy.
6. Portal capture: timer auto-starts when a document is picked up (R19); log-offer strip on put-down; mobile timer sheet; Hours ledger batch-add row.
7. Portal review: the Hours ledger (`/desk?book=hours`, ⌘K "Hours", `g h`) — **hard-filtered to the signed-in user**. No member view, no studio view, no admin-portal surface, no export.
8. `useStudioTimeReport` is fully built and has zero callers.
9. Patina Field: exactly one affordance — "Log 1h 20m as a site visit" at visit close. No manual entry, no visibility, no timer, no widget/intents targets.
10. Client portal sees an hours invoice line as an opaque description string.
11. One PostHog event (`document_log_strip_acted`). No e2e spec for hours.
12. Two integrity holes in the classifier (see `architecture-draft.md` §0): non-services projects trust the browser's rate; a new hire on a services project gets a NULL rate.

---

## §1 · Data and backend layer

**Highest applied migration number on this checkout: `00580_room_concept_render.sql`.** (`_pending/00106_drop_client_messages.sql` is an unapplied historical leftover.) ⚠ Origin/main and Strata are at 00591 — any migration this program proposes is minted from origin/main head + 1 after `git fetch`, never a literal number.

**Core table — `public.project_time_entries`** (created `supabase/migrations/00177_project_time_entries.sql:13`, widened by `00198`, `00412`, `00545`):
- `id`, `project_id → projects`, `phase_key` (text, PhaseSlug), `task_id → project_tasks`, `user_id → profiles`
- `started_at timestamptz`, `duration_minutes integer` (NULL = running timer; `duration_minutes IS NULL` enforced unique-per-user by `uniq_project_time_entries_running_timer` on `(user_id) WHERE duration_minutes IS NULL`, 00177:39-41)
- `notes text`, `billable boolean DEFAULT true`, `hourly_rate_cents integer` (snapshot at stop/create)
- `invoice_id uuid` (FK added later by `00178`, `fk_time_entries_invoice`)
- `raw_seconds`, `idle_seconds` (00198:22-24 — pre-adjustment audit trail / idle annotation, never subtracted)
- `source text` CHECK — `'timer_auto' | 'timer_manual' | 'manual_entry'` (00198), widened to add `'field_visit'` by `00545` (Field Companion — a completed entry a mobile visit-review offers, never a running timer)
- `activity text` CHECK — `design | sourcing | client | site_visit | admin` (00198:27-29)
- `billing_authority_id → project_billing_authorities`, `authority_rate_id → project_billing_authority_rates`, `billing_state text DEFAULT 'authorized'` CHECK `authorized | pending_authorization | nonbillable`, `rated_amount_cents integer` (all added by `00412_design_services_commercial_authority.sql:279-296`) — the newer commercial-authority layer sitting alongside the original `hourly_rate_cents`/`billable` fields
- No approval/reviewed_by/locked_by column anywhere.

**Invoiced-entry lock trigger** — `guard_invoiced_time_entry()` (00177:51): once `invoice_id` is set, DELETE is forbidden and UPDATE may only touch `notes`/detach `invoice_id`; any priced/attributable column change raises.

**Commercial-authority guard/classifier triggers** (added `00412`, redefined body-for-body in `00575_agreement_parts.sql:2002` and `00578_design_build_kind.sql:2599` — always grep for the latest body):
- `guard_commercial_time_entry_derived_fields()` — blocks browser writes to `billing_authority_id/authority_rate_id/hourly_rate_cents/rated_amount_cents/billing_state`; rejects INSERT with a pre-set `invoice_id`.
- `classify_project_time_entry_authority()` — SECURITY DEFINER; resolves authority/rate server-side, sets `billing_state`/`rated_amount_cents` (`nonbillable` if `!billable`; `authorized` + `duration/60*hourly_rate_cents` if not a "design services" project; otherwise resolves the signed `project_billing_authorities`/`_rates` and enforces immutability of authority provenance once bound).
- `guard_time_entry_invoice_authority()` (00412:2628) — invoice-attach guard tying into `issue_invoice`.

**Supporting tables (00412):**
- `project_billing_authorities` — one active row per project (partial unique on `status='active'`), `billing_ceiling_cents`, `retainer_amount_cents`, `retainer_activation_policy IN (immediate, retainer_paid)`, `billing_cadence IN (monthly, biweekly, milestone)`, `retainer_invoice_id`, `status IN (active, superseded, exhausted)`.
- `project_billing_authority_rates` — immutable per-role rate snapshot: `billing_authority_id`, `source_rate_id → proposal_service_rates`, `version`, `role_name`, `hourly_rate_cents`. RLS: `billing_authorities_studio_read`/`_client_read`, `billing_authority_rates_studio_read`/`_client_read` (00412:311-368) — studio co-members + the client on the project.

**View — `public.project_unbilled_time`** (00177:97, `security_invoker`): completed, billable, un-invoiced entries with resolved rate + amount. Rate precedence: `te.hourly_rate_cents → project.change_order_terms->>'hourly_rate_cents' → profiles.default_hourly_rate_cents → 0`. This legacy view does **not** know about `rated_amount_cents`/`billing_state` from 00412 — the app layer (`useStudioTimeReport`) has to fall back `rated_amount_cents ?? amount_cents` and re-filter by `isInvoiceEligibleTimeEntry` client-side; the view and the newer authority model have drifted apart.

**Margin/activity feed** — `public.margin_items` view has a `'time'` branch: 7-day rolling daily summary over `project_time_entries` grouped by `(project_id, day)` (`00194_margin_items_view.sql:184`, redefined in `00197`, `00200`, `00202`, `00206`, `00543` — 00543 is the current head). This view previously hit a prod bug: `uuid_generate_v5` lacked an `authenticated` EXECUTE grant, fixed by `00531`.

**RLS on `project_time_entries`** (00177:129-153): designer (project owner) manages all; project team members (`is_project_team_member()`, canonical def at `00484_public_rpc_authorization_contract.sql:626`) can SELECT all project entries but INSERT/UPDATE/DELETE only their own row (`user_id = auth.uid()`). **No client-facing policy — time is internal-only.**

**Related columns elsewhere:**
- `project_phases.estimated_hours numeric(6,1)` (00177:88) — phase-level time budget; flagged in memory as "PHASES deletion leaves `project_phases.estimated_hours` uneditable (D-B5, owed re-home)" — a known dangling gap.
- `profiles.default_hourly_rate_cents integer` (00177:89) — per-user default rate fallback. Zero TypeScript references anywhere — DB-only fallback nobody can edit.
- `project_tasks.field_capture_id`, `margin_notes.field_capture_id` (00543/00544) — Field Companion capture back-refs.

**Invoices connect via `issue_invoice`, not a dedicated "bill hours" RPC.** Current head is `public.issue_invoice(p_invoice_id uuid, p_due_date date)` at `00412:2694`, which blocks issuing when linked time entries are `<> 'authorized'` or when a `retainer_paid` authority's retainer invoice isn't fully paid. Actor-scoped wrapper `app_private.issue_invoice_for_actor(...)`, latest body at `00578:2170`. Time entries attach to an invoice via `invoice_id` set directly on rows (no line-item join table) — invoice line assembly happens client-side (`buildTimeLineDraft` in `apps/designer-portal/src/lib/time-billing.ts`), producing one `kind='time'` invoice line per invoice with `qty=1`.

**Fee schedules / agreements (`00575`, `00577`, `00579`):** author the *rate cards* that become `project_billing_authority_rates`. `fee_basis` enum `hourly | flat | per_phase`; a rate card is `{roleName, hourlyRateCents, sortOrder}[]`. On countersign, `project_billing_authority_rates` rows are materialized from `proposal_service_rates` (`00575:1798-1799`, `00577:2470-2471`). This is the only path connecting agreements → hourly rate → time entries (design-services projects only — everything else falls back to the old `hourly_rate_cents`/`change_order_terms` resolution with no authority object at all).

**`packages/supabase/`** — no dedicated time-tracking hook module. All real hooks live app-local in `apps/designer-portal/src/hooks/use-time-tracking.ts`: `useTimeEntries`, `useUnbilledTime`, `useTimeSummary`, `useCreateTimeEntry`, `useUpdateTimeEntry`, `useDeleteTimeEntry`, `useRunningTimer`, `useStartTimer`, `useStopTimer`, `useDiscardTimer`, `useClaimTimeEntries`, `useReleaseTimeEntries`, `useStudioTimeReport` (:689 — aggregates whole-studio rows client-side; **zero callers**), `useUpdatePhaseEstimates`. All direct PostgREST CRUD — no RPC exists. Generated types: `packages/supabase/src/database.types.ts:17405`.

**`packages/types/`** — `commercial.ts:41` `TimeBillingState`; `:114` `ProjectBillingAuthoritySummary`. No standalone `TimeEntry` domain type.

**Edge functions** — none touch time entries. No reminders, no digests, no exports, no invoice-from-hours automation.

**Prisma services** — no time/labor models in orders or projects.

**Studio membership** — `public.organizations` + `organization_members` (00021): `member_role` = `owner | admin | member | guest`; `member_status` = `active | invited | suspended | removed`. Helpers: `is_active_studio_member(p_org)` (00417:39), `is_studio_comember(p_owner)` (00315; head 00556:51), `is_org_admin_or_owner(uuid,uuid)` (00068), `user_is_org_member(user, org, min_role)` (00021:484). Project roster: `project_team_members` (00084:160) role `lead_designer|support_designer|vendor|client|bookkeeper`. `is_project_team_member(project_id)` (00484:626) gates who logs/views time — hours are scoped per **project team member**, not org member. `projects.studio_id` + `set_project_studio_id` (00317).

**Seeds** — none reference `project_time_entries`. Test fixtures: `supabase/tests/field/time_entry_field_visit_source_test.sql`; `supabase/tests/commercial/design_services_authority_test.sql:221,349,362` reads `project_unbilled_time`. E2e must close running timers, never delete (one-running-timer index).

**Gaps (data):** no approval/review workflow; no rate history on the legacy path; no studio rollup view/RPC; no RPC layer for start/stop/log; `project_unbilled_time` drifted from 00412; no edge functions; no Prisma model; `project_phases.estimated_hours` orphaned; per-member/role attribution coarse on non-services projects; no seed data.

---

## §2 · Designer portal, admin portal, client portal, extension

**Architecture.** DB model above. Central hook file `apps/designer-portal/src/hooks/use-time-tracking.ts`. Timer mechanics in `apps/designer-portal/src/hooks/document-time-provider.tsx`, mounted once above the Desk and every document (`(document)/layout.tsx`):
- Pick up a document → timer auto-starts (`hold()`, source `timer_auto`), chaining out any other running timer through the log-offer strip first. Put it down → timer stops and offers the elapsed time (`release()`).
- `<60s` on an auto-started timer discards silently (D10/R4); manual-start timers round up to 1 min.
- Idle detection via activity pings (pointermove/keydown/wheel/visibilitychange) — idle is annotated, never subtracted. A single idle gap ≥30 min (`RUNAWAY_IDLE_SECONDS`, R64) marks the timer abandoned and proposes active duration.
- Billable intent resolved automatically from the project's billing authority (`automaticTimeBillingIntent`, `lib/document/authority-hours.ts:13`) — fails closed (nonbillable) if no active, executed services agreement.
- `manualLog()` — "+ Log" typed entry against the held document; `logOffer()`/`discardOffer()` — the strip's Log/Discard. Pure logic in `lib/document/time-derivation.ts`.

**Surfaces.**

| Surface | File | Route/trigger | What it does | Fields | Flag |
|---|---|---|---|---|---|
| Pick-up/put-down auto-timer | `document-time-provider.tsx` | any `/doc/[id]` mount/unmount | Starts/stops a per-user timer automatically | none | none — unconditional |
| Log-offer strip | `components/document/log-strip.tsx` | after a timer stops | Adjust minutes up/down, pick activity, Log or Discard (Esc = discard) | minutes, activity (5-value select) | none |
| Mobile timer sheet | `components/document/mobile/mobile-sheets.tsx:1130` (`MobileTimerSheet`) | "In hand today" doorway (drawer clock, `openTimer()`), every width | Live mm:ss, Pause/Resume, "+ Log manually" | minutes, activity | none |
| Hours ledger | `components/document/hours-ledger.tsx` | `/desk?book=hours`, ⌘K → "Hours", `g h` (`lib/document/registry.tsx:214`) | Week view of **the signed-in designer's own** entries (`.eq('user_id', currentUser)`), inline edit activity/duration until billed, delete-with-confirm on unbilled, week paging, per-document lens (`?projectId=`), all-time unbilled balance with "Bill it" → invoice composer, "Export week → Accounts", batch-add row (project/minutes/activity) at :546-595 | project (active only), minutes, activity | none |
| Command bar (⌘K) | `components/document/command-bar.tsx` | `Cmd/Ctrl+K` | "Hours" is a registered ledger doorway (aliases hours, time, time tracking, timesheet); no timer verb | — | none |
| Pending billing authority band | `components/document/pending-time-authorization-band.tsx` | inside Hours ledger | Hours logged but not yet billable (no executed rate authority) | — | — |
| Project authority band | `components/document/commercial/project-authority-band.tsx` | Hours ledger (project-scoped), project document | Read-only role→hourly-rate table | — | — |
| Bill rate configuration | `components/document/rooms/drafting/agreement/part-editor.tsx:423` (`rate_card` part) | Service-agreement drafting room | Where hourly rates are actually set, per role, on the contract | roleName, hourlyRateCents | — |
| Invoice → time pull-through | `components/document/accounts/invoice-composer.tsx`, `lib/document/invoice-composer.ts:154` | from Hours "Bill it"/"Export week" | Claims unbilled entries into ONE `kind='time'` line, qty 1, e.g. "Design services — 4h 30m (3 entries)" | per-entry include/exclude | — |
| Phase hour estimates | `useUpdatePhaseEstimates` (`use-time-tracking.ts:791`) | project edit page | Batch-save `project_phases.estimated_hours` | — | — |
| Studio-wide time report | `useStudioTimeReport` (`use-time-tracking.ts:689`) | **nowhere** | Cross-project, cross-designer rollup by period; per-project totals; billable/invoiced minutes | — | dead code |

**Margin/paper.** Time is deliberately excluded from the margin rail/sheet — `lib/document/margin-groups.ts:6-13`: `"time" is not a margin item the margin prints: it is the studio's own clock, and every surface that lists the margin excludes it.`

**Feature flags.** Time tracking is not flag-gated anywhere. Siblings in the same files are (`call-sheet` at `mobile-sheets.tsx:435`, `command-bar.tsx:260`; `tester-notes` at `command-bar.tsx:263`).

**Retired routes** (R77, `DECISIONS.md:2648`): `/portal/time` and `/portal/projects/[id]/time` dissolved into the Hours ledger sheet.

**Desk.** `components/document/desk-contents.tsx` labels a card `hours: 'time in hand'`; claim-card inline-act pattern in `desk-roster.tsx`, `folder-card.tsx`.

**Admin portal.** Nothing — no hours, no member view, no rates.

**Client portal.** `apps/client-portal/src/app/pay/[token]/invoice-sheet.tsx:829-836` renders line items generically via `line.description` — the time line is an opaque string with no hours/rate breakdown.

**Extension.** Nothing.

**Quick-capture affordances to piggyback on.** Command bar (registry-driven, R93, context-aware "This surface" section with verbs like "Draw an invoice · {project}"); Tester Notes widget (`components/tester/tester-widget.tsx`, flag `tester-notes`); drawer "In hand today" doorway (`studio-drawer.tsx:468-482`, `data-drawer-timer-doorway`); mobile bottom bar / action dock / sheet kinds `drawer | timer | spine | margin-item | margin | note` (`mobile-bar.tsx`, `mobile-action-dock.tsx`, `mobile-sheets.tsx`); Desk claim cards; the ledger's own batch-add row.

**Help system.** Surface key `hours: 'designer-portal/document/hours'` (`lib/help-system/document-surface-keys.ts:32`); drafted article `artifacts/designer-onboarding-learning-2026-09-03/content/wave-1/15-hours.md` promises: *"Time the studio logged — timer-caught and hand-entered… no timer to remember, no timesheet to reconcile… This is also where a designer or the studio's first hire can see, at a glance, where the week actually went."* The single-user ledger does not deliver that for anyone but themselves.

**Tests.** Jest: `hooks/document-time-provider.test.tsx`, `hooks/__tests__/use-time-tracking-authority.test.tsx`, `lib/__tests__/time-billing.test.ts`, `lib/document/__tests__/time-derivation.test.ts`, `components/document/mobile/mobile-timer-sheet.test.tsx`, `components/document/pending-time-authorization-band.test.tsx`. No `hours-ledger.test.tsx`. Playwright: no dedicated hours spec.

**PostHog.** One event: `document_log_strip_acted` (`lib/analytics/document-events.ts:234`, props `{ action, adjusted, had_idle }`). Nothing for timer start/stop, manual entries, ledger edits/deletes, Bill it / Export week, or the Hours doorway.

**User flows today.**
- *Logging an hour (normal path, zero explicit action):* open `/doc/[id]` → `hold()` starts a timer (closing any other via the strip) → work; the drawer's "In hand today" readout rests at minute resolution → navigate away → `release()` stops it, applies sub-60s/idle/abandonment rules, writes the entry, shows the log-offer strip → adjust minutes + activity and Log, or Discard, or ignore (entry stays at the suggested duration).
- *By hand:* Hours ledger batch-add row (project, minutes, activity, Add), or the mobile timer sheet's "+ Log manually".
- *My hours:* Hours ledger week view, grouped by day, today/week totals, billable% readout.
- *A project's hours:* same ledger via `?projectId=` from the Account band, or the unbilled project selector.
- *A teammate's hours:* **not possible in the UI.**
- *The studio's hours:* **not possible in the UI**, despite `useStudioTimeReport`.

**Gaps + friction (portal).** No cross-designer visibility; `useStudioTimeReport` dead; no admin surface; no rate editing outside contract drafting; no export; analytics blind; no e2e; time invisible on the paper's margin by rule; flag posture inconsistent with siblings; client sees a string; `docs/design/the-document/CLAUDE.md` points at a spec file that no longer exists; the gap matrix (`portal-vs-desk-feature-gap-matrix-v2.md`) is stale on BIL-04 (R75 shipped it).

---

## §3 · Patina Field (iOS) and the Patina client app

**There is no timer, no timesheet screen, no hours dashboard anywhere in Patina Field.** The only hour-logging surface is a one-tap "log the hours this visit took" offer on the visit-close flow. It writes a **completed** `project_time_entries` row; it can never start a running timer.

**Screen: Visit review (`V4VisitReviewScreen`)** — `apps/mobile/Capture/Capture/Features/Session/V4VisitReviewScreen.swift`
- Reached when a field visit ends ("End visit" opens this screen, lines 13-14). Registered as `CaptureRoute.visitReview(visitID:)` (`VisitReviewScreens.register`, 468-481).
- Groups captured Specimens into Captures / Notes / Unplaced (101-132), then a footer with the **time offer button** (286-316) and Done.
- `timeOffer` (308-316): only shown when the visit has a `projectID` and a resolvable `ownerUserID`. Label from `VisitReviewComposer.timeOffer(minutes:)`, e.g. **"Log 1h 20m as a site visit"** (`CaptureKit/CaptureKit/Session/VisitReview.swift:96-109`). No form — no fields, no phase/activity picker, no notes; a single confirm tap.
- `logTheHours` (346-371) inserts a SwiftData `FieldVisitCloseRecord` and calls `resumeCloseOutbox()`.
- Duration = wall-clock elapsed from visit `startedAt` to close, floored to 1 minute (`VisitReviewComposer.summarize`, `VisitReview.swift:52-83`); **never user-editable**.
- Notes auto-composed: project label + room list, e.g. "Maple St · Living, Dining" (`VisitCloseOrchestrator.notes`, `FieldVisitCloseRecord.swift:239-251`).
- Button states (`offerLabel`, 321-329): `.none` → offer; `.pending/.writing/.failed` → "Logging these hours."; `.written` → "Logged."; `.refused/.unwritable` → "These hours didn't log."

**Model: `FieldVisitCloseRecord`** — `apps/mobile/Capture/CaptureKit/CaptureKit/Domain/FieldVisitCloseRecord.swift`: `@Model` (SwiftData) with `visitID` (unique), `timeEntryID` (client-minted → `project_time_entries.id`), `projectID`, `ownerUserID`, `startedAt`, `endedAt`, `durationMinutes`, `state` (`FieldWriteState` pending/writing/written/failed/refused/unwritable), `lastError`, `retryCount`, `nextAttemptAt`. `TimeEntryWriteRequest` (128-176): `id, project_id, user_id, started_at, duration_minutes, source="field_visit", activity="site_visit", notes`. No `billable`, `hourly_rate_cents`, or `phase_key` sent.

**Offline persistence:** SwiftData, registered in `CaptureStore.schema` (`CaptureKit/Persistence/CaptureStore.swift:78-84`); accessor `store.visitCloseOutbox()` (678-690).

**Sync: `VisitCloseOutboxDrainer`** — `apps/mobile/Capture/Capture/Features/Session/VisitCloseOutboxDrainer.swift`: lookup-before-write (`gateway.existingTimeEntry(id:)`) then insert, exponential backoff (5s → 1h cap) via `FieldVisitCloseRecord.retryDelay`, `FieldWriteClassifier`/`FieldWriteGate.retryCeiling`. **Direct supabase-swift PostgREST insert** — `SupabaseFieldWriteGateway` (`apps/mobile/Capture/Capture/Services/Sync/SupabaseFieldWriteGateway.swift:65-70`) `client.from("project_time_entries").insert(request).execute()`. Drain triggers: once per owner per launch/reconnect via `RootView.reconcileQueues` (`Features/Root/RootView.swift:432`) and immediately on tap. Wired in `AppContainer.swift:73-174`; nil in mock mode ("`TimeEntryGateway` has no mock conformer").

**Spec:** `docs/design/field-companion/field-companion-package.md` §9.5–9.6 (1403-1436) — "FC-R3: one act writes both rows — the Visits block is the record, the Hours entry is its billing shadow." Wave 4 of Field Companion.

**Tests:** `CaptureTests/VisitReviewTests.swift` (19 tests), `FieldVisitCloseRecordTests.swift` (30 tests). No UI tests touch time entry.

**Widgets / Live Activities / Intents / Watch / background.**
- WidgetKit: no widget target. `apps/mobile/Capture/CaptureWidgets/` and `CaptureShareExtension/` exist on disk but are **empty and absent from `Capture.xcodeproj/project.pbxproj`**. Four real targets: `Capture`, `CaptureKit`, `CaptureKitMocks`, `CaptureTests`.
- ActivityKit: exists for **offline-sync status only** — `CaptureSyncAttributes` (`CaptureKit/LiveActivity/CaptureSyncAttributes.swift`), driven by `CaptureLiveActivityController`. No widget bundle renders it; only the system fallback. `elapsedSeconds` is display-only.
- App Intents / Shortcuts / Siri: none. Apple Watch: none. `BGTaskScheduler`: none. `UNNotificationAction`: none in Capture.
- The Patina client app has a widget target (`PatinaWidget`, house widget) — unrelated to time.

**Navigation shell** — `Features/Root/RootView.swift`: two peer realms, not a tab bar — `FieldRealm.camera` and `.work` (`CaptureKit/Navigation/FieldRealmHistory.swift:9-11`), each a `NavigationStack` (`realmNavigation`, 279-289). Work realm → `WorkDashboardScreen` ("Today"): greeting + Camera switch (176-212); `WorkTodayBand` (Start visit / Resume / End visit / Open unplaced, 41-77); three attention sections; "Browse" grid tiles Projects, Leads, Decisions, Messages, Receiving, Site scan (335-391). **No Hours tile.** Field Companion strip (`companionSurface`, `RootView.swift:57-58,134+`; `FieldCompanionHearthView.swift`): persistent `safeAreaInset(.bottom)` bar under every non-camera screen; states hidden / collapsed / progress / expanded; action ids `FieldCompanionActionID.openVisit`/`.endVisit` (`CaptureKit/Companion/FieldCompanionPresentation.swift:51-54`) — the enum has exactly two cases. No floating action button.

**Auth + project context** — `SessionProviding` (`CaptureKit/Session/SessionProviding.swift:57-93`): `userID`, `workspaceID` (== `organizations.id`), `workspaceName`, `userEmail`, `displayName`. `CaptureOwnerIdentity` (userID+workspaceID). `CaptureSessionContextStore` (`CaptureKit/Session/CaptureSessionContext.swift`): UserDefaults-backed (app group `group.cloud.patina.field`, key `capture.session-context.v1`) — `routing.projectID/projectName/projectRoomID/room/shelf`, visit `kind`, `startedAt`, `label`. `V4VisitReviewScreen.load()` reads it (415).

**Patina (client app):** confirmed absent — zero hits for time entry, timesheet, billable, rates.

**Xcode:** `Capture.xcodeproj` generated by `Capture/scripts/generate_project.rb`; `IPHONEOS_DEPLOYMENT_TARGET = 18.0`; `supabase-swift 2.55.1`, `posthog-ios 3.70.1`.

**User flow today (Field):** work with an open visit tied to a project → tap End visit → Visit review → if project + owner resolve, "Log 1h 20m as a site visit" → one tap writes the outbox record and drains (offline-safe) → row lands with `activity='site_visit'`, `source='field_visit'`, auto notes → "Logged." → Done. No manual entry, no duration edit, no activity picker, no timer, no past entries, no weekly totals, no rate.

**Gaps + friction (Field).** No manual/ad-hoc entry (only vocabulary is `site_visit`); no visibility; non-editable wall-clock duration (a forgotten visit inflates hours); offer vanishes if no project attached; no Live Activity/widget/intent surface for time; server model far more capable than the client uses.

**Attachment points.** (1) Field Companion strip + `FieldCompanionActionID` — add `logHours`. (2) Work dashboard Browse grid — a 7th tile. (3) Visit review offer — extend into an editable form. (4) `CaptureSessionContextStore` + `SessionProviding` — already hold project/user/workspace. (5) `VisitCloseOutboxDrainer`/`FieldVisitCloseRecord` outbox pattern — reuse for a manual entry record type.
