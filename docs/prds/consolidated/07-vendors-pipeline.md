# Vendors & Pipeline — Consolidated As-Built PRD

## 1. Header

**Area:** Vendors & Pipeline

**This is not one feature — it is four distinct as-built domains** that source docs describe separately and sometimes conflate. Status is reported per sub-feature:

| Sub-feature (domain) | Status | Notes |
|---|---|---|
| A. Admin Manufacturer Pipeline (Cowork) | **Shipped** | Fully built (schema, API, UI), but inert in practice — no external Cowork agent is running and no `pipeline_vendors` data is seeded |
| B. Designer Vendor Directory | **Partial** | Core browse/save/review UI ships; the trade-account sub-surface queries non-existent tables and is broken |
| C. Vendor Nomination → Catalog Onboarding | **Partial** | Designer nomination + admin triage state machine shipped; manufacturer-portal onboarding form is an explicit placeholder; outreach email unbuilt |
| D. Designer Engagement Pipeline (Lead → Proposal → Active → Completed) | **Shipped** (Path A only) | Designer-initiated capture/discovery/nurture works end-to-end; homeowner/marketing lead intake (Path B) was never built |

**Last reconciled:** 2026-07-06

**Source docs:**
- `docs/prds/vendor-pipeline-prd.md`
- `docs/prds/patina-admin-vendor-pipeline.html`
- `docs/prds/cowork-vendor-pipeline-instructions.md`
- `docs/prds/pipeline-lead-intake.md`
- `docs/prds/founding-circle-pipeline.html`
- `docs/specs/_active/vendor-management.md`
- `docs/implementation/vendor-management/progress.md`

## 2. Overview

"Vendors & Pipeline" is the umbrella term used across the docs for four separate systems that happen to share the words "vendor" and "pipeline." Reconciling them into one PRD is the point of this document, since the biggest source of confusion historically has been that domain A and domain B both talk about "vendors" but operate on entirely different tables (`pipeline_vendors` vs `vendors`).

**A. Admin Manufacturer Pipeline (Cowork).** Tracks furniture manufacturers moving through `discovery → live partnership`, scored on an 8-dimension rubric, integrated with an external "Claude Cowork" automation agent via a shared task-queue table.
- Primary users: Kody (ops, rubric dimensions 1–4) and Leah (taste review, dimensions 5–8).
- Lives at `admin.patina.cloud/pipeline`.

**B. Designer Vendor Directory.** A designer-portal browse/save/review surface over the catalog-side `vendors` table (trade programs, reviews, saved vendors).
- Primary user: the designer sourcing furnishings for a project.
- Lives at `app.patina.cloud/portal/vendors`.

**C. Vendor Nomination → Catalog Onboarding.** A three-party flow: a designer nominates a maker to the Patina catalog, an admin triages the nomination through a server-enforced state machine, and the maker follows an email CTA to a (currently placeholder) manufacturer-portal onboarding form. Overlaps conceptually with the "Founding Circle" idea from the founding-circle deck, but the built surface is narrower than that deck imagines.
- Primary users: the nominating designer, the triaging admin, and (eventually) the manufacturer.
- Lives at `admin.patina.cloud/nominations` (triage) and `apps/manufacturer-portal` (maker-facing, stub).

**D. Designer Engagement Pipeline (Lead → Proposal → Active → Completed).** The designer's own client-acquisition funnel: capture a lead, begin discovery, carry it through proposal/active/completed, and nurture past clients back into new work. Deeply entangled with The Document workstream (proposals, discovery capture).
- Primary user: the designer.
- Lives at `app.patina.cloud/portal/{pipeline,leads,nurture}`.

## 3. As-Built Architecture

### A. Admin Manufacturer Pipeline (Cowork) — fully built

Routes (all under `apps/admin-portal/src/app/(dashboard)/`):
- `pipeline/page.tsx` — sortable/filterable vendor table + metrics row + Leah-queue banner + Add-vendor dialog + Cowork status indicator
- `pipeline/[slug]/page.tsx` — vendor dossier (rubric grid, onboarding phases, Cowork activity log, notes)
- `pipeline/review/page.tsx` — Leah's dims-5–8 scoring interface
- `pipeline/onboarding/page.tsx` — onboarding tracker
- `cowork/page.tsx` — Cowork task-queue view (running/scheduled/last-24h metrics + `TaskQueueTable`)
- `feeds/page.tsx` — feed-sync monitor for `stage='live'` vendors

Components live under `apps/admin-portal/src/components/pipeline/**`:
`vendor-table`, `pipeline-metrics`, `leah-queue-banner`, `cowork-status-indicator`, `add-vendor-dialog`, `detail/{rubric-grid,rubric-item,onboarding-phases,cowork-activity-log,vendor-notes,cowork-action-sidebar}`, `review/{review-card,dimension-slider}`, `cowork/task-queue-table`.

Data layer:
- Client service `apps/admin-portal/src/services/vendor-pipeline.ts` (`pipelineService`) — a `fetch`-based client hitting the API routes; unit test at `services/__tests__/vendor-pipeline.test.ts`.
- React Query hooks `apps/admin-portal/src/hooks/use-pipeline.ts` (`useVendors`, `useCoworkTasks`, `useCreateCoworkTask`, etc.).
- Types: `packages/types/src/vendor-pipeline.ts`, exported as the `VendorPipeline` namespace from `packages/types/src/index.ts` (namespaced deliberately to avoid clashing with `catalog.ts`'s `Vendor`). Defines the 8-dimension `RUBRIC_DIMENSIONS`, `TRIAGE_THRESHOLDS`, and `computeTriageLevel`.

Aggregate recompute logic (total_score, triage, scored_by_kody/leah, awaiting_leah_review) is duplicated server-side in the scores API route and documented for the Cowork agent to match byte-for-byte.

### B. Designer Vendor Directory — built but partly broken

Routes under `apps/designer-portal/src/app/(portal)/portal/vendors/`:
- `page.tsx` — directory list (search + category FilterRow, save toggle) over `useVendors()`
- `[id]/page.tsx` — vendor profile (Overview/Products/Reviews tabs, review modal)
- `saved/page.tsx` — saved vendors
- `new/page.tsx` — "Add Custom Vendor" (calls `useFindOrCreateVendor`)

Data layer: `packages/supabase/src/hooks/use-vendors.ts` — `useVendors`, `useVendor`, `useVendorProducts`, `useTradeAccounts`, `useVendorReviews`, `useToggleVendorSave`/`useSaveVendor`, `useSavedVendorIds`, `useSubmitVendorReview`, `useVoteOnSpecialization`, `useFindOrCreateVendor`, `useSearchVendors`. Types: `packages/types/src/strata-vendor.ts`. Queries the browser Supabase client directly (RLS-scoped).

Admin-side catalog vendor CRUD is a **separate** surface: `apps/admin-portal/src/app/api/catalog/vendors/route.ts` + `[id]/route.ts` — do not confuse with `/api/admin/vendors`, which is the pipeline (domain A).

### C. Vendor Nomination → Catalog Onboarding — built (admin+designer), manufacturer side is a stub

- **Designer nominates:** `packages/supabase/src/hooks/use-nominate-vendor.ts` (`useNominateVendor` inserts into `vendor_nominations`; `useLatestVendorNomination`). Signal context comes from `packages/supabase/src/hooks/use-vendor-studio-stats.ts` over view `v_vendor_studio_stats` (migration 00159). Nominate entry is surfaced in the designer-portal `NominateToCatalogModal` (`apps/designer-portal/src/components/products/nomination/nominate-to-catalog-modal.tsx`, which embeds catalog-ui's `VendorContextBlock`) and the designer `/portal/vendors/new` custom-vendor path (`useFindOrCreateVendor`).
- **Admin triages:** `apps/admin-portal/src/app/(dashboard)/nominations/page.tsx` drives the state machine via `useSetNominationStatus` → RPC `set_nomination_status` (migration 00160), rendering `LayerChip`/`NominationStatusBanner` from `@patina/catalog-ui`. Hooks in `packages/supabase/src/hooks/use-admin-nominations.ts`.
- **Maker onboarding:** `apps/manufacturer-portal/src/app/onboarding/page.tsx` — an explicit **placeholder** ("Onboarding flow coming soon") that only echoes `?nomination=<id>`; the real trade-terms/lead-times/catalog-entry form is deferred.
- **"Founding Circle"** is a `vendors.founding_circle` boolean (migration 00163) surfaced in the Library — **not** the application-pipeline product the founding-circle deck imagines.

### D. Designer Engagement Pipeline (Lead → Proposal → Active → Completed) — built (Path A)

- `portal/pipeline/page.tsx` — unified chronological view stitching `useLeads()` + `useProposals()` + `useProjects()` into one list keyed by stage (leads/proposals/active/completed), with cross-stage quick-create links. There is no dedicated pipeline table — it derives from the three source domains.
- `portal/leads/page.tsx` + `leads/[id]/page.tsx` — lead inbox + detail; Add-Lead dialog (`add-lead-dialog.tsx`, also openable via `?add=1`).
- `portal/nurture/page.tsx` — nurture-touchpoint queue over `client_nurture_touchpoints`; compose+send via `POST /api/clients/[id]/nurture-send`.

Lead data layer: `packages/supabase/src/hooks/use-leads.ts` —
- `useLeads`, `useLead`, `useLeadStats`
- `useCreateLead` (designer manual capture, `designer_id=auth.uid()`, `homeowner_id=null`)
- `useUpdateLeadStatus`, `useMarkLeadViewed`
- `useAcceptLead` (→ `designer_clients` status `active`)
- **`useBeginDiscovery`** (The Document's accept path: → status `lead` so it surfaces as a Discovery document)
- **`useNurtureLead`** (dated reconnect via `leads.response_deadline`)
- `useDeclineLead`

Discovery structured capture lives in `use-discovery.ts` (`client_discovery` table, RPC `begin_direction_from_discovery`; the hook is named **`useBeginDirection`**, not `useBeginDiscovery` — see Reconciliation & Gaps).

Expiry handling: edge function `supabase/functions/lead-expiration-check` (2h/30min warning thresholds ahead of a 24h deadline).

## 4. Data Model

### A. Manufacturer pipeline — migration **00076_vendor_pipeline.sql**
- `public.pipeline_vendors` — identity, classification, `stage` (CHECK: discovery/qualification/outreach/negotiation/onboarding/live/paused/rejected), qualification (`total_score`, `triage_level` CHECK green/yellow/orange/red, `has_hard_veto`), contacts, trade terms, feed config, ownership flags (`scored_by_kody`/`scored_by_leah`, `awaiting_leah_review`), `source`. Auto `updated_at` trigger.
- `public.pipeline_vendor_scores` — one row per rubric dimension (1–8), `weight`, `raw_score` (1–5 CHECK), `weighted_score` GENERATED STORED = raw×weight, `scored_by` CHECK (cowork/kody/leah), UNIQUE(vendor_id, dimension).
- `public.cowork_tasks` — shared task queue; `task_type` CHECK (prospect_scan/auto_score/generate_brief/draft_email/ingest_feed/normalize_data/image_audit/feed_sync/rescore), `status` CHECK (pending/picked_up/running/completed/failed/cancelled), input/output JSONB, retry, recurring/cron fields.
- **RLS:** all three tables admin-only via `EXISTS (user_roles ur JOIN roles r … r.domain='admin')`; the Cowork agent uses the service_role key (bypasses RLS).

### B. Designer vendor directory — migration **00001** (`vendors` base) + **00009_vendor_management.sql**
- `vendors` (catalog record: name/trade_name, brand_story, contact, categories, ratings). Extended by:
  - **00034** — hero_image_url, social_links, brand_story JSONB, made_in (extension capture)
  - **00149** — is_patina_catalog
  - **00156** — website UNIQUE
  - **00163** — founding_circle + partial index
  - **00207** — trade_account_email, trade_portal_url, contact_profile_id → profiles
- 00009 sub-tables: `vendor_trade_programs`, **`designer_vendor_accounts`** (the real trade-account table, tiers via `vendor_trade_programs`), `vendor_reviews` (designer FK fixed in **00108**), `vendor_specializations`, `vendor_specialization_votes`, `vendor_certifications`, `saved_vendors`, `vendor_brands`.

### C. Nominations — migration **00152_three_layer_catalog.sql** (`vendor_nominations`)
- Columns: vendor_id→vendors, studio_id→organizations, nominated_by_user_id, manufacturer_contact JSONB, recommendation_note, fit_signals[], `status` CHECK (submitted/under_review/contacted/onboarding/live/declined) + state-specific timestamps, `previous_nomination_id` (renomination chain).
- **00158** — `nomination_transition_is_legal()` + trigger enforcing the state machine and denormalizing status onto `vendors.nomination_status`.
- **00160** — RPC `set_nomination_status(...)` (super_admin-gated).
- **00159** — VIEW `v_vendor_studio_stats` (SECURITY INVOKER): per (vendor, studio) item_count, projects_used_count, lifetime_value_cents, unresolved_damage_count.

### D. Engagement pipeline — migration **00014** (`leads`) + relatives
- `leads` created in **00014_portal_business_features.sql**.
  - **00029** — room_scan_id
  - **00042** — notification triggers (null-safe)
  - **00093** — reassignment
  - **00166_leads_designer_insert.sql** — designer INSERT RLS (`auth.uid()=designer_id AND homeowner_id IS NULL`) + contact_name/contact_email
  - **00223_leads_source.sql** — `leads.source` free-text/chip, additive; legacy dialog leaves NULL
  - Homeowner-owned INSERT policy from **00014** still present (unused — see Path B gap)
- `designer_clients` (client_id nullable since **00018**) is the accept target.
- `client_discovery` in **00224_client_discovery.sql** (RPC `begin_direction_from_discovery`).
- `client_nurture_touchpoints` powers `/portal/nurture`.
- **00199_activation_carry_vendor_id.sql** — repairs proposal→project activation to carry `vendor_id` (a procurement-domain fix adjacent to this area).

## 5. API / Edge / Service Surface

### Admin manufacturer pipeline (Next.js API routes, admin-portal)
- `GET/POST /api/admin/vendors` — list (filters: stage, triage_level, awaiting_leah, sort_by/dir, search via `ilike name`) / create (slugify, optional `auto_score` Cowork task). **Reads/writes `pipeline_vendors`** (not `vendors`).
- `GET/PATCH /api/admin/vendors/[slug]` — dossier (+ scores + activity) / update-or-advance-stage.
- `POST /api/admin/vendors/[slug]/scores` — upsert a dimension score + recompute aggregates.
- `POST /api/admin/vendors/[slug]/leah-review` — batch dims 5–8 + leah_notes; returns total_score + triage. Rejects dims outside 5–8.
- `GET/POST /api/admin/cowork-tasks`, `PATCH /api/admin/cowork-tasks/[id]` (cancel), `GET /api/admin/cowork-tasks/active-count`.
- `GET /api/admin/pipeline-metrics`.
- All gated by `getAuthenticatedAdmin` (`@/lib/supabase-admin`).

### Admin catalog vendors (separate)
- `GET/POST /api/catalog/vendors`, `GET/PATCH/DELETE /api/catalog/vendors/[id]` — catalog-side `vendors` management. Distinct from the pipeline routes above.

### Designer engagement
- `POST /api/clients/[id]/nurture-send` (designer-portal) — sends a nurture note, closes the touchpoint.

### Edge functions (Deno)
- `lead-expiration-check` — driven by an external 15-min cron; warns at 2h/30min before a lead's 24h `response_deadline`.
- **No** Cowork edge function exists — the Cowork agent is an external process that polls `cowork_tasks` via the REST API using the service_role key.
- **No** vendor-nomination outreach edge function exists (deferred — see Reconciliation & Gaps).

## 6. UI Surfaces

### Admin portal (`admin.patina.cloud`, route group `(dashboard)`)
- `/pipeline`, `/pipeline/[slug]`, `/pipeline/review`, `/pipeline/onboarding` — manufacturer pipeline (domain A)
- `/cowork` — Cowork task queue (domain A)
- `/feeds` — feed-sync monitor for live vendors (domain A)
- `/nominations` — vendor-nomination triage / state machine (domain C)

### Designer portal (`app.patina.cloud`, route group `(portal)/portal`)
- `/portal/vendors`, `/portal/vendors/[id]`, `/portal/vendors/saved`, `/portal/vendors/new` — vendor directory (domain B)
- `/portal/pipeline` — unified Lead→Proposal→Active→Completed overview (domain D)
- `/portal/leads`, `/portal/leads/[id]` — lead inbox + detail (domain D)
- `/portal/nurture` — nurture-touchpoint queue (domain D)

### Manufacturer portal (`apps/manufacturer-portal`)
- `/` + `/onboarding` — placeholder onboarding landing (domain C); real form deferred. Deployment to a public subdomain is unconfirmed (no manufacturer URL appears in the project CLAUDE.md key-URLs list).

### Client portal / marketing
- None. No homeowner/marketing lead-capture surface exists (Path B of domain D is unbuilt).

## 7. Reconciliation & Gaps

Drift between the source docs and what actually shipped:

- ⚠ **Table names diverge from the original PRD.** `vendor-pipeline-prd.md` specs tables `vendors` / `vendor_scores` / `cowork_tasks`, but the built migration (00076) uses `pipeline_vendors` / `pipeline_vendor_scores` / `cowork_tasks` — deliberately renamed to avoid colliding with the pre-existing catalog `public.vendors` table. The `cowork-vendor-pipeline-instructions.md` runbook already reflects the corrected `pipeline_*` names; the original PRD does not.
- ⚠ **Migration identity mismatch.** The PRD names the migration `20260415_vendor_pipeline.sql`; the repo file is `00076_vendor_pipeline.sql` (the repo's sequential-numbered convention).
- ⚠ **RLS model diverges.** The PRD's policies gate on `auth.uid() IN (SELECT id FROM public.users WHERE role='admin')`; the built 00076 gates on `EXISTS (user_roles ur JOIN roles r ON … r.domain='admin')`. There is no `users.role` column in this flow.
- ⚠ **Package + data-access shape diverges.** The PRD is written for `@strata/types` and Next.js Server Actions in `src/actions/{vendors,scores,cowork-tasks}.ts`; the repo uses `@patina/types` (`VendorPipeline` namespace) and a REST API-route layer (`/api/admin/*`) fronted by a client `pipelineService` (`services/vendor-pipeline.ts`) — no Server Actions exist.
- ⚠ **Polling hook diverges.** The PRD specs `src/hooks/use-cowork-poll.ts` doing a 30s Supabase poll; the built code uses React Query hooks in `hooks/use-pipeline.ts` + a `/api/admin/cowork-tasks/active-count` fetch behind `CoworkStatusIndicator`. No `use-cowork-poll.ts` exists.
- ⚠ **Route locations diverge.** The PRD's file-structure places pages at app root (`/pipeline`, `/cowork`, `/feeds`) with a specific collapsible sidebar; reality nests them in the `(dashboard)` route group and adds a `/pipeline/onboarding` page rather than the PRD's `/pipeline?stage=onboarding` link.
- ⚠ **Designer directory queries phantom tables.** `packages/supabase/src/hooks/use-vendors.ts` reads `trade_accounts` (lines 123, 266), `trade_applications` (line 280), and `vendor_pricing_tiers` (line 141) — **none of these tables exist in any migration**. The real tables are `designer_vendor_accounts` and `vendor_trade_programs` (00009). `useTradeAccounts()` and the trade/pricing joins in `useVendor()` therefore return empty/error against the real schema; the file's own header comment admits the generated types were never regenerated for these tables.
- ⚠ **Stale implementation log.** `docs/implementation/vendor-management/progress.md` references app paths `apps/portal/src/app/(main)/vendors/...` and a `/vendors/accounts` Trade-Accounts route + a route-based review page — the merged repo has none of these; the real app is `apps/designer-portal/.../(portal)/portal/vendors/` with only `page`/`[id]`/`saved`/`new` (no `accounts` route).
- ⚠ **Founding Circle scope mismatch.** `founding-circle-pipeline.html` specs an admin application-pipeline at `admin.patina.cloud/founding-circle` with an application-overview and per-applicant detail views. Reality: no `/founding-circle` route exists; the built surface is `/nominations` over `vendor_nominations`, and `founding_circle` is just a boolean flag on `vendors` (00163) used by the Library.
- ⚠ **Lead provenance copy is inaccurate.** `pipeline-lead-intake.md` and the `/portal/pipeline` empty-state copy say leads arrive "from the consumer app" when a homeowner reaches out — but no consumer/marketing intake exists; every lead today is designer-captured (Path A) via `useCreateLead` / The Document capture sheet.
- ⚠ **Cowork agent presence is unverified.** The entire `pipeline_vendors` / `cowork_tasks` machine is built and the schema is on prod, but there is no evidence the external Cowork agent is running or that any pipeline data is seeded — `/feeds` and the activity log depend entirely on that agent writing rows, so in practice they render empty.
- Naming note (not a bug, but a trap for future readers): the task anchors commonly referred to as `useBeginDiscovery`/`useNurtureLead` are both real, and both live in `use-leads.ts`. The separate discovery-*seeding* hook is named **`useBeginDirection`** (in `use-discovery.ts`), not `useBeginDiscovery` — easy to conflate.

## 8. Forward Roadmap / Open Requirements

| Item | Priority |
|---|---|
| Fix the designer vendor directory's phantom-table queries: repoint `useTradeAccounts`/`useVendor` from `trade_accounts`/`trade_applications`/`vendor_pricing_tiers` to the real `designer_vendor_accounts`/`vendor_trade_programs`, or add the missing tables. Currently ships a broken trade-account surface. | P0 |
| Decide the fate of Domain A (Cowork manufacturer pipeline): either stand up + operate the external Cowork agent (with seed data) per `cowork-vendor-pipeline-instructions.md`, or mark the admin `/pipeline`, `/cowork`, `/feeds` surfaces as dormant. It is fully built but inert. | P1 |
| Build the manufacturer-portal onboarding flow (trade terms, lead times, catalog product/photo intake) scoped by `?nomination=<id>` so the nomination→live path completes end-to-end. | P1 |
| Ship nomination outreach: add the S3.7 manufacturer-outreach email template + outbox writes on the `contacted` transition (the 00158 follow-up that was never done). | P1 |
| Regenerate `@patina/supabase` DB types to cover the vendor tables and remove the `as any` casts in `use-vendors.ts`. | P2 |
| If consumer/marketing lead capture is still desired, build Path B: a homeowner/marketing intake form + a designer-matching step (edge function or admin assignment) so `leads.homeowner_id` rows become visible. | P2 |

## 9. Status & Deploy

Prod Supabase DB tip is ~migration **00229** (per project memory: AE program "Prod tip 00229"; The Piece "prod already at 00229"). All schema for this area is therefore on prod:
- **00076** — pipeline_vendors / cowork_tasks
- **00009 / 00034 / 00108 / 00149 / 00156 / 00163 / 00207** — vendor directory
- **00152 / 00158 / 00159 / 00160** — nominations
- **00014 / 00166 / 00223 / 00224** — leads / discovery

The `leads.source` column (00223) is on prod at the DB level even though project memory notes the Track-6 *app* code was "merged to main, NOT prod" — verify app-tier deploy separately.

Deploy/operational caveats:
1. ⚠ Domain A schema is deployed but effectively unused — there is no external Cowork agent running against `cowork_tasks` and no seeded `pipeline_vendors`, so `/pipeline`, `/cowork`, `/feeds` render empty on prod.
2. ⚠ The manufacturer-portal app is a placeholder and has no confirmed public subdomain (not in the project CLAUDE.md key-URLs).
3. ⚠ `lead-expiration-check` edge function requires an external 15-min HTTP cron + `app.settings` service-role/URL to actually dispatch — confirm it's wired on prod.
4. ⚠ The designer trade-account hooks query non-existent tables, so that sub-surface is broken in every environment regardless of deploy state.

## 10. Superseded Sources

This consolidated PRD supersedes:
- `docs/prds/vendor-pipeline-prd.md`
- `docs/prds/patina-admin-vendor-pipeline.html`
- `docs/prds/pipeline-lead-intake.md`
- `docs/prds/founding-circle-pipeline.html`
- `docs/specs/_active/vendor-management.md`
- `docs/implementation/vendor-management/progress.md`

**Retained separately (not superseded):** `docs/prds/cowork-vendor-pipeline-instructions.md` — this is an operational runbook for running the external Cowork agent, not a product spec, and it already reflects the correct `pipeline_*` table names.
