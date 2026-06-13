-- The Document · local engagement seed (idempotent; supersedes the
-- slice-3 seed, whose pinned ids died with a `supabase db reset`).
-- Rebuilds the transient demo engagements end-to-end:
--   1. enriches seed proposal b…01 (items, phases, milestones) and signs it
--   2. activates it → "Whitfield Living & Dining" (id is RANDOM — resolve it
--      through proposals.project_id, never pin it)
--   3. seeds the Whitfield margin loop: overdue blocking decision on the
--      pendant line, client message on the same line, draft M2 invoice,
--      this week's draft pulse, and a Shaker-chairs PO for the unfold
--   4. creates the manual "Olsen Penthouse" project (pinned id — manual
--      inserts can pin) with the AP-012 damage claim attributed per-item
--      (R7 follow-through; needs 00196 applied)
--
-- Run AFTER applying migrations 00191–00197 from this branch:
--   docker exec -i supabase_db_supabase psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 < apps/designer-portal/scripts/the-document-local-seed.sql

-- create_purchase_order() reads auth.uid(); seed runs as postgres, so
-- impersonate the designer for the RPC's owner assert.
set session "request.jwt.claim.sub" = 'a0000000-0000-0000-0000-000000000004';

do $$
declare
  v_designer     uuid := 'a0000000-0000-0000-0000-000000000004';
  v_client       uuid := 'a0000000-0000-0000-0000-000000000005';
  v_prop         uuid := 'b0000000-0000-0000-0000-000000000001';
  v_olsen        uuid := '05364074-614a-443c-90fb-173f4b259f58';
  v_olsen_client uuid := 'a0000000-0000-0000-0000-000000000008';
  v_verellen     uuid := '11111111-1111-1111-1111-111111111104';
  v_cisco        uuid := '11111111-1111-1111-1111-111111111105';
  v_dc           uuid;
  v_project      uuid;
  v_item_pendant uuid;
  v_item_chairs  uuid;
  v_m2           uuid;
  v_decision     uuid;
  v_thread       uuid;
  v_invoice      uuid;
  v_po           uuid;
  v_draft_po     uuid;
  v_item_console uuid;
  v_chen         uuid;
  v_aspen        uuid;
  v_tmp_po       uuid;
  v_olsen_item   uuid;
  v_olsen_po     uuid;
  v_olsen_insp   uuid;
begin
  -- Sarah Whitfield is the demo client (R11's personalization example).
  update profiles set full_name = 'Sarah Whitfield' where id = v_client;
  -- R33 F6: senders render display names — never a role noun. Leah is the
  -- demo designer (dev-accounts.sql seeds the same name on a fresh reset).
  update profiles set full_name = 'Leah Hartwell', display_name = 'Leah Hartwell'
   where id = v_designer;

  select id into v_dc from designer_clients
   where designer_id = v_designer and client_id = v_client;

  -- ── 1 · enrich the seed proposal ───────────────────────────────────────────
  if not exists (select 1 from proposal_items where proposal_id = v_prop) then
    insert into proposal_items
      (proposal_id, name, room, category, quantity, unit_price, unit_sell_price,
       line_total_cents, vendor_id, vendor_name, lead_time_weeks, position)
    values
      (v_prop, 'Shaker Dining Chairs', 'Dining', 'Seating', 8,
       89500, 119500, 956000, v_verellen, 'Verellen', 10, 0),
      (v_prop, 'Brass Pendant Cluster', 'Dining', 'Lighting', 1,
       318000, 396000, 396000, v_cisco, 'Cisco Brothers', 8, 1),
      (v_prop, 'White Oak Console', 'Living', 'Casegoods', 1,
       412000, 487500, 487500, v_verellen, 'Verellen', 12, 2);
  end if;

  if not exists (select 1 from proposal_phases where proposal_id = v_prop) then
    insert into proposal_phases
      (proposal_id, name, phase_key, duration_weeks, fee_cents, sort_order)
    values
      (v_prop, 'Design Development', 'design', 4, 1200000, 0),
      (v_prop, 'Procurement', 'procurement', 10, 600000, 1);
  end if;

  if not exists (select 1 from proposal_payment_milestones where proposal_id = v_prop) then
    insert into proposal_payment_milestones
      (proposal_id, label, percentage, amount_cents, sort_order)
    values
      (v_prop, 'Signing', 40, 1460000, 0),
      (v_prop, 'Production start', 40, 1460000, 1),
      (v_prop, 'Delivery', 20, 730000, 2);
  end if;

  update proposals
     set title          = 'Whitfield Living & Dining',
         signed_at      = coalesce(signed_at, now() - interval '21 days'),
         signed_by_name = coalesce(signed_by_name, 'Sarah Whitfield')
   where id = v_prop;

  -- ── 2 · activate (idempotent through the back-link) ───────────────────────
  select project_id into v_project from proposals where id = v_prop;
  if v_project is null then
    perform activate_proposal_as_project(v_prop, (now() - interval '21 days')::date);
    select project_id into v_project from proposals where id = v_prop;
  end if;
  update projects set name = 'Whitfield Living & Dining' where id = v_project;

  -- activate_proposal_as_project carries vendor_name but DROPS vendor_id
  -- (pre-existing RPC gap, flagged in DECISIONS I17) — backfill it so the
  -- Order Assistant can mount on un-ordered lines.
  update project_ffe_items i
     set vendor_id = pi.vendor_id
    from proposal_items pi
   where i.source_proposal_item_id = pi.id
     and i.project_id = v_project
     and i.vendor_id is null
     and pi.vendor_id is not null;

  select id into v_item_pendant from project_ffe_items
   where project_id = v_project and name = 'Brass Pendant Cluster';
  select id into v_item_chairs from project_ffe_items
   where project_id = v_project and name = 'Shaker Dining Chairs';
  select id into v_m2 from project_payment_milestones
   where project_id = v_project and label = 'Production start';

  -- ── 3a · blocking overdue decision anchored to the pendant line ───────────
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

    insert into client_decision_options
      (decision_id, name, designer_note, is_recommended, sort_order)
    values
      (v_decision, 'Aged brass', 'Warms with the oak — my recommendation.', true, 0),
      (v_decision, 'Polished brass', 'Brighter; shows fingerprints near the table.', false, 1);

    update project_ffe_items
       set blocked = true, blocked_by_decision_id = v_decision
     where id = v_item_pendant;
  end if;

  -- ── 3b · client message thread anchored to the same line ──────────────────
  select id into v_thread from comms_threads
   where kind = 'project' and project_id = v_project;
  if v_thread is null then
    insert into comms_threads (kind, project_id, title, created_by, anchor_kind, anchor_id)
    values ('project', v_project, 'Whitfield Living & Dining', v_designer, 'line', v_item_pendant)
    returning id into v_thread;

    insert into comms_thread_participants (thread_id, profile_id, role)
    values (v_thread, v_designer, 'designer'), (v_thread, v_client, 'client')
    on conflict do nothing;
  else
    update comms_threads set anchor_kind = 'line', anchor_id = v_item_pendant
     where id = v_thread;
  end if;

  if not exists (select 1 from comms_messages where thread_id = v_thread) then
    insert into comms_messages (thread_id, sender_id, body)
    values (v_thread, v_client,
      'Can we talk Wednesday about the pendant? Torn between the two finishes.');
  end if;

  -- ── 3c · draft milestone invoice (M2 · production start) ──────────────────
  select id into v_invoice from invoices
   where project_id = v_project and status = 'draft';
  if v_invoice is null then
    insert into invoices
      (project_id, designer_id, client_id, status, memo, subtotal_cents, total_cents)
    values
      (v_project, v_designer, v_client, 'draft',
       'Production start — per the signed payment schedule.', 1460000, 1460000)
    returning id into v_invoice;

    insert into invoice_line_items
      (invoice_id, kind, milestone_id, description, quantity, unit_amount_cents,
       amount_cents, sort_order)
    values
      (v_invoice, 'milestone', v_m2, 'M2 · Production start', 1, 1460000, 1460000, 0);
  end if;

  -- ── 3d · this week's draft pulse (the Friday cron seeds it in prod-time) ──
  insert into weekly_pulses (project_id, designer_id, week_of, status)
  values (v_project, v_designer, date_trunc('week', now())::date, 'draft')
  on conflict (project_id, week_of) do nothing;

  -- ── 3e · the Shaker chairs go to order (PO behind the line unfold) ────────
  select id into v_po from purchase_orders
   where project_id = v_project and vendor_id = v_verellen;
  if v_po is null then
    insert into purchase_orders
      (designer_id, project_id, vendor_id, vendor_po_number, payment_pattern,
       total_cents, status, acknowledged_at, confirmed_eta)
    values
      (v_designer, v_project, v_verellen, 'VR-2214', 'net_30',
       956000, 'confirmed', now() - interval '5 days', (now() + interval '20 days')::date)
    returning id into v_po;
  end if;
  update project_ffe_items
     set purchase_order_id = v_po,
         status = case when status in ('specified','quoted','approved') then 'ordered' else status end
   where id = v_item_chairs;

  -- ── 3f · R18 send-weave fixtures ───────────────────────────────────────────
  select id into v_item_console from project_ffe_items
   where project_id = v_project and name = 'White Oak Console';

  -- A drafted, never-sent PO on the console line — the unfold's Send target.
  -- total_cents matches the line-derived trade total (po-send 'send' refuses
  -- incoherent POs).
  -- Build a COHERENT draft PO through the same RPC the Order Assistant uses
  -- (00186) so po-send's coherence guard accepts it; then back-date it past
  -- the 2-day unsent threshold.
  select id into v_draft_po from purchase_orders
   where project_id = v_project and status = 'draft' and sent_at is null;
  if v_draft_po is null and v_item_console is not null
     and (select status from project_ffe_items where id = v_item_console)
         in ('specified', 'quoted', 'approved') then
    v_draft_po := (create_purchase_order(
      v_project, v_verellen, 'net_30'::purchase_order_payment_pattern,
      array[v_item_console]
    )).id;
    update purchase_orders set created_at = now() - interval '3 days'
     where id = v_draft_po;
  end if;

  -- A vendor payment flipped 'due' (00189 path) — the Money margin item.
  if v_po is not null and not exists (
    select 1 from po_payments where purchase_order_id = v_po and state = 'due'
  ) then
    insert into po_payments
      (purchase_order_id, kind, amount_cents, due_date, state, label, sort_order)
    values (v_po, 'balance', 956000, current_date, 'due', 'Balance · net 30', 0);
  end if;

  -- Desk need-line fixtures on quiet seeded projects:
  --   Chen — drafted PO never sent, 3 days old   → "drafted — not yet sent"
  --   Aspen Loft Refresh — sent 4 days, no ack   → "sent — no acknowledgment"
  select id into v_chen from projects
   where designer_id = v_designer and name ilike 'Chen Residence%' limit 1;
  if v_chen is not null and not exists (
    select 1 from purchase_orders where project_id = v_chen and status = 'draft' and sent_at is null
  ) then
    insert into project_ffe_items
      (project_id, name, ffe_category, quantity, status, vendor_id, vendor_name,
       unit_price_cents, line_total_cents, sort_order)
    values (v_chen, 'Walnut Credenza', 'Casegoods', 1, 'specified', v_cisco,
            'Cisco Brothers', 284000, 284000, 0)
    returning id into v_item_console;  -- reuse temp var
    v_tmp_po := (create_purchase_order(
      v_chen, v_cisco, 'net_30'::purchase_order_payment_pattern,
      array[v_item_console]
    )).id;
    update purchase_orders set sidemark = 'CH-104', created_at = now() - interval '3 days'
     where id = v_tmp_po;
  end if;

  select id into v_aspen from projects
   where designer_id = v_designer and name = 'Aspen Loft Refresh' limit 1;
  if v_aspen is not null and not exists (
    select 1 from purchase_orders
     where project_id = v_aspen and sent_at is not null and acknowledged_at is null
  ) then
    insert into purchase_orders
      (designer_id, project_id, vendor_id, payment_pattern, total_cents,
       status, sidemark, sent_at, created_at)
    values (v_designer, v_aspen, v_verellen, 'net_30', 250000, 'confirmed',
            'AL-310', now() - interval '4 days', now() - interval '6 days');
  end if;

  -- ── 4 · Olsen Penthouse: manual project, per-item attributed claim ────────
  if not exists (select 1 from auth.users where id = v_olsen_client) then
    insert into auth.users
      (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
       raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
       confirmation_token, email_change, email_change_token_new, recovery_token)
    select instance_id, v_olsen_client, aud, role, 'olsen@patina.dev',
           encrypted_password, now(), raw_app_meta_data,
           jsonb_build_object('full_name', 'Margaret Olsen'), now(), now(),
           '', '', '', ''
      from auth.users where id = v_client;
  end if;
  insert into profiles (id, email, full_name, role)
  values (v_olsen_client, 'olsen@patina.dev', 'Margaret Olsen', 'homeowner')
  on conflict (id) do update set full_name = 'Margaret Olsen';

  if not exists (select 1 from projects where id = v_olsen) then
    insert into projects
      (id, name, designer_id, client_id, created_by, status, current_phase)
    values
      (v_olsen, 'Olsen Penthouse — Furnishing',
       v_designer, v_olsen_client, v_designer, 'active', 'procurement');
  end if;

  select id into v_olsen_item from project_ffe_items
   where project_id = v_olsen and name = 'Cloud Pendant Cluster 19';
  if v_olsen_item is null then
    insert into project_ffe_items
      (project_id, name, ffe_category, quantity, status, vendor_id, vendor_name,
       unit_price_cents, line_total_cents, sort_order)
    values
      (v_olsen, 'Cloud Pendant Cluster 19', 'Lighting', 1,
       'delivered', v_cisco, 'Cisco Brothers', 412000, 412000, 0)
    returning id into v_olsen_item;

    insert into project_ffe_items
      (project_id, name, ffe_category, quantity, status, vendor_id, vendor_name,
       unit_price_cents, line_total_cents, sort_order)
    values
      (v_olsen, 'Boucle Lounge Chairs', 'Seating', 2,
       'delivered', v_cisco, 'Cisco Brothers', 358000, 716000, 1);
  end if;

  select id into v_olsen_po from purchase_orders
   where project_id = v_olsen and vendor_po_number = 'AP-012';
  if v_olsen_po is null then
    insert into purchase_orders
      (designer_id, project_id, vendor_id, vendor_po_number, payment_pattern,
       total_cents, status, acknowledged_at, delivered_date)
    values
      (v_designer, v_olsen, v_cisco, 'AP-012', 'net_30',
       1128000, 'delivered', now() - interval '30 days', (now() - interval '3 days')::date)
    returning id into v_olsen_po;
  end if;
  update project_ffe_items set purchase_order_id = v_olsen_po
   where project_id = v_olsen and purchase_order_id is null;

  select id into v_olsen_insp from receiving_inspections
   where purchase_order_id = v_olsen_po;
  if v_olsen_insp is null then
    insert into receiving_inspections (purchase_order_id, inspected_by, outcome, notes)
    values (v_olsen_po, v_designer, 'damaged',
            'Center globe cracked in transit; chairs clean.')
    returning id into v_olsen_insp;
  end if;

  -- The attributed claim — DAMAGED stamps exactly this line (R7/00196).
  if not exists (select 1 from damage_claims where receiving_inspection_id = v_olsen_insp) then
    insert into damage_claims (receiving_inspection_id, ffe_item_id, state, description)
    values (v_olsen_insp, v_olsen_item, 'drafted',
            'Cloud Pendant Cluster 19 — center globe cracked on arrival.');
  end if;
end $$;
