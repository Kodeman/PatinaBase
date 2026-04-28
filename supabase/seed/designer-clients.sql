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
  uid_superadmin UUID := 'a0000000-0000-0000-0000-000000000001';
  uid_admin      UUID := 'a0000000-0000-0000-0000-000000000002';
  uid_studio_mgr UUID := 'a0000000-0000-0000-0000-000000000003';
  uid_designer   UUID := 'a0000000-0000-0000-0000-000000000004';
  uid_client     UUID := 'a0000000-0000-0000-0000-000000000005';
  d UUID;
  dc_id UUID;
BEGIN
  -- Wire each dev designer-ish profile to client@patina.dev so any of them
  -- can use the project-creation wizard's client picker in local dev.
  FOREACH d IN ARRAY ARRAY[uid_superadmin, uid_admin, uid_studio_mgr, uid_designer] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.designer_clients
      WHERE designer_id = d AND client_id = uid_client
    ) THEN
      INSERT INTO public.designer_clients (
        designer_id, client_id, status, client_name, client_email, source
      ) VALUES (
        d, uid_client, 'active',
        'Client User', 'client@patina.dev', 'manual'
      );
    END IF;
  END LOOP;

  -- Seed activity log for the designer@patina.dev ↔ client@patina.dev pair
  -- so the client profile page activity feed and timeline show real data.
  SELECT id INTO dc_id FROM public.designer_clients
    WHERE designer_id = uid_designer AND client_id = uid_client
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
