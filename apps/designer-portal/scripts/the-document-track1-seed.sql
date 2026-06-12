-- ═══════════════════════════════════════════════════════════════════════════
-- The Dissolve Track 1 — seed addendum (idempotent; run AFTER
-- the-document-local-seed.sql). Gives the Whitfield document real Track 1
-- material: rooms with allocations (R25), section tasks + a pending gate
-- (R23), folio rows with a version chain (R24), and milestone trigger
-- config (R26).
--
--   docker exec -i supabase_db_supabase psql -U postgres -d postgres \
--     < apps/designer-portal/scripts/the-document-track1-seed.sql
-- ═══════════════════════════════════════════════════════════════════════════

set session "request.jwt.claim.sub" = 'a0000000-0000-0000-0000-000000000004';

do $$
declare
  v_designer    uuid := 'a0000000-0000-0000-0000-000000000004';
  v_client      uuid := 'a0000000-0000-0000-0000-000000000005';
  v_prop        uuid := 'b0000000-0000-0000-0000-000000000001';
  v_room_living uuid := 'c1000000-0000-0000-0000-000000000001';
  v_room_dining uuid := 'c1000000-0000-0000-0000-000000000002';
  v_project     uuid;
  v_dc          uuid;
  v_item        record;
  v_i           int := 0;
  v_gate        uuid;
begin
  select project_id into v_project from proposals where id = v_prop;
  if v_project is null then
    raise exception 'run the-document-local-seed.sql first (no Whitfield project)';
  end if;
  select id into v_dc from designer_clients
   where designer_id = v_designer and client_id = v_client;

  -- ── R25 · rooms with allocations ──────────────────────────────────────────
  insert into project_rooms (id, project_id, name, budget_cents, sort_order)
  values
    (v_room_living, v_project, 'Living room', 3200000, 0),
    (v_room_dining, v_project, 'Dining room', 1800000, 1)
  on conflict (id) do nothing;

  -- Assign lines: pendant + sofa-ish lines to Living, chairs to Dining; leave
  -- at least one line unassigned so "Throughout · unassigned" renders.
  for v_item in
    select id, name from project_ffe_items
    where project_id = v_project order by sort_order
  loop
    v_i := v_i + 1;
    if v_item.name ilike '%chair%' then
      update project_ffe_items set project_room_id = v_room_dining where id = v_item.id;
    elsif v_i <= 2 then
      update project_ffe_items set project_room_id = v_room_living where id = v_item.id;
    end if;
    -- later rows stay unassigned (Throughout)
  end loop;

  -- ── R23 · section tasks (one dued → the Desk; estimates feed the meta) ───
  insert into project_tasks (id, project_id, title, status, due_date, section_key, estimate_minutes, created_by)
  values
    ('c2000000-0000-0000-0000-000000000001', v_project,
     'Order fabric memos for the sofa', 'todo', current_date, 'project', 120, v_designer),
    ('c2000000-0000-0000-0000-000000000002', v_project,
     'Site-measure the dining wall', 'todo', null, 'project', 90, v_designer),
    ('c2000000-0000-0000-0000-000000000003', v_project,
     'Confirm rug pad sizing', 'done', null, 'project', 30, v_designer)
  on conflict (id) do nothing;
  update project_tasks set completed_at = coalesce(completed_at, now() - interval '2 days')
   where id = 'c2000000-0000-0000-0000-000000000003';

  -- ── R23 · a pending approval gate on the Project section ─────────────────
  select id into v_gate from client_decisions
   where project_id = v_project and decision_kind = 'approval' and section_key = 'project';
  if v_gate is null then
    insert into client_decisions
      (id, designer_client_id, designer_id, project_id, title, context,
       due_date, status, blocking_status, decision_kind, section_key, sent_at)
    values
      ('c3000000-0000-0000-0000-000000000001', v_dc, v_designer, v_project,
       'Approve Project', 'Your approval settles the Project section.',
       now() + interval '3 days', 'pending', 'non_blocking', 'approval', 'project', now())
    returning id into v_gate;
    insert into client_decision_options (decision_id, name, approves, sort_order)
    values (v_gate, 'Approve', true, 0), (v_gate, 'Request changes', false, 1);
  end if;

  -- ── R26 · milestone trigger config ────────────────────────────────────────
  update project_payment_milestones
     set trigger_kind = 'on_production_start'
   where project_id = v_project and label = 'Production start' and trigger_kind is null;
  update project_payment_milestones
     set trigger_kind = 'on_section_settled', trigger_section_key = 'install'
   where project_id = v_project and label = 'Delivery' and trigger_kind is null;

  -- ── R24 · folio rows (strip + stacked version chain + one shared file) ───
  insert into project_documents
    (id, project_id, title, doc_type, anchor_kind, section_key, client_visible, uploaded_by, created_at)
  values
    ('c4000000-0000-0000-0000-000000000002', v_project, 'lighting-plan.pdf', 'pdf',
     'section', 'project', false, v_designer, now() - interval '9 days'),
    ('c4000000-0000-0000-0000-000000000004', v_project, 'install-schedule.pdf', 'pdf',
     'section', 'project', true, v_designer, now() - interval '2 days')
  on conflict (id) do nothing;
  -- the re-upload that stacks behind lighting-plan v1
  insert into project_documents
    (id, project_id, title, doc_type, anchor_kind, section_key, client_visible,
     version_of, uploaded_by, created_at)
  values
    ('c4000000-0000-0000-0000-000000000003', v_project, 'lighting-plan.pdf', 'pdf',
     'section', 'project', false,
     'c4000000-0000-0000-0000-000000000002', v_designer, now() - interval '3 days')
  on conflict (id) do nothing;
  -- a cut sheet clipped to the pendant line
  insert into project_documents
    (id, project_id, title, doc_type, anchor_kind, anchor_id, client_visible, uploaded_by)
  select 'c4000000-0000-0000-0000-000000000001', v_project, 'pendant-cutsheet.pdf', 'pdf',
         'line', i.id, false, v_designer
    from project_ffe_items i
   where i.project_id = v_project and i.name = 'Brass Pendant Cluster'
  on conflict (id) do nothing;

  raise notice 'Track 1 seed ready — project %', v_project;
end $$;
