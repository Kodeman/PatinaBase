# CODEBASE-MAP — The Document · Slice 0 audit

**Date:** 2026-06-11 · **Status:** for review — approve/edit the mapping tables in §4 and §5, rule on §10
**Inputs:** full route/nav audit, migration-level schema audit (through 00187), procurement/FF&E flow audit, proposals/decisions/comms/billing audit, cross-cutting infra audit (time, tokens, flags, shadows).
**How to read this in 15 minutes:** §1 headline findings → §4 + §5 mapping tables (the things to approve) → §10 conflicts needing rulings. Everything else is reference.

---

## 1. Headline findings

1. **There is no single `projects.stage` spanning the document's seven sections.** The lifecycle is split across three entities: `designer_clients.status` (lead → proposal → active → completed → nurture), `proposals.status` (draft → sent → viewed → accepted/declined/expired/revised), and `projects.status` + `project_phases` (a project row **only exists after signing**). Pre-signing relationships have no `projectId`, so `/doc/[projectId]` cannot address them as written. See §4 and ruling **O1**.
2. **A time system already shipped** (June 2026): `project_time_entries` table, header TimerButton, stop dialog, invoice claim/release, one-running-timer-per-user constraint. It overlaps heavily with spec §9 but disagrees on granularity (minutes vs seconds), attribution (phase/task vs activity), and the sub-60s rule (current code rounds *up* to 1 minute; spec discards). See ruling **O3**. Do not build a parallel `time_entries` table.
3. **The FF&E status vocabulary is richer than the spec's stamp vocabulary** — 8 DB-enforced stages with rank-ratchet triggers (00184) vs the spec's 6 + exceptions. Spec's `received` = codebase `delivered`. `extended` and `returned` have no codebase equivalent. See §5 and ruling **O2**.
4. **Weekly Pulse does not exist in any form.** The closest thing (notification digest edge function) is a per-user notification rollup, not a per-project client-facing pulse. Entirely net-new: table + draft pipeline + margin rendering.
5. **D4 (zero shadows) collides with D7 (old zones untouched):** 111 `shadow-*` usages in `apps/designer-portal/src` and 115 in `@patina/design-system` (whose Dialog/Popover/Command primitives ship shadows). An app-wide CI-blocking ban in PR 1 would force touching old zones. See ruling **O4**.
6. **The portal has grown well beyond the five zones the design sessions saw.** 8 nav zones + ~102 portal pages. Aesthete (Teaching + Aesthete Engine), Insights, Portfolio, Resources, Team, Reviews, Nurture have **no home in the Document model**. See ruling **O5**.
7. **Good news:** Order Assistant exists by exactly that name and is cleanly mountable; the three-layer Library is self-contained and sheet-ready; the brand tokens in `apps/designer-portal/src/app/globals.css` already define the spec's exact hexes as `--color-*` vars; Playfair/Inter/DM Mono are already loaded; the PostHog feature-flag mechanism (with env override) is proven by the procurement pilot.

---

## 2. The portal today

**Stack reality check vs spec/CLAUDE.md:** this repo is **patina-merged** with `@patina/*` packages and **React 19** (spec says "strata monorepo", `@strata/*`, React 18). Cosmetic, but corrected wherever it matters.

### Zones (nav config: `apps/designer-portal/src/config/navigation.ts`)

| Zone | Routes (representative) | Old-nav → Document mapping (spec §3, extended) |
|---|---|---|
| Today | `/portal` (greeting, metrics, overdue decisions, leads, active projects, procurement card) | → **Desk** |
| Pipeline | `/portal/pipeline`, `/leads`, `/proposals/*` (9 sub-routes), `/projects/*` (13 sub-routes), `/rooms` | → Desk arrangement + document sections |
| Procurement (flag-gated) | `/portal/procurement/{by-vendor, by-status, calendar, receiving}` | → line stamps + **Orders ledger** |
| Products | `/portal/library/{personal,studio,catalog,search}`, `/catalog/*`, `/vendors/*` | → **Library ledger** (vendors: see O5) |
| Clients | `/portal/clients/*`, `/reviews`, `/nurture`, `/decisions/*` | → **People ledger** + decision margin items |
| Billing | `/portal/billing/{invoices,ar}`, `/earnings`, `/time` | → **Accounts ledger** + invoice margins + **Hours ledger** |
| Messages | `/portal/messages/*` (+ overlay panel) | → message margin items + Desk |
| Aesthete | `/portal/teaching/*`, `/companion` | → **no home — O5** |
| (un-zoned) | `/insights`, `/portfolio`, `/resources`, `/team`, `/inbox`, `/settings/*`, `/help/*` | → **no home — O5** |

~102 portal pages total. Post-login default is `/portal` (hardcoded in `src/middleware.ts`).

### Chrome that exists (all in `src/components/portal/`)

- `top-bar.tsx` (zone tabs) · `sub-nav.tsx` (tabs/breadcrumbs; UUID→name resolution) · `library-layer-nav.tsx`
- `utility-bar.tsx`: QuickCreateMenu, **TimerButton**, ⌘K search, NotificationDropdown, Help, Messages overlay, AccountMenu
- `command-palette.tsx` — already jumps to decisions and start/stop timer; natural seed for the spec's ⌘K contract
- `mobile-tab-bar.tsx` — bottom-fixed zone tabs (mobile); will coexist with the drawer strip during phase-in

---

## 3. Schema inventory (what the Document reads)

All in the `public` schema via `@patina/supabase` hooks unless noted. Key status vocabularies in **bold**.

| Domain | Tables | Key facts |
|---|---|---|
| Relationship | `designer_clients` | **lead → proposal → active → completed → nurture**; the only entity spanning the whole arc |
| Leads | `leads` (00014) | response deadlines drive "new lead" desk input |
| Proposals | `proposals` + items/phases/scope_rooms/exclusions/milestones/boards | **draft, sent, viewed, accepted, declined, expired, revised**; version chain via `parent_proposal_id`; `clone_proposal`/`send_proposal` RPCs (00176); `proposal_engagement` tracks client viewing |
| Projects | `projects`, `project_phases`, `project_rooms`, `project_team_members` | projects: **draft, active, on_hold, completed, archived**; `current_phase` ∈ PhaseSlug: **consultation, concept_development, design_refinement, procurement, installation, final_walkthrough** (`packages/types/src/phase-config.ts`); row created only by `activate_proposal_as_project` (00180) or manual `/projects/new` |
| FF&E | `project_ffe_items` | **specified → quoted → approved → ordered → production → shipped → delivered → installed** (rank-ratchet fn 00184); provenance: `source_proposal_item_id`, `source_decision_id`; blocking: `blocked`, `blocked_by_decision_id`; dual pricing `unit_price_cents` (client) / `trade_price_cents` (00185); `purchase_order_id` link |
| Procurement | `purchase_orders`, `po_payments`, `vendors`, `receiving_inspections`, `damage_claims`, `delivery_events` view | PO: **draft, confirmed, in_production, shipped, delivered, cancelled** → cascades to items (00184 triggers A–D); payments: **pending → due → paid**; inspections: **clean / damaged / partial**; claims: **drafted / vendor_notified / resolved**; atomic `create_purchase_order` + `log_po_acknowledgment` RPCs (00186) |
| Decisions | `client_decisions`, `client_decision_options`, `decision_events`, `decision_overrides` | status: **draft, pending, responded, expired** (guard trigger 00171); `blocking_status`: **blocks_procurement, blocks_phase, non_blocking** (00064); anchors: `project_id`, `phase_id`, `room_id`, `linked_proposal_id`; `apply_decision` RPC (00175) clears blocks + feeds non-blocking product wins into FF&E |
| Messages | `comms_threads`, `comms_messages`, `comms_thread_participants` | thread kinds: **direct, project, vendor_brief, support**; anchors: `project_id`, `proposal_id`, message-level `decision_id`; unread via `last_read_at`; Supabase Realtime channels for threads + inbox |
| Billing | `invoices`, `invoice_line_items`, `invoice_payments`, `invoice_counters`, `project_payment_milestones` | invoices: **draft, sent, partially_paid, paid, void**; line kinds: **milestone, time, adhoc, ffe** (00187); milestones: **pending, outstanding, paid**; `issue_invoice`/`record_invoice_payment`/`void_invoice` RPCs; Stripe checkout + webhook; `get_ffe_invoice_coverage` read model (00187) |
| Time | `project_time_entries` (00177) | `duration_minutes` (NULL = running), `phase_key`, `task_id`, `billable`, `hourly_rate_cents`, `invoice_id` + guard trigger; `project_unbilled_time` view; **one running timer per user** (unique partial index) |
| Pulse | — | **does not exist** |
| Settings | `organizations.settings` JSONB (per-org), `profiles` (per-user; has `availability_status` 00183), `notification_preferences` | no per-designer flag store today |

---

## 4. Document identity + stage→section mapping — **PROPOSAL, approve/edit**

### The identity problem (ruling O1)

Spec §1: one document per **client relationship**. Spec §3: route `/doc/[projectId]`. The codebase allows **N projects per client**, and no project row exists before signing. Proposed resolution:

- **A document = one project** once a project exists (`/doc/[projectId]`). Pre-signing, **a document = the live proposal chain** (keyed by chain root) or, before any proposal, **the lead/designer_client**. The Desk unions all three shapes; ⌘K resolves any of them.
- Sections **Brief → Proposal** of a signed document are reconstructed from the activating proposal via the provenance FKs (`proposals.project_id`, `source_proposal_item_id`, etc.).
- A client with two active projects gets two folders (tab = client surname, title distinguishes). **This is the part Leah would notice — needs the design session's blessing.**

### Stage → section state mapping

| Section | `active` when | `settled` when | Source of truth |
|---|---|---|---|
| **Brief** | lead exists, designer hasn't accepted/responded | designer accepts the lead (work begins) | `leads` + `designer_clients.status='lead'` |
| **Discovery** | lead accepted, no proposal draft yet | a proposal draft exists | `designer_clients.status='lead'` + absence of proposal |
| **Direction** | latest proposal `status='draft'` (boards/palettes/scope being composed) | proposal sent | `proposals.status` — **no dedicated "direction shared" marker exists; see O1 note** |
| **Proposal** | latest chain proposal `status ∈ (sent, viewed)` | `status='accepted'` → **SIGNED seal** (`signed_at`, `signed_by_name` exist for the seal) | `proposals` chain (supersede via `revised`) |
| **Project** | `projects.status='active'` and `current_phase ∈ (consultation, concept_development, design_refinement, procurement)` | install begins | `projects` + `project_phases` |
| **Install** | `current_phase ∈ (installation, final_walkthrough)` | phases complete / project completed | `project_phases.status` |
| **Care** | `projects.status='completed'` (permanent) | never | `projects.status` + `designer_clients.status ∈ (completed, nurture)` |

**Edge cases to bless:** (a) manually created projects (`/projects/new`, no proposal lineage) — propose Brief→Proposal render as ghost/absent, document opens at Project; (b) `projects.status='on_hold'` — propose "in motion: paused" chip, never "needs your hand"; (c) `archived` — not on Desk, reachable via ⌘K/People ledger; (d) declined/expired proposals — document stays at Proposal-active with the need line carrying the state.

---

## 5. Stamp vocabulary mapping — **PROPOSAL, approve/edit**

Spec machine: `to_order → ordered → in_production → shipped → received → installed` + exceptions `decision_due/extended`, `damaged/returned`. Codebase machine (DB-enforced, 00184): 8 ranked stages + blocking flags + inspection outcomes. **No parallel status store will be built** — stamps are a pure rendering of:

| Spec stamp | Derived from | Notes |
|---|---|---|
| `to_order` | `status ∈ (specified, quoted, approved)` and not blocked | **Collapses 3 designer-meaningful states** (spec'd / quoted / client-approved). Propose: stamp reads TO ORDER with the sub-state as the stamp's small second line. Needs blessing — O2 |
| `decision_due` | `blocked = true` (i.e. `blocked_by_decision_id` → pending decision with `blocking_status='blocks_procurement'`) | exact match |
| `extended` | **no equivalent** | decisions have `due_date` + `expired`, but no "extended" state. Propose: drop from v1 or render `expired` blocking decisions as EXTENDED — O2 |
| `ordered` | `status='ordered'` (PO draft/confirmed) | `po_number`, `acknowledged_at` available for unfold |
| `in_production` | `status='production'` | auto via PO cascade |
| `shipped` | `status='shipped'` | `confirmed_eta` available |
| `received` | `status='delivered'` | **Codebase word is "delivered"**; clean `receiving_inspections` row sets `received_quantity` and advances the PO. Stamp should read RECEIVED only after an inspection exists, else DELIVERED? Propose: RECEIVED = status delivered (inspection or not), with "awaiting inspection" as margin/unfold detail — O2 |
| `damaged` | inspection `outcome ∈ (damaged, partial)` / `damage_claims.state ∈ (drafted, vendor_notified)` | claim state shown in unfold |
| `returned` | **no equivalent** | claims resolve but nothing models a return. Propose: drop from v1 — O2 |
| `installed` | `status='installed'` | manual designer act (StageSelect today) |

Stamp **colors/labels** already exist as a canonical map: `apps/designer-portal/src/components/portal/ffe/stages.ts` (`STAGE_CONFIG`, using the brand CSS vars).

---

## 6. Margins: sources and anchoring gaps

Spec §11 wants a unified read model `{kind, anchor_kind, anchor_id, state, timestamps, payload}`. Per-kind reality:

| Kind | Source | Existing anchors | Gap (additive work) |
|---|---|---|---|
| `decision` | `client_decisions` (+options) | `project_id`, `phase_id`, `room_id`, `linked_proposal_id`; **line anchor derivable in reverse** via `project_ffe_items.blocked_by_decision_id` / `source_decision_id` | none required for v1 — anchor_kind/anchor_id computable in the view |
| `message` | `comms_threads` / `comms_messages` | thread → `project_id`, `proposal_id`; message → `decision_id` | **no line/section anchor.** Additive: `anchor_kind`/`anchor_id` on `comms_threads` (nullable; default = letterhead) |
| `invoice` | `invoices` + `invoice_line_items` | project; lines → `milestone_id` / `ffe_item_id` (00187) | anchor derivable from lines. **Auto-draft-from-stamp-trigger (spec §5: first line hits production → M2 drafts) does not exist** — net-new trigger/job |
| `pulse` | **none** | — | net-new table `weekly_pulses` (with anchor columns from day one) + Friday draft job + send → client mirror |
| `time` | `project_time_entries` | `project_id`, `phase_key` (→ section derivable), `task_id` | daily-summary margin item is a query, not a table; activity vocab — see O3 |

**One-act-many-surfaces invariant:** the plumbing pattern already exists — `apply_decision` (00175) resolves the decision, clears item blocks, and feeds FF&E in one transaction; 00184 triggers cascade PO→items→payments transactionally. Margin actions should extend these RPCs, not add sync steps. ✅ compatible.

---

## 7. The Desk query: inputs

| "Needs your hand" input | Exists today? | Source |
|---|---|---|
| Overdue/expiring decisions | ✅ (Today page already queries it) | `client_decisions` status+due_date |
| Unsigned proposals showing hesitation | ✅ data exists | `proposals.status ∈ (sent,viewed)` + `viewed_at` + `proposal_engagement` |
| New leads | ✅ (Today page) | `leads` + response deadline |
| Friday unsent Pulses (D5) | ❌ | needs `weekly_pulses` |
| Designer-flagged | ❌ | needs `desk_flags` (spec §11 anticipates this) |
| "In motion" chips | ✅ derivable | PO/payment/phase movement since last open |

---

## 8. Drawer ledgers ↔ existing surfaces

| Ledger | Re-homes | Readiness |
|---|---|---|
| Library | three-layer library (`library-layer-nav.tsx`, `@patina/catalog-ui`, `useLayerCounts`, cross-layer search) | **High** — self-contained, only needs pathname-independent active-layer state to live in a sheet |
| Orders | procurement by-vendor / by-status / calendar / receiving views + Order Assistant | **High** — all cross-project already; components are page-shaped, need sheet re-wrapping |
| Accounts | billing invoices / A/R / earnings + Stripe flows | **Medium** — page-shaped |
| People | clients directory + designer_clients lifecycle (vendors: ruling O5) | **Medium** |
| Hours | `/portal/time` + `use-time-tracking.ts` hooks | **Medium** — subject to O3 |

---

## 9. Reusable components (spec §13 call-outs)

- **Order Assistant** — exists by name: `src/components/portal/procurement/order-assistant.tsx`. Slide-in panel, fully props-driven (`vendor`, `project`, `ffeItems`, callbacks), 4-step flow ending in the atomic `create_purchase_order` RPC, already decision-block aware. **Mounts inside a line unfold with minimal change.**
- **Mobile Receiving** — ⚠️ **does not exist under that name on web.** Desktop has `log-inspection-drawer.tsx` (outcome + notes only); the photo-rich receiving log lives in the **iOS app**. The line unfold can mount LogInspectionDrawer; "Mobile Receiving" re-homing is an iOS-side question. Flagged in DECISIONS.
- **Proposal builder** — full editor suite (`/portal/proposals/*`, scope-builder, canonical blocks). The settled-Proposal unfold can render the canonical block components read-only; the signing seal has real data (`signed_at`, `signed_by_name`, `signed_ip`).
- **Three-layer Library** — self-contained (see §8).
- **FF&E kit** — `src/components/portal/ffe/*`: `FFEItemCard`, `StageSelect` (with PO-sync badge), forms, `stages.ts` config; all presentational. The Project section's table can be built from these. Query keys unified on `['project-ffe-items', projectId]` + `['procurement-items']` with shared invalidation.
- **Time system** — `src/components/portal/time/*` + `src/hooks/use-time-tracking.ts` (see O3).
- **Command palette** — exists with decision + timer commands; extend to documents/sections/lines/ledgers per spec §3.
- **Presence** — no Supabase presence used anywhere yet (comms uses Realtime *channels*; the projects NestJS service has a separate socket.io presence system used for project events). Spec's per-document Supabase Realtime presence is net-new but the client infra exists. Don't double-build against the socket.io system.
- **Brand tokens** — `apps/designer-portal/src/app/globals.css` defines the spec's exact hexes (`--color-clay: #C4A57B`, `--color-mocha`, `--color-sage`, `--color-dusty-blue`, `--color-terracotta`, `--color-golden-hour`, …). This is the token source for Document work — **not** `@patina/design-system/tokens/colors.ts`, which holds different (OKLCH) values. Fonts (Playfair Display, Inter, DM Mono) already loaded in the root layout. **"Strata Mark":** no such component/asset exists — net-new primitive (and the name needs deciding in a Patina-branded repo).

---

## 10. Conflicts — open design rulings (mirrored in DECISIONS.md)

| # | Conflict | Blocks |
|---|---|---|
| **O1** | Document identity: per-client-relationship (spec §1) vs per-project (`/doc/[projectId]`, spec §3) vs codebase reality (N projects per client; no project row pre-signing; manual projects with no proposal lineage). §4 carries the proposed resolution. | Slice 1 (Desk folders need identity) |
| **O2** | Stamp vocabulary: collapse of specified/quoted/approved into `to_order`; `received` vs `delivered` wording; `extended`/`returned` have no data. §5 carries the proposed resolution. | Slice 1 (folder need-line stamps), Slice 2 |
| **O3** | Time system: spec §9 `time_entries` vs shipped `project_time_entries` (minutes vs seconds; min-1-minute round-up vs sub-60s silent discard; phase/task attribution vs activity vocabulary; no `raw_seconds`/`idle_seconds`/`source`/`section` columns; existing TimerButton UX is manual-start vs D11 auto-start). Proposal: extend the existing table additively, never fork. | Slice 5 (and the drawer "In hand today" readout) |
| **O4** | D4 (zero shadows, app-wide, CI-blocking in PR 1) vs D7 (old zones untouched): 111 existing portal usages + design-system primitives ship shadows. Proposal: CI-blocking lint scoped to Document surfaces (`/desk`, `/doc`, document components) + `shadow-none` overrides on reused primitives; widen to app-wide at the dissolve step. | Slice 1 PR (lint rule scope) |
| **O5** | Zones with no Document-model home: Aesthete (Teaching + Engine), Insights, Portfolio, Resources, Team, Reviews, Nurture; plus vendor directory placement (People vs Orders ledger). These survive the phase-in untouched (D7) but need a destiny before the default flip. | Slice 6 / default flip |

---

## 11. Additive schema work this implies (not built yet — preview)

1. `weekly_pulses` (kind `pulse` margin source; anchor columns built in).
2. `desk_flags` (designer pins) and `designer_interruption_rules` (D2, ships empty) — spec §11 already anticipates both.
3. `comms_threads.anchor_kind` / `anchor_id` (nullable; letterhead default).
4. `project_time_entries` extensions per O3 ruling (e.g. `source`, `activity`, `raw_*`, idle annotation) — **after** the ruling.
5. A `margin_items` Postgres view (query-layer union over decisions/threads/invoices/pulses/time).
6. Possibly a `document_state` view encapsulating the §4 section derivation so Desk + spine + ⌘K share one source.

Zero destructive changes; old zones keep functioning (D7). ✅

---

## 12. Mechanics decided at audit (implementation-level, noted in DECISIONS.md)

- **Feature flag:** PostHog flag (proposed name `the-document-pilot`) via existing `useFeatureFlag` hook — fail-closed, with the existing `NEXT_PUBLIC_FLAG_OVERRIDES` env override satisfying the spec's "env override" requirement. Same pattern as `procurement-workspace-pilot`. (Local dev needs `NEXT_PUBLIC_POSTHOG_ENABLE_IN_DEV=true` or the env override.)
- **D4 enforcement vehicle:** no stylelint exists in the repo; designer-portal uses ESLint v9 flat config. Plan: ESLint `no-restricted-syntax` rule matching `shadow-*` class strings + `box-shadow`/`drop-shadow` in any CSS under the Document directories, wired into `pnpm lint` (CI-blocking). Scope per ruling O4.
- **Shared primitives placement:** Stamp/StrataMark/StackedPaper/MarginItem/LedgerSheet follow the catalog precedent — portal-local first, promote to a `@patina/*` package (catalog-ui pattern) when the client portal mirrors need them.
