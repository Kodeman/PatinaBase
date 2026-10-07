-- ═══════════════════════════════════════════════════════════════════════════
-- US-16 Phase 2 review hardening (migration 00718; SQ-447, the SQ-434 findings)
--
-- Studio A (owner O, member M; release threshold 500.00), Studio C (owner Y,
-- with O and M also members: Y is a co-member of both, but not of Studio A),
-- an outsider X and Project A's client.
-- Each case is the reviewer's failing input; before 00718 every assertion
-- named below fails.
--   R1  an acknowledgment cannot confirm a draft the release gate holds
--       (v2 and v1); released, it can.
--   M1  voiding a vendor payment cannot leave net paid below zero.
--   M2  vendor_payments.payee: a carrier payment is recorded as such, never
--       counts toward the refund cap, and does not block a price change; a
--       scheduled row is the vendor's; a bad payee is refused.
--   M5  accepting the ack's freight makes the PO's freight total the vendor's
--       figure (the latest unbilled line carries the rest, floored at 0).
--   R8  accepting a sku on a line on an executed authorization is a change
--       order; a line on no authorization takes it.
--   M4  a deposit never exceeds the line's price; a balance never exceeds the
--       price less the live deposit.
--   S1  a co-member of the PO owner through another studio no longer reads
--       the PO or its inspections, nor writes an inspection.
--   S2  a quote request with no project, made in another studio, cannot be
--       linked to this studio's project.
--   S3  a held or cancelled PO takes no spec revision.
--   S4  shipped with no shipment row composes the receiver's inbound notice,
--       awaiting review; a PO with a shipment row composes none here.
--   C1  the substitution copy follows the exception: price change, backorder.
--   D1  drafts are claimed before they are sent; one claim at a time; only
--       the claimer marks or releases; the service path may release.
-- 00720 (SQ-451):
--   G4  a carrier payment leaves the payment schedule editable.
--   G5  a stale claim is freed by another studio member, never a fresh one,
--       never by a stranger; with a send on record it is completed, not
--       freed; the sweep completes or returns stalled sends.
--   G7  a job-site shipment composes no receiver notice (null).
--
-- How to run (local stack):
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -X -v ON_ERROR_STOP=1 -f supabase/tests/procurement/phase2_review_hardening_test.sql
--
-- One transaction, rolled back at the end.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL timezone TO 'UTC';

-- ─── fixtures ──────────────────────────────────────────────────────────────

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('70718000-0000-4000-8000-0000000000a1', 'sq447-owner@test.invalid',    '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'), -- O
  ('70718000-0000-4000-8000-0000000000a2', 'sq447-member@test.invalid',   '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'), -- M
  ('70718000-0000-4000-8000-0000000000a4', 'sq447-outsider@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'), -- X
  ('70718000-0000-4000-8000-0000000000a6', 'sq447-client@test.invalid',   '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'), -- client
  ('70718000-0000-4000-8000-0000000000a7', 'sq447-other@test.invalid',    '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'); -- Y

INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('70718000-0000-4000-8000-0000000000a1', 'sq447-owner@test.invalid',    'SQ447 Owner',    NOW(), NOW()),
  ('70718000-0000-4000-8000-0000000000a2', 'sq447-member@test.invalid',   'SQ447 Member',   NOW(), NOW()),
  ('70718000-0000-4000-8000-0000000000a4', 'sq447-outsider@test.invalid', 'SQ447 Outsider', NOW(), NOW()),
  ('70718000-0000-4000-8000-0000000000a6', 'sq447-client@test.invalid',   'SQ447 Client',   NOW(), NOW()),
  ('70718000-0000-4000-8000-0000000000a7', 'sq447-other@test.invalid',    'SQ447 Other',    NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO organizations (id, type, name, slug, release_threshold_cents)
VALUES
  ('70718000-0000-4000-8000-0000000000f1', 'design_studio', 'SQ447 Studio A', 'sq447-studio-a-test', 50000),
  ('70718000-0000-4000-8000-0000000000f3', 'design_studio', 'SQ447 Studio C', 'sq447-studio-c-test', NULL);

INSERT INTO organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES
  ('70718000-0000-4000-8000-0000000000e1', '70718000-0000-4000-8000-0000000000a1', '70718000-0000-4000-8000-0000000000f1', 'owner',  'active', NOW()),
  ('70718000-0000-4000-8000-0000000000e2', '70718000-0000-4000-8000-0000000000a2', '70718000-0000-4000-8000-0000000000f1', 'member', 'active', NOW()),
  ('70718000-0000-4000-8000-0000000000e7', '70718000-0000-4000-8000-0000000000a7', '70718000-0000-4000-8000-0000000000f3', 'owner',  'active', NOW()),
  ('70718000-0000-4000-8000-0000000000e8', '70718000-0000-4000-8000-0000000000a1', '70718000-0000-4000-8000-0000000000f3', 'member', 'active', NOW()),
  ('70718000-0000-4000-8000-0000000000e9', '70718000-0000-4000-8000-0000000000a2', '70718000-0000-4000-8000-0000000000f3', 'member', 'active', NOW());

INSERT INTO projects (id, name, designer_id, client_id, created_by, studio_id)
VALUES ('70718000-0000-4000-8000-000000000001', 'SQ447 Project A', '70718000-0000-4000-8000-0000000000a1',
        '70718000-0000-4000-8000-0000000000a6', '70718000-0000-4000-8000-0000000000a1', '70718000-0000-4000-8000-0000000000f1');

INSERT INTO designer_clients (id, designer_id, client_id, status)
VALUES ('70718000-0000-4000-8000-0000000000d1', '70718000-0000-4000-8000-0000000000a1', '70718000-0000-4000-8000-0000000000a6', 'active');

INSERT INTO vendors (id, name, orders_email)
VALUES ('70718000-0000-4000-8000-000000000011', 'SQ447 Workroom', 'orders@sq447-workroom.test.invalid');

-- The receiver: a location with a person on the card.
INSERT INTO studio_contacts (id, organization_id, entity_kind, contact_kind, full_name, email)
VALUES ('70718000-0000-4000-8000-000000000051', '70718000-0000-4000-8000-0000000000f1', 'person', 'receiver',
        'Rae Dock', 'dock@sq447-receiver.test.invalid');
INSERT INTO studio_locations (id, organization_id, kind, label, studio_contact_id)
VALUES ('70718000-0000-4000-8000-000000000052', '70718000-0000-4000-8000-0000000000f1', 'receiver', 'SQ447 Receiver',
        '70718000-0000-4000-8000-000000000051');

-- POs (Project A, the workroom, created by M):
--   101 draft, unsent, 600.00 ≥ the 500.00 threshold     (R1)
--   102 confirmed                                          (M1)
--   103 confirmed, a bench, a scheduled deposit row        (M2)
--   104 confirmed, two freight lines                       (M5)
--   105 confirmed, a desk on an executed authorization
--       and a lamp on none                                 (R8, S3 control)
--   106 held for release; 107 cancelled                    (S3)
--   108 confirmed, ships to the receiver                   (S4)
--   109 confirmed, ships to the receiver, a shipment row   (S4 control)
--   110 confirmed, an inspection                           (S1)
INSERT INTO purchase_orders (id, designer_id, project_id, vendor_id, payment_pattern, total_cents, status, created_by, sent_at, held_at, ship_to_location_id)
VALUES
  ('70718000-0000-4000-8000-000000000101', '70718000-0000-4000-8000-0000000000a1', '70718000-0000-4000-8000-000000000001', '70718000-0000-4000-8000-000000000011', 'net_30', 60000, 'draft',            '70718000-0000-4000-8000-0000000000a2', NULL,  NULL,  NULL),
  ('70718000-0000-4000-8000-000000000102', '70718000-0000-4000-8000-0000000000a1', '70718000-0000-4000-8000-000000000001', '70718000-0000-4000-8000-000000000011', 'net_30', 30000, 'confirmed',        '70718000-0000-4000-8000-0000000000a2', NOW(), NULL,  NULL),
  ('70718000-0000-4000-8000-000000000103', '70718000-0000-4000-8000-0000000000a1', '70718000-0000-4000-8000-000000000001', '70718000-0000-4000-8000-000000000011', 'net_30', 30000, 'confirmed',        '70718000-0000-4000-8000-0000000000a2', NOW(), NULL,  NULL),
  ('70718000-0000-4000-8000-000000000104', '70718000-0000-4000-8000-0000000000a1', '70718000-0000-4000-8000-000000000001', '70718000-0000-4000-8000-000000000011', 'net_30', 20000, 'confirmed',        '70718000-0000-4000-8000-0000000000a2', NOW(), NULL,  NULL),
  ('70718000-0000-4000-8000-000000000105', '70718000-0000-4000-8000-0000000000a1', '70718000-0000-4000-8000-000000000001', '70718000-0000-4000-8000-000000000011', 'net_30', 48000, 'confirmed',        '70718000-0000-4000-8000-0000000000a2', NOW(), NULL,  NULL),
  ('70718000-0000-4000-8000-000000000106', '70718000-0000-4000-8000-0000000000a1', '70718000-0000-4000-8000-000000000001', '70718000-0000-4000-8000-000000000011', 'net_30', 60000, 'held_for_release', '70718000-0000-4000-8000-0000000000a2', NULL,  NOW(), NULL),
  ('70718000-0000-4000-8000-000000000107', '70718000-0000-4000-8000-0000000000a1', '70718000-0000-4000-8000-000000000001', '70718000-0000-4000-8000-000000000011', 'net_30', 10000, 'cancelled',        '70718000-0000-4000-8000-0000000000a2', NOW(), NULL,  NULL),
  ('70718000-0000-4000-8000-000000000108', '70718000-0000-4000-8000-0000000000a1', '70718000-0000-4000-8000-000000000001', '70718000-0000-4000-8000-000000000011', 'net_30', 10000, 'confirmed',        '70718000-0000-4000-8000-0000000000a2', NOW(), NULL,  '70718000-0000-4000-8000-000000000052'),
  ('70718000-0000-4000-8000-000000000109', '70718000-0000-4000-8000-0000000000a1', '70718000-0000-4000-8000-000000000001', '70718000-0000-4000-8000-000000000011', 'net_30', 10000, 'confirmed',        '70718000-0000-4000-8000-0000000000a2', NOW(), NULL,  '70718000-0000-4000-8000-000000000052'),
  ('70718000-0000-4000-8000-000000000110', '70718000-0000-4000-8000-0000000000a1', '70718000-0000-4000-8000-000000000001', '70718000-0000-4000-8000-000000000011', 'net_30', 10000, 'confirmed',        '70718000-0000-4000-8000-0000000000a2', NOW(), NULL,  NULL);

-- Lines. 261 / 262 have no PO (M4); 271 / 273 are selected lines whose
-- alternates are 272 / 274 (C1, names without digits).
INSERT INTO project_ffe_items (id, project_id, name, status, quantity, unit_price_cents, trade_price_cents, line_total_cents, purchase_order_id, vendor_id, design_disposition, blocked)
VALUES
  ('70718000-0000-4000-8000-000000000211', '70718000-0000-4000-8000-000000000001', 'SQ447 chair',  'ordered',  1, 80000, 60000, 80000, '70718000-0000-4000-8000-000000000101', '70718000-0000-4000-8000-000000000011', 'selected', false),
  ('70718000-0000-4000-8000-000000000231', '70718000-0000-4000-8000-000000000001', 'SQ447 bench',  'ordered',  1, 40000, 30000, 40000, '70718000-0000-4000-8000-000000000103', '70718000-0000-4000-8000-000000000011', 'selected', false),
  ('70718000-0000-4000-8000-000000000241', '70718000-0000-4000-8000-000000000001', 'SQ447 desk',   'ordered',  1, 50000, 40000, 50000, '70718000-0000-4000-8000-000000000105', '70718000-0000-4000-8000-000000000011', 'selected', false),
  ('70718000-0000-4000-8000-000000000242', '70718000-0000-4000-8000-000000000001', 'SQ447 lamp',   'ordered',  1, 10000,  8000, 10000, '70718000-0000-4000-8000-000000000105', '70718000-0000-4000-8000-000000000011', 'selected', false),
  ('70718000-0000-4000-8000-000000000281', '70718000-0000-4000-8000-000000000001', 'SQ447 crate',  'ordered',  2,  5000,  5000, 10000, '70718000-0000-4000-8000-000000000108', '70718000-0000-4000-8000-000000000011', 'selected', false),
  ('70718000-0000-4000-8000-000000000261', '70718000-0000-4000-8000-000000000001', 'SQ447 sofa',   'approved', 1, 100000, 70000, 100000, NULL, '70718000-0000-4000-8000-000000000011', 'selected', false),
  ('70718000-0000-4000-8000-000000000262', '70718000-0000-4000-8000-000000000001', 'SQ447 rug',    'approved', 1, 20000, 15000, 20000, NULL, '70718000-0000-4000-8000-000000000011', 'selected', false),
  ('70718000-0000-4000-8000-000000000271', '70718000-0000-4000-8000-000000000001', 'Wingback armchair',        'approved', 1, 90000, 60000, 90000, NULL, '70718000-0000-4000-8000-000000000011', 'selected',  false),
  ('70718000-0000-4000-8000-000000000272', '70718000-0000-4000-8000-000000000001', 'Wingback armchair, linen', 'approved', 1, 92000, 61000, 92000, NULL, '70718000-0000-4000-8000-000000000011', 'alternate', false),
  ('70718000-0000-4000-8000-000000000273', '70718000-0000-4000-8000-000000000001', 'Brass sconce',             'approved', 1, 30000, 20000, 30000, NULL, '70718000-0000-4000-8000-000000000011', 'selected',  false),
  ('70718000-0000-4000-8000-000000000274', '70718000-0000-4000-8000-000000000001', 'Bronze sconce',            'approved', 1, 31000, 21000, 31000, NULL, '70718000-0000-4000-8000-000000000011', 'alternate', false);

INSERT INTO project_ffe_specs (ffe_item_id)
SELECT id FROM (VALUES ('70718000-0000-4000-8000-000000000241'::uuid), ('70718000-0000-4000-8000-000000000242'::uuid)) AS v(id)
WHERE NOT EXISTS (SELECT 1 FROM project_ffe_specs WHERE ffe_item_id = v.id);
UPDATE project_ffe_specs SET sku = 'DSK-1' WHERE ffe_item_id = '70718000-0000-4000-8000-000000000241';
UPDATE project_ffe_specs SET sku = 'LMP-1' WHERE ffe_item_id = '70718000-0000-4000-8000-000000000242';

-- The desk sits on an executed authorization.
INSERT INTO proposals (id, project_id, designer_id, title, status, document_kind, commercial_state, total_amount, subtotal)
VALUES ('70718000-0000-4000-8000-000000000401', '70718000-0000-4000-8000-000000000001', '70718000-0000-4000-8000-0000000000a1',
        'SQ447 Authorization No. 1', 'accepted', 'furnishings_authorization', 'executed', 50000, 50000);
INSERT INTO project_commercial_documents (id, project_id, proposal_id, document_kind, wave_name, is_origin, bound_at, executed_at, created_by)
VALUES ('70718000-0000-4000-8000-000000000402', '70718000-0000-4000-8000-000000000001', '70718000-0000-4000-8000-000000000401',
        'furnishings_authorization', 'Authorization No. 1', false, now(), now(), '70718000-0000-4000-8000-0000000000a1');
INSERT INTO furnishing_authorization_items (id, commercial_document_id, source_ffe_item_id, name, quantity, client_unit_price_cents, client_line_total_cents)
VALUES ('70718000-0000-4000-8000-000000000403', '70718000-0000-4000-8000-000000000402', '70718000-0000-4000-8000-000000000241',
        'SQ447 desk', 1, 50000, 50000);

-- PO 103's scheduled deposit row (a non-vendor payee is refused on it).
INSERT INTO po_payments (id, purchase_order_id, kind, amount_cents, state, paid_date)
VALUES ('70718000-0000-4000-8000-000000000031', '70718000-0000-4000-8000-000000000103', 'deposit', 15000, 'pending', NULL);

-- PO 104's freight: 30.00 entered first, 20.00 after; both unbilled.
INSERT INTO po_cost_lines (id, organization_id, purchase_order_id, kind, estimate_cents, payee_vendor_id, created_at)
VALUES
  ('70718000-0000-4000-8000-000000000071', '70718000-0000-4000-8000-0000000000f1', '70718000-0000-4000-8000-000000000104', 'freight', 3000,
   '70718000-0000-4000-8000-000000000011', now() - interval '2 days'),
  ('70718000-0000-4000-8000-000000000072', '70718000-0000-4000-8000-0000000000f1', '70718000-0000-4000-8000-000000000104', 'freight', 2000,
   '70718000-0000-4000-8000-000000000011', now() - interval '1 day');

-- PO 109 already has a shipment row.
INSERT INTO po_shipments (id, purchase_order_id, shipped_on)
VALUES ('70718000-0000-4000-8000-000000000061', '70718000-0000-4000-8000-000000000109', CURRENT_DATE);

-- PO 110's inspection.
INSERT INTO receiving_inspections (id, purchase_order_id, inspected_by, outcome, notes)
VALUES ('70718000-0000-4000-8000-000000000091', '70718000-0000-4000-8000-000000000110', '70718000-0000-4000-8000-0000000000a2', 'damaged', 'Scuffed corner');

-- Open exceptions on the two selected lines (C1).
INSERT INTO procurement_exceptions (id, organization_id, project_id, type, ffe_item_id, status, opened_by)
VALUES
  ('70718000-0000-4000-8000-000000000081', '70718000-0000-4000-8000-0000000000f1', '70718000-0000-4000-8000-000000000001', 'price_change',
   '70718000-0000-4000-8000-000000000271', 'open', '70718000-0000-4000-8000-0000000000a2'),
  ('70718000-0000-4000-8000-000000000082', '70718000-0000-4000-8000-0000000000f1', '70718000-0000-4000-8000-000000000001', 'backorder',
   '70718000-0000-4000-8000-000000000273', 'open', '70718000-0000-4000-8000-0000000000a2');

-- A draft invoice (M4).
INSERT INTO invoices (id, project_id, designer_id, status, tax_rate)
VALUES ('70718000-0000-4000-8000-000000000301', '70718000-0000-4000-8000-000000000001', '70718000-0000-4000-8000-0000000000a1', 'draft', 0);

-- Quote requests with no project: 601 made by Y (Studio C), 602 by M.
INSERT INTO vendor_quote_requests (id, vendor_id, designer_id, project_id, ffe_item_ids, status, sent_at)
VALUES
  ('70718000-0000-4000-8000-000000000601', '70718000-0000-4000-8000-000000000011', '70718000-0000-4000-8000-0000000000a7',
   NULL, '{}'::uuid[], 'sent', NOW()),
  ('70718000-0000-4000-8000-000000000602', '70718000-0000-4000-8000-000000000011', '70718000-0000-4000-8000-0000000000a2',
   NULL, '{}'::uuid[], 'sent', NOW());

-- Two drafts awaiting review (D1).
INSERT INTO procurement_drafts (id, organization_id, project_id, kind, purchase_order_id, to_email, subject, body)
VALUES
  ('70718000-0000-4000-8000-000000000701', '70718000-0000-4000-8000-0000000000f1', '70718000-0000-4000-8000-000000000001', 'ack_chase',
   '70718000-0000-4000-8000-000000000102', 'orders@sq447-workroom.test.invalid', 'PO 102: please confirm', 'Hello,\n\nPlease confirm.'),
  ('70718000-0000-4000-8000-000000000702', '70718000-0000-4000-8000-0000000000f1', '70718000-0000-4000-8000-000000000001', 'ack_chase',
   '70718000-0000-4000-8000-000000000103', 'orders@sq447-workroom.test.invalid', 'PO 103: please confirm', 'Hello,\n\nPlease confirm.');

-- Drafts claimed by M for sending (G5). Inserted, so updated_at is as given:
--   703 stale, nothing logged          (release)
--   704 stale, a send logged           (release refused, complete)
--   705 stale, nothing logged          (complete refused)
--   706 stale, a send logged           (sweep → sent)
--   707 stale, only a failed send      (sweep → awaiting_review)
--   708 fresh                          (release refused)
INSERT INTO procurement_drafts (id, organization_id, project_id, kind, purchase_order_id, to_email, subject, body, status, sent_by, updated_at)
SELECT ('70718000-0000-4000-8000-000000000' || n)::uuid, '70718000-0000-4000-8000-0000000000f1', '70718000-0000-4000-8000-000000000001',
       'ack_chase', '70718000-0000-4000-8000-000000000102', 'orders@sq447-workroom.test.invalid', 'PO 102: please confirm',
       'Hello,\n\nPlease confirm.', 'sending', '70718000-0000-4000-8000-0000000000a2',
       CASE WHEN n = '708' THEN now() ELSE now() - interval '20 minutes' END
  FROM unnest(ARRAY['703', '704', '705', '706', '707', '708']) AS n;

INSERT INTO notification_log (user_id, type, channel, status, ref_type, ref_id, provider_id, recipient, created_at)
VALUES
  (NULL, 'procurement_draft', 'email', 'sent',   'procurement_draft', '70718000-0000-4000-8000-000000000704', 're_sq451_704',
   'orders@sq447-workroom.test.invalid', now() - interval '19 minutes'),
  (NULL, 'procurement_draft', 'email', 'sent',   'procurement_draft', '70718000-0000-4000-8000-000000000706', 're_sq451_706',
   'orders@sq447-workroom.test.invalid', now() - interval '18 minutes'),
  (NULL, 'procurement_draft', 'email', 'failed', 'procurement_draft', '70718000-0000-4000-8000-000000000707', NULL,
   'orders@sq447-workroom.test.invalid', now() - interval '18 minutes');

-- A shipment on PO 102, which ships to the job site (G7).
INSERT INTO po_shipments (id, purchase_order_id, shipped_on)
VALUES ('70718000-0000-4000-8000-000000000062', '70718000-0000-4000-8000-000000000102', CURRENT_DATE);

-- Runs p_sql and returns the SQLSTATE + message it raised, or NULL.
CREATE OR REPLACE FUNCTION pg_temp.raised(p_sql text)
RETURNS text AS $$
BEGIN
  EXECUTE p_sql;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN SQLSTATE || ' ' || SQLERRM;
END;
$$ LANGUAGE plpgsql;

-- Acts as p_user for the rest of the transaction (auth.uid()).
CREATE OR REPLACE FUNCTION pg_temp.act(p_user uuid)
RETURNS void AS $$
  SELECT set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$ LANGUAGE sql;

GRANT EXECUTE ON FUNCTION pg_temp.raised(text) TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.act(uuid) TO authenticated;

SET LOCAL ROLE authenticated;

-- ─── R1. The release gate holds an acknowledgment ──────────────────────────

DO $$
DECLARE
  v_err text;
  v_ack public.po_acknowledgments%ROWTYPE;
  v_po  public.purchase_orders%ROWTYPE;
BEGIN
  PERFORM pg_temp.act('70718000-0000-4000-8000-0000000000a2');
  v_err := pg_temp.raised($q$SELECT public.log_po_acknowledgment_v2('70718000-0000-4000-8000-000000000101')$q$);
  ASSERT v_err LIKE '23514 held_for_release: purchase order % waits for an owner or admin to release it',
    'FAIL R1: v2 must not confirm a held-back draft, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$SELECT public.log_po_acknowledgment('70718000-0000-4000-8000-000000000101')$q$);
  ASSERT v_err LIKE '23514 held_for_release:%', 'FAIL R1: v1 must not confirm a held-back draft, got ' || COALESCE(v_err, 'no error');
  SELECT * INTO v_po FROM public.purchase_orders WHERE id = '70718000-0000-4000-8000-000000000101';
  ASSERT v_po.status = 'draft' AND v_po.acknowledged_at IS NULL, 'FAIL R1: the draft is untouched, got ' || v_po.status;

  -- Released by the owner, the acknowledgment confirms it.
  PERFORM pg_temp.act('70718000-0000-4000-8000-0000000000a1');
  PERFORM public.release_purchase_order('70718000-0000-4000-8000-000000000101');
  PERFORM pg_temp.act('70718000-0000-4000-8000-0000000000a2');
  v_ack := public.log_po_acknowledgment_v2('70718000-0000-4000-8000-000000000101');
  SELECT * INTO v_po FROM public.purchase_orders WHERE id = '70718000-0000-4000-8000-000000000101';
  ASSERT v_ack.id IS NOT NULL AND v_po.status = 'confirmed', 'FAIL R1: released, the ack confirms, got ' || v_po.status;
  RAISE NOTICE 'R1 passed: an acknowledgment waits for the release';
END;
$$;

-- ─── M1. A void never leaves net paid below zero ───────────────────────────

DO $$
DECLARE
  v_err    text;
  v_pay    public.vendor_payments%ROWTYPE;
  v_refund public.vendor_payments%ROWTYPE;
BEGIN
  PERFORM pg_temp.act('70718000-0000-4000-8000-0000000000a2');
  v_pay := public.record_vendor_payment('70718000-0000-4000-8000-000000000102', '{"amountCents": 10000}');
  ASSERT v_pay.payee = 'vendor', 'FAIL M1: a payment defaults to the vendor, got ' || v_pay.payee;
  v_refund := public.record_vendor_refund('70718000-0000-4000-8000-000000000102', '{"kind": "refund", "amountCents": 6000}');
  v_err := pg_temp.raised(format('SELECT public.void_vendor_payment(%L, %L)', v_pay.id, 'entered twice'));
  ASSERT v_err LIKE '23514 %net paid%', 'FAIL M1: void would leave -6000 net paid, got ' || COALESCE(v_err, 'no error');
  PERFORM public.void_vendor_payment(v_refund.id, 'refund reversed');
  v_pay := public.void_vendor_payment(v_pay.id, 'entered twice');
  ASSERT v_pay.voided_at IS NOT NULL, 'FAIL M1: with the refund voided, the payment voids';
  RAISE NOTICE 'M1 passed: voids keep net paid at or above zero';
END;
$$;

-- ─── M2. Who the money went to ─────────────────────────────────────────────

DO $$
DECLARE
  v_err  text;
  v_pay  public.vendor_payments%ROWTYPE;
  v_ack  public.po_acknowledgments%ROWTYPE;
  v_line uuid;
  v_item public.project_ffe_items%ROWTYPE;
BEGIN
  PERFORM pg_temp.act('70718000-0000-4000-8000-0000000000a2');
  v_pay := public.record_vendor_payment('70718000-0000-4000-8000-000000000103',
    '{"amountCents": 20000, "payee": "carrier", "reference": "Freight · Dock Co"}');
  ASSERT v_pay.payee = 'carrier' AND v_pay.po_payment_id IS NULL, 'FAIL M2a: a carrier payment, got ' || v_pay.payee;
  v_err := pg_temp.raised($q$SELECT public.record_vendor_payment('70718000-0000-4000-8000-000000000103', '{"amountCents": 100, "payee": "landlord"}')$q$);
  ASSERT v_err LIKE '23514 %payee%', 'FAIL M2a: an unknown payee, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$SELECT public.record_vendor_payment('70718000-0000-4000-8000-000000000103',
    '{"poPaymentId": "70718000-0000-4000-8000-000000000031", "payee": "receiver"}')$q$);
  ASSERT v_err LIKE '23514 %scheduled payment row is paid to the vendor%', 'FAIL M2a: a scheduled row is the vendor''s, got ' || COALESCE(v_err, 'no error');

  -- The refund cap counts the vendor's money only.
  v_err := pg_temp.raised($q$SELECT public.record_vendor_refund('70718000-0000-4000-8000-000000000103', '{"kind": "refund", "amountCents": 1000}')$q$);
  ASSERT v_err LIKE '23514 %more than the 0 cents net paid%', 'FAIL M2b: a carrier payment is not refundable by the vendor, got ' || COALESCE(v_err, 'no error');

  -- A carrier payment does not block the vendor's price change.
  v_ack := public.log_po_acknowledgment_v2('70718000-0000-4000-8000-000000000103', '{}',
    '[{"ffeItemId": "70718000-0000-4000-8000-000000000231", "field": "unit_price", "ackValue": 32000}]');
  SELECT id INTO v_line FROM public.po_ack_lines WHERE ack_id = v_ack.id AND field = 'unit_price' AND verdict = 'mismatch';
  PERFORM public.resolve_ack_line(v_line, 'accepted');
  SELECT * INTO v_item FROM public.project_ffe_items WHERE id = '70718000-0000-4000-8000-000000000231';
  ASSERT v_item.trade_price_cents = 32000, 'FAIL M2c: the price change is accepted, got ' || v_item.trade_price_cents;

  -- G4 (00720): a carrier payment leaves the schedule editable.
  PERFORM public.update_po_payment_schedule('70718000-0000-4000-8000-000000000103',
    '{"payments": [{"id": "70718000-0000-4000-8000-000000000031", "amountCents": 16000}]}');
  ASSERT (SELECT amount_cents FROM public.po_payments WHERE id = '70718000-0000-4000-8000-000000000031') = 16000,
    'FAIL G4: a carrier payment does not lock the schedule';
  RAISE NOTICE 'M2 passed: payee recorded; refund cap, price block and schedule lock count the vendor only';
END;
$$;

-- ─── M5. The ack's freight is the PO's freight total ───────────────────────

DO $$
DECLARE
  v_ack  public.po_acknowledgments%ROWTYPE;
  v_line uuid;
  v_sum  bigint;
  v_old  integer;
  v_new  integer;
BEGIN
  PERFORM pg_temp.act('70718000-0000-4000-8000-0000000000a2');
  v_ack := public.log_po_acknowledgment_v2('70718000-0000-4000-8000-000000000104', '{"freightCents": 10000}');
  SELECT id INTO v_line FROM public.po_ack_lines WHERE ack_id = v_ack.id AND field = 'freight' AND verdict = 'mismatch';
  ASSERT v_line IS NOT NULL, 'FAIL M5: 100.00 against 50.00 of freight is a mismatch';
  PERFORM public.resolve_ack_line(v_line, 'accepted');
  SELECT sum(estimate_cents) INTO v_sum FROM public.po_cost_lines
   WHERE purchase_order_id = '70718000-0000-4000-8000-000000000104' AND kind = 'freight';
  SELECT estimate_cents INTO v_old FROM public.po_cost_lines WHERE id = '70718000-0000-4000-8000-000000000071';
  SELECT estimate_cents INTO v_new FROM public.po_cost_lines WHERE id = '70718000-0000-4000-8000-000000000072';
  ASSERT v_sum = 10000 AND v_old = 3000 AND v_new = 7000,
    'FAIL M5: freight total 10000 (3000 + 7000), got ' || v_sum || ' (' || v_old || ' + ' || v_new || ')';

  -- Less than the other lines: the latest is floored at zero.
  v_ack := public.log_po_acknowledgment_v2('70718000-0000-4000-8000-000000000104', '{"freightCents": 1000}');
  SELECT id INTO v_line FROM public.po_ack_lines WHERE ack_id = v_ack.id AND field = 'freight' AND verdict = 'mismatch';
  PERFORM public.resolve_ack_line(v_line, 'accepted');
  SELECT estimate_cents INTO v_new FROM public.po_cost_lines WHERE id = '70718000-0000-4000-8000-000000000072';
  ASSERT v_new = 0, 'FAIL M5: floored at 0, got ' || v_new;
  RAISE NOTICE 'M5 passed: accepted freight lands as the PO total';
END;
$$;

-- ─── R8-1. A signed spec change is a change order ──────────────────────────

DO $$
DECLARE
  v_err  text;
  v_ack  public.po_acknowledgments%ROWTYPE;
  v_desk uuid;
  v_lamp uuid;
  v_sku  text;
BEGIN
  PERFORM pg_temp.act('70718000-0000-4000-8000-0000000000a2');
  v_ack := public.log_po_acknowledgment_v2('70718000-0000-4000-8000-000000000105', '{}',
    '[{"ffeItemId": "70718000-0000-4000-8000-000000000241", "field": "sku", "ackValue": "DSK-2"},
      {"ffeItemId": "70718000-0000-4000-8000-000000000242", "field": "sku", "ackValue": "LMP-2"}]');
  SELECT id INTO v_desk FROM public.po_ack_lines WHERE ack_id = v_ack.id AND ffe_item_id = '70718000-0000-4000-8000-000000000241';
  SELECT id INTO v_lamp FROM public.po_ack_lines WHERE ack_id = v_ack.id AND ffe_item_id = '70718000-0000-4000-8000-000000000242';
  v_err := pg_temp.raised(format('SELECT public.resolve_ack_line(%L, %L)', v_desk, 'accepted'));
  ASSERT v_err LIKE '23514 change_order_required:%executed%', 'FAIL R8-1: the executed desk''s sku, got ' || COALESCE(v_err, 'no error');
  SELECT sku INTO v_sku FROM public.project_ffe_specs WHERE ffe_item_id = '70718000-0000-4000-8000-000000000241';
  ASSERT v_sku = 'DSK-1', 'FAIL R8-1: the signed sku stands, got ' || COALESCE(v_sku, 'NULL');
  PERFORM public.resolve_ack_line(v_lamp, 'accepted');
  SELECT sku INTO v_sku FROM public.project_ffe_specs WHERE ffe_item_id = '70718000-0000-4000-8000-000000000242';
  ASSERT v_sku = 'LMP-2', 'FAIL R8-1: a line on no authorization takes the sku, got ' || COALESCE(v_sku, 'NULL');
  RAISE NOTICE 'R8-1 passed: a signed spec change is a change order';
END;
$$;

-- ─── M4. Deposit and balance stay within the price ─────────────────────────

DO $$
DECLARE
  v_err  text;
  v_line public.invoice_line_items%ROWTYPE;
BEGIN
  PERFORM pg_temp.act('70718000-0000-4000-8000-0000000000a2');
  v_err := pg_temp.raised($q$SELECT public.add_invoice_billing_lines('70718000-0000-4000-8000-000000000301',
    '[{"ffeItemId": "70718000-0000-4000-8000-000000000262", "stage": "deposit", "depositPct": 50, "amountCents": 25000}]')$q$);
  ASSERT v_err LIKE '23514 %deposit of 25000 cents is more than the 20000 cents%',
    'FAIL M4: a deposit over the price, got ' || COALESCE(v_err, 'no error');

  SELECT * INTO v_line FROM public.add_invoice_billing_lines('70718000-0000-4000-8000-000000000301',
    '[{"ffeItemId": "70718000-0000-4000-8000-000000000261", "stage": "deposit", "depositPct": 50}]');
  ASSERT v_line.amount_cents = 50000, 'FAIL M4: a 50 % deposit, got ' || v_line.amount_cents;
  v_err := pg_temp.raised($q$SELECT public.add_invoice_billing_lines('70718000-0000-4000-8000-000000000301',
    '[{"ffeItemId": "70718000-0000-4000-8000-000000000261", "stage": "balance", "amountCents": 60000}]')$q$);
  ASSERT v_err LIKE '23514 %balance of 60000 cents is more than the 50000 cents%',
    'FAIL M4: a balance over the remainder, got ' || COALESCE(v_err, 'no error');
  SELECT * INTO v_line FROM public.add_invoice_billing_lines('70718000-0000-4000-8000-000000000301',
    '[{"ffeItemId": "70718000-0000-4000-8000-000000000261", "stage": "balance"}]');
  ASSERT v_line.amount_cents = 50000, 'FAIL M4: the balance is the remainder, got ' || v_line.amount_cents;
  RAISE NOTICE 'M4 passed: deposit plus balance never exceed the price';
END;
$$;

-- ─── S1. Reads follow the project's studio ─────────────────────────────────

DO $$
DECLARE
  v_n   bigint;
  v_err text;
BEGIN
  -- Y shares Studio C with the PO owner, not Studio A.
  PERFORM pg_temp.act('70718000-0000-4000-8000-0000000000a7');
  SELECT count(*) INTO v_n FROM public.purchase_orders WHERE id = '70718000-0000-4000-8000-000000000110';
  ASSERT v_n = 0, 'FAIL S1: another studio''s co-member reads the PO, got ' || v_n;
  SELECT count(*) INTO v_n FROM public.receiving_inspections WHERE purchase_order_id = '70718000-0000-4000-8000-000000000110';
  ASSERT v_n = 0, 'FAIL S1: another studio''s co-member reads the inspection, got ' || v_n;
  v_err := pg_temp.raised($q$INSERT INTO public.receiving_inspections (purchase_order_id, inspected_by, outcome, notes)
    VALUES ('70718000-0000-4000-8000-000000000110', '70718000-0000-4000-8000-0000000000a7', 'damaged', 'not mine')$q$);
  ASSERT v_err LIKE '42501 %', 'FAIL S1: another studio''s co-member writes an inspection, got ' || COALESCE(v_err, 'no error');

  -- The project's studio still reads both.
  PERFORM pg_temp.act('70718000-0000-4000-8000-0000000000a2');
  SELECT count(*) INTO v_n FROM public.purchase_orders WHERE id = '70718000-0000-4000-8000-000000000110';
  ASSERT v_n = 1, 'FAIL S1: the member reads the PO, got ' || v_n;
  SELECT count(*) INTO v_n FROM public.receiving_inspections WHERE purchase_order_id = '70718000-0000-4000-8000-000000000110';
  ASSERT v_n = 1, 'FAIL S1: the member reads the inspection, got ' || v_n;
  RAISE NOTICE 'S1 passed: PO and inspection reads follow can_send_purchase_order';
END;
$$;

-- ─── S2. A request links only within its studio ────────────────────────────

DO $$
DECLARE
  v_err   text;
  v_quote public.vendor_quotes%ROWTYPE;
BEGIN
  PERFORM pg_temp.act('70718000-0000-4000-8000-0000000000a2');
  v_err := pg_temp.raised($q$SELECT public.record_vendor_quote('{"requestId": "70718000-0000-4000-8000-000000000601",
    "projectId": "70718000-0000-4000-8000-000000000001"}')$q$);
  ASSERT v_err LIKE '42501 %quote request%', 'FAIL S2: Studio C''s request into Project A, got ' || COALESCE(v_err, 'no error');
  v_quote := public.record_vendor_quote('{"requestId": "70718000-0000-4000-8000-000000000602",
    "projectId": "70718000-0000-4000-8000-000000000001"}');
  ASSERT v_quote.request_id = '70718000-0000-4000-8000-000000000602' AND v_quote.project_id = '70718000-0000-4000-8000-000000000001',
    'FAIL S2: the member''s own request links';
  RAISE NOTICE 'S2 passed: quote requests stay in their studio';
END;
$$;

-- ─── S3. Held and cancelled orders take no revision ────────────────────────

DO $$
DECLARE
  v_err text;
  v_rev integer;
BEGIN
  PERFORM pg_temp.act('70718000-0000-4000-8000-0000000000a2');
  v_err := pg_temp.raised($q$SELECT public.snapshot_purchase_order_spec('70718000-0000-4000-8000-000000000106')$q$);
  ASSERT v_err LIKE '23514 %held_for_release%', 'FAIL S3: a held PO, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$SELECT public.snapshot_purchase_order_spec('70718000-0000-4000-8000-000000000107')$q$);
  ASSERT v_err LIKE '23514 %cancelled%', 'FAIL S3: a cancelled PO, got ' || COALESCE(v_err, 'no error');
  v_rev := public.snapshot_purchase_order_spec('70718000-0000-4000-8000-000000000105');
  ASSERT v_rev >= 1, 'FAIL S3: a confirmed PO snapshots, got ' || v_rev;
  RAISE NOTICE 'S3 passed: no spec revision for a held or cancelled PO';
END;
$$;

-- ─── S4. Shipped without a shipment row still tells the receiver ───────────

DO $$
DECLARE
  v_n     bigint;
  v_draft public.procurement_drafts%ROWTYPE;
BEGIN
  PERFORM pg_temp.act('70718000-0000-4000-8000-0000000000a2');
  PERFORM public.advance_purchase_order_status('70718000-0000-4000-8000-000000000108', 'shipped');
  SELECT count(*) INTO v_n FROM public.procurement_drafts
   WHERE purchase_order_id = '70718000-0000-4000-8000-000000000108' AND kind = 'receiver_inbound_notice';
  ASSERT v_n = 1, 'FAIL S4: one inbound notice, got ' || v_n;
  SELECT * INTO v_draft FROM public.procurement_drafts
   WHERE purchase_order_id = '70718000-0000-4000-8000-000000000108' AND kind = 'receiver_inbound_notice';
  ASSERT v_draft.status = 'awaiting_review' AND v_draft.sent_at IS NULL AND v_draft.shipment_id IS NULL
     AND v_draft.to_email = 'dock@sq447-receiver.test.invalid'
     AND v_draft.body LIKE 'Hello Rae Dock,%' AND v_draft.body LIKE '%2 × SQ447 crate%',
    'FAIL S4: the notice awaits review, addressed to the receiver, got ' || COALESCE(v_draft.body, 'NULL');

  -- A second tap is a no-op; a PO with a shipment row composes nothing here.
  PERFORM public.advance_purchase_order_status('70718000-0000-4000-8000-000000000108', 'shipped');
  PERFORM public.advance_purchase_order_status('70718000-0000-4000-8000-000000000109', 'shipped');
  SELECT count(*) INTO v_n FROM public.procurement_drafts
   WHERE purchase_order_id IN ('70718000-0000-4000-8000-000000000108', '70718000-0000-4000-8000-000000000109')
     AND kind = 'receiver_inbound_notice';
  ASSERT v_n = 1, 'FAIL S4: no second notice, got ' || v_n;
  RAISE NOTICE 'S4 passed: shipped composes the receiver notice once';
END;
$$;

-- ─── C1. The substitution copy follows the exception ───────────────────────

DO $$
DECLARE
  v_dec public.client_decisions%ROWTYPE;
BEGIN
  PERFORM pg_temp.act('70718000-0000-4000-8000-0000000000a2');
  v_dec := public.request_substitution_approval('70718000-0000-4000-8000-000000000271',
    ARRAY['70718000-0000-4000-8000-000000000272']::uuid[]);
  ASSERT v_dec.context = 'The price of Wingback armchair has changed. Please choose one of the options below.',
    'FAIL C1: price-change copy, got ' || COALESCE(v_dec.context, 'NULL');
  v_dec := public.request_substitution_approval('70718000-0000-4000-8000-000000000273',
    ARRAY['70718000-0000-4000-8000-000000000274']::uuid[]);
  ASSERT v_dec.context = 'Brass sconce is on backorder with the maker. Please choose one of the options below.',
    'FAIL C1: backorder copy, got ' || COALESCE(v_dec.context, 'NULL');
  ASSERT v_dec.context !~ '[0-9]', 'FAIL C1: no dates in the copy';
  RAISE NOTICE 'C1 passed: substitution copy names the reason';
END;
$$;

-- ─── D1. A draft is claimed before it is sent ──────────────────────────────

DO $$
DECLARE
  v_err   text;
  v_draft public.procurement_drafts%ROWTYPE;
BEGIN
  PERFORM pg_temp.act('70718000-0000-4000-8000-0000000000a4');
  v_err := pg_temp.raised($q$SELECT public.claim_procurement_draft_for_send('70718000-0000-4000-8000-000000000701')$q$);
  ASSERT v_err LIKE '42501 %', 'FAIL D1: an outsider cannot claim, got ' || COALESCE(v_err, 'no error');

  PERFORM pg_temp.act('70718000-0000-4000-8000-0000000000a2');
  v_draft := public.claim_procurement_draft_for_send('70718000-0000-4000-8000-000000000701');
  ASSERT v_draft.status = 'sending' AND v_draft.sent_by = '70718000-0000-4000-8000-0000000000a2' AND v_draft.sent_at IS NULL,
    'FAIL D1: claimed by M, got ' || v_draft.status;
  v_err := pg_temp.raised($q$SELECT public.update_procurement_draft('70718000-0000-4000-8000-000000000701', '{"subject": "late"}')$q$);
  ASSERT v_err LIKE '23514 %', 'FAIL D1: a claimed draft is not edited, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$SELECT public.discard_procurement_draft('70718000-0000-4000-8000-000000000701')$q$);
  ASSERT v_err LIKE '23514 %', 'FAIL D1: a claimed draft is not discarded, got ' || COALESCE(v_err, 'no error');

  PERFORM pg_temp.act('70718000-0000-4000-8000-0000000000a1');
  v_err := pg_temp.raised($q$SELECT public.claim_procurement_draft_for_send('70718000-0000-4000-8000-000000000701')$q$);
  ASSERT v_err LIKE '23514 draft_not_awaiting_review: draft % is sending',
    'FAIL D1: one claim at a time, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$SELECT public.release_procurement_draft_claim('70718000-0000-4000-8000-000000000701')$q$);
  ASSERT v_err LIKE '42501 %', 'FAIL D1: only the claimer releases, got ' || COALESCE(v_err, 'no error');

  PERFORM pg_temp.act('70718000-0000-4000-8000-0000000000a2');
  v_draft := public.release_procurement_draft_claim('70718000-0000-4000-8000-000000000701');
  ASSERT v_draft.status = 'awaiting_review' AND v_draft.sent_by IS NULL, 'FAIL D1: released, got ' || v_draft.status;
  v_draft := public.claim_procurement_draft_for_send('70718000-0000-4000-8000-000000000701');
  ASSERT v_draft.status = 'sending', 'FAIL D1: claimed again';
  v_draft := public.claim_procurement_draft_for_send('70718000-0000-4000-8000-000000000702');
  ASSERT v_draft.status = 'sending', 'FAIL D1: the second draft claimed';
  RAISE NOTICE 'D1 passed (authenticated part): claim, refuse, release';
END;
$$;

-- ─── G5. A stalled send is freed or completed ──────────────────────────────

DO $$
DECLARE
  v_err   text;
  v_draft public.procurement_drafts%ROWTYPE;
BEGIN
  -- A stranger is refused, stale or fresh.
  PERFORM pg_temp.act('70718000-0000-4000-8000-0000000000a4');
  v_err := pg_temp.raised($q$SELECT public.release_procurement_draft_claim('70718000-0000-4000-8000-000000000703')$q$);
  ASSERT v_err LIKE '42501 %', 'FAIL G5: a stranger cannot release a stale claim, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$SELECT public.release_procurement_draft_claim('70718000-0000-4000-8000-000000000708')$q$);
  ASSERT v_err LIKE '42501 %', 'FAIL G5: a stranger cannot release a fresh claim, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$SELECT public.complete_procurement_draft_send('70718000-0000-4000-8000-000000000704')$q$);
  ASSERT v_err LIKE '42501 %', 'FAIL G5: a stranger cannot complete, got ' || COALESCE(v_err, 'no error');

  -- Another studio member (O) frees a stale claim, never a fresh one.
  PERFORM pg_temp.act('70718000-0000-4000-8000-0000000000a1');
  v_err := pg_temp.raised($q$SELECT public.release_procurement_draft_claim('70718000-0000-4000-8000-000000000708')$q$);
  ASSERT v_err LIKE '42501 %', 'FAIL G5: a fresh claim is the claimer''s, got ' || COALESCE(v_err, 'no error');
  v_draft := public.release_procurement_draft_claim('70718000-0000-4000-8000-000000000703');
  ASSERT v_draft.status = 'awaiting_review' AND v_draft.sent_by IS NULL, 'FAIL G5: a stale claim is freed, got ' || v_draft.status;

  -- With a send on record, release refuses and complete marks it sent.
  v_err := pg_temp.raised($q$SELECT public.release_procurement_draft_claim('70718000-0000-4000-8000-000000000704')$q$);
  ASSERT v_err LIKE '23514 draft_send_on_record:%', 'FAIL G5: a sent email is not put back, got ' || COALESCE(v_err, 'no error');
  v_draft := public.complete_procurement_draft_send('70718000-0000-4000-8000-000000000704');
  ASSERT v_draft.status = 'sent' AND v_draft.sent_by = '70718000-0000-4000-8000-0000000000a2'
     AND v_draft.sent_at = now() - interval '19 minutes' AND v_draft.message_id = 're_sq451_704',
    'FAIL G5: completed as sent by the claimer at the log time, got ' || v_draft.status;

  -- Without one, complete refuses; a fresh claim is not a stalled send.
  v_err := pg_temp.raised($q$SELECT public.complete_procurement_draft_send('70718000-0000-4000-8000-000000000705')$q$);
  ASSERT v_err LIKE '23514 draft_send_not_on_record:%', 'FAIL G5: no send on record, got ' || COALESCE(v_err, 'no error');
  ASSERT (SELECT status FROM public.procurement_drafts WHERE id = '70718000-0000-4000-8000-000000000705') = 'sending',
    'FAIL G5: a refused complete changes nothing';
  PERFORM pg_temp.act('70718000-0000-4000-8000-0000000000a2');
  v_err := pg_temp.raised($q$SELECT public.complete_procurement_draft_send('70718000-0000-4000-8000-000000000708')$q$);
  ASSERT v_err LIKE '23514 %not a stalled send%', 'FAIL G5: a fresh claim is not completed, got ' || COALESCE(v_err, 'no error');
  RAISE NOTICE 'G5 passed (authenticated part): stale claims freed or completed by the studio';
END;
$$;

-- ─── G7. A job-site shipment composes no receiver notice ───────────────────

DO $$
DECLARE
  v_err   text;
  v_draft public.procurement_drafts%ROWTYPE;
BEGIN
  PERFORM pg_temp.act('70718000-0000-4000-8000-0000000000a4');
  v_err := pg_temp.raised($q$SELECT public.compose_receiver_inbound_draft('70718000-0000-4000-8000-000000000062')$q$);
  ASSERT v_err LIKE '42501 %', 'FAIL G7: the gate still raises, got ' || COALESCE(v_err, 'no error');

  PERFORM pg_temp.act('70718000-0000-4000-8000-0000000000a2');
  v_draft := public.compose_receiver_inbound_draft('70718000-0000-4000-8000-000000000062');
  ASSERT v_draft.id IS NULL, 'FAIL G7: no receiver composes to null';
  ASSERT NOT EXISTS (SELECT 1 FROM public.procurement_drafts
                      WHERE purchase_order_id = '70718000-0000-4000-8000-000000000102' AND kind = 'receiver_inbound_notice'),
    'FAIL G7: no notice drafted';
  RAISE NOTICE 'G7 passed: a job-site shipment composes no receiver notice';
END;
$$;

RESET ROLE;

DO $$
DECLARE
  v_err    text;
  v_draft  public.procurement_drafts%ROWTYPE;
  v_detail jsonb;
BEGIN
  -- The service path marks only the claimer's claimed draft.
  v_err := pg_temp.raised($q$SELECT public.mark_procurement_draft_sent('70718000-0000-4000-8000-000000000701', '70718000-0000-4000-8000-0000000000a1')$q$);
  ASSERT v_err LIKE '42501 %cannot send%', 'FAIL D1: O did not claim it, got ' || COALESCE(v_err, 'no error');
  v_draft := public.mark_procurement_draft_sent('70718000-0000-4000-8000-000000000701', '70718000-0000-4000-8000-0000000000a2', 'msg-sq447-1');
  ASSERT v_draft.status = 'sent' AND v_draft.sent_by = '70718000-0000-4000-8000-0000000000a2' AND v_draft.sent_at IS NOT NULL
     AND v_draft.message_id = 'msg-sq447-1', 'FAIL D1: marked sent';
  v_err := pg_temp.raised($q$SELECT public.mark_procurement_draft_sent('70718000-0000-4000-8000-000000000701', '70718000-0000-4000-8000-0000000000a2')$q$);
  ASSERT v_err LIKE '23514 %already sent%', 'FAIL D1: sent once, got ' || COALESCE(v_err, 'no error');
  PERFORM pg_temp.act('70718000-0000-4000-8000-0000000000a2');
  v_err := pg_temp.raised($q$SELECT public.claim_procurement_draft_for_send('70718000-0000-4000-8000-000000000701')$q$);
  ASSERT v_err LIKE '23514 draft_not_awaiting_review: draft % is sent', 'FAIL D1: a sent draft is not claimed, got ' || COALESCE(v_err, 'no error');

  -- The service path (no caller) may put a claim back.
  PERFORM set_config('request.jwt.claims', '{}', true);
  v_draft := public.release_procurement_draft_claim('70718000-0000-4000-8000-000000000702');
  ASSERT v_draft.status = 'awaiting_review' AND v_draft.sent_by IS NULL, 'FAIL D1: the service path releases';
  -- And an unclaimed draft is never marked.
  v_err := pg_temp.raised($q$SELECT public.mark_procurement_draft_sent('70718000-0000-4000-8000-000000000702', '70718000-0000-4000-8000-0000000000a2')$q$);
  ASSERT v_err LIKE '23514 %claim it for sending first%', 'FAIL D1: mark before claim, got ' || COALESCE(v_err, 'no error');

  -- G5: the sweep settles stalled sends (705, 706, 707; 708 is fresh).
  v_detail := public.sweep_procurement_clocks();
  ASSERT (v_detail->>'draft_send_stalled')::int >= 3, 'FAIL G5: stalled sends counted, got ' || v_detail::text;
  SELECT * INTO v_draft FROM public.procurement_drafts WHERE id = '70718000-0000-4000-8000-000000000706';
  ASSERT v_draft.status = 'sent' AND v_draft.sent_by = '70718000-0000-4000-8000-0000000000a2'
     AND v_draft.sent_at = now() - interval '18 minutes' AND v_draft.message_id = 're_sq451_706',
    'FAIL G5: the sweep completes a logged send, got ' || v_draft.status;
  SELECT * INTO v_draft FROM public.procurement_drafts WHERE id = '70718000-0000-4000-8000-000000000707';
  ASSERT v_draft.status = 'awaiting_review' AND v_draft.sent_by IS NULL,
    'FAIL G5: a failed send goes back to review, got ' || v_draft.status;
  SELECT * INTO v_draft FROM public.procurement_drafts WHERE id = '70718000-0000-4000-8000-000000000705';
  ASSERT v_draft.status = 'awaiting_review', 'FAIL G5: an unlogged send goes back to review, got ' || v_draft.status;
  SELECT * INTO v_draft FROM public.procurement_drafts WHERE id = '70718000-0000-4000-8000-000000000708';
  ASSERT v_draft.status = 'sending', 'FAIL G5: a fresh claim is left alone, got ' || v_draft.status;

  -- Grants.
  ASSERT has_function_privilege('authenticated', 'public.complete_procurement_draft_send(uuid)', 'EXECUTE')
     AND NOT has_function_privilege('anon', 'public.complete_procurement_draft_send(uuid)', 'EXECUTE'),
    'FAIL G5: complete is for authenticated, not anon';
  ASSERT NOT has_function_privilege('authenticated', 'public._procurement_draft_send_on_record(uuid)', 'EXECUTE')
     AND NOT has_function_privilege('anon', 'public._procurement_draft_send_on_record(uuid)', 'EXECUTE'),
    'FAIL G5: the send record lookup is service-side only';
  ASSERT has_function_privilege('authenticated', 'public.claim_procurement_draft_for_send(uuid)', 'EXECUTE')
     AND NOT has_function_privilege('anon', 'public.claim_procurement_draft_for_send(uuid)', 'EXECUTE'),
    'FAIL D1: claim is for authenticated, not anon';
  ASSERT has_function_privilege('authenticated', 'public.release_procurement_draft_claim(uuid)', 'EXECUTE')
     AND has_function_privilege('service_role', 'public.release_procurement_draft_claim(uuid)', 'EXECUTE')
     AND NOT has_function_privilege('anon', 'public.release_procurement_draft_claim(uuid)', 'EXECUTE'),
    'FAIL D1: release is for authenticated and service_role, not anon';
  ASSERT NOT has_function_privilege('authenticated', 'public._compose_receiver_inbound_draft(uuid,uuid,date,date,text,text)', 'EXECUTE')
     AND NOT has_function_privilege('anon', 'public._compose_receiver_inbound_draft(uuid,uuid,date,date,text,text)', 'EXECUTE')
     AND has_function_privilege('service_role', 'public._compose_receiver_inbound_draft(uuid,uuid,date,date,text,text)', 'EXECUTE'),
    'FAIL D1: the internal composer is service-side only';
  RAISE NOTICE 'D1 passed: claim, mark, release; grants';
END;
$$;

ROLLBACK;
