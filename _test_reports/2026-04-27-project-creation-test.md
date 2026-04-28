# Project Creation Test — Local Dev Servers

**Date:** 2026-04-27 21:35–21:42 PT
**Tester:** Claude Code (browser-driven via claude-in-chrome MCP)
**Plan:** `/Users/kody/.claude/plans/create-a-test-plan-dynamic-peach.md`
**GIF:** `~/Downloads/project-creation-test.gif` (1029x1176, 22 frames)

## TL;DR

The 7-step Activation Wizard renders and navigates correctly, but **clicking "Activate Project" does not create a project**. The submit silently falls back to `withMockData` and routes the user to `/portal/projects/mock-project-<timestamp>`, which then renders **"Project not found."** No row is written to either `public.projects` or `svc_projects.projects`. Multiple compounding causes — see findings.

## Verdict per scenario

| # | Scenario | Result |
|---|---|---|
| 1 | Manual creation happy path | **FAIL** — wizard navigates UI but produces no project |
| 2 | Validation gating per step | **PARTIAL PASS** — 3 of 4 gates work; Step 02 gate is too permissive |
| 3 | Draft persistence (Zustand `persist`) | **PASS** — state restores across navigation |
| 4 | Proposal fast-path | **SKIPPED** — `select count(*) from public.proposals where status='accepted'` returned 0 |
| 5 | Permission negative test (client role) | **SKIPPED** — no `role='client'` profiles exist in seed (all 7 profiles are `'designer'`) |

## Pre-flight findings (block clean local testing)

These are environment defects that affect the test, not bugs introduced by the in-flight refactor — but they need fixing before this stack can run end-to-end.

1. **`services/projects/.env` is misconfigured for the local Supabase CLI stack.**
   - `DATABASE_URL=postgresql://patina:***@localhost:5432/projects?schema=public`
     vs. `.env.example`: `postgresql://postgres:postgres@localhost:54322/postgres?schema=svc_projects`
   - Wrong port (5432 vs 54322), wrong db (`projects` vs `postgres`), wrong schema, wrong creds.
   - Port 5432 has nothing on it locally — the service crashes on Prisma connect with `P1001: Can't reach database server at localhost:5432`.
   - **`JWT_SECRET=patina_dev_jwt_secret_32chars_min`** but local Supabase Auth signs with `super-secret-jwt-token-with-at-least-32-characters-long`. Even if DB worked, every authenticated request would 401.
   - Looks like the on-disk `.env` was copied from another environment.

2. **Seed `public.profiles` is malformed for testing role-based behavior:**
   - All 7 dev profiles have `role='designer'`. There are zero `role='client'` rows.
   - `client@patina.dev` profile has `role='designer'` (display name empty). The auth user exists but the profile is mislabeled.
   - This makes Scenario 5 (client-role negative test) impossible in current seed state.

3. **Empty `designer_clients` join table.** `useClients()` (`packages/supabase/src/hooks/use-clients.ts:74-95`) reads from `designer_clients` joined to `profiles`, not from `profiles` directly. The dropdown in Step 01 is empty because no `designer_clients` rows exist for any seeded designer. The wizard's `clientId` field cannot be set through the UI.

## Scenario 1 — Manual creation happy path (FAIL)

### What was tested

1. Logged in as `superadmin@patina.dev` (sub `a0000000-0000-0000-0000-000000000001`, profile role `designer`, display "Studio Manager"). Already authenticated via `sb-localhost-auth-token` cookie.
2. Cleared `localStorage[patina:activation-wizard]` for a fresh wizard run.
3. Drove all 7 steps with deterministic test data:
   - Step 01: name=`Test Project 2026-04-27-2311`, address=`123 Test Ave, Portland OR 97201`, **client left blank** (dropdown empty), designer left blank.
   - Step 02: 2 rooms — Living Room (14 x 18 ft, $30,000) + Kitchen (12 x 14 ft, $50,000).
   - Step 03: kickoff `2026-04-28` (auto-populated), 6 default phases, expected completion `December 7, 2026`.
   - Step 04: budget $80,000 (→ `budgetTotalCents: 8000000`), design fee $12,000, contingency 10%, 1 milestone "Deposit / 30%".
   - Step 05: skipped (optional).
   - Step 06: `client_visibility_tier='milestone'` (default).
   - Step 07: review pane shown, Activate enabled.
4. Cleared network buffer, clicked **Activate Project →**.

### What happened

| Channel | Observation |
|---|---|
| **URL after click** | `http://localhost:3000/portal/projects/mock-project-1777344025031` |
| **Wizard state** | `lastSavedAt: 2026-04-28T02:40:25.032Z`, `isDirty: false` (markSaved was called) |
| **Network log** (`urlPattern: api`) | **No `/api/projects` request appears in the trace.** The `read_network_requests` filter for `/api/` returned zero matches after the click. |
| **Console** | `Error: AppError: Project not found` (from the destination page's `useProject(id)` hook 404'ing on the mock id). PostHog `Failed to fetch` errors are unrelated network noise. No "Activation failed" error from `handleActivate` — meaning the mutation didn't reject. |
| **Detail page UI** | Plain `Project not found.` text. Breadcrumb shows `PIPELINE > ACTIVE > MOCK PROJECT 1777344025031`. |
| **DB — `public.projects`** | `select … from public.projects where created_at > now() - interval '10 minutes'` → **0 rows** |
| **DB — `svc_projects.projects`** | Same query → **0 rows** |

### Root cause

The activate flow is wrapped in a mock-fallback that silently swallows failures.

`apps/designer-portal/src/hooks/use-projects.ts:441-454`:
```ts
export function useCreateProject() {
  return useMutation({
    mutationFn: (data: unknown) => withMockData(
      () => projectsApi.createProject(data),
      () => Promise.resolve({ id: `mock-project-${Date.now()}` })
    )
  });
}
```

When `projectsApi.createProject(data)` throws (because `:3016` is closed and the proxy 502s, OR because the projects service rejects the body), `withMockData` returns the synthetic `{ id: 'mock-project-...' }`. The wizard then calls `wizard.markSaved()` and `router.push('/portal/projects/<mock-id>')` — the user sees an apparent success.

The activate POST never actually reaches the network layer in a way the test can capture, *and even if it did*, the request body shape doesn't match the NestJS DTO (see Architectural finding below).

### Compounding bugs surfaced by this scenario

1. **Wizard payload shape ≠ NestJS `CreateProjectDto`.** `apps/designer-portal/src/app/(portal)/portal/projects/new/page.tsx:79-87` posts:
   ```ts
   { name, status: 'active', budget_cents, design_fee_cents,
     start_date, client_visibility_tier, client_id }
   ```
   `services/projects/src/projects/dto/create-project.dto.ts` expects camelCase:
   `title, clientId, designerId, budget, currency, description, metadata`.
   Even if the projects service were running, validation would 400. The whole `useCreateProject → projectsApi.createProject` path is contract-broken.

2. **Most wizard data is dropped on submit.** The activate payload contains 7 fields. The wizard collects rooms (×N), phases (×6), milestones (×N), team, vendor assignments — none of these are in the POST body. Even on the happy path, `project_rooms`, `project_phases`, and `project_payment_milestones` would not be populated.

3. **The new hybrid use-projects.ts reads from `public.projects` (Supabase), but `useCreateProject` still posts to NestJS at `:3016`, which writes to its own `svc_projects.projects` table** (different schema, different columns). Even with both fixes above, a created NestJS project would not appear in subsequent UI reads.

4. **`withMockData` masking errors is itself the highest-impact UX bug.** Without mock fallback, the user would have seen a real error toast and `setError(err.message)` would have populated. With it, the failure looks like success — including a routed-to "project" page that immediately 404s. Recommend either removing `withMockData` from mutations entirely, or scoping it to read-only queries during dev.

## Scenario 2 — Validation gating per step (PARTIAL PASS)

| Step | Gate | Behavior | Verdict |
|---|---|---|---|
| 01 | `name.trim().length > 0` | Continue disabled with empty name; enables after typing | ✅ |
| 02 | `rooms.length > 0` | Continue disabled at 0 rooms — but **clicking "+ Add first room" creates an empty room (`name: ""`, `roomType: ""`, `dimensions: ""`, `budgetCents: 0`) and immediately enables Continue.** A user can advance to Step 03 with one totally blank room. | ⚠️ Too permissive |
| 03 | `kickoffDate.length > 0 && phases.length > 0` | `kickoffDate` is auto-populated from the store default (`2026-04-28`), so the gate never engages on a fresh wizard. Phases are also pre-populated with 6 defaults. | ✅ functions, but gate effectively can't be tested through the UI without manually clearing the date. |
| 04 | `budgetTotalCents > 0` | Continue disabled until budget input has a positive number | ✅ |

**Fix suggestion** for Step 02: gate on `rooms.length > 0 && rooms.every(r => r.name.trim() && r.roomType)` or similar.

## Scenario 3 — Draft persistence (PASS)

After Scenario 1 navigated away, returning to `/portal/projects/new` restored the wizard state from `localStorage[patina:activation-wizard]`:

```json
{
  "step": 7,
  "name": "Test Project 2026-04-27-2311",
  "address": "123 Test Ave, Portland OR 97201",
  "rooms": [{"name":"Living Room",...},{"name":"Kitchen",...}],
  "kickoffDate": "2026-04-28",
  "budgetTotalCents": 8000000,
  "isDirty": false,
  "lastSavedAt": "2026-04-28T02:40:25.032Z"
}
```

Zustand `persist` middleware works as designed.

**Side finding** worth noting: the persisted state includes `isDirty: false` and `lastSavedAt: <timestamp>` from the failed-but-mock-successful Scenario 1 activate. The store is treating the mock fallback as a successful save. A user returning to the wizard would see "07 · Review" + Activate-ready, when in reality nothing was persisted. This compounds the `withMockData` bug in #1.

## Scenario 4 — Proposal fast-path (SKIPPED)

Pre-check: `select count(*) from public.proposals where status='accepted'` → 0 rows. No accepted proposals to drive the `?fromProposal=…&projectId=…` flow. Skipped per plan's conditional rule.

## Scenario 5 — Client-role negative test (SKIPPED)

Pre-check: `select count(*), role from public.profiles group by role` →
```
 cnt |   role
-----+----------
   7 | designer
```
No `role='client'` profile exists. `client@patina.dev` is mislabeled `role='designer'` in `public.profiles`. Cannot exercise the "client cannot access `/portal/projects/new`" path through the seed data.

## Recommended fixes (priority order)

1. **Remove `withMockData` from `useCreateProject` and other mutations** (`apps/designer-portal/src/hooks/use-projects.ts:441-454`, also `useUpdateProject` ~`:474`, task/document mutations ~`:491-548`). Mocks belong in queries during early dev, not on the write path. Without this, every other bug in this list is invisible to the user.
2. **Decide and align the create write path.** Either (a) migrate `useCreateProject` to a Supabase-direct insert into `public.projects` to match the read path the rest of `use-projects.ts` already uses, or (b) update the NestJS `CreateProjectDto` + service to write through to `public.projects` and accept the wizard's snake_case shape. (a) is the smaller change and matches the trajectory of the in-flight refactor.
3. **Persist the wizard's rich data** (rooms, phases, milestones, team, vendors) via the same activate flow. Otherwise the wizard's UI promise — "create project workspace, generate room cards and FF&E pipeline, assign payment milestones" — is unfulfilled even after the create call is fixed.
4. **Fix `services/projects/.env`** for local Supabase CLI: copy from `.env.example` and replace `your-super-secret-password` with `postgres`.
5. **Fix dev seed**: add `role='client'` profiles, populate `designer_clients` for at least one designer↔client pair, and seed at least one `proposals.status='accepted'` row so all 5 scenarios become testable.
6. **Tighten Step 02 gate** to require non-empty room name + room type.

## Created artifacts

- 0 rows in `public.projects` (verified — no leftover test data)
- 0 rows in `svc_projects.projects`
- localStorage `patina:activation-wizard` left populated; reset with: `localStorage.removeItem('patina:activation-wizard')` in DevTools, or use the wizard's reset action when one exists.
- GIF: `~/Downloads/project-creation-test.gif`

No DB cleanup needed.
