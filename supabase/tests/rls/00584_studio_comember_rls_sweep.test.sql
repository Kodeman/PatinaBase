-- ═══════════════════════════════════════════════════════════════════════════
-- 00584 — the studio co-member sweep, table by table
--
-- NOTE ON STYLE: supabase/tests/** is not pgTAP. Every file in that tree is a
-- plain psql script — BEGIN, fixtures, pg_temp role-assumption helpers, DO
-- blocks of ASSERTs, ROLLBACK — run under ON_ERROR_STOP=1. This file follows
-- rls/00582_client_discovery_studio_rls.test.sql.
--
-- Run (single file, for iteration):
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -X -q \
--     -v ON_ERROR_STOP=1 \
--     -f supabase/tests/rls/00584_studio_comember_rls_sweep.test.sql
--
-- Run (the actual gate — whole suite against KNOWN_FAILURES.md):
--   bash scripts/run-sql-tests.sh -f /rls/
--
-- Fixture, all seeded by a local reset:
--   designer  a0000000-…-0004  Leah Hartwell, owner of Local Dev Studio
--                              b0000000-…-0001 (seed/organizations.sql)
--   co-member a0000000-…-0003  Studio Manager, ADMIN of the SAME studio
--   client    a0000000-…-0005  the designer's engaged homeowner
--   outsider  cf100000-0000-4000-8000-000000000001  owner of Phase One
--                              Synthetic Studio, shares no org with the
--                              designer (seed/cloudflare-phase1-staging.sql)
--   project   b0000000-…-00d1  Aspen Loft Refresh, designer_id = …0004
--   proposal  b0000000-…-0001, lead d0c10000-…-00a1, and the …0004↔…0005
--             engagement, looked up by pg_temp.engagement() because its id is
--             generated at seed time
--
-- Every section runs inside a SAVEPOINT; the file ROLLBACKs. Every fixture row
-- is written as postgres (RLS-exempt) so each section measures the READER's or
-- WRITER's authority, never the setup's.
--
-- READ THIS BEFORE ADDING A CASE. A policy leg that joins to a parent table is
-- evaluated with the CALLER's RLS on that parent, so a widened child is only
-- reachable if the parent is already co-member visible. Every parent used below
-- has such a leg (designer_clients_studio_rw 00316, projects_studio_select
-- 00316, proposals_design_studio_select 00399, purchase_orders_studio_read) —
-- and public.room_scans, which had none keyed on its own user_id, gains
-- room_scans_studio_select in 00584 (item 8). That leg is what carries the
-- room-scans storage read in section E and the whole of section G; the write
-- legs beside it would reach nothing without it, because Postgres filters the
-- target rows of an UPDATE or DELETE through the SELECT policies first.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL statement_timeout = '120s';

-- ─── helpers (same shape as 00582_client_discovery_studio_rls.test.sql) ─────
-- The GRANT after each definition is required: 00483 revokes database
-- TEMPORARY from authenticated/anon/service_role, so a restricted role cannot
-- reach a pg_temp function without it.

CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text,
    true
  );
  EXECUTE 'SET LOCAL ROLE authenticated';
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.assume_user(UUID) TO PUBLIC;

CREATE OR REPLACE FUNCTION pg_temp.reset_role()
RETURNS VOID AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', NULL, true);
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.reset_role() TO PUBLIC;

-- The seeded engagement's id is generated at seed time, not a literal, so it is
-- looked up rather than hard-coded (the 00582 test does the same).
CREATE OR REPLACE FUNCTION pg_temp.engagement()
RETURNS uuid AS $$
  SELECT id FROM public.designer_clients
   WHERE designer_id = 'a0000000-0000-0000-0000-000000000004'
     AND client_id   = 'a0000000-0000-0000-0000-000000000005'
   ORDER BY created_at, id
   LIMIT 1;
$$ LANGUAGE sql;
GRANT EXECUTE ON FUNCTION pg_temp.engagement() TO PUBLIC;

CREATE OR REPLACE FUNCTION pg_temp.discovery_object()
RETURNS text AS $$
  SELECT pg_temp.engagement()::text || '/00584-discovery.pdf';
$$ LANGUAGE sql;
GRANT EXECUTE ON FUNCTION pg_temp.discovery_object() TO PUBLIC;

-- ─── fixture preconditions ─────────────────────────────────────────────────

DO $$
DECLARE
  v_co  boolean; v_co_ds  boolean;
  v_out boolean; v_out_ds boolean;
BEGIN
  ASSERT pg_temp.engagement() IS NOT NULL,
    'FIXTURE: the seeded designer↔client engagement must exist '
    '(seed/designer-clients.sql)';
  ASSERT EXISTS (SELECT 1 FROM public.projects
                  WHERE id = 'b0000000-0000-0000-0000-0000000000d1'
                    AND designer_id = 'a0000000-0000-0000-0000-000000000004'),
    'FIXTURE: seeded project b0000000-…-00d1 must belong to designer …0004';
  ASSERT EXISTS (SELECT 1 FROM public.proposals
                  WHERE id = 'b0000000-0000-0000-0000-000000000001'
                    AND designer_id = 'a0000000-0000-0000-0000-000000000004'),
    'FIXTURE: seeded proposal b0000000-…-0001 must belong to designer …0004';
  ASSERT EXISTS (SELECT 1 FROM public.leads
                  WHERE id = 'd0c10000-0000-0000-0000-0000000000a1'
                    AND designer_id = 'a0000000-0000-0000-0000-000000000004'),
    'FIXTURE: seeded lead d0c10000-…-00a1 must belong to designer …0004';
  ASSERT EXISTS (SELECT 1 FROM public.rooms
                  WHERE user_id = 'a0000000-0000-0000-0000-000000000005'),
    'FIXTURE: the client …0005 must own at least one room';

  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000003');
  v_co    := public.is_studio_comember('a0000000-0000-0000-0000-000000000004');
  v_co_ds := public.is_design_studio_comember('a0000000-0000-0000-0000-000000000004');
  PERFORM pg_temp.reset_role();

  PERFORM pg_temp.assume_user('cf100000-0000-4000-8000-000000000001');
  v_out    := public.is_studio_comember('a0000000-0000-0000-0000-000000000004');
  v_out_ds := public.is_design_studio_comember('a0000000-0000-0000-0000-000000000004');
  PERFORM pg_temp.reset_role();

  ASSERT v_co AND v_co_ds,
    'FIXTURE: a0000000-…-0003 must be a studio co-member of the designer under '
    'BOTH helpers or nothing below proves the widening';
  ASSERT NOT v_out AND NOT v_out_ds,
    'FIXTURE: cf100000-…-0001 must NOT be a co-member of the designer under '
    'either helper or the leak sections prove nothing';

  RAISE NOTICE '00584 fixture: co-member and outsider confirmed';
END $$;

-- ─── fixture rows (written as postgres) ────────────────────────────────────

INSERT INTO public.field_captures (id, client_capture_id, designer_id, title)
VALUES ('58300000-0000-4000-8000-0000000000e1',
        '58300000-0000-4000-8000-0000000000e9',
        'a0000000-0000-0000-0000-000000000004', '00584 capture');

INSERT INTO public.purchase_orders
  (id, designer_id, project_id, vendor_id, payment_pattern)
VALUES ('58300000-0000-4000-8000-0000000000d1',
        'a0000000-0000-0000-0000-000000000004',
        'b0000000-0000-0000-0000-0000000000d1',
        '11111111-1111-1111-1111-111111111104', 'net_30');

INSERT INTO public.receiving_inspections
  (id, purchase_order_id, inspected_by, outcome)
VALUES ('58300000-0000-4000-8000-0000000000d2',
        '58300000-0000-4000-8000-0000000000d1',
        'a0000000-0000-0000-0000-000000000004', 'clean');

-- The designer's own room, so scan B can carry a room_id: both iOS uploaders
-- lay room-scans objects at {folder}/{userId}/{roomId}/{filename}, and the
-- section E object below is written in exactly that shape.
INSERT INTO public.rooms (id, user_id, name)
VALUES ('58300000-0000-4000-8000-0000000000b3',
        'a0000000-0000-0000-0000-000000000004', '00584 designer room');

-- Scan A is the CLIENT's, shared with the DESIGNER through the active
-- association below — the only route room_scan_images_select offers a
-- non-owner. Scan B and scan C are the DESIGNER's; scan C deliberately has NO
-- association, so section G measures room_scans_studio_select alone.
INSERT INTO public.room_scans (id, user_id, name, room_id) VALUES
  ('58300000-0000-4000-8000-0000000000a1',
   'a0000000-0000-0000-0000-000000000005', '00584 scan A (client-owned)', NULL),
  ('58300000-0000-4000-8000-0000000000b1',
   'a0000000-0000-0000-0000-000000000004', '00584 scan B (designer-owned)',
   '58300000-0000-4000-8000-0000000000b3'),
  ('58300000-0000-4000-8000-0000000000b4',
   'a0000000-0000-0000-0000-000000000004',
   '00584 scan C (designer-owned, unassociated)', NULL);

-- designer_id is the DESIGNER, not the co-member: the co-member must arrive
-- through is_studio_comember(), not through an association written in her own
-- name, or nothing here would fail on a stack that lacks 00584.
INSERT INTO public.room_scan_associations
  (id, scan_id, designer_id, consumer_id, association_type, status, access_level)
VALUES ('58300000-0000-4000-8000-0000000000b2',
        '58300000-0000-4000-8000-0000000000b1',
        'a0000000-0000-0000-0000-000000000004',
        'a0000000-0000-0000-0000-000000000005',
        'suggested', 'active', 'full'),
       ('58300000-0000-4000-8000-0000000000a2',
        '58300000-0000-4000-8000-0000000000a1',
        'a0000000-0000-0000-0000-000000000004',
        'a0000000-0000-0000-0000-000000000005',
        'explicit', 'active', 'full');

INSERT INTO public.room_scan_images (id, scan_id, role, image_url, captured_at)
VALUES ('58300000-0000-4000-8000-0000000000c1',
        '58300000-0000-4000-8000-0000000000a1', 'hero',
        'photos/a0000000-0000-0000-0000-000000000005/x/hero.jpg', now()),
       ('58300000-0000-4000-8000-0000000000c2',
        '58300000-0000-4000-8000-0000000000b1', 'hero',
        'photos/a0000000-0000-0000-0000-000000000004/x/hero.jpg', now());

-- A throwaway project of the designer's, for the DELETE leg. Written as
-- postgres: set_project_studio_id() admits a migration-shaped insert
-- (session_user = postgres, role none/postgres) unconditionally.
INSERT INTO public.projects (id, name, created_by, designer_id)
VALUES ('58300000-0000-4000-8000-000000000031', '00584 disposable project',
        'a0000000-0000-0000-0000-000000000004',
        'a0000000-0000-0000-0000-000000000004');

INSERT INTO public.weekly_pulses (id, project_id, designer_id, week_of)
VALUES ('58300000-0000-4000-8000-0000000000f1',
        'b0000000-0000-0000-0000-0000000000d1',
        'a0000000-0000-0000-0000-000000000004', date_trunc('week', now())::date);

INSERT INTO public.client_invitations (id, token, email, designer_id)
VALUES ('58300000-0000-4000-8000-000000000071'::uuid, '00584-token',
        '00584-invite@test.invalid', 'a0000000-0000-0000-0000-000000000004');

INSERT INTO public.match_ceremonies (id, lead_id, designer_id)
VALUES ('58300000-0000-4000-8000-000000000072',
        'd0c10000-0000-0000-0000-0000000000a1',
        'a0000000-0000-0000-0000-000000000004');

INSERT INTO public.proposal_captures (id, designer_id, source_url)
VALUES ('58300000-0000-4000-8000-000000000073',
        'a0000000-0000-0000-0000-000000000004',
        'https://example.invalid/00584');

INSERT INTO public.ffe_categories (id, slug, label, designer_id, is_system)
VALUES ('58300000-0000-4000-8000-000000000074',
        '00584-seating', '00584 Seating',
        'a0000000-0000-0000-0000-000000000004', false);

INSERT INTO public.products
  (id, name, captured_at, layer, studio_id, vendor_contact, lead_time_weeks,
   payment_terms, category, usage_notes)
VALUES ('58300000-0000-4000-8000-000000000075', '00584 studio piece', now(),
        'studio', 'b0000000-0000-0000-0000-000000000001',
        '{"email": "rep@test.invalid"}'::jsonb, 8, 'net_30', 'seating',
        'Studio-wide favourite');

-- ─── fixture rows for sections G–P ────────────────────────────────────────

INSERT INTO public.projects (id, name, created_by, designer_id, status)
VALUES ('58300000-0000-4000-8000-000000000032', '00584 completed project',
        'a0000000-0000-0000-0000-000000000004',
        'a0000000-0000-0000-0000-000000000004', 'completed');

INSERT INTO public.damage_claims (id, receiving_inspection_id, description)
VALUES ('58300000-0000-4000-8000-000000000041',
        '58300000-0000-4000-8000-0000000000d2', '00584 claim');

INSERT INTO public.po_payments (id, purchase_order_id, kind, amount_cents)
VALUES ('58300000-0000-4000-8000-000000000042',
        '58300000-0000-4000-8000-0000000000d1', 'deposit', 1000);

INSERT INTO public.project_parties (id, project_id, party_kind, display_name)
VALUES ('58300000-0000-4000-8000-000000000043',
        'b0000000-0000-0000-0000-0000000000d1', 'gc', '00584 party');

INSERT INTO public.field_link_tokens (id, party_id, project_id, token_hash)
VALUES ('58300000-0000-4000-8000-000000000044',
        '58300000-0000-4000-8000-000000000043',
        'b0000000-0000-0000-0000-0000000000d1', '00584-token-hash');

INSERT INTO public.sms_conversations
  (id, twilio_number, phone_e164, active_project_id)
VALUES ('58300000-0000-4000-8000-000000000045', '+15550000584', '+15550000585',
        'b0000000-0000-0000-0000-0000000000d1');

INSERT INTO public.proposal_engagement (id, proposal_id, event_type)
VALUES ('58300000-0000-4000-8000-000000000046',
        'b0000000-0000-0000-0000-000000000001', 'view');

INSERT INTO public.phase_templates (id, slug, label, designer_id, is_system, phases)
VALUES ('58300000-0000-4000-8000-000000000047', '00584-phases', '00584 Phases',
        'a0000000-0000-0000-0000-000000000004', false, '[]'::jsonb);

INSERT INTO public.lead_room_scans (id, lead_id, scan_id)
VALUES ('58300000-0000-4000-8000-000000000048',
        'd0c10000-0000-0000-0000-0000000000a1',
        '58300000-0000-4000-8000-0000000000b4');

-- room_features, saved_items, client_style_profiles and profile_presence carry
-- no seeded row for this client, so each gets one here (service-role write).
INSERT INTO public.room_features
  (id, room_id, type, position_x, position_y, position_z)
VALUES ('58300000-0000-4000-8000-000000000049',
        'c0000000-0000-4000-8000-000000000001', 'window', 0, 0, 0);

INSERT INTO public.saved_items (id, user_id, name)
VALUES ('58300000-0000-4000-8000-00000000004a',
        'a0000000-0000-0000-0000-000000000005', '00584 saved item');

INSERT INTO public.client_style_profiles (id, user_id, session_key)
VALUES ('58300000-0000-4000-8000-00000000004b',
        'a0000000-0000-0000-0000-000000000005',
        '58300000-0000-4000-8000-00000000005b');

-- profile_presence is gated on a RUNNING engagement (00539): project …00d1 is
-- active with this client, which is what satisfies the second branch.
INSERT INTO public.profile_presence (user_id, last_seen_at)
VALUES ('a0000000-0000-0000-0000-000000000005', now())
ON CONFLICT (user_id) DO UPDATE SET last_seen_at = EXCLUDED.last_seen_at;

-- configuration_id NULL: 00403's guard trigger refuses a CONFIGURATION-LINKED
-- request whose designer_id is not auth.uid(), so only unlinked requests can
-- demonstrate the RLS widening.
INSERT INTO public.vendor_quote_requests (id, vendor_id, designer_id, message)
VALUES ('58300000-0000-4000-8000-00000000004c',
        '11111111-1111-1111-1111-111111111104',
        'a0000000-0000-0000-0000-000000000004', '00584 quote request');

INSERT INTO public.invoices (id, project_id, designer_id, status)
VALUES ('58300000-0000-4000-8000-00000000004d',
        'b0000000-0000-0000-0000-0000000000d1',
        'a0000000-0000-0000-0000-000000000004', 'draft');

INSERT INTO public.invoices
  (id, project_id, designer_id, status, invoice_number)
VALUES ('58300000-0000-4000-8000-00000000004e',
        'b0000000-0000-0000-0000-0000000000d1',
        'a0000000-0000-0000-0000-000000000004', 'sent', 'INV-00584');

INSERT INTO public.margin_notes (id, project_id, designer_id, body)
VALUES ('58300000-0000-4000-8000-00000000004f',
        'b0000000-0000-0000-0000-0000000000d1',
        'a0000000-0000-0000-0000-000000000004', '00584 seeded note');

INSERT INTO storage.objects (bucket_id, name, owner) VALUES
  ('project-documents', pg_temp.discovery_object(),
   'a0000000-0000-0000-0000-000000000004'),
  ('project-documents',
   'b0000000-0000-0000-0000-0000000000d1/00584-project.pdf',
   'a0000000-0000-0000-0000-000000000004'),
  -- {folder}/{ownerUid}/{roomId}/{filename} — the shape both iOS uploaders lay
  ('room-scans',
   'usdz/a0000000-0000-0000-0000-000000000004/58300000-0000-4000-8000-0000000000b3/scan.usdz',
   'a0000000-0000-0000-0000-000000000004'),
  ('field-media',
   'project/b0000000-0000-0000-0000-0000000000d1/00584-field.jpg',
   'a0000000-0000-0000-0000-000000000004');

-- ═══════════════════════════════════════════════════════════════════════════
-- A · Field — field_captures, receiving_inspections
-- ═══════════════════════════════════════════════════════════════════════════

SAVEPOINT s_a;

DO $$
DECLARE v_seen integer; v_blocked boolean := false;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000003');

  SELECT count(*) INTO v_seen FROM public.field_captures
   WHERE id = '58300000-0000-4000-8000-0000000000e1';
  ASSERT v_seen = 1, 'FAIL A1: co-member must SELECT the designer''s field capture; got ' || v_seen;

  INSERT INTO public.field_captures (client_capture_id, designer_id, title)
  VALUES ('58300000-0000-4000-8000-0000000000e8',
          'a0000000-0000-0000-0000-000000000004', '00584 co-member capture');

  SELECT count(*) INTO v_seen FROM public.receiving_inspections
   WHERE id = '58300000-0000-4000-8000-0000000000d2';
  ASSERT v_seen = 1, 'FAIL A2: co-member must SELECT the inspection on the designer''s PO; got ' || v_seen;

  PERFORM pg_temp.reset_role();
  PERFORM pg_temp.assume_user('cf100000-0000-4000-8000-000000000001');

  SELECT count(*) INTO v_seen FROM public.field_captures
   WHERE id = '58300000-0000-4000-8000-0000000000e1';
  ASSERT v_seen = 0, 'FAIL A3: outsider must not see the field capture; got ' || v_seen;

  BEGIN
    INSERT INTO public.field_captures (client_capture_id, designer_id, title)
    VALUES ('58300000-0000-4000-8000-0000000000e7',
            'a0000000-0000-0000-0000-000000000004', '00584 outsider capture');
  EXCEPTION WHEN insufficient_privilege THEN v_blocked := true;
  END;
  ASSERT v_blocked, 'FAIL A4: outsider must be refused (42501) writing a field capture';

  SELECT count(*) INTO v_seen FROM public.receiving_inspections
   WHERE id = '58300000-0000-4000-8000-0000000000d2';
  ASSERT v_seen = 0, 'FAIL A5: outsider must not see the inspection; got ' || v_seen;

  PERFORM pg_temp.reset_role();
  RAISE NOTICE '00584 A passed: field_captures + receiving_inspections';
END $$;

ROLLBACK TO SAVEPOINT s_a;

-- ═══════════════════════════════════════════════════════════════════════════
-- B · scans — room_scan_images select/insert, room_scans update
-- ═══════════════════════════════════════════════════════════════════════════

SAVEPOINT s_b;

DO $$
DECLARE v_seen integer; v_rows integer; v_blocked boolean := false;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000003');

  -- Through the ACTIVE ASSOCIATION on scan A, not through the engagement:
  -- room_scan_images_select (00584 item 7) is written out in three branches
  -- precisely so a designer_clients row alone does not open a homeowner's scan
  -- images. Deleting the association row would make this 0.
  SELECT count(*) INTO v_seen FROM public.room_scan_images
   WHERE id = '58300000-0000-4000-8000-0000000000c1';
  ASSERT v_seen = 1,
    'FAIL B1: co-member must SELECT the shared client scan''s image through '
    'the association branch; got ' || v_seen;

  INSERT INTO public.room_scan_images (scan_id, role, image_url, captured_at)
  VALUES ('58300000-0000-4000-8000-0000000000b1', 'hero',
          'photos/00584/comember.jpg', now());

  UPDATE public.room_scans SET name = '00584 co-member touched'
   WHERE id = '58300000-0000-4000-8000-0000000000b1';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  ASSERT v_rows = 1,
    'FAIL B2: co-member must UPDATE the designer''s room scan; rows=' || v_rows;

  PERFORM pg_temp.reset_role();
  PERFORM pg_temp.assume_user('cf100000-0000-4000-8000-000000000001');

  SELECT count(*) INTO v_seen FROM public.room_scan_images
   WHERE id = '58300000-0000-4000-8000-0000000000c1';
  ASSERT v_seen = 0, 'FAIL B3: outsider must not see the scan image; got ' || v_seen;

  BEGIN
    INSERT INTO public.room_scan_images (scan_id, role, image_url, captured_at)
    VALUES ('58300000-0000-4000-8000-0000000000b1', 'hero',
            'photos/00584/outsider.jpg', now());
  EXCEPTION WHEN insufficient_privilege THEN v_blocked := true;
  END;
  ASSERT v_blocked, 'FAIL B4: outsider must be refused (42501) writing a scan image';

  UPDATE public.room_scans SET name = '00584 outsider touched'
   WHERE id = '58300000-0000-4000-8000-0000000000b1';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  ASSERT v_rows = 0, 'FAIL B5: outsider must update no room scan; rows=' || v_rows;

  PERFORM pg_temp.reset_role();
  RAISE NOTICE '00584 B passed: room_scan_images + room_scans';
END $$;

ROLLBACK TO SAVEPOINT s_b;

-- ═══════════════════════════════════════════════════════════════════════════
-- C · the Document's daily surfaces
-- ═══════════════════════════════════════════════════════════════════════════

SAVEPOINT s_c;

DO $$
DECLARE v_seen integer; v_rows integer; v_msg text;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000003');

  SELECT count(*) INTO v_seen FROM public.weekly_pulses
   WHERE id = '58300000-0000-4000-8000-0000000000f1';
  ASSERT v_seen = 1, 'FAIL C1: co-member must SELECT the designer''s weekly pulse; got ' || v_seen;

  INSERT INTO public.margin_notes (project_id, designer_id, body)
  VALUES ('b0000000-0000-0000-0000-0000000000d1',
          'a0000000-0000-0000-0000-000000000004', '00584 co-member note');

  INSERT INTO public.project_tasks (project_id, title)
  VALUES ('b0000000-0000-0000-0000-0000000000d1', '00584 co-member task');

  INSERT INTO public.project_documents (project_id, title, doc_type, uploaded_by)
  VALUES ('b0000000-0000-0000-0000-0000000000d1', '00584 co-member doc', 'pdf',
          'a0000000-0000-0000-0000-000000000003');

  INSERT INTO public.project_parties (project_id, party_kind, display_name)
  VALUES ('b0000000-0000-0000-0000-0000000000d1', 'gc', '00584 co-member party');

  INSERT INTO public.leads (designer_id, project_type)
  VALUES ('a0000000-0000-0000-0000-000000000004', 'full_home');

  SELECT count(*) INTO v_seen FROM public.client_invitations
   WHERE id = '58300000-0000-4000-8000-000000000071'::uuid;
  ASSERT v_seen = 1, 'FAIL C2: co-member must SELECT the designer''s client invitation; got ' || v_seen;

  SELECT count(*) INTO v_seen FROM public.match_ceremonies
   WHERE id = '58300000-0000-4000-8000-000000000072';
  ASSERT v_seen = 1, 'FAIL C3: co-member must SELECT the designer''s match ceremony; got ' || v_seen;

  DELETE FROM public.projects WHERE id = '58300000-0000-4000-8000-000000000031';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  ASSERT v_rows = 1,
    'FAIL C4: co-member must DELETE the designer''s project; rows=' || v_rows;

  -- RECORDED, NOT A BUG IN 00584. The colleague creating a project in the
  -- OWNER's name is refused — not by RLS but by set_project_studio_id(), the
  -- SECURITY DEFINER authority trigger, which requires
  -- NEW.designer_id = auth.uid() on every direct authenticated INSERT. RLS
  -- cannot lift a trigger, so 00584's projects_studio_insert leg widens nothing
  -- beyond what 00168 already allowed (both helpers admit the caller herself).
  -- Asserted so a future reader does not chase it as a policy defect.
  v_msg := NULL;
  BEGIN
    INSERT INTO public.projects (name, created_by, designer_id)
    VALUES ('00584 co-member project', 'a0000000-0000-0000-0000-000000000003',
            'a0000000-0000-0000-0000-000000000004');
  EXCEPTION WHEN OTHERS THEN v_msg := SQLERRM;
  END;
  ASSERT v_msg = 'studio_id_not_designer_studio',
    'FAIL C5: creating a project in a colleague''s name must still be refused '
    'by set_project_studio_id(); got ' || COALESCE(v_msg, '<inserted>');

  PERFORM pg_temp.reset_role();
  RAISE NOTICE '00584 C passed: co-member on the daily surfaces';
END $$;

ROLLBACK TO SAVEPOINT s_c;

SAVEPOINT s_c_out;

DO $$
DECLARE v_seen integer;
BEGIN
  PERFORM pg_temp.assume_user('cf100000-0000-4000-8000-000000000001');

  SELECT count(*) INTO v_seen FROM public.weekly_pulses
   WHERE id = '58300000-0000-4000-8000-0000000000f1';
  ASSERT v_seen = 0, 'FAIL C4: outsider must not see the weekly pulse; got ' || v_seen;

  SELECT count(*) INTO v_seen FROM public.client_invitations
   WHERE id = '58300000-0000-4000-8000-000000000071'::uuid;
  ASSERT v_seen = 0, 'FAIL C5: outsider must not see the client invitation; got ' || v_seen;

  SELECT count(*) INTO v_seen FROM public.match_ceremonies
   WHERE id = '58300000-0000-4000-8000-000000000072';
  ASSERT v_seen = 0, 'FAIL C6: outsider must not see the match ceremony; got ' || v_seen;

  PERFORM pg_temp.reset_role();
  RAISE NOTICE '00584 C-out passed: outsider blocked on reads';
END $$;

ROLLBACK TO SAVEPOINT s_c_out;

SAVEPOINT s_c_out_w;

DO $$
DECLARE v_blocked boolean; v_rows integer;
BEGIN
  PERFORM pg_temp.assume_user('cf100000-0000-4000-8000-000000000001');

  v_blocked := false;
  BEGIN
    INSERT INTO public.margin_notes (project_id, designer_id, body)
    VALUES ('b0000000-0000-0000-0000-0000000000d1',
            'a0000000-0000-0000-0000-000000000004', '00584 outsider note');
  EXCEPTION WHEN insufficient_privilege THEN v_blocked := true; END;
  ASSERT v_blocked, 'FAIL C7: outsider must be refused writing a margin note';

  v_blocked := false;
  BEGIN
    INSERT INTO public.project_tasks (project_id, title)
    VALUES ('b0000000-0000-0000-0000-0000000000d1', '00584 outsider task');
  EXCEPTION WHEN insufficient_privilege THEN v_blocked := true; END;
  ASSERT v_blocked, 'FAIL C8: outsider must be refused writing a project task';

  v_blocked := false;
  BEGIN
    INSERT INTO public.project_documents (project_id, title, doc_type)
    VALUES ('b0000000-0000-0000-0000-0000000000d1', '00584 outsider doc', 'pdf');
  EXCEPTION WHEN insufficient_privilege THEN v_blocked := true; END;
  ASSERT v_blocked, 'FAIL C9: outsider must be refused writing a project document';

  v_blocked := false;
  BEGIN
    INSERT INTO public.project_parties (project_id, party_kind, display_name)
    VALUES ('b0000000-0000-0000-0000-0000000000d1', 'gc', '00584 outsider party');
  EXCEPTION WHEN insufficient_privilege THEN v_blocked := true; END;
  ASSERT v_blocked, 'FAIL C10: outsider must be refused writing a project party';

  DELETE FROM public.projects WHERE id = '58300000-0000-4000-8000-000000000031';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  ASSERT v_rows = 0,
    'FAIL C11: outsider must delete none of the designer''s projects; rows=' || v_rows;

  v_blocked := false;
  BEGIN
    INSERT INTO public.leads (designer_id, project_type)
    VALUES ('a0000000-0000-0000-0000-000000000004', 'full_home');
  EXCEPTION WHEN insufficient_privilege THEN v_blocked := true; END;
  ASSERT v_blocked, 'FAIL C12: outsider must be refused creating a lead for the designer';

  PERFORM pg_temp.reset_role();
  RAISE NOTICE '00584 C-out-w passed: outsider blocked on writes';
END $$;

ROLLBACK TO SAVEPOINT s_c_out_w;

-- ═══════════════════════════════════════════════════════════════════════════
-- D · the proposal fleet, the catalog, the client record
--     (is_design_studio_comember)
-- ═══════════════════════════════════════════════════════════════════════════

SAVEPOINT s_d;

DO $$
DECLARE v_seen integer; v_rows integer;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000003');

  SELECT count(*) INTO v_seen FROM public.proposal_captures
   WHERE id = '58300000-0000-4000-8000-000000000073';
  ASSERT v_seen = 1, 'FAIL D1: co-member must SELECT the designer''s proposal capture; got ' || v_seen;

  SELECT count(*) INTO v_seen FROM public.ffe_categories
   WHERE id = '58300000-0000-4000-8000-000000000074';
  ASSERT v_seen = 1, 'FAIL D2: co-member must SELECT the designer''s FF&E category; got ' || v_seen;

  SELECT count(*) INTO v_seen FROM public.rooms
   WHERE user_id = 'a0000000-0000-0000-0000-000000000005';
  ASSERT v_seen >= 1,
    'FAIL D3: co-member must read the engaged client''s rooms through the '
    'engagement; got ' || v_seen;

  DELETE FROM public.products WHERE id = '58300000-0000-4000-8000-000000000075';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  ASSERT v_rows = 1,
    'FAIL D4: an active studio member must DELETE a studio-layer product; rows=' || v_rows;

  PERFORM pg_temp.reset_role();
  PERFORM pg_temp.assume_user('cf100000-0000-4000-8000-000000000001');

  SELECT count(*) INTO v_seen FROM public.proposal_captures
   WHERE id = '58300000-0000-4000-8000-000000000073';
  ASSERT v_seen = 0, 'FAIL D5: outsider must not see the proposal capture; got ' || v_seen;

  SELECT count(*) INTO v_seen FROM public.ffe_categories
   WHERE id = '58300000-0000-4000-8000-000000000074';
  ASSERT v_seen = 0, 'FAIL D6: outsider must not see the FF&E category; got ' || v_seen;

  SELECT count(*) INTO v_seen FROM public.rooms
   WHERE user_id = 'a0000000-0000-0000-0000-000000000005';
  ASSERT v_seen = 0, 'FAIL D7: outsider must not read the client''s rooms; got ' || v_seen;

  PERFORM pg_temp.reset_role();
  RAISE NOTICE '00584 D passed: proposal fleet, catalog, client record';
END $$;

ROLLBACK TO SAVEPOINT s_d;

-- Deleted inside its own savepoint so the product survives for a rerun.
SAVEPOINT s_d_products_out;

DO $$
DECLARE v_rows integer;
BEGIN
  PERFORM pg_temp.assume_user('cf100000-0000-4000-8000-000000000001');
  DELETE FROM public.products WHERE id = '58300000-0000-4000-8000-000000000075';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  ASSERT v_rows = 0,
    'FAIL D8: a member of another studio must delete no studio-layer product '
    'of this studio; rows=' || v_rows;
  PERFORM pg_temp.reset_role();
  RAISE NOTICE '00584 D-out passed: outsider deletes no studio product';
END $$;

ROLLBACK TO SAVEPOINT s_d_products_out;

-- ═══════════════════════════════════════════════════════════════════════════
-- E · storage.objects — project-documents (both paths), room-scans,
--     field-media, proposal-assets
-- ═══════════════════════════════════════════════════════════════════════════

SAVEPOINT s_e;

DO $$
DECLARE v_seen integer;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000003');

  SELECT count(*) INTO v_seen FROM storage.objects
   WHERE bucket_id = 'project-documents'
     AND name = pg_temp.discovery_object();
  ASSERT v_seen = 1, 'FAIL E1: co-member must read the discovery-folio object; got ' || v_seen;

  SELECT count(*) INTO v_seen FROM storage.objects
   WHERE bucket_id = 'project-documents'
     AND name = 'b0000000-0000-0000-0000-0000000000d1/00584-project.pdf';
  ASSERT v_seen = 1, 'FAIL E2: co-member must read the project-keyed object; got ' || v_seen;

  SELECT count(*) INTO v_seen FROM storage.objects
   WHERE bucket_id = 'room-scans'
     AND name = 'usdz/a0000000-0000-0000-0000-000000000004/58300000-0000-4000-8000-0000000000b3/scan.usdz';
  ASSERT v_seen = 1, 'FAIL E3: co-member must read the room-scans artifact; got ' || v_seen;

  SELECT count(*) INTO v_seen FROM storage.objects
   WHERE bucket_id = 'field-media'
     AND name = 'project/b0000000-0000-0000-0000-0000000000d1/00584-field.jpg';
  ASSERT v_seen = 1, 'FAIL E4: co-member must read the field-media object; got ' || v_seen;

  -- proposal-assets is PUBLIC-read (00099's "Proposal assets are publicly
  -- readable"), so SELECT proves nothing there. The widened verb is the write.
  INSERT INTO storage.objects (bucket_id, name, owner)
  VALUES ('proposal-assets',
          'b0000000-0000-0000-0000-000000000001/00584-comember-asset.jpg',
          'a0000000-0000-0000-0000-000000000003');

  PERFORM pg_temp.reset_role();
  RAISE NOTICE '00584 E passed: co-member across four buckets';
END $$;

ROLLBACK TO SAVEPOINT s_e;

SAVEPOINT s_e_out;

DO $$
DECLARE v_seen integer; v_blocked boolean := false;
BEGIN
  PERFORM pg_temp.assume_user('cf100000-0000-4000-8000-000000000001');

  SELECT count(*) INTO v_seen FROM storage.objects
   WHERE bucket_id = 'project-documents'
     AND name IN (pg_temp.discovery_object(),
                  'b0000000-0000-0000-0000-0000000000d1/00584-project.pdf');
  ASSERT v_seen = 0, 'FAIL E5: outsider must read neither project-documents object; got ' || v_seen;

  SELECT count(*) INTO v_seen FROM storage.objects
   WHERE bucket_id = 'room-scans'
     AND name = 'usdz/a0000000-0000-0000-0000-000000000004/58300000-0000-4000-8000-0000000000b3/scan.usdz';
  ASSERT v_seen = 0, 'FAIL E6: outsider must not read the room-scans artifact; got ' || v_seen;

  SELECT count(*) INTO v_seen FROM storage.objects
   WHERE bucket_id = 'field-media'
     AND name = 'project/b0000000-0000-0000-0000-0000000000d1/00584-field.jpg';
  ASSERT v_seen = 0, 'FAIL E7: outsider must not read the field-media object; got ' || v_seen;

  BEGIN
    INSERT INTO storage.objects (bucket_id, name, owner)
    VALUES ('proposal-assets',
            'b0000000-0000-0000-0000-000000000001/00584-outsider-asset.jpg',
            'cf100000-0000-4000-8000-000000000001');
  EXCEPTION WHEN insufficient_privilege THEN v_blocked := true;
  END;
  ASSERT v_blocked, 'FAIL E8: outsider must be refused uploading a proposal asset';

  PERFORM pg_temp.reset_role();
  RAISE NOTICE '00584 E-out passed: outsider blocked across four buckets';
END $$;

ROLLBACK TO SAVEPOINT s_e_out;

-- ═══════════════════════════════════════════════════════════════════════════
-- F · the field-media `name`-binding fix (00282:189)
--
-- Before 00584 the designer branch of "Field team can read field media" read
-- storage.foldername(p.name) — the PROJECT'S NAME — so it matched nothing and
-- the OWNING DESIGNER could not read her own project's field media. She is not
-- an is_project_team_member row here, so this row is reachable only through the
-- repaired branch.
-- ═══════════════════════════════════════════════════════════════════════════

SAVEPOINT s_f;

DO $$
DECLARE v_seen integer; v_team boolean;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');

  v_team := public.is_project_team_member('b0000000-0000-0000-0000-0000000000d1'::uuid);
  ASSERT NOT v_team,
    'FAIL F1: the designer must NOT be a project_team_members row, or the '
    'team branch would carry this read and the fix would be unproven';

  SELECT count(*) INTO v_seen FROM storage.objects
   WHERE bucket_id = 'field-media'
     AND name = 'project/b0000000-0000-0000-0000-0000000000d1/00584-field.jpg';
  ASSERT v_seen = 1,
    'FAIL F2: the OWNING designer must read her project''s field media — this '
    'was 0 before 00584 because `name` bound to projects.name; got ' || v_seen;

  PERFORM pg_temp.reset_role();
  RAISE NOTICE '00584 F passed: field-media name-binding fix';
END $$;

ROLLBACK TO SAVEPOINT s_f;

-- ═══════════════════════════════════════════════════════════════════════════
-- G · room_scans_studio_select (item 8) — the SELECT leg the write legs need
--
-- Scan C is the designer's and carries NO room_scan_association, so neither
-- 00020's association branch nor 00287 reaches it. Only
-- room_scans_studio_select does. The UPDATE below is the point: Postgres
-- filters an UPDATE's target rows through the SELECT policies first, so
-- room_scans_studio_update alone would move nothing.
-- ═══════════════════════════════════════════════════════════════════════════

SAVEPOINT s_g;

DO $$
DECLARE v_seen integer; v_rows integer;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000003');

  SELECT count(*) INTO v_seen FROM public.room_scans
   WHERE id = '58300000-0000-4000-8000-0000000000b4';
  ASSERT v_seen = 1,
    'FAIL G1: co-member must SELECT the designer''s unassociated scan; got ' || v_seen;

  UPDATE public.room_scans SET name = '00584 G touched'
   WHERE id = '58300000-0000-4000-8000-0000000000b4';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  ASSERT v_rows = 1,
    'FAIL G2: co-member must UPDATE the designer''s unassociated scan; rows=' || v_rows;

  PERFORM pg_temp.reset_role();
  PERFORM pg_temp.assume_user('cf100000-0000-4000-8000-000000000001');

  SELECT count(*) INTO v_seen FROM public.room_scans
   WHERE id = '58300000-0000-4000-8000-0000000000b4';
  ASSERT v_seen = 0, 'FAIL G3: outsider must not see the scan; got ' || v_seen;

  UPDATE public.room_scans SET name = '00584 G outsider'
   WHERE id = '58300000-0000-4000-8000-0000000000b4';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  ASSERT v_rows = 0, 'FAIL G4: outsider must update no scan; rows=' || v_rows;

  PERFORM pg_temp.reset_role();
  RAISE NOTICE '00584 G passed: room_scans_studio_select';
END $$;

ROLLBACK TO SAVEPOINT s_g;

-- ═══════════════════════════════════════════════════════════════════════════
-- H · procurement children — damage_claims (item 4), po_payments (item 5)
-- ═══════════════════════════════════════════════════════════════════════════

SAVEPOINT s_h;

DO $$
DECLARE v_seen integer;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000003');

  SELECT count(*) INTO v_seen FROM public.damage_claims
   WHERE id = '58300000-0000-4000-8000-000000000041';
  ASSERT v_seen = 1,
    'FAIL H1: co-member must SELECT the claim on the designer''s inspection; got ' || v_seen;

  SELECT count(*) INTO v_seen FROM public.po_payments
   WHERE id = '58300000-0000-4000-8000-000000000042';
  ASSERT v_seen = 1,
    'FAIL H2: co-member must SELECT the payment on the designer''s PO; got ' || v_seen;

  PERFORM pg_temp.reset_role();
  PERFORM pg_temp.assume_user('cf100000-0000-4000-8000-000000000001');

  SELECT count(*) INTO v_seen FROM public.damage_claims
   WHERE id = '58300000-0000-4000-8000-000000000041';
  ASSERT v_seen = 0, 'FAIL H3: outsider must not see the damage claim; got ' || v_seen;

  SELECT count(*) INTO v_seen FROM public.po_payments
   WHERE id = '58300000-0000-4000-8000-000000000042';
  ASSERT v_seen = 0, 'FAIL H4: outsider must not see the PO payment; got ' || v_seen;

  PERFORM pg_temp.reset_role();
  RAISE NOTICE '00584 H passed: damage_claims + po_payments';
END $$;

ROLLBACK TO SAVEPOINT s_h;

-- ═══════════════════════════════════════════════════════════════════════════
-- I · field_link_tokens (item 22), sms_conversations (item 24)
-- ═══════════════════════════════════════════════════════════════════════════

SAVEPOINT s_i;

DO $$
DECLARE v_seen integer;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000003');

  SELECT count(*) INTO v_seen FROM public.field_link_tokens
   WHERE id = '58300000-0000-4000-8000-000000000044';
  ASSERT v_seen = 1,
    'FAIL I1: co-member must SELECT the field link token on the designer''s project; got ' || v_seen;

  SELECT count(*) INTO v_seen FROM public.sms_conversations
   WHERE id = '58300000-0000-4000-8000-000000000045';
  ASSERT v_seen = 1,
    'FAIL I2: co-member must SELECT the SMS conversation on the designer''s project; got ' || v_seen;

  PERFORM pg_temp.reset_role();
  PERFORM pg_temp.assume_user('cf100000-0000-4000-8000-000000000001');

  SELECT count(*) INTO v_seen FROM public.field_link_tokens
   WHERE id = '58300000-0000-4000-8000-000000000044';
  ASSERT v_seen = 0, 'FAIL I3: outsider must not see the field link token; got ' || v_seen;

  SELECT count(*) INTO v_seen FROM public.sms_conversations
   WHERE id = '58300000-0000-4000-8000-000000000045';
  ASSERT v_seen = 0, 'FAIL I4: outsider must not see the SMS conversation; got ' || v_seen;

  PERFORM pg_temp.reset_role();
  RAISE NOTICE '00584 I passed: field_link_tokens + sms_conversations';
END $$;

ROLLBACK TO SAVEPOINT s_i;

-- ═══════════════════════════════════════════════════════════════════════════
-- J · proposal_engagement (item 26), phase_templates (item 28)
-- ═══════════════════════════════════════════════════════════════════════════

SAVEPOINT s_j;

DO $$
DECLARE v_seen integer;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000003');

  SELECT count(*) INTO v_seen FROM public.proposal_engagement
   WHERE id = '58300000-0000-4000-8000-000000000046';
  ASSERT v_seen = 1,
    'FAIL J1: co-member must SELECT engagement on the designer''s proposal; got ' || v_seen;

  SELECT count(*) INTO v_seen FROM public.phase_templates
   WHERE id = '58300000-0000-4000-8000-000000000047';
  ASSERT v_seen = 1,
    'FAIL J2: co-member must SELECT the designer''s phase template; got ' || v_seen;

  PERFORM pg_temp.reset_role();
  PERFORM pg_temp.assume_user('cf100000-0000-4000-8000-000000000001');

  SELECT count(*) INTO v_seen FROM public.proposal_engagement
   WHERE id = '58300000-0000-4000-8000-000000000046';
  ASSERT v_seen = 0, 'FAIL J3: outsider must not see the proposal engagement; got ' || v_seen;

  SELECT count(*) INTO v_seen FROM public.phase_templates
   WHERE id = '58300000-0000-4000-8000-000000000047';
  ASSERT v_seen = 0,
    'FAIL J4: outsider must not see the designer''s non-system phase template; got ' || v_seen;

  PERFORM pg_temp.reset_role();
  RAISE NOTICE '00584 J passed: proposal_engagement + phase_templates';
END $$;

ROLLBACK TO SAVEPOINT s_j;

-- ═══════════════════════════════════════════════════════════════════════════
-- K · invoices delete (item 31) — draft only, matching invoices_studio_update_draft
-- ═══════════════════════════════════════════════════════════════════════════

SAVEPOINT s_k;

DO $$
DECLARE v_rows integer;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000003');

  DELETE FROM public.invoices WHERE id = '58300000-0000-4000-8000-00000000004e';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  ASSERT v_rows = 0,
    'FAIL K1: co-member must NOT delete a sent invoice; rows=' || v_rows;

  DELETE FROM public.invoices WHERE id = '58300000-0000-4000-8000-00000000004d';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  ASSERT v_rows = 1,
    'FAIL K2: co-member must delete a DRAFT invoice; rows=' || v_rows;

  PERFORM pg_temp.reset_role();
  RAISE NOTICE '00584 K passed: invoices delete is draft-only';
END $$;

ROLLBACK TO SAVEPOINT s_k;

SAVEPOINT s_k_out;

DO $$
DECLARE v_rows integer;
BEGIN
  PERFORM pg_temp.assume_user('cf100000-0000-4000-8000-000000000001');
  DELETE FROM public.invoices WHERE id = '58300000-0000-4000-8000-00000000004d';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  ASSERT v_rows = 0,
    'FAIL K3: outsider must delete no invoice of this studio; rows=' || v_rows;
  PERFORM pg_temp.reset_role();
  RAISE NOTICE '00584 K-out passed: outsider deletes no invoice';
END $$;

ROLLBACK TO SAVEPOINT s_k_out;

-- ═══════════════════════════════════════════════════════════════════════════
-- L · lead_room_scans (item 32), room_scan_associations active view (item 33),
--     room_scan_images UPDATE (item 7)
-- ═══════════════════════════════════════════════════════════════════════════

SAVEPOINT s_l;

DO $$
DECLARE v_seen integer; v_rows integer;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000003');

  SELECT count(*) INTO v_seen FROM public.lead_room_scans
   WHERE id = '58300000-0000-4000-8000-000000000048';
  ASSERT v_seen = 1,
    'FAIL L1: co-member must SELECT the scan attached to the designer''s lead; got ' || v_seen;

  SELECT count(*) INTO v_seen FROM public.room_scan_associations
   WHERE id = '58300000-0000-4000-8000-0000000000b2';
  ASSERT v_seen = 1,
    'FAIL L2: co-member must SELECT the designer''s ACTIVE association; got ' || v_seen;

  UPDATE public.room_scan_images SET role = 'detail'
   WHERE id = '58300000-0000-4000-8000-0000000000c2';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  ASSERT v_rows = 1,
    'FAIL L3: co-member must UPDATE an image on the designer''s scan; rows=' || v_rows;

  PERFORM pg_temp.reset_role();
  PERFORM pg_temp.assume_user('cf100000-0000-4000-8000-000000000001');

  SELECT count(*) INTO v_seen FROM public.lead_room_scans
   WHERE id = '58300000-0000-4000-8000-000000000048';
  ASSERT v_seen = 0, 'FAIL L4: outsider must not see the lead''s scan link; got ' || v_seen;

  SELECT count(*) INTO v_seen FROM public.room_scan_associations
   WHERE id = '58300000-0000-4000-8000-0000000000b2';
  ASSERT v_seen = 0, 'FAIL L5: outsider must not see the association; got ' || v_seen;

  UPDATE public.room_scan_images SET role = 'detail'
   WHERE id = '58300000-0000-4000-8000-0000000000c2';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  ASSERT v_rows = 0, 'FAIL L6: outsider must update no scan image; rows=' || v_rows;

  PERFORM pg_temp.reset_role();
  RAISE NOTICE '00584 L passed: lead_room_scans, associations, image update';
END $$;

ROLLBACK TO SAVEPOINT s_l;

-- ═══════════════════════════════════════════════════════════════════════════
-- M · margin_notes UPDATE (item 12) — 00316 widened only the SELECT
-- ═══════════════════════════════════════════════════════════════════════════

SAVEPOINT s_m;

DO $$
DECLARE v_rows integer;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000003');

  UPDATE public.margin_notes SET body = '00584 co-member edited'
   WHERE id = '58300000-0000-4000-8000-00000000004f';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  ASSERT v_rows = 1,
    'FAIL M1: co-member must UPDATE the designer''s margin note; rows=' || v_rows;

  PERFORM pg_temp.reset_role();
  PERFORM pg_temp.assume_user('cf100000-0000-4000-8000-000000000001');

  UPDATE public.margin_notes SET body = '00584 outsider edited'
   WHERE id = '58300000-0000-4000-8000-00000000004f';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  ASSERT v_rows = 0, 'FAIL M2: outsider must update no margin note; rows=' || v_rows;

  PERFORM pg_temp.reset_role();
  RAISE NOTICE '00584 M passed: margin_notes update';
END $$;

ROLLBACK TO SAVEPOINT s_m;

-- ═══════════════════════════════════════════════════════════════════════════
-- N · the client record, read-through (item 35) — room_features, saved_items,
--     client_style_profiles, profile_presence
-- ═══════════════════════════════════════════════════════════════════════════

SAVEPOINT s_n;

DO $$
DECLARE v_seen integer;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000003');

  SELECT count(*) INTO v_seen FROM public.room_features
   WHERE id = '58300000-0000-4000-8000-000000000049';
  ASSERT v_seen = 1,
    'FAIL N1: co-member must SELECT a feature of the engaged client''s room; got ' || v_seen;

  SELECT count(*) INTO v_seen FROM public.saved_items
   WHERE id = '58300000-0000-4000-8000-00000000004a';
  ASSERT v_seen = 1,
    'FAIL N2: co-member must SELECT the engaged client''s saved item; got ' || v_seen;

  SELECT count(*) INTO v_seen FROM public.client_style_profiles
   WHERE id = '58300000-0000-4000-8000-00000000004b';
  ASSERT v_seen = 1,
    'FAIL N3: co-member must SELECT the engaged client''s style profile; got ' || v_seen;

  SELECT count(*) INTO v_seen FROM public.profile_presence
   WHERE user_id = 'a0000000-0000-0000-0000-000000000005';
  ASSERT v_seen = 1,
    'FAIL N4: co-member must SELECT the engaged client''s presence; got ' || v_seen;

  PERFORM pg_temp.reset_role();
  PERFORM pg_temp.assume_user('cf100000-0000-4000-8000-000000000001');

  SELECT count(*) INTO v_seen FROM public.room_features
   WHERE id = '58300000-0000-4000-8000-000000000049';
  ASSERT v_seen = 0, 'FAIL N5: outsider must not see the room feature; got ' || v_seen;

  SELECT count(*) INTO v_seen FROM public.saved_items
   WHERE id = '58300000-0000-4000-8000-00000000004a';
  ASSERT v_seen = 0, 'FAIL N6: outsider must not see the saved item; got ' || v_seen;

  SELECT count(*) INTO v_seen FROM public.client_style_profiles
   WHERE id = '58300000-0000-4000-8000-00000000004b';
  ASSERT v_seen = 0, 'FAIL N7: outsider must not see the style profile; got ' || v_seen;

  SELECT count(*) INTO v_seen FROM public.profile_presence
   WHERE user_id = 'a0000000-0000-0000-0000-000000000005';
  ASSERT v_seen = 0, 'FAIL N8: outsider must not see the client''s presence; got ' || v_seen;

  PERFORM pg_temp.reset_role();
  RAISE NOTICE '00584 N passed: the client record read-through';
END $$;

ROLLBACK TO SAVEPOINT s_n;

-- ═══════════════════════════════════════════════════════════════════════════
-- O · vendor_quote_requests (item 36) — unlinked requests only; 00403's guard
--     trigger still refuses a configuration-linked one written for a colleague
-- ═══════════════════════════════════════════════════════════════════════════

SAVEPOINT s_o;

DO $$
DECLARE v_seen integer;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000003');

  SELECT count(*) INTO v_seen FROM public.vendor_quote_requests
   WHERE id = '58300000-0000-4000-8000-00000000004c';
  ASSERT v_seen = 1,
    'FAIL O1: co-member must SELECT the designer''s quote request; got ' || v_seen;

  PERFORM pg_temp.reset_role();
  PERFORM pg_temp.assume_user('cf100000-0000-4000-8000-000000000001');

  SELECT count(*) INTO v_seen FROM public.vendor_quote_requests
   WHERE id = '58300000-0000-4000-8000-00000000004c';
  ASSERT v_seen = 0, 'FAIL O2: outsider must not see the quote request; got ' || v_seen;

  PERFORM pg_temp.reset_role();
  RAISE NOTICE '00584 O passed: vendor_quote_requests';
END $$;

ROLLBACK TO SAVEPOINT s_o;

-- ═══════════════════════════════════════════════════════════════════════════
-- P · projects delete (item 18) — non-completed only
-- ═══════════════════════════════════════════════════════════════════════════

SAVEPOINT s_p;

DO $$
DECLARE v_rows integer;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000003');

  DELETE FROM public.projects WHERE id = '58300000-0000-4000-8000-000000000032';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  ASSERT v_rows = 0,
    'FAIL P1: co-member must NOT delete a COMPLETED project; rows=' || v_rows;

  DELETE FROM public.projects WHERE id = '58300000-0000-4000-8000-000000000031';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  ASSERT v_rows = 1,
    'FAIL P2: co-member must delete a non-completed project; rows=' || v_rows;

  PERFORM pg_temp.reset_role();
  PERFORM pg_temp.assume_user('cf100000-0000-4000-8000-000000000001');

  DELETE FROM public.projects WHERE id = '58300000-0000-4000-8000-000000000032';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  ASSERT v_rows = 0, 'FAIL P3: outsider must delete no project; rows=' || v_rows;

  PERFORM pg_temp.reset_role();
  RAISE NOTICE '00584 P passed: projects delete is non-completed only';
END $$;

ROLLBACK TO SAVEPOINT s_p;

ROLLBACK;
