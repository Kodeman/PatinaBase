-- E0 · lift-states.sql — idempotent record of every write made to reach the
-- 8-stage state ladder for designer@patina.dev (a0000000-0000-0000-0000-000000000004)
-- on the LOCAL Supabase stack (postgresql://postgres:postgres@127.0.0.1:54322/postgres).
-- Re-running this file is safe: every step is guarded so it no-ops if already applied.
--
-- NOT applied: apps/designer-portal/scripts/the-document-local-seed.sql — it
-- fails on a fresh/reset DB because proposal b0000000-0000-0000-0000-000000000001
-- is already 'accepted' and a newer trigger (guard_proposal_child_draft_only)
-- now forbids inserting proposal_items on a non-draft proposal:
--   ERROR:  proposal b0000000-0000-0000-0000-000000000001 is accepted, so its
--   authored copy is immutable
--   CONTEXT: PL/pgSQL function guard_proposal_child_draft_only() line 108
-- This is a genuine seed/schema drift (the seed predates the guard trigger).
-- Per instructions this was reported verbatim and NOT hand-patched. The
-- "Whitfield Living & Dining" project this seed would have created does not
-- exist locally; project-rich uses Chen Residence instead (see below).

-- impersonate the designer for every RPC below (matches the-document-local-seed.sql idiom)
set session "request.jwt.claim.sub" = 'a0000000-0000-0000-0000-000000000004';
set session role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}', true);

-- ── care: close Birch Hollow (b0000000-0000-0000-0000-0000000000d3) ────────
-- Two of its three project_phases were 'in_progress' simultaneously
-- (c602 lane=main, c603 lane=procurement/thread) — both must be completed
-- before close_project() will accept it (all phases must be 'completed').
-- Neither phase carried a blocking client_decision (project has 0 decisions),
-- so both completed cleanly through advance_project_phase.
do $$
begin
  if (select status from project_phases where id = 'b0000000-0000-0000-0000-00000005c602') = 'in_progress' then
    perform advance_project_phase('b0000000-0000-0000-0000-0000000000d3'::uuid, 'b0000000-0000-0000-0000-00000005c602'::uuid, 'in_progress');
  end if;
  if (select status from project_phases where id = 'b0000000-0000-0000-0000-00000005c603') = 'in_progress' then
    perform advance_project_phase('b0000000-0000-0000-0000-0000000000d3'::uuid, 'b0000000-0000-0000-0000-00000005c603'::uuid, 'in_progress');
  end if;
end $$;

do $$
begin
  if (select status from projects where id = 'b0000000-0000-0000-0000-0000000000d3') <> 'completed' then
    perform close_project(
      'b0000000-0000-0000-0000-0000000000d3'::uuid,
      '[
        {"key":"walkthrough","completed":true},
        {"key":"punch_list","completed":true},
        {"key":"payment","completed":true},
        {"key":"photography","completed":true},
        {"key":"photos","completed":true},
        {"key":"case_study","completed":true}
      ]'::jsonb,
      NULL
    );
  end if;
end $$;

-- ── install: advance Aspen Loft (b0000000-0000-0000-0000-0000000000d1) ─────
-- Same two-live-main-branch shape as Birch Hollow (c102 lane=main "Design
-- Development" + c103 lane=thread "Procurement & Orders", both in_progress,
-- both follow c101). advance_project_phase(d1, c103, 'in_progress') alone
-- fails with "multiple live main phases are unsupported" because completing
-- the thread phase activates c104 (Installation, lane=main) while c102
-- (lane=main) is STILL in_progress — two live mains is a genuine RPC
-- invariant, not a fluke. c102 must complete first.
--
-- c102 is itself blocked by a pending client_decision
-- (b0000000-0000-0000-0000-00000005c301, "Design Development sign-off —
-- drawing set B", court=client, coordination_kind=signoff, blocking_status=
-- blocks_phase, approval_contract=NULL). Two modern resolution RPCs do NOT
-- apply to it:
--   - apply_client_decision requires coordination_kind='selection' (this is
--     'signoff') → not usable.
--   - respond_project_approval requires client_decisions.approval_contract =
--     'project_artifact_v1' (this row's approval_contract is NULL — it
--     predates that system) → "project approval decision not found".
-- The correct, authorized-for-designer resolution is expire_client_decision
-- (00464), which only requires status='pending' and approval_contract IS
-- DISTINCT FROM 'project_artifact_v1' — both true here. Once expired, the
-- decision no longer satisfies _client_decision_blocks_phase's predicate
-- (status='pending' AND (blocks_kind='phase' OR blocking_status='blocks_phase')).
do $$
begin
  if (select status from client_decisions where id = 'b0000000-0000-0000-0000-00000005c301') = 'pending' then
    perform expire_client_decision('b0000000-0000-0000-0000-00000005c301'::uuid);
  end if;
  if (select status from project_phases where id = 'b0000000-0000-0000-0000-00000005c102') = 'in_progress' then
    perform advance_project_phase('b0000000-0000-0000-0000-0000000000d1'::uuid, 'b0000000-0000-0000-0000-00000005c102'::uuid, 'in_progress');
  end if;
  if (select status from project_phases where id = 'b0000000-0000-0000-0000-00000005c103') = 'in_progress' then
    perform advance_project_phase('b0000000-0000-0000-0000-0000000000d1'::uuid, 'b0000000-0000-0000-0000-00000005c103'::uuid, 'in_progress');
  end if;
end $$;

-- ── verify ───────────────────────────────────────────────────────────────
select engagement_kind, engagement_id, title, project_status, active_section, current_phase
from document_state
where designer_id = 'a0000000-0000-0000-0000-000000000004'
  and engagement_id in (
    'b0000000-0000-0000-0000-0000000000d1',  -- Aspen Loft -> install
    'b0000000-0000-0000-0000-0000000000d3'   -- Birch Hollow -> care
  )
order by title;
