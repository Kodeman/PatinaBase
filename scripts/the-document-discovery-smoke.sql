-- ═══════════════════════════════════════════════════════════════════════════
-- the-document-discovery-smoke.sql — Track 6 Slice 5 (R66) acceptance assertions
--
-- Proves the Discovery→Direction seam end to end against a real local DB:
--   · a Shape-D engagement reads active_section='discovery'
--   · begin_direction_from_discovery validates the five essentials
--   · on success it creates a seeded DRAFT proposal + scope rooms + vision
--   · the engagement re-derives to Shape B active_section='direction'
--   · the call is idempotent; a missing essential raises
--
-- Run:  docker exec -i supabase_db_supabase psql -U postgres -d postgres \
--         -v ON_ERROR_STOP=1 < scripts/the-document-discovery-smoke.sql
--
-- Wrapped in a transaction and ROLLED BACK — leaves no trace.
-- ═══════════════════════════════════════════════════════════════════════════
begin;

do $$
declare
  v_designer  uuid := 'a0000000-0000-0000-0000-000000000004'; -- seed designer@patina.dev
  v_client    uuid := gen_random_uuid();                      -- throwaway test client
  v_dc        uuid;
  v_prop      uuid;
  v_prop2     uuid;
  v_section   text;
  v_kind      text;
  v_rooms     int;
  v_raised    boolean := false;
begin
  -- ── Fixture: a fresh client profile + a Shape-D Discovery engagement ───────
  insert into auth.users (id, instance_id, aud, role, email)
  values (v_client, '00000000-0000-0000-0000-000000000000', 'authenticated',
          'authenticated', 'disc-smoke-' || substr(v_client::text,1,8) || '@test.local');
  -- (a Supabase auth trigger may auto-create the profile; upsert to be safe)
  insert into profiles (id, full_name, role)
  values (v_client, 'Okafor Smoke', 'homeowner')
  on conflict (id) do update set full_name = excluded.full_name;

  insert into designer_clients (designer_id, client_id, status, client_name)
  values (v_designer, v_client, 'lead', 'Okafor Smoke')
  returning id into v_dc;

  -- 1) Shape D: the engagement reads active_section='discovery'
  select active_section, engagement_kind into v_section, v_kind
  from document_state where engagement_id = v_dc;
  if v_section is distinct from 'discovery' then
    raise exception 'FAIL 1: expected active_section=discovery, got %', coalesce(v_section,'<none>');
  end if;
  raise notice 'PASS 1 · Shape D engagement reads active_section=discovery (kind=%)', v_kind;

  -- 2) Negative: only 4/5 essentials (no lifestyle) → RPC must raise
  insert into client_discovery
    (designer_client_id, designer_id, project_type, rooms,
     budget_max_cents, target_date, style_keywords, lifestyle)
  values
    (v_dc, v_designer, 'full_room',
     '[{"name":"Living","room_type":"living","floor_area_sqft":420,"keep_as_is":false},
       {"name":"Dining","room_type":"dining","floor_area_sqft":210,"keep_as_is":true}]'::jsonb,
     8000000, current_date + 90, array['warm minimal'],
     '[]'::jsonb);                                   -- lifestyle empty → not ready
  begin
    v_prop := begin_direction_from_discovery(v_dc);
    raise exception 'FAIL 2: expected a not-ready raise, but the RPC returned %', v_prop;
  exception when others then
    if sqlerrm like '%discovery not ready%' then
      v_raised := true;
    else
      raise exception 'FAIL 2: wrong error: %', sqlerrm;
    end if;
  end;
  if not v_raised then raise exception 'FAIL 2: no raise on missing essential'; end if;
  raise notice 'PASS 2 · a missing essential raises "discovery not ready"';

  -- 3) Fill the 5th essential → RPC succeeds, returns a uuid
  update client_discovery
     set lifestyle = '[{"room":"Living","who":"2 adults + toddler","how":"movie nights, play"}]'::jsonb
   where designer_client_id = v_dc;
  v_prop := begin_direction_from_discovery(v_dc);
  if v_prop is null then raise exception 'FAIL 3: RPC returned null'; end if;
  raise notice 'PASS 3 · five essentials → RPC returned proposal %', v_prop;

  -- 4) A DRAFT proposal exists, project_id null, designer matches
  perform 1 from proposals
   where id = v_prop and status = 'draft' and project_id is null
     and designer_id = v_designer and client_id = v_client;
  if not found then raise exception 'FAIL 4: seeded draft proposal not found / wrong shape'; end if;
  raise notice 'PASS 4 · seeded draft proposal exists (status=draft, project_id=null)';

  -- 5) Two scope rooms, field→field
  select count(*) into v_rooms from proposal_scope_rooms where proposal_id = v_prop;
  if v_rooms <> 2 then raise exception 'FAIL 5: expected 2 scope rooms, got %', v_rooms; end if;
  perform 1 from proposal_scope_rooms
   where proposal_id = v_prop and name = 'Dining' and notes like 'Keep as-is%';
  if not found then raise exception 'FAIL 5: keep_as_is room note not carried'; end if;
  raise notice 'PASS 5 · 2 scope rooms seeded, keep-as-is note carried';

  -- 6) A 'vision' style section seeded
  perform 1 from proposal_sections
   where proposal_id = v_prop and type = 'vision' and title = 'Style direction';
  if not found then raise exception 'FAIL 6: style vision section not seeded'; end if;
  raise notice 'PASS 6 · style "vision" section seeded';

  -- 7) The engagement re-derives to Shape B active_section='direction'
  select active_section, engagement_kind into v_section, v_kind
  from document_state
   where client_profile_id = v_client and designer_id = v_designer;
  if v_section is distinct from 'direction' then
    raise exception 'FAIL 7: expected active_section=direction, got %', coalesce(v_section,'<none>');
  end if;
  if v_kind is distinct from 'proposal' then
    raise exception 'FAIL 7: expected engagement_kind=proposal, got %', coalesce(v_kind,'<none>');
  end if;
  -- and it is GONE from Shape D (no discovery row for this dc)
  perform 1 from document_state where engagement_id = v_dc and active_section = 'discovery';
  if found then raise exception 'FAIL 7: engagement still appears in Shape D after seeding'; end if;
  raise notice 'PASS 7 · engagement re-derived Discovery→Direction (Shape D→B)';

  -- 8) Idempotent: a second call returns the same proposal
  v_prop2 := begin_direction_from_discovery(v_dc);
  if v_prop2 is distinct from v_prop then
    raise exception 'FAIL 8: idempotency broken (% vs %)', v_prop, v_prop2;
  end if;
  raise notice 'PASS 8 · idempotent (second call returned the same proposal)';

  raise notice '──────────────────────────────────────────────';
  raise notice 'ALL DISCOVERY SMOKE ASSERTIONS PASSED ✓';
end $$;

rollback;
