-- ═══════════════════════════════════════════════════════════════════════════
-- The Dissolve Track 2 — seed addendum (idempotent; run AFTER
-- the-document-local-seed.sql + the-document-track1-seed.sql). Gives the
-- Orders book real material:
--   · a vendor comms profile linked to Verellen (00207 contact_profile_id) +
--     a vendor_brief thread with a designer brief and a vendor reply (R28 the
--     thread + notify path)
--   · trade terms / email / portal URL on Verellen (00207 columns)
--   · an install collision: two of the designer's projects with install
--     milestones in the SAME week (R28 The Week → Desk), plus the knobs to
--     separate them and watch the collision clear
--
--   docker exec -i supabase_db_supabase psql -U postgres -d postgres \
--     < apps/designer-portal/scripts/the-document-track2-seed.sql
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare
  v_designer    uuid := 'a0000000-0000-0000-0000-000000000004';
  v_verellen    uuid := '11111111-1111-1111-1111-111111111104';
  v_vprofile    uuid := 'd0000000-0000-0000-0000-0000000000a1';
  v_thread      uuid;
  v_aspen       uuid := 'b0000000-0000-0000-0000-0000000000d1';
  v_chen        uuid := '6bca5dda-12c1-4dbe-b7b4-4e9ccd104a0a';
  -- A Monday three weeks out — deterministic enough for the demo; the
  -- assertions read the actual dates, not a hard-coded week.
  v_collide_mon date := (date_trunc('week', now()) + interval '21 days')::date;
begin
  -- ── vendor comms profile (placeholder; profiles.id → auth.users) ──────────
  insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', v_vprofile, 'authenticated',
          'authenticated', 'orders@verellen.example', now(), now())
  on conflict (id) do nothing;

  insert into profiles (id, email, full_name, display_name, role, created_at, updated_at)
  values (v_vprofile, 'orders@verellen.example', 'Verellen — Orders Desk',
          'Verellen — Orders Desk', 'vendor', now(), now())
  on conflict (id) do update set role = 'vendor', full_name = excluded.full_name;

  -- ── 00207: link the vendor company to its comms profile + trade terms ─────
  update vendors
     set contact_profile_id   = v_vprofile,
         trade_account_email  = 'trade@verellen.example',
         trade_portal_url     = 'https://trade.verellen.example',
         default_payment_terms = coalesce(default_payment_terms, 'net_30')
   where id = v_verellen;

  -- ── a vendor_brief thread: designer brief + a vendor reply ────────────────
  select id into v_thread from comms_threads
   where kind = 'vendor_brief' and created_by = v_designer
     and exists (
       select 1 from comms_thread_participants tp
       where tp.thread_id = comms_threads.id and tp.profile_id = v_vprofile
     )
   limit 1;

  if v_thread is null then
    insert into comms_threads (kind, project_id, created_by)
    values ('vendor_brief', (select project_id from proposals
                             where id = 'b0000000-0000-0000-0000-000000000001'), v_designer)
    returning id into v_thread;

    insert into comms_thread_participants (thread_id, profile_id, role) values
      (v_thread, v_designer, 'designer'),
      (v_thread, v_vprofile, 'vendor');

    insert into comms_messages (thread_id, sender_id, body, system) values
      (v_thread, null, 'Brief opened for project.', true),
      (v_thread, v_designer,
       'Hi Verellen — confirming lead time on the Shaker dining chairs (8) for the Whitfield install. Can you hold an 8-week window?',
       false),
      -- the vendor reply (R28: a vendor reply threads in the pane).
      (v_thread, v_vprofile,
       'Confirmed — 8 weeks from deposit. We''ll send the acknowledgment with the sidemark today.',
       false);
  end if;

  -- ── install collision: two projects, install milestones in one week ───────
  -- Aspen + Chen both land their install the same week → cross-project
  -- collision rises on the Desk. (deriveNeed reads delivery_events, which
  -- derives install_milestone from project_phases.)
  insert into project_phases (project_id, name, phase_key, status, target_end_date, sort_order)
  select v_aspen, 'Installation', 'install', 'in_progress', v_collide_mon + 1, 90
   where not exists (select 1 from project_phases
                     where project_id = v_aspen and phase_key ilike '%install%');
  insert into project_phases (project_id, name, phase_key, status, target_end_date, sort_order)
  select v_chen, 'Installation', 'install', 'in_progress', v_collide_mon + 3, 90
   where not exists (select 1 from project_phases
                     where project_id = v_chen and phase_key ilike '%install%');

  raise notice 'Track 2 seed ready — collision week of %, vendor thread %', v_collide_mon, v_thread;
end $$;
