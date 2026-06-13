-- ═══════════════════════════════════════════════════════════════════════════
-- The Dissolve Track 1 — scripted SQL acceptance (read-only on demo state;
-- the settlement chain runs in a ROLLED-BACK transaction).
--
--   docker exec -i supabase_db_supabase psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 < apps/designer-portal/scripts/the-document-track1-assertions.sql
-- ═══════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP 1

-- ── 1 · R23: the dued task reaches document_state (the Desk's source) ───────
do $$
declare v record;
begin
  select ds.due_task_count, ds.due_task_title into v
  from document_state ds
  join proposals p on p.project_id = ds.project_id
  where p.id = 'b0000000-0000-0000-0000-000000000001';
  if v.due_task_count < 1 then
    raise exception 'ASSERT 1 FAILED: expected >=1 dued task, got %', v.due_task_count;
  end if;
  if v.due_task_title is null then
    raise exception 'ASSERT 1 FAILED: due_task_title is null';
  end if;
  raise notice 'ASSERT 1 OK: due_task_count=% title=%', v.due_task_count, v.due_task_title;
end $$;

-- ── 2 · R23: the gate is a section-anchored decision margin item ────────────
do $$
declare v record;
begin
  select anchor_kind, payload->>'decision_kind' as kind, payload->>'section_key' as section
    into v
  from margin_items
  where item_id = 'c3000000-0000-0000-0000-000000000001' and kind = 'decision';
  if v is null then raise exception 'ASSERT 2 FAILED: gate missing from margin_items'; end if;
  if v.anchor_kind <> 'section' or v.kind <> 'approval' or v.section <> 'project' then
    raise exception 'ASSERT 2 FAILED: anchor=% kind=% section=%', v.anchor_kind, v.kind, v.section;
  end if;
  raise notice 'ASSERT 2 OK: gate rides the margin as a section-anchored approval';
end $$;

-- ── 3 · R23+R26: approval settles the section AND drafts the milestone ──────
-- (throwaway install gate, approved in-transaction, then rolled back)
begin;
do $$
declare
  v_project uuid;
  v_dc      uuid;
  v_gate    uuid;
  v_status  text;
  v_inv     uuid;
begin
  select project_id into v_project from proposals
   where id = 'b0000000-0000-0000-0000-000000000001';
  select designer_client_id into v_dc from client_decisions
   where id = 'c3000000-0000-0000-0000-000000000001';

  insert into client_decisions
    (designer_client_id, designer_id, project_id, title, status,
     blocking_status, decision_kind, section_key, sent_at)
  values (v_dc, 'a0000000-0000-0000-0000-000000000004', v_project,
          'Approve Install', 'pending', 'non_blocking', 'approval', 'install', now())
  returning id into v_gate;
  insert into client_decision_options (decision_id, name, approves, sort_order)
  values (v_gate, 'Approve', true, 0), (v_gate, 'Request changes', false, 1);

  -- the client's act: pick Approve, respond — one transaction
  update client_decision_options set selected = true
   where decision_id = v_gate and approves;
  update client_decisions set status = 'responded', responded_at = now()
   where id = v_gate;

  select status into v_status from projects where id = v_project;
  if v_status <> 'completed' then
    raise exception 'ASSERT 3 FAILED: install approval should complete the project, got %', v_status;
  end if;

  select invoice_id into v_inv from project_payment_milestones
   where project_id = v_project and trigger_kind = 'on_section_settled'
     and trigger_section_key = 'install';
  if v_inv is null then
    raise exception 'ASSERT 3 FAILED: Delivery milestone did not draft its invoice';
  end if;
  if not exists (select 1 from invoices where id = v_inv and status = 'draft') then
    raise exception 'ASSERT 3 FAILED: drafted invoice % is not a draft', v_inv;
  end if;
  raise notice 'ASSERT 3 OK: approval settled the section (project completed) + drafted the milestone invoice (Money margin)';
end $$;
rollback;

-- ── 4 · R24: the client reads ONLY flagged folio files (RLS) ────────────────
begin;
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims',
  '{"sub":"a0000000-0000-0000-0000-000000000005","role":"authenticated"}', true);
do $$
declare v_total int; v_unflagged int;
begin
  select count(*),
         count(*) filter (where client_visible = false)
    into v_total, v_unflagged
  from project_documents
  where id::text like 'c4000000%';
  if v_unflagged > 0 then
    raise exception 'ASSERT 4 FAILED: client can read % unflagged folio files', v_unflagged;
  end if;
  if v_total < 1 then
    raise exception 'ASSERT 4 FAILED: client reads no folio files at all (flagged one missing)';
  end if;
  raise notice 'ASSERT 4 OK: client reads % file(s), zero unflagged', v_total;
end $$;
rollback;

-- ── 5 · R25: variance and headings share one source (rooms + assignments) ───
do $$
declare v_rooms int; v_assigned int;
begin
  select count(*) into v_rooms from project_rooms
   where id::text like 'c1000000%';
  select count(*) into v_assigned from project_ffe_items
   where project_room_id::text like 'c1000000%';
  if v_rooms < 2 then raise exception 'ASSERT 5 FAILED: rooms missing'; end if;
  if v_assigned < 2 then raise exception 'ASSERT 5 FAILED: no lines assigned to rooms'; end if;
  raise notice 'ASSERT 5 OK: % rooms · % lines assigned (headings + variance read the same rows)', v_rooms, v_assigned;
end $$;

-- ── 6 · R33 F3: one mirror post per pulse — never the same Pulse ×2 ──────────
-- Two teeth: (a) every sent pulse's mirror message exists, exactly once;
-- (b) no project thread carries duplicate studio-authored mirror bodies
--     (the orphaned-reset artifact the Track 1 review caught).
do $$
declare
  v_broken int;
  v_dupes  int;
begin
  select count(*) into v_broken
  from weekly_pulses wp
  where wp.status = 'sent'
    and (wp.sent_message_id is null
         or not exists (select 1 from comms_messages m
                        where m.id = wp.sent_message_id and m.deleted_at is null));
  if v_broken > 0 then
    raise exception 'ASSERT 6 FAILED: % sent pulse(s) without exactly one live mirror message', v_broken;
  end if;

  select count(*) into v_dupes
  from (
    select m.thread_id, m.body
    from comms_messages m
    join comms_threads t on t.id = m.thread_id and t.kind = 'project'
    where m.deleted_at is null and m.system is not true
    group by m.thread_id, m.body
    having count(*) > 1
  ) d;
  if v_dupes > 0 then
    raise exception 'ASSERT 6 FAILED: % duplicate message body group(s) in project threads (orphaned pulse mirror?)', v_dupes;
  end if;
  raise notice 'ASSERT 6 OK: one mirror post per pulse; no duplicate mirrors in project threads';
end $$;

-- ── 7 · R33 F1: a studio-authored latest post never derives unread ──────────
do $$
declare v_bad int;
begin
  select count(*) into v_bad
  from margin_items
  where kind = 'message'
    and (payload->>'own_voice')::boolean is true
    and state = 'unread';
  if v_bad > 0 then
    raise exception 'ASSERT 7 FAILED: % own-voice message item(s) derive unread', v_bad;
  end if;
  raise notice 'ASSERT 7 OK: own-voice threads never derive unread (00206)';
end $$;

-- ── 8 · R33 sanity line: the two AP-012 desk folders are two DISTINCT claims ─
-- §14.13 stays closed: seed coincidence (two POs both numbered AP-012 on two
-- different engagements), not one claim crossing engagements.
do $$
declare
  v_claims   int;
  v_projects int;
begin
  select count(distinct dc.id), count(distinct po.project_id)
    into v_claims, v_projects
  from damage_claims dc
  join receiving_inspections ri on ri.id = dc.receiving_inspection_id
  join purchase_orders po on po.id = ri.purchase_order_id
  where po.vendor_po_number = 'AP-012';
  if v_claims >= 2 and v_claims <> v_projects then
    raise exception 'ASSERT 8 FAILED: AP-012 claims (%) do not map 1:1 to engagements (%)', v_claims, v_projects;
  end if;
  raise notice 'ASSERT 8 OK: AP-012 → % distinct claim(s) on % distinct engagement(s) — two folders, two claims, seed coincidence', v_claims, v_projects;
end $$;
