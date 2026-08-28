-- lift-install.sql — ported verbatim from
-- artifacts/document-wayfinding-directions-2026-08-25/research/lift-states.sql
-- (install section only). Idempotent: no-ops if already applied. Advances
-- Aspen Loft Refresh (b0000000-0000-0000-0000-0000000000d1) from
-- active_section='project' to active_section='install' via designer-authorized
-- RPCs only (expire_client_decision, advance_project_phase) — no raw table writes.

set session "request.jwt.claim.sub" = 'a0000000-0000-0000-0000-000000000004';
set session role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}', true);

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

select engagement_kind, engagement_id, title, project_status, active_section, current_phase
from document_state
where engagement_id = 'b0000000-0000-0000-0000-0000000000d1';
