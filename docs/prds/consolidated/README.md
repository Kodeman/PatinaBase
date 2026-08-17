# Patina — Consolidated As-Built PRDs

The single source of truth for **what Patina is, as built**. One Detailed PRD per product area, reconciled against the actual codebase (routes, migrations `00001–00254`, edge functions, services) — not against the historical spec pile.

Each PRD carries: as-built architecture with real file-path anchors · data model with the migration numbers that created it · API/edge/service surface · UI surfaces · a **Reconciliation & Gaps** section flagging spec-vs-reality drift and known bugs · a forward roadmap · deploy status.

> **Method (2026-07-06):** 12 areas × (reconcile → draft → adversarial verify) = 36 agents. The verify pass re-checked every migration number, table, RPC, route, and edge-function name against the repo and corrected fabrications in place (e.g. a phantom `Fulfillment` Prisma model, `submit_coordination_revision` mis-attributed to 00214 vs its real 00218, `companion-context` querying a non-existent `style_profiles` table). Prod-state assertions sourced from project memory (prod DB tip, deploy commits) are marked as unverifiable-from-checkout where they appear.

## The 12 areas

| # | Area | PRD | Headline status |
|---|------|-----|-----------------|
| 01 | Designer Portal (core) | [01-designer-portal.md](01-designer-portal.md) | Shipped — shell, nav, and the "everyman" workspace pages (projects, clients, insights, portfolio, rooms, settings) |
| 02 | The Document (desk) | [02-the-document.md](02-the-document.md) | Shipped — the default navigation; zone-nav replacement, Tracks 1–6 + offline signature (00254) |
| 03 | Decision System | [03-decision-system.md](03-decision-system.md) | Shipped — compose/record/e-sign, coordination (ball-in-court), FF&E feed-through |
| 04 | Procurement, Orders & Billing | [04-procurement-orders.md](04-procurement-orders.md) | Shipped (pilot) — POs, invoicing/A-R, time→earnings, QBO; legacy NestJS orders vestigial |
| 05 | Aesthete Engine (taste/AI) | [05-aesthete-engine.md](05-aesthete-engine.md) | Build-complete, **held at main** — 768-d taste space, quiz, inference worker (migrations 00239–00251 not on prod) |
| 06 | Library, Catalog & Capture | [06-library-catalog-capture.md](06-library-catalog-capture.md) | Shipped — three-layer library (personal/studio/catalog), Chrome-extension capture, the Piece |
| 07 | Vendors & Pipeline | [07-vendors-pipeline.md](07-vendors-pipeline.md) | Partial — four domains: admin cowork pipeline, designer vendors, leads/nurture, manufacturer portal (nascent) |
| 08 | Client Portal | [08-client-portal.md](08-client-portal.md) | Shipped — client-facing PWA (decisions, proposals, projects, messages, quiz, scans, invoices) |
| 09 | Help & Guidance | [09-help-guidance.md](09-help-guidance.md) | Shipped (code) — four-layer `@patina/help-system`, Sanity-backed; most CMS content still placeholder |
| 10 | Comms, Email & Notifications | [10-comms-email-notifications.md](10-comms-email-notifications.md) | Shipped — `notify()` + React-Email templates, in-app comms threads, campaigns/automation |
| 11 | Native — iOS & Extension | [11-native-ios-extension.md](11-native-ios-extension.md) | Partial — iOS Capture (RoomPlan "Walk"), companion app, Chrome extension; companion-context bug flagged |
| 12 | Platform & Infrastructure | [12-platform-infra.md](12-platform-infra.md) | Shipped — Supabase Strata + Cloudflare Workers/Containers; Phase 1 edge migration planned |

## What happened to the old docs

Source docs that a PRD **fully replaces** were moved to [`docs/_archive/`](../../_archive/) preserving their original subpath (e.g. `docs/design/the-document/the-document-spec-v1.6.md` → `docs/_archive/design/the-document/the-document-spec-v1.6.md`). Git history is preserved through the rename. Each PRD's §1 and §10 list its superseded sources by their original path — find them under `docs/_archive/<same subpath>`.

**Still-canonical docs stayed in place** — runbooks (`docs/operations/**`, `infra/runbooks/**`), the stale-files audit (`docs/maintenance/`), operational references (AE runbook/prod-readiness/delivery-log, package READMEs, the `-v2` gap matrix, `DECISIONS.md`, the-document prototypes/CODEBASE-MAP), and templates.

**Five docs were held back from archival** because one PRD superseded them but another area flagged them as still-canonical — kept in place:

- `docs/design/the-document/the-document-needs-ruling-2026-07.md` (rulings still referenced by Decisions)
- `docs/design/the-document/the-document-parity-backlog-2026-07.md` (open backlog still referenced by Decisions)
- `docs/prds/AE/aesthete-engine-system-design.md` (system design cross-referenced by Client Portal)
- `docs/prds/in-app-messaging-prd.md` (messaging spec cross-referenced by Client Portal)
- `docs/specs/_active/product-capture.md` (capture spec cross-referenced by Native)
