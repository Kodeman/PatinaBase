The backend lane (agent-cae-w2-backend) owns every local db reset during Wave 2 builds; the integration steward afterwards.
- 2026-09-05 — **backend lane** (`agent-cae-w2-backend`) reset the shared local Supabase stack
  (`supabase db reset` from `.codex/worktrees/agent-cae-w2-backend/supabase`) to apply
  `00569_approval_why_viewer_role_and_receipt.sql` and run `scripts/run-sql-tests.sh`, then
  regenerated `packages/supabase/src/database.types.ts` against the local DB. Other Wave 2 lanes:
  re-seed before any local walk.
- 2026-09-05 — **backend lane** (`agent-cae-w2-backend`) reset the shared local Supabase stack a
  second time, for the round-1 review fixes: `00569` gained the widened
  `supersede_project_approval_decision(uuid,jsonb,timestamptz,text,text)` (r1-B2), so the whole
  ledger was replayed and `scripts/run-sql-tests.sh` re-run. Other Wave 2 lanes: re-seed before
  any local walk.
- 2026-09-05 — **backend lane** (`agent-cae-w2-backend`) reset the shared local Supabase stack a
  third time, for the round-2 cross-lane fixes: `00569` absorbed the web lane's 00570 wrapper
  (`clientConsentMethod` + `clientSignature` on `respond_project_approval`) and gained
  `project_approval_artifacts.why_author_name`, so the whole ledger was replayed and
  `scripts/run-sql-tests.sh` re-run. Other Wave 2 lanes: re-seed before any local walk.
- 2026-09-05 — **backend lane** (`agent-cae-w2-backend`) reset a fourth time. Another lane had
  reset the shared stack from its own worktree in the meantime — the ledger tail read
  `00570, 00568, 00567` with **no 00569** — so the round-2 state was replayed and every SQL gate
  re-run against it. Reset ownership during builds is the backend lane's alone (env.md); other
  Wave 2 lanes: re-seed before any local walk, and do not reset.
- 2026-09-05 — **integration steward** (`agent-cae-w2-integration`) reset the shared local
  Supabase stack for the Wave-2 integration gate pass: `supabase db reset` from
  `.codex/worktrees/agent-cae-w2-integration/supabase`, replaying the ledger through the single
  folded `00569_approval_why_viewer_role_and_receipt.sql` (the web lane's 00570 is deleted on this
  branch), then `scripts/run-sql-tests.sh` and a `database.types.ts` regen check. The stack now
  carries the integration branch's schema, not any single lane's. Other Wave 2 lanes: re-seed
  before any local walk.
