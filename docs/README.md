# Patina Documentation Index

## Start here → [Consolidated As-Built PRDs](prds/consolidated/README.md)

The canonical reference for **what Patina is, as built** is the 12 Detailed PRDs in [`prds/consolidated/`](prds/consolidated/), each reconciled against the actual codebase (routes, migrations `00001–00254`, edge functions, services). Read those first for any area — they supersede the scattered specs, delivery logs, and gap matrices that used to live here.

| Area | PRD |
|------|-----|
| Designer Portal (core) | [01-designer-portal](prds/consolidated/01-designer-portal.md) |
| The Document (desk) | [02-the-document](prds/consolidated/02-the-document.md) |
| Decision System | [03-decision-system](prds/consolidated/03-decision-system.md) |
| Procurement, Orders & Billing | [04-procurement-orders](prds/consolidated/04-procurement-orders.md) |
| Aesthete Engine (taste/AI) | [05-aesthete-engine](prds/consolidated/05-aesthete-engine.md) |
| Library, Catalog & Capture | [06-library-catalog-capture](prds/consolidated/06-library-catalog-capture.md) |
| Vendors & Pipeline | [07-vendors-pipeline](prds/consolidated/07-vendors-pipeline.md) |
| Client Portal | [08-client-portal](prds/consolidated/08-client-portal.md) |
| Help & Guidance | [09-help-guidance](prds/consolidated/09-help-guidance.md) |
| Comms, Email & Notifications | [10-comms-email-notifications](prds/consolidated/10-comms-email-notifications.md) |
| Native — iOS & Extension | [11-native-ios-extension](prds/consolidated/11-native-ios-extension.md) |
| Platform & Infrastructure | [12-platform-infra](prds/consolidated/12-platform-infra.md) |

## Still-current operational docs (not superseded by PRDs)

These stay authoritative — the PRDs point to them rather than replace them:

- **Runbooks** — `operations/e2e-local-test.md` and the active email/domain/local-development files under `infra/runbooks/`.
- **Maintenance** — `maintenance/stale-files-audit.md` (dead-code/removable-file audit; separate from this doc consolidation).
- **Deploy** — root `AGENTS.md` plus `.agents/skills/patina-deploy/SKILL.md`; retired self-hosted procedures live only under `_archive/`.
- **Analytics** — `specs/Data Tracking/`, `handoffs/sprint-2-posthog-dashboards/`.
- **Design references** — the-document prototypes + `CODEBASE-MAP.md` / `DECISIONS.md` under `design/the-document/`, `product/portal-vs-desk-feature-gap-matrix-v2.md`.

## Archive

Docs that a consolidated PRD fully replaces were moved to [`_archive/`](_archive/) (path-preserving, history intact via `git mv`). See the archive rationale in the [consolidated README](prds/consolidated/README.md#what-happened-to-the-old-docs).

## Templates

`prds/_template.md` · `specs/_template.md` · `architecture/_template.md`
