# The Document — Slice 1: The Desk (read-only) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A flagged, read-only `/desk` route showing the designer's real engagements as folder cards (needs-your-hand stack + in-motion chips) above a persistent Studio Drawer, with the R3 shadow-ban lint landing in the same PR.

**Architecture:** One additive SQL view (`document_state`) unions the three engagement shapes (R1: project / live proposal chain / lead-or-relationship) with derived `active_section` and need-input counts; a pure TS module derives need lines, stamps, and sort order (unit-tested, no `@patina/help-system` imports — Jest ESM trap); presentational components implement the spec §10 recipes (stamp, stacked edge, tab) with zero shadows; everything gated by PostHog flag `the-document-pilot` (fail-closed, `NEXT_PUBLIC_FLAG_OVERRIDES` for dev).

**Tech Stack:** Next.js 15 App Router (new `(document)` route group — inherits root-layout Providers, protected by existing middleware), React Query via `createBrowserClient()` from `@patina/supabase`, Tailwind + portal CSS vars in `globals.css`, ESLint v9 flat config.

**Spec authority:** `docs/design/the-document/the-document-spec-v1.1.md` §4 (mapping), §6 (stamps R2), §7 (Desk), §8 (drawer), §10 (recipes/R3), §13 Slice 1. Prototype `patina-the-document-prototype-v3.html` for rhythm/motion.

---

## File map

| File | Responsibility |
|---|---|
| `supabase/migrations/00188_document_state_view.sql` | Create | engagement-union view, SECURITY INVOKER |
| `apps/designer-portal/src/app/globals.css` | Modify | add `--doc-paper/--doc-sheet-2/--doc-sheet-3/--doc-ink-border` tokens (additive) |
| `apps/designer-portal/src/app/(document)/layout.tsx` | Create | charcoal desk surface; mounts flag gate + StudioDrawer |
| `apps/designer-portal/src/app/(document)/document-gate.tsx` | Create | client gate: `useFeatureFlag('the-document-pilot')`, redirect `/portal` when off |
| `apps/designer-portal/src/app/(document)/desk/page.tsx` | Create | Desk: date line, ⌘K hint, needs-hand stack, in-motion chips |
| `apps/designer-portal/src/lib/document/desk-derivation.ts` | Create | pure: row types, need-line derivation, stamps, sorting, motion chips |
| `apps/designer-portal/src/lib/document/__tests__/desk-derivation.test.ts` | Create | unit tests (TDD) |
| `apps/designer-portal/src/hooks/use-desk-engagements.ts` | Create | React Query over `document_state` (60s poll = silent re-sort, D2) |
| `apps/designer-portal/src/components/document/strata-mark.tsx` | Create | 3-line mark primitive (sage/clay/pearl states) |
| `apps/designer-portal/src/components/document/stamp.tsx` | Create | ink-stamp recipe |
| `apps/designer-portal/src/components/document/folder-card.tsx` | Create | stacked-edge + tab + need line (+ urgent outline) |
| `apps/designer-portal/src/components/document/in-motion-chip.tsx` | Create | one-line non-actionable chip |
| `apps/designer-portal/src/components/document/studio-drawer.tsx` | Create | bottom strip, 5 ledger buttons + readout placeholder |
| `apps/designer-portal/src/components/document/overlays/doc-sheet.tsx` | Create | minimal custom sheet (no design-system overlay import; Esc/backdrop/focus) — first `Doc*` wrapper |
| `apps/designer-portal/eslint.config.mjs` | Modify | R3 rule blocks scoped to document dirs |

Folder cards are **not links in Slice 1** (the document route is Slice 2); render as `<article>`.

---

### Task 1: Tokens + route group + flag gate + empty desk shell

- [ ] Add to `globals.css` `:root` (after Extended Palette):

```css
  /* — The Document (spec v1.1 §10) — */
  --doc-paper: #FCFAF6;
  --doc-sheet-2: #EFE9DD;
  --doc-sheet-3: #E2DACA;
  --doc-ink-border: rgba(44, 41, 38, 0.18);
```

- [ ] `(document)/document-gate.tsx` — `'use client'`; `useFeatureFlag('the-document-pilot')`; `isLoading` → render `null`; `value===false` → `router.replace('/portal')` in effect + render `null`; else children.
- [ ] `(document)/layout.tsx` — `'use client'` wrapper or server shell: full-height div `bg-[var(--color-charcoal)] min-h-screen pb-16` (pb for drawer), `<DocumentGate>{children}<StudioDrawer/></DocumentGate>` (drawer stubbed until Task 5; start without it).
- [ ] `(document)/desk/page.tsx` — placeholder: long-form date (DM Mono small caps) + "Find anything ⌘K" right-aligned hint.
- [ ] Verify: `pnpm --filter designer-portal type-check` passes. Commit `the-document: slice 1 — route group, flag gate, doc tokens`.

### Task 2: `document_state` view (migration 00188)

- [ ] Write migration: 4 union branches, identical column list, SECURITY INVOKER, `grant select to authenticated`:
  - **A `project`:** one row per `projects` row; `active_section` = CASE completed→`care`; current_phase ∈ (installation, final_walkthrough)→`install`; else→`project`. `is_paused = status='on_hold'`, `is_archived = status='archived'`. Lateral need-counts: overdue pending decisions (`client_decisions` by project_id), FF&E counts (`awaiting_inspection` = status delivered AND received_quantity IS NULL; `blocked_item_count`; `in_flight_count` = ordered/production/shipped; `item_count`).
  - **B `proposal`:** live proposal per chain — `DISTINCT ON (coalesce(parent_proposal_id, id))` over `proposals WHERE project_id IS NULL AND status IN ('draft','sent','viewed','declined','expired')` ordered by `version DESC`; `active_section` = draft→`direction`, else→`proposal`; overdue decisions via `linked_proposal_id IN (id, chain_root)`.
  - **C `lead`:** `leads WHERE designer_id IS NOT NULL AND status IN ('new','viewed','contacted')`; `active_section='brief'`; carries `response_deadline`, `lead_status`; title from `project_type`.
  - **D `relationship`:** `designer_clients WHERE status='lead'` AND NOT EXISTS live proposal for (designer,client) AND NOT EXISTS open lead row; `active_section='discovery'`.
- [ ] `supabase db reset`; sanity: `psql ... -c "select engagement_kind, active_section, count(*) from document_state group by 1,2"` returns plausible seeded rows.
- [ ] Commit `the-document: slice 1 — document_state engagement-union view (00188)`.

### Task 3: desk-derivation (TDD)

- [ ] Write failing tests first: overdue decision beats hesitation; lead deadline urgency (<48h or past = urgent); proposal sent>3d unviewed → hesitating; viewed>5d unsigned → hesitating; declined → need with DECLINED stamp; delivered-awaiting-inspection need (R2); paused project → motion chip "Paused", never a need; draft proposal → motion chip; sort = urgent first then severity then date; archived rows dropped entirely.
- [ ] Run `pnpm --filter designer-portal test -- desk-derivation` → FAIL (module missing).
- [ ] Implement `desk-derivation.ts`: `DocumentStateRow`, `NeedLine {kind,text,stamp:{label,color},urgent}`, `deriveNeed(row, now)`, `deriveMotion(row)`, `partitionDesk(rows, now) → {folders, chips}`. Need priority: overdue_decision > declined/expired proposal > lead (Brief) > hesitating proposal > awaiting_inspection. Stamp colors via CSS-var strings (golden-hour / terracotta / clay / dusty-blue / sage). **No imports from stages.ts/help-system.**
- [ ] Tests pass. Commit `the-document: slice 1 — desk need-line derivation (tested)`.

### Task 4: data hook

- [ ] `use-desk-engagements.ts`: `createBrowserClient() as any` (repo pattern), `useQuery({queryKey:['document-state'], queryFn: from('document_state').select('*'), refetchInterval: 60_000})`, returns `partitionDesk` output + auth user gate. Commit.

### Task 5: primitives + folder + drawer

- [ ] `strata-mark.tsx` — 3 stacked bars, widths 100/70/40%, 2px high, gap 2px; `state: 'settled'|'active'|'future'` → sage/clay/pearl; `size: 'sm'|'md'`.
- [ ] `stamp.tsx` — DM Mono 600 uppercase, tracking 0.1em, 1.5px solid currentColor border, 3px radius, `rotate(-1.5deg)`, transparent fill, px-1.5 py-0.5 text-[10px]; color prop sets CSS var.
- [ ] `folder-card.tsx` — relative wrapper; two absolutely-offset sheets behind (`--doc-sheet-2` at 2.5px/2.5px, `--doc-sheet-3` at 5px/5px, 1px `--doc-ink-border`, same radius); paper face `--doc-paper`, 1px ink border, paper-grain via repeating-linear-gradient (4px, rgba(139,115,85,0.012)); tab = absolute -top-[14px] left-5, paper fill, ink border no-bottom, 5px top radii, DM Mono 11px surname; body: Playfair title, stage line (DM Mono, muted), need line (Inter 14px) + `<Stamp/>`; urgent → `outline: 1.5px solid rgba(232,197,71,0.55); outline-offset:-1.5px`; hover `-translate-y-[3px] transition-transform duration-[250ms]`; `prefers-reduced-motion` respected (motion-safe: variants).
- [ ] `in-motion-chip.tsx` — pearl-on-charcoal quiet row: title + one-line summary, 1px ink border, transparent fill.
- [ ] `overlays/doc-sheet.tsx` — custom (no design-system overlay imports): portal-less fixed overlay, backdrop `rgba(0,0,0,0.35)` click-to-close, panel `fixed inset-x-0 bottom-0 max-h-[72vh] bg-[var(--color-charcoal)] border-t border-[var(--doc-ink-border)]`, translate-y enter 250ms ease-out (motion-safe), `role="dialog" aria-modal`, Esc closes, focus moves in on open/returns on close.
- [ ] `studio-drawer.tsx` — `fixed bottom-0 inset-x-0 h-12 bg-[var(--color-charcoal)] border-t border-[rgba(250,247,242,0.12)]`; left label "STUDIO" (DM Mono 10px, pearl 50%); five buttons (Library clay / Orders dusty-blue / Accounts sage / People terracotta / Hours mocha) each with 3px×14px spine tick + DM Mono label; right readout "In hand today · —" (static placeholder, Slice 5); click opens `DocSheet` stub: ledger name (Playfair) + "This ledger arrives in a later slice." No badges.
- [ ] Commit per component group.

### Task 6: desk page assembly

- [ ] Compose: header row (date Playfair italic? — check prototype rhythm; ⌘K hint DM Mono) · "NEEDS YOUR HAND" DM Mono section label + StrataMark · folder grid (max-w ~720px column or 2-col ≥1280) · "IN MOTION" chips (cap 6) · loading = quiet skeleton, empty = "Nothing needs your hand." line. Commit.

### Task 7: R3 lint + deliberate-violation proof

- [ ] Append two blocks to `eslint.config.mjs` scoped to `['src/app/(document)/**/*.{ts,tsx}','src/components/document/**/*.{ts,tsx}','src/lib/document/**/*.{ts,tsx}']`:
  1. `no-restricted-syntax`: selectors `Literal[value=/(^|[\s'"`:])shadow-(?!none)/]`, `TemplateElement[value.raw=/(^|[\s'"`:])shadow-(?!none)/]`, `Literal[value=/box-shadow|drop-shadow/]`, `TemplateElement[value.raw=/box-shadow|drop-shadow/]` — message cites D4/R3.
  2. `no-restricted-imports` paths `@patina/design-system` importNames `Dialog, DialogContent, Popover, PopoverContent, Command, CommandDialog, Tooltip, TooltipContent, Sheet, SheetContent, Drawer, DrawerContent` — message: "enter via Doc* wrappers (components/document/overlays)".
- [ ] Prove: temp file with `className="shadow-lg"` in document dir → `pnpm --filter designer-portal lint` FAILS; delete temp; lint passes. Record output for PR. Commit.

### Task 8: verification + screenshots + decisions

- [ ] `pnpm --filter designer-portal lint && type-check && test` all green.
- [ ] `supabase db reset` (if not done); ensure flag override in `apps/designer-portal/.env.local` (`NEXT_PUBLIC_FLAG_OVERRIDES=the-document-pilot:true`); `pnpm dev:designer`; sign in as `designer@patina.dev`; verify folders match seeded reality (cross-check a need line against the DB by hand).
- [ ] Chrome MCP screenshots: `/desk` at ≥1280 and ~390px → `docs/design/the-document/screenshots/slice-1/`.
- [ ] Append DECISIONS.md: I4 (pre-signing engagements rendered on Desk from the view; no `/doc` route yet — Slice 2 will log the route scheme), I5 (DocSheet implemented without design-system overlay primitives; import-ban exemption deferred until a wrapper needs one), I6 (hesitation thresholds v1: sent>3d unviewed, viewed>5d unsigned — tune with Leah), plus anything discovered.
- [ ] Commit; push; PR `the-document: slice 1 — the desk (read-only)` with §13 acceptance checklist + lint-proof + screenshots + "what to click".

## Acceptance (spec v1.1 §13)
- [ ] Real Tuesday folders correct with truthful need lines (verified against seed/DB)
- [ ] Zero shadows on Document surfaces
- [ ] Lint fails a deliberately-shadowed test commit (output captured)
