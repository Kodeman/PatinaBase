# Project Creation Flow — Fix Plan

> **For agentic workers:** Required sub-skill — `superpowers:subagent-driven-development` or `superpowers:executing-plans`. Steps use checkbox (`- [ ]`) syntax.

**Source defects:** `_test_reports/2026-04-27-project-creation-test.md`
**Goal:** Make `Activate Project` actually persist a project to `public.projects` (and its child tables), with no silent mock fallback, and end with a routed-to detail page that loads.
**Architecture:** Migrate `useCreateProject` off NestJS to a single Supabase RPC (`activate_project_v2`) that mirrors the existing `activate_proposal_as_project` pattern from migration `00066`. The RPC does the cascade insert (project + rooms + phases + milestones + team) atomically. Frontend just calls `.rpc('activate_project_v2', { input })` and receives the new project UUID.
**Tech stack:** Postgres/PL-pgSQL (RPC), `@patina/supabase` browser client, React Query, Next.js App Router, Zustand (existing).

## Architectural decision: why Supabase-direct + RPC, not fixing NestJS

| Option | Verdict |
|---|---|
| **A. Supabase RPC** (chosen) | Matches the trajectory of the in-flight refactor (reads already migrated). Atomic via SQL transaction. Reuses the `activate_proposal_as_project` pattern that already exists in `00066`. Removes NestJS from the create critical path. |
| B. Multi-call client-side | Not atomic — partial failures leave orphan rows. More client code. Same correctness as A. |
| C. Fix NestJS DTO + service | Largest scope. NestJS service stays on critical path. Conflicts with existing 00066 RPC pattern. NestJS would need to write to `public.projects` (Supabase) instead of its `svc_projects.projects` (Prisma) — duplicates logic that already lives in SQL. |

If you want the NestJS service to remain canonical, stop here and say so — the plan changes substantially.

---

## File map (what gets touched)

**Create:**
- `supabase/migrations/00086_activate_project_rpc.sql` — new RPC `activate_project_v2(input jsonb) RETURNS uuid`
- `supabase/migrations/00086_activate_project_rpc_test.sql` — sanity test invoked manually via psql (kept out of CI for now)

**Modify:**
- `apps/designer-portal/src/hooks/use-projects.ts:441-454` — rewrite `useCreateProject` to call the RPC
- `apps/designer-portal/src/app/(portal)/portal/projects/new/page.tsx:50-96` — pass full wizard payload to mutation; tighten Step 02 `canAdvance`
- `apps/designer-portal/src/lib/mock-data.ts` — `withMockData` becomes read-only-safe (throws on `__write` calls in non-mock contexts) — surface real errors on writes
- `supabase/seed/dev-accounts.sql:101-109` — keep correct profile roles (already correct in source; needs `pnpm supabase:reset` to apply)
- `supabase/seed/designer-clients.sql` *(new)* — populate `public.designer_clients` for designer↔client relationships
- `supabase/seed/proposals.sql` *(new)* — at least one `status='accepted'` proposal so Scenario 4 becomes testable

**Local-only (gitignored):**
- `services/projects/.env` — fix `DATABASE_URL` and `JWT_SECRET` to match local Supabase CLI defaults

---

## Task 1: Make `withMockData` fail loudly on the create path

**Why first:** Every other failure mode is masked by the mock fallback. Surface real errors before changing more behavior.

**Files:**
- Modify: `apps/designer-portal/src/hooks/use-projects.ts:441-454`

- [ ] **Step 1.1: Read `withMockData` to confirm signature**

```bash
grep -n "export function withMockData\|export const withMockData" /Users/kody/Code/patina-merged/apps/designer-portal/src/lib/mock-data.ts
```

- [ ] **Step 1.2: Remove mock fallback from `useCreateProject`**

In `apps/designer-portal/src/hooks/use-projects.ts:441-454`, replace:
```ts
export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) =>
      withMockData(
        () => projectsApi.createProject(data),
        () => Promise.resolve({ id: `mock-project-${Date.now()}`, ...(data as object) })
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
    },
  });
}
```
with the temporary direct call (Task 3 replaces this body entirely):
```ts
export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => projectsApi.createProject(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
    },
  });
}
```

- [ ] **Step 1.3: Verify by clicking Activate again**

Drive the wizard via claude-in-chrome to Step 7 → click Activate. Expect: error toast (handleActivate sets `setError`) instead of mock URL. Confirm the in-page error banner shows the underlying failure message.

- [ ] **Step 1.4: Commit**

```bash
git add apps/designer-portal/src/hooks/use-projects.ts
git commit -m "fix(designer-portal): stop masking project create failures with mock fallback"
```

---

## Task 2: Add `activate_project_v2` RPC migration

**Files:**
- Create: `supabase/migrations/00086_activate_project_rpc.sql`

- [ ] **Step 2.1: Confirm next migration number**

```bash
ls /Users/kody/Code/patina-merged/supabase/migrations/ | sort | tail -3
```
Expected: `00085_decision_feedthrough_rpc.sql` is current head; new file is `00086_activate_project_rpc.sql`.

- [ ] **Step 2.2: Write the migration**

Create `supabase/migrations/00086_activate_project_rpc.sql`:
```sql
-- ============================================================================
-- 00086: activate_project_v2 RPC
-- One-shot create for the 7-step Activation Wizard. Mirrors the cascading
-- insert pattern from 00066's activate_proposal_as_project, but driven from
-- a JSONB payload (no proposal required).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.activate_project_v2(input jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_id uuid;
  v_caller_id uuid := auth.uid();
  v_room jsonb;
  v_room_id uuid;
  v_phase jsonb;
  v_phase_id uuid;
  v_milestone jsonb;
  v_team jsonb;
  v_kickoff date;
  v_expected_completion date;
  v_total_weeks int := 0;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'activate_project_v2: not authenticated';
  END IF;

  IF coalesce(trim(input->>'name'), '') = '' THEN
    RAISE EXCEPTION 'activate_project_v2: name is required';
  END IF;

  v_kickoff := COALESCE((input->>'kickoff_date')::date, CURRENT_DATE);
  SELECT COALESCE(SUM((p->>'duration_weeks')::int), 0)
    INTO v_total_weeks
    FROM jsonb_array_elements(COALESCE(input->'phases', '[]'::jsonb)) p;
  v_expected_completion := v_kickoff + (v_total_weeks * 7);

  -- 1. Project row
  INSERT INTO public.projects (
    name, status, budget_cents, design_fee_cents,
    client_visibility_tier, client_id, designer_id, lead_designer_id, studio_id,
    start_date, kickoff_date, expected_completion_date, target_end_date,
    created_by
  ) VALUES (
    input->>'name',
    'active',
    COALESCE((input->>'budget_total_cents')::int, 0),
    COALESCE((input->>'design_fee_cents')::int, 0),
    COALESCE(input->>'client_visibility_tier', 'milestone'),
    NULLIF(input->>'client_id', '')::uuid,
    v_caller_id,
    COALESCE(NULLIF(input->>'lead_designer_id', '')::uuid, v_caller_id),
    NULLIF(input->>'studio_id', '')::uuid,
    v_kickoff,
    v_kickoff,
    v_expected_completion,
    v_expected_completion,
    v_caller_id
  )
  RETURNING id INTO v_project_id;

  -- 2. Rooms
  FOR v_room IN SELECT * FROM jsonb_array_elements(COALESCE(input->'rooms', '[]'::jsonb)) LOOP
    INSERT INTO public.project_rooms (
      project_id, name, room_type, dimensions, budget_cents, ffe_categories, notes, sort_order
    ) VALUES (
      v_project_id,
      v_room->>'name',
      NULLIF(v_room->>'room_type', ''),
      NULLIF(v_room->>'dimensions', ''),
      COALESCE((v_room->>'budget_cents')::int, 0),
      COALESCE(v_room->'ffe_categories', '[]'::jsonb),
      NULLIF(v_room->>'notes', ''),
      COALESCE((v_room->>'sort_order')::int, 0)
    );
  END LOOP;

  -- 3. Phases
  DECLARE
    v_phase_running_date date := v_kickoff;
    v_phase_idx int := 0;
  BEGIN
    FOR v_phase IN SELECT * FROM jsonb_array_elements(COALESCE(input->'phases', '[]'::jsonb)) LOOP
      INSERT INTO public.project_phases (
        project_id, name, duration_weeks, fee_cents, gate_condition,
        start_date, end_date, sort_order
      ) VALUES (
        v_project_id,
        v_phase->>'name',
        COALESCE((v_phase->>'duration_weeks')::int, 0),
        COALESCE((v_phase->>'fee_cents')::int, 0),
        NULLIF(v_phase->>'gate_condition', ''),
        v_phase_running_date,
        v_phase_running_date + (COALESCE((v_phase->>'duration_weeks')::int, 0) * 7),
        v_phase_idx
      )
      RETURNING id INTO v_phase_id;
      v_phase_running_date := v_phase_running_date + (COALESCE((v_phase->>'duration_weeks')::int, 0) * 7);
      v_phase_idx := v_phase_idx + 1;
    END LOOP;
  END;

  -- 4. Milestones
  FOR v_milestone IN SELECT * FROM jsonb_array_elements(COALESCE(input->'milestones', '[]'::jsonb)) LOOP
    INSERT INTO public.project_payment_milestones (
      project_id, label, percentage, amount_cents, trigger_condition, sort_order
    ) VALUES (
      v_project_id,
      NULLIF(v_milestone->>'label', ''),
      COALESCE((v_milestone->>'percentage')::numeric, 0),
      COALESCE((v_milestone->>'amount_cents')::int, 0),
      NULLIF(v_milestone->>'trigger_condition', ''),
      COALESCE((v_milestone->>'sort_order')::int, 0)
    );
  END LOOP;

  -- 5. Team — caller is always lead_designer; additional team members as provided
  INSERT INTO public.project_team_members (project_id, user_id, role, assigned_by)
  VALUES (v_project_id, v_caller_id, 'lead_designer', v_caller_id)
  ON CONFLICT DO NOTHING;

  FOR v_team IN SELECT * FROM jsonb_array_elements(COALESCE(input->'team', '[]'::jsonb)) LOOP
    INSERT INTO public.project_team_members (project_id, user_id, role, assigned_by)
    VALUES (
      v_project_id,
      (v_team->>'user_id')::uuid,
      COALESCE(v_team->>'role', 'support_designer'),
      v_caller_id
    )
    ON CONFLICT DO NOTHING;
  END LOOP;

  RETURN v_project_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.activate_project_v2(jsonb) TO authenticated;
```

- [ ] **Step 2.3: Apply the migration locally**

```bash
cd /Users/kody/Code/patina-merged
pnpm supabase:reset   # or: supabase db push
```
Expected: migration runs without error.

- [ ] **Step 2.4: Smoke-test the RPC against local DB**

```bash
docker exec supabase_db_supabase psql -U postgres -d postgres -c "
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000004';  -- designer
SELECT public.activate_project_v2('{
  \"name\": \"RPC smoke test\",
  \"budget_total_cents\": 8000000,
  \"design_fee_cents\": 1200000,
  \"client_visibility_tier\": \"milestone\",
  \"kickoff_date\": \"2026-04-28\",
  \"rooms\": [{\"name\": \"Living Room\", \"room_type\": \"Living Room\", \"dimensions\": \"14 x 18 ft\", \"budget_cents\": 3000000}],
  \"phases\": [{\"name\": \"Initiation\", \"duration_weeks\": 2}],
  \"milestones\": [{\"label\": \"Deposit\", \"percentage\": 30}]
}'::jsonb);
"
```
Expected: a uuid is returned. Then:
```bash
docker exec supabase_db_supabase psql -U postgres -d postgres -c "
SELECT (SELECT count(*) FROM public.projects WHERE name = 'RPC smoke test') AS proj,
       (SELECT count(*) FROM public.project_rooms r JOIN public.projects p ON r.project_id = p.id WHERE p.name = 'RPC smoke test') AS rooms,
       (SELECT count(*) FROM public.project_phases ph JOIN public.projects p ON ph.project_id = p.id WHERE p.name = 'RPC smoke test') AS phases,
       (SELECT count(*) FROM public.project_payment_milestones m JOIN public.projects p ON m.project_id = p.id WHERE p.name = 'RPC smoke test') AS milestones,
       (SELECT count(*) FROM public.project_team_members t JOIN public.projects p ON t.project_id = p.id WHERE p.name = 'RPC smoke test') AS team;
"
```
Expected: `proj=1, rooms=1, phases=1, milestones=1, team=1`.

If any count is 0 or wrong, fix the RPC SQL and re-run. Then clean up:
```bash
docker exec supabase_db_supabase psql -U postgres -d postgres -c "DELETE FROM public.projects WHERE name = 'RPC smoke test';"
```

- [ ] **Step 2.5: Commit**

```bash
git add supabase/migrations/00086_activate_project_rpc.sql
git commit -m "feat(supabase): add activate_project_v2 RPC for wizard cascade insert"
```

---

## Task 3: Wire `useCreateProject` to the new RPC + send the full wizard payload

**Files:**
- Modify: `apps/designer-portal/src/hooks/use-projects.ts:441-454`
- Modify: `apps/designer-portal/src/app/(portal)/portal/projects/new/page.tsx:57-96`

- [ ] **Step 3.1: Rewrite `useCreateProject` to call the RPC**

In `apps/designer-portal/src/hooks/use-projects.ts:441-454`:
```ts
export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: Record<string, unknown>) => {
      const supabase = getSupabase();
      const { data, error } = await supabase.rpc('activate_project_v2', { input });
      if (error) throw error;
      // The RPC returns a scalar UUID
      return { id: data as string };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
    },
  });
}
```

- [ ] **Step 3.2: Update `handleActivate` to send the full wizard payload**

In `apps/designer-portal/src/app/(portal)/portal/projects/new/page.tsx:78-90`, replace the manual creation branch:
```ts
const result = await createProject.mutateAsync({
  name: wizard.name,
  budget_total_cents: wizard.budgetTotalCents,
  design_fee_cents: wizard.designFeeCents,
  kickoff_date: wizard.kickoffDate,
  client_visibility_tier: wizard.visibilityTier,
  client_id: wizard.clientId || undefined,
  lead_designer_id: wizard.leadDesignerId || undefined,
  studio_id: wizard.studioId || undefined,
  rooms: wizard.rooms.map((r, i) => ({
    name: r.name,
    room_type: r.roomType,
    dimensions: r.dimensions,
    budget_cents: r.budgetCents,
    ffe_categories: r.ffeCategories,
    notes: r.notes,
    sort_order: i,
  })),
  phases: wizard.phases.map((p, i) => ({
    name: p.name,
    duration_weeks: p.durationWeeks,
    fee_cents: p.feeCents,
    gate_condition: p.gateCondition,
    sort_order: i,
  })),
  milestones: wizard.milestones.map((m, i) => ({
    label: m.label,
    percentage: m.percentage,
    amount_cents: m.amountCents,
    trigger_condition: m.triggerCondition,
    sort_order: i,
  })),
  team: wizard.team
    .filter(t => t.userId)
    .map(t => ({ user_id: t.userId, role: t.role })),
});
```

- [ ] **Step 3.3: End-to-end smoke via claude-in-chrome**

Drive the wizard fresh (clear localStorage first) through Steps 01–07 with the same data the test report used. Click Activate. Expect:
- URL → `/portal/projects/<real-uuid>` (UUID, not `mock-project-...`)
- No console error
- Detail page renders project name + budget instead of "Project not found"

Then in `psql`:
```bash
docker exec supabase_db_supabase psql -U postgres -d postgres -c "
SELECT id, name, status, budget_cents FROM public.projects ORDER BY created_at DESC LIMIT 1;
"
```
Expected: matches what was entered.

- [ ] **Step 3.4: Commit**

```bash
git add apps/designer-portal/src/hooks/use-projects.ts apps/designer-portal/src/app/(portal)/portal/projects/new/page.tsx
git commit -m "feat(designer-portal): wire wizard activate to activate_project_v2 RPC"
```

---

## Task 4: Tighten Step 02 gate

**Files:**
- Modify: `apps/designer-portal/src/app/(portal)/portal/projects/new/page.tsx:50`

- [ ] **Step 4.1: Replace the Step 02 predicate**

Change `:50`:
```ts
case 2: return wizard.rooms.length > 0;
```
to:
```ts
case 2: return wizard.rooms.length > 0
  && wizard.rooms.every(r => r.name.trim().length > 0 && r.roomType.trim().length > 0);
```

- [ ] **Step 4.2: Verify in browser**

Drive: navigate to `/portal/projects/new`, fill Step 01, advance to Step 02, click "+ Add first room" but leave it blank. Expect: Continue stays disabled. Type a name + select a room type. Expect: Continue enables.

- [ ] **Step 4.3: Commit**

```bash
git add apps/designer-portal/src/app/(portal)/portal/projects/new/page.tsx
git commit -m "fix(designer-portal): require room name + type before advancing wizard"
```

---

## Task 5: Re-seed dev data so the wizard is exercisable

The seed source file (`supabase/seed/dev-accounts.sql:101-109`) already assigns correct profile roles (`'admin'`, `'designer'`, `'homeowner'`). The bug observed in testing was a stale DB state — the seed wasn't re-run after a schema change. So this task is mainly: re-run the seed, plus add the missing pivot rows.

**Files:**
- Create: `supabase/seed/designer-clients.sql`
- Create: `supabase/seed/proposals.sql` (or extend existing fixtures)

- [ ] **Step 5.1: Inspect `designer_clients` schema**

```bash
docker exec supabase_db_supabase psql -U postgres -d postgres -c "\d public.designer_clients"
```
Note the required columns and FKs.

- [ ] **Step 5.2: Write `designer-clients.sql`**

Create `supabase/seed/designer-clients.sql` with at minimum a row linking `uid_designer` to `uid_client`. Use only the columns that are NOT NULL in the schema observed in 5.1; defaults handle the rest. Idempotent via `ON CONFLICT DO NOTHING`. Example shape (adjust to actual columns):
```sql
INSERT INTO public.designer_clients (designer_id, client_id, status, created_at, updated_at)
VALUES (
  'a0000000-0000-0000-0000-000000000004',  -- designer@patina.dev
  'a0000000-0000-0000-0000-000000000005',  -- client@patina.dev
  'active',
  NOW(),
  NOW()
)
ON CONFLICT DO NOTHING;
```

- [ ] **Step 5.3: Write `proposals.sql`**

Create at least one accepted proposal so Scenario 4 of the test plan can run later. Cover the proposal + a couple `proposal_scope_rooms` + `proposal_phases` + `proposal_payment_milestones` rows so `activate_proposal_as_project()` has something to convert. Idempotent via `ON CONFLICT (id) DO NOTHING` with a fixed UUID.

- [ ] **Step 5.4: Hook seed files into the seed runner**

Confirm `supabase/config.toml` (`[db.seed]` section) or whatever runs seeds picks up the new files. If the project uses `supabase/seed.sql` as the entry, append `\i seed/designer-clients.sql` and `\i seed/proposals.sql`. Otherwise add them to the `pnpm supabase:reset` chain.

- [ ] **Step 5.5: Re-run seed and verify**

```bash
pnpm supabase:reset
docker exec supabase_db_supabase psql -U postgres -d postgres -c "
SELECT role, count(*) FROM public.profiles GROUP BY role ORDER BY role;
SELECT count(*) AS designer_client_rows FROM public.designer_clients;
SELECT count(*) AS accepted_proposals FROM public.proposals WHERE status = 'accepted';
"
```
Expected: `homeowner` and `client` roles present; ≥1 designer_client row; ≥1 accepted proposal.

- [ ] **Step 5.6: Verify the Step 01 client dropdown populates**

Reload `/portal/projects/new`, log in as `designer@patina.dev`. Expect: client dropdown now includes `Client User` (client@patina.dev).

- [ ] **Step 5.7: Commit**

```bash
git add supabase/seed/designer-clients.sql supabase/seed/proposals.sql supabase/seed.sql supabase/config.toml
git commit -m "chore(supabase): seed designer↔client relationship and accepted proposal"
```

---

## Task 6: Local-only env fix (no commit)

**File:**
- Modify (gitignored): `services/projects/.env`

- [ ] **Step 6.1: Replace DATABASE_URL and JWT_SECRETs with local Supabase values**

```bash
# Back up first
cp services/projects/.env services/projects/.env.backup-$(date +%s)
```
Edit `services/projects/.env` to set:
```
DATABASE_URL="postgresql://postgres:postgres@localhost:54322/postgres?schema=svc_projects&connection_limit=20&pool_timeout=20"
DIRECT_URL="postgresql://postgres:postgres@localhost:54322/postgres?schema=svc_projects"
SUPABASE_JWT_SECRET=super-secret-jwt-token-with-at-least-32-characters-long
JWT_SECRET=super-secret-jwt-token-with-at-least-32-characters-long
```
Leave `REDIS_*` alone unless `redis-cli -p 6379 -a "$REDIS_PASSWORD" ping` fails.

- [ ] **Step 6.2: Restart projects service and confirm it stays up**

```bash
cd services/projects && pnpm dev > /tmp/projects-svc.log 2>&1 &
sleep 8
curl -sf http://localhost:3016/api/v1 -o /dev/null -w "projects-svc:%{http_code}\n"
```
Expected: a non-zero HTTP status (200/401/404 — anything but `000`). The service no longer crashes on Prisma connect.

The projects service is no longer on the create critical path (Tasks 1–3 moved that to Supabase RPC), so this step is just to keep the service available for tasks/documents/activity feed and other surfaces that still proxy to NestJS.

No commit (env file is gitignored).

---

## Verification — full end-to-end after all tasks

Run from a clean state:
1. `pnpm supabase:reset && cd services/projects && pnpm dev &` and `pnpm dev:designer` in another terminal.
2. Log in as `designer@patina.dev` / `password123` at `http://localhost:3000`.
3. Navigate to `/portal/projects/new`. Drive all 7 steps with realistic data. Pick a real client from the dropdown. Click Activate.
4. Expect URL → `/portal/projects/<uuid>` and the detail page renders. No "Project not found", no `mock-project-…` URL, no error toast.
5. In `psql`, confirm rows in `public.projects`, `public.project_rooms`, `public.project_phases`, `public.project_payment_milestones`, `public.project_team_members` for the new project id.
6. Re-run the failing wizard scenario from the test report (Scenario 1) — should now PASS.

## Out of scope

- Migrating `useCreateTask` / `useCreateDocument` / etc. off `withMockData`. They use NestJS for activity-stream surfaces; ripping mocks out of write paths there is a separate cleanup.
- Removing the NestJS `Project` Prisma model. The projects service still owns tasks/documents/activity. The `Project` model can be left in place or hollowed out later — out of scope for fixing creation.
- Refactoring `useUpdateProject`'s slug/UUID branching. Already correctly Supabase-direct for UUIDs; slug fallback for mock fixtures is intentional.

## Self-review

- **Spec coverage:** all six bugs from the test report's "Recommended fixes" section have a task (1→T1, 2→T2+T3, 3→T2+T3, 4→T6, 5→T5, 6→T4). ✓
- **Placeholders:** none. Each step has runnable commands or concrete code. RPC SQL is complete; only the seed files have schema-dependent shape (Step 5.1 inspects the table first to fill the gap).
- **Type consistency:** `activate_project_v2(input jsonb) RETURNS uuid` is referenced consistently in T2 and T3. The handleActivate payload field names match the RPC's `jsonb` keys (`name`, `budget_total_cents`, `design_fee_cents`, `kickoff_date`, `client_visibility_tier`, `client_id`, `lead_designer_id`, `studio_id`, `rooms[]`, `phases[]`, `milestones[]`, `team[]`).
