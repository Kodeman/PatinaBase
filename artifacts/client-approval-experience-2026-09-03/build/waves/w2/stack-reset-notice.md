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
