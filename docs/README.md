# Strata Documentation Index

Reference documentation for specs, PRDs, and architecture. Claude reads this index to find relevant docs on-demand.

---

## Implementation Status

### Currently Implementing
| Spec | Started | Progress | Last Update |
|------|---------|----------|-------------|
| [product-capture](_active/product-capture.md) | 2026-01 | In Progress | 2026-01-24 |
| [vendor-management](_active/vendor-management.md) | 2026-01 | In Progress | 2026-01-24 |
| [mobile-companion](_active/mobile-companion.md) | 2026-01 | In Progress | 2026-01-24 |
| [mobile-first-launch](_active/mobile-first-launch.md) | 2026-01 | In Progress | 2026-01-24 |

### Recently Completed
| Spec | Completed | Duration |
|------|-----------|----------|
| *None yet* | — | — |

---

## Specs (Feature Requirements)

### Active (In Development)
| File | Description |
|------|-------------|
| `specs/_active/product-capture.md` | Chrome extension product + vendor capture flow |
| `specs/_active/vendor-management.md` | Vendor CRUD, reviews, trade accounts - portal module |
| `specs/_active/mobile-companion.md` | iOS companion system - navigation, states, gestures |
| `specs/_active/mobile-first-launch.md` | First launch user story - threshold to walk flow |

### Pending
*No pending specs — create new specs in `specs/` folder*

## PRDs (Product Requirements)

| File | Description |
|------|-------------|
| `prds/monorepo-bootstrap.md` | Initial Strata monorepo setup and architecture |

## Architecture

| File | Description |
|------|-------------|
| `architecture/ios-development-plan.md` | iOS app architecture, SwiftUI patterns, phase plan |

## Wireframes (Interactive HTML)

| File | Description |
|------|-------------|
| `wireframes/web-companion.html` | Portal AI companion embedded interface |
| `wireframes/mobile-companion-flow.html` | iOS companion navigation flows |
| `wireframes/mobile-immersive-experience.html` | iOS immersive furniture discovery |

---

## Pending Specs (To Be Created)

These specs are referenced in CLAUDE.md files but don't exist yet:

| File | Needed For | Description |
|------|------------|-------------|
| `specs/portal-companion.md` | Portal | AI shopping companion feature for web |
| `specs/room-scanning.md` | Mobile | iOS room capture and sync with Supabase |
| `architecture/data-flow.md` | All | How data moves between apps |
| `architecture/auth-flow.md` | Portal | Supabase SSR auth patterns |
| `architecture/embedding-pipeline.md` | All | pgvector embedding system |

---

## Templates

Use these templates when creating new documentation:

| Template | Purpose |
|----------|---------|
| `specs/_template.md` | Feature specifications with implementation checklists |
| `prds/_template.md` | Product requirement documents |
| `architecture/_template.md` | Architecture Decision Records (ADRs) |

---

## Workflow

1. **Create spec** - Copy `specs/_template.md` to `specs/[feature].md`
2. **Implement** - Run `/implement docs/specs/[feature].md`
3. **Track** - Spec moves to `_active/`, progress logged in `implementation/`
4. **Complete** - Spec moves to `_completed/`, status updated here

---

*Add new docs here as they're created. Keep descriptions to one line.*
