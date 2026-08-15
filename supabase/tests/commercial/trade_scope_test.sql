-- 00423 Trade Scope integration test.
-- Runner: same-session SQL-test helper. The transaction rolls back.
-- Run:
--   scripts/run-supabase-sql-test.sh supabase/tests/commercial/trade_scope_test.sql
--
-- What this suite is for: a trade scope is the third instrument on the
-- commercial rail, and the first one whose money is billed on a SCHEDULE rather
-- than settled by a deposit and a purchase order. That makes three things worth
-- pinning hard:
--   · the draw schedule must be exact and ordered — Σ draws = the client price,
--     one acceptance-gated draw and it is the last, and no draw bills before
--     every draw below it is paid;
--   · the progress ratchet must be one-way, and acceptance must belong to the
--     CLIENT and only reach them from substantial completion;
--   · the trade's presence in the schedule must never become procurement. A
--     presence line is not furniture, and a purchase order raised against it
--     would bill the same work twice from both ends — nor may it become
--     FURNISHING BUDGET, which is the same rule read from the money's end
--     (section 10A).
--
-- FALSIFIABILITY. Five core guards are proven to BITE, not merely to be
-- present: each refusal is re-run inside a SAVEPOINT with the guard's trigger
-- disabled, asserting the operation then SUCCEEDS, before rolling the savepoint
-- back (which restores both the data and the trigger). Those blocks are marked
-- FALSIFY. Without them a passing assertion only proves that SOMETHING refused.
--
-- Section 10A falsifies differently, because what it tests is not a guard but a
-- predicate inside two function bodies: it strips the predicate out of each live
-- definition and asserts the leak returns. Same principle, different seam.
--
-- A few blocks use the same DISABLE TRIGGER idiom in the other direction — to
-- CONSTRUCT a state a guard normally prevents, so a second, independent seam can
-- be shown to catch it anyway. They say so where they do it.

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id uuid, p_role text DEFAULT 'authenticated')
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_user_id, 'role', p_role
  )::text, true);
END;
$$;

-- The PRE-00423 fingerprint body, verbatim from 00422, kept here as the
-- byte-stability oracle for section 12.
CREATE OR REPLACE FUNCTION pg_temp.fingerprint_00422(p_proposal_id uuid)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT encode(extensions.digest(convert_to(jsonb_build_object(
    'proposal', public._proposal_review_fingerprint(p_proposal_id),
    'documentKind', p.document_kind,
    'serviceTerms', (
      SELECT to_jsonb(t) - 'created_at' - 'updated_at'
      FROM public.proposal_service_terms t WHERE t.proposal_id = p.id
    ),
    'serviceRates', COALESCE((
      SELECT jsonb_agg(to_jsonb(r) - 'id' - 'created_at' ORDER BY r.version, r.sort_order, r.role_name)
      FROM public.proposal_service_rates r WHERE r.proposal_id = p.id
    ), '[]'::jsonb),
    'furnishings', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'sourceProposalItemId', i.source_proposal_item_id,
        'sourceFfeItemId', i.source_ffe_item_id,
        'projectRoomId', i.project_room_id,
        'productId', i.product_id, 'name', i.name, 'roomName', i.room_name,
        'category', i.category, 'itemType', i.item_type, 'quantity', i.quantity,
        'clientUnitPriceCents', i.client_unit_price_cents,
        'clientLineTotalCents', i.client_line_total_cents,
        'snapshot', i.snapshot, 'sortOrder', i.sort_order
      ) ORDER BY i.sort_order, i.id)
      FROM public.furnishing_authorization_items i
      JOIN public.project_commercial_documents d ON d.id = i.commercial_document_id
      WHERE d.proposal_id = p.id
    ), '[]'::jsonb)
  )::text, 'UTF8'), 'sha256'), 'hex')
  FROM public.proposals p
  WHERE p.id = p_proposal_id;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (1) FIXTURE — an executed design-services engagement, two rooms, two subs,
--     a schedule to release furnishings from, and an acknowledged budget.
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
) VALUES
  ('d8000000-0000-4000-8000-000000000001', 'trade-designer@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('d8000000-0000-4000-8000-000000000002', 'trade-client@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('d8000000-0000-4000-8000-000000000003', 'trade-stranger@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES
  ('d8000000-0000-4000-8000-000000000001', 'trade-designer@test.invalid', 'Trade Designer', true, now(), now()),
  ('d8000000-0000-4000-8000-000000000002', 'trade-client@test.invalid', 'Trade Client', false, now(), now()),
  ('d8000000-0000-4000-8000-000000000003', 'trade-stranger@test.invalid', 'Trade Stranger', false, now(), now())
ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, full_name = EXCLUDED.full_name;

INSERT INTO public.organizations (id, type, name, slug, status)
VALUES ('d8100000-0000-4000-8000-000000000001', 'design_studio',
        'Trade Scope Studio', 'trade-scope-test', 'active');
SELECT pg_temp.assume_user('d8000000-0000-4000-8000-000000000001', 'service_role');
INSERT INTO public.organization_members (
  id, user_id, organization_id, role, status, joined_at
) VALUES (
  'd8110000-0000-4000-8000-000000000001',
  'd8000000-0000-4000-8000-000000000001',
  'd8100000-0000-4000-8000-000000000001', 'owner', 'active', now()
);

INSERT INTO public.designer_clients (
  id, designer_id, client_id, client_name, status, source
) VALUES (
  'd8200000-0000-4000-8000-000000000001',
  'd8000000-0000-4000-8000-000000000001',
  'd8000000-0000-4000-8000-000000000002',
  'Trade Client', 'proposal', 'direct'
);

INSERT INTO public.vendors (id, name, website)
VALUES ('d8710000-0000-4000-8000-000000000001', 'Trade Test Vendor',
        'https://trade-vendor.test.invalid');

CREATE TEMP TABLE trade_ids (key text PRIMARY KEY, value uuid NOT NULL) ON COMMIT DROP;

SELECT pg_temp.assume_user('d8000000-0000-4000-8000-000000000001');
INSERT INTO public.proposals (
  id, designer_id, designer_client_id, client_id, title, description,
  total_amount, status, valid_until
) VALUES (
  'd8300000-0000-4000-8000-000000000001',
  'd8000000-0000-4000-8000-000000000001',
  'd8200000-0000-4000-8000-000000000001',
  'd8000000-0000-4000-8000-000000000002',
  'Trade scope engagement', 'The origin document.', 0, 'draft',
  now() + interval '180 days'
);
INSERT INTO public.proposal_phases (
  id, proposal_id, name, phase_key, duration_days, lane, fee_cents, sort_order
) VALUES (
  'd8310000-0000-4000-8000-000000000001',
  'd8300000-0000-4000-8000-000000000001',
  'Design development', 'design-development', 30, 'main', 0, 0
);
DO $$
DECLARE v_snapshot jsonb;
BEGIN
  PERFORM public.upsert_design_services_draft(
    'd8300000-0000-4000-8000-000000000001',
    jsonb_build_object(
      'scope', 'Whole-home interior design services.',
      'deliverables', jsonb_build_array('Concept', 'Selections', 'Trade coordination'),
      'exclusions', jsonb_build_array('Structural engineering'),
      'billingCeilingCents', 900000,
      'retainerAmountCents', 0,
      'retainerActivationPolicy', 'immediate',
      'billingCadence', 'monthly', 'currency', 'USD',
      'terms', 'Actual hours to the signed ceiling.',
      'currentRateVersion', 1
    ),
    jsonb_build_array(jsonb_build_object(
      'version', 1, 'roleName', 'Lead Designer',
      'hourlyRateCents', 15000, 'sortOrder', 0, 'effectiveAt', now()
    ))
  );
  v_snapshot := public.get_commercial_document_send_snapshot(
    'd8300000-0000-4000-8000-000000000001'
  );
  PERFORM public.send_commercial_document(
    'd8300000-0000-4000-8000-000000000001',
    v_snapshot->>'documentFingerprint', NULL, now() + interval '180 days'
  );
END $$;
SELECT pg_temp.assume_user('d8000000-0000-4000-8000-000000000002');
SELECT public.sign_design_services_agreement(
  'd8300000-0000-4000-8000-000000000001', 'Trade Client'
);
SELECT pg_temp.assume_user('d8000000-0000-4000-8000-000000000001');
DO $$
DECLARE v_executed jsonb;
BEGIN
  v_executed := public.countersign_design_services_agreement(
    'd8300000-0000-4000-8000-000000000001', 'Trade Designer'
  );
  ASSERT (v_executed->>'newlyExecuted')::boolean, 'origin countersign';
  INSERT INTO trade_ids VALUES ('project', (v_executed->>'projectId')::uuid);
END $$;

DO $$
DECLARE
  v_project uuid := (SELECT value FROM trade_ids WHERE key = 'project');
  v_kitchen uuid; v_bath uuid;
BEGIN
  INSERT INTO public.project_rooms (project_id, name, sort_order)
  VALUES (v_project, 'Kitchen', 0) RETURNING id INTO v_kitchen;
  INSERT INTO public.project_rooms (project_id, name, sort_order)
  VALUES (v_project, 'Primary bath', 1) RETURNING id INTO v_bath;
  INSERT INTO trade_ids VALUES ('kitchen', v_kitchen), ('bath', v_bath);

  -- Two ordinary furnishings lines. Section 10 releases and purchase-orders one
  -- of them, so the trade block can be shown to be a TRADE rule and not a new
  -- blanket refusal on the whole table.
  INSERT INTO public.project_ffe_items (
    project_id, project_room_id, name, ffe_category, item_type, status,
    quantity, unit_price_cents, trade_price_cents, markup_percent,
    line_total_cents, vendor_id, vendor_name, doc_code, sort_order
  ) VALUES
    (v_project, v_kitchen, 'Counter stool', 'Seating', 'fixed', 'specified',
     2, 60000, 36000, 66.67, 120000,
     'd8710000-0000-4000-8000-000000000001', 'Trade Test Vendor', 'KT-01', 0),
    (v_project, v_kitchen, 'Pendant light', 'Lighting', 'fixed', 'specified',
     1, 90000, 54000, 66.67, 90000,
     'd8710000-0000-4000-8000-000000000001', 'Trade Test Vendor', 'KT-02', 1);

  -- The two subs. project_parties is the studio's roster; the scope snapshots
  -- what it needs so the document survives a roster edit.
  INSERT INTO public.project_parties (
    id, project_id, party_kind, display_name, company_name, trade, email, phone
  ) VALUES
    ('d8800000-0000-4000-8000-000000000001', v_project, 'sub', 'Hollis Millwork',
     'Hollis & Sons LLC', 'Millwork', 'hollis@trade.test.invalid', '555-0101'),
    ('d8800000-0000-4000-8000-000000000002', v_project, 'sub', 'Renn Tile',
     'Renn Surfaces Inc', 'Tile setting', 'renn@trade.test.invalid', '555-0202');
END $$;

INSERT INTO trade_ids (key, value)
SELECT 'ffe_' || i.doc_code, i.id FROM public.project_ffe_items i
WHERE i.project_id = (SELECT value FROM trade_ids WHERE key = 'project')
  AND i.doc_code IS NOT NULL;

DO $$
DECLARE
  v_project uuid := (SELECT value FROM trade_ids WHERE key = 'project');
  v_budget jsonb; v_published jsonb;
BEGIN
  v_budget := public.derive_working_budget_draft(v_project);
  v_published := public.publish_budget_checkpoint(
    v_project, (v_budget->'version'->>'id')::uuid
  );
  INSERT INTO trade_ids VALUES ('checkpoint', (v_published->>'checkpointId')::uuid);
END $$;
SELECT pg_temp.assume_user('d8000000-0000-4000-8000-000000000002');
SELECT public.acknowledge_budget_checkpoint(
  (SELECT value FROM trade_ids WHERE key = 'checkpoint')
);
SELECT pg_temp.assume_user('d8000000-0000-4000-8000-000000000001');

-- ═══════════════════════════════════════════════════════════════════════════
-- (2) AUTHORING — mint a scope, write the work, record what three bids said,
--     and choose one. Selecting stamps the winning party onto the terms; the
--     database, not the RPC, is what makes "two selected bids" impossible.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_project uuid := (SELECT value FROM trade_ids WHERE key = 'project');
  v_kitchen uuid := (SELECT value FROM trade_ids WHERE key = 'kitchen');
  v_bath uuid := (SELECT value FROM trade_ids WHERE key = 'bath');
  v_scope jsonb;
  v_scope_id uuid;
  v_bid_a1 uuid; v_bid_b uuid; v_bid_a2 uuid;
  v_selected jsonb;
  v_err text;
BEGIN
  -- A project with no executed design-services origin cannot mint one. (Proven
  -- against a bare project, so the refusal is the ORIGIN rule and not access.)
  INSERT INTO public.projects (id, name, client_id, designer_id, created_by)
  VALUES ('d8500000-0000-4000-8000-000000000009', 'Legacy project',
          'd8000000-0000-4000-8000-000000000002',
          'd8000000-0000-4000-8000-000000000001',
          'd8000000-0000-4000-8000-000000000001');
  BEGIN
    PERFORM public.create_trade_scope(
      'd8500000-0000-4000-8000-000000000009', 'Millwork'
    );
    ASSERT false, 'a legacy project must not mint a trade scope';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'project d8500000-0000-4000-8000-000000000009 has no executed design-services origin',
    format('origin refusal: %L', v_err);

  v_scope := public.create_trade_scope(v_project, 'Kitchen and bath millwork');
  v_scope_id := (v_scope->>'proposalId')::uuid;
  INSERT INTO trade_ids VALUES
    ('scope1', v_scope_id), ('scope1_doc', (v_scope->>'documentId')::uuid);
  ASSERT v_scope->>'commercialState' = 'draft'
     AND v_scope->>'progressState' = 'none',
    'a fresh trade scope is a draft that has not started';
  ASSERT (SELECT document_kind FROM public.proposals WHERE id = v_scope_id) = 'trade_scope'
     AND (SELECT document_kind FROM public.project_commercial_documents
          WHERE proposal_id = v_scope_id) = 'trade_scope',
    'both the edition and the binding must carry the new kind';
  ASSERT EXISTS (SELECT 1 FROM public.trade_scope_terms WHERE proposal_id = v_scope_id),
    'create_trade_scope must leave a terms skeleton behind';
  ASSERT (SELECT wave_name IS NULL FROM public.project_commercial_documents
          WHERE proposal_id = v_scope_id),
    'a trade scope is not a wave and must carry no wave_name';

  -- The work, as prose, one section per room. Allocations apportion the price.
  INSERT INTO public.trade_scope_sections (
    proposal_id, project_room_id, room_name, prose, allocation_cents, sort_order
  ) VALUES
    (v_scope_id, v_kitchen, 'Kitchen',
     'Full-height rift white oak cabinetry, integrated appliance panels, and a '
     'waterfall island surround. Shop drawings for approval before fabrication.',
     600000, 0),
    (v_scope_id, v_bath, 'Primary bath',
     'Floating vanity in matching oak with a stone deck, plus a linen tower.',
     300000, 1);

  -- Three recorded bids from two parties: Hollis quoted twice (a revised verbal
  -- number), which the partial unique index deliberately permits — it constrains
  -- only party RESPONSES to an RFQ, not what the studio writes down.
  INSERT INTO public.trade_scope_bids (
    proposal_id, party_id, party_display_name, amount_cents, status, source, note
  ) VALUES
    (v_scope_id, 'd8800000-0000-4000-8000-000000000001', 'Hollis Millwork',
     720000, 'quoted', 'recorded', 'First pass, shop drawings extra.')
  RETURNING id INTO v_bid_a1;
  INSERT INTO public.trade_scope_bids (
    proposal_id, party_id, party_display_name, amount_cents, status, source, note
  ) VALUES
    (v_scope_id, 'd8800000-0000-4000-8000-000000000002', 'Renn Tile',
     680000, 'quoted', 'recorded', 'Cannot start until March.')
  RETURNING id INTO v_bid_b;
  INSERT INTO public.trade_scope_bids (
    proposal_id, party_id, party_display_name, amount_cents, status, source, note
  ) VALUES
    (v_scope_id, 'd8800000-0000-4000-8000-000000000001', 'Hollis Millwork',
     695000, 'quoted', 'recorded', 'Revised, drawings included.')
  RETURNING id INTO v_bid_a2;
  INSERT INTO trade_ids VALUES
    ('bid_a1', v_bid_a1), ('bid_b', v_bid_b), ('bid_a2', v_bid_a2);

  -- Choose Renn first, so the demote/promote path is exercised by the switch.
  v_selected := public.select_trade_bid(v_bid_b);
  ASSERT v_selected->>'status' = 'selected'
     AND (v_selected->>'partyId')::uuid = 'd8800000-0000-4000-8000-000000000002',
    'select_trade_bid must promote the named bid';
  ASSERT (SELECT party_display_name FROM public.trade_scope_terms WHERE proposal_id = v_scope_id)
         = 'Renn Tile'
     AND (SELECT party_company_name FROM public.trade_scope_terms WHERE proposal_id = v_scope_id)
         = 'Renn Surfaces Inc'
     AND (SELECT party_trade FROM public.trade_scope_terms WHERE proposal_id = v_scope_id)
         = 'Tile setting',
    'selecting a bid must stamp the party snapshot onto the terms';

  -- Switch to Hollis's revised bid: the incumbent is demoted, the new one
  -- promoted, and the snapshot follows.
  v_selected := public.select_trade_bid(v_bid_a2);
  ASSERT (SELECT status FROM public.trade_scope_bids WHERE id = v_bid_b) = 'quoted',
    'the incumbent bid must be demoted, not left selected';
  ASSERT (SELECT count(*) FROM public.trade_scope_bids
          WHERE proposal_id = v_scope_id AND status = 'selected') = 1,
    'exactly one bid may be selected';
  ASSERT (SELECT party_display_name FROM public.trade_scope_terms WHERE proposal_id = v_scope_id)
         = 'Hollis Millwork',
    'switching the selection must re-stamp the party snapshot';

  -- The database, not the RPC, forbids two selections.
  BEGIN
    UPDATE public.trade_scope_bids SET status = 'selected' WHERE id = v_bid_b;
    ASSERT false, 'a second selected bid must be impossible at the table edge';
  EXCEPTION WHEN unique_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err LIKE '%uniq_trade_scope_selected_bid%',
    format('second-selection refusal: %L', v_err);

  -- A party answers an RFQ once. The partial unique index constrains only
  -- RESPONSES — which is why Hollis was able to be written down twice above.
  -- rfq_request_id / response_token_id are left NULL here: 00424 turned both
  -- bare columns into real foreign keys, so the arbitrary uuids this block used
  -- to carry no longer insert. What it is testing is the response-uniqueness
  -- index, not the provenance columns — those are covered end to end by
  -- supabase/tests/commercial/trade_rfq_test.sql (11).
  INSERT INTO public.trade_scope_bids (
    proposal_id, party_id, party_display_name, amount_cents, status, source,
    responded_at
  ) VALUES (
    v_scope_id, 'd8800000-0000-4000-8000-000000000002', 'Renn Tile',
    671000, 'quoted', 'party_response', now()
  );
  BEGIN
    INSERT INTO public.trade_scope_bids (
      proposal_id, party_id, party_display_name, amount_cents, status, source,
      responded_at
    ) VALUES (
      v_scope_id, 'd8800000-0000-4000-8000-000000000002', 'Renn Tile',
      669000, 'quoted', 'party_response', now()
    );
    ASSERT false, 'a party may answer an RFQ only once';
  EXCEPTION WHEN unique_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err LIKE '%uniq_trade_scope_party_response%',
    format('duplicate-response refusal: %L', v_err);

  -- The price is the STUDIO's, not the bid's: what a sub charges and what a
  -- client pays are different numbers, and nothing here copies one to the other.
  ASSERT (SELECT client_price_cents FROM public.trade_scope_terms
          WHERE proposal_id = v_scope_id) = 0,
    'selecting a bid must not set the client price';
  UPDATE public.trade_scope_terms SET
    client_price_cents = 900000,
    terms = 'Fifty percent of the balance is due at rough-in. Shop drawings '
            'approved in writing before fabrication.'
  WHERE proposal_id = v_scope_id;

  -- A party from another project is not this scope's to name.
  INSERT INTO public.project_parties (
    id, project_id, party_kind, display_name
  ) VALUES (
    'd8800000-0000-4000-8000-000000000009',
    'd8500000-0000-4000-8000-000000000009', 'sub', 'Outsider Trades'
  );
  BEGIN
    PERFORM public.set_trade_scope_party(
      v_scope_id, 'd8800000-0000-4000-8000-000000000009'
    );
    ASSERT false, 'a party from another project must not be nameable';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = format('party %s does not belong to project %s',
                        'd8800000-0000-4000-8000-000000000009', v_project),
    format('foreign-party refusal: %L', v_err);
END $$;

-- A BID is the other way a party's identity is frozen onto a signed document —
-- selecting one snapshots the party's name, company and trade onto the terms.
-- Two independent seams hold the same rule, and neither trusts the other: the
-- table edge refuses to record a bid against a party from another project, and
-- select_trade_bid refuses to select one even if the row somehow exists.
DO $$
DECLARE
  v_scope uuid := (SELECT value FROM trade_ids WHERE key = 'scope1');
  v_project uuid := (SELECT value FROM trade_ids WHERE key = 'project');
  v_err text;
BEGIN
  BEGIN
    INSERT INTO public.trade_scope_bids (
      proposal_id, party_id, party_display_name, amount_cents
    ) VALUES (
      v_scope, 'd8800000-0000-4000-8000-000000000009', 'Outsider Trades', 500000
    );
    ASSERT false, 'a bid must not name a party from another project';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = format('party %s does not belong to project %s',
                        'd8800000-0000-4000-8000-000000000009', v_project),
    format('foreign-party bid refusal: %L', v_err);
END $$;

-- The trigger is suspended only to CONSTRUCT the row it normally prevents, then
-- put back before the selection is attempted — so what is proven below is
-- select_trade_bid's own check, not the trigger's.
SAVEPOINT foreign_bid_selection;
ALTER TABLE public.trade_scope_bids DISABLE TRIGGER guard_trade_scope_bid_party_trg;
INSERT INTO public.trade_scope_bids (
  id, proposal_id, party_id, party_display_name, amount_cents
) VALUES (
  'd8900000-0000-4000-8000-000000000001',
  (SELECT value FROM trade_ids WHERE key = 'scope1'),
  'd8800000-0000-4000-8000-000000000009', 'Outsider Trades', 500000
);
ALTER TABLE public.trade_scope_bids ENABLE TRIGGER guard_trade_scope_bid_party_trg;
DO $$
DECLARE
  v_project uuid := (SELECT value FROM trade_ids WHERE key = 'project');
  v_scope uuid := (SELECT value FROM trade_ids WHERE key = 'scope1');
  v_err text;
BEGIN
  BEGIN
    PERFORM public.select_trade_bid('d8900000-0000-4000-8000-000000000001');
    ASSERT false, 'a bid naming a foreign party must not be selectable';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = format('party %s does not belong to project %s',
                        'd8800000-0000-4000-8000-000000000009', v_project),
    format('foreign-party selection refusal: %L', v_err);
  -- The refusal lands before the demote/promote, so the ledger is untouched.
  ASSERT (SELECT status FROM public.trade_scope_bids
          WHERE id = (SELECT value FROM trade_ids WHERE key = 'bid_a2')) = 'selected',
    'a refused selection must leave the incumbent selected';
  ASSERT (SELECT party_display_name FROM public.trade_scope_terms
          WHERE proposal_id = v_scope) = 'Hollis Millwork',
    'a refused selection must not restamp the terms';
END $$;
ROLLBACK TO SAVEPOINT foreign_bid_selection;

-- ═══════════════════════════════════════════════════════════════════════════
-- (3) THE DRAW SCHEDULE AND THE SEND SEAM. Every refusal below is proven from
--     a savepoint, so the schedule that actually ships is the correct one and
--     each rejection is tested against the same document.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE v_scope uuid := (SELECT value FROM trade_ids WHERE key = 'scope1');
BEGIN
  INSERT INTO public.trade_scope_draws (
    proposal_id, label, percentage, amount_cents, sort_order, gates_on_acceptance
  ) VALUES
    (v_scope, 'Deposit', 40, 360000, 0, false),
    (v_scope, 'Rough-in', 30, 270000, 1, false),
    (v_scope, 'Acceptance', 30, 270000, 2, true);
END $$;
INSERT INTO trade_ids (key, value)
SELECT 'draw' || (w.sort_order + 1)::text, w.id FROM public.trade_scope_draws w
WHERE w.proposal_id = (SELECT value FROM trade_ids WHERE key = 'scope1');

-- Bad sum.
SAVEPOINT send_bad_sum;
DO $$
DECLARE
  v_scope uuid := (SELECT value FROM trade_ids WHERE key = 'scope1');
  v_err text;
BEGIN
  UPDATE public.trade_scope_draws SET amount_cents = 260000
  WHERE proposal_id = v_scope AND sort_order = 1;
  BEGIN
    PERFORM public.send_commercial_document(
      v_scope, public._commercial_document_fingerprint(v_scope), NULL, NULL);
    ASSERT false, 'a draw schedule that does not sum to the price must not send';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'trade scope draw schedule must sum to the client price',
    format('draw-sum refusal: %L', v_err);
END $$;
ROLLBACK TO SAVEPOINT send_bad_sum;

-- Two acceptance gates.
SAVEPOINT send_two_gates;
DO $$
DECLARE
  v_scope uuid := (SELECT value FROM trade_ids WHERE key = 'scope1');
  v_err text;
BEGIN
  UPDATE public.trade_scope_draws SET gates_on_acceptance = true
  WHERE proposal_id = v_scope AND sort_order = 1;
  BEGIN
    PERFORM public.send_commercial_document(
      v_scope, public._commercial_document_fingerprint(v_scope), NULL, NULL);
    ASSERT false, 'two acceptance-gated draws must not send';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'trade scope draw schedule must have exactly one acceptance-gated draw',
    format('two-gate refusal: %L', v_err);
END $$;
ROLLBACK TO SAVEPOINT send_two_gates;

-- The gate is not on the last draw.
SAVEPOINT send_gate_misplaced;
DO $$
DECLARE
  v_scope uuid := (SELECT value FROM trade_ids WHERE key = 'scope1');
  v_err text;
BEGIN
  UPDATE public.trade_scope_draws SET gates_on_acceptance = false
  WHERE proposal_id = v_scope AND sort_order = 2;
  UPDATE public.trade_scope_draws SET gates_on_acceptance = true
  WHERE proposal_id = v_scope AND sort_order = 1;
  BEGIN
    PERFORM public.send_commercial_document(
      v_scope, public._commercial_document_fingerprint(v_scope), NULL, NULL);
    ASSERT false, 'the acceptance gate must sit on the last draw';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'the acceptance-gated draw must be the last draw in the schedule',
    format('gate-position refusal: %L', v_err);
END $$;
ROLLBACK TO SAVEPOINT send_gate_misplaced;

-- A SINGLE draw that gates on acceptance. Every rule above holds trivially on a
-- one-row schedule — one draw, one gate, and the gate is necessarily also the
-- last — so without this rule the draw billed unconditionally at signature would
-- be the acceptance-gated one, and the client would be invoiced the entire scope
-- price the moment they signed a document that says the money is due on
-- acceptance. That is the exact inversion the gate exists to prevent.
SAVEPOINT send_single_gated_draw;
DO $$
DECLARE
  v_scope uuid := (SELECT value FROM trade_ids WHERE key = 'scope1');
  v_err text;
BEGIN
  DELETE FROM public.trade_scope_draws WHERE proposal_id = v_scope;
  INSERT INTO public.trade_scope_draws (
    proposal_id, label, percentage, amount_cents, sort_order, gates_on_acceptance
  ) VALUES (v_scope, 'Final · on acceptance', 100, 900000, 0, true);
  BEGIN
    PERFORM public.send_commercial_document(
      v_scope, public._commercial_document_fingerprint(v_scope), NULL, NULL);
    ASSERT false, 'a lone acceptance-gated draw must not send';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'the first draw is billed at signature, so it must not be the acceptance-gated one',
    format('single-gated-draw refusal: %L', v_err);
END $$;
ROLLBACK TO SAVEPOINT send_single_gated_draw;

-- Percentages that do not total 100.
SAVEPOINT send_percentage_total;
DO $$
DECLARE
  v_scope uuid := (SELECT value FROM trade_ids WHERE key = 'scope1');
  v_err text;
BEGIN
  UPDATE public.trade_scope_draws SET percentage = 40
  WHERE proposal_id = v_scope AND sort_order = 2;
  BEGIN
    PERFORM public.send_commercial_document(
      v_scope, public._commercial_document_fingerprint(v_scope), NULL, NULL);
    ASSERT false, 'percentages that do not total 100 must not send';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'trade scope draw percentages must total 100',
    format('percentage-total refusal: %L', v_err);
END $$;
ROLLBACK TO SAVEPOINT send_percentage_total;

-- Percentages that total 100 and still contradict the money beside them. The
-- amounts are untouched, so Σ draws = the client price and every other rule
-- passes — the document simply states two different payment plans on one page.
SAVEPOINT send_percentage_mismatch;
DO $$
DECLARE
  v_scope uuid := (SELECT value FROM trade_ids WHERE key = 'scope1');
  v_err text;
BEGIN
  UPDATE public.trade_scope_draws SET percentage = 10
  WHERE proposal_id = v_scope AND sort_order = 0;
  UPDATE public.trade_scope_draws SET percentage = 60
  WHERE proposal_id = v_scope AND sort_order = 1;
  BEGIN
    PERFORM public.send_commercial_document(
      v_scope, public._commercial_document_fingerprint(v_scope), NULL, NULL);
    ASSERT false, 'a percentage that contradicts its amount must not send';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'each trade scope draw percentage must match the amount beside it',
    format('percentage-mismatch refusal: %L', v_err);
END $$;
ROLLBACK TO SAVEPOINT send_percentage_mismatch;


-- A half-allocated scope.
SAVEPOINT send_partial_allocation;
DO $$
DECLARE
  v_scope uuid := (SELECT value FROM trade_ids WHERE key = 'scope1');
  v_err text;
BEGIN
  UPDATE public.trade_scope_sections SET allocation_cents = NULL
  WHERE proposal_id = v_scope AND sort_order = 1;
  BEGIN
    PERFORM public.send_commercial_document(
      v_scope, public._commercial_document_fingerprint(v_scope), NULL, NULL);
    ASSERT false, 'a partially allocated scope must not send';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'trade scope section allocations must sum to the client price',
    format('partial-allocation refusal: %L', v_err);
END $$;
ROLLBACK TO SAVEPOINT send_partial_allocation;

-- No sections, no party, no draws.
SAVEPOINT send_empty;
DO $$
DECLARE
  v_scope uuid := (SELECT value FROM trade_ids WHERE key = 'scope1');
  v_err text;
BEGIN
  DELETE FROM public.trade_scope_draws WHERE proposal_id = v_scope;
  BEGIN
    PERFORM public.send_commercial_document(
      v_scope, public._commercial_document_fingerprint(v_scope), NULL, NULL);
    ASSERT false, 'a scope with no draw schedule must not send';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'trade scope send requires at least one draw',
    format('no-draw refusal: %L', v_err);

  DELETE FROM public.trade_scope_sections WHERE proposal_id = v_scope;
  BEGIN
    PERFORM public.send_commercial_document(
      v_scope, public._commercial_document_fingerprint(v_scope), NULL, NULL);
    ASSERT false, 'a scope with no work described must not send';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'trade scope send requires at least one scope section',
    format('no-section refusal: %L', v_err);

  UPDATE public.trade_scope_terms SET party_id = NULL WHERE proposal_id = v_scope;
  BEGIN
    PERFORM public.send_commercial_document(
      v_scope, public._commercial_document_fingerprint(v_scope), NULL, NULL);
    ASSERT false, 'a scope naming nobody must not send';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'trade scope send requires a named party and a client price',
    format('no-party refusal: %L', v_err);
END $$;
ROLLBACK TO SAVEPOINT send_empty;

-- And the schedule that actually ships.
DO $$
DECLARE
  v_scope uuid := (SELECT value FROM trade_ids WHERE key = 'scope1');
  v_before text;
  v_sent jsonb;
BEGIN
  v_before := public._commercial_document_fingerprint(v_scope);
  v_sent := public.send_commercial_document(
    v_scope, v_before, NULL, now() + interval '30 days'
  );
  ASSERT v_sent->>'commercialState' = 'sent'
     AND v_sent->>'documentKind' = 'trade_scope',
    'a complete trade scope sends';
  ASSERT (SELECT commercial_state FROM public.proposals WHERE id = v_scope) = 'sent',
    'guard_commercial_proposal_authority must mirror the send into commercial_state';
  ASSERT (SELECT total_amount FROM public.proposals WHERE id = v_scope) = 900000,
    'sending must mirror the agreed client price onto the edition';

  -- That mirror writes proposals.total_amount, which is INSIDE the hash. The
  -- fingerprint handed back must therefore be the one this document answers to
  -- now, not the pre-send value it was checked against — otherwise any consumer
  -- that stores the send snapshot and re-verifies sees a false mismatch, on the
  -- trade rail only.
  ASSERT v_sent->>'documentFingerprint'
         = public._commercial_document_fingerprint(v_scope),
    'the send snapshot must verify against the document it just sent';
  ASSERT v_sent->>'documentFingerprint' <> v_before,
    'the trade mirror moves the hash, so returning the pre-send value would be stale';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (4) POST-SEND IMMUTABILITY. The words, the price and the schedule the client
--     is looking at are frozen. Bids are NOT — the studio is still buying.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_scope uuid := (SELECT value FROM trade_ids WHERE key = 'scope1');
  v_err text;
BEGIN
  BEGIN
    UPDATE public.trade_scope_sections SET prose = 'Rewritten after sending.'
    WHERE proposal_id = v_scope AND sort_order = 0;
    ASSERT false, 'sent scope prose must be frozen';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'trade_scope_sections is immutable after its proposal leaves draft',
    format('section freeze: %L', v_err);

  BEGIN
    UPDATE public.trade_scope_draws SET amount_cents = 400000
    WHERE proposal_id = v_scope AND sort_order = 0;
    ASSERT false, 'sent scope draw amounts must be frozen';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'trade scope draw schedule is frozen after the scope leaves draft',
    format('draw freeze: %L', v_err);

  BEGIN
    INSERT INTO public.trade_scope_draws (proposal_id, label, amount_cents, sort_order)
    VALUES (v_scope, 'Extra', 1000, 9);
    ASSERT false, 'a fourth draw must not appear after sending';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'trade scope draw schedule is frozen after the scope leaves draft',
    format('draw insert freeze: %L', v_err);

  BEGIN
    UPDATE public.trade_scope_terms SET client_price_cents = 1000000
    WHERE proposal_id = v_scope;
    ASSERT false, 'the sent client price must be frozen';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'trade scope terms are immutable after the scope leaves draft',
    format('terms freeze: %L', v_err);

  BEGIN
    UPDATE public.trade_scope_draws SET invoice_id = NULL
    WHERE proposal_id = v_scope AND sort_order = 0;
    -- No-op writes are not changes; force a real one against a live invoice id
    -- once one exists. Here the column is already NULL, so nothing is refused.
    NULL;
  EXCEPTION WHEN OTHERS THEN
    ASSERT false, format('a no-op draw write must not be refused: %L', SQLERRM);
  END;

  -- The studio keeps buying. A late quote is recorded, not refused.
  INSERT INTO public.trade_scope_bids (
    proposal_id, party_id, party_display_name, amount_cents, status, source, note
  ) VALUES (
    v_scope, 'd8800000-0000-4000-8000-000000000002', 'Renn Tile',
    660000, 'quoted', 'recorded', 'Came back cheaper after the scope was sent.'
  );
  ASSERT (SELECT count(*) FROM public.trade_scope_bids WHERE proposal_id = v_scope) = 5,
    'bids stay writable after the scope is sent';

  -- A scope may also change party or draw shape only while it is a draft.
  BEGIN
    PERFORM public.set_trade_scope_party(
      v_scope, 'd8800000-0000-4000-8000-000000000002');
    ASSERT false, 'the party of a sent scope must be fixed';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'a trade scope party may only be set while the scope is a draft',
    format('sent set-party refusal: %L', v_err);
  BEGIN
    PERFORM public.select_trade_bid((SELECT value FROM trade_ids WHERE key = 'bid_b'));
    ASSERT false, 'the selection of a sent scope must be fixed';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'a trade scope bid may only be selected while the scope is a draft',
    format('sent select-bid refusal: %L', v_err);
END $$;

-- FALSIFY (1/5) — guard_trade_scope_sections_authored. With the trigger off the
-- same prose UPDATE lands, which is what makes the assertion above a test.
SAVEPOINT falsify_sections;
ALTER TABLE public.trade_scope_sections DISABLE TRIGGER guard_trade_scope_sections_authored;
DO $$
DECLARE v_scope uuid := (SELECT value FROM trade_ids WHERE key = 'scope1');
BEGIN
  UPDATE public.trade_scope_sections SET prose = 'Rewritten after sending.'
  WHERE proposal_id = v_scope AND sort_order = 0;
  ASSERT (SELECT prose FROM public.trade_scope_sections
          WHERE proposal_id = v_scope AND sort_order = 0) = 'Rewritten after sending.',
    'FALSIFY: with the authored-child trigger off the rewrite must land, proving the guard is what refused it';
END $$;
ROLLBACK TO SAVEPOINT falsify_sections;

-- FALSIFY (2/5) — guard_trade_scope_draws_trg.
SAVEPOINT falsify_draws;
ALTER TABLE public.trade_scope_draws DISABLE TRIGGER guard_trade_scope_draws_trg;
DO $$
DECLARE v_scope uuid := (SELECT value FROM trade_ids WHERE key = 'scope1');
BEGIN
  UPDATE public.trade_scope_draws SET amount_cents = 400000
  WHERE proposal_id = v_scope AND sort_order = 0;
  ASSERT (SELECT amount_cents FROM public.trade_scope_draws
          WHERE proposal_id = v_scope AND sort_order = 0) = 400000,
    'FALSIFY: with the draw guard off the amount must move, proving the freeze is that guard';
END $$;
ROLLBACK TO SAVEPOINT falsify_draws;

-- ═══════════════════════════════════════════════════════════════════════════
-- (5) EXECUTION — one act. The client signs, the deposit draw is issued, and
--     nothing appears in any room yet.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_scope uuid := (SELECT value FROM trade_ids WHERE key = 'scope1');
  v_doc uuid := (SELECT value FROM trade_ids WHERE key = 'scope1_doc');
  v_draw1 uuid := (SELECT value FROM trade_ids WHERE key = 'draw1');
  v_project uuid := (SELECT value FROM trade_ids WHERE key = 'project');
  v_before integer;
  v_after integer;
  v_exec jsonb;
  v_retry jsonb;
  v_fingerprint text;
  v_err text;
BEGIN
  SELECT count(*) INTO v_before FROM public.project_ffe_items WHERE project_id = v_project;
  v_fingerprint := public._commercial_document_fingerprint(v_scope);

  -- The designer cannot sign for the client.
  BEGIN
    PERFORM public.execute_trade_scope(v_scope, 'Trade Designer');
    ASSERT false, 'a designer must not execute the client''s trade scope';
  EXCEPTION WHEN insufficient_privilege THEN v_err := SQLERRM;
  END;
  ASSERT v_err = format('trade scope %s not found or access denied', v_scope),
    format('designer-execute refusal: %L', v_err);

  PERFORM pg_temp.assume_user('d8000000-0000-4000-8000-000000000002');
  v_exec := public.execute_trade_scope(v_scope, 'Trade Client');
  ASSERT (v_exec->>'newlyExecuted')::boolean, 'first execution';
  ASSERT v_exec->>'commercialState' = 'executed', 'the scope is executed';
  ASSERT v_exec->>'progressState' = 'none',
    'execution does not start the work; engagement does';
  INSERT INTO trade_ids VALUES ('deposit', (v_exec->>'depositInvoiceId')::uuid);

  ASSERT (SELECT count(*) FROM public.commercial_document_signatures
          WHERE proposal_id = v_scope AND party_role = 'client'
            AND signed_name = 'Trade Client'
            AND evidence_fingerprint = v_fingerprint) = 1,
    'execution must leave exactly one client signature carrying the document hash';
  ASSERT (SELECT status FROM public.proposals WHERE id = v_scope) = 'accepted'
     AND (SELECT commercial_state FROM public.proposals WHERE id = v_scope) = 'executed',
    'both lifecycle columns move together';
  ASSERT (SELECT executed_at IS NOT NULL FROM public.project_commercial_documents
          WHERE id = v_doc),
    'the binding must carry executed_at';

  -- The deposit is draw one, exactly.
  ASSERT (v_exec->>'depositRequiredCents')::integer = 360000,
    format('deposit must be draw one: %s', v_exec->>'depositRequiredCents');
  ASSERT (SELECT deposit_invoice_id FROM public.project_commercial_documents WHERE id = v_doc)
         = (v_exec->>'depositInvoiceId')::uuid,
    'the binding must carry the deposit invoice';
  ASSERT (SELECT invoice_id FROM public.trade_scope_draws WHERE id = v_draw1)
         = (v_exec->>'depositInvoiceId')::uuid,
    'draw one must be stamped with the invoice it was billed on';
  ASSERT (SELECT status FROM public.invoices WHERE id = (v_exec->>'depositInvoiceId')::uuid)
         = 'sent',
    'the deposit invoice must be issued, not left a draft';
  ASSERT (SELECT metadata->>'kind' FROM public.invoice_line_items
          WHERE invoice_id = (v_exec->>'depositInvoiceId')::uuid) = 'trade_draw'
     AND (SELECT (metadata->>'drawId')::uuid FROM public.invoice_line_items
          WHERE invoice_id = (v_exec->>'depositInvoiceId')::uuid) = v_draw1
     AND (SELECT (metadata->>'tradeScopeId')::uuid FROM public.invoice_line_items
          WHERE invoice_id = (v_exec->>'depositInvoiceId')::uuid) = v_scope
     AND (SELECT (metadata->>'tradeScopeDocumentId')::uuid FROM public.invoice_line_items
          WHERE invoice_id = (v_exec->>'depositInvoiceId')::uuid) = v_doc,
    'the deposit line must name the scope, its binding and the draw';

  -- Nothing appeared in any room.
  SELECT count(*) INTO v_after FROM public.project_ffe_items WHERE project_id = v_project;
  ASSERT v_after = v_before,
    format('execution minted %s schedule rows; presence belongs to engagement',
           v_after - v_before);

  -- Retry is idempotent against immutable evidence, and mints no second invoice.
  v_retry := public.execute_trade_scope(v_scope, 'Trade Client');
  ASSERT NOT (v_retry->>'newlyExecuted')::boolean, 'a retry is not a new execution';
  ASSERT (v_retry->>'depositInvoiceId')::uuid = (v_exec->>'depositInvoiceId')::uuid,
    'a retry must answer with the same deposit invoice';
  ASSERT (SELECT count(*) FROM public.invoices
          WHERE project_id = v_project AND memo LIKE 'Trade scope%') = 1,
    'a retry must not issue a second deposit';

  -- A different name is a different act, and the evidence refuses it.
  BEGIN
    PERFORM public.execute_trade_scope(v_scope, 'Someone Else');
    ASSERT false, 'a retry under another name must be refused';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'trade scope signature retry conflicts with immutable evidence',
    format('evidence refusal: %L', v_err);
  PERFORM pg_temp.assume_user('d8000000-0000-4000-8000-000000000001');
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (6) ENGAGEMENT — the deposit is paid, so the work is real and appears in the
--     rooms it happens in.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_scope uuid := (SELECT value FROM trade_ids WHERE key = 'scope1');
  v_doc uuid := (SELECT value FROM trade_ids WHERE key = 'scope1_doc');
  v_deposit uuid := (SELECT value FROM trade_ids WHERE key = 'deposit');
  v_kitchen uuid := (SELECT value FROM trade_ids WHERE key = 'kitchen');
  v_bath uuid := (SELECT value FROM trade_ids WHERE key = 'bath');
  v_engaged jsonb;
  v_again jsonb;
  v_err text;
BEGIN
  BEGIN
    PERFORM public.engage_trade_scope(v_scope);
    ASSERT false, 'an unpaid scope must not be engageable';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'the trade scope deposit invoice must be paid before engagement',
    format('unpaid-engage refusal: %L', v_err);

  -- A partial payment is not payment.
  PERFORM public.record_invoice_payment(
    v_deposit, 100000, 'check', 'TRADE-DEP-PART', now(), NULL);
  BEGIN
    PERFORM public.engage_trade_scope(v_scope);
    ASSERT false, 'a partly paid deposit must not be engageable';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'the trade scope deposit invoice must be paid before engagement',
    format('partial-engage refusal: %L', v_err);

  PERFORM public.record_invoice_payment(
    v_deposit, 260000, 'check', 'TRADE-DEP-REST', now(), NULL);
  ASSERT (SELECT status FROM public.invoices WHERE id = v_deposit) = 'paid',
    'apply_invoice_payment_effects must settle the deposit unchanged';

  v_engaged := public.engage_trade_scope(v_scope);
  ASSERT (v_engaged->>'newlyEngaged')::boolean, 'first engagement';
  ASSERT v_engaged->>'progressState' = 'engaged', 'the ratchet moved to engaged';
  ASSERT (v_engaged->>'presenceLineCount')::integer = 2,
    'one presence line per section';

  -- The presence lines, in full.
  ASSERT (SELECT count(*) FROM public.project_ffe_items i
          WHERE i.trade_scope_document_id = v_doc
            AND i.ffe_category = 'trade work'
            AND i.added_via = 'trade-scope'
            AND i.item_type = 'fixed'
            AND i.status = 'approved'
            AND i.quantity = 1
            AND i.trade_price_cents IS NULL
            AND i.markup_percent IS NULL
            AND i.source_commercial_document_id IS NULL
            AND i.source_authorization_item_id IS NULL) = 2,
    'presence lines must carry the specced shape and no furnishings provenance';
  ASSERT (SELECT name FROM public.project_ffe_items
          WHERE trade_scope_document_id = v_doc AND project_room_id = v_kitchen)
         = 'Kitchen and bath millwork — Kitchen',
    'a presence line is named for its scope and its room';
  ASSERT (SELECT line_total_cents FROM public.project_ffe_items
          WHERE trade_scope_document_id = v_doc AND project_room_id = v_kitchen) = 600000
     AND (SELECT line_total_cents FROM public.project_ffe_items
          WHERE trade_scope_document_id = v_doc AND project_room_id = v_bath) = 300000,
    'an allocated section carries its allocation';
  ASSERT (SELECT sum(line_total_cents) FROM public.project_ffe_items
          WHERE trade_scope_document_id = v_doc) = 900000,
    'the presence lines must sum to the client price, never a multiple of it';

  -- Idempotent.
  v_again := public.engage_trade_scope(v_scope);
  ASSERT NOT (v_again->>'newlyEngaged')::boolean, 're-engaging is not a new engagement';
  ASSERT (SELECT count(*) FROM public.project_ffe_items
          WHERE trade_scope_document_id = v_doc) = 2,
    're-engaging must not double the presence lines';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (7) THE PROGRESS RATCHET — one way, and acceptance is the client's.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_scope uuid := (SELECT value FROM trade_ids WHERE key = 'scope1');
  v_err text;
BEGIN
  -- Without the canonical capability, progress does not move at all — even for
  -- a session whose current_user IS postgres.
  BEGIN
    UPDATE public.trade_scope_terms SET progress_state = 'in_progress'
    WHERE proposal_id = v_scope;
    ASSERT false, 'a direct progress write must be refused';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'trade scope progress may only change through its canonical RPC',
    format('direct-progress refusal: %L', v_err);

  PERFORM public.mark_trade_scope_in_progress(v_scope);
  ASSERT (SELECT progress_state FROM public.trade_scope_terms WHERE proposal_id = v_scope)
         = 'in_progress', 'the studio may start the work';

  -- With the capability held, the ratchet still refuses to run backwards.
  PERFORM set_config('app.trade_scope_progress_id', v_scope::text, true);
  BEGIN
    UPDATE public.trade_scope_terms SET progress_state = 'engaged'
    WHERE proposal_id = v_scope;
    ASSERT false, 'progress must not run backwards';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'trade scope progress runs forward only',
    format('backward refusal: %L', v_err);

  -- Nor may it skip to acceptance.
  BEGIN
    UPDATE public.trade_scope_terms SET
      progress_state = 'accepted', accepted_at = now(),
      accepted_by = 'd8000000-0000-4000-8000-000000000002',
      accepted_signed_name = 'Trade Client',
      acceptance_fingerprint = repeat('a', 64)
    WHERE proposal_id = v_scope;
    ASSERT false, 'acceptance must not be reachable from in_progress';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'trade scope acceptance requires substantial completion first',
    format('skip-to-accepted refusal: %L', v_err);
  PERFORM set_config('app.trade_scope_progress_id', '', true);

  -- The client cannot declare the work substantially complete.
  PERFORM pg_temp.assume_user('d8000000-0000-4000-8000-000000000002');
  BEGIN
    PERFORM public.record_trade_scope_substantial_completion(v_scope);
    ASSERT false, 'a client must not declare substantial completion';
  EXCEPTION WHEN insufficient_privilege THEN v_err := SQLERRM;
  END;
  ASSERT v_err = format('trade scope %s not found or access denied', v_scope),
    format('client-substantial refusal: %L', v_err);

  -- Nor may the client accept before the studio says the work is ready.
  BEGIN
    PERFORM public.accept_trade_scope(v_scope, 'Trade Client');
    ASSERT false, 'acceptance before substantial completion must be refused';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'a trade scope must be substantially complete before the client accepts it',
    format('early-accept refusal: %L', v_err);

  -- The studio's act.
  PERFORM pg_temp.assume_user('d8000000-0000-4000-8000-000000000001');
  PERFORM public.record_trade_scope_substantial_completion(v_scope);
  ASSERT (SELECT progress_state FROM public.trade_scope_terms WHERE proposal_id = v_scope)
         = 'substantially_complete'
     AND (SELECT substantial_completion_at IS NOT NULL FROM public.trade_scope_terms
          WHERE proposal_id = v_scope)
     AND (SELECT substantial_completion_by FROM public.trade_scope_terms
          WHERE proposal_id = v_scope) = 'd8000000-0000-4000-8000-000000000001',
    'substantial completion stamps who said so and when';

  -- And the designer still cannot accept on the client's behalf.
  BEGIN
    PERFORM public.accept_trade_scope(v_scope, 'Trade Designer');
    ASSERT false, 'a designer must not accept their own work';
  EXCEPTION WHEN insufficient_privilege THEN v_err := SQLERRM;
  END;
  ASSERT v_err = format('trade scope %s not found or access denied', v_scope),
    format('designer-accept refusal: %L', v_err);
END $$;

-- FALSIFY (3/5) — guard_trade_scope_terms_trg. The backward move lands with the
-- trigger off, so the refusal above is that guard and not the shape CHECK.
SAVEPOINT falsify_terms;
ALTER TABLE public.trade_scope_terms DISABLE TRIGGER guard_trade_scope_terms_trg;
DO $$
DECLARE v_scope uuid := (SELECT value FROM trade_ids WHERE key = 'scope1');
BEGIN
  UPDATE public.trade_scope_terms SET progress_state = 'engaged'
  WHERE proposal_id = v_scope;
  ASSERT (SELECT progress_state FROM public.trade_scope_terms WHERE proposal_id = v_scope)
         = 'engaged',
    'FALSIFY: with the terms guard off the ratchet runs backwards, proving the guard is what refused it';
END $$;
ROLLBACK TO SAVEPOINT falsify_terms;

-- ═══════════════════════════════════════════════════════════════════════════
-- (8) THE DRAW ORDER. A schedule that can be billed out of order is not a
--     schedule. Acceptance sits between draw two and draw three.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_scope uuid := (SELECT value FROM trade_ids WHERE key = 'scope1');
  v_doc uuid := (SELECT value FROM trade_ids WHERE key = 'scope1_doc');
  v_draw1 uuid := (SELECT value FROM trade_ids WHERE key = 'draw1');
  v_draw2 uuid := (SELECT value FROM trade_ids WHERE key = 'draw2');
  v_draw3 uuid := (SELECT value FROM trade_ids WHERE key = 'draw3');
  v_issued jsonb;
  v_accepted jsonb;
  v_err text;
BEGIN
  -- Draw one is already live (execution issued it).
  BEGIN
    PERFORM public.issue_trade_draw_invoice(v_draw1);
    ASSERT false, 'a live draw must not be re-issued';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'trade scope draw "Deposit" is already billed on a live invoice',
    format('re-issue refusal: %L', v_err);

  -- Draw two bills only after draw one is PAID — which it is, from section 6.
  v_issued := public.issue_trade_draw_invoice(v_draw2);
  ASSERT (v_issued->>'invoiceId') IS NOT NULL
     AND (v_issued->>'amountCents')::integer = 270000
     AND v_issued->>'invoiceStatus' = 'sent',
    'draw two issues once draw one is paid';
  INSERT INTO trade_ids VALUES ('draw2_invoice', (v_issued->>'invoiceId')::uuid);
  ASSERT (SELECT memo FROM public.invoices WHERE id = (v_issued->>'invoiceId')::uuid)
         = 'Trade scope draw · Rough-in',
    'a draw invoice names the draw it bills';
  ASSERT (SELECT (metadata->>'drawId')::uuid FROM public.invoice_line_items
          WHERE invoice_id = (v_issued->>'invoiceId')::uuid) = v_draw2
     AND (SELECT (metadata->>'tradeScopeDocumentId')::uuid FROM public.invoice_line_items
          WHERE invoice_id = (v_issued->>'invoiceId')::uuid) = v_doc,
    'a draw line carries the ids that trace it back';

  -- Draw three while draw two is unpaid.
  BEGIN
    PERFORM public.issue_trade_draw_invoice(v_draw3);
    ASSERT false, 'a draw must not jump an unpaid predecessor';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'earlier trade scope draws must be issued and paid before this one',
    format('order refusal: %L', v_err);

  PERFORM public.record_invoice_payment(
    (SELECT value FROM trade_ids WHERE key = 'draw2_invoice'),
    270000, 'check', 'TRADE-DRAW-2', now(), NULL);

  -- Draw three before acceptance: the order is satisfied, the gate is not.
  BEGIN
    PERFORM public.issue_trade_draw_invoice(v_draw3);
    ASSERT false, 'the gated draw must not bill before acceptance';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'the acceptance-gated trade scope draw is billable only after the client accepts the work',
    format('gate refusal: %L', v_err);

  -- The client's act.
  PERFORM pg_temp.assume_user('d8000000-0000-4000-8000-000000000002');
  v_accepted := public.accept_trade_scope(v_scope, 'Trade Client');
  ASSERT (v_accepted->>'changed')::boolean AND v_accepted->>'progressState' = 'accepted',
    'the client accepts';
  ASSERT (SELECT acceptance_fingerprint FROM public.trade_scope_terms WHERE proposal_id = v_scope)
         = public._commercial_document_fingerprint(v_scope),
    'the acceptance fingerprint must be the hash of the document as it stands';
  ASSERT (SELECT accepted_signed_name FROM public.trade_scope_terms WHERE proposal_id = v_scope)
         = 'Trade Client'
     AND (SELECT accepted_by FROM public.trade_scope_terms WHERE proposal_id = v_scope)
         = 'd8000000-0000-4000-8000-000000000002',
    'acceptance records who accepted, under what name';
  -- Acceptance ISSUES NOTHING.
  ASSERT (SELECT invoice_id IS NULL FROM public.trade_scope_draws WHERE id = v_draw3),
    'acceptance must not bill the final draw by itself';
  PERFORM pg_temp.assume_user('d8000000-0000-4000-8000-000000000001');

  v_issued := public.issue_trade_draw_invoice(v_draw3);
  ASSERT (v_issued->>'amountCents')::integer = 270000
     AND (v_issued->>'gatesOnAcceptance')::boolean,
    'the gated draw bills once the client has accepted';
  INSERT INTO trade_ids VALUES ('draw3_invoice', (v_issued->>'invoiceId')::uuid);

  -- The whole price, billed exactly once.
  ASSERT (SELECT sum(i.total_cents) FROM public.trade_scope_draws w
          JOIN public.invoices i ON i.id = w.invoice_id
          WHERE w.proposal_id = v_scope AND i.status <> 'void') = 900000,
    'the live draw invoices must sum to the client price';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (9) A VOIDED DRAW INVOICE FREES ITS DRAW. Nothing else does.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_draw3 uuid := (SELECT value FROM trade_ids WHERE key = 'draw3');
  v_invoice uuid := (SELECT value FROM trade_ids WHERE key = 'draw3_invoice');
  v_reissued jsonb;
  v_err text;
BEGIN
  BEGIN
    PERFORM public.issue_trade_draw_invoice(v_draw3);
    ASSERT false, 'a live gated draw must not be re-issued';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'trade scope draw "Acceptance" is already billed on a live invoice',
    format('live re-issue refusal: %L', v_err);

  -- And a hand-written billing stamp is refused: only the RPC holds the
  -- capability, even from a postgres session.
  BEGIN
    UPDATE public.trade_scope_draws SET invoice_id = NULL WHERE id = v_draw3;
    ASSERT false, 'a hand-written draw billing change must be refused';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'trade scope draw billing may only change through its canonical RPC',
    format('hand-stamp refusal: %L', v_err);

  PERFORM public.void_invoice(v_invoice, 'Wrong billing address on the invoice.');
  ASSERT (SELECT status FROM public.invoices WHERE id = v_invoice) = 'void',
    'the draw invoice is voided';

  v_reissued := public.issue_trade_draw_invoice(v_draw3);
  ASSERT (v_reissued->>'invoiceId')::uuid <> v_invoice
     AND (v_reissued->>'amountCents')::integer = 270000,
    'a voided invoice frees its draw to be billed again';
  ASSERT (SELECT invoice_id FROM public.trade_scope_draws WHERE id = v_draw3)
         = (v_reissued->>'invoiceId')::uuid,
    're-issuing re-stamps the draw';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (10) PROCUREMENT. A presence line is not furniture. A furnishings line still
--      is — the block is a TRADE rule, not a new blanket refusal.
-- ═══════════════════════════════════════════════════════════════════════════

-- First, the furnishings rail, walked end to end so there is a real purchase
-- order to point at.
DO $$
DECLARE
  v_project uuid := (SELECT value FROM trade_ids WHERE key = 'project');
  v_stool uuid := (SELECT value FROM trade_ids WHERE key = 'ffe_KT-01');
  v_pendant uuid := (SELECT value FROM trade_ids WHERE key = 'ffe_KT-02');
  v_release jsonb;
  v_exec jsonb;
BEGIN
  v_release := public.create_furnishings_authorization_from_schedule(
    v_project, 'Kitchen release', ARRAY[v_stool, v_pendant], 50
  );
  INSERT INTO trade_ids VALUES
    ('furnishings', (v_release->>'proposalId')::uuid),
    ('furnishings_doc', (v_release->>'documentId')::uuid);
  PERFORM public.send_commercial_document(
    (v_release->>'proposalId')::uuid,
    public._commercial_document_fingerprint((v_release->>'proposalId')::uuid),
    NULL, now() + interval '30 days'
  );
  PERFORM pg_temp.assume_user('d8000000-0000-4000-8000-000000000002');
  v_exec := public.execute_furnishings_authorization(
    (v_release->>'proposalId')::uuid, 'Trade Client'
  );
  PERFORM pg_temp.assume_user('d8000000-0000-4000-8000-000000000001');
  PERFORM public.record_invoice_payment(
    (v_exec->>'depositInvoiceId')::uuid,
    (v_exec->>'depositRequiredCents')::integer, 'check', 'FURN-DEP', now(), NULL);
  PERFORM public.create_purchase_order(
    v_project, 'd8710000-0000-4000-8000-000000000001', 'full_upfront',
    ARRAY[v_stool]
  );
  ASSERT (SELECT purchase_order_id IS NOT NULL FROM public.project_ffe_items
          WHERE id = v_stool),
    'REGRESSION: a furnishings line must still take a purchase order';
  INSERT INTO trade_ids VALUES
    ('purchase_order', (SELECT purchase_order_id FROM public.project_ffe_items WHERE id = v_stool));
END $$;

DO $$
DECLARE
  v_doc uuid := (SELECT value FROM trade_ids WHERE key = 'scope1_doc');
  v_furn_doc uuid := (SELECT value FROM trade_ids WHERE key = 'furnishings_doc');
  v_po uuid := (SELECT value FROM trade_ids WHERE key = 'purchase_order');
  v_kitchen uuid := (SELECT value FROM trade_ids WHERE key = 'kitchen');
  v_line uuid;
  v_err text;
BEGIN
  SELECT id INTO v_line FROM public.project_ffe_items
  WHERE trade_scope_document_id = v_doc AND project_room_id = v_kitchen;
  INSERT INTO trade_ids VALUES ('presence_kitchen', v_line);

  BEGIN
    UPDATE public.project_ffe_items SET purchase_order_id = v_po WHERE id = v_line;
    ASSERT false, 'a trade presence line must not accept a purchase order';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'trade scope lines are not purchase-orderable',
    format('trade PO refusal: %L', v_err);

  -- Nor by the front door.
  BEGIN
    PERFORM public.create_purchase_order(
      (SELECT value FROM trade_ids WHERE key = 'project'),
      'd8710000-0000-4000-8000-000000000001', 'full_upfront', ARRAY[v_line]);
    ASSERT false, 'create_purchase_order must not swallow a trade presence line';
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM;
  END;
  ASSERT v_err LIKE '%not purchase-orderable%' OR v_err LIKE '%not found%',
    format('create_purchase_order trade refusal: %L', v_err);

  -- Provenance is immutable in both directions.
  BEGIN
    UPDATE public.project_ffe_items SET trade_scope_document_id = v_furn_doc
    WHERE id = v_line;
    ASSERT false, 'a presence line must not be re-pointed at another instrument';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'trade scope provenance is immutable',
    format('provenance refusal: %L', v_err);

  -- And a line cannot claim both provenances at once.
  BEGIN
    UPDATE public.project_ffe_items SET source_commercial_document_id = v_furn_doc
    WHERE id = v_line;
    ASSERT false, 'a line must not carry two provenances';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err LIKE '%project_ffe_items_single_provenance_check%',
    format('dual-provenance refusal: %L', v_err);
END $$;

-- The OTHER way a schedule line leaves the schedule is the furnishings release,
-- and it must refuse a presence line for the same reason procurement does: the
-- trade scope's draw schedule is already billing the client for this work, so
-- authorizing it again would put the same money on two instruments. The refusal
-- has to live in the release, not only in the single-provenance CHECK — the
-- CHECK does not fire until the CLIENT signs the authorization, which aborts a
-- document they were asked to sign, permanently, on every retry.
DO $$
DECLARE
  v_project uuid := (SELECT value FROM trade_ids WHERE key = 'project');
  v_line uuid := (SELECT value FROM trade_ids WHERE key = 'presence_kitchen');
  v_clean uuid := 'd8600000-0000-4000-8000-000000000002';
  v_err text;
BEGIN
  BEGIN
    PERFORM public.create_furnishings_authorization_from_schedule(
      v_project, 'Trade release', ARRAY[v_line], 50
    );
    ASSERT false, 'a trade presence line must not be releasable as furnishings';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'schedule line "Kitchen and bath millwork — Kitchen" is trade work on its own scope and cannot be released as furnishings',
    format('furnishings release refusal: %L', v_err);

  -- And one poisoned line refuses the WHOLE release, rather than quietly
  -- dropping itself and authorizing the rest. The companion line is freshly
  -- minted and passes every other check, so the trade refusal is the only one
  -- the loop can raise, whichever order it walks the ids in.
  INSERT INTO public.project_ffe_items (
    id, project_id, project_room_id, name, ffe_category, item_type, status,
    quantity, unit_price_cents, line_total_cents, sort_order
  ) VALUES (
    v_clean, v_project, (SELECT value FROM trade_ids WHERE key = 'kitchen'),
    'Bar stool', 'Seating', 'fixed', 'specified', 1, 40000, 40000, 91
  );
  BEGIN
    PERFORM public.create_furnishings_authorization_from_schedule(
      v_project, 'Mixed release', ARRAY[v_clean, v_line], 50
    );
    ASSERT false, 'a mixed release carrying a presence line must be refused whole';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'schedule line "Kitchen and bath millwork — Kitchen" is trade work on its own scope and cannot be released as furnishings',
    format('mixed release refusal: %L', v_err);
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.proposals
    WHERE title IN ('Trade release', 'Mixed release')),
    'a refused release must mint no document at all';
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.furnishing_authorization_items
    WHERE source_ffe_item_id = v_clean),
    'the clean companion line must not have been authorized on its own';
  DELETE FROM public.project_ffe_items WHERE id = v_clean;
END $$;

-- POST-EXECUTION PRICE LOCK. The presence line is the one carrier of a signed
-- number the client reads straight off the LIVE schedule row — its furnishings
-- twin reads the frozen snapshot instead, which is why furnishings never needed
-- this. Nothing else covered it: the purchase-authority guard returns early when
-- no purchase order moved, 00422's soft lock keys on lines named by a sent
-- furnishings authorization, and the table carried no DELETE trigger at all.
DO $$
DECLARE
  v_line uuid := (SELECT value FROM trade_ids WHERE key = 'presence_kitchen');
  v_err text;
BEGIN
  BEGIN
    UPDATE public.project_ffe_items SET line_total_cents = 100 WHERE id = v_line;
    ASSERT false, 'a priced trade line must not be repriced';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'trade line is priced on executed trade scope "Kitchen and bath millwork" and cannot be repriced or removed',
    format('presence reprice refusal: %L', v_err);

  BEGIN
    UPDATE public.project_ffe_items SET quantity = 4, unit_price_cents = 1
    WHERE id = v_line;
    ASSERT false, 'a priced trade line must not have its quantity moved';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err LIKE 'trade line is priced on executed trade scope%',
    format('presence quantity refusal: %L', v_err);

  BEGIN
    DELETE FROM public.project_ffe_items WHERE id = v_line;
    ASSERT false, 'a priced trade line must not be deleted';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'trade line is priced on executed trade scope "Kitchen and bath millwork" and cannot be repriced or removed',
    format('presence delete refusal: %L', v_err);

  -- Everything that is not the money stays the studio's working surface.
  UPDATE public.project_ffe_items
  SET notes = 'Shop drawings approved 14 March.' WHERE id = v_line;
  ASSERT (SELECT notes FROM public.project_ffe_items WHERE id = v_line)
         = 'Shop drawings approved 14 March.',
    'a note on a trade line is not money and must stay writable';
  ASSERT (SELECT line_total_cents FROM public.project_ffe_items WHERE id = v_line) = 600000,
    'the signed number is exactly where engagement left it';

  -- The lock is about the TRADE line, not the whole table: an ordinary schedule
  -- line carrying no instrument is still the studio's to reprice and to remove.
  INSERT INTO public.project_ffe_items (
    id, project_id, project_room_id, name, ffe_category, item_type, status,
    quantity, unit_price_cents, line_total_cents, sort_order
  ) VALUES (
    'd8600000-0000-4000-8000-000000000001',
    (SELECT value FROM trade_ids WHERE key = 'project'),
    (SELECT value FROM trade_ids WHERE key = 'kitchen'),
    'Loose control line', 'Accessories', 'fixed', 'specified', 1, 5000, 5000, 90
  );
  UPDATE public.project_ffe_items SET line_total_cents = 7000, unit_price_cents = 7000
  WHERE id = 'd8600000-0000-4000-8000-000000000001';
  ASSERT (SELECT line_total_cents FROM public.project_ffe_items
          WHERE id = 'd8600000-0000-4000-8000-000000000001') = 7000,
    'REGRESSION: a schedule line with no instrument must still be repriceable';
  DELETE FROM public.project_ffe_items WHERE id = 'd8600000-0000-4000-8000-000000000001';
  ASSERT NOT EXISTS (SELECT 1 FROM public.project_ffe_items
                     WHERE id = 'd8600000-0000-4000-8000-000000000001'),
    'REGRESSION: a schedule line with no instrument must still be deletable';
END $$;

-- FALSIFY (4/5) — aad_guard_trade_presence_line_lock_trg. With it off both the
-- reprice and the delete land, proving those refusals are that guard and not
-- some other rule on the table.
SAVEPOINT falsify_presence;
ALTER TABLE public.project_ffe_items DISABLE TRIGGER aad_guard_trade_presence_line_lock_trg;
DO $$
DECLARE v_line uuid := (SELECT value FROM trade_ids WHERE key = 'presence_kitchen');
BEGIN
  UPDATE public.project_ffe_items SET line_total_cents = 100 WHERE id = v_line;
  ASSERT (SELECT line_total_cents FROM public.project_ffe_items WHERE id = v_line) = 100,
    'FALSIFY: with the presence lock off the reprice must land, proving that guard is what refused it';
  DELETE FROM public.project_ffe_items WHERE id = v_line;
  ASSERT NOT EXISTS (SELECT 1 FROM public.project_ffe_items WHERE id = v_line),
    'FALSIFY: with the presence lock off the delete must land too';
END $$;
ROLLBACK TO SAVEPOINT falsify_presence;

-- FALSIFY (5/5) — aab_guard_project_ffe_purchase_authority_trg. With the trigger
-- off, the trade refusal disappears entirely, proving it came from that guard
-- and not from the provenance CHECK (which says nothing about purchase orders).
--
-- The write does not then SUCCEED, and deliberately so: an unrelated downstream
-- guard (00413's lock_configuration_snapshot_on_po_link) objects that the PO
-- total no longer matches the lines linked to it. That is a totals-consistency
-- rule about purchase orders, not a rule about trade scopes, so the falsification
-- asserts the precise thing it can honestly assert — the trade message is gone —
-- rather than disabling a second, unrelated guard to manufacture a success.
SAVEPOINT falsify_po;
ALTER TABLE public.project_ffe_items DISABLE TRIGGER aab_guard_project_ffe_purchase_authority_trg;
DO $$
DECLARE
  v_line uuid := (SELECT value FROM trade_ids WHERE key = 'presence_kitchen');
  v_po uuid := (SELECT value FROM trade_ids WHERE key = 'purchase_order');
  v_err text := NULL;
BEGIN
  BEGIN
    UPDATE public.project_ffe_items SET purchase_order_id = v_po WHERE id = v_line;
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM;
  END;
  ASSERT v_err IS DISTINCT FROM 'trade scope lines are not purchase-orderable',
    'FALSIFY: with the purchase-authority guard off the trade refusal must be gone, proving that guard is what refused it';
  ASSERT v_err IS NULL OR v_err LIKE '%does not match immutable configured line total%',
    format('FALSIFY: unexpected second refusal — %L', v_err);
END $$;
ROLLBACK TO SAVEPOINT falsify_po;

-- ═══════════════════════════════════════════════════════════════════════════
-- (10A) BUDGET PURITY. The working budget is a FURNISHING budget. Goods and
--       trade never share an instrument, and they must not share a budget line
--       either — a trade scope's money lives on the trade scope: its client
--       price, its draws, its invoices.
--
--       The phase-2 acceptance walk found the leak. The reasoning that said the
--       presence lines were already invisible was self-defeating:
--       publish_budget_checkpoint's `scheduled` sum matches a schedule line to a
--       budget line on room AND category, and it is true that no budget line
--       carries 'trade work' — until derive_working_budget_draft, which rolls up
--       EVERY schedule row by room × category, MINTS one. Then the match
--       succeeds and the trade price is stamped into the checkpoint the client
--       acknowledges, and read back on their plan grid as furnishing budget.
--
--       Everything here runs inside a savepoint: it publishes a second budget
--       version, and the sections below are entitled to the state section 10
--       left them.
-- ═══════════════════════════════════════════════════════════════════════════
SAVEPOINT budget_purity;

-- (a) DERIVE. Two engaged presence lines are on this project's schedule — one
--     in the Kitchen for 600000, one in the Primary bath for 300000 — and the
--     Primary bath holds NOTHING else. So the bath is the sharp test: post-fix
--     it contributes no budget line at all, where pre-fix it contributed a
--     'trade work' line for the whole of its allocation.
DO $$
DECLARE
  v_project uuid := (SELECT value FROM trade_ids WHERE key = 'project');
  v_bath uuid := (SELECT value FROM trade_ids WHERE key = 'bath');
  v_kitchen uuid := (SELECT value FROM trade_ids WHERE key = 'kitchen');
  v_budget jsonb;
  v_version uuid;
BEGIN
  -- The fixture the assertions below rest on, stated rather than assumed.
  ASSERT (SELECT sum(line_total_cents) FROM public.project_ffe_items
          WHERE project_id = v_project AND trade_scope_document_id IS NOT NULL) = 900000,
    'fixture: the engaged presence lines carry the whole client price';
  ASSERT (SELECT count(*) FROM public.project_ffe_items
          WHERE project_id = v_project AND project_room_id = v_bath
            AND trade_scope_document_id IS NULL) = 0,
    'fixture: the Primary bath holds nothing but trade work, so any bath budget line is a leak';

  v_budget := public.derive_working_budget_draft(v_project);
  v_version := (v_budget->'version'->>'id')::uuid;
  PERFORM set_config('trade.purity_version', v_version::text, true);

  ASSERT (SELECT status FROM public.project_budget_versions WHERE id = v_version) = 'draft',
    'derive must open a fresh draft version over the published one';

  -- THE FIX, stated directly.
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.project_budget_lines
    WHERE budget_version_id = v_version AND category = 'trade work'),
    'derive must mint no trade-work budget line — the budget is a furnishing budget';
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.project_budget_lines
    WHERE budget_version_id = v_version AND project_room_id = v_bath),
    'a room holding only trade work must contribute no budget line at all';

  -- ...and the exclusion is a TRADE rule, not a rollup that stopped working.
  ASSERT (SELECT target_cents FROM public.project_budget_lines
          WHERE budget_version_id = v_version
            AND project_room_id = v_kitchen AND category = 'Seating') = 120000,
    'REGRESSION: the furnishings rollup must still mint its lines';
  ASSERT (SELECT target_cents FROM public.project_budget_lines
          WHERE budget_version_id = v_version
            AND project_room_id = v_kitchen AND category = 'Lighting') = 90000,
    'REGRESSION: every furnishings room×category must still be minted';
  ASSERT (SELECT count(*) FROM public.project_budget_lines
          WHERE budget_version_id = v_version) = 2,
    'the derived version is exactly the two furnishings pairs and nothing else';
END $$;

-- (b) PUBLISH. The derive exclusion is not the only one that has to hold. A
--     'trade work' budget line can exist without derive ever minting one — a
--     studio can type any category by hand, and a version derived before this
--     migration already carries one. So the scheduled stamp refuses the presence
--     lines on its own account, and this block plants exactly such a line to
--     prove it: same room as the bath presence line, same category, so the
--     room×category match that leaked before would succeed here if it could.
DO $$
DECLARE
  v_project uuid := (SELECT value FROM trade_ids WHERE key = 'project');
  v_version uuid := current_setting('trade.purity_version')::uuid;
  v_bath uuid := (SELECT value FROM trade_ids WHERE key = 'bath');
  v_kitchen uuid := (SELECT value FROM trade_ids WHERE key = 'kitchen');
  v_planted uuid;
  v_published jsonb;
  v_read jsonb;
  v_furnishings_authorized bigint;
BEGIN
  INSERT INTO public.project_budget_lines (
    budget_version_id, project_room_id, room_name, category,
    low_cents, target_cents, high_cents, sort_order
  ) VALUES (
    v_version, v_bath, 'Primary bath', 'trade work', 0, 0, 0, 99
  ) RETURNING id INTO v_planted;

  v_published := public.publish_budget_checkpoint(v_project, v_version);
  ASSERT v_published->>'checkpointId' IS NOT NULL, 'the second checkpoint published';

  -- THE FIX, on the publish side.
  ASSERT (SELECT scheduled_cents FROM public.project_budget_lines WHERE id = v_planted) = 0,
    'the scheduled stamp must not see a trade presence line, whatever category a budget line claims';
  ASSERT (SELECT authorized_cents FROM public.project_budget_lines WHERE id = v_planted) = 0,
    'nor may trade money reach the authorized stamp';

  -- ...and the stamp still counts furnishings, so the zero above is the trade
  -- exclusion and not a stamp that stopped stamping.
  ASSERT (SELECT scheduled_cents FROM public.project_budget_lines
          WHERE budget_version_id = v_version
            AND project_room_id = v_kitchen AND category = 'Seating') = 120000,
    'REGRESSION: the scheduled stamp must still count furnishings';
  ASSERT (SELECT scheduled_cents FROM public.project_budget_lines
          WHERE budget_version_id = v_version
            AND project_room_id = v_kitchen AND category = 'Lighting') = 90000,
    'REGRESSION: every furnishings pair must still be stamped';
  ASSERT (SELECT sum(scheduled_cents) FROM public.project_budget_lines
          WHERE budget_version_id = v_version) = 210000,
    'the whole scheduled rollup is the furnishings schedule — the 900000 of trade work is nowhere in it';

  -- THE AUTHORIZED ROLLUPS were already clean, and this is the proof rather
  -- than the claim. Section 10 executed a real furnishings authorization, so
  -- there is something non-zero for the stamp to find; a trade presence line can
  -- never become a furnishing_authorization_items snapshot, because PART 5
  -- refuses to release one and the table edge refuses to let it hold a purchase
  -- order — both proven above.
  SELECT COALESCE(SUM(a.client_line_total_cents), 0) INTO v_furnishings_authorized
  FROM public.furnishing_authorization_items a
  JOIN public.project_commercial_documents d ON d.id = a.commercial_document_id
  JOIN public.proposals p ON p.id = d.proposal_id
  WHERE d.project_id = v_project AND d.executed_at IS NOT NULL
    AND p.commercial_state = 'executed';
  ASSERT v_furnishings_authorized > 0,
    'fixture: an executed furnishings authorization must exist, or the authorized assertions prove nothing';
  ASSERT (SELECT sum(authorized_cents) FROM public.project_budget_lines
          WHERE budget_version_id = v_version) = v_furnishings_authorized,
    'the authorized stamp is exactly the executed furnishings snapshots';

  -- And the same figure read back through the client-facing surface.
  v_read := public.get_project_working_budget(v_project);
  ASSERT (v_read->'version'->>'liveAuthorizedTotalCents')::bigint = v_furnishings_authorized,
    'liveAuthorizedTotalCents sums furnishing_authorization_items and cannot see a presence line';
  ASSERT NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_read->'lines') l
    WHERE (l->>'scheduledCents')::bigint = 300000
       OR (l->>'scheduledCents')::bigint = 600000
       OR (l->>'liveAuthorizedCents')::bigint > 0
          AND (l->>'category') = 'trade work'),
    'no line the client reads carries a trade allocation as furnishing money';
END $$;

-- FALSIFY (BUDGET PURITY) — the walk's leak, reproduced and then refuted. Both exclusions
-- are stripped out of the live function bodies (by rewriting each definition
-- from pg_get_functiondef with the predicate removed, so what runs is this
-- migration's body MINUS exactly the delta and nothing else), and the leak comes
-- straight back: derive mints a 'trade work' line for the bath's whole
-- allocation, and publish stamps it into the checkpoint. Rolling the savepoint
-- back restores both definitions, because DDL is transactional.
SAVEPOINT purity_falsify;
DO $$
DECLARE
  v_derive text := pg_get_functiondef('public.derive_working_budget_draft(uuid)'::regprocedure);
  v_publish text := pg_get_functiondef('public.publish_budget_checkpoint(uuid,uuid)'::regprocedure);
  v_derive_pre text;
  v_publish_pre text;
BEGIN
  v_derive_pre := replace(v_derive, 'AND item.trade_scope_document_id IS NULL', '');
  v_publish_pre := replace(v_publish, 'AND i.trade_scope_document_id IS NULL', '');
  ASSERT v_derive_pre <> v_derive,
    'FALSIFY: the derive exclusion must actually be in the shipped body, or there is nothing to strip';
  ASSERT v_publish_pre <> v_publish,
    'FALSIFY: the publish exclusion must actually be in the shipped body';
  EXECUTE v_derive_pre;
  EXECUTE v_publish_pre;
END $$;

DO $$
DECLARE
  v_project uuid := (SELECT value FROM trade_ids WHERE key = 'project');
  v_bath uuid := (SELECT value FROM trade_ids WHERE key = 'bath');
  v_budget jsonb;
  v_version uuid;
  v_leaked uuid;
BEGIN
  v_budget := public.derive_working_budget_draft(v_project);
  v_version := (v_budget->'version'->>'id')::uuid;
  SELECT id INTO v_leaked FROM public.project_budget_lines
  WHERE budget_version_id = v_version AND project_room_id = v_bath
    AND category = 'trade work';
  ASSERT v_leaked IS NOT NULL,
    'FALSIFY: without the derive exclusion the trade-work budget line must reappear, proving that predicate is what suppressed it';
  ASSERT (SELECT target_cents FROM public.project_budget_lines WHERE id = v_leaked) = 300000,
    'FALSIFY: and it carries the bath allocation — trade money, minted as furnishing budget';

  PERFORM public.publish_budget_checkpoint(v_project, v_version);
  ASSERT (SELECT scheduled_cents FROM public.project_budget_lines WHERE id = v_leaked) = 300000,
    'FALSIFY: without the publish exclusion the stamp freezes trade money into the checkpoint the client acknowledges — the walk''s leak, exactly';
END $$;
ROLLBACK TO SAVEPOINT purity_falsify;

-- The rollback really did put the shipped bodies back — otherwise every
-- assertion above this line would be describing a database that no longer
-- exists by the time anything else runs.
DO $$
DECLARE
  v_project uuid := (SELECT value FROM trade_ids WHERE key = 'project');
  v_budget jsonb;
BEGIN
  v_budget := public.derive_working_budget_draft(v_project);
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.project_budget_lines
    WHERE budget_version_id = (v_budget->'version'->>'id')::uuid
      AND category = 'trade work'),
    'the savepoint rollback must restore the shipped derive body';
END $$;

ROLLBACK TO SAVEPOINT budget_purity;

-- ═══════════════════════════════════════════════════════════════════════════
-- (11) PRIVACY. The client's document says one price. What the studio was
--      quoted, by whom, and how to reach them stays on the studio's side.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_scope uuid := (SELECT value FROM trade_ids WHERE key = 'scope1');
  v_bundle jsonb;
  v_trade jsonb;
  v_err text;
BEGIN
  PERFORM pg_temp.assume_user('d8000000-0000-4000-8000-000000000002');
  v_bundle := public.get_client_commercial_document_bundle(v_scope);
  v_trade := v_bundle->'tradeScope';
  ASSERT v_trade IS NOT NULL AND v_trade <> 'null'::jsonb,
    'the client bundle must carry a tradeScope arm';
  ASSERT NOT (v_trade ? 'bids') AND NOT (v_bundle ? 'bids'),
    'the client bundle must have no bids key at all';
  ASSERT v_trade->>'partyDisplayName' = 'Hollis Millwork'
     AND v_trade->>'partyCompanyName' = 'Hollis & Sons LLC'
     AND v_trade->>'partyTrade' = 'Millwork',
    'the client is told who is doing the work';
  ASSERT NOT (v_trade ? 'partyId') AND NOT (v_trade ? 'partyEmail')
     AND NOT (v_trade ? 'partyPhone'),
    'the client is not given the roster row, its id, or its contact details';
  ASSERT (v_trade->>'clientPriceCents')::integer = 900000,
    'the client sees the price they agreed';
  ASSERT jsonb_array_length(v_trade->'sections') = 2
     AND (v_trade->'sections'->0->>'roomName') = 'Kitchen',
    'the sections are ordered and named';
  ASSERT jsonb_array_length(v_trade->'draws') = 3
     AND (v_trade->'draws'->0->>'label') = 'Deposit'
     AND (v_trade->'draws'->2->>'gatesOnAcceptance')::boolean
     AND (v_trade->'draws'->0->>'invoiceId') IS NOT NULL
     AND (v_trade->'draws'->0->>'invoiceStatus') = 'paid'
     AND (v_trade->'draws'->0->>'invoicePaidCents')::integer = 360000,
    'the draws carry their billing state';
  ASSERT v_trade->'progress'->>'state' = 'accepted'
     AND (v_trade->'progress'->>'engagedAt') IS NOT NULL
     AND (v_trade->'progress'->>'substantialCompletionAt') IS NOT NULL
     AND v_trade->'progress'->>'acceptedSignedName' = 'Trade Client',
    'the progress block narrates the journey';
  ASSERT (v_trade->>'depositInvoiceId')::uuid
         = (SELECT value FROM trade_ids WHERE key = 'deposit'),
    'the deposit invoice is named';

  -- No trade-side vocabulary anywhere in the payload.
  ASSERT v_bundle::text !~* 'trade_price|markup|bid',
    format('client payload leaked trade-side vocabulary: %L',
           substring(v_bundle::text from 1 for 400));
  ASSERT v_bundle::text NOT LIKE '%hollis@trade.test.invalid%'
     AND v_bundle::text NOT LIKE '%555-0101%',
    'client payload leaked the party''s contact details';

  -- The arm is CONDITIONALLY PRESENT. A design-services or furnishings bundle
  -- must not carry the key at all — 00412's frozen contract asserts the word
  -- "trade" appears nowhere in a client's document, because on that rail it
  -- means trade COST.
  v_bundle := public.get_client_commercial_document_bundle(
    'd8300000-0000-4000-8000-000000000001');
  ASSERT NOT (v_bundle ? 'tradeScope'),
    'a design-services bundle must not carry a tradeScope key';
  -- Key-set equality rather than a word search: this fixture's own cast and
  -- copy say "trade" all over (design_services_authority_test owns the
  -- word-level contract, on a fixture whose vocabulary is clean). What 00423
  -- must prove here is that it added no key to a non-trade document.
  ASSERT (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(v_bundle) k)
         = ARRAY['document', 'furnishings', 'rates', 'replacement',
                 'serviceTerms', 'signatures'],
    format('a design-services bundle must carry exactly the 00422 key set; got %s',
           (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(v_bundle) k));
  v_bundle := public.get_client_commercial_document_bundle(
    (SELECT value FROM trade_ids WHERE key = 'furnishings'));
  ASSERT NOT (v_bundle ? 'tradeScope'),
    'a furnishings bundle must not carry a tradeScope key';
  ASSERT (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(v_bundle) k)
         = ARRAY['document', 'furnishings', 'rates', 'replacement',
                 'serviceTerms', 'signatures'],
    'a furnishings bundle must carry exactly the 00422 key set';

  -- An outsider gets nothing.
  PERFORM pg_temp.assume_user('d8000000-0000-4000-8000-000000000003');
  BEGIN
    PERFORM public.get_client_commercial_document_bundle(v_scope);
    ASSERT false, 'a stranger must not read a trade scope';
  EXCEPTION WHEN insufficient_privilege THEN v_err := SQLERRM;
  END;
  ASSERT v_err = format('commercial document %s not found or access denied', v_scope),
    format('stranger refusal: %L', v_err);
  PERFORM pg_temp.assume_user('d8000000-0000-4000-8000-000000000001');
END $$;

-- The raw tables are closed to the client: no policy names them.
SELECT set_config('trade.scope', (SELECT value::text FROM trade_ids WHERE key = 'scope1'), true);
SELECT pg_temp.assume_user('d8000000-0000-4000-8000-000000000002');
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_scope uuid := current_setting('trade.scope')::uuid;
BEGIN
  ASSERT (SELECT count(*) FROM public.trade_scope_bids WHERE proposal_id = v_scope) = 0,
    'a client must read zero trade scope bids';
  ASSERT (SELECT count(*) FROM public.trade_scope_terms WHERE proposal_id = v_scope) = 0,
    'a client must read zero trade scope terms rows';
  ASSERT (SELECT count(*) FROM public.trade_scope_sections WHERE proposal_id = v_scope) = 0,
    'a client must read zero trade scope section rows';
  ASSERT (SELECT count(*) FROM public.trade_scope_draws WHERE proposal_id = v_scope) = 0,
    'a client must read zero trade scope draw rows';
END $$;
RESET ROLE;
-- ...and the studio reads all of them.
SELECT pg_temp.assume_user('d8000000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_scope uuid := current_setting('trade.scope')::uuid;
BEGIN
  ASSERT (SELECT count(*) FROM public.trade_scope_bids WHERE proposal_id = v_scope) = 5,
    'the studio reads its own bids';
  ASSERT (SELECT count(*) FROM public.trade_scope_draws WHERE proposal_id = v_scope) = 3,
    'the studio reads its own draw schedule';
END $$;
RESET ROLE;
SELECT pg_temp.assume_user('d8000000-0000-4000-8000-000000000001');

-- ═══════════════════════════════════════════════════════════════════════════
-- (12) FINGERPRINT BYTE-STABILITY. The 'tradeScope' key is CONDITIONALLY
--      present. Every pre-existing document must hash exactly as it did under
--      the 00422 body — pg_temp.fingerprint_00422 above is that body verbatim.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_scope uuid := (SELECT value FROM trade_ids WHERE key = 'scope1');
  v_furnishings uuid := (SELECT value FROM trade_ids WHERE key = 'furnishings');
  v_origin uuid := 'd8300000-0000-4000-8000-000000000001';
BEGIN
  ASSERT public._commercial_document_fingerprint(v_furnishings)
         = pg_temp.fingerprint_00422(v_furnishings),
    'a furnishings authorization must hash exactly as it did before 00423';
  ASSERT public._commercial_document_fingerprint(v_origin)
         = pg_temp.fingerprint_00422(v_origin),
    'a design-services agreement must hash exactly as it did before 00423';
  ASSERT public._commercial_document_fingerprint(v_scope)
         <> pg_temp.fingerprint_00422(v_scope),
    'a trade scope must hash DIFFERENTLY — its terms, sections and draws are part of the signed object';

  -- The stored signature evidence still describes the document it signed.
  ASSERT (SELECT evidence_fingerprint FROM public.commercial_document_signatures
          WHERE proposal_id = v_furnishings AND party_role = 'client')
         = public._commercial_document_fingerprint(v_furnishings),
    'the furnishings signature evidence must still verify';
  ASSERT (SELECT evidence_fingerprint FROM public.commercial_document_signatures
          WHERE proposal_id = v_scope AND party_role = 'client')
         = public._commercial_document_fingerprint(v_scope),
    'the trade scope signature evidence must still verify after the whole journey';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (13) RETIRING A SCOPE. A draft void stays invisible; a sent void becomes a
--      superseded document the client can still read. An executed scope is
--      terminal — its client signed it and its deposit is in the bank.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_project uuid := (SELECT value FROM trade_ids WHERE key = 'project');
  v_kitchen uuid := (SELECT value FROM trade_ids WHERE key = 'kitchen');
  v_scope1 uuid := (SELECT value FROM trade_ids WHERE key = 'scope1');
  v_draft jsonb; v_sent jsonb;
  v_draft_id uuid; v_sent_id uuid;
  v_err text;
BEGIN
  -- An executed scope is not voidable.
  BEGIN
    PERFORM public.void_trade_scope(v_scope1, 'Changed our minds entirely.');
    ASSERT false, 'an executed trade scope must be terminal';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = format('trade scope %s is executed and can no longer be voided', v_scope1),
    format('executed-void refusal: %L', v_err);
  ASSERT (SELECT count(*) FROM public.project_ffe_items
          WHERE trade_scope_document_id = (SELECT value FROM trade_ids WHERE key = 'scope1_doc')) = 2,
    'the refused void must leave the presence lines alone';

  -- A never-sent draft.
  v_draft := public.create_trade_scope(v_project, 'Abandoned tilework');
  v_draft_id := (v_draft->>'proposalId')::uuid;
  INSERT INTO trade_ids VALUES ('scope_draft', v_draft_id);
  BEGIN
    PERFORM public.void_trade_scope(v_draft_id, 'no');
    ASSERT false, 'a void needs a real reason';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'voiding a trade scope requires a reason of at least 5 characters',
    format('void reason refusal: %L', v_err);
  PERFORM public.void_trade_scope(v_draft_id, 'Client dropped the tile package.');
  ASSERT (SELECT commercial_state FROM public.proposals WHERE id = v_draft_id) = 'superseded'
     AND (SELECT status FROM public.proposals WHERE id = v_draft_id) = 'draft'
     AND (SELECT sent_at IS NULL FROM public.proposals WHERE id = v_draft_id),
    'voiding writes commercial_state and deliberately leaves status alone';

  -- A sent one.
  v_sent := public.create_trade_scope(v_project, 'Superseded plaster');
  v_sent_id := (v_sent->>'proposalId')::uuid;
  INSERT INTO trade_ids VALUES ('scope_sent', v_sent_id);
  PERFORM public.set_trade_scope_party(v_sent_id, 'd8800000-0000-4000-8000-000000000001');
  UPDATE public.trade_scope_terms SET client_price_cents = 100000
  WHERE proposal_id = v_sent_id;
  INSERT INTO public.trade_scope_sections (
    proposal_id, project_room_id, room_name, prose, sort_order
  ) VALUES (v_sent_id, v_kitchen, 'Kitchen', 'Venetian plaster to the hood surround.', 0);
  INSERT INTO public.trade_scope_draws (
    proposal_id, label, percentage, amount_cents, sort_order, gates_on_acceptance
  ) VALUES
    (v_sent_id, 'Deposit', 50, 50000, 0, false),
    (v_sent_id, 'Acceptance', 50, 50000, 1, true);
  PERFORM public.send_commercial_document(
    v_sent_id, public._commercial_document_fingerprint(v_sent_id), NULL, NULL);
  PERFORM public.void_trade_scope(v_sent_id, 'Replaced by a limewash package.');
  ASSERT (SELECT commercial_state FROM public.proposals WHERE id = v_sent_id) = 'superseded'
     AND (SELECT sent_at IS NOT NULL FROM public.proposals WHERE id = v_sent_id),
    'a voided sent scope keeps its issue date';
END $$;

-- The client's side of the void.
DO $$
DECLARE
  v_draft_id uuid := (SELECT value FROM trade_ids WHERE key = 'scope_draft');
  v_sent_id uuid := (SELECT value FROM trade_ids WHERE key = 'scope_sent');
  v_bundle jsonb;
  v_list jsonb;
  v_err text;
BEGIN
  PERFORM pg_temp.assume_user('d8000000-0000-4000-8000-000000000002');
  BEGIN
    PERFORM public.get_client_commercial_document_bundle(v_draft_id);
    ASSERT false, 'a voided never-sent draft must stay invisible to the client';
  EXCEPTION WHEN insufficient_privilege THEN v_err := SQLERRM;
  END;
  ASSERT v_err = format('commercial document %s not found or access denied', v_draft_id),
    format('voided-draft refusal: %L', v_err);

  v_bundle := public.get_client_commercial_document_bundle(v_sent_id);
  ASSERT v_bundle->'document'->>'commercialState' = 'superseded'
     AND (v_bundle->'document'->>'supersededAt') IS NOT NULL,
    'a voided sent scope is readable and says so';

  -- list_client_proposals is kind-generic and answers with the commercial
  -- binding's project, so a trade scope reaches the awaiting cards.
  v_list := public.list_client_proposals();
  ASSERT EXISTS (SELECT 1 FROM jsonb_array_elements(v_list) e
                 WHERE (e->>'id')::uuid = (SELECT value FROM trade_ids WHERE key = 'scope1')
                   AND e->>'document_kind' = 'trade_scope'
                   AND (e->>'project_id')::uuid = (SELECT value FROM trade_ids WHERE key = 'project')
                   AND (e->>'total_amount')::numeric = 900000),
    'REGRESSION: list_client_proposals must carry the trade scope, its binding and its price';
  ASSERT NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_list) e
                     WHERE (e->>'id')::uuid = v_draft_id),
    'a voided never-sent draft must not appear in the client list';
  PERFORM pg_temp.assume_user('d8000000-0000-4000-8000-000000000001');
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (14) THE READS — the studio's companion list, and the client's plan.
-- ═══════════════════════════════════════════════════════════════════════════

-- Numbering keys on (bound_at, id). bound_at defaults to now(), which is the
-- TRANSACTION timestamp — so every instrument minted inside this suite shares
-- one clock and the tie-break falls to a random uuid. Three real scopes are
-- bound at three different moments; stamping them here makes the assertion below
-- a test of the numbering RULE rather than of uuid luck.
UPDATE public.project_commercial_documents SET bound_at = now()
WHERE proposal_id = (SELECT value FROM trade_ids WHERE key = 'scope1');
UPDATE public.project_commercial_documents SET bound_at = now() + interval '1 hour'
WHERE proposal_id = (SELECT value FROM trade_ids WHERE key = 'scope_draft');
UPDATE public.project_commercial_documents SET bound_at = now() + interval '2 hours'
WHERE proposal_id = (SELECT value FROM trade_ids WHERE key = 'scope_sent');

DO $$
DECLARE
  v_project uuid := (SELECT value FROM trade_ids WHERE key = 'project');
  v_scope1 uuid := (SELECT value FROM trade_ids WHERE key = 'scope1');
  v_kitchen uuid := (SELECT value FROM trade_ids WHERE key = 'kitchen');
  v_bath uuid := (SELECT value FROM trade_ids WHERE key = 'bath');
  v_list jsonb;
  v_first jsonb;
  v_err text;
BEGIN
  v_list := public.list_trade_scopes(v_project);
  ASSERT jsonb_array_length(v_list) = 3,
    format('every trade scope on the project, voided ones included: %s',
           jsonb_array_length(v_list));
  v_first := v_list->0;
  ASSERT (v_first->>'proposalId')::uuid = v_scope1
     AND (v_first->>'number')::integer = 1
     AND v_first->>'title' = 'Kitchen and bath millwork'
     AND v_first->>'state' = 'executed'
     AND v_first->>'progressState' = 'accepted'
     AND v_first->>'partyDisplayName' = 'Hollis Millwork'
     AND (v_first->>'clientPriceCents')::integer = 900000
     AND (v_first->>'depositInvoiceId')::uuid = (SELECT value FROM trade_ids WHERE key = 'deposit')
     AND (v_first->>'depositPaid')::boolean
     AND (v_first->>'depositPaidCents')::integer = 360000
     AND (v_first->>'sectionCount')::integer = 2,
    format('list_trade_scopes shape: %s', v_first::text);
  ASSERT jsonb_array_length(v_first->'draws') = 3
     AND (v_first->'draws'->0->>'label') = 'Deposit'
     AND (v_first->'draws'->0->>'invoiceStatus') = 'paid'
     AND (v_first->'draws'->2->>'gatesOnAcceptance')::boolean,
    'the draw summary rides along';
  ASSERT (v_first->'sectionRoomIds') @> to_jsonb(v_kitchen)
     AND (v_first->'sectionRoomIds') @> to_jsonb(v_bath),
    'the covered rooms are named';
  ASSERT (v_list->1->>'number')::integer = 2 AND (v_list->2->>'number')::integer = 3,
    'numbering follows binding order and voided scopes still spend their number';
  ASSERT NOT (v_list::text ~* 'bid'),
    'the studio list still does not project the bid ledger';

  -- Studio-only.
  PERFORM pg_temp.assume_user('d8000000-0000-4000-8000-000000000002');
  BEGIN
    PERFORM public.list_trade_scopes(v_project);
    ASSERT false, 'list_trade_scopes is a studio companion read';
  EXCEPTION WHEN insufficient_privilege THEN v_err := SQLERRM;
  END;
  ASSERT v_err = format('project %s not found or access denied', v_project),
    format('client list refusal: %L', v_err);
  PERFORM pg_temp.assume_user('d8000000-0000-4000-8000-000000000001');
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (15) THE CLIENT'S PLAN — trade entries alongside the furnishings ones, and
--      the furnishings keys untouched.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_project uuid := (SELECT value FROM trade_ids WHERE key = 'project');
  v_kitchen uuid := (SELECT value FROM trade_ids WHERE key = 'kitchen');
  v_selections jsonb;
  v_trade jsonb;
  v_furn jsonb;
BEGIN
  PERFORM pg_temp.assume_user('d8000000-0000-4000-8000-000000000002');
  v_selections := public.get_client_project_selections(v_project);
  ASSERT v_selections->>'origin' = 'commercial', 'the project is commercial';

  SELECT e INTO v_furn FROM jsonb_array_elements(v_selections->'selections') e
  WHERE e->>'kind' = 'furnishings' AND e->>'name' = 'Counter stool';
  ASSERT v_furn IS NOT NULL, 'REGRESSION: the furnishings entries survive';
  ASSERT v_furn ? 'quantity' AND v_furn ? 'clientUnitPriceCents'
     AND v_furn ? 'clientLineTotalCents' AND v_furn ? 'allowance'
     AND v_furn ? 'instrument' AND v_furn ? 'productId' AND v_furn ? 'imageUrl'
     AND v_furn ? 'docCode' AND v_furn ? 'roomName' AND v_furn ? 'status',
    'REGRESSION: every furnishings key the 00422 read projected is still there';
  ASSERT (v_furn->'instrument'->>'proposalId')::uuid
         = (SELECT value FROM trade_ids WHERE key = 'furnishings'),
    'the furnishings instrument names its proposal, symmetrically with trade';
  ASSERT (v_furn->>'clientLineTotalCents')::integer = 120000
     AND v_furn->>'roomName' = 'Kitchen',
    'REGRESSION: the furnishings figures are unchanged';

  SELECT e INTO v_trade FROM jsonb_array_elements(v_selections->'selections') e
  WHERE e->>'kind' = 'trade' AND (e->>'roomId')::uuid = v_kitchen;
  ASSERT v_trade IS NOT NULL, 'the trade presence line reaches the client plan';
  ASSERT v_trade->>'name' = 'Kitchen and bath millwork — Kitchen'
     AND v_trade->>'roomName' = 'Kitchen'
     AND (v_trade->>'clientLineTotalCents')::integer = 600000
     AND v_trade->>'tradeJourney' = 'accepted'
     AND (v_trade->'instrument'->>'documentId')::uuid
         = (SELECT value FROM trade_ids WHERE key = 'scope1_doc')
     AND v_trade->'instrument'->>'name' = 'Kitchen and bath millwork',
    format('trade selection shape: %s', v_trade::text);
  -- The instrument must name its PROPOSAL, not only its project binding.
  -- accept_trade_scope and get_client_commercial_document_bundle are both
  -- p_proposal_id-keyed, and documentId is the binding's id, which no RPC takes.
  -- Without proposalId the client can be shown a scope that is substantially
  -- complete and have no way to reach the one act that is theirs — accepting the
  -- work, which is what unlocks the acceptance-gated final draw.
  ASSERT (v_trade->'instrument'->>'proposalId')::uuid
         = (SELECT value FROM trade_ids WHERE key = 'scope1'),
    format('the trade instrument must name its proposal: %s',
           v_trade->'instrument');
  ASSERT (SELECT bool_and(e->'instrument' ? 'proposalId')
          FROM jsonb_array_elements(v_selections->'selections') e),
    'every selection entry, either kind, must name the proposal its instrument is';
  ASSERT (SELECT sum((e->>'clientLineTotalCents')::integer)
          FROM jsonb_array_elements(v_selections->'selections') e
          WHERE e->>'kind' = 'trade') = 900000,
    'the trade entries sum to the client price';
  ASSERT v_selections::text !~* 'trade_price|markup|purchase_order|vendor',
    format('client selections leaked trade-side vocabulary: %L',
           substring(v_selections::text from 1 for 400));
  PERFORM pg_temp.assume_user('d8000000-0000-4000-8000-000000000001');
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (16) THE UNALLOCATED SCOPE. When the studio apportions nothing, the whole
--      price rides on the FIRST section and the rest carry zero — so the plan
--      still sums to one price, not to a multiple of it.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_project uuid := (SELECT value FROM trade_ids WHERE key = 'project');
  v_kitchen uuid := (SELECT value FROM trade_ids WHERE key = 'kitchen');
  v_bath uuid := (SELECT value FROM trade_ids WHERE key = 'bath');
  v_scope jsonb; v_scope_id uuid; v_doc uuid;
  v_exec jsonb; v_engaged jsonb;
BEGIN
  v_scope := public.create_trade_scope(v_project, 'House-wide painting');
  v_scope_id := (v_scope->>'proposalId')::uuid;
  v_doc := (v_scope->>'documentId')::uuid;
  PERFORM public.set_trade_scope_party(v_scope_id, 'd8800000-0000-4000-8000-000000000002');
  UPDATE public.trade_scope_terms SET client_price_cents = 400000
  WHERE proposal_id = v_scope_id;
  INSERT INTO public.trade_scope_sections (
    proposal_id, project_room_id, room_name, prose, sort_order
  ) VALUES
    (v_scope_id, v_kitchen, 'Kitchen', 'Two coats, eggshell, trim in satin.', 0),
    (v_scope_id, v_bath, 'Primary bath', 'Two coats, semi-gloss throughout.', 1);
  INSERT INTO public.trade_scope_draws (
    proposal_id, label, percentage, amount_cents, sort_order, gates_on_acceptance
  ) VALUES
    (v_scope_id, 'Mobilization', 50, 200000, 0, false),
    (v_scope_id, 'Acceptance', 50, 200000, 1, true);

  PERFORM public.send_commercial_document(
    v_scope_id, public._commercial_document_fingerprint(v_scope_id), NULL, NULL);
  PERFORM pg_temp.assume_user('d8000000-0000-4000-8000-000000000002');
  v_exec := public.execute_trade_scope(v_scope_id, 'Trade Client');
  PERFORM pg_temp.assume_user('d8000000-0000-4000-8000-000000000001');
  PERFORM public.record_invoice_payment(
    (v_exec->>'depositInvoiceId')::uuid, 200000, 'check', 'PAINT-DEP', now(), NULL);
  v_engaged := public.engage_trade_scope(v_scope_id);
  ASSERT (v_engaged->>'presenceLineCount')::integer = 2, 'two rooms, two presence lines';
  ASSERT (SELECT line_total_cents FROM public.project_ffe_items
          WHERE trade_scope_document_id = v_doc AND project_room_id = v_kitchen) = 400000,
    'the first section carries the whole unallocated price';
  ASSERT (SELECT line_total_cents FROM public.project_ffe_items
          WHERE trade_scope_document_id = v_doc AND project_room_id = v_bath) = 0,
    'the remaining sections carry zero';
  ASSERT (SELECT sum(line_total_cents) FROM public.project_ffe_items
          WHERE trade_scope_document_id = v_doc) = 400000,
    'an unallocated scope still sums to exactly one price';
  ASSERT (SELECT count(*) FROM public.project_ffe_items
          WHERE trade_scope_document_id = v_doc
            AND unit_price_cents = line_total_cents) = 2,
    'quantity is one, so unit price and line total agree';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (17) THE DEPOSIT DRAW. Two rules the walk above never reaches, both about the
--      one draw that is billed by machinery rather than by a studio act: the
--      draw billed at signature may never be the one that gates on acceptance,
--      and a voided deposit invoice that is re-issued must take the binding's
--      deposit pointer with it — or the client can pay in full and the scope can
--      never be engaged, on any surface, ever.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_project uuid := (SELECT value FROM trade_ids WHERE key = 'project');
  v_kitchen uuid := (SELECT value FROM trade_ids WHERE key = 'kitchen');
  v_scope jsonb;
  v_scope_id uuid;
BEGIN
  v_scope := public.create_trade_scope(v_project, 'Stair rail metalwork');
  v_scope_id := (v_scope->>'proposalId')::uuid;
  INSERT INTO trade_ids VALUES
    ('scope4', v_scope_id), ('scope4_doc', (v_scope->>'documentId')::uuid);
  PERFORM public.set_trade_scope_party(
    v_scope_id, 'd8800000-0000-4000-8000-000000000001');
  UPDATE public.trade_scope_terms SET client_price_cents = 200000
  WHERE proposal_id = v_scope_id;
  INSERT INTO public.trade_scope_sections (
    proposal_id, project_room_id, room_name, prose, sort_order
  ) VALUES (
    v_scope_id, v_kitchen, 'Kitchen',
    'Blackened steel rail with a walnut cap, welded on site.', 0
  );
  INSERT INTO public.trade_scope_draws (
    proposal_id, label, percentage, amount_cents, sort_order, gates_on_acceptance
  ) VALUES
    (v_scope_id, 'Deposit', 50, 100000, 0, false),
    (v_scope_id, 'Acceptance', 50, 100000, 1, true);
END $$;
INSERT INTO trade_ids (key, value)
SELECT 'scope4_draw' || (w.sort_order + 1)::text, w.id
FROM public.trade_scope_draws w
WHERE w.proposal_id = (SELECT value FROM trade_ids WHERE key = 'scope4');

-- While it is STILL A DRAFT: invoice_id is machine-owned here too. Authoring a
-- draw says what the client will be asked for and when; it never says which
-- invoice already asked. The target below is scope one's real, fully PAID
-- deposit invoice — a uuid this studio legitimately holds — which is exactly
-- what makes the pre-link worth refusing: it survives the send untouched (the
-- fingerprint deliberately excludes invoice_id), it satisfies
-- issue_trade_draw_invoice's "every lower draw paid" gate without that draw ever
-- being billed, and the client's own executed document would report an unbilled
-- draw as paid. Both writes are refused, so neither needs a savepoint.
DO $$
DECLARE
  v_scope uuid := (SELECT value FROM trade_ids WHERE key = 'scope4');
  v_draw2 uuid := (SELECT value FROM trade_ids WHERE key = 'scope4_draw2');
  v_paid uuid := (SELECT value FROM trade_ids WHERE key = 'deposit');
  v_err text;
BEGIN
  ASSERT (SELECT status FROM public.proposals WHERE id = v_scope) = 'draft',
    'this block only means something while the scope is still a draft';
  ASSERT (SELECT status FROM public.invoices WHERE id = v_paid) = 'paid',
    'the pre-link target must be a genuinely paid invoice';

  BEGIN
    UPDATE public.trade_scope_draws SET invoice_id = v_paid WHERE id = v_draw2;
    ASSERT false, 'a draft draw must not be pre-linked to an invoice';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'trade scope draw billing may only change through its canonical RPC',
    format('draft pre-link refusal: %L', v_err);

  BEGIN
    INSERT INTO public.trade_scope_draws (
      proposal_id, label, amount_cents, sort_order, invoice_id
    ) VALUES (v_scope, 'Pre-billed', 1000, 8, v_paid);
    ASSERT false, 'a draw must not be minted already carrying an invoice';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'a trade scope draw is minted unbilled; its invoice is stamped by the canonical billing RPC',
    format('pre-billed mint refusal: %L', v_err);

  ASSERT (SELECT count(*) FROM public.trade_scope_draws WHERE proposal_id = v_scope) = 2
     AND (SELECT count(*) FROM public.trade_scope_draws
          WHERE proposal_id = v_scope AND invoice_id IS NOT NULL) = 0,
    'the refused writes must leave the draft schedule exactly as it was';
END $$;

-- ...and the canonical billing path is untouched by that rule: the scope sends,
-- executes, and stamps its deposit draw exactly as every scope above did.
DO $$
DECLARE v_scope uuid := (SELECT value FROM trade_ids WHERE key = 'scope4');
BEGIN
  PERFORM public.send_commercial_document(
    v_scope, public._commercial_document_fingerprint(v_scope), NULL, NULL);
END $$;

-- The execute rail refuses a gated first draw on its own, even though the send
-- gate should have made the state unreachable. The post-send freeze is suspended
-- ONLY to construct that state; it is back in place before execution is
-- attempted, so what is proven is the execute rail's own assertion.
SAVEPOINT execute_gated_deposit;
ALTER TABLE public.trade_scope_draws DISABLE TRIGGER guard_trade_scope_draws_trg;
UPDATE public.trade_scope_draws SET gates_on_acceptance = true
WHERE id = (SELECT value FROM trade_ids WHERE key = 'scope4_draw1');
ALTER TABLE public.trade_scope_draws ENABLE TRIGGER guard_trade_scope_draws_trg;
DO $$
DECLARE
  v_scope uuid := (SELECT value FROM trade_ids WHERE key = 'scope4');
  v_err text;
BEGIN
  PERFORM pg_temp.assume_user('d8000000-0000-4000-8000-000000000002');
  BEGIN
    PERFORM public.execute_trade_scope(v_scope, 'Trade Client');
    ASSERT false, 'a deposit draw that gates on acceptance must not be billed at signature';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'the trade scope deposit draw gates on acceptance and cannot be billed at signature',
    format('gated-deposit execute refusal: %L', v_err);
  ASSERT (SELECT commercial_state FROM public.proposals WHERE id = v_scope) = 'sent'
     AND NOT EXISTS (SELECT 1 FROM public.commercial_document_signatures
                     WHERE proposal_id = v_scope),
    'the refused execution must leave the scope unsigned and unbilled';
  PERFORM pg_temp.assume_user('d8000000-0000-4000-8000-000000000001');
END $$;
ROLLBACK TO SAVEPOINT execute_gated_deposit;

-- The blessed correction: void the deposit invoice, re-issue draw one, and the
-- binding follows. Section 9 only ever voided the LAST draw, so this path — the
-- one that decides whether the scope can ever be engaged — was never walked.
DO $$
DECLARE
  v_scope uuid := (SELECT value FROM trade_ids WHERE key = 'scope4');
  v_doc uuid := (SELECT value FROM trade_ids WHERE key = 'scope4_doc');
  v_draw1 uuid := (SELECT value FROM trade_ids WHERE key = 'scope4_draw1');
  v_exec jsonb;
  v_first uuid;
  v_reissued jsonb;
  v_engaged jsonb;
BEGIN
  PERFORM pg_temp.assume_user('d8000000-0000-4000-8000-000000000002');
  v_exec := public.execute_trade_scope(v_scope, 'Trade Client');
  PERFORM pg_temp.assume_user('d8000000-0000-4000-8000-000000000001');
  v_first := (v_exec->>'depositInvoiceId')::uuid;
  ASSERT (SELECT deposit_invoice_id FROM public.project_commercial_documents
          WHERE id = v_doc) = v_first,
    'the binding starts on the deposit invoice execution issued';

  PERFORM public.void_invoice(v_first, 'Billed to the wrong address.');
  ASSERT (SELECT status FROM public.invoices WHERE id = v_first) = 'void',
    'the deposit invoice is voided';

  v_reissued := public.issue_trade_draw_invoice(v_draw1);
  ASSERT (v_reissued->>'invoiceId')::uuid <> v_first
     AND (v_reissued->>'amountCents')::integer = 100000,
    'a voided deposit frees its draw to be billed again';
  ASSERT (SELECT invoice_id FROM public.trade_scope_draws WHERE id = v_draw1)
         = (v_reissued->>'invoiceId')::uuid,
    're-issuing re-stamps the draw';
  ASSERT (SELECT deposit_invoice_id FROM public.project_commercial_documents
          WHERE id = v_doc) = (v_reissued->>'invoiceId')::uuid,
    'the binding must follow the deposit draw onto its new invoice';

  -- Which is the whole point: paying the corrected deposit engages the scope.
  PERFORM public.record_invoice_payment(
    (v_reissued->>'invoiceId')::uuid, 100000, 'check', 'RAIL-DEP-2', now(), NULL);
  v_engaged := public.engage_trade_scope(v_scope);
  ASSERT (v_engaged->>'newlyEngaged')::boolean
     AND v_engaged->>'progressState' = 'engaged',
    'a client who pays the corrected deposit must be able to have the scope engaged';
  ASSERT (SELECT count(*) FROM public.project_ffe_items
          WHERE trade_scope_document_id = v_doc) = 1,
    'engagement mints the presence line a stale deposit pointer would have withheld';

  -- And every deposit readout agrees with the money actually collected.
  ASSERT (SELECT (e->>'depositPaid')::boolean AND (e->>'depositPaidCents')::integer = 100000
          FROM jsonb_array_elements(public.list_trade_scopes(
            (SELECT value FROM trade_ids WHERE key = 'project'))) e
          WHERE (e->>'proposalId')::uuid = v_scope),
    'the studio list must report the corrected deposit as paid';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (18) THE TABLE EDGE STATES ITS OWN AUTHORITY. The four trade tables are
--      design-studio-only, and their policies say so themselves rather than
--      leaning on public.proposals to say it for them. Under the looser
--      is_studio_comember predicate a peer sharing ANY organization — a
--      contractor org, a manufacturer org — matches, and these policies are FOR
--      ALL: that peer would hold read AND write on the bid ledger, which is the
--      studio's buying position across competing subs. What kept them out was
--      incidental — the policy's EXISTS reaches through proposals, whose SELECT
--      policy is the stricter predicate. So this section removes the incidental
--      cover and asks the trade policies directly.
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
) VALUES
  ('d8000000-0000-4000-8000-000000000004', 'trade-contractor@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES ('d8000000-0000-4000-8000-000000000004', 'trade-contractor@test.invalid',
        'Trade Contractor Peer', false, now(), now())
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.organizations (id, type, name, slug, status)
VALUES ('d8100000-0000-4000-8000-000000000002', 'contractor',
        'Shared Contractor Org', 'trade-scope-contractor', 'active');
SELECT pg_temp.assume_user('d8000000-0000-4000-8000-000000000001', 'service_role');
INSERT INTO public.organization_members (
  id, user_id, organization_id, role, status, joined_at
) VALUES
  ('d8110000-0000-4000-8000-000000000002', 'd8000000-0000-4000-8000-000000000001',
   'd8100000-0000-4000-8000-000000000002', 'member', 'active', now()),
  ('d8110000-0000-4000-8000-000000000003', 'd8000000-0000-4000-8000-000000000004',
   'd8100000-0000-4000-8000-000000000002', 'member', 'active', now());

-- The peer really does match the loose predicate and really does not match the
-- strict one — otherwise the zeroes below would prove nothing at all.
SELECT pg_temp.assume_user('d8000000-0000-4000-8000-000000000004');
DO $$
BEGIN
  ASSERT public.is_studio_comember('d8000000-0000-4000-8000-000000000001'),
    'the contractor peer must match the loose shared-organization predicate';
  ASSERT NOT public.is_design_studio_comember('d8000000-0000-4000-8000-000000000001'),
    'the contractor peer must NOT match the design-studio predicate';
END $$;

SAVEPOINT open_proposals_read;
CREATE POLICY trade_scope_test_open_proposals ON public.proposals
  FOR SELECT TO authenticated USING (true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_scope uuid := current_setting('trade.scope')::uuid;
BEGIN
  ASSERT (SELECT count(*) FROM public.proposals WHERE id = v_scope) = 1,
    'the permissive proposals policy must really be in force, or the zeroes below prove nothing';
  ASSERT (SELECT count(*) FROM public.trade_scope_bids WHERE proposal_id = v_scope) = 0,
    'a contractor-org peer must read zero bids even with proposals wide open';
  ASSERT (SELECT count(*) FROM public.trade_scope_terms WHERE proposal_id = v_scope) = 0,
    'a contractor-org peer must read zero terms rows';
  ASSERT (SELECT count(*) FROM public.trade_scope_sections WHERE proposal_id = v_scope) = 0,
    'a contractor-org peer must read zero section rows';
  ASSERT (SELECT count(*) FROM public.trade_scope_draws WHERE proposal_id = v_scope) = 0,
    'a contractor-org peer must read zero draw rows';
END $$;
RESET ROLE;
-- ...and the studio itself still reads them, under the same open policy, so the
-- zeroes above are the trade predicate and not a broken fixture.
SELECT pg_temp.assume_user('d8000000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_scope uuid := current_setting('trade.scope')::uuid;
BEGIN
  ASSERT (SELECT count(*) FROM public.trade_scope_bids WHERE proposal_id = v_scope) = 5
     AND (SELECT count(*) FROM public.trade_scope_draws WHERE proposal_id = v_scope) = 3,
    'the owning studio still reads its own bids and draws';
END $$;
RESET ROLE;
ROLLBACK TO SAVEPOINT open_proposals_read;
SELECT pg_temp.assume_user('d8000000-0000-4000-8000-000000000001');

SELECT 'trade_scope_test: PASS' AS result;

ROLLBACK;
