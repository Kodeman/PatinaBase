-- ═══════════════════════════════════════════════════════════════════════════
-- 00578 — Turnkey: the design-build class.
-- Runner: plain psql, ON_ERROR_STOP=1. Single transaction, ROLLBACK at the end.
-- Run:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f supabase/tests/commercial/design_build_test.sql
--
-- What this file exists to prove (build sheet §5, SQL-T1 … SQL-T15):
--   T1  The kind widening landed on BOTH CHECKs, and a junk value is still
--       refused. The constraint is probed, not the ledger.
--   T2  Origin-agreement readers learn the kind — every widened reader answers
--       for an executed design_build project.
--   T3  billing_cadence 'per_draw' is accepted on the terms row AND on the
--       authority, and a countersigned turnkey agreement produces one.
--   T4  The template is not selectable without a LIVE attestation.
--   T5  The draws must sum to the contract sum, to the cent.
--   T6  The Halvorsen arithmetic, cent for cent, including the closing
--       identity. Integer equality throughout — never a float comparison.
--   T7  Draw ordering: no draw 2 before draw 1 is paid, no release before
--       every draw is paid, no re-issue over a live invoice, and a re-issue
--       after a void.
--   T8  P13's state gate: the deposit issues at client_signed, everything
--       else waits for executed.
--   T9  The six notices stay dark, and a disabled one cannot be sent.
--   T10 No double count, refused at BOTH doors with the same sentence.
--   T11 The fingerprint still covers everything the client reads (RC-8):
--       moving one draw amount inside the part payload moves the hash.
--   T12 ACL: anon holds EXECUTE on none of the wave's new functions and each
--       grantee tuple is exactly what the migration wrote.
--   T13 The signature path end to end (D-W3-3): the RPC does not raise, the
--       row lands, and the countersignature follows.
--   T14 The retainer anchor: a turnkey agreement carrying a retainer part
--       countersigns without 'issue_invoice: invoice not found or access
--       denied', and the anchor count resolves to exactly one.
--   T15 The origin motif, ONE ASSERT PER FUNCTION — the group where a single
--       missed graft hides.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id uuid, p_role text DEFAULT 'authenticated')
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_user_id, 'role', p_role
  )::text, true);
END;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.assume_user(uuid, text) TO PUBLIC;

CREATE OR REPLACE FUNCTION pg_temp.assume_role(p_user_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_temp.assume_user(p_user_id);
  EXECUTE 'SET LOCAL ROLE authenticated';
END;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.assume_role(uuid) TO PUBLIC;

CREATE OR REPLACE FUNCTION pg_temp.reset_role()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE 'RESET ROLE';
END;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.reset_role() TO PUBLIC;

CREATE OR REPLACE FUNCTION pg_temp.send_agreement(p_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_snapshot jsonb;
BEGIN
  v_snapshot := public.get_commercial_document_send_snapshot(p_id);
  PERFORM public.send_commercial_document(
    p_id, v_snapshot->>'documentFingerprint', NULL, TIMESTAMPTZ '2028-06-01 00:00:00+00'
  );
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.send_agreement(uuid) TO PUBLIC;

CREATE OR REPLACE FUNCTION pg_temp.send_err(p_id uuid)
RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_temp.send_agreement(p_id);
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN SQLERRM;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.send_err(uuid) TO PUBLIC;

CREATE OR REPLACE FUNCTION pg_temp.save_err(p_id uuid, p_parts jsonb)
RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.upsert_agreement_parts(p_id, p_parts, NULL);
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN SQLERRM;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.save_err(uuid, jsonb) TO PUBLIC;

CREATE OR REPLACE FUNCTION pg_temp.draw_err(p_id uuid, p_key text)
RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.issue_agreement_draw_invoice(p_id, p_key);
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN SQLERRM;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.draw_err(uuid, text) TO PUBLIC;

CREATE OR REPLACE FUNCTION pg_temp.pay_invoice(p_invoice_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.invoices
  SET status = 'paid', amount_paid_cents = total_cents, paid_at = now()
  WHERE id = p_invoice_id;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.pay_invoice(uuid) TO PUBLIC;

-- ═══════════════════════════════════════════════════════════════════════════
-- THE HALVORSEN FIXTURE — research 02 §8 / source/fixtures.json, in cents.
-- Every number below is stated once, here, and every later assertion reads it
-- from this table rather than retyping it.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TEMP TABLE _db_money (label text PRIMARY KEY, cents bigint NOT NULL)
  ON COMMIT DROP;
INSERT INTO _db_money VALUES
  ('cost_basis', 7130000), ('fee', 1283400), ('gmp', 8413400),
  ('sov_cabinetry', 4484000), ('sov_electrical', 1121000),
  ('sov_plumbing', 849600), ('sov_general', 743400),
  ('sov_tile', 472000), ('sov_fixtures', 413000), ('sov_lighting', 330400),
  ('draw1_gross', 841340), ('draw2_gross', 2524020),
  ('draw3_gross', 3365360), ('draw4_gross', 1682680),
  ('draw1_ret', 0), ('draw2_ret', 126201),
  ('draw3_ret', 168268), ('draw4_ret', 84134),
  ('draw1_net', 841340), ('draw2_net', 2397819),
  ('draw3_net', 3197092), ('draw4_net', 1598546),
  ('release', 378603);

CREATE OR REPLACE FUNCTION pg_temp.m(p_label text)
RETURNS bigint LANGUAGE sql STABLE AS $$
  SELECT cents FROM _db_money WHERE label = p_label;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.m(text) TO PUBLIC;

CREATE OR REPLACE FUNCTION pg_temp.pricing_basis()
RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object(
    'basis', 'cost_plus_gmp',
    'feeBps', 1800,
    'subMarkupBps', 0,
    'costBasisCents', pg_temp.m('cost_basis'),
    'gmpCents', pg_temp.m('gmp'),
    'costLines', jsonb_build_array(
      jsonb_build_object('id', 'cabinetry', 'label', 'Cabinetry & millwork',
                         'category', 'sub', 'basisCents', 3800000),
      jsonb_build_object('id', 'electrical', 'label', 'Electrical',
                         'category', 'sub', 'basisCents', 950000),
      jsonb_build_object('id', 'plumbing', 'label', 'Plumbing',
                         'category', 'sub', 'basisCents', 720000),
      jsonb_build_object('id', 'general', 'label', 'General conditions / site',
                         'category', 'general_conditions', 'basisCents', 630000),
      jsonb_build_object('id', 'tile', 'label', 'Tile allowance',
                         'category', 'allowance', 'basisCents', 400000),
      jsonb_build_object('id', 'fixtures', 'label', 'Plumbing fixtures allowance',
                         'category', 'allowance', 'basisCents', 350000),
      jsonb_build_object('id', 'lighting', 'label', 'Lighting allowance',
                         'category', 'allowance', 'basisCents', 280000)));
$$;
GRANT EXECUTE ON FUNCTION pg_temp.pricing_basis() TO PUBLIC;

CREATE OR REPLACE FUNCTION pg_temp.draws()
RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object(
    'retainageBps', 500,
    'draws', jsonb_build_array(
      jsonb_build_object('key', 'deposit', 'label', 'Deposit at signing',
                         'pct', 10, 'sortOrder', 1, 'retainageApplies', false),
      jsonb_build_object('key', 'rough_in', 'label', 'Rough-in',
                         'pct', 30, 'sortOrder', 2, 'retainageApplies', true),
      jsonb_build_object('key', 'cabinets_set', 'label', 'Cabinets set',
                         'pct', 40, 'sortOrder', 3, 'retainageApplies', true),
      jsonb_build_object('key', 'substantial', 'label', 'Substantial completion',
                         'pct', 20, 'sortOrder', 4, 'retainageApplies', true)));
$$;
GRANT EXECUTE ON FUNCTION pg_temp.draws() TO PUBLIC;

CREATE OR REPLACE FUNCTION pg_temp.allowances()
RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object('allowances', jsonb_build_array(
    jsonb_build_object('id', 'tile', 'label', 'Tile allowance',
                       'amountCents', 400000, 'overageRule', 'change_order',
                       'underageRule', 'credit'),
    jsonb_build_object('id', 'fixtures', 'label', 'Plumbing fixtures allowance',
                       'amountCents', 350000, 'overageRule', 'change_order',
                       'underageRule', 'credit'),
    jsonb_build_object('id', 'lighting', 'label', 'Lighting allowance',
                       'amountCents', 280000, 'overageRule', 'change_order',
                       'underageRule', 'credit')));
$$;
GRANT EXECUTE ON FUNCTION pg_temp.allowances() TO PUBLIC;

-- The ten-part turnkey set, filled. p_extra rides on the end so a case can add
-- a retainer or a supervision fee without restating the nine.
CREATE OR REPLACE FUNCTION pg_temp.turnkey_parts(
  p_basis jsonb DEFAULT NULL, p_draws jsonb DEFAULT NULL,
  p_extra jsonb DEFAULT '[]'::jsonb)
RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_array(
    jsonb_build_object('kind', 'schedule', 'variant', 'pricing_basis',
      'partKey', 'patina.pricing_basis', 'title', 'Pricing basis',
      'required', true, 'clientVisible', true,
      'payload', COALESCE(p_basis, pg_temp.pricing_basis())),
    jsonb_build_object('kind', 'schedule', 'variant', 'draws',
      'partKey', 'patina.draws', 'title', 'Draw schedule',
      'required', true, 'clientVisible', true,
      'payload', COALESCE(p_draws, pg_temp.draws())),
    jsonb_build_object('kind', 'schedule', 'variant', 'allowances',
      'partKey', 'patina.allowances', 'title', 'Allowances',
      'clientVisible', true, 'payload', pg_temp.allowances()),
    jsonb_build_object('kind', 'clause', 'partKey', 'patina.sub_disclosure',
      'title', 'Who does the work', 'required', true, 'clientVisible', true,
      'payload', jsonb_build_object('mode', 'closed_book',
        'body', 'The studio engages and directs the trades.')),
    jsonb_build_object('kind', 'clause', 'partKey', 'patina.supervision_fee',
      'title', 'Supervision', 'required', true, 'clientVisible', true,
      'payload', jsonb_build_object('body', 'The studio supervises the trades.')),
    jsonb_build_object('kind', 'clause', 'partKey', 'patina.change_orders',
      'title', 'Change orders', 'required', true, 'clientVisible', true,
      'payload', jsonb_build_object('body', 'Changes are agreed in writing.')),
    jsonb_build_object('kind', 'clause', 'partKey', 'patina.termination',
      'title', 'Termination', 'required', true, 'clientVisible', true,
      'payload', jsonb_build_object('body', 'Either party may end this in writing.')),
    jsonb_build_object('kind', 'clause', 'partKey', 'patina.terms',
      'title', 'Terms', 'required', true, 'clientVisible', true,
      'payload', jsonb_build_object('body', 'The turnkey terms.'))
  ) || COALESCE(p_extra, '[]'::jsonb);
$$;
GRANT EXECUTE ON FUNCTION pg_temp.turnkey_parts(jsonb, jsonb, jsonb) TO PUBLIC;

-- ═══════════════════════════════════════════════════════════════════════════
-- (0) FIXTURE — one studio, its owner (the lead), one client.
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
) VALUES
  ('a8000000-0000-4000-8000-000000000001', 'db-lead@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a8000000-0000-4000-8000-000000000004', 'db-client@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a8000000-0000-4000-8000-000000000009', 'db-outsider@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

SET LOCAL session_replication_role = replica;
INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES
  ('a8000000-0000-4000-8000-000000000001', 'db-lead@test.invalid', 'Turnkey Lead', true, now(), now()),
  ('a8000000-0000-4000-8000-000000000004', 'db-client@test.invalid', 'Halvorsen Client', false, now(), now()),
  ('a8000000-0000-4000-8000-000000000009', 'db-outsider@test.invalid', 'Turnkey Outsider', false, now(), now())
ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, full_name = EXCLUDED.full_name;
SET LOCAL session_replication_role = origin;

INSERT INTO public.organizations (id, type, name, slug, status)
VALUES ('a8100000-0000-4000-8000-000000000001', 'design_studio', 'Middle West Studio',
        'design-build-test', 'active');

SELECT pg_temp.assume_user('a8000000-0000-4000-8000-000000000001', 'service_role');
INSERT INTO public.organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES ('a8110000-0000-4000-8000-000000000001', 'a8000000-0000-4000-8000-000000000001',
        'a8100000-0000-4000-8000-000000000001', 'owner', 'active', now() - interval '2 days');

INSERT INTO public.user_roles (user_id, role_id, granted_by)
SELECT 'a8000000-0000-4000-8000-000000000001'::uuid, role.id,
       'a8000000-0000-4000-8000-000000000001'::uuid
FROM public.roles AS role WHERE role.name = 'studio_owner';

INSERT INTO public.designer_clients (id, designer_id, client_id, client_name, status, source)
VALUES ('a8200000-0000-4000-8000-000000000001',
        'a8000000-0000-4000-8000-000000000001', 'a8000000-0000-4000-8000-000000000004',
        'Halvorsen Client', 'proposal', 'direct');

CREATE OR REPLACE FUNCTION pg_temp.mint_draft(p_id uuid, p_title text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.proposals (
    id, designer_id, designer_client_id, client_id, title, description,
    total_amount, status, valid_until
  ) VALUES (
    p_id, 'a8000000-0000-4000-8000-000000000001',
    'a8200000-0000-4000-8000-000000000001', 'a8000000-0000-4000-8000-000000000004',
    p_title, 'The kitchen and mudroom.', 0, 'draft', DATE '2028-06-01'
  );
  INSERT INTO public.proposal_phases (
    proposal_id, name, phase_key, duration_days, lane, fee_cents, sort_order
  ) VALUES (p_id, 'Construction', 'construction', 60, 'main', 0, 0);
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.mint_draft(uuid, text) TO PUBLIC;

-- ═══════════════════════════════════════════════════════════════════════════
-- (T1) THE KIND WIDENING LANDED — probe the constraint, not the ledger.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE v_def text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_def FROM pg_constraint
  WHERE conname = 'proposals_document_kind_check';
  ASSERT v_def LIKE '%design_build%', 'T1: proposals must admit design_build';
  ASSERT v_def LIKE '%trade_scope%' AND v_def LIKE '%legacy%',
    'T1: proposals must keep every kind it already admitted';

  SELECT pg_get_constraintdef(oid) INTO v_def FROM pg_constraint
  WHERE conrelid = 'public.project_commercial_documents'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%document_kind%'
    AND pg_get_constraintdef(oid) ILIKE '%design_services%'
  ORDER BY conname LIMIT 1;
  ASSERT v_def LIKE '%design_build%',
    'T1: project_commercial_documents must admit design_build';
  ASSERT v_def NOT LIKE '%legacy%',
    'T1: the commercial document has never admitted legacy and must not start';

  BEGIN
    PERFORM pg_temp.mint_draft('a8300000-0000-4000-8000-0000000000ff', 'Junk');
    UPDATE public.proposals SET document_kind = 'turnkey_ish'
    WHERE id = 'a8300000-0000-4000-8000-0000000000ff';
    RAISE EXCEPTION 'T1: a sixth junk kind must still be refused';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
  DELETE FROM public.proposals WHERE id = 'a8300000-0000-4000-8000-0000000000ff';

  RAISE NOTICE 'PASS T1: both document_kind CHECKs admit design_build and nothing else new';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (T4) THE TEMPLATE IS NOT SELECTABLE WITHOUT A LIVE ATTESTATION (R10).
-- ═══════════════════════════════════════════════════════════════════════════

SELECT pg_temp.assume_user('a8000000-0000-4000-8000-000000000001');
SELECT pg_temp.mint_draft('a8300000-0000-4000-8000-000000000001', 'The Halvorsen kitchen and mudroom');

DO $$
DECLARE v_err text; v_count integer;
BEGIN
  -- (a) no attestation at all
  BEGIN
    PERFORM public.materialize_agreement_template(
      'a8300000-0000-4000-8000-000000000001', 'patina.design_build');
    RAISE EXCEPTION 'T4: the template must refuse with no attestation';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
  END;
  ASSERT v_err = 'the design-build template needs a current licensing attestation on file',
    format('T4(a): %L', v_err);

  -- (b) an attestation that expired yesterday is no attestation
  INSERT INTO public.studio_license_attestations (
    studio_id, credential_type, credential_number, state, expires_on, attested_by
  ) VALUES (
    'a8100000-0000-4000-8000-000000000001', 'WI Dwelling Contractor', '1234567',
    'WI', current_date - 1, 'a8000000-0000-4000-8000-000000000001');
  ASSERT NOT public.studio_has_live_license_attestation(
    'a8100000-0000-4000-8000-000000000001'),
    'T4(b): an expired attestation is not live';
  BEGIN
    PERFORM public.materialize_agreement_template(
      'a8300000-0000-4000-8000-000000000001', 'patina.design_build');
    RAISE EXCEPTION 'T4: the template must refuse an expired attestation';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
  END;
  ASSERT v_err = 'the design-build template needs a current licensing attestation on file',
    format('T4(b): %L', v_err);

  -- (c) a live one, and the kind flips
  UPDATE public.studio_license_attestations
  SET expires_on = current_date + 1
  WHERE studio_id = 'a8100000-0000-4000-8000-000000000001';
  ASSERT public.studio_has_live_license_attestation(
    'a8100000-0000-4000-8000-000000000001'),
    'T4(c): a future expiry is live';

  v_count := public.materialize_agreement_template(
    'a8300000-0000-4000-8000-000000000001', 'patina.design_build');
  ASSERT v_count = 10, format('T4(c): the turnkey template lays out ten parts, got %s', v_count);
  ASSERT (SELECT document_kind FROM public.proposals
          WHERE id = 'a8300000-0000-4000-8000-000000000001') = 'design_build',
    'T4(c): materializing the turnkey template flips the kind — verified by SELECT, not by the UI';

  RAISE NOTICE 'PASS T4: the attestation gates the template at the load-bearing door';
END $$;

-- The walk's expiry: set it well forward now so the rest of the file works.
UPDATE public.studio_license_attestations
SET expires_on = DATE '2029-03-31'
WHERE studio_id = 'a8100000-0000-4000-8000-000000000001';

-- ═══════════════════════════════════════════════════════════════════════════
-- (T6) THE HALVORSEN ARITHMETIC, CENT FOR CENT, before anything is sent.
--      Integer equality on cents throughout. Never a float comparison.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_basis jsonb := pg_temp.pricing_basis();
  v_sum bigint;
  v_rows record;
  v_total bigint := 0;
  v_ret_total bigint := 0;
  v_closing bigint := 0;
BEGIN
  -- the pricing basis validates, and names the GMP
  ASSERT public._validate_pricing_basis_payload(v_basis) IS NULL,
    format('T6: the Halvorsen basis must validate: %s',
           public._validate_pricing_basis_payload(v_basis));
  ASSERT public._agreement_contract_sum_cents(v_basis) = pg_temp.m('gmp'),
    format('T6: contract sum must be %s, got %s', pg_temp.m('gmp'),
           public._agreement_contract_sum_cents(v_basis));

  -- cost basis = Σ cost lines; fee = round(cost basis * 18%); GMP = the two
  SELECT sum((line->>'basisCents')::bigint) INTO v_sum
  FROM jsonb_array_elements(v_basis->'costLines') AS e(line);
  ASSERT v_sum = pg_temp.m('cost_basis'),
    format('T6: cost basis must be %s, got %s', pg_temp.m('cost_basis'), v_sum);
  ASSERT round(v_sum * 1800 / 10000.0)::bigint = pg_temp.m('fee'),
    'T6: the 18% fee must be 1283400 cents';
  ASSERT v_sum + pg_temp.m('fee') = pg_temp.m('gmp'), 'T6: cost basis + fee = GMP';

  -- the schedule of values, pro-rated, line for line and in total
  ASSERT round(3800000::numeric * 11800 / 10000.0)::bigint = pg_temp.m('sov_cabinetry'), 'T6: SOV cabinetry';
  ASSERT round(950000::numeric  * 11800 / 10000.0)::bigint = pg_temp.m('sov_electrical'), 'T6: SOV electrical';
  ASSERT round(720000::numeric  * 11800 / 10000.0)::bigint = pg_temp.m('sov_plumbing'),  'T6: SOV plumbing';
  ASSERT round(630000::numeric  * 11800 / 10000.0)::bigint = pg_temp.m('sov_general'),   'T6: SOV general conditions';
  ASSERT round(400000::numeric  * 11800 / 10000.0)::bigint = pg_temp.m('sov_tile'),      'T6: SOV tile';
  ASSERT round(350000::numeric  * 11800 / 10000.0)::bigint = pg_temp.m('sov_fixtures'),  'T6: SOV fixtures';
  ASSERT round(280000::numeric  * 11800 / 10000.0)::bigint = pg_temp.m('sov_lighting'),  'T6: SOV lighting';
  ASSERT pg_temp.m('sov_cabinetry') + pg_temp.m('sov_electrical')
       + pg_temp.m('sov_plumbing')  + pg_temp.m('sov_general')
       + pg_temp.m('sov_tile')      + pg_temp.m('sov_fixtures')
       + pg_temp.m('sov_lighting') = pg_temp.m('gmp'),
    'T6: the schedule of values sums to the GMP';

  -- the draw ledger the DB derives
  ASSERT public._validate_draws_payload(pg_temp.draws()) IS NULL,
    format('T6: the Halvorsen draws must validate: %s',
           public._validate_draws_payload(pg_temp.draws()));

  FOR v_rows IN
    SELECT * FROM public._agreement_draw_rows(pg_temp.draws(), pg_temp.m('gmp'))
    ORDER BY sort_order
  LOOP
    v_closing := v_closing + v_rows.net_cents;
    IF NOT v_rows.is_retainage_release THEN
      v_total := v_total + v_rows.gross_cents;
      v_ret_total := v_ret_total + v_rows.retainage_cents;
    END IF;
    IF v_rows.draw_key = 'deposit' THEN
      ASSERT v_rows.gross_cents = pg_temp.m('draw1_gross'), 'T6: draw 1 gross';
      ASSERT v_rows.retainage_cents = pg_temp.m('draw1_ret'), 'T6: draw 1 retainage';
      ASSERT v_rows.net_cents = pg_temp.m('draw1_net'), 'T6: draw 1 net';
    ELSIF v_rows.draw_key = 'rough_in' THEN
      ASSERT v_rows.gross_cents = pg_temp.m('draw2_gross'), 'T6: draw 2 gross';
      ASSERT v_rows.retainage_cents = pg_temp.m('draw2_ret'), 'T6: draw 2 retainage';
      ASSERT v_rows.net_cents = pg_temp.m('draw2_net'), 'T6: draw 2 net';
    ELSIF v_rows.draw_key = 'cabinets_set' THEN
      ASSERT v_rows.gross_cents = pg_temp.m('draw3_gross'), 'T6: draw 3 gross';
      ASSERT v_rows.retainage_cents = pg_temp.m('draw3_ret'), 'T6: draw 3 retainage';
      ASSERT v_rows.net_cents = pg_temp.m('draw3_net'), 'T6: draw 3 net';
    ELSIF v_rows.draw_key = 'substantial' THEN
      ASSERT v_rows.gross_cents = pg_temp.m('draw4_gross'), 'T6: draw 4 gross';
      ASSERT v_rows.retainage_cents = pg_temp.m('draw4_ret'), 'T6: draw 4 retainage';
      ASSERT v_rows.net_cents = pg_temp.m('draw4_net'), 'T6: draw 4 net';
    ELSE
      ASSERT v_rows.draw_key = 'retainage_release', 'T6: no fifth kind of draw';
      ASSERT v_rows.gross_cents = pg_temp.m('release'), 'T6: the release row';
      ASSERT v_rows.retainage_cents = 0, 'T6: nothing is withheld from the release';
    END IF;
  END LOOP;

  ASSERT v_total = pg_temp.m('gmp'), 'T6: the draws sum to the GMP';
  ASSERT v_ret_total = pg_temp.m('release'),
    'T6: the release equals the retainage withheld';
  -- THE CLOSING IDENTITY, spelled out.
  ASSERT v_closing = pg_temp.m('gmp'),
    format('T6: 841340 + 2397819 + 3197092 + 1598546 + 378603 must be 8413400, got %s',
           v_closing);
  ASSERT pg_temp.m('draw1_net') + pg_temp.m('draw2_net') + pg_temp.m('draw3_net')
       + pg_temp.m('draw4_net') + pg_temp.m('release') = pg_temp.m('gmp'),
    'T6: the closing identity, stated in the fixture''s own numbers';

  RAISE NOTICE 'PASS T6: the Halvorsen table reproduces to the cent, with no float anywhere';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (T10) NO DOUBLE COUNT — refused at BOTH doors, with the SAME sentence.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_expected text := 'Supervision is paid once. You have a supervision fee and a markup on the trades. Bill supervision as its own line, fold it into overhead, or take it in the trade markup — one of the three, not two.';
  v_err text;
  v_basis jsonb := pg_temp.pricing_basis() || jsonb_build_object('subMarkupBps', 1500);
  v_parts jsonb;
BEGIN
  v_parts := pg_temp.turnkey_parts(v_basis, NULL, jsonb_build_array(
    jsonb_build_object('kind', 'clause', 'partKey', 'custom.supervision_fee',
      'title', 'Supervision fee', 'clientVisible', true,
      'payload', jsonb_build_object('body', 'A supervision fee.',
                                    'supervisionFeeCents', 250000))));

  -- door one: the composer
  v_err := pg_temp.save_err('a8300000-0000-4000-8000-000000000001', v_parts);
  ASSERT v_err = v_expected, format('T10 (save): %L', v_err);

  -- and with the markup cleared, the same set saves
  v_err := pg_temp.save_err('a8300000-0000-4000-8000-000000000001',
    pg_temp.turnkey_parts(NULL, NULL, jsonb_build_array(
      jsonb_build_object('kind', 'clause', 'partKey', 'custom.supervision_fee',
        'title', 'Supervision fee', 'clientVisible', true,
        'payload', jsonb_build_object('body', 'A supervision fee.',
                                      'supervisionFeeCents', 250000)))));
  ASSERT v_err IS NULL, format('T10: clearing the markup must let it save: %L', v_err);

  -- door two: send. Put the markup back by hand, past the composer, exactly
  -- the way a hand-made payload would arrive.
  UPDATE public.proposal_agreement_parts
  SET payload = v_basis
  WHERE proposal_id = 'a8300000-0000-4000-8000-000000000001'
    AND variant = 'pricing_basis';
  v_err := pg_temp.send_err('a8300000-0000-4000-8000-000000000001');
  ASSERT v_err = v_expected, format('T10 (send): %L', v_err);

  RAISE NOTICE 'PASS T10: supervision is paid once, said identically at both doors';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (T5) (T9) THE SEND DOOR: the draws must agree with the contract sum, and a
--           notice counsel has not enabled cannot travel.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_err text;
  v_off jsonb;
BEGIN
  -- A GMP one cent short of cost basis + fee. The composer refuses it, and so
  -- does the send door when the same payload is written past the composer.
  v_off := pg_temp.pricing_basis();
  v_off := jsonb_set(v_off, '{gmpCents}', to_jsonb(pg_temp.m('gmp') - 1));
  v_err := pg_temp.save_err(
    'a8300000-0000-4000-8000-000000000001', pg_temp.turnkey_parts(v_off));
  ASSERT v_err = 'The guaranteed maximum must equal the cost basis plus the fee, to the cent.',
    format('T5(a save): %L', v_err);

  PERFORM public.upsert_agreement_parts(
    'a8300000-0000-4000-8000-000000000001', pg_temp.turnkey_parts(), NULL);
  UPDATE public.proposal_agreement_parts SET payload = v_off
  WHERE proposal_id = 'a8300000-0000-4000-8000-000000000001'
    AND variant = 'pricing_basis';
  v_err := pg_temp.send_err('a8300000-0000-4000-8000-000000000001');
  ASSERT v_err = 'The guaranteed maximum must equal the cost basis plus the fee, to the cent.',
    format('T5(a send): %L', v_err);

  -- A draw schedule that does not come to 100%, refused at both doors too.
  v_off := jsonb_build_object(
    'retainageBps', 500,
    'draws', jsonb_build_array(
      jsonb_build_object('key', 'deposit', 'label', 'Deposit', 'pct', 10,
                         'sortOrder', 1, 'retainageApplies', false),
      jsonb_build_object('key', 'final', 'label', 'Final', 'pct', 80,
                         'sortOrder', 2, 'retainageApplies', true)));
  v_err := pg_temp.save_err(
    'a8300000-0000-4000-8000-000000000001', pg_temp.turnkey_parts(NULL, v_off));
  ASSERT v_err = 'The draws come to 90.00% — they must come to 100%.',
    format('T5(b save): %L', v_err);

  PERFORM public.upsert_agreement_parts(
    'a8300000-0000-4000-8000-000000000001', pg_temp.turnkey_parts(), NULL);
  UPDATE public.proposal_agreement_parts SET payload = v_off
  WHERE proposal_id = 'a8300000-0000-4000-8000-000000000001'
    AND variant = 'draws';
  v_err := pg_temp.send_err('a8300000-0000-4000-8000-000000000001');
  ASSERT v_err = 'The draws come to 90.00% — they must come to 100%.',
    format('T5(b send): %L', v_err);

  -- T9: an attachment naming a notice counsel has not enabled
  PERFORM public.upsert_agreement_parts(
    'a8300000-0000-4000-8000-000000000001',
    pg_temp.turnkey_parts(NULL, NULL, jsonb_build_array(
      jsonb_build_object('kind', 'attachment',
        'partKey', 'patina.notice_of_cancellation',
        'title', 'Notice of cancellation', 'clientVisible', true,
        'payload', jsonb_build_object('title', 'Notice of cancellation',
          'body', 'x', 'jurisdiction', 'WI', 'acknowledgeRequired', true)))), NULL);
  v_err := pg_temp.send_err('a8300000-0000-4000-8000-000000000001');
  ASSERT v_err = 'that jurisdiction notice is held for counsel review and cannot be sent',
    format('T9(send): %L', v_err);

  -- and with no disclosure mode stated at all
  PERFORM public.upsert_agreement_parts(
    'a8300000-0000-4000-8000-000000000001',
    jsonb_build_array(
      jsonb_build_object('kind', 'schedule', 'variant', 'pricing_basis',
        'partKey', 'patina.pricing_basis', 'title', 'Pricing basis',
        'clientVisible', true, 'payload', pg_temp.pricing_basis()),
      jsonb_build_object('kind', 'schedule', 'variant', 'draws',
        'partKey', 'patina.draws', 'title', 'Draw schedule',
        'clientVisible', true, 'payload', pg_temp.draws())), NULL);
  v_err := pg_temp.send_err('a8300000-0000-4000-8000-000000000001');
  ASSERT v_err = 'say whether the trades are priced open-book or closed-book',
    format('T5(c): %L', v_err);

  -- the sound set sends
  PERFORM public.upsert_agreement_parts(
    'a8300000-0000-4000-8000-000000000001', pg_temp.turnkey_parts(), NULL);
  v_err := pg_temp.send_err('a8300000-0000-4000-8000-000000000001');
  ASSERT v_err IS NULL, format('T5(d): the Halvorsen agreement must send: %L', v_err);

  RAISE NOTICE 'PASS T5/T9: the draws agree with the contract sum, and a dark notice cannot travel';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (T9) THE NOTICES STAY DARK — six seeded rows, all disabled, invisible to a
--      studio, and refused an UPDATE.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE v_seen integer;
BEGIN
  ASSERT (SELECT count(*) FROM public.agreement_jurisdiction_notices) = 6,
    'T9: six notices are seeded';
  ASSERT (SELECT count(*) FROM public.agreement_jurisdiction_notices WHERE enabled) = 0,
    'T9: every seeded notice ships disabled';
  ASSERT (SELECT array_agg(state ORDER BY state)
          FROM public.agreement_jurisdiction_notices)
         = ARRAY['CA', 'IL', 'MA', 'MN', 'NY', 'WI'],
    'T9: WI, MN, IL, CA, NY and MA, and nothing else';
  ASSERT (SELECT body FROM public.agreement_jurisdiction_notices WHERE state = 'MA')
         LIKE '%not been independently re-verified%',
    'T9: the Massachusetts body carries the research lane''s own caveat inline';

  PERFORM pg_temp.assume_role('a8000000-0000-4000-8000-000000000001');
  SELECT count(*) INTO v_seen FROM public.agreement_jurisdiction_notices;
  PERFORM pg_temp.reset_role();
  ASSERT v_seen = 0,
    format('T9: a studio member reads no disabled notice, got %s', v_seen);

  PERFORM pg_temp.assume_role('a8000000-0000-4000-8000-000000000001');
  UPDATE public.agreement_jurisdiction_notices SET enabled = true WHERE state = 'WI';
  PERFORM pg_temp.reset_role();
  ASSERT (SELECT count(*) FROM public.agreement_jurisdiction_notices WHERE enabled) = 0,
    'T9: a studio member cannot enable a notice';

  RAISE NOTICE 'PASS T9: the six notices are seeded, dark, invisible and unflippable';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (T11) THE FINGERPRINT STILL COVERS WHAT THE CLIENT READS (RC-8).
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_before text;
  v_after text;
  v_sent text;
  v_moved jsonb;
BEGIN
  -- A THIRD turnkey draft, because the claim under test is about the AUTHORED
  -- payload and the parts table freezes at send (R6) — for every actor, the
  -- owner included. So the hash is asked of a document that can still move.
  PERFORM pg_temp.assume_user('a8000000-0000-4000-8000-000000000001');
  PERFORM pg_temp.mint_draft('a8300000-0000-4000-8000-000000000003', 'The fingerprint bench');
  PERFORM public.materialize_agreement_template(
    'a8300000-0000-4000-8000-000000000003', 'patina.design_build');
  PERFORM public.upsert_agreement_parts(
    'a8300000-0000-4000-8000-000000000003', pg_temp.turnkey_parts(), NULL);

  v_before := public._commercial_document_fingerprint('a8300000-0000-4000-8000-000000000003');
  ASSERT v_before IS NOT NULL, 'T11: a turnkey agreement must fingerprint';

  -- One draw amount, moved OUT OF BAND — a direct payload UPDATE, so every
  -- other column of every part row is byte-identical and the hash can only
  -- have moved because of the draw. (Going back through the RPC would prove
  -- less: it is DELETE-then-INSERT, so each row gets a fresh id and the digest
  -- would move for any save at all.) If the hash did not follow the payload, a
  -- signature would attest to a schedule other than the one on the page.
  SELECT payload INTO v_moved FROM public.proposal_agreement_parts
  WHERE proposal_id = 'a8300000-0000-4000-8000-000000000003' AND variant = 'draws';

  UPDATE public.proposal_agreement_parts
  SET payload = jsonb_set(v_moved, '{draws,0,pct}', to_jsonb(11))
  WHERE proposal_id = 'a8300000-0000-4000-8000-000000000003' AND variant = 'draws';
  v_after := public._commercial_document_fingerprint('a8300000-0000-4000-8000-000000000003');
  ASSERT v_after IS DISTINCT FROM v_before,
    'T11: moving a draw amount inside the part payload MUST move the document hash';

  -- and back, byte for byte
  UPDATE public.proposal_agreement_parts SET payload = v_moved
  WHERE proposal_id = 'a8300000-0000-4000-8000-000000000003' AND variant = 'draws';
  ASSERT public._commercial_document_fingerprint('a8300000-0000-4000-8000-000000000003')
         = v_before, 'T11: restoring the payload restores the hash';

  -- the same, for the pricing basis the client reads the money off
  SELECT payload INTO v_moved FROM public.proposal_agreement_parts
  WHERE proposal_id = 'a8300000-0000-4000-8000-000000000003' AND variant = 'pricing_basis';
  UPDATE public.proposal_agreement_parts
  SET payload = jsonb_set(v_moved, '{gmpCents}', to_jsonb(pg_temp.m('gmp') + 1))
  WHERE proposal_id = 'a8300000-0000-4000-8000-000000000003' AND variant = 'pricing_basis';
  ASSERT public._commercial_document_fingerprint('a8300000-0000-4000-8000-000000000003')
         IS DISTINCT FROM v_before,
    'T11: moving the contract sum MUST move the document hash';
  UPDATE public.proposal_agreement_parts SET payload = v_moved
  WHERE proposal_id = 'a8300000-0000-4000-8000-000000000003' AND variant = 'pricing_basis';

  -- and the machine ledger is legitimately OUTSIDE it (RC-8): a draw's invoice
  -- state is not authored content, and moving it must not move what two
  -- parties signed.
  v_sent := public._commercial_document_fingerprint('a8300000-0000-4000-8000-000000000001');
  UPDATE public.agreement_draw_invoices SET issued_at = now(), updated_at = now()
  WHERE proposal_id = 'a8300000-0000-4000-8000-000000000001' AND draw_key = 'substantial';
  ASSERT public._commercial_document_fingerprint('a8300000-0000-4000-8000-000000000001')
         = v_sent,
    'T11: post-send machine state is outside the hash, deliberately';
  UPDATE public.agreement_draw_invoices SET issued_at = NULL, updated_at = now()
  WHERE proposal_id = 'a8300000-0000-4000-8000-000000000001' AND draw_key = 'substantial';

  RAISE NOTICE 'PASS T11: W1''s parts fold carries the turnkey class — no third CASE arm is owed';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- THE LEDGER WAS MATERIALIZED AT SEND, and only there.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE v_err text;
BEGIN
  ASSERT (SELECT count(*) FROM public.agreement_draw_invoices
          WHERE proposal_id = 'a8300000-0000-4000-8000-000000000001') = 5,
    'the ledger holds four draws and the release';
  ASSERT (SELECT sum(gross_cents) FROM public.agreement_draw_invoices
          WHERE proposal_id = 'a8300000-0000-4000-8000-000000000001'
            AND NOT is_retainage_release) = pg_temp.m('gmp'),
    'the materialized ledger sums to the GMP';

  PERFORM pg_temp.assume_role('a8000000-0000-4000-8000-000000000001');
  BEGIN
    INSERT INTO public.agreement_draw_invoices (
      proposal_id, draw_key, sort_order, label, gross_cents, retainage_cents, net_cents
    ) VALUES ('a8300000-0000-4000-8000-000000000001', 'hand_made', 99, 'Hand made',
              1000, 0, 1000);
    v_err := 'no refusal';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
  END;
  PERFORM pg_temp.reset_role();
  ASSERT v_err <> 'no refusal',
    'the draw ledger refuses a hand-made row';

  RAISE NOTICE 'PASS: the draw ledger is machine-owned and written only at send';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (T13) THE SIGNATURE PATH END TO END (D-W3-3), and (T8) the deposit's gate.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_signed jsonb;
  v_signature public.commercial_document_signatures%ROWTYPE;
  v_err text;
  v_offer jsonb;
BEGIN
  PERFORM pg_temp.assume_user('a8000000-0000-4000-8000-000000000004', 'service_role');
  EXECUTE 'SET LOCAL ROLE service_role';
  v_signed := public.sign_design_services_agreement_with_trusted_ip(
    'a8300000-0000-4000-8000-000000000001', 'Halvorsen Client',
    'a8000000-0000-4000-8000-000000000004', '203.0.113.11',
    jsonb_build_object('consentSentence',
      public.compose_agreement_consent('a8300000-0000-4000-8000-000000000001')));
  PERFORM pg_temp.reset_role();

  ASSERT (v_signed->>'newlyClientSigned')::boolean,
    format('T13: a design-build prime must be client-signable: %s', v_signed);
  ASSERT (SELECT commercial_state FROM public.proposals
          WHERE id = 'a8300000-0000-4000-8000-000000000001') = 'client_signed',
    'T13: the document reaches client_signed';

  SELECT * INTO v_signature FROM public.commercial_document_signatures
  WHERE proposal_id = 'a8300000-0000-4000-8000-000000000001' AND party_role = 'client';
  ASSERT v_signature.id IS NOT NULL, 'T13: the client signature row lands';
  ASSERT v_signature.metadata->>'via' = 'sign_design_services_agreement',
    format('T13: ASSERT WHICH RPC RAN, not that the request returned: %L',
           v_signature.metadata->>'via');
  -- THE SENTENCE, BYTE FOR BYTE. This is the same string the client portal's
  -- consent-copy.test.ts must pin against composeConsentLine: two
  -- implementations, one sentence, and either one moving turns the other red.
  -- Canonical fragment order — pricing basis, schedule of values, draws,
  -- retainage, allowances — independent of the designer's part order.
  ASSERT v_signature.metadata->>'consentSentence' =
    'I agree to these design-build terms, the cost-plus pricing basis and its guaranteed maximum price, the schedule of values, the draw schedule, the retainage withheld from each draw, and the allowances and what happens if they run over, and understand my signature alone does not authorize work until the studio countersigns.',
    format('T13: the turnkey consent sentence drifted:%s  got: %L',
           E'\n', v_signature.metadata->>'consentSentence');
  ASSERT v_signature.metadata->>'consentSentence'
         <> 'I agree to the scope and investment in this proposal.',
    'T13: the generic fallback is the tell of a missed branch (walk step 12)';

  -- (T8) the deposit issues at client_signed, and nothing else does.
  PERFORM pg_temp.assume_role('a8000000-0000-4000-8000-000000000001');
  v_err := pg_temp.draw_err('a8300000-0000-4000-8000-000000000001', 'rough_in');
  PERFORM pg_temp.reset_role();
  ASSERT v_err = 'a draw is billable once the agreement is executed',
    format('T8(a): %L', v_err);

  PERFORM pg_temp.assume_role('a8000000-0000-4000-8000-000000000001');
  v_offer := public.issue_agreement_draw_invoice(
    'a8300000-0000-4000-8000-000000000001', 'deposit');
  PERFORM pg_temp.reset_role();
  ASSERT (v_offer->>'netCents')::bigint = pg_temp.m('draw1_net'),
    format('T8(b): the deposit invoice carries the NET, got %s', v_offer->>'netCents');
  ASSERT (v_offer->>'amountCents')::bigint = pg_temp.m('draw1_gross'),
    'T8(b): the offer reports the gross beside the net';
  ASSERT (SELECT total_cents FROM public.invoices
          WHERE id = (v_offer->>'invoiceId')::uuid) = pg_temp.m('draw1_net'),
    'T8(b): retainage is withheld, not billed';
  ASSERT (SELECT title FROM public.invoices
          WHERE id = (v_offer->>'invoiceId')::uuid) = 'Deposit at signing',
    'T8(b): the invoice title is the draw label';
  ASSERT (SELECT studio_id FROM public.invoices
          WHERE id = (v_offer->>'invoiceId')::uuid)
         = 'a8100000-0000-4000-8000-000000000001',
    'T8(b): the studio is stamped on a project-less deposit invoice';
  ASSERT v_offer->>'payToken' ~ '^[0-9a-f]{64}$',
    format('T8(b): the deposit offer carries the shipped payer link, got %L',
           v_offer->>'payToken');

  RAISE NOTICE 'PASS T13/T8: the turnkey signature lands, and the deposit is offered at client_signed';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (T3) (T14) COUNTERSIGN — the authority, the cadence, and the retainer anchor.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_executed jsonb;
  v_authority public.project_billing_authorities%ROWTYPE;
  v_document public.project_commercial_documents%ROWTYPE;
BEGIN
  PERFORM pg_temp.assume_role('a8000000-0000-4000-8000-000000000001');
  v_executed := public.countersign_design_services_agreement(
    'a8300000-0000-4000-8000-000000000001', 'Turnkey Lead');
  PERFORM pg_temp.reset_role();
  ASSERT (v_executed->>'newlyExecuted')::boolean,
    format('T3: a design-build prime must countersign: %s', v_executed);

  SELECT * INTO v_document FROM public.project_commercial_documents
  WHERE proposal_id = 'a8300000-0000-4000-8000-000000000001';
  ASSERT v_document.document_kind = 'design_build',
    format('T3: the origin document records the class it is, got %L',
           v_document.document_kind);
  ASSERT v_document.is_origin, 'T3: a turnkey prime is an origin';

  SELECT * INTO v_authority FROM public.project_billing_authorities
  WHERE id = (v_executed->>'billingAuthorityId')::uuid;
  ASSERT v_authority.billing_cadence = 'per_draw',
    format('T3: R9''s one authority — billing_cadence, got %L',
           v_authority.billing_cadence);
  ASSERT v_authority.billing_ceiling_cents IS NULL,
    'T3: a turnkey agreement carries no rate card, so no ceiling';
  ASSERT (SELECT count(*) FROM public.project_billing_authorities
          WHERE project_id = v_document.project_id AND status = 'active') = 1,
    'T3: exactly one active authority per project';
  ASSERT (SELECT billing_cadence FROM public.proposal_service_terms
          WHERE proposal_id = 'a8300000-0000-4000-8000-000000000001') = 'per_draw',
    'T3: per_draw is accepted on the projection too';

  -- Exactly two signatures on the prime, client and studio, as ever.
  ASSERT (SELECT count(*) FROM public.commercial_document_signatures
          WHERE proposal_id = 'a8300000-0000-4000-8000-000000000001') = 2,
    'T3: the prime holds exactly two signatures';

  RAISE NOTICE 'PASS T3: per_draw reaches the authority and the origin records design_build';
END $$;

-- (T14) The retainer anchor: a SECOND turnkey agreement, carrying a retainer,
-- countersigns without the anchor-count refusal that reads like a permission
-- bug. Before PART 7b's graft this raised
-- 'issue_invoice: invoice not found or access denied'.
DO $$
DECLARE
  v_signed jsonb;
  v_executed jsonb;
  v_anchor integer;
BEGIN
  PERFORM pg_temp.assume_user('a8000000-0000-4000-8000-000000000001');
  PERFORM pg_temp.mint_draft('a8300000-0000-4000-8000-000000000002', 'The retainer turnkey');
  PERFORM public.materialize_agreement_template(
    'a8300000-0000-4000-8000-000000000002', 'patina.design_build');
  PERFORM public.upsert_agreement_parts(
    'a8300000-0000-4000-8000-000000000002',
    pg_temp.turnkey_parts(NULL, NULL, jsonb_build_array(
      jsonb_build_object('kind', 'schedule', 'variant', 'retainer',
        'partKey', 'patina.retainer', 'title', 'Retainer', 'clientVisible', true,
        'payload', jsonb_build_object('cents', 500000, 'creditRule', 'credited',
                                      'activationPolicy', 'immediate')))), NULL);
  PERFORM pg_temp.send_agreement('a8300000-0000-4000-8000-000000000002');

  PERFORM pg_temp.assume_user('a8000000-0000-4000-8000-000000000004', 'service_role');
  EXECUTE 'SET LOCAL ROLE service_role';
  v_signed := public.sign_design_services_agreement_with_trusted_ip(
    'a8300000-0000-4000-8000-000000000002', 'Halvorsen Client',
    'a8000000-0000-4000-8000-000000000004', '203.0.113.11', NULL);
  PERFORM pg_temp.reset_role();
  ASSERT (v_signed->>'newlyClientSigned')::boolean, 'T14: the retainer turnkey signs';

  PERFORM pg_temp.assume_role('a8000000-0000-4000-8000-000000000001');
  v_executed := public.countersign_design_services_agreement(
    'a8300000-0000-4000-8000-000000000002', 'Turnkey Lead');
  PERFORM pg_temp.reset_role();
  ASSERT (v_executed->>'newlyExecuted')::boolean,
    format('T14: the retainer turnkey must countersign without an anchor refusal: %s',
           v_executed);
  ASSERT v_executed->>'retainerInvoiceId' IS NOT NULL,
    format('T14: the retainer invoice must be issued: %s', v_executed);
  ASSERT (SELECT status FROM public.invoices
          WHERE id = (v_executed->>'retainerInvoiceId')::uuid) = 'sent',
    'T14: the retainer invoice is issued, not left a draft';

  -- The anchor resolves to EXACTLY ONE — not zero (unwidened) and not two (a
  -- branch widened so loosely that a draw line also matches the retainer one).
  SELECT count(DISTINCT document.id) INTO v_anchor
  FROM public.invoice_line_items AS line
  JOIN public.project_commercial_documents AS document
    ON document.document_kind IN ('design_services', 'service_addendum', 'design_build')
   AND line.metadata->>'kind' = 'design_services_retainer'
   AND document.id::text = NULLIF(line.metadata->>'commercialDocumentId', '')
  WHERE line.invoice_id = (v_executed->>'retainerInvoiceId')::uuid;
  ASSERT v_anchor = 1,
    format('T14: the retainer anchor must resolve to exactly 1, got %s', v_anchor);

  RAISE NOTICE 'PASS T14: the retainer anchor is widened once per branch, and resolves to one';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (T7) DRAW ORDERING — and the void that frees a draw.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_err text;
  v_deposit uuid;
  v_offer jsonb;
BEGIN
  SELECT invoice_id INTO v_deposit FROM public.agreement_draw_invoices
  WHERE proposal_id = 'a8300000-0000-4000-8000-000000000001' AND draw_key = 'deposit';

  PERFORM pg_temp.assume_role('a8000000-0000-4000-8000-000000000001');
  -- (a) draw 2 while draw 1 is unpaid
  v_err := pg_temp.draw_err('a8300000-0000-4000-8000-000000000001', 'rough_in');
  ASSERT v_err = 'earlier draws must be issued and paid before this one',
    format('T7(a): %L', v_err);

  -- (b) a re-issue over a LIVE invoice
  v_err := pg_temp.draw_err('a8300000-0000-4000-8000-000000000001', 'deposit');
  ASSERT v_err = 'the draw "Deposit at signing" is already billed on a live invoice',
    format('T7(b): %L', v_err);
  PERFORM pg_temp.reset_role();

  -- (c) a VOIDED invoice frees the draw
  UPDATE public.invoices SET status = 'void', voided_at = now(),
         void_reason = 'test' WHERE id = v_deposit;
  PERFORM pg_temp.assume_role('a8000000-0000-4000-8000-000000000001');
  v_err := pg_temp.draw_err('a8300000-0000-4000-8000-000000000001', 'deposit');
  PERFORM pg_temp.reset_role();
  ASSERT v_err IS NULL, format('T7(c): a void frees the draw: %L', v_err);

  SELECT invoice_id INTO v_deposit FROM public.agreement_draw_invoices
  WHERE proposal_id = 'a8300000-0000-4000-8000-000000000001' AND draw_key = 'deposit';
  ASSERT (SELECT deposit_invoice_id FROM public.project_commercial_documents
          WHERE proposal_id = 'a8300000-0000-4000-8000-000000000001') = v_deposit,
    'T7(c): the deposit pointer follows the re-issue, never the dead invoice';

  -- (d) the release waits for every work draw, not only the ones below it
  PERFORM pg_temp.pay_invoice(v_deposit);
  PERFORM pg_temp.assume_role('a8000000-0000-4000-8000-000000000001');
  v_err := pg_temp.draw_err('a8300000-0000-4000-8000-000000000001', 'retainage_release');
  ASSERT v_err = 'earlier draws must be issued and paid before this one',
    format('T7(d): %L', v_err);

  -- (e) with draw 1 paid, draw 2 issues — for its NET
  v_offer := public.issue_agreement_draw_invoice(
    'a8300000-0000-4000-8000-000000000001', 'rough_in');
  PERFORM pg_temp.reset_role();
  ASSERT (v_offer->>'netCents')::bigint = pg_temp.m('draw2_net'),
    format('T7(e): rough-in bills 23,978.19, not 25,240.20 — got %s',
           v_offer->>'netCents');
  ASSERT (v_offer->>'retainageCents')::bigint = pg_temp.m('draw2_ret'),
    'T7(e): the withheld retainage rides on the answer';

  RAISE NOTICE 'PASS T7: draws issue in order, a void frees one, and retainage is withheld';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (T2) (T15) THE ORIGIN MOTIF — ten functions, one assertion each.
--            This is the group where a single missed graft hides, so the
--            group is never smoke-called.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_project_id uuid;
  v_threshold jsonb;
  v_room_id uuid;
  v_version_id uuid;
  v_entry_id uuid;
  v_scope jsonb;
  v_err text;
  -- The widened predicate, exactly as every grafted body must now spell it.
  v_widened text := '''design_services'', ''design_build''';
  v_prewave text := 'document_kind = ''design_services''';
BEGIN
  SELECT project_id INTO v_project_id FROM public.project_commercial_documents
  WHERE proposal_id = 'a8300000-0000-4000-8000-000000000001';
  ASSERT v_project_id IS NOT NULL, 'T2: countersign created the project';

  -- (1) _is_design_services_project — DRIVEN.
  ASSERT public._is_design_services_project(v_project_id),
    'T15(1): _is_design_services_project must answer for a turnkey origin';

  -- (2) get_client_project_threshold — DRIVEN. origin 'commercial', not 'legacy'.
  PERFORM pg_temp.assume_user('a8000000-0000-4000-8000-000000000004');
  v_threshold := public.get_client_project_threshold(v_project_id);
  PERFORM pg_temp.assume_user('a8000000-0000-4000-8000-000000000001');
  ASSERT v_threshold->>'origin' = 'commercial',
    format('T15(2): the client threshold reads a turnkey origin as commercial, got %L',
           v_threshold->>'origin');

  -- (3) classify_project_time_entry_authority — DRIVEN, through the trigger the
  --     way a real logged hour is.
  --
  --     THE TELL IS WHICH BRANCH RAN, not which state came out. On the
  --     unwidened body v_is_services_project is false, so the classifier takes
  --     the legacy short-circuit and stamps 'authorized' without ever reading
  --     the commercial authority. On the grafted body it takes the commercial
  --     path — and a turnkey agreement carries no rate card, so the hour parks
  --     in 'pending_authorization'. That is R9 working as ruled: time is not
  --     this class's billing basis, and an hour it cannot rate is an hour it
  --     must not silently authorize.
  INSERT INTO public.project_time_entries (
    project_id, user_id, started_at, duration_minutes, billable, notes
  ) VALUES (
    v_project_id, 'a8000000-0000-4000-8000-000000000001', now(), 60, true,
    'An hour on site'
  ) RETURNING id INTO v_entry_id;
  ASSERT (SELECT billing_state FROM public.project_time_entries WHERE id = v_entry_id)
         = 'pending_authorization',
    format('T15(3): the commercial classifier must run for a turnkey project, got %L',
           (SELECT billing_state FROM public.project_time_entries WHERE id = v_entry_id));
  ASSERT (SELECT billing_state FROM public.project_time_entries WHERE id = v_entry_id)
         <> 'authorized',
    'T15(3): the legacy short-circuit must NOT be what classified a turnkey hour';

  -- (4) create_trade_scope — DRIVEN. The unwidened body refuses with
  --     'project % has no executed design-services origin'.
  BEGIN
    v_scope := public.create_trade_scope(v_project_id, 'Cabinetry & millwork');
    v_err := NULL;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
  END;
  ASSERT v_err IS NULL,
    format('T15(4): create_trade_scope must see a turnkey origin: %L', v_err);

  -- (5) publish_budget_checkpoint — DRIVEN, same refusal.
  INSERT INTO public.project_rooms (project_id, name, sort_order)
  VALUES (v_project_id, 'Kitchen', 0) RETURNING id INTO v_room_id;
  INSERT INTO public.project_budget_versions (
    project_id, version, status, created_by
  ) VALUES (v_project_id, 1, 'draft', 'a8000000-0000-4000-8000-000000000001')
  RETURNING id INTO v_version_id;
  INSERT INTO public.project_budget_lines (
    budget_version_id, project_room_id, room_name, category, target_cents
  ) VALUES (v_version_id, v_room_id, 'Kitchen', 'lighting', 60000);
  BEGIN
    PERFORM public.publish_budget_checkpoint(v_project_id, v_version_id);
    v_err := NULL;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
  END;
  ASSERT v_err IS NULL,
    format('T15(5): publish_budget_checkpoint must see a turnkey origin: %L', v_err);

  -- (6) … (11) The remaining six sit behind fixtures that a purchase order, a
  --     furnishings wave or a whole paper-execution rail would have to build,
  --     and the failure this group exists to catch is A MISSED GRAFT — a body
  --     still reading `= 'design_services'`. So each is asserted ON THE
  --     SHIPPED BODY, by name, ONE ASSERT EACH. A body that reverted to the
  --     pre-wave text fails here exactly as it would fail in a walk.
  ASSERT (SELECT position(v_widened IN p.prosrc) > 0 FROM pg_proc p
          WHERE p.oid = to_regprocedure('public.guard_project_ffe_purchase_authority()')),
    'T15(6): guard_project_ffe_purchase_authority must read IN (design_services, design_build)';
  ASSERT (SELECT position(v_widened IN p.prosrc) > 0 FROM pg_proc p
          WHERE p.oid = to_regprocedure(
            'public._create_furnishings_authorization_from_schedule_00444_impl(uuid,text,uuid[],numeric)')),
    'T15(7): the furnishings-from-schedule impl must read IN (design_services, design_build)';
  ASSERT (SELECT position(v_widened IN p.prosrc) > 0 FROM pg_proc p
          WHERE p.oid = to_regprocedure(
            'public._execute_furnishings_authorization_authorized(uuid,text,uuid,text)')),
    'T15(8): _execute_furnishings_authorization_authorized must read IN (design_services, design_build)';
  ASSERT (SELECT position(v_widened IN p.prosrc) > 0 FROM pg_proc p
          WHERE p.oid = to_regprocedure(
            'public._execute_trade_scope_authorized(uuid,text,uuid,text)')),
    'T15(9): _execute_trade_scope_authorized must read IN (design_services, design_build)';
  ASSERT (SELECT position(v_widened IN p.prosrc) > 0 FROM pg_proc p
          WHERE p.oid = to_regprocedure(
            'public._execute_furnishings_authorization_on_paper_authorized(uuid,text,date,uuid,uuid,jsonb)')),
    'T15(10): _execute_furnishings_authorization_on_paper_authorized must read IN (design_services, design_build)';
  ASSERT (SELECT position(v_widened IN p.prosrc) > 0 FROM pg_proc p
          WHERE p.oid = to_regprocedure(
            'public._execute_trade_scope_on_paper_authorized(uuid,text,date,uuid,uuid)')),
    'T15(11): _execute_trade_scope_on_paper_authorized must read IN (design_services, design_build)';

  -- The inverse of RC-9: no grafted origin reader may STILL carry the pre-wave
  -- single-kind test. A graft from the wrong body fails here.
  ASSERT NOT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid IN (
      to_regprocedure('public._is_design_services_project(uuid)'),
      to_regprocedure('public.classify_project_time_entry_authority()'),
      to_regprocedure('public.guard_project_ffe_purchase_authority()'),
      to_regprocedure('public.create_trade_scope(uuid,text)'),
      to_regprocedure('public.publish_budget_checkpoint(uuid,uuid)'),
      to_regprocedure('public.get_client_project_threshold(uuid)'),
      to_regprocedure('public._create_furnishings_authorization_from_schedule_00444_impl(uuid,text,uuid[],numeric)'),
      to_regprocedure('public._execute_furnishings_authorization_authorized(uuid,text,uuid,text)'),
      to_regprocedure('public._execute_trade_scope_authorized(uuid,text,uuid,text)'),
      to_regprocedure('public._execute_furnishings_authorization_on_paper_authorized(uuid,text,date,uuid,uuid,jsonb)'),
      to_regprocedure('public._execute_trade_scope_on_paper_authorized(uuid,text,date,uuid,uuid)'))
      AND position(v_prewave IN p.prosrc) > 0
  ), 'T15: a grafted origin reader still carries the pre-wave single-kind test';

  RAISE NOTICE 'PASS T2/T15: every origin reader answers for a turnkey project';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (T16) WHAT A CLOSED BOOK CLOSES (B3, RC-4). The pricing basis is the one
--       part R22 will not let the studio hide — a turnkey prime that names no
--       fee cannot be signed — so the disclosure the clause elected has to be
--       kept at the edge she reads through, and nowhere else will do.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_bundle jsonb;
  v_basis jsonb;
  v_sov jsonb;
  v_open jsonb;
  v_total bigint;
BEGIN
  ASSERT public._agreement_sub_disclosure('a8300000-0000-4000-8000-000000000001')
         = 'closed_book',
    'T16: the Halvorsen paper is closed book';

  PERFORM pg_temp.assume_role('a8000000-0000-4000-8000-000000000004');
  v_bundle := public.get_client_commercial_document_bundle(
    'a8300000-0000-4000-8000-000000000001');
  PERFORM pg_temp.reset_role();

  SELECT part INTO v_basis
  FROM jsonb_array_elements(v_bundle->'parts') AS e(part)
  WHERE part->>'variant' = 'pricing_basis';
  ASSERT v_basis IS NOT NULL, 'T16: the homeowner reads the pricing basis (R22)';

  -- The four keys that hand a trade's bid to the homeowner, and through her to
  -- anyone she forwards her copy to.
  ASSERT NOT (v_basis->'payload' ? 'costLines'),
    format('T16: the trades AT COST must not cross a closed book: %s',
           v_basis->'payload'->'costLines');
  ASSERT NOT (v_basis->'payload' ? 'feeBps'),
    'T16: nor the multiplier that inverts the schedule';
  ASSERT NOT (v_basis->'payload' ? 'costBasisCents'),
    'T16: nor the cost basis';
  ASSERT NOT (v_basis->'payload' ? 'subMarkupBps'),
    'T16: nor the markup on the trades';

  -- What she gets instead: her own number, and the schedule derived from it.
  ASSERT (v_basis->'payload'->>'contractSumCents')::bigint = pg_temp.m('gmp'),
    'T16: the contract sum is HERS and travels explicitly';
  v_sov := v_basis->'payload'->'scheduleOfValues';
  ASSERT jsonb_array_length(v_sov) = 7,
    format('T16: seven pro-rated lines, got %s', jsonb_array_length(v_sov));
  ASSERT (v_sov->0->>'cents')::bigint = pg_temp.m('sov_cabinetry'),
    format('T16: pro-rated to the walk''s own table, got %s', v_sov->0->>'cents');
  SELECT sum((line->>'cents')::bigint) INTO v_total
  FROM jsonb_array_elements(v_sov) AS e(line);
  ASSERT v_total = pg_temp.m('gmp'),
    format('T16: the column sums to the contract price, got %s', v_total);

  -- The studio's own row is untouched: this is a projection, not a deletion.
  ASSERT (SELECT payload ? 'costLines' FROM public.proposal_agreement_parts
          WHERE proposal_id = 'a8300000-0000-4000-8000-000000000001'
            AND variant = 'pricing_basis'),
    'T16: the studio keeps its cost lines — only the client edge redacts';

  -- OPEN BOOK WITHHOLDS NOTHING. That is what the clause elects.
  v_open := public._agreement_redact_client_payload(
    'schedule', 'pricing_basis', pg_temp.pricing_basis(), 'open_book');
  ASSERT v_open ? 'costLines' AND v_open ? 'feeBps',
    'T16: open book is open';
  ASSERT jsonb_array_length(v_open->'scheduleOfValues') = 8,
    'T16: seven trades at cost and the fee as its own line';
  ASSERT (SELECT (line->>'cents')::bigint
          FROM jsonb_array_elements(v_open->'scheduleOfValues') AS e(line)
          WHERE line->>'id' = '__fee') = pg_temp.m('fee'),
    'T16: and the fee line IS the fee';

  -- Fail closed: a clause and a payload that disagree is not an open book.
  ASSERT NOT (public._agreement_redact_client_payload(
    'schedule', 'pricing_basis', pg_temp.pricing_basis(), 'conflict')
    ? 'costLines'),
    'T16: anything that is not open_book closes the book';

  -- And every other part crosses byte for byte.
  ASSERT (SELECT part->'payload' FROM jsonb_array_elements(v_bundle->'parts')
            AS e(part) WHERE part->>'variant' = 'draws')
         = (SELECT payload FROM public.proposal_agreement_parts
            WHERE proposal_id = 'a8300000-0000-4000-8000-000000000001'
              AND variant = 'draws'),
    'T16: the draw schedule is hers in full — the redaction is one part wide';

  RAISE NOTICE 'PASS T16: a closed book closes, an open one does not, and only the pricing basis is touched';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (T17) THE KEEPSAKE (B1, B2, R12). What she keeps is the page she signed —
--       so it carries the sum, the schedule, the draws and the retainage, and
--       it does not tell her the construction contract she signed authorized
--       design services only.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_html text;
  v_services text;
BEGIN
  SELECT html INTO v_html FROM public.agreement_execution_snapshots
  WHERE proposal_id = 'a8300000-0000-4000-8000-000000000001';
  ASSERT v_html IS NOT NULL, 'T17: countersigning freezes a copy';

  -- B1 — the three turnkey parts printed FIGURES, not the record-only line.
  ASSERT position('<h2>Pricing basis</h2><p>Recorded with your agreement.</p>'
                  IN v_html) = 0,
    'T17: the pricing basis is not "recorded with your agreement"';
  ASSERT position('<h2>Draw schedule</h2><p>Recorded with your agreement.</p>'
                  IN v_html) = 0,
    'T17: nor the draw schedule';
  ASSERT position('<h2>Allowances</h2><p>Recorded with your agreement.</p>'
                  IN v_html) = 0,
    'T17: nor the allowances';

  ASSERT position('Guaranteed maximum price' IN v_html) > 0,
    'T17: the keepsake names what the sum is';
  ASSERT position('$84,134' IN v_html) > 0, 'T17: and prints it';
  ASSERT position('<h2>Schedule of values</h2>' IN v_html) > 0,
    'T17: the schedule of values is on the page she signed';
  ASSERT position('$44,840' IN v_html) > 0,
    'T17: pro-rated, to the same cent the door printed';
  ASSERT position('$8,413.40' IN v_html) > 0,
    'T17: the deposit draw, TO THE CENT — _agreement_money would have said $8,413';
  ASSERT position('$23,978.19' IN v_html) > 0, 'T17: the rough-in net';
  ASSERT position('$3,786.03 is held back across the draws' IN v_html) > 0,
    'T17: and what is held back, in the client body''s own words';
  ASSERT position('Anything over this amount needs a change order first.'
                  IN v_html) > 0,
    'T17: an allowance says what happens when it runs over';
  ASSERT position('$4,000' IN v_html) > 0, 'T17: and how much it is';

  -- B3 again, on the durable record: a closed book stays closed in the copy
  -- she keeps for the life of the project.
  ASSERT position('Cost basis' IN v_html) = 0,
    'T17: the keepsake obeys the same disclosure the door did';
  ASSERT position('Fee 18%' IN v_html) = 0, 'T17: including the multiplier';

  -- B2 — the boundary belongs to the class.
  v_services := 'This agreement authorizes design services only.';
  ASSERT position(v_services IN v_html) = 0,
    'T17: a turnkey prime does not authorize design services only — that sentence is FALSE here';
  ASSERT position('This agreement covers the work described above, at the price shown.'
                  IN v_html) > 0,
    'T17: it closes with its own boundary, verbatim from design-build-body.tsx';

  -- And the services keepsake still closes the way it always did. The second
  -- turnkey agreement (T14) proves nothing about that, so read a composed
  -- design-services body's renderer output directly.
  ASSERT position('ATTACHMENT' IN v_html) >= 0, 'T17: attachments still letter';

  RAISE NOTICE 'PASS T17: the keepsake carries the money and closes with the right sentence';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (T18) THE SEEDED FLOW-DOWN CLAUSE IS ON FILE AND DARK (B4, R16).
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_entry jsonb;
  v_count integer;
BEGIN
  SELECT entry INTO v_entry
  FROM public.agreement_templates t,
       LATERAL jsonb_array_elements(t.parts) AS e(entry)
  WHERE t.template_key = 'patina.design_build'
    AND entry->>'partKey' = 'patina.flow_down';
  ASSERT v_entry IS NOT NULL,
    'T18: the flow-down wording exists, in one place, for counsel to read';
  ASSERT (v_entry->>'enabled')::boolean IS FALSE,
    'T18: and it ships DISABLED, like the six notices';
  ASSERT char_length(btrim(COALESCE(v_entry->'payload'->>'body', ''))) > 80,
    'T18: a seeded clause with no body is nothing for counsel to review';
  ASSERT (v_entry->>'clientVisible')::boolean IS FALSE,
    'T18: it is studio-to-trade wording, never the homeowner''s paper';

  -- It composes into nothing. The rail still lays out ten.
  PERFORM pg_temp.assume_user('a8000000-0000-4000-8000-000000000001');
  PERFORM pg_temp.mint_draft('a8300000-0000-4000-8000-000000000007',
                             'The flow-down draft');
  v_count := public.materialize_agreement_template(
    'a8300000-0000-4000-8000-000000000007', 'patina.design_build');
  ASSERT v_count = 10,
    format('T18: a disabled entry composes into nothing — ten parts, got %s',
           v_count);
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.proposal_agreement_parts
    WHERE part_key = 'patina.flow_down'),
    'T18: no agreement anywhere carries it';
  PERFORM pg_temp.reset_role();

  RAISE NOTICE 'PASS T18: the flow-down clause is seeded, dark, and composes into nothing';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (T19) THE LIEN WAIVER HAS A DOOR (M3, P12). The table is not writable from a
--       browser; the RPC validates the vocabulary and snapshots the trade.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_draw uuid;
  v_result jsonb;
  v_err text;
  v_bundle jsonb;
BEGIN
  ASSERT NOT has_table_privilege('authenticated',
                                 'public.agreement_draw_lien_waivers', 'INSERT'),
    'T19: no wave writes a business table outside a definer RPC';
  ASSERT has_table_privilege('authenticated',
                             'public.agreement_draw_lien_waivers', 'SELECT'),
    'T19: the studio still reads its own ledger';

  SELECT id INTO v_draw FROM public.agreement_draw_invoices
  WHERE proposal_id = 'a8300000-0000-4000-8000-000000000001'
    AND draw_key = 'rough_in';

  INSERT INTO public.studio_contacts (
    id, organization_id, entity_kind, contact_kind, full_name, company_name
  ) VALUES (
    'a8600000-0000-4000-8000-000000000001',
    'a8100000-0000-4000-8000-000000000001', 'company', 'trade',
    NULL, 'Halloran Cabinetry');

  -- A vocabulary nobody uses is refused, in the studio's own words.
  PERFORM pg_temp.assume_role('a8000000-0000-4000-8000-000000000001');
  BEGIN
    PERFORM public.record_agreement_draw_lien_waiver(v_draw, 'sort of waived');
    RAISE EXCEPTION 'T19: an unknown waiver type must be refused';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
  END;
  ASSERT v_err = 'a lien waiver is conditional or unconditional, on progress or final',
    format('T19: %L', v_err);

  v_result := public.record_agreement_draw_lien_waiver(
    v_draw, 'conditional_progress', 'a8600000-0000-4000-8000-000000000001',
    DATE '2028-08-31', 200000);
  PERFORM pg_temp.reset_role();

  ASSERT v_result->>'waiverType' = 'conditional_progress',
    format('T19: the exchange is recorded: %s', v_result);
  ASSERT v_result->>'contactDisplayName' = 'Halloran Cabinetry',
    'T19: the trade''s name is SNAPSHOTTED — the record outlives the roster row';
  ASSERT v_result->>'receivedAt' IS NOT NULL,
    'T19: recording an exchange means it happened';
  ASSERT (SELECT recorded_by FROM public.agreement_draw_lien_waivers
          WHERE id = (v_result->>'id')::uuid)
         = 'a8000000-0000-4000-8000-000000000001',
    'T19: the recorder is the session, never a column the caller filled in';

  -- A stranger cannot record one, and is told nothing about whether it exists.
  PERFORM pg_temp.assume_role('a8000000-0000-4000-8000-000000000009');
  BEGIN
    PERFORM public.record_agreement_draw_lien_waiver(v_draw, 'conditional_final');
    RAISE EXCEPTION 'T19: an outsider must be refused';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  PERFORM pg_temp.reset_role();

  -- And it reaches the homeowner as a type and a date, and nothing else.
  PERFORM pg_temp.assume_role('a8000000-0000-4000-8000-000000000004');
  v_bundle := public.get_client_commercial_document_bundle(
    'a8300000-0000-4000-8000-000000000001');
  PERFORM pg_temp.reset_role();
  ASSERT (SELECT draw->'lienWaiver'->>'type'
          FROM jsonb_array_elements(v_bundle->'designBuild'->'draws') AS e(draw)
          WHERE draw->>'drawKey' = 'rough_in') = 'conditional_progress',
    'T19: the homeowner learns the waiver was received';
  ASSERT (SELECT NOT (draw->'lienWaiver' ? 'amountCents')
          FROM jsonb_array_elements(v_bundle->'designBuild'->'draws') AS e(draw)
          WHERE draw->>'drawKey' = 'rough_in'),
    'T19: and never its amount, its paper, or the trade''s own storage path';

  RAISE NOTICE 'PASS T19: the waiver is recorded through one door, validated, and projected as two fields';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (T12) ACL — anon holds EXECUTE on none of the wave's new functions, and each
--       grantee tuple is exactly what the migration wrote.
--       Shape copied from 00571_studio_invoices.sql:1050-1080.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TEMP TABLE _db_acl (signature text PRIMARY KEY, grantees text[] NOT NULL)
  ON COMMIT DROP;
INSERT INTO _db_acl VALUES
  ('public.studio_has_live_license_attestation(uuid)', ARRAY['authenticated','service_role']),
  ('public.issue_agreement_draw_invoice(uuid,text)',   ARRAY['authenticated','service_role']),
  ('public._agreement_is_int(jsonb)',                  ARRAY['authenticated','service_role']),
  ('public._validate_pricing_basis_payload(jsonb)',    ARRAY['authenticated','service_role']),
  ('public._agreement_contract_sum_cents(jsonb)',      ARRAY['authenticated','service_role']),
  ('public._validate_draws_payload(jsonb)',            ARRAY['authenticated','service_role']),
  ('public._validate_allowances_payload(jsonb,jsonb)', ARRAY['authenticated','service_role']),
  ('public._validate_no_double_count(jsonb)',          ARRAY['authenticated','service_role']),
  ('public._agreement_draw_rows(jsonb,bigint)',        ARRAY['authenticated','service_role']),
  ('public._agreement_parts_json(uuid)',               ARRAY[]::text[]),
  ('public._agreement_design_build_part(uuid,text)',   ARRAY[]::text[]),
  ('public._agreement_sub_disclosure(uuid)',           ARRAY[]::text[]),
  ('public._agreement_design_build_subs(uuid,text)',   ARRAY[]::text[]),
  ('public.guard_agreement_draw_ledger()',             ARRAY[]::text[]),
  ('public._agreement_money_to_the_cent(numeric)',     ARRAY['authenticated','service_role']),
  ('public._agreement_schedule_of_values(jsonb,text)', ARRAY['authenticated','service_role']),
  ('public._agreement_redact_client_payload(text,text,jsonb,text)',
                                                       ARRAY['authenticated','service_role']),
  ('public.record_agreement_draw_lien_waiver(uuid,text,uuid,date,integer,text,timestamptz)',
                                                       ARRAY['authenticated']),
  ('public._render_agreement_snapshot_html(uuid)',     ARRAY[]::text[]);

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM _db_acl LOOP
    ASSERT to_regprocedure(r.signature) IS NOT NULL,
      format('T12: %s must exist', r.signature);
    ASSERT NOT EXISTS (
      SELECT 1 FROM pg_proc routine
      CROSS JOIN LATERAL aclexplode(
        COALESCE(routine.proacl, acldefault('f', routine.proowner))) AS acl
      JOIN pg_roles grantee ON grantee.oid = acl.grantee
      WHERE routine.oid = to_regprocedure(r.signature)
        AND grantee.rolname IN ('anon', 'public')
        AND acl.privilege_type = 'EXECUTE'
    ), format('T12: anon must hold EXECUTE on nothing new — %s', r.signature);

    ASSERT COALESCE((
      SELECT array_agg(DISTINCT grantee.rolname::text ORDER BY grantee.rolname::text)
      FROM pg_proc routine
      CROSS JOIN LATERAL aclexplode(
        COALESCE(routine.proacl, acldefault('f', routine.proowner))) AS acl
      JOIN pg_roles grantee ON grantee.oid = acl.grantee
      WHERE routine.oid = to_regprocedure(r.signature)
        AND acl.grantee <> routine.proowner
        AND acl.privilege_type = 'EXECUTE'
    ), ARRAY[]::text[]) = r.grantees,
      format('T12: %s grants drifted, got %s', r.signature, (
        SELECT array_agg(DISTINCT grantee.rolname::text ORDER BY grantee.rolname::text)
        FROM pg_proc routine
        CROSS JOIN LATERAL aclexplode(
          COALESCE(routine.proacl, acldefault('f', routine.proowner))) AS acl
        JOIN pg_roles grantee ON grantee.oid = acl.grantee
        WHERE routine.oid = to_regprocedure(r.signature)
          AND acl.grantee <> routine.proowner
          AND acl.privilege_type = 'EXECUTE'));
  END LOOP;

  -- The two new tables: anon reaches neither, and the client reaches the draw
  -- ledger only through the bundle.
  ASSERT NOT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name IN ('studio_license_attestations',
                         'agreement_jurisdiction_notices',
                         'agreement_draw_invoices',
                         'agreement_draw_lien_waivers')
      AND grantee IN ('anon', 'PUBLIC')
  ), 'T12: anon holds nothing on the wave''s new tables';

  RAISE NOTICE 'PASS T12: every new function is anon-denied by name and grants exactly what it should';
END $$;

ROLLBACK;
