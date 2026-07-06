# Designer Portal — full-page crawl + error triage (2026-06-01)

Authenticated as `designer@patina.dev` (owns the seed data), navigated **all 107 routes**
(70 static + dynamic detail/edit pages with seeded IDs). Per page captured: DOM error
markers, failed network resources (`PerformanceResourceTiming.responseStatus >= 400`), and
React console errors.

## Method note / false-positive correction
Next.js **dev mode** compiles each route on first visit and hydrates client content after
~2–4s; Next also keeps the *previous* route painted during slow transitions. Early probes that
measured `innerText.length`/counts at 1.8–2.5s produced **false positives** — pages that looked
"blank" or showed "0"/"Loading…" were simply mid-render. Re-checked with longer waits +
screenshots + direct DB/RLS queries. The following were **NOT bugs** (render correctly once
loaded): settings, settings/security, vendors/[id] ("blank"); vendor directory ("ALL 0" → 20);
dashboard metric cards ("0" → correct, count-up animation mid-flight); inbox / notifications
("Loading…"). Procurement is feature-flag gated ("Coming Soon") by design.

## Confirmed errors (timing-immune: console-confirmed or visible literal text)

### A. React hydration mismatches (multiple pages) — server renders loading skeleton, client renders loaded content
- `clients/[id]/decisions/new` (`NewDecisionPage`): `if (isLoading) return <LoadingStrata/>`
  then `if (!client) return <p…>` → server emits the `LoadingStrata` pulse-bar
  (`div.py-20 > .h-[2px].w-[60px].animate-pulse.bg-patina-mocha`), client emits the `<p>`
  empty-state. `page.tsx:86`.
- `projects/[id]` (`ProjectDetailPage`): server `LoadingStrata` vs client `EditModeBar`.
- `projects/[id]/complete` (`ProjectClosurePage`): server `LoadingStrata` vs client `Breadcrumb`/content.
- **Downstream symptom:** global `NotificationDropdown` (top bar) logs a Radix
  `aria-controls` `useId` mismatch — caused by the server/client tree divergence above shifting
  the `useId` counter. Should resolve once the loading-gates are SSR/client-consistent.
- Root pattern: `'use client'` pages gate render on a TanStack-Query `isLoading` (or data)
  branch that differs between SSR and first client paint. Likely many more pages share it
  (grep the pattern repo-wide).

### C. Pervasive placeholder help-content rendered to users
The portal renders literal **"PLACEHOLDER — pending Leah review …"** copy across many surfaces
(dashboard Today, pipeline, leads, active-work, empty-states, etc.). Source: ~137 placeholder
help docs were bulk-published to the Sanity dataset the app reads; `@patina/help-system`
components use `effectiveBody = cmsBody ?? fallback`, so a truthy *placeholder* CMS body wins
over the (good) inline `fallback`. Fix centrally: treat placeholder-marked CMS bodies as a miss.

## Minor / noted (not dispatched)
- Detail-page breadcrumbs render the raw entity UUID before data loads (cosmetic, transient).
- Dashboard metric count-up shows `0` for a beat before settling to the real value (animation).
- No `error.tsx` / `not-found.tsx` boundaries exist in the portal app (resilience gap).
- PostHog "Surveys script" console error in local dev (expected — PostHog not configured locally).

## Fix dispatch
- Agent A → `@patina/help-system` placeholder-content guard (issue C).
- Agent B → designer-portal hydration-gate fix (issue A).
Both validated by re-crawl in Phase 3.
