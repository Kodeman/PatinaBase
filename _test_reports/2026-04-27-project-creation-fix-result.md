# Project Creation Fix — Execution Result

**Date:** 2026-04-27 22:30 PT
**Plan:** `_test_reports/2026-04-27-project-creation-fix-plan.md`
**Source defects:** `_test_reports/2026-04-27-project-creation-test.md`

## Result: create flow fixed end-to-end ✅

**Before:** Activate Project → `/portal/projects/mock-project-1777344025031` → "Project not found." Zero DB rows.

**After:** Activate Project → `/portal/projects/f433400d-aaa6-4404-aece-04dddc12f19a` (real UUID). DB rows:
```
    tbl     | count |                                    array_agg
------------+-------+---------------------------------------------------------------------------------
 project    |     1 | {"RPC E2E Test 2026-04-27"}
 rooms      |     1 | {"Living Room"}
 phases     |     6 | {Initiation,"Design Development",Procurement,Production,Installation,Close-out}
 milestones |     0 | (none entered in this run)
 team       |     1 | {lead_designer}
```
Project columns: `name="RPC E2E Test 2026-04-27", status='active', budget_cents=8000000, design_fee_cents=1200000, client_visibility_tier='milestone', client_id=<client@patina.dev>, designer_id=<current user>`.

## Tasks completed

| # | Task | Status |
|---|---|---|
| 1 | Strip `withMockData` from `useCreateProject` | ✅ |
| 2 | Add `00086_activate_project_rpc.sql` (cascade RPC) | ✅ — applied locally + smoke-tested |
| 3 | Wire `useCreateProject` to RPC + send full payload | ✅ |
| 4 | Tighten Step 02 gate | ✅ — verified "Continue" disabled with empty room |
| 5 | Seed `designer_clients` + accepted proposal | ✅ — applied to running DB; seed files added for future resets |
| 6 | Local `services/projects/.env` fix | **⏭ Deferred** — projects service is no longer on the create critical path; not needed for the wizard. The service still drives tasks/documents/activity (mock-fallback today) so the env fix is a separate cleanup. |
| 7 | End-to-end via claude-in-chrome | ✅ — wizard drove all 7 steps, real UUID returned, cascade rows verified |

## Schema adjustments made during execution

The plan's RPC SQL needed two corrections discovered when applying:

1. `public.projects` has **three generated columns**: `lead_designer_id` (mirrors `designer_id`), `kickoff_date` (mirrors `start_date`), `expected_completion_date` (mirrors `target_end_date`). The original INSERT listed all of them and Postgres rejected with `cannot insert a non-DEFAULT value into column "lead_designer_id"`. Removed those three columns from the INSERT.
2. `public.project_phases` uses `target_end_date`, not `end_date`.
3. `public.project_rooms.ffe_categories` is a `text[]` array, not jsonb. Used `ARRAY(SELECT jsonb_array_elements_text(...))` to convert.

The committed migration in `supabase/migrations/00086_activate_project_rpc.sql` reflects these fixes.

## New findings surfaced during verification (out of scope, but worth flagging)

The wizard create now produces a project with a real UUID — but the **project detail page** at `/portal/projects/<uuid>` errors out. Console:

```
AppError: Could not embed because more than one relationship was found for
  'client_decisions' and 'client_decision_options'
AppError: infinite recursion detected in policy for relation "project_team_members"
```

Both are **pre-existing bugs unrelated to this fix plan**:

1. **`client_decisions ↔ client_decision_options` ambiguous embed**: Migration `00084` (or `00085_decision_feedthrough_rpc`) added a second FK so PostgREST can't disambiguate the join. Fix: in the consuming query, specify the relationship explicitly via the FK name (e.g. `recommended_option:client_decision_options!recommended_option_id(...)`).
2. **RLS recursion on `project_team_members`**: An RLS policy on `project_team_members` references back into the same table (or another that references it), causing infinite recursion when Postgres evaluates the policy. Fix: rewrite the policy to use a `SECURITY DEFINER` helper function or restructure the predicate.

Recommend filing these as separate tickets.

## Verification artifact

Test project still in DB for inspection: `id = 'f433400d-aaa6-4404-aece-04dddc12f19a'`. Cleanup when done:
```sql
DELETE FROM public.projects WHERE id = 'f433400d-aaa6-4404-aece-04dddc12f19a';
-- (cascade FK deletes child rooms/phases/team)
```

## Files changed (mine)

**New:**
- `supabase/migrations/00086_activate_project_rpc.sql` — `activate_project_v2(input jsonb)` RPC
- `supabase/seed/designer-clients.sql` — wires 4 dev designer profiles to client@patina.dev
- `supabase/seed/proposals.sql` — one accepted proposal for the fast-path scenario

**Modified:**
- `supabase/config.toml` — added new seed files to `sql_paths` (1-line change)
- `apps/designer-portal/src/hooks/use-projects.ts` — `useCreateProject` rewritten to call `supabase.rpc('activate_project_v2', { input })`
- `apps/designer-portal/src/app/(portal)/portal/projects/new/page.tsx` — `handleActivate` sends full wizard payload (rooms/phases/milestones/team); Step 02 `canAdvance` now requires room name + room type

**Note on the two TS files:** the user already has pre-existing in-flight refactor changes to both files. My edits are layered on top. Recommend `git add -p` to slice out my hunks if they should land as separate commits; otherwise they go with the user's WIP.

## Suggested commits

```bash
# 1. The RPC migration (clean, only my files)
git add supabase/migrations/00086_activate_project_rpc.sql
git commit -m "feat(supabase): add activate_project_v2 RPC for wizard cascade insert"

# 2. The seed updates (clean)
git add supabase/seed/designer-clients.sql supabase/seed/proposals.sql supabase/config.toml
git commit -m "chore(supabase): seed designer↔client relationship and accepted proposal"

# 3. The frontend wiring (interleaved with user WIP — needs `git add -p`)
git add -p apps/designer-portal/src/hooks/use-projects.ts \
           apps/designer-portal/src/app/(portal)/portal/projects/new/page.tsx
git commit -m "feat(designer-portal): wire activate to activate_project_v2 RPC + tighten Step 02 gate"
```

The `_test_reports/` directory is currently untracked — keep or delete to taste.
