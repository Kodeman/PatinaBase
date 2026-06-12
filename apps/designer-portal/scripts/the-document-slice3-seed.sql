-- The Document · Slice 3 — local Whitfield-loop seed (idempotent).
-- Gives the enriched "Whitfield Living & Dining" project (66a6b38e…) the
-- prototype's margin cast: a blocking overdue decision anchored to a line,
-- a client message thread anchored to the same line, and a draft milestone
-- invoice. The week's draft pulse comes from 00190's Friday job.
--
--   docker exec -i supabase_db_supabase psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 < apps/designer-portal/scripts/the-document-slice3-seed.sql

do $$
declare
  v_project  uuid := '66a6b38e-2128-4a39-b598-01af0a54ea04';
  v_designer uuid := 'a0000000-0000-0000-0000-000000000004';
  v_client   uuid := 'a0000000-0000-0000-0000-000000000005';
  v_dc       uuid := '0e16d85f-3d90-422f-baac-b12c92085a07';
  v_item     uuid := 'a57d554e-8294-43bd-98a3-a37055689aeb'; -- Brass Pendant Cluster
  v_m2       uuid := '259a460a-ba79-42d6-baa8-34ead2f20e00'; -- Production start milestone
  v_decision uuid;
  v_thread   uuid;
  v_invoice  uuid;
begin
  -- ── blocking overdue decision anchored to the pendant line ────────────────
  select id into v_decision from client_decisions
   where project_id = v_project and title = 'Pendant finish — aged brass vs polished';
  if v_decision is null then
    insert into client_decisions
      (designer_client_id, designer_id, project_id, title, context,
       due_date, status, blocking_status)
    values
      (v_dc, v_designer, v_project,
       'Pendant finish — aged brass vs polished',
       'The cluster can''t go to order until Sarah picks a finish.',
       now() - interval '2 days', 'pending', 'blocks_procurement')
    returning id into v_decision;

    insert into client_decision_options (decision_id, name, designer_note, is_recommended, sort_order)
    values
      (v_decision, 'Aged brass', 'Warms with the oak — my recommendation.', true, 0),
      (v_decision, 'Polished brass', 'Brighter; shows fingerprints near the table.', false, 1);

    update project_ffe_items
       set blocked = true, blocked_by_decision_id = v_decision
     where id = v_item;
  end if;

  -- ── client message thread anchored to the same line ───────────────────────
  select id into v_thread from comms_threads
   where kind = 'project' and project_id = v_project;
  if v_thread is null then
    insert into comms_threads (kind, project_id, title, created_by, anchor_kind, anchor_id)
    values ('project', v_project, 'Whitfield Living & Dining', v_designer, 'line', v_item)
    returning id into v_thread;

    insert into comms_thread_participants (thread_id, profile_id, role)
    values (v_thread, v_designer, 'designer'), (v_thread, v_client, 'client')
    on conflict do nothing;
  else
    update comms_threads set anchor_kind = 'line', anchor_id = v_item where id = v_thread;
  end if;

  if not exists (select 1 from comms_messages where thread_id = v_thread) then
    insert into comms_messages (thread_id, sender_id, body)
    values (v_thread, v_client,
      'Can we talk Wednesday about the pendant? Torn between the two finishes.');
  end if;

  -- ── draft milestone invoice (M2 · production start) ───────────────────────
  select id into v_invoice from invoices
   where project_id = v_project and status = 'draft';
  if v_invoice is null then
    insert into invoices
      (project_id, designer_id, client_id, status, memo,
       subtotal_cents, total_cents)
    values
      (v_project, v_designer, v_client, 'draft',
       'Production start — per the signed payment schedule.',
       1460000, 1460000)
    returning id into v_invoice;

    insert into invoice_line_items
      (invoice_id, kind, milestone_id, description, quantity, unit_amount_cents, amount_cents, sort_order)
    values
      (v_invoice, 'milestone', v_m2, 'M2 · Production start', 1, 1460000, 1460000, 0);
  end if;
end $$;
