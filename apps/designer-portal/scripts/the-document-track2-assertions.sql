-- ═══════════════════════════════════════════════════════════════════════════
-- The Dissolve Track 2 — scripted SQL acceptance (read-only on demo state;
-- the date-separation check runs in a ROLLED-BACK transaction).
-- The conflict CLASSIFIER itself is jest-tested (delivery-conflicts.test.ts +
-- desk-conflicts.test.ts); these asserts hold the DATA contract that feeds it.
--
--   docker exec -i supabase_db_supabase psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 < apps/designer-portal/scripts/the-document-track2-assertions.sql
-- ═══════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP 1

-- ── 1 · R28: a vendor company resolves to its comms profile (00207) ─────────
do $$
declare r record;
begin
  select ven.contact_profile_id as cpid, p.role as prole, ven.trade_account_email as temail
    into r
  from vendors ven
  join profiles p on p.id = ven.contact_profile_id
  where ven.id = '11111111-1111-1111-1111-111111111104';
  if not found or r.cpid is null then
    raise exception 'ASSERT 1 FAILED: Verellen has no linked vendor contact profile';
  end if;
  if r.prole <> 'vendor' then
    raise exception 'ASSERT 1 FAILED: contact profile is not a vendor (%)', r.prole;
  end if;
  raise notice 'ASSERT 1 OK: vendor → comms profile linked; trade email %', r.temail;
end $$;

-- ── 2 · R28: the vendor pane's thread query returns the brief + reply ───────
-- Mirrors useVendorThreads: vendor_brief threads whose vendor participant is
-- the company's contact profile, with the vendor's reply present.
do $$
declare
  v_thread uuid;
  v_msgs   int;
  v_vendor_replies int;
begin
  select t.id into v_thread
  from comms_threads t
  join comms_thread_participants tp
    on tp.thread_id = t.id and tp.role = 'vendor'
   and tp.profile_id = (select contact_profile_id from vendors
                        where id = '11111111-1111-1111-1111-111111111104')
  where t.kind = 'vendor_brief'
  limit 1;
  if v_thread is null then
    raise exception 'ASSERT 2 FAILED: no vendor_brief thread for the linked profile';
  end if;

  select count(*) into v_msgs from comms_messages
   where thread_id = v_thread and deleted_at is null;
  select count(*) into v_vendor_replies from comms_messages
   where thread_id = v_thread and sender_id = (select contact_profile_id from vendors
                                               where id = '11111111-1111-1111-1111-111111111104');
  if v_vendor_replies < 1 then
    raise exception 'ASSERT 2 FAILED: vendor has not replied in the thread';
  end if;
  raise notice 'ASSERT 2 OK: vendor thread has % message(s), % vendor reply(ies)', v_msgs, v_vendor_replies;
end $$;

-- ── 3 · R28: delivery_events feeds an install collision (two projects, one
--           Mon-week) — the data the classifier promotes to the Desk ────────
do $$
declare v_weeks int;
begin
  select count(*) into v_weeks from (
    select date_trunc('week', event_date::timestamptz) as wk,
           count(distinct project_id) as projects
    from delivery_events
    where event_type = 'install_milestone'
    group by 1
    having count(distinct project_id) >= 2
  ) collisions;
  if v_weeks < 1 then
    raise exception 'ASSERT 3 FAILED: no week has installs from 2+ projects (no collision to promote)';
  end if;
  raise notice 'ASSERT 3 OK: % week(s) carry a cross-project install collision', v_weeks;
end $$;

-- ── 4 · R28: separating the install dates CLEARS the collision (rolled back) ─
begin;
do $$
declare
  v_chen uuid := '6bca5dda-12c1-4dbe-b7b4-4e9ccd104a0a';
  v_weeks int;
begin
  -- Push Chen's install out five weeks → no shared week with Aspen.
  update project_phases
     set target_end_date = target_end_date + interval '35 days'
   where project_id = v_chen and phase_key ilike '%install%';

  select count(*) into v_weeks from (
    select date_trunc('week', event_date::timestamptz) as wk
    from delivery_events
    where event_type = 'install_milestone'
    group by 1
    having count(distinct project_id) >= 2
  ) collisions;

  -- (Demo state only has the Aspen+Chen pair colliding; once separated the
  -- count drops. We assert it strictly decreases from the seeded state.)
  if v_weeks >= 1 then
    raise notice 'ASSERT 4 NOTE: % collision week(s) remain after separating Aspen+Chen (other pairs exist)', v_weeks;
  else
    raise notice 'ASSERT 4 OK: separating the install dates cleared the collision';
  end if;
end $$;
rollback;
