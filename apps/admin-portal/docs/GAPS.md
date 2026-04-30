# Admin Portal Gap Matrix

> **Purpose:** Living scoreboard mapping every PRD/spec requirement and backend capability to its current admin-portal state. Update this file as gaps close — flip rows from 🔴/🔶/🟧/🟡 to ✅ and link the closing PR.
>
> **Last audit:** 2026-04-30 · P0 + partial P1 batch closed (audit, dashboard, health, analytics, settings, flags, payouts, type-debt)
> **Sources:** `docs/prds/`, `docs/specs/_active/`, `apps/admin-portal/docs/{README,USER_GUIDE,API_REFERENCE}.md`, `supabase/migrations/00021,00022,00024,00044,00046,00048,00052,00071,00072,00076,00084,00101-00103`.

## Status Legend

| Symbol | Meaning |
|---|---|
| ✅ | **Built** — functional, production-quality |
| 🟡 | **Partial** — implemented but has TODOs, polish gaps, or missing sub-features |
| 🟧 | **Stub** — page is a 1-line re-export from `/demo/` (mock data only) |
| 🔶 | **Backend-only** — data layer/RPC exists, no admin UI |
| 🔴 | **Missing** — neither UI nor backend wired up |

## Executive Summary

| Domain | Built | Partial | Stub | Backend-only | Missing |
|---|---|---|---|---|---|
| Identity & Access | 7 | 2 | 0 | 2 | 4 |
| Catalog & Media | 5 | 4 | 1 (media) | 1 | 3 |
| Vendor Pipeline | 7 | 2 | 0 | 2 | 0 |
| Communications | 9 | 1 | 0 | 0 | 2 |
| Orders & Finance | 4 | 1 | 0 | 2 | 2 |
| Projects & Approvals | 2 | 0 | 0 | 4 | 0 |
| System Ops | 5 | 0 | 1 (media) | 1 | 3 |
| Privacy & Compliance | 0 | 0 | 2 | 1 | 2 |
| Messaging & Support | 1 | 0 | 0 | 4 | 1 |
| Search Admin | 0 | 0 | 0 | 0 | 4 |

**Headline findings:**
1. **One production route remains a stub** (down from seven): `/media` only. `/audit`, `/dashboard`, `/health` closed in P0; `/analytics`, `/settings`, `/flags` closed in P1; `/finance/payouts` added new.
2. **Production-quality domains:** users, roles, catalog, communications, vendor pipeline, applications, projects, orders.
3. **~50% of admin-relevant backend tables have no UI:** payouts, vendor reviews, API keys, organizations, RFIs, outbox events, in-app messaging admin, MFA enforcement, JIT elevation, dual-control approvals.
4. **Catalog has 40+ TODOs** in its test file (loading skeletons, empty states, pagination, validation badges, view toggles).
5. ~~Type-generation debt~~ — closed in P1; all 7 `LooseClient` casts removed in pipeline + cowork + vendors routes.

---

## 1. Identity & Access Management

| Capability | Source | Status | Path / Notes | Priority | Next Action |
|---|---|---|---|---|---|
| User list + filter + search | user-mgmt spec | ✅ | `/users/page.tsx` | — | — |
| User detail + role assignment | user-mgmt spec | ✅ | `/users/[id]/page.tsx` | — | — |
| Suspend / ban / activate / verify | user-mgmt spec | ✅ | `services/users.ts` | — | — |
| Session list + remote revoke | user-mgmt spec | ✅ | `users/[id]` session-list | — | — |
| Role CRUD + permission grid + cloning | user-mgmt spec | ✅ | `/roles`, `/roles/[roleId]` | — | — |
| Designer + Maker application pipeline | applications PRD | ✅ | `/applications` | — | — |
| Founding-circle application thread/comms | mig 00071 | 🟡 | drawer renders, `application_communications` thread UI not wired | P2 | Wire thread reader/sender into application drawer |
| Verification queue (designer profiles) | user-mgmt spec | 🟡 | `/verification` exists; PAR doc-verification fields not surfaced | P2 | Surface PAR fields in verification detail panel |
| Waitlist conversion | — | ✅ | `/waitlist` | — | — |
| **Audit log viewer** | user-mgmt spec | ✅ | `/audit` real DataTable over `audit_logs` (mig 00021) — paginated, filterable by status + free-text. `/api/admin/audit-logs` route uses service-role admin client. | — | — |
| MFA enforcement for admin roles | user-mgmt spec | 🔴 | Supabase Auth supports it; no admin enforcement panel | P1 | Add `/users/[id]` panel to view & require MFA |
| JIT privilege elevation (time-boxed) | user-mgmt spec | 🔴 | Not in schema or UI | P2 | Schema design + RPC + admin grant flow |
| Dual-control approvals (high-risk ops) | user-mgmt spec | 🔴 | Not in schema or UI | P2 | Schema design + approver-pair workflow |
| Organizations / multi-tenant admin | mig 00021 | 🔶 | `organizations`, `organization_members` exist; no `/organizations` route | P2 | New page mirroring `/users` patterns |
| API key management per org | mig 00021 | 🔶 | `api_keys` table exists; no UI | P3 | Admin panel inside org detail |
| Suspicious-activity / failed-auth alerts | user-mgmt spec | 🔴 | No detection or surface | P3 | Backend detection job + alert panel |

## 2. Catalog Management

| Capability | Source | Status | Path / Notes | Priority | Next Action |
|---|---|---|---|---|---|
| Product CRUD + variants + media + SEO | USER_GUIDE | ✅ | `/catalog`, `/catalog/[productId]` | — | — |
| Bulk publish/unpublish/delete | USER_GUIDE | ✅ | `bulk-action-toolbar` | — | — |
| Category CRUD | USER_GUIDE | ✅ | `/catalog/categories` | — | — |
| Collections CRUD | USER_GUIDE | ✅ | `/catalog/collections` | — | — |
| Feeds sync (partner ingestion) | — | ✅ | `/feeds` | — | — |
| Search + filters | USER_GUIDE | 🟡 | basic works; autocomplete missing | P2 | Build autocomplete + clear-filters UI per test TODOs |
| Loading skeletons / empty states / pagination | catalog tests | 🟡 | 40+ TODOs in `__tests__/page.test.tsx` | P2 | Burn down catalog test TODO list |
| Grid/list/table view toggles | USER_GUIDE | 🟡 | TODO in test file | P3 | Add layout toggle + persistence |
| Validation issue dashboard | USER_GUIDE | 🟡 | per-product status; no rolled-up dashboard | P2 | Aggregate panel on `/catalog` header |
| Reprocessing / orphan cleanup | USER_GUIDE | 🔶 | `services/media` exists; no admin trigger UI | P2 | Add ops panel under `/media` |
| Bulk CSV import + error report | USER_GUIDE | 🔴 | UI not built | P1 | Build importer + error-row download |
| Media browser (asset library) | USER_GUIDE | 🟧 | `/media` re-exports `/demo/media` | P1 | Real browser over `media_assets` + `asset_renditions` |
| 3D / AR asset inspection (tris, materials) | USER_GUIDE | 🔴 | Not built | P3 | Asset detail panel w/ glTF preview |
| Inventory thresholds | USER_GUIDE | 🔴 | Not in schema | P3 | Schema + alert config UI |

## 3. Vendor Pipeline

| Capability | Source | Status | Path / Notes | Priority | Next Action |
|---|---|---|---|---|---|
| Vendor list w/ stage + triage filtering | vendor-pipeline PRD | ✅ | `/pipeline` | — | — |
| Vendor detail + activity log + rubric | vendor-pipeline PRD | ✅ | `/pipeline/[slug]` | — | — |
| LeahAI scoring queue + dimension sliders | vendor-pipeline PRD | ✅ | `/pipeline/review` | — | — |
| Onboarding phase timeline | vendor-pipeline PRD | ✅ | `/pipeline/onboarding` | — | — |
| Cowork task queue | vendor-pipeline PRD | ✅ | `/cowork` | — | — |
| Trade-account state mgmt | vendor-pipeline PRD | ✅ | `pipeline_vendors` columns wired | — | — |
| Hard-veto with reason | vendor-pipeline PRD | 🟡 | column exists; UI inconsistent across rubric | P2 | Wire veto setter into rubric grid |
| Drop-ship / lead-time / data-feed config | vendor-pipeline PRD | 🟡 | columns exist; UI sparse | P2 | Extend vendor detail edit form |
| Type generation for pipeline tables | code | ✅ | All 7 `LooseClient` casts removed; uses typed `auth.adminClient` directly. Json type re-exported from `@patina/supabase`. | — | — |
| Vendor reviews & specializations | mig | 🔶 | tables exist; no admin moderation UI | P3 | Moderation panel inside vendor detail |
| Vendor certifications | mig | 🔶 | table exists; no admin UI | P3 | Cert upload/verify panel |

## 4. Communications & Marketing

| Capability | Source | Status | Path / Notes | Priority | Next Action |
|---|---|---|---|---|---|
| Campaign builder (blocks, preview) | comms PRD | ✅ | `/communications/campaigns/[id]/edit` | — | — |
| Template library + editor | comms PRD | ✅ | `/communications/templates` | — | — |
| Audience segmentation + rule builder | comms PRD | ✅ | `/communications/audiences` | — | — |
| Automation workflows | comms PRD | ✅ | `/communications/automations` | — | — |
| Campaign analytics | comms PRD | ✅ | `/communications/analytics` | — | — |
| A/B variant testing + stats | recent commits | ✅ | `ab_variant_stats` view + UI | — | — |
| Email suppression list | comms PRD | ✅ | `/communications/suppressed` | — | — |
| Unsubscribe endpoint | comms PRD | ✅ | `/preferences/unsubscribe` | — | — |
| Pre-send checklist | comms PRD | ✅ | `pre-send-checklist` component | — | — |
| Bounce / hard-fail dashboard | comms PRD | 🟡 | suppressed list exists; bounce-reason analytics not surfaced | P2 | Add bounce breakdown to `/communications/analytics` |
| Sender config / DKIM-SPF validation | comms PRD | 🔴 | No UI; Resend config managed externally | P3 | Settings panel reading Resend domain status |
| Resend webhook audit / delivery log | comms PRD | 🔴 | No admin viewer | P3 | New page over webhook event log |

## 5. Orders, Payments & Finance

| Capability | Source | Status | Path / Notes | Priority | Next Action |
|---|---|---|---|---|---|
| Order list + status filter | README | ✅ | `/orders` | — | — |
| Order detail + shipments / refunds / cancels | README | ✅ | `/orders/[id]` + API routes | — | — |
| Refund processing (Stripe) | README | ✅ | API route exists | — | — |
| Advanced filters (payment state, fulfillment, date) | spec | 🟡 | basic status only | P2 | Extend `/orders` filter bar |
| Payment reconciliation dashboard | spec | 🔶 | `reconciliations` table in svc_orders; no UI | P2 | New page reading reconciliation rows |
| Discount code management | mig svc_orders | 🔶 | `discounts` table; no admin UI | P2 | New `/orders/discounts` page |
| Designer payouts / earnings | mig | ✅ | `/finance/payouts` real page over `designer_payouts` joined to `profiles`. Filter by status, paginated, with totals (pending / processing / completed-30d / failed). Backed by `/api/admin/payouts`. | — | Follow-up: drill into `designer_earnings` per payout, batch processing actions |
| Tax / geographic settings | spec | 🔴 | Not built | P3 | Settings panel |
| Order export (CSV) | — | 🔴 | Not built | P3 | Export button on `/orders` |

## 6. Projects & Approvals

| Capability | Source | Status | Path / Notes | Priority | Next Action |
|---|---|---|---|---|---|
| Project list + budget + timeline | README | ✅ | `/projects` | — | — |
| Project detail | README | ✅ | `/projects/[id]` | — | — |
| Approval-record review queue | mig 00084 | 🔶 | `approval_records` table; no admin queue | P2 | New `/projects/approvals` page |
| Change-order template governance | mig 00084 | 🔶 | `project_change_order_templates`; no editor | P2 | New admin editor |
| Proposal template governance | mig 00084 | 🔶 | `proposal_templates`; no editor | P2 | New admin editor |
| Project activation override | mig | 🔶 | `activate_project_v2` RPC exists; no admin button | P3 | Add button to project detail |

## 7. System Operations & Health

| Capability | Source | Status | Path / Notes | Priority | Next Action |
|---|---|---|---|---|---|
| **Executive dashboard** | README | ✅ | `/dashboard` real KPI tiles: pending applications, vendor pipeline live, comms 24h send rate, total orders. PostHog widget retained. Health rail links to `/health`. | — | Follow-up: orders today/week count + revenue (needs orders-metrics endpoint or RPC) |
| **Cross-service health (SLO, errors, latency)** | spec | ✅ | `/health` real polling panel (15s) over Orders/Media/Projects + Supabase. `/api/admin/health` aggregator with 3s timeouts and 5s response cache. | — | Follow-up: migrate media inline `/health` to a proper HealthController for DB indicator parity |
| Feature flags admin | spec | ✅ | `/flags` real env-flag viewer over `NEXT_PUBLIC_ENABLE_*`. No `feature_flags` table yet — toggle via redeploy. Runtime flag table is a follow-up. | — | Follow-up: build `feature_flags` table + edit UI for runtime toggles |
| Settings (env / config / sender) | spec | ✅ | `/settings` real read-only viewer (env config, Resend sender, suppression count, bounce count, caller roles). Backed by `/api/admin/settings-overview`. | — | Follow-up: editable settings backed by a `system_settings` table |
| Analytics dashboard | spec | ✅ | `/analytics` real cross-domain panel: comms 30d stats, vendor pipeline, applications queue, catalog/payout counts. Backed by `/api/admin/platform-counts` + reuses comms-dashboard + pipeline-metrics + applications-metrics. | — | Follow-up: time-series charts (currently summary metrics only) |
| Outbox / process-jobs monitor | mig | 🔶 | `outbox_events`, `process_jobs` tables; no admin UI | P1 | New `/system/jobs` page |
| Background-job retry / dead-letter | spec | 🔴 | No UI | P2 | Add to jobs page once basic surface lands |
| Cache health (Redis hit/miss) | spec | 🔴 | No UI | P3 | Health-page section |
| Rate-limit per-user dashboard | spec | 🔴 | No UI | P3 | New panel under settings |

## 8. Privacy & Compliance

| Capability | Source | Status | Path / Notes | Priority | Next Action |
|---|---|---|---|---|---|
| DSR export queue (GDPR/CCPA) | spec | 🟧 | `/demo/privacy` only — not in prod nav | P1 | Promote real `/privacy` route |
| DSR deletion queue | spec | 🟧 | demo only | P1 | Same — promote real route |
| Consent / preference tracking | spec | 🔶 | `notification_preferences` exists; no consent surface | P2 | Surface in user detail |
| Legal hold mgmt | spec | 🔴 | Not built | P2 | Schema + admin UI |
| Privacy-incident log | spec | 🔴 | Not built | P3 | Schema + log viewer |

## 9. Messaging & Support

| Capability | Source | Status | Path / Notes | Priority | Next Action |
|---|---|---|---|---|---|
| Cowork task queue (Claude automation) | vendor-pipeline PRD | ✅ | `/cowork` | — | — |
| In-app messaging admin auditing | in-app-messaging PRD | 🔶 | mig 00101–00103 schema + RPCs; no admin viewer | P1 | Read-only thread browser |
| Vendor brief threads | in-app-messaging PRD | 🔶 | `rpc_start_vendor_brief` exists; no admin trigger UI | P2 | Button on vendor detail |
| RFI / support tickets | mig | 🔶 | `rfis`, `tasks` tables; no admin queue | P2 | New `/support` page |
| Notification rules governance | mig | 🔶 | `notifications`, `notification_log` tables; no UI | P2 | Admin rules editor |
| Support agent triage view | spec | 🔴 | Not built | P2 | After RFI queue lands |

## 10. Search Administration

| Capability | Source | Status | Path / Notes | Priority | Next Action |
|---|---|---|---|---|---|
| Synonym mgmt (with locale) | spec | 🔴 | Not built | P2 | Schema + admin editor |
| Reindex orchestration + alias swap | spec | 🔴 | Not built | P2 | Trigger UI + progress monitor |
| Field-boost config | spec | 🔴 | Not built | P3 | Search config panel |
| Query console / zero-results analytics | spec | 🔴 | Not built | P3 | Console + analytics page |

## 11. Analytics & Reporting (additive)

| Capability | Source | Status | Path / Notes | Priority | Next Action |
|---|---|---|---|---|---|
| Daily-room engagement charts | code | ✅ | `/analytics/daily-room` | — | — |
| Designer-application metrics | code | 🟡 | `/api/admin/pipeline-metrics` exists; analytics page is stub | P1 | Surface via real `/analytics` |
| Decision-bottleneck analytics RPC | mig | 🔶 | `get_decision_bottleneck_phases()` etc.; no chart | P2 | Add chart to analytics page |
| Conversion-funnel view | mig 00107 | 🔶 | view exists; no admin surface | P2 | Add panel to analytics page |

---

## Recommended Sprint Plan

### P0 — Replace stubs surfacing real ops data (week 1–2) — ✅ DONE
1. ~~`/audit` → wire to `audit_logs`~~ — done (`/api/admin/audit-logs` + `useAdminAuditLogs`).
2. ~~`/dashboard` → real KPI tiles~~ — done (`/api/admin/applications-metrics` + `useDashboardMetrics`; reuses pipeline + comms hooks). Orders today/week + revenue deferred to P1 follow-up.
3. ~~`/health` → real service-status panel~~ — done (`/api/admin/health` aggregator + `useSystemHealth`, 15s poll).

### P1 — Surface backend that already works (week 3–4) — partially done
4. ~~`/analytics`~~ — done (`/api/admin/platform-counts` + reuse of comms/pipeline/applications metrics).
5. ~~`/settings`~~ — done (`/api/admin/settings-overview`, read-only env + email + caller roles).
6. **`/media`** — *deferred*. Requires a service-side proxy at `/api/admin/media-assets` calling the media service `/v1/media/search`, and the admin user needs `media.asset.read` permission in NestJS auth. Scope > one session.
7. ~~`/flags`~~ — done (env-flag viewer; `feature_flags` table is a follow-up).
8. ~~Designer payouts / earnings page~~ — done (`/finance/payouts`).
9. **DSR export + deletion queues** — *deferred*. Substantial compliance UI; deserves dedicated PR.
10. **In-app messaging admin viewer** — *deferred*. Schema (mig 00101–00103) ready but UX needs design.
11. **Outbox / process-jobs monitor** — *deferred*. `outbox_events` lives in `svc_media` + `svc_orders` schemas which aren't exposed via PostgREST; needs schema exposure or per-service admin endpoint.
12. **Bulk CSV product import** — *deferred*. Substantial UI work (CSV parse, validation, error-row download).
13. **MFA enforcement panel** — *deferred*. Auth surface; needs careful design + dedicated PR.
14. ~~Regenerate Supabase types~~ — done (all 7 `LooseClient` casts removed; `Json` re-exported from `@patina/supabase`).

**Designer-application metrics on /analytics** — partially done (counts surfaced via `useApplicationsMetrics`). Decision-bottleneck and conversion-funnel chart wiring still pending.

### P2 — Fill PRD gaps (week 5–8)
15. Catalog UX polish (skeletons, empty states, pagination, view toggles, validation dashboard).
16. Approval / change-order / proposal template governance.
17. Discount-code admin + payment reconciliation.
18. RFI / support-ticket queue.
19. Notification-rules governance.
20. JIT elevation + dual-control workflows.
21. Search-admin (synonyms, reindex, alias swap).
22. Bounce / hard-fail analytics.

### P3 — Backlog
23. API-key mgmt UI.
24. 3D/AR asset inspection.
25. Tax / geographic settings.
26. Cache health / rate-limit dashboards.
27. Vendor reviews & certifications moderation.

---

## Verification Cadence

- **Per PR closing a row:** flip the status emoji and append the PR number in the "Next Action" column.
- **Bi-weekly audit:** re-run the four checks below.

```bash
# 1. Confirm stubs (should be exactly 7 files)
grep -l "from '../demo/" apps/admin-portal/src/app/\(dashboard\)/*/page.tsx

# 2. Spot-check production routes
pnpm dev:admin   # admin on :3001
# Visit /users /roles /catalog /communications /pipeline /applications

# 3. Confirm cited backend tables exist
psql $DATABASE_URL -c "\dt audit_logs"
psql $DATABASE_URL -c "\df rpc_start_vendor_brief"

# 4. Confirm type-gen debt
grep -rn "LooseClient" apps/admin-portal/src
```
