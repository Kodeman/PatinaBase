# Decision System — Consolidated Detailed PRD

## 1. Header

**Area**: Decision System (designer↔client bounded-choice + approval engine, generalized into Project Coordination)

**Per-sub-feature status**:

| Sub-feature | Status |
|---|---|
| Core decision compose/resolve/e-sign (legacy `/portal` zone) | Shipped |
| FF&E feed-through on decision resolve (non-blocking, auto-create) | Shipped |
| FF&E substitution-in-place (blocking decision updates gated line) | Planned |
| Decision override (designer-recorded consent) | Shipped |
| Decision reminders / overdue expiry (edge fns + cron) | Shipped |
| Decision notifications (in-app log) | Partial (email leg exists for resolved/reminder/overdue; no general notification-center fan-out) |
| Per-decision comment thread (legacy `/portal`) | Shipped |
| The Document — margin `DecisionBody` | Shipped |
| Project Coordination (Track 5: RFI/submittal/sign-off/punch, ball-in-court, task dep web) | Shipped |
| Proposal signing folded into decisions (`sign_proposal`) | Shipped |
| Offline (paper) signature (`record_offline_signature`, R92) | Partial — ⚠ migration `00254` on prod DB, designer-portal UI unmerged (branch `the-document/offline-signature`), not reachable end-to-end on prod |
| GC/vendor party logins | Planned (`project_parties.profile_id` nullable, deferred R46) |
| Punch↔PO linkage | Planned (Track 5 TODO) |
| iOS decision surfaces | Shipped |
| Chrome extension "send capture as decision option" | Shipped |

**Last reconciled**: 2026-07-06

**Source docs**:
- `docs/code-review/patina-decision-delivery-plan.md`
- `docs/design/the-document/the-document-decision-composer-package.md`
- `docs/design/the-document/DECISIONS.md`
- `docs/design/the-document/patina-decision-system-prototype.html`
- `docs/specs/Redesign/patina-decision-workflow-design.html`
- `docs/design/the-document/portal-vs-desk-feature-gap-matrix-v2.md`
- `docs/design/the-document/the-document-parity-backlog-2026-07.md`
- `docs/design/the-document/the-document-needs-ruling-2026-07.md`
- `docs/engineering/patina-cloudflare-plan.md` (current platform dependencies)

## 2. Overview

The Decision System is how a designer poses a bounded choice or approval to a client and gets an auditable, consented answer that ripples through procurement. A designer composes a decision (title, context, due date, phase link, blocking flag) with options carrying price/qty/image/swatch/designer-note/recommended-pick; the client reviews and e-signs one option, or the designer records consent on the client's behalf (override). Resolving a decision runs a one-transaction cascade: it clears FF&E blocks, drops the winning product onto the FF&E schedule, and notifies the designer.

Track 5 (Project Coordination) generalized "a decision with an owner" in place: a third orthogonal axis `coordination_kind` (selection | rfi | submittal | signoff | punch) plus a ball-in-court (designer | client | gc | vendor) and a task dependency web, so an RFI/submittal/sign-off/punch is the same row resolved through the same path. Proposal signing is also folded in (signing writes an approval decision).

**Primary users**: interior designers (compose/resolve) and their clients (review/e-sign).

**Where it lives in the product**: three homes —
1. The legacy `/portal/decisions` zone (designer) + `/decisions` (client portal).
2. The Document's margin `DecisionBody` + coordination band (behind the `the-document-pilot` flag, now the designer default).
3. Native iOS + Chrome extension surfaces.

Decisions are pure Supabase (public schema RPCs + RLS) — no Prisma/NestJS involvement.

## 3. As-Built Architecture

### Data + resolve engine (public schema, Supabase)

Core table `client_decisions` (created `00062`) is the spine, widened over time with three orthogonal axes (`decision_type`, `decision_kind`, `coordination_kind`). Resolution runs through SECURITY DEFINER RPCs so a client with no INSERT rights can still settle a decision.

- **`apply_decision(p_decision_id, p_selected_option_id, p_selected_by)`** — `supabase/migrations/00085_decision_feedthrough_rpc.sql`, extended by `00175` (FF&E feed-through) and touched by `00185`. Marks the decision `responded`, flags the winning option, clears `project_ffe_items.blocked_by_decision_id`, and (for a `non_blocking` decision whose winning option has a `product_id`) auto-creates one FF&E line with `source_decision_id` provenance (idempotent via UNIQUE partial index).
- **Status-transition guard** — `00171_decision_status_guard_and_events.sql`: BEFORE-UPDATE trigger `guard_decision_status_transition` enforces `draft→pending→responded|expired`, `responded→pending`, `expired→pending`; every status change writes a `decision_events` audit row.
- **Track 5 resolve** — `resolve_coordination_item` (`00218`) dispatches by `coordination_kind`; `selection` delegates to `apply_decision`; the same transaction clears FF&E blocks, flips `project_tasks` blocked→todo, and shifts the court. Authz via `may_resolve_coordination_item`.

### Hooks (data layer)

`packages/supabase/src/hooks/use-decisions.ts` (24 exports): `useAllDecisions`, `useDecision`, `useDecisionsByProject`, `useClientDecisions`, `useDecisionMetrics`, `useCreateDecision`, `useUpdateDecision`, `useUpdateDecisionStatus`, `useDeleteDecision`, `usePublishDraftDecision`, `useDecisionRealtime`, `useSelectDecisionOption` (client e-sign → writes `client_consent_method`/`client_signature`/`client_consented_at`, then `apply_decision`, then `notify_decision_resolved`), `useApplyDecisionOverride`, `useDecisionOverrides`, `useDecisionComments` (+create/update/delete), `useSendDecisionReminder`, `useMarkDecisionViewed`, `useDecisionAnalyticsByType`/`ByClient`/`BottleneckPhases`. Plus `useMaterializeDraftOptions` (Library→options seed) and `DecisionOptionBuilder` (shared composer widget).

`packages/supabase/src/hooks/use-coordination.ts` (14 exports): `useCoordinationItems`, `useCourtSummary`, `useProjectParties`, `useItemRevisions`, `useResolveCoordinationItem`, `useCreateCoordinationItem`, `useNudge/Extend/Reassign/SubmitCoordinationRevision`, `useCoordinationRealtime`, `useUpdate/Publish/DeleteCoordinationItem`.

Client portal thin re-exports: `apps/client-portal/src/hooks/use-decisions-client.ts`.

### Two front-ends over one data layer

- **Legacy `/portal` zone** — full CRUD + record/override/reminder/analytics/per-decision comment thread (`decision-comment-thread.tsx`, `override-decision-modal.tsx`, `decision-option-builder.tsx`, `decision-new-picker.tsx`).
- **The Document** — margin `DecisionBody` (`components/document/margin-bodies.tsx`, enriched per R56/I38) + the coordination band (`components/document/coordination/*`: `court-bar`, `open-item-sheet`, `item-composer` [the R55 composer, I37], 6 `item-resolve/resolve-*` panels, `task-dep-line`). Lifecycle edges are pure predicates in `lib/document/decision-edges.ts` (R87: `extendRevivesDecision`, `canDeleteDecision`) shared by the surfaces and their tests. Derivation in `lib/document/coordination-derivation.ts`.
- **Proposal signing folded in** — `sign_proposal` (`00210`) / `record_offline_signature` (`00254`) each write an `approval` `client_decisions` row and activate the project.

## 4. Data Model

### Core tables

- **`client_decisions`** — `00062_client_management_v2.sql`. Status CHECK `draft|pending|responded|expired` (00062). Columns accreted:
  - `decision_type` `00064` (`product` default), CHECK widened by `00084` → `material|color|product|layout|substitution|budget|approval`.
  - `blocking_status` `00064` → `blocks_procurement|blocks_phase|non_blocking`.
  - `designer_id`, `linked_proposal_id`, `sent_at`, `responded_at`, `viewed_at`, `reminder_sent_at`, `selected_by` — `00064`.
  - `room_id` FK→`project_rooms` (ON DELETE SET NULL) — `00172`.
  - `client_consent_method` / `client_signature` / `client_consented_at` — `00117` (CHECK `electronic_signature|click_through`; `paper` added by `00254`).
  - `decision_kind` (`choice|approval`) + `section_key` — `00202`.
  - `coordination_kind` (`selection|rfi|submittal|signoff|punch`), `court` (`designer|client|gc|vendor`), `court_party_id`, `blocks_kind`, `answer` — `00213` (backfills `decision_kind='approval'` → `coordination_kind='signoff'`).
- **`client_decision_options`** — `00062`; `price`+`quantity` `00064`; `product_id` FK→`products` (ON DELETE SET NULL) `00172`.
- **`decision_events`** — `00171` (status-change audit).
- **`decision_overrides`** — `00090` (designer-records-consent; `consent_method` `verbal|written|text_excerpt|email_excerpt` + `consent_evidence`).
- **`decision_comments`** — `00091` (inline per-decision discussion, both parties).
- **`decision_notifications`** — `00173` (in-app notify log + `decision_notification_kind` enum; SECURITY DEFINER inserts, per-user RLS; modeled on `procurement_notifications`).

### Track 5 (coordination) tables

- **`project_parties`** — `00212` (tracked GC/vendor/client-rep/other courts; `profile_id` NULLABLE = no login v1; optional `vendor_id`).
- **`coordination_item_revisions`** — `00214` (submittal Rev-N history; writes RPC-only).
- **`project_tasks`** dependency web — `00215`: `owner`/`owner_party_id`, `blocked_by_item_id`→`client_decisions`, `seq_after_task_id` (status CHECK unchanged; effective-blocked is read-side).
- **`comms_threads.coordination_item_id`** — `00216` (one-thread-per-item, R50).
- **`project_ffe_items.source_decision_id`** — `00175` (+ UNIQUE partial index; distinct from pre-existing `blocked_by_decision_id`).

### RPCs / triggers / views

- `apply_decision` `00085` (+`00175`/`00185`); `guard_decision_status_transition` trigger `00171`.
- `notify_decision_required` / `notify_decision_overdue` / `notify_decision_resolved` `00173`; `notify_decision_updated` + resolved-email trigger + overdue-cron re-point `00174`.
- `resolve_coordination_item` + `may_resolve_coordination_item` + `submit_coordination_revision` `00218` (the `coordination_item_revisions` table is `00214`, but the write RPC ships in `00218`).
- `sign_proposal` + `request_proposal_change` `00210`; `record_offline_signature` `00254` (both mint an `approval` decision + activate project via `activate_proposal_as_project` `00199`).
- Views (security_invoker, recompute on read): `coordination_court_summary`, `task_blocked_state` `00219`; `margin_items` enriched with `coordination_kind`+`court` `00219`; `document_state` gains `items_in_your_court`/`open_items_count` `00219`.
- Crons: `decision-reminders-daily`, `expire-decisions-daily` `00092` (overdue path re-pointed to the edge fn by `00174`).

### RLS

Designer-owns-decision (via `designer_clients` join / `designer_id = auth.uid()`) reads+manages; addressed client reads. Coordination RLS `00217`; `project_parties` RLS narrowed to `profile_id = auth.uid()` (cross-party read via a DEFINER helper) after a live-walk fixed a `42P17` self-EXISTS recursion (⚠ see MEMORY `5635633c`).

## 5. API / Edge / Service Surface

### Edge functions (`supabase/functions/`)

- **`decision-reminders`** — daily (cron `00092`); pending decisions due within 48h & not yet reminded → routes through the notification center (`notify_decision_required` in-app + `sendCompliantEmail` chokepoint with suppression/rate-cap/unsubscribe/preference checks). Rewritten from direct-Resend in Wave 2 T2.
- **`decision-resolved-notify`** — invoked by the `00174` AFTER-UPDATE trigger on the `pending→responded` edge; adds the email leg to the owning designer (in-app row already lands synchronously from the hook).
- **`expire-decisions`** — cron/manual; fires `decision_overdue` for lapsed-but-pending rows then expires past the grace. Coordination-kind agnostic (per `00220` audit, RFI/submittal/signoff/punch are first-class in all notify RPCs with no new plumbing).

No dedicated coordination edge functions — `00220` is an intentional NO-OP documenting that the existing decision notify/overdue/resolved path already covers all five coordination kinds.

### RPC surface (callable from clients)

`apply_decision`, `resolve_coordination_item`, `submit_coordination_revision`, `notify_decision_required|overdue|resolved|updated`, `sign_proposal`, `request_proposal_change`, `record_offline_signature`. All `GRANT EXECUTE … TO authenticated`; SECURITY DEFINER where a client lacks base-table INSERT.

### No NestJS/edge-runtime services

Decisions are pure Supabase (RPC + RLS + realtime). The 3 retained NestJS services (orders/media/projects) are not in this path.

## 6. UI Surfaces

### Designer portal — legacy `/portal` zone (`apps/designer-portal/src/app/(portal)/portal/decisions/`)

- `decisions/page.tsx` — list with metric blocks + filters (open/overdue/due-this-week/resolved) + help-system layers.
- `decisions/[decisionId]/page.tsx` — detail: Edit/Delete/Publish-draft, Extend deadline, override-consent, send reminder, live `useDecisionRealtime`, resolution/override audit, per-decision Discussion thread.
- `decisions/[decisionId]/edit/page.tsx` — edit reusing `DecisionOptionBuilder`.
- `decisions/analytics/page.tsx` — by-type / by-client / bottleneck-phase analytics.
- `clients/[id]/decisions/new` (composer); `projects/[id]/decisions`.
- Components: `components/portal/decision-card.tsx`, `decision-new-picker.tsx`, `decision-option-builder.tsx`, `override-decision-modal.tsx`, `decision-comment-thread.tsx`, `phase-decisions.tsx`, `project-detail/decisions-panel.tsx` + `decision-composer-modal.tsx`, `procurement/blocked-by-decision-notice.tsx`.

### Designer portal — The Document (`the-document-pilot`, now default)

- Margin `DecisionBody` in `components/document/margin-bodies.tsx` (+ `margin-rail.tsx`) — enriched inline-unfold sheet with context, full option attributes, audit trail; keeps override-consent/nudge/extend at the act site (§5 one-act invariant).
- Coordination band `components/document/coordination/`: `coordination-band`, `court-bar`, `court-group`, `open-item-row`, `open-item-sheet`, `item-composer` (R55 create surface for all 5 kinds), `composer-option-builder`, `task-dep-line`, `coordination-work`, and 6 `item-resolve/resolve-{selection,rfi,submittal,signoff,punch,waiting}.tsx`.
- `lib/document/decision-edges.ts` (R87), `lib/document/coordination-derivation.ts`.

### Client portal (`apps/client-portal/src/`)

- `app/decisions/page.tsx` (list) + `app/decisions/[id]/page.tsx` (detail).
- `components/decision-card-client.tsx`, `components/decisions/DecisionConsentBlock.tsx` (e-sign: typed-name ≥2 chars + agree checkbox → `electronic_signature`), `components/decisions/coordination-banner.tsx`, `components/timeline/milestone-decisions.tsx`.

### iOS (`apps/mobile/Patina/Patina/Features/Decisions/`)

`DecisionListView`, `DecisionDetailView`, `DecisionsViewModel`, `DecisionPushHandler`, `Core/Network/DecisionsAPIClient.swift` — list → detail → option-select → consent + push handling (Wave 2 T4).

### Chrome extension (`apps/extension/src/`)

`overlays/DecisionSheet.tsx` + `components/DecisionTargetSelector.tsx` — "send capture as decision option" with project/room context + `product_id` linkage (Wave 2 T5).

## 7. Reconciliation & Gaps

⚠ **Migration-number drift** — Delivery plan reserves `00174_decision_seed_linkage.sql (optional)` for dev seed backfill, but the shipped `00174` is `decision_resolved_email_and_overdue_cron.sql` (resolved-email trigger + overdue-cron re-point). The reserved number was repurposed; seed linkage folded into the spine/seed instead.

⚠ **Missing source doc** — Delivery plan `patina-decision-delivery-plan.md` (line 5) cites source review `docs/decisions/patina-decision-system-completion.html` — that file does NOT exist in the repo (missing/never committed or removed).

⚠ **Stale gap plan** — Delivery plan cluster D lists iOS ("API client but no UI") and extension ("can't create a decision") as open gaps; both are now BUILT (iOS `Features/Decisions/*` full list→detail→consent; extension `DecisionSheet`+`DecisionTargetSelector`). The plan text is stale on the surfaces it planned.

⚠ **Delete-lifecycle divergence** — Composer package (R55) lists "delete (destructive)" as part of the decision lifecycle, but the shipped Document surface makes delete draft-only (`decision-edges.ts` `canDeleteDecision` → `status === 'draft'`, ruled R87). Post-publish delete survives only in the legacy `/portal` detail page. (Tracked as parity item DEC-03.)

⚠ **Composer surface diverged from plan** — Composer package framed R55 as a NEW decision-composer sheet; as-built (I37) generalized Track 5's existing `item-composer.tsx` + `useCreateCoordinationItem` instead of building a separate composer — "one create-surface, one resolve-path." The `patina-decision-system-prototype.html` standalone-composer depth differs from the shipped generalized composer.

⚠ **Dead status vocabulary** — `apply_decision` (`00085`) guards on `status NOT IN ('pending','open','draft')`, but the `client_decisions` status CHECK (`00062`) never defined an `'open'` value — the `'open'` branch in the RPC is dead/legacy vocabulary.

⚠ **Unused consent mode** — `client_consent_method` CHECK (`00117`) admits `'click_through'`, but the client portal's `DecisionConsentBlock` only ever emits `'electronic_signature'` (and the offline path emits `'paper'`); the `click_through` consent mode is defined but unused in any shipped UI.

⚠ **Two discussion models coexist** — Discussion model diverges by home: composer package (R56) states discussion is the project comms thread (R27) + one-thread-per-item (R50) with "no per-decision feed," yet the legacy `/portal` detail page still renders a per-decision `decision_comments` feed (`decision-comment-thread.tsx`, table `00091`). This has not been reconciled.

## 8. Forward Roadmap / Open Requirements

| Item | Priority |
|---|---|
| Deploy the app tier for `record_offline_signature`: merge branch `the-document/offline-signature` and redeploy the designer portal so the paper-signature RPC (already on prod DB via `00254`) is reachable end-to-end. | P0 |
| Build the FF&E substitution-in-place path for BLOCKING decisions (the unbuilt half of `00085`/`00175`) so an approved substitution updates the gated line rather than only unblocking it. | P1 |
| Rule + implement DEC-03 (post-publish decision delete from the Document) and reconcile the two discussion models (per-decision `decision_comments` vs comms-thread) into one. | P1 |
| Deploy the proposal-nudge edge function (`00231`) and confirm the decision edge fns are in the current edge-runtime image; the AE prod push left proposal-nudge undeployed. | P1 |
| Fold Tracks/rulings R61–R92 (esp. R92 offline signature) into a spec v1.7 cut; the log currently outruns the spec (last folded v1.5, through `00220`). | P2 |
| Land GC/vendor party logins (flip `project_parties.profile_id` path) and the punch↔PO link deferred from Track 5. | P2 |
| Remove dead `'open'` status vocabulary from `apply_decision` and either wire or drop the unused `click_through` consent mode. | P2 |

## 9. Status & Deploy

**On main**: Everything through `00220` (core spine `00171`–`00175` + coordination `00212`–`00220`), plus `00210` sign_proposal and the `00254` offline-signature migration. All decision hooks, both portals, iOS, and extension surfaces are on main. The Document is the designer default (the `/portal→/desk` flip). The offline-signature *designer-portal UI* is the exception — it is on unmerged branch `the-document/offline-signature`.

**Production status:** Historical notes record the core decision and Track 5 database rollout, but they are not proof of current portal or Edge Function state. Verify Strata migrations and each function live. Deploy changed functions with `supabase functions deploy <name>` and portals through `infra/deploy-portal.sh`.

**Net**: the decision engine + coordination are fully live on prod; `record_offline_signature` is present in the DB but not reachable from the prod UI.

## 10. Superseded Sources

- `docs/code-review/patina-decision-delivery-plan.md`
- `docs/design/the-document/the-document-decision-composer-package.md`
