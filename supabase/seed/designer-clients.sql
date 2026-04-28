-- ═══════════════════════════════════════════════════════════════════════════
-- SEED: Designer ↔ Client relationships
-- Wires designer@patina.dev to client@patina.dev so the project-creation
-- wizard's client dropdown (useClients() → designer_clients) is non-empty
-- in local dev.
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
END $$;
