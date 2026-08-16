-- ═══════════════════════════════════════════════════════════════════════════
-- SEED: Designer ↔ Client relationships
-- Wires designer@patina.dev to client@patina.dev so the project-creation
-- wizard's client dropdown (useClients() → designer_clients) is non-empty
-- in local dev.
-- Also seeds client_activity_log for the designer↔client pair so the
-- client profile page shows activity feed and relationship timeline.
-- Idempotent.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  uid_studio_mgr UUID := 'a0000000-0000-0000-0000-000000000003';
  uid_designer   UUID := 'a0000000-0000-0000-0000-000000000004';
  uid_client     UUID := 'a0000000-0000-0000-0000-000000000005';
  v_studio_id    UUID := 'b0000000-0000-0000-0000-000000000001';
  d UUID;
  dc_id UUID;
BEGIN
  -- Wire each dev designer-ish profile to client@patina.dev so any of them
  -- can use the project-creation wizard's client picker in local dev.
  FOREACH d IN ARRAY ARRAY[uid_studio_mgr, uid_designer] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.designer_clients
      WHERE studio_id = v_studio_id
        AND designer_id = d AND client_id = uid_client
    ) THEN
      INSERT INTO public.designer_clients (
        designer_id, studio_id, client_id, status, client_name, client_email, source
      ) VALUES (
        d, v_studio_id, uid_client, 'active',
        'Client User', 'client@patina.dev', 'manual'
      );
    END IF;
  END LOOP;

  -- Seed activity log for the designer@patina.dev ↔ client@patina.dev pair
  -- so the client profile page activity feed and timeline show real data.
  SELECT id INTO dc_id FROM public.designer_clients
    WHERE studio_id = v_studio_id
      AND designer_id = uid_designer AND client_id = uid_client
    LIMIT 1;

  IF dc_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.client_activity_log WHERE designer_client_id = dc_id LIMIT 1
  ) THEN
    INSERT INTO public.client_activity_log
      (designer_client_id, activity_type, title, description, metadata, actor_name, created_at)
    VALUES
      (dc_id, 'status_change',  'Client relationship started',
       'Designer connected with client via direct invite.',
       '{"from_status": null, "to_status": "active"}'::jsonb,
       'Designer',
       now() - interval '90 days'),
      (dc_id, 'milestone',      'Initial consultation completed',
       'Discussed scope, budget, and style preferences.',
       '{"milestone_type": "consultation"}'::jsonb,
       'Designer',
       now() - interval '85 days'),
      (dc_id, 'project_update', 'Project brief approved',
       'Client signed off on the Aspen Loft Refresh brief.',
       '{"project_id": "b0000000-0000-0000-0000-0000000000d1"}'::jsonb,
       'Client User',
       now() - interval '60 days'),
      (dc_id, 'milestone',      'Phase 1 — Space Planning complete',
       'Floor plan layouts reviewed and approved.',
       '{"phase": "space_planning", "milestone_type": "phase_complete"}'::jsonb,
       'Designer',
       now() - interval '45 days'),
      (dc_id, 'decision',       'Sofa fabric decision submitted',
       'Client selected Option B (Ivory Boucle).',
       '{"decision_title": "Living Room Sofa Fabric"}'::jsonb,
       'Client User',
       now() - interval '30 days'),
      (dc_id, 'milestone',      'Phase 2 — Furniture Selection complete',
       'All furniture selections confirmed and ordered.',
       '{"phase": "furniture", "milestone_type": "phase_complete"}'::jsonb,
       'Designer',
       now() - interval '14 days'),
      (dc_id, 'note',           'Site visit scheduled',
       'Walk-through booked for final placement check.',
       '{}'::jsonb,
       'Designer',
       now() - interval '3 days');
  END IF;

  -- Seed additional project-tagged activity rows for richer project-detail feed.
  -- Uses per-title NOT EXISTS guards so this block is safe to re-run.
  IF dc_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.client_activity_log
      WHERE designer_client_id = dc_id
        AND title = 'Floor plan revisions approved'
        AND metadata->>'project_id' = 'b0000000-0000-0000-0000-0000000000d1'
    ) THEN
      INSERT INTO public.client_activity_log
        (designer_client_id, activity_type, title, description, metadata, actor_name, created_at)
      VALUES
        (dc_id, 'project_update', 'Floor plan revisions approved',
         'Client approved the revised open-plan layout for the main living area.',
         '{"project_id": "b0000000-0000-0000-0000-0000000000d1"}'::jsonb,
         'Client User',
         now() - interval '40 days');
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.client_activity_log
      WHERE designer_client_id = dc_id
        AND title = 'Material samples delivered'
        AND metadata->>'project_id' = 'b0000000-0000-0000-0000-0000000000d1'
    ) THEN
      INSERT INTO public.client_activity_log
        (designer_client_id, activity_type, title, description, metadata, actor_name, created_at)
      VALUES
        (dc_id, 'milestone', 'Material samples delivered',
         'Fabric swatches and tile samples couriered to client for in-person review.',
         '{"project_id": "b0000000-0000-0000-0000-0000000000d1", "milestone_type": "samples"}'::jsonb,
         'Designer',
         now() - interval '20 days');
    END IF;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEED: Arrival Arc (Wave 1) no-login-household fixtures — DECISIONS.md I62/I65.
-- Two permanent local repros for The Document spine work:
--   (A) A no-login household in DISCOVERY (designer_clients status='lead',
--       client_id NULL) linked to an ACCEPTED lead via lead_id. Exercises
--       document_state Shape D's new `dc.lead_id` emission and gives the People
--       lane a permanent client_profile_id=NULL (uuid-null) repro.
--   (B) A no-login household in DIRECTION — a DRAFT proposal (seeded in
--       proposals.sql) points at a second designer_clients row (client_id NULL)
--       via proposals.designer_client_id. The relationship row here (status
--       'proposal' so it does NOT double-emit in Shape D) supplies the
--       client_name that Shape B rescues instead of the 'Client' literal — the
--       local analog of prod's Elena (proposal f9970369…, dc 5eed0104…).
-- Idempotent via fixed UUIDs + ON CONFLICT (id) DO NOTHING.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  uid_designer     UUID := 'a0000000-0000-0000-0000-000000000004';
  v_studio_id      UUID := 'b0000000-0000-0000-0000-000000000001';
  lead_nologin     UUID := 'd0c10000-0000-0000-0000-0000000000a1';  -- accepted lead, no homeowner
  dc_discovery     UUID := 'd0c10000-0000-0000-0000-0000000000a2';  -- Shape D repro (status='lead')
  dc_direction     UUID := 'd0c10000-0000-0000-0000-0000000000b1';  -- Shape B rescue (Elena analog)
BEGIN
  -- Skip cleanly if the dev designer profile hasn't been seeded yet (FK parent).
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = uid_designer) THEN
    RAISE NOTICE 'designer-clients.sql: dev designer missing - run dev-accounts.sql first';
    RETURN;
  END IF;

  -- (A.1) The accepted lead with NO homeowner profile (no-login household).
  INSERT INTO public.leads (id, designer_id, studio_id, homeowner_id, project_type, status, created_at, updated_at)
  VALUES (lead_nologin, uid_designer, v_studio_id, NULL, 'full_room', 'accepted',
          now() - interval '30 days', now() - interval '20 days')
  ON CONFLICT (id) DO NOTHING;

  -- (A.2) The Discovery relationship: client_id NULL, status='lead', linked to
  -- the accepted lead. Shape D emits dc.lead_id and (post-00327) is NOT excluded
  -- by the project-pair rule.
  INSERT INTO public.designer_clients
    (id, designer_id, studio_id, client_id, status, client_name, source, lead_id, created_at, updated_at)
  VALUES (dc_discovery, uid_designer, v_studio_id, NULL, 'lead',
          'The Ashfords (no-login household)', 'manual', lead_nologin,
          now() - interval '20 days', now() - interval '20 days')
  ON CONFLICT (id) DO NOTHING;

  -- (B) The Direction relationship (Elena analog): client_id NULL, status
  -- 'proposal' (a draft proposal exists → NOT a Shape D row). Its client_name is
  -- what Shape B rescues through proposals.designer_client_id.
  INSERT INTO public.designer_clients
    (id, designer_id, studio_id, client_id, status, client_name, source, created_at, updated_at)
  VALUES (dc_direction, uid_designer, v_studio_id, NULL, 'proposal',
          'Elena Marlowe (no-login household)', 'manual',
          now() - interval '15 days', now() - interval '15 days')
  ON CONFLICT (id) DO NOTHING;
END $$;
