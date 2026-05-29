# Active Project Screens — QA Findings (live Chrome walk)

Source: live Chrome walk on local seeded dev, signed in as `designer@patina.dev`.
Fixtures: **Full Room Design** `e446e32b-6b69-4fa7-89fd-08300b67f4ca` (active, phase=concept, 2 rooms / 2 FF&E / 2 phases / 3 milestones, budget $2,900) and **Aspen Loft Refresh** `b0000000-0000-0000-0000-0000000000d1` (active, phase/start_date NULL, 0 rooms/ffe/phases/milestones, 5 decisions, budget $120k).

Severity: P0 crash · P1 core-broken · P2 incomplete/wrong-data · P3 cosmetic.
Layer: UI · Supabase · svc_projects.

---

## A — Projects list (`/portal/projects`)

| ID | Sev | Layer | Finding | Evidence |
|----|-----|-------|---------|----------|
| AP-A1 | P2 | UI | **CLIENT column is blank for every row** though both projects have a `client_id`. The list query embeds `client:profiles!...` but the row component doesn't render the name (or embed not selected). | Screenshot: CLIENT header present, all cells empty. |
| AP-A2 | P2 | UI | **Row "BUDGET" disagrees with the data.** "Full Room Design" row shows **$6,900** but `projects.budget_cents` = 290000 ($2,900); the ACTIVE VALUE metric ($123k) is computed from $2,900 (120k+2.9k≈123k). Row budget and metric use different sources. | DB vs row. |
| AP-A3 | P3 | UI/Supabase | **INVOICED metric = $0** though Full Room Design has 3 payment milestones. Confirm whether any are `outstanding`/`paid` (metric sums those). | Metric header. |

Default-mode console on list page: **clean** (no mock-fallback warning, no errors) → list uses real Supabase data. List metrics ($123k / 2 projects / 2.8mo) appear real (not the old mock "$142k/5 projects" — X-04 list metrics looks fixed).

_Pending interaction tests: status tabs, search, sort, grid/table toggle, bulk select, row→detail._

---

## C — Active Project detail (`/portal/projects/[id]`)

| ID | Sev | Layer | Finding | Evidence |
|----|-----|-------|---------|----------|
| AP-C0 | **P0** | UI | **✅ FIXED — Detail page crashed for any realistically-activated project.** `ProjectIdentityHeader` did `PHASE_CONFIG[phase].color` with no guard; the project's `current_phase='concept'` is NOT a canonical `PhaseSlug` (canonical = consultation/concept_development/design_refinement/procurement/installation/final_walkthrough) → `phaseConfig` undefined → `Cannot read properties of undefined (reading 'color')`. Mock fixtures used canonical phases so this never surfaced. Root: proposals/scope-builder write a simplified phase vocab (`concept`) that diverges from canonical. **Fix applied:** added `normalizePhaseSlug()` to `@patina/types/phase-config.ts` (alias `concept→concept_development`, safe `consultation` fallback); normalized at `page.tsx` current_phase, `project-identity-header.tsx`, `phase/[phaseId]/page.tsx`. Verified: page renders, phase shows "Schematic Design". | Runtime TypeError overlay; fixed + reloaded clean. |
| AP-C1 | P1 | UI/Supabase | **Client name missing on detail header**, leaving a dangling "· Started …" separator. `ProjectIdentityHeader` reads `project.client_name`, but `useProject` returns the client as a nested `client:profiles{full_name}` embed — `client_name` is never populated. Same root as AP-A1 (list). | Header shows "· Started May 28, 2026" with no name. |
| AP-C2 | P3 | UI | **"Started" date off by one** ("May 28" for `start_date=2026-05-29`). `formatStartDate` parses the date-only string as UTC midnight, then renders in local TZ (behind UTC) → previous day. Use TZ-safe date formatting. | Header. |
| AP-C4 | P1 | UI | **Phase Timeline shows every phase as "pending"** — none highlight as active/done even though the project is mid-`concept` with a `procurement` phase. `PhaseTimelineV2` matches `segments.find(s => s.phase === canonicalSlug)`, but DB rows expose `phase_key` (not `phase`) AND use non-canonical keys. Fix: adapt `phase_key`→normalized slug when building/ matching segments (+ tasks/approvals filters). | Timeline all-grey. |
| AP-C3 | — | — | (Initially "FF&E 0/0 & no Room grid despite 2 rooms/2 FF&E") → **RECLASSIFIED as test artifact**: I was logged in as admin@patina.dev (…002); projects owned by designer@patina.dev (…004); `project_rooms`/`project_ffe_items` RLS correctly scopes to `designer_id=auth.uid()`. Re-test as the owner. | — |

## SEC — Security / RLS

| ID | Sev | Layer | Finding | Evidence |
|----|-----|-------|---------|----------|
| AP-SEC1 | **P1** | Supabase | **`projects` table RLS is wide open.** The only policy is `"Allow authenticated access to projects"` → `cmd=ALL`, `USING (true)`. Any authenticated user (any designer/client) can SELECT/INSERT/UPDATE/DELETE **any** project. Should be scoped to `designer_id = auth.uid()` OR `client_id = auth.uid()` (+ team members), mirroring the correct policies on `project_rooms`/`project_ffe_items`. New migration required. | `pg_policies` dump. |

_Note: walk continues signed in as the real owner `designer@patina.dev` (…004) to exercise RLS-scoped rooms/FF&E/financials._

### Confirmed via code + DB (extension dropped host permission mid-walk; continuing via code/DB + will verify via Playwright)

| ID | Sev | Layer | Finding | Root cause |
|----|-----|-------|---------|------------|
| AP-A1 / AP-C1 | P1 | Supabase(seed) + UI | **Client name blank on list & detail.** Seed `profiles.full_name` is EMPTY for client `…005` (and designer `…004`). List falls back to `client?.full_name` (empty). Detail header additionally reads the wrong field `project.client_name` instead of the `client:profiles{full_name}` embed. Also **client `…005` has `role='designer'`** (should be `client`). | Seed data + header field. |
| AP-A2 | P2 | UI | **Budget inconsistency.** List row uses `total_amount_cents` (=budget+fee, $6,900) while detail KeyMetrics + list "Active Value" metric use `budget_cents` ($2,900). Three surfaces, two definitions. | `projectBudgetCents` precedence vs metric/detail. |
| AP-C6 | P1 | UI | **Detail-page Financials (Zone 6) never renders for real projects** + **fabricated earnings.** `page.tsx` does `Array.isArray(financials) ? … : []` but `useProjectFinancials` returns an aggregate **object** → `typedFinancials=[]` → panel hidden. Also passes hardcoded `designerEarnings` (commissions 268700, rate .15) — fabricated. | Object-vs-array shape + hardcoded earnings (`page.tsx:143-148`). |
| AP-G-ok | — | — | **Dedicated `/financials` page is solid**: B-05 (cards==table via `totalsRow`), SEED-03 (`isLeadDesigner = user.id===leadDesignerId`), B-07 (disabled-not-alert) all already fixed. | — |
| AP-C7 | P3 | UI | **Top layout breadcrumb shows raw UUID** ("E446E32B 6B69 4FA7…") instead of project name (the in-page Breadcrumb uses name; the global PIPELINE>ACTIVE>… crumb uses the URL segment). | layout breadcrumb. |

### Status (this pass)

**Fixed + verified** (Playwright `e2e/projects/active-project.spec.ts`, chromium, signed in as the real owner; app `tsc` clean; lint 0 errors):
- AP-C0 — phase-normalization crash. `normalizePhaseSlug()` in `@patina/types`; applied in detail page, identity header, phase route. Spec asserts no crash + "Schematic Design" renders for a `current_phase='concept'` project.
- AP-C1 / AP-A1 — client names. Seed UPSERTs `full_name`/role; embeds + header/list resolve `full_name → display_name → email`; header joins parts (no dangling "· Started"). Spec asserts "Client User" on the header.
- AP-C2 — TZ-safe "Started" date.
- AP-C4 — phase timeline maps `phase_key`→normalized slug (was all-pending).
- AP-C6 — detail Financials panel adapts the aggregate object → line items + derives real 12% earnings (was hidden + fabricated).
- AP-SEC1 — `projects` RLS scoped (migration 00168), applied live + verified (5 policies).
- All 7 detail sub-routes (`/`, `/edit`, `/decisions`, `/ffe`, `/financials`, `/scope-change`, `/complete`) load with **no runtime crash** (spec).
- Test infra: bumped Playwright per-test timeout 30s→60s (auth fixture cold-compile headroom).

**Remaining / not yet done (honest record):**
- **Backend (svc_projects) — NOT yet built.** Tasks/documents/activity/time-tracking still route through `withMockData` (default mode masks failures). Needs the live-mode (`DATA_MODE=live`) integrity pass + JWT-authenticated endpoint checks to scope whether svc_projects endpoints are functional-but-empty vs. broken before building. (Phase 2 / backend lane.)
- **AP-A2** — "Budget" label means `total_amount_cents` (list row) vs `budget_cents` (detail/metric); per `supabase/CLAUDE.md` these are intentional distinct columns → needs a product decision on labels, not a code bug.
- **AP-C7** — global layout breadcrumb shows raw UUID instead of project name (P3).
- **`/projects/new`** — a dead "Sandbox · no API calls yet" mockup page, separate from the real wizard at `/portal/projects/new` (confusing duplicate).
- Interactive create/update behaviors on E (decisions "+ New"), H (scope-change create), J (complete/archive) — sub-routes load clean, but their write actions weren't individually exercised this pass.
- Live manual Chrome walk paused — extension lost host permission; Playwright covered the navigate/crash verification as the real owner.

### Fix batch (Phase 4) — high-confidence, implemented
1. ✅ AP-C0 phase normalization.
2. AP-SEC1 — `projects` RLS migration (scope to designer/client/team).
3. AP-A1/C1 — seed `full_name`s + fix client `…005` role; detail header → client embed.
4. AP-C6 — detail Financials: adapt `byCategory`→line items + compute real earnings (reuse `/financials` derivation).
5. AP-C4 — phase timeline: map `phase_key`→normalized slug for segment matching.
6. AP-A2 — budget definition consistency across list row / metric / detail.
7. AP-C2 — TZ-safe "Started" date.
