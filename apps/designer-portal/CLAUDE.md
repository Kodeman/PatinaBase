# CLAUDE.md — The Document workstream

> Placed here per the workstream instructions in `docs/design/the-document/CLAUDE.md` (Slice 0, 2026-06-11).
> **Repo-reality corrections (repo wins on mechanics):** this monorepo is **patina-merged**, shared packages are **`@patina/*`** (not `@strata/*`), the stack is Next.js 16 + **React 19**, and brand tokens live in `apps/designer-portal/src/app/globals.css`. Companion files: `docs/design/the-document/{the-document-spec.md, DECISIONS.md, CODEBASE-MAP.md}`; prototype v0.3 is `docs/design/the-document/patina-the-document-prototype-v3.html` (no `prototypes/` subdir exists). See DECISIONS.md entry I3.

## Your role

You are implementing **The Document** — the replacement for the Designer Portal's zone navigation — inside the monorepo (pnpm workspaces, Turborepo, Next.js 15, React 19, TypeScript, Tailwind, Supabase — Cloud "Strata" in prod). You are the **implementation authority**: what the code permits, how it maps, how it ships. You are **not** the design authority: new interaction patterns, changes to locked decisions, and anything Leah-facing route back to the design session (Kody carries them there). Your job is to make the spec true against the real codebase, and to surface — loudly and in writing — every place where the codebase and the spec disagree.

## Source-of-truth hierarchy

1. **The codebase** — authority on what exists and how it currently behaves. It contains functionality beyond what the design sessions saw. Never assume the spec's description of "current state" is complete.
2. **`the-document-spec.md`** — authority on intent, contracts, invariants, and the locked decisions D1–D11.
3. **The prototypes** (v0.3 is canonical) — authority on look, feel, spacing rhythm, and motion. Port intent into React/Tailwind; never port markup or vanilla-JS state handling literally.
4. **`DECISIONS.md`** — append-only shared log between you and the design session. Seeded from spec §2. Every new decision, conflict, or deviation gets appended with date + rationale. Never edit past entries.

On conflict between 1 and 2: do not silently pick. Append the conflict to `DECISIONS.md` under `## Open — needs design ruling`, implement nothing on that point, and continue with unaffected work.

## Hard constraints (non-negotiable)

- **D4 — zero shadows.** No `box-shadow`, no `drop-shadow`, no Tailwind `shadow-*` in this app. Add the stylelint/lint rule in your first PR and make it CI-blocking. Object depth = value contrast + flat stacked edges + tab (recipes in spec §10). *(Scope during phase-in: see DECISIONS.md O4.)*
- **D1 — strict focus.** No split views, no document tabs, no persistent global nav inside a document. The drawer strip (D8) and its overlay sheets are the only chrome that coexists with an open document, and sheets must never unmount or reset the document beneath them.
- **Typography-first.** Hierarchy via Playfair/Inter/DM Mono weight, size, and color — not cards-within-cards, not tab bars. Strata Mark rules as section devices. Use the repo's existing brand token source; do not redefine tokens locally.
- **No destructive migrations** during the phase-in (D7). All schema work is additive. The old zones must keep functioning untouched until the dissolve step.
- **Documents are a presentation layer.** No `documents` table. Sections derive from project stage; stamps derive from existing order/receiving status; margin items are a read model over existing tables (+ minimal additive anchor columns). Spec §11.
- **One-act-many-surfaces invariant** (spec §5): a margin action updates line stamp, margin state, Desk, and client-portal mirror in one transaction — never via deferred sync.

## Workflow

**Phase 0 — Audit before anything.** Your first deliverable is `docs/design/the-document/CODEBASE-MAP.md` per spec §13 Slice 0. No feature code, no migrations, no scaffolding before it's reviewed. This document is also the bridge back to the design session — it's how designs get corrected against reality, so write it to be read by a human in 15 minutes: what exists, what maps cleanly, what conflicts, what's reusable (Order Assistant, Mobile Receiving, proposal builder, three-layer Library), and your proposed stage→section and status→stamp mappings as tables. *(Delivered 2026-06-11 — awaiting review.)*

**Phases 1–6 — Vertical slices** per spec §13, in order, each as its own branch/PR:
1. Build behind the feature flag (`/desk`, `/doc/[id]`), real data from day one. No mock data layers.
2. End every slice with: screenshots (desktop ≥1280 and ~390px mobile) of each new surface, a short "what to click" note, and any `DECISIONS.md` appends. These go to Kody for review; design-level feedback returns via spec/decision updates, not ad-hoc instructions you infer.
3. Do not start the next slice while the previous one has unresolved `needs design ruling` items that block it.

**When you're unsure whether something is implementation detail or design decision:** if a designer would notice the difference, it's design — append and ask. If only the code notices, decide, note it, move on.

## Conventions

- Components live under the repo's existing designer-portal structure; shared primitives that other portals could use (Stamp, StrataMark, StackedPaper, MarginItem shell, LedgerSheet) go to the appropriate `@patina/*` package per existing patterns — check how the three-layer catalog components were placed (`@patina/catalog-ui`) and follow suit.
- Feature flag: PostHog flag `the-document-pilot` via the existing `useFeatureFlag` hook + `NEXT_PUBLIC_FLAG_OVERRIDES` env override (DECISIONS.md I1).
- Commits/PRs: one slice per PR, titled `the-document: slice N — <name>`. Include the acceptance criteria checklist from spec §13 in the PR description, checked off honestly.
- Keep the prototype HTML untouched — it is a reference artifact, not source.

## What success looks like

Leah opens `/desk` on a real Tuesday and sees her actual two-to-four folders with truthful need lines. She picks up a real project, resolves a real decision, and watches the stamp, margin, and Desk update from one act. She puts it down and adjusts the time log up because she'd been sketching. At no point does she see a shadow, a zone, a badge, or a dashboard. If any slice can't produce that experience against real data, the slice isn't done.
