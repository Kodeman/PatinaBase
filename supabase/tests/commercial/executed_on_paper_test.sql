-- 00425 Executed-on-paper integration test.
-- Runner: plain psql, ON_ERROR_STOP=1. The transaction rolls back.
-- Run:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f supabase/tests/commercial/executed_on_paper_test.sql
--
-- What this suite is for. A client who prints an agreement, signs it, and hands
-- it back has EXECUTED IT. 00425 lets the studio say so. The whole risk of that
-- feature is dishonesty in two directions, and both are what this suite pins:
--
--   · UNDER-recording — the paper rail quietly doing LESS than the portal rail,
--     so a paper-executed engagement is a second-class one: a project without
--     an authority, a wave that links no lines, a scope that issues no draw.
--     Sections 1, 4 and 5 answer this by building BOTH rails, in the same
--     suite, from identical fixtures, and diffing the resulting rows FIELD BY
--     FIELD. Not "the paper rail also produced a project" — the same project.
--
--   · OVER-recording — the paper rail claiming MORE than happened. A signature
--     that says the client signed when the studio did; an IP that implies a
--     browser; a scan pointer to somebody else's document; an acceptance
--     painted onto a scope nobody finished; a client's own copy that does not
--     say the act was recorded from paper. Sections 2, 3, 6, 7 and 9.
--
-- FALSIFIABILITY. Six refusals are proven to BITE rather than merely to be
-- present. The three actor gates are falsified the way 00423's section 10A
-- falsifies a predicate inside a function body: the live definition is rewritten
-- with the predicate removed and the refused call is shown to SUCCEED, inside a
-- SAVEPOINT that restores the definition on rollback. The terms-guard column
-- additions and the folio scan freeze are falsified the ordinary way, by
-- disabling the trigger; the widened folio write leg is falsified by putting
-- 00252's exact-designer policy back and watching the co-member's upload be
-- refused. Those blocks are marked FALSIFY.

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id uuid, p_role text DEFAULT 'authenticated')
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_user_id, 'role', p_role
  )::text, true);
END;
$$;

-- ── The field-identity oracle ─────────────────────────────────────────────
-- Two rails built from identical fixtures produce rows that differ only where
-- they MUST: surrogate keys and clock readings. shape() collapses exactly those
-- two classes to a token — preserving NULL-vs-set, which is itself a field —
-- and leaves every other value literal. What survives is the business content,
-- and that is what has to match.
CREATE OR REPLACE FUNCTION pg_temp.shape(p_row jsonb, p_drop text[] DEFAULT '{}')
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(jsonb_object_agg(e.key, CASE
    WHEN e.value = 'null'::jsonb THEN e.value
    WHEN jsonb_typeof(e.value) = 'string'
     AND (e.value #>> '{}') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN '"<uuid>"'::jsonb
    WHEN jsonb_typeof(e.value) = 'string'
     AND (e.value #>> '{}') ~ '^\d{4}-\d{2}-\d{2}[T ]\d{2}:'
      THEN '"<timestamp>"'::jsonb
    ELSE e.value END), '{}'::jsonb)
  FROM jsonb_each(p_row) AS e
  WHERE NOT (e.key = ANY (p_drop));
$$;

-- Which keys disagree, so a failure names the field rather than dumping two rows.
CREATE OR REPLACE FUNCTION pg_temp.jdiff(p_a jsonb, p_b jsonb)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(string_agg(
    format('%s: %s vs %s', k, COALESCE(p_a->>k, '∅'), COALESCE(p_b->>k, '∅')), '; '
    ORDER BY k), '(none)')
  FROM (SELECT jsonb_object_keys(p_a) AS k
        UNION SELECT jsonb_object_keys(p_b)) AS keys
  WHERE (p_a->k) IS DISTINCT FROM (p_b->k);
$$;

-- The paper date this suite records everything against. Deliberately in the
-- past: a printed copy is signed before it is typed in.
CREATE OR REPLACE FUNCTION pg_temp.paper_date() RETURNS date
LANGUAGE sql IMMUTABLE AS $$ SELECT (DATE '2026-01-15') $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (0) FIXTURE — one studio, one client, one outsider. Everything below is
--     built twice from here: once through the portal, once from paper.
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
) VALUES
  ('ea000000-0000-4000-8000-000000000001', 'paper-designer@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('ea000000-0000-4000-8000-000000000002', 'paper-client@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('ea000000-0000-4000-8000-000000000003', 'paper-outsider@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  -- A second seat in the SAME studio, who owns none of the documents below.
  -- The folio write leg (section 13) is entirely about this person.
  ('ea000000-0000-4000-8000-000000000004', 'paper-comember@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES
  ('ea000000-0000-4000-8000-000000000001', 'paper-designer@test.invalid', 'Paper Designer', true, now(), now()),
  ('ea000000-0000-4000-8000-000000000002', 'paper-client@test.invalid', 'Paper Client', false, now(), now()),
  ('ea000000-0000-4000-8000-000000000003', 'paper-outsider@test.invalid', 'Outside Designer', true, now(), now()),
  ('ea000000-0000-4000-8000-000000000004', 'paper-comember@test.invalid', 'Studio Co-member', true, now(), now())
ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, full_name = EXCLUDED.full_name;

INSERT INTO public.organizations (id, type, name, slug, status)
VALUES
  ('ea100000-0000-4000-8000-000000000001', 'design_studio', 'Paper Studio', 'paper-studio-test', 'active'),
  ('ea100000-0000-4000-8000-000000000002', 'design_studio', 'Other Studio', 'other-studio-test', 'active');
SELECT pg_temp.assume_user('ea000000-0000-4000-8000-000000000001', 'service_role');
INSERT INTO public.organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES
  ('ea110000-0000-4000-8000-000000000001', 'ea000000-0000-4000-8000-000000000001',
   'ea100000-0000-4000-8000-000000000001', 'owner', 'active', now()),
  ('ea110000-0000-4000-8000-000000000002', 'ea000000-0000-4000-8000-000000000003',
   'ea100000-0000-4000-8000-000000000002', 'owner', 'active', now()),
  ('ea110000-0000-4000-8000-000000000003', 'ea000000-0000-4000-8000-000000000004',
   'ea100000-0000-4000-8000-000000000001', 'member', 'active', now());

INSERT INTO public.designer_clients (id, designer_id, client_id, client_name, status, source)
VALUES (
  'ea200000-0000-4000-8000-000000000001',
  'ea000000-0000-4000-8000-000000000001',
  'ea000000-0000-4000-8000-000000000002',
  'Paper Client', 'proposal', 'direct'
);

INSERT INTO public.vendors (id, name, website)
VALUES ('ea710000-0000-4000-8000-000000000001', 'Paper Test Vendor',
        'https://paper-vendor.test.invalid');

CREATE TEMP TABLE paper_ids (key text PRIMARY KEY, value uuid NOT NULL) ON COMMIT DROP;

-- Mint a design-services agreement and send it. Called seven times below with
-- IDENTICAL content, so that any difference between the rails is the RAIL.
CREATE OR REPLACE FUNCTION pg_temp.mint_agreement(p_id uuid, p_title text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_snapshot jsonb;
BEGIN
  INSERT INTO public.proposals (
    id, designer_id, designer_client_id, client_id, title, description,
    total_amount, status, valid_until
  ) VALUES (
    p_id,
    'ea000000-0000-4000-8000-000000000001',
    'ea200000-0000-4000-8000-000000000001',
    'ea000000-0000-4000-8000-000000000002',
    p_title, 'The origin document.', 0, 'draft',
    DATE '2027-01-01'
  );
  INSERT INTO public.proposal_phases (
    proposal_id, name, phase_key, duration_days, lane, fee_cents, sort_order
  ) VALUES (p_id, 'Design development', 'design-development', 30, 'main', 0, 0);
  PERFORM public.upsert_design_services_draft(
    p_id,
    jsonb_build_object(
      'scope', 'Whole-home interior design services.',
      'deliverables', jsonb_build_array('Concept', 'Selections', 'Installation'),
      'exclusions', jsonb_build_array('Structural engineering'),
      'billingCeilingCents', 900000,
      'retainerAmountCents', 250000,
      'retainerActivationPolicy', 'immediate',
      'billingCadence', 'monthly', 'currency', 'USD',
      'terms', 'Actual hours to the signed ceiling.',
      'currentRateVersion', 1,
      'furnishingsDepositPercent', 30
    ),
    jsonb_build_array(jsonb_build_object(
      'version', 1, 'roleName', 'Lead Designer',
      'hourlyRateCents', 15000, 'sortOrder', 0, 'effectiveAt', DATE '2026-01-01'
    ))
  );
END $$;

CREATE OR REPLACE FUNCTION pg_temp.send_agreement(p_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_snapshot jsonb;
BEGIN
  v_snapshot := public.get_commercial_document_send_snapshot(p_id);
  PERFORM public.send_commercial_document(
    p_id, v_snapshot->>'documentFingerprint', NULL, TIMESTAMPTZ '2027-01-01 00:00:00+00'
  );
END $$;

SELECT pg_temp.assume_user('ea000000-0000-4000-8000-000000000001');
SELECT pg_temp.mint_agreement('ea300000-0000-4000-8000-000000000001', 'Paper rail engagement');
SELECT pg_temp.mint_agreement('ea300000-0000-4000-8000-000000000002', 'Paper rail engagement');
SELECT pg_temp.send_agreement('ea300000-0000-4000-8000-000000000001');
SELECT pg_temp.send_agreement('ea300000-0000-4000-8000-000000000002');

-- ═══════════════════════════════════════════════════════════════════════════
-- (1) THE HEADLINE — a design-services agreement executed on paper produces
--     the SAME engagement as one signed in the portal, and says so honestly.
-- ═══════════════════════════════════════════════════════════════════════════

-- CONTROL: the portal rail, unchanged.
SELECT pg_temp.assume_user('ea000000-0000-4000-8000-000000000002');
SELECT public.sign_design_services_agreement(
  'ea300000-0000-4000-8000-000000000001', 'Paper Client'
);
SELECT pg_temp.assume_user('ea000000-0000-4000-8000-000000000001');
DO $$
DECLARE v_executed jsonb;
BEGIN
  v_executed := public.countersign_design_services_agreement(
    'ea300000-0000-4000-8000-000000000001', 'Paper Designer'
  );
  ASSERT (v_executed->>'newlyExecuted')::boolean, 'control countersign';
  INSERT INTO paper_ids VALUES ('control_project', (v_executed->>'projectId')::uuid);
END $$;

-- PAPER: the studio uploads the scan first (signature rows are insert-only, so
-- there is no second chance to attach it), then records, then countersigns
-- through the UNCHANGED countersign RPC.
INSERT INTO public.project_documents (
  id, proposal_id, title, doc_type, category, storage_path, client_visible, uploaded_by
) VALUES (
  'ea900000-0000-4000-8000-000000000001',
  'ea300000-0000-4000-8000-000000000002',
  'Signed agreement — scan', 'pdf', 'contract',
  'ea300000-0000-4000-8000-000000000002/signed-agreement.pdf',
  false, 'ea000000-0000-4000-8000-000000000001'
);

DO $$
DECLARE
  v_recorded jsonb;
  v_executed jsonb;
  v_fingerprint text;
BEGIN
  v_fingerprint := public._commercial_document_fingerprint('ea300000-0000-4000-8000-000000000002');
  v_recorded := public.record_paper_client_signature(
    'ea300000-0000-4000-8000-000000000002', 'Paper Client', pg_temp.paper_date(),
    'ea900000-0000-4000-8000-000000000001'
  );
  ASSERT v_recorded->>'commercialState' = 'client_signed'
     AND (v_recorded->>'newlyClientSigned')::boolean
     AND (v_recorded->>'signedOnPaper')::boolean,
    'recording a paper signature leaves the document client-signed';
  ASSERT (v_recorded->>'paperSignedOn')::date = pg_temp.paper_date(),
    'the record answers with the date on the paper';

  -- (8) The fingerprint is taken at RECORD time, and the countersign that
  -- follows verifies against exactly it. If the record had hashed anything
  -- else, this countersign would raise 'requires the exact current client
  -- consent fingerprint'.
  ASSERT (SELECT evidence_fingerprint FROM public.commercial_document_signatures
          WHERE proposal_id = 'ea300000-0000-4000-8000-000000000002'
            AND party_role = 'client') = v_fingerprint,
    'the paper signature must carry the record-time document hash';

  v_executed := public.countersign_design_services_agreement(
    'ea300000-0000-4000-8000-000000000002', 'Paper Designer'
  );
  ASSERT (v_executed->>'newlyExecuted')::boolean,
    'the UNCHANGED countersign must execute a paper-recorded agreement';
  INSERT INTO paper_ids VALUES ('paper_project', (v_executed->>'projectId')::uuid);
  ASSERT (SELECT evidence_fingerprint FROM public.commercial_document_signatures
          WHERE proposal_id = 'ea300000-0000-4000-8000-000000000002'
            AND party_role = 'studio') = v_fingerprint,
    'the countersign hashes the same document the paper record did';
END $$;

-- The signature row itself: the client signed, there was no browser, and the
-- metadata carries the whole story.
DO $$
DECLARE s public.commercial_document_signatures%ROWTYPE;
BEGIN
  SELECT * INTO s FROM public.commercial_document_signatures
  WHERE proposal_id = 'ea300000-0000-4000-8000-000000000002' AND party_role = 'client';
  ASSERT s.signer_user_id = 'ea000000-0000-4000-8000-000000000002',
    'the SIGNER is the client — they signed, on paper';
  ASSERT s.party_role = 'client', 'the paper signature is not a studio signature';
  ASSERT s.signed_ip IS NULL, 'a paper signature has no IP, because it had no request';
  ASSERT s.signed_name = 'Paper Client', 'the name is the one on the paper';
  ASSERT s.metadata->>'via' = 'record_paper_client_signature'
     AND (s.metadata->>'executedOnPaper')::boolean
     AND (s.metadata->>'recordedBy')::uuid = 'ea000000-0000-4000-8000-000000000001'
     AND (s.metadata->>'paperSignedOn')::date = pg_temp.paper_date()
     AND (s.metadata->>'paperScanDocumentId')::uuid = 'ea900000-0000-4000-8000-000000000001',
    format('paper metadata is incomplete: %s', s.metadata);
  -- And the control carries none of it.
  ASSERT (SELECT COALESCE((metadata->>'executedOnPaper')::boolean, false)
          FROM public.commercial_document_signatures
          WHERE proposal_id = 'ea300000-0000-4000-8000-000000000001'
            AND party_role = 'client') = false,
    'a portal signature must not claim paper';
END $$;

-- FIELD IDENTITY. The two engagements are the same engagement.
DO $$
DECLARE
  v_control uuid := (SELECT value FROM paper_ids WHERE key = 'control_project');
  v_paper uuid := (SELECT value FROM paper_ids WHERE key = 'paper_project');
  a jsonb; b jsonb;
BEGIN
  ASSERT v_control IS DISTINCT FROM v_paper, 'two engagements, not one';

  -- project
  SELECT pg_temp.shape(to_jsonb(p)) INTO a FROM public.projects p WHERE p.id = v_control;
  SELECT pg_temp.shape(to_jsonb(p)) INTO b FROM public.projects p WHERE p.id = v_paper;
  ASSERT a = b, format('project rows differ — %s', pg_temp.jdiff(a, b));
  ASSERT (SELECT client_id FROM public.projects WHERE id = v_paper)
         = 'ea000000-0000-4000-8000-000000000002'
     AND (SELECT designer_id FROM public.projects WHERE id = v_paper)
         = 'ea000000-0000-4000-8000-000000000001',
    'the paper project belongs to the same two people';

  -- billing authority
  SELECT pg_temp.shape(to_jsonb(x)) INTO a FROM public.project_billing_authorities x
  WHERE x.project_id = v_control;
  SELECT pg_temp.shape(to_jsonb(x)) INTO b FROM public.project_billing_authorities x
  WHERE x.project_id = v_paper;
  ASSERT a IS NOT NULL AND a = b,
    format('billing authority rows differ — %s', pg_temp.jdiff(a, b));

  -- authority rate snapshots
  SELECT jsonb_agg(pg_temp.shape(to_jsonb(r)) ORDER BY r.role_name) INTO a
  FROM public.project_billing_authority_rates r
  JOIN public.project_billing_authorities x ON x.id = r.billing_authority_id
  WHERE x.project_id = v_control;
  SELECT jsonb_agg(pg_temp.shape(to_jsonb(r)) ORDER BY r.role_name) INTO b
  FROM public.project_billing_authority_rates r
  JOIN public.project_billing_authorities x ON x.id = r.billing_authority_id
  WHERE x.project_id = v_paper;
  ASSERT a IS NOT NULL AND a = b, 'authority rate snapshots differ';

  -- retainer invoice (invoice_number is a per-studio running counter, so it is
  -- expected to differ; every other field is not)
  SELECT pg_temp.shape(to_jsonb(i), ARRAY['invoice_number']) INTO a
  FROM public.invoices i WHERE i.project_id = v_control;
  SELECT pg_temp.shape(to_jsonb(i), ARRAY['invoice_number']) INTO b
  FROM public.invoices i WHERE i.project_id = v_paper;
  ASSERT a IS NOT NULL AND a = b,
    format('retainer invoice rows differ — %s', pg_temp.jdiff(a, b));
  ASSERT (SELECT total_cents FROM public.invoices WHERE project_id = v_paper) = 250000,
    'the paper rail issues the same retainer';

  -- the commercial binding
  SELECT pg_temp.shape(to_jsonb(d)) INTO a FROM public.project_commercial_documents d
  WHERE d.project_id = v_control;
  SELECT pg_temp.shape(to_jsonb(d)) INTO b FROM public.project_commercial_documents d
  WHERE d.project_id = v_paper;
  ASSERT a = b, format('commercial binding rows differ — %s', pg_temp.jdiff(a, b));
END $$;

-- The client's own copy says the signature was recorded from paper.
DO $$
DECLARE
  v_bundle jsonb;
  v_client jsonb;
  v_studio jsonb;
BEGIN
  PERFORM pg_temp.assume_user('ea000000-0000-4000-8000-000000000002');
  v_bundle := public.get_client_commercial_document_bundle('ea300000-0000-4000-8000-000000000002');
  SELECT s INTO v_client FROM jsonb_array_elements(v_bundle->'signatures') AS s
  WHERE s->>'partyRole' = 'client';
  SELECT s INTO v_studio FROM jsonb_array_elements(v_bundle->'signatures') AS s
  WHERE s->>'partyRole' = 'studio';
  ASSERT (v_client->>'signedOnPaper')::boolean,
    'the client bundle must say the client signature came from paper';
  ASSERT NOT (v_studio->>'signedOnPaper')::boolean,
    'the studio countersign happened here and must not claim paper';
  ASSERT NOT (v_client ? 'metadata') AND NOT (v_client ? 'recordedBy'),
    'raw signature metadata must never cross the client edge';

  -- ...AND WHEN. The date on the paper is the date the client signed; signed_at
  -- is the day the studio typed it up. The client's copy must be able to print
  -- the first, so the bundle has to carry it — without this key the surface has
  -- only signed_at and renders "SIGNED <the wrong day>".
  ASSERT v_client ? 'paperSignedOn',
    'the client bundle must carry the paper date key on a paper signature';
  ASSERT v_client->>'paperSignedOn' = pg_temp.paper_date()::text,
    format('the client bundle must carry the DATE ON THE PAPER — got %L, want %L',
           v_client->>'paperSignedOn', pg_temp.paper_date()::text);
  -- And the fixture must actually be able to tell the two apart, or the
  -- assertion above proves nothing.
  ASSERT (v_client->>'signedAt')::date <> pg_temp.paper_date(),
    'this fixture must separate the paper date from the record moment';
  ASSERT v_studio->>'paperSignedOn' IS NULL,
    'a countersign taken in the browser has no paper date';

  v_bundle := public.get_client_commercial_document_bundle('ea300000-0000-4000-8000-000000000001');
  SELECT s INTO v_client FROM jsonb_array_elements(v_bundle->'signatures') AS s
  WHERE s->>'partyRole' = 'client';
  ASSERT NOT (v_client->>'signedOnPaper')::boolean,
    'a portal-signed document must project signedOnPaper = false';
  ASSERT v_client->>'paperSignedOn' IS NULL,
    'a portal-signed document has no paper date to project';
  PERFORM pg_temp.assume_user('ea000000-0000-4000-8000-000000000001');
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (2) WHO MAY RECORD. Recording is a STUDIO act about a CLIENT act. Neither
--     the client nor another studio may perform it.
-- ═══════════════════════════════════════════════════════════════════════════

SELECT pg_temp.mint_agreement('ea300000-0000-4000-8000-000000000003', 'Access probe');
SELECT pg_temp.send_agreement('ea300000-0000-4000-8000-000000000003');

DO $$
DECLARE v_err text;
BEGIN
  -- The client cannot record their own paper signature. The portal is where
  -- they sign; the paper rail is the studio's account of what happened offline.
  PERFORM pg_temp.assume_user('ea000000-0000-4000-8000-000000000002');
  BEGIN
    PERFORM public.record_paper_client_signature(
      'ea300000-0000-4000-8000-000000000003', 'Paper Client', pg_temp.paper_date());
    ASSERT false, 'the client must not record a paper signature';
  EXCEPTION WHEN insufficient_privilege THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'design services agreement ea300000-0000-4000-8000-000000000003 not found or access denied',
    format('client-record refusal: %L', v_err);

  -- Another studio cannot either — and is told nothing about the document.
  PERFORM pg_temp.assume_user('ea000000-0000-4000-8000-000000000003');
  BEGIN
    PERFORM public.record_paper_client_signature(
      'ea300000-0000-4000-8000-000000000003', 'Paper Client', pg_temp.paper_date());
    ASSERT false, 'an outside studio must not record a paper signature';
  EXCEPTION WHEN insufficient_privilege THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'design services agreement ea300000-0000-4000-8000-000000000003 not found or access denied',
    format('outsider-record refusal: %L', v_err);
  PERFORM pg_temp.assume_user('ea000000-0000-4000-8000-000000000001');
END $$;

-- FALSIFY (1/6) — record_paper_client_signature's actor gate. With
-- _can_author_proposal removed from the live body the client's own call lands,
-- which is what makes the two refusals above a test of THAT predicate.
SAVEPOINT falsify_record_actor;
DO $$
DECLARE v_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = '_record_paper_client_signature_impl';
  ASSERT position('NOT public._can_author_proposal(v_proposal.designer_id)' IN v_def) > 0,
    'FALSIFY setup: the actor predicate must be findable in the live definition';
  EXECUTE replace(v_def,
    'NOT public._can_author_proposal(v_proposal.designer_id)', 'false');
END $$;
DO $$
DECLARE v_result jsonb;
BEGIN
  PERFORM pg_temp.assume_user('ea000000-0000-4000-8000-000000000002');
  v_result := public.record_paper_client_signature(
    'ea300000-0000-4000-8000-000000000003', 'Paper Client', pg_temp.paper_date());
  ASSERT (v_result->>'newlyClientSigned')::boolean,
    'FALSIFY: with the actor predicate stripped the client call must succeed, proving the gate is what refused it';
  PERFORM pg_temp.assume_user('ea000000-0000-4000-8000-000000000001');
END $$;
ROLLBACK TO SAVEPOINT falsify_record_actor;

-- ═══════════════════════════════════════════════════════════════════════════
-- (3) STATE. A paper signature is recordable from ONE state — sent. Every
--     other state refuses by name, and the two terminal ones say so as
--     terminal rather than as "not yet".
-- ═══════════════════════════════════════════════════════════════════════════

SELECT pg_temp.mint_agreement('ea300000-0000-4000-8000-000000000004', 'Draft probe');
SELECT pg_temp.mint_agreement('ea300000-0000-4000-8000-000000000005', 'Client-signed probe');
SELECT pg_temp.send_agreement('ea300000-0000-4000-8000-000000000005');
SELECT pg_temp.mint_agreement('ea300000-0000-4000-8000-000000000006', 'Superseded probe');
SELECT pg_temp.send_agreement('ea300000-0000-4000-8000-000000000006');
SELECT pg_temp.mint_agreement('ea300000-0000-4000-8000-000000000007', 'Declined probe');
SELECT pg_temp.send_agreement('ea300000-0000-4000-8000-000000000007');

SELECT pg_temp.assume_user('ea000000-0000-4000-8000-000000000002');
SELECT public.sign_design_services_agreement(
  'ea300000-0000-4000-8000-000000000005', 'Paper Client'
);
SELECT public.decline_proposal('ea300000-0000-4000-8000-000000000007', 'Going another way.');
SELECT pg_temp.assume_user('ea000000-0000-4000-8000-000000000001');

-- Retiring a design-services edition has no first-class RPC; the guard's
-- canonical GUC is the only door, and this suite runs as postgres, so it is the
-- same door the rail itself uses.
DO $$
BEGIN
  PERFORM set_config('app.commercial_document_id', 'ea300000-0000-4000-8000-000000000006', true);
  UPDATE public.proposals SET
    commercial_state = 'superseded', superseded_at = now(),
    superseded_reason = 'Repriced.', updated_at = now()
  WHERE id = 'ea300000-0000-4000-8000-000000000006';
  PERFORM set_config('app.commercial_document_id', '', true);
END $$;

DO $$
DECLARE
  v_err text;
  v_case record;
BEGIN
  FOR v_case IN
    SELECT * FROM (VALUES
      ('ea300000-0000-4000-8000-000000000004'::uuid, 'draft',
       'design services agreement ea300000-0000-4000-8000-000000000004 is not recordable on paper (draft)'),
      ('ea300000-0000-4000-8000-000000000005'::uuid, 'client_signed',
       'design services agreement ea300000-0000-4000-8000-000000000005 is not recordable on paper (client_signed)'),
      ('ea300000-0000-4000-8000-000000000001'::uuid, 'executed',
       'design services agreement ea300000-0000-4000-8000-000000000001 is not recordable on paper (executed)'),
      ('ea300000-0000-4000-8000-000000000006'::uuid, 'superseded',
       'design services agreement ea300000-0000-4000-8000-000000000006 is superseded and can no longer be recorded on paper'),
      ('ea300000-0000-4000-8000-000000000007'::uuid, 'declined',
       'design services agreement ea300000-0000-4000-8000-000000000007 is declined and can no longer be recorded on paper')
    ) AS t(id, state, message)
  LOOP
    ASSERT (SELECT commercial_state FROM public.proposals WHERE id = v_case.id) = v_case.state,
      format('fixture for %s is not in %s', v_case.id, v_case.state);
    v_err := NULL;
    BEGIN
      PERFORM public.record_paper_client_signature(
        v_case.id, 'Paper Client', pg_temp.paper_date());
      ASSERT false, format('a %s agreement must not accept a paper record', v_case.state);
    EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
    END;
    ASSERT v_err = v_case.message,
      format('%s refusal: %L (wanted %L)', v_case.state, v_err, v_case.message);
  END LOOP;
END $$;

-- The paper date is provenance, so it is required and it cannot be invented.
DO $$
DECLARE v_err text;
BEGIN
  BEGIN
    PERFORM public.record_paper_client_signature(
      'ea300000-0000-4000-8000-000000000003', 'Paper Client', NULL);
    ASSERT false, 'a paper record with no date must be refused';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'recording a signature on paper requires the date the client signed the printed copy',
    format('missing-date refusal: %L', v_err);

  BEGIN
    PERFORM public.record_paper_client_signature(
      'ea300000-0000-4000-8000-000000000003', 'Paper Client', current_date + 1);
    ASSERT false, 'a paper record dated tomorrow must be refused';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'a paper signature cannot be dated in the future',
    format('future-date refusal: %L', v_err);
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (7) THE SCAN POINTER. Optional; but a pointer at somebody else's document is
--     not a provenance record, it is a mislabelled one.
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO public.project_documents (
  id, proposal_id, title, doc_type, category, storage_path, client_visible, uploaded_by
) VALUES (
  'ea900000-0000-4000-8000-000000000002',
  'ea300000-0000-4000-8000-000000000001',      -- the CONTROL agreement
  'Someone else''s scan', 'pdf', 'contract',
  'ea300000-0000-4000-8000-000000000001/other.pdf',
  true, 'ea000000-0000-4000-8000-000000000001'
);

DO $$
DECLARE v_err text;
BEGIN
  BEGIN
    PERFORM public.record_paper_client_signature(
      'ea300000-0000-4000-8000-000000000003', 'Paper Client', pg_temp.paper_date(),
      'ea900000-0000-4000-8000-000000000002');
    ASSERT false, 'a scan filed against another document must not be accepted';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'the scanned paper original must be filed against this document',
    format('foreign-scan refusal: %L', v_err);
  ASSERT NOT EXISTS (SELECT 1 FROM public.commercial_document_signatures
    WHERE proposal_id = 'ea300000-0000-4000-8000-000000000003'),
    'a refused record must leave no signature behind';
  ASSERT (SELECT commercial_state FROM public.proposals
          WHERE id = 'ea300000-0000-4000-8000-000000000003') = 'sent',
    'a refused record must leave the document where it was';
END $$;
-- (The valid pointer is proven in section 1: the scan landed in metadata.)

-- ═══════════════════════════════════════════════════════════════════════════
-- (9) THE SCAN, ON THE CLIENT'S COPY. Projected only when the studio actually
--     shared the file. The bundle is SECURITY DEFINER, so project_documents
--     RLS is not in force inside it and the flag has to be read on purpose.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE v_client jsonb;
BEGIN
  PERFORM pg_temp.assume_user('ea000000-0000-4000-8000-000000000002');
  SELECT s INTO v_client FROM jsonb_array_elements(
    public.get_client_commercial_document_bundle('ea300000-0000-4000-8000-000000000002')->'signatures'
  ) AS s WHERE s->>'partyRole' = 'client';
  ASSERT v_client->>'paperScanDocumentId' IS NULL,
    'an unshared scan must not reach the client bundle';

  PERFORM pg_temp.assume_user('ea000000-0000-4000-8000-000000000001');
END $$;

-- The positive leg needs its OWN fixture, because sharing is decided at UPLOAD
-- and never after: the scan above is named by an immutable signature, so
-- guard_project_documents_paper_scan freezes its client_visible flag where it
-- stands (section 10 proves that refusal). The sheet's contract is therefore
-- upload-shared-or-not, then record.
SELECT pg_temp.mint_agreement('ea300000-0000-4000-8000-000000000008', 'Shared scan probe');
SELECT pg_temp.send_agreement('ea300000-0000-4000-8000-000000000008');
INSERT INTO public.project_documents (
  id, proposal_id, title, doc_type, category, storage_path, client_visible, uploaded_by
) VALUES (
  'ea900000-0000-4000-8000-000000000003',
  'ea300000-0000-4000-8000-000000000008',
  'Signed agreement — shared scan', 'pdf', 'contract',
  'ea300000-0000-4000-8000-000000000008/signed-agreement.pdf',
  true, 'ea000000-0000-4000-8000-000000000001'
);
DO $$
DECLARE v_client jsonb;
BEGIN
  PERFORM public.record_paper_client_signature(
    'ea300000-0000-4000-8000-000000000008', 'Paper Client', pg_temp.paper_date(),
    'ea900000-0000-4000-8000-000000000003');

  PERFORM pg_temp.assume_user('ea000000-0000-4000-8000-000000000002');
  SELECT s INTO v_client FROM jsonb_array_elements(
    public.get_client_commercial_document_bundle('ea300000-0000-4000-8000-000000000008')->'signatures'
  ) AS s WHERE s->>'partyRole' = 'client';
  ASSERT (v_client->>'paperScanDocumentId')::uuid = 'ea900000-0000-4000-8000-000000000003',
    'a shared scan must reach the client bundle';
  PERFORM pg_temp.assume_user('ea000000-0000-4000-8000-000000000001');
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- (10) THE SCAN FREEZES. A paper act leaves one artifact anybody can look at.
--      The signature naming it is immutable forever; the file it names was not,
--      until now — it could be re-uploaded over, re-anchored to another
--      document, un-shared from the client who signed it, or deleted outright,
--      and the ledger would go on asserting a provenance that no longer exists.
-- ════════════════════════════════════════════════════════════════════════════

-- An ordinary folio file on the same proposal, named by nothing.
INSERT INTO public.project_documents (
  id, proposal_id, title, doc_type, category, storage_path, client_visible, uploaded_by
) VALUES (
  'ea900000-0000-4000-8000-000000000009',
  'ea300000-0000-4000-8000-000000000002',
  'Space plan — not evidence', 'pdf', 'drawing',
  'ea300000-0000-4000-8000-000000000002/space-plan.pdf',
  false, 'ea000000-0000-4000-8000-000000000001'
);

DO $$
DECLARE
  v_scan uuid := 'ea900000-0000-4000-8000-000000000001';
  v_instrument uuid := 'ea300000-0000-4000-8000-000000000002';
  v_frozen text := format(
    'this file is the scanned paper original recorded against commercial document %s, so its file, its sharing and its anchor are fixed',
    v_instrument);
  v_undeletable text := format(
    'this file is the scanned paper original recorded against commercial document %s, and cannot be deleted',
    v_instrument);
  v_err text;
BEGIN
  -- The three fields the signature actually relied on. Re-filing it points the
  -- record at a different object in the bucket; re-anchoring it points a
  -- different document at the client's signature page; un-sharing it empties
  -- the client's own copy of the only proof they signed anything.
  v_err := NULL;
  BEGIN
    UPDATE public.project_documents
    SET storage_path = 'ea300000-0000-4000-8000-000000000002/somebody-elses.pdf'
    WHERE id = v_scan;
    ASSERT false, 're-filing a recorded paper original must be refused';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = v_frozen, format('storage_path freeze: %L (wanted %L)', v_err, v_frozen);

  v_err := NULL;
  BEGIN
    UPDATE public.project_documents SET client_visible = true WHERE id = v_scan;
    ASSERT false, 're-sharing a recorded paper original must be refused';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = v_frozen, format('client_visible freeze: %L (wanted %L)', v_err, v_frozen);

  v_err := NULL;
  BEGIN
    UPDATE public.project_documents
    SET proposal_id = 'ea300000-0000-4000-8000-000000000001'
    WHERE id = v_scan;
    ASSERT false, 're-anchoring a recorded paper original must be refused';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = v_frozen, format('proposal_id freeze: %L (wanted %L)', v_err, v_frozen);

  -- Nothing else about the row is frozen: the guard names the three fields the
  -- provenance record leans on, not the whole row.
  UPDATE public.project_documents
  SET title = 'Signed agreement — scan (renamed)'
  WHERE id = v_scan;
  ASSERT (SELECT title FROM public.project_documents WHERE id = v_scan)
         = 'Signed agreement — scan (renamed)',
    'a recorded scan must still be re-titleable';

  -- And it cannot be taken away at all.
  v_err := NULL;
  BEGIN
    DELETE FROM public.project_documents WHERE id = v_scan;
    ASSERT false, 'deleting a recorded paper original must be refused';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = v_undeletable,
    format('delete freeze: %L (wanted %L)', v_err, v_undeletable);
  ASSERT EXISTS (SELECT 1 FROM public.project_documents WHERE id = v_scan),
    'the refused delete must have left the scan behind';

  -- An unrelated folio row on the SAME proposal is untouched by any of it.
  UPDATE public.project_documents
  SET storage_path = 'ea300000-0000-4000-8000-000000000002/space-plan-v2.pdf',
      client_visible = true
  WHERE id = 'ea900000-0000-4000-8000-000000000009';
  DELETE FROM public.project_documents WHERE id = 'ea900000-0000-4000-8000-000000000009';
  ASSERT NOT EXISTS (SELECT 1 FROM public.project_documents
    WHERE id = 'ea900000-0000-4000-8000-000000000009'),
    'an ordinary folio file must remain an ordinary folio file';
END $$;

-- FALSIFY (5/6) — guard_project_documents_paper_scan. With the trigger off every
-- one of the writes above lands, which is what makes those five refusals a test
-- of THIS guard and not of some other freeze on the folio.
SAVEPOINT falsify_scan_freeze;
ALTER TABLE public.project_documents DISABLE TRIGGER guard_project_documents_paper_scan_trg;
DO $$
DECLARE v_scan uuid := 'ea900000-0000-4000-8000-000000000001';
BEGIN
  UPDATE public.project_documents SET
    storage_path = 'ea300000-0000-4000-8000-000000000002/somebody-elses.pdf',
    client_visible = true,
    proposal_id = 'ea300000-0000-4000-8000-000000000001'
  WHERE id = v_scan;
  ASSERT (SELECT client_visible AND proposal_id = 'ea300000-0000-4000-8000-000000000001'
          FROM public.project_documents WHERE id = v_scan),
    'FALSIFY: with the scan guard off the re-file, re-share and re-anchor must all land';
  DELETE FROM public.project_documents WHERE id = v_scan;
  ASSERT NOT EXISTS (SELECT 1 FROM public.project_documents WHERE id = v_scan),
    'FALSIFY: with the scan guard off the scan must be deletable, proving the guard is what refused it';
END $$;
ROLLBACK TO SAVEPOINT falsify_scan_freeze;

-- ════════════════════════════════════════════════════════════════════════════
-- (11) RECORDING TWICE. A submit that succeeded and then lost its answer is the
--      ordinary failure of a form on a phone. It must not turn a recorded act
--      into an error message — and it must not become a licence to overwrite
--      one either.
-- ════════════════════════════════════════════════════════════════════════════
SELECT pg_temp.mint_agreement('ea300000-0000-4000-8000-000000000009', 'Retry probe');
SELECT pg_temp.send_agreement('ea300000-0000-4000-8000-000000000009');

DO $$
DECLARE
  v_id uuid := 'ea300000-0000-4000-8000-000000000009';
  v_first jsonb;
  v_again jsonb;
  v_err text;
BEGIN
  v_first := public.record_paper_client_signature(v_id, 'Paper Client', pg_temp.paper_date());
  ASSERT (v_first->>'recorded')::boolean AND (v_first->>'newlyClientSigned')::boolean,
    'the first record is a record';

  -- The retry: same act, same answer, no second row.
  v_again := public.record_paper_client_signature(v_id, 'Paper Client', pg_temp.paper_date());
  ASSERT NOT (v_again->>'recorded')::boolean
     AND NOT (v_again->>'newlyClientSigned')::boolean,
    'a retry over the same paper record must not claim to have recorded anything';
  ASSERT (v_again->>'signatureId')::uuid = (v_first->>'signatureId')::uuid,
    'a retry must answer with the row that is already there';
  ASSERT (v_again->>'evidenceFingerprint') = (v_first->>'evidenceFingerprint')
     AND (v_again->>'paperSignedOn')::date = pg_temp.paper_date()
     AND (v_again->>'signedOnPaper')::boolean,
    'a retry must answer with the recorded evidence, not a fresh one';
  ASSERT v_again->>'commercialState' = 'client_signed',
    'a retry answers with where the document actually is';
  ASSERT (SELECT count(*) FROM public.commercial_document_signatures
          WHERE proposal_id = v_id) = 1,
    'a retry must leave exactly one signature';

  -- A DIFFERENT name is a different act, not a retry, and the state guard says
  -- so in the same words it always did.
  v_err := NULL;
  BEGIN
    PERFORM public.record_paper_client_signature(v_id, 'Someone Else', pg_temp.paper_date());
    ASSERT false, 'a paper record under another name must not pass as a retry';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = format(
      'design services agreement %s is not recordable on paper (client_signed)', v_id),
    format('different-name refusal: %L', v_err);

  -- A PORTAL signature is not a paper record either, so it is not a retry.
  -- (Section 3 already walks the whole state table; this is the same refusal,
  -- named here because it is the conflict this branch is built to let through.)
  v_err := NULL;
  BEGIN
    PERFORM public.record_paper_client_signature(
      'ea300000-0000-4000-8000-000000000005', 'Paper Client', pg_temp.paper_date());
    ASSERT false, 'a portal-signed document must not be recordable as paper';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'design services agreement ea300000-0000-4000-8000-000000000005 is not recordable on paper (client_signed)',
    format('portal-conflict refusal: %L', v_err);

  -- And the retry survives execution: the section-1 agreement was recorded on
  -- paper and then countersigned, and a late duplicate submit still answers
  -- with the row rather than raising.
  v_again := public.record_paper_client_signature(
    'ea300000-0000-4000-8000-000000000002', 'Paper Client', pg_temp.paper_date());
  ASSERT NOT (v_again->>'recorded')::boolean
     AND v_again->>'commercialState' = 'executed'
     AND (v_again->>'paperScanDocumentId')::uuid = 'ea900000-0000-4000-8000-000000000001',
    'a retry after countersign must answer with the executed document and its scan';
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- (12) THE ANCHOR, ON THE READ EDGE. The bundle re-checks that the scan it is
--      about to hand the client is still filed against THIS document. Both
--      other seams already say so — the record rails validate the anchor, the
--      folio guard freezes it — and the read edge trusts neither, because a
--      pointer that survived into the client's copy is the one place a
--      mislabelled provenance record actually reaches a person.
-- ════════════════════════════════════════════════════════════════════════════
SELECT pg_temp.mint_agreement('ea300000-0000-4000-8000-00000000000a', 'Anchor probe');
SELECT pg_temp.send_agreement('ea300000-0000-4000-8000-00000000000a');

-- The pointer is written by FIXTURE BYPASS, as postgres, straight into the
-- table: the RPCs refuse a foreign anchor (section 7) and the folio guard now
-- refuses to move one, so a row in this shape cannot be built through any door
-- the product owns. That is exactly why the read edge is worth a check — the
-- question it answers is what happens if one exists anyway.
INSERT INTO public.commercial_document_signatures (
  proposal_id, party_role, signer_user_id, signed_name, signed_ip,
  evidence_fingerprint, metadata
) VALUES (
  'ea300000-0000-4000-8000-00000000000a', 'client',
  'ea000000-0000-4000-8000-000000000002', 'Paper Client', NULL,
  public._commercial_document_fingerprint('ea300000-0000-4000-8000-00000000000a'),
  jsonb_build_object(
    'via', 'fixture_bypass',
    'executedOnPaper', true,
    'recordedBy', 'ea000000-0000-4000-8000-000000000001',
    'paperSignedOn', pg_temp.paper_date(),
    -- Filed against the CONTROL agreement, and client_visible — so a bundle
    -- that read only the sharing flag would hand it over.
    'paperScanDocumentId', 'ea900000-0000-4000-8000-000000000002'
  )
);

DO $$
DECLARE v_client jsonb;
BEGIN
  ASSERT (SELECT client_visible FROM public.project_documents
          WHERE id = 'ea900000-0000-4000-8000-000000000002'),
    'the foreign scan must be SHARED, or this test proves the wrong thing';
  ASSERT (SELECT proposal_id FROM public.project_documents
          WHERE id = 'ea900000-0000-4000-8000-000000000002')
         IS DISTINCT FROM 'ea300000-0000-4000-8000-00000000000a',
    'the foreign scan must be anchored elsewhere, or this test proves the wrong thing';

  PERFORM pg_temp.assume_user('ea000000-0000-4000-8000-000000000002');
  SELECT s INTO v_client FROM jsonb_array_elements(
    public.get_client_commercial_document_bundle('ea300000-0000-4000-8000-00000000000a')->'signatures'
  ) AS s WHERE s->>'partyRole' = 'client';
  ASSERT (v_client->>'signedOnPaper')::boolean,
    'the fixture signature must still read as paper, or the NULL below means nothing';
  ASSERT v_client->>'paperScanDocumentId' IS NULL,
    'a shared scan filed against another document must not reach this client bundle';
  PERFORM pg_temp.assume_user('ea000000-0000-4000-8000-000000000001');
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- (13) THE FOLIO WRITE LEG. The scan must be uploaded BEFORE the record, in one
--      submit, because signature rows are insert-only. So the two authorities
--      have to agree: whoever may record must also be able to upload. 00252
--      keyed the folio write leg on the exact designer; the RPCs key on
--      _can_author_proposal. A co-member sat in the gap.
-- ════════════════════════════════════════════════════════════════════════════
SELECT pg_temp.mint_agreement('ea300000-0000-4000-8000-00000000000b', 'Co-member probe');
SELECT pg_temp.send_agreement('ea300000-0000-4000-8000-00000000000b');

-- Everything above ran as postgres, which is nobody's RLS. This section is the
-- one place the suite becomes an ordinary signed-in user: SET LOCAL ROLE
-- authenticated, so project_documents policies are actually in force.
DO $$
DECLARE
  v_recorded jsonb;
  v_paper_date date := pg_temp.paper_date();
BEGIN
  -- pg_temp helpers are resolved BEFORE the role switch: a temp schema belongs
  -- to the session that made it, and `authenticated` has no business in it.
  PERFORM pg_temp.assume_user('ea000000-0000-4000-8000-000000000004');
  EXECUTE 'SET LOCAL ROLE authenticated';

  INSERT INTO public.project_documents (
    id, proposal_id, title, doc_type, category, storage_path, client_visible, uploaded_by
  ) VALUES (
    'ea900000-0000-4000-8000-00000000000b',
    'ea300000-0000-4000-8000-00000000000b',
    'Signed agreement — co-member upload', 'pdf', 'contract',
    'ea300000-0000-4000-8000-00000000000b/signed-agreement.pdf',
    true, 'ea000000-0000-4000-8000-000000000004'
  );

  v_recorded := public.record_paper_client_signature(
    'ea300000-0000-4000-8000-00000000000b', 'Paper Client', v_paper_date,
    'ea900000-0000-4000-8000-00000000000b');
  ASSERT (v_recorded->>'newlyClientSigned')::boolean
     AND (v_recorded->>'paperScanDocumentId')::uuid = 'ea900000-0000-4000-8000-00000000000b',
    'a studio co-member must be able to walk the whole paper rail: upload, then record';

  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.assume_user('ea000000-0000-4000-8000-000000000001');
END $$;

-- The storage leg is regrafted in the same breath and on the same predicate;
-- exercising a bucket write needs storage plumbing this suite does not have, so
-- it is pinned at the definition instead.
DO $$
DECLARE v_qual text;
BEGIN
  SELECT qual INTO v_qual FROM pg_policies
  WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'Designers manage proposal folio objects';
  ASSERT v_qual IS NOT NULL, 'the storage folio write leg must exist';
  ASSERT position('is_design_studio_comember' IN v_qual) > 0,
    format('the storage folio write leg must carry the co-member predicate: %s', v_qual);
  ASSERT position('auth.uid()' IN v_qual) = 0,
    format('the storage folio write leg must no longer gate on the exact designer: %s', v_qual);
END $$;

-- FALSIFY (6/6) — the widened folio write leg. Put 00252's exact-designer
-- policy back and the co-member's upload is refused, which is what makes the
-- insert above a test of THAT widening.
SAVEPOINT falsify_folio_leg;
DROP POLICY IF EXISTS "Designers manage proposal folio" ON public.project_documents;
CREATE POLICY "Designers manage proposal folio"
  ON public.project_documents FOR ALL TO authenticated
  USING (
    proposal_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.proposals pr
                WHERE pr.id = project_documents.proposal_id
                  AND pr.designer_id = auth.uid())
  )
  WITH CHECK (
    proposal_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.proposals pr
                WHERE pr.id = project_documents.proposal_id
                  AND pr.designer_id = auth.uid())
  );
DO $$
DECLARE v_err text;
BEGIN
  PERFORM pg_temp.assume_user('ea000000-0000-4000-8000-000000000004');
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    INSERT INTO public.project_documents (
      proposal_id, title, doc_type, category, storage_path, client_visible, uploaded_by
    ) VALUES (
      'ea300000-0000-4000-8000-00000000000b', 'Refused upload', 'pdf', 'contract',
      'ea300000-0000-4000-8000-00000000000b/refused.pdf', true,
      'ea000000-0000-4000-8000-000000000004'
    );
    ASSERT false,
      'FALSIFY: under 00252''s exact-designer leg the co-member upload must be refused';
  EXCEPTION WHEN insufficient_privilege THEN v_err := SQLERRM;
  END;
  ASSERT v_err IS NOT NULL,
    'FALSIFY: the narrow leg must refuse with 42501, proving the widening is what admitted the upload';
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.assume_user('ea000000-0000-4000-8000-000000000001');
END $$;
ROLLBACK TO SAVEPOINT falsify_folio_leg;

-- ═══════════════════════════════════════════════════════════════════════════
-- (4) FURNISHINGS. Two identical schedules, two identical waves, one released
--     through the portal and one from paper. The wave EXECUTES either way,
--     and what it does is the same thing.
-- ═══════════════════════════════════════════════════════════════════════════

-- Identical schedules on both projects.
DO $$
DECLARE
  v_project uuid;
  v_room uuid;
  v_key text;
BEGIN
  FOREACH v_key IN ARRAY ARRAY['control_project', 'paper_project'] LOOP
    v_project := (SELECT value FROM paper_ids WHERE key = v_key);
    INSERT INTO public.project_rooms (project_id, name, sort_order)
    VALUES (v_project, 'Living room', 0) RETURNING id INTO v_room;
    INSERT INTO paper_ids VALUES (v_key || '_room', v_room);
    INSERT INTO public.project_ffe_items (
      project_id, project_room_id, name, ffe_category, item_type, status,
      quantity, unit_price_cents, trade_price_cents, markup_percent,
      line_total_cents, vendor_id, vendor_name, doc_code, sort_order
    ) VALUES
      (v_project, v_room, 'Lounge sofa', 'Seating', 'fixed', 'specified',
       1, 400000, 240000, 66.67, 400000,
       'ea710000-0000-4000-8000-000000000001', 'Paper Test Vendor', 'LR-01', 0),
      (v_project, v_room, 'Side table', 'Casegoods', 'fixed', 'specified',
       2, 50000, 30000, 66.67, 100000,
       'ea710000-0000-4000-8000-000000000001', 'Paper Test Vendor', 'LR-02', 1);
  END LOOP;
END $$;

DO $$
DECLARE
  v_project uuid;
  v_budget jsonb;
  v_published jsonb;
  v_key text;
BEGIN
  FOREACH v_key IN ARRAY ARRAY['control_project', 'paper_project'] LOOP
    v_project := (SELECT value FROM paper_ids WHERE key = v_key);
    v_budget := public.derive_working_budget_draft(v_project);
    v_published := public.publish_budget_checkpoint(
      v_project, (v_budget->'version'->>'id')::uuid);
    INSERT INTO paper_ids VALUES (v_key || '_checkpoint', (v_published->>'checkpointId')::uuid);
  END LOOP;
END $$;
SELECT pg_temp.assume_user('ea000000-0000-4000-8000-000000000002');
SELECT public.acknowledge_budget_checkpoint(value)
FROM paper_ids WHERE key IN ('control_project_checkpoint', 'paper_project_checkpoint');
SELECT pg_temp.assume_user('ea000000-0000-4000-8000-000000000001');

DO $$
DECLARE
  v_project uuid;
  v_release jsonb;
  v_snapshot jsonb;
  v_key text;
BEGIN
  FOREACH v_key IN ARRAY ARRAY['control_project', 'paper_project'] LOOP
    v_project := (SELECT value FROM paper_ids WHERE key = v_key);
    v_release := public.create_furnishings_authorization_from_schedule(
      v_project, 'Release one',
      ARRAY(SELECT i.id FROM public.project_ffe_items i
            WHERE i.project_id = v_project ORDER BY i.sort_order),
      NULL);
    INSERT INTO paper_ids VALUES
      (v_key || '_wave', (v_release->>'proposalId')::uuid),
      (v_key || '_wave_doc', (v_release->>'documentId')::uuid);
    v_snapshot := public.get_commercial_document_send_snapshot((v_release->>'proposalId')::uuid);
    PERFORM public.send_commercial_document(
      (v_release->>'proposalId')::uuid, v_snapshot->>'documentFingerprint',
      NULL, TIMESTAMPTZ '2027-01-01 00:00:00+00');
  END LOOP;
END $$;

-- CONTROL: the client executes in the portal.
SELECT pg_temp.assume_user('ea000000-0000-4000-8000-000000000002');
DO $$
DECLARE v_exec jsonb;
BEGIN
  v_exec := public.execute_furnishings_authorization(
    (SELECT value FROM paper_ids WHERE key = 'control_project_wave'), 'Paper Client');
  ASSERT (v_exec->>'newlyExecuted')::boolean, 'control wave executes';
  ASSERT jsonb_array_length(v_exec->'appliedItemIds') = 2, 'control wave links two lines';
END $$;
SELECT pg_temp.assume_user('ea000000-0000-4000-8000-000000000001');

-- PAPER: the studio records the signed original, and the wave executes.
DO $$
DECLARE
  v_wave uuid := (SELECT value FROM paper_ids WHERE key = 'paper_project_wave');
  v_project uuid := (SELECT value FROM paper_ids WHERE key = 'paper_project');
  v_before integer;
  v_after integer;
  v_exec jsonb;
  v_retry jsonb;
  v_err text;
BEGIN
  SELECT count(*) INTO v_before FROM public.project_ffe_items WHERE project_id = v_project;

  -- The client cannot drive the paper rail here either.
  PERFORM pg_temp.assume_user('ea000000-0000-4000-8000-000000000002');
  BEGIN
    PERFORM public.execute_furnishings_authorization_on_paper(
      v_wave, 'Paper Client', pg_temp.paper_date());
    ASSERT false, 'the client must not execute a wave through the paper rail';
  EXCEPTION WHEN insufficient_privilege THEN v_err := SQLERRM;
  END;
  ASSERT v_err = format('furnishings authorization %s not found or access denied', v_wave),
    format('client paper-execute refusal: %L', v_err);
  PERFORM pg_temp.assume_user('ea000000-0000-4000-8000-000000000003');
  BEGIN
    PERFORM public.execute_furnishings_authorization_on_paper(
      v_wave, 'Paper Client', pg_temp.paper_date());
    ASSERT false, 'an outside studio must not execute a wave through the paper rail';
  EXCEPTION WHEN insufficient_privilege THEN v_err := SQLERRM;
  END;
  ASSERT v_err = format('furnishings authorization %s not found or access denied', v_wave),
    format('outsider paper-execute refusal: %L', v_err);
  PERFORM pg_temp.assume_user('ea000000-0000-4000-8000-000000000001');

  v_exec := public.execute_furnishings_authorization_on_paper(
    v_wave, 'Paper Client', pg_temp.paper_date());
  ASSERT (v_exec->>'newlyExecuted')::boolean, 'paper wave executes';
  ASSERT jsonb_array_length(v_exec->'appliedItemIds') = 2,
    'the paper rail must LINK the same two schedule lines';

  SELECT count(*) INTO v_after FROM public.project_ffe_items WHERE project_id = v_project;
  ASSERT v_after = v_before,
    format('paper execution minted %s twinned schedule rows; it must link, never insert',
           v_after - v_before);

  -- The signature is the client's, with no IP and the paper story.
  ASSERT (SELECT signer_user_id FROM public.commercial_document_signatures
          WHERE proposal_id = v_wave) = 'ea000000-0000-4000-8000-000000000002'
     AND (SELECT signed_ip IS NULL FROM public.commercial_document_signatures
          WHERE proposal_id = v_wave)
     AND (SELECT metadata->>'via' FROM public.commercial_document_signatures
          WHERE proposal_id = v_wave) = 'execute_furnishings_authorization_on_paper'
     AND (SELECT (metadata->>'recordedBy')::uuid FROM public.commercial_document_signatures
          WHERE proposal_id = v_wave) = 'ea000000-0000-4000-8000-000000000001',
    'the paper wave signature must name the client and the recorder';

  -- Retry is idempotent and issues no second deposit.
  v_retry := public.execute_furnishings_authorization_on_paper(
    v_wave, 'Paper Client', pg_temp.paper_date());
  ASSERT NOT (v_retry->>'newlyExecuted')::boolean, 'a paper retry is not a new execution';
  ASSERT (v_retry->>'depositInvoiceId')::uuid = (v_exec->>'depositInvoiceId')::uuid,
    'a paper retry answers with the same deposit invoice';
  ASSERT v_retry->'appliedItemIds' = v_exec->'appliedItemIds',
    'a paper retry must re-derive the same applied lines, in the same order';
  ASSERT (SELECT count(*) FROM public.invoices
          WHERE project_id = v_project AND memo LIKE 'Furnishings deposit%') = 1,
    'a paper retry must not issue a second deposit';

  -- A different name is a different act; the immutable evidence refuses it.
  v_err := NULL;
  BEGIN
    PERFORM public.execute_furnishings_authorization_on_paper(
      v_wave, 'Someone Else', pg_temp.paper_date());
    ASSERT false, 'a paper retry under another name must be refused';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'furnishings signature retry conflicts with immutable evidence',
    format('paper evidence refusal: %L', v_err);
END $$;

-- FIELD IDENTITY, the furnishings edition.
DO $$
DECLARE
  v_control uuid := (SELECT value FROM paper_ids WHERE key = 'control_project');
  v_paper uuid := (SELECT value FROM paper_ids WHERE key = 'paper_project');
  a jsonb; b jsonb;
BEGIN
  -- The linked schedule lines
  SELECT jsonb_agg(pg_temp.shape(to_jsonb(i)) ORDER BY i.sort_order) INTO a
  FROM public.project_ffe_items i WHERE i.project_id = v_control;
  SELECT jsonb_agg(pg_temp.shape(to_jsonb(i)) ORDER BY i.sort_order) INTO b
  FROM public.project_ffe_items i WHERE i.project_id = v_paper;
  ASSERT a IS NOT NULL AND a = b, 'linked schedule lines differ between the rails';
  ASSERT (SELECT count(*) FROM public.project_ffe_items i
          WHERE i.project_id = v_paper
            AND i.source_commercial_document_id
                = (SELECT value FROM paper_ids WHERE key = 'paper_project_wave_doc')
            AND i.source_authorization_item_id IS NOT NULL
            AND i.status = 'approved') = 2,
    'the paper rail must link, ratchet and stamp exactly as the portal rail does';

  -- The deposit invoice
  SELECT pg_temp.shape(to_jsonb(i), ARRAY['invoice_number']) INTO a
  FROM public.invoices i
  WHERE i.project_id = v_control AND i.memo LIKE 'Furnishings deposit%';
  SELECT pg_temp.shape(to_jsonb(i), ARRAY['invoice_number']) INTO b
  FROM public.invoices i
  WHERE i.project_id = v_paper AND i.memo LIKE 'Furnishings deposit%';
  ASSERT a IS NOT NULL AND a = b,
    format('furnishings deposit invoices differ — %s', pg_temp.jdiff(a, b));

  -- The binding stamps
  SELECT pg_temp.shape(to_jsonb(d)) INTO a FROM public.project_commercial_documents d
  WHERE d.id = (SELECT value FROM paper_ids WHERE key = 'control_project_wave_doc');
  SELECT pg_temp.shape(to_jsonb(d)) INTO b FROM public.project_commercial_documents d
  WHERE d.id = (SELECT value FROM paper_ids WHERE key = 'paper_project_wave_doc');
  ASSERT a = b, format('wave binding rows differ — %s', pg_temp.jdiff(a, b));
END $$;

-- FALSIFY (2/6) — the furnishings twin's actor gate.
SAVEPOINT falsify_ffe_actor;
DO $$
DECLARE v_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = '_execute_furnishings_authorization_on_paper_authorized';
  ASSERT position('NOT public._can_author_proposal(v_proposal.designer_id)' IN v_def) > 0,
    'FALSIFY setup: the actor predicate must be findable';
  EXECUTE replace(v_def,
    'NOT public._can_author_proposal(v_proposal.designer_id)', 'false');
END $$;
DO $$
DECLARE v_result jsonb;
BEGIN
  PERFORM pg_temp.assume_user('ea000000-0000-4000-8000-000000000003');
  v_result := public.execute_furnishings_authorization_on_paper(
    (SELECT value FROM paper_ids WHERE key = 'paper_project_wave'),
    'Paper Client', pg_temp.paper_date());
  ASSERT NOT (v_result->>'newlyExecuted')::boolean,
    'FALSIFY: with the actor predicate stripped the outsider call must reach the executed-retry branch, proving the gate is what refused it';
  PERFORM pg_temp.assume_user('ea000000-0000-4000-8000-000000000001');
END $$;
ROLLBACK TO SAVEPOINT falsify_ffe_actor;

-- ═══════════════════════════════════════════════════════════════════════════
-- (5) TRADE SCOPE. The same story, on the instrument whose money is a
--     schedule: the deposit draw is issued, and the asking stops.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_project uuid := (SELECT value FROM paper_ids WHERE key = 'paper_project');
  v_room uuid := (SELECT value FROM paper_ids WHERE key = 'paper_project_room');
  v_scope jsonb;
  v_scope_id uuid;
  v_party uuid;
  v_rfq jsonb;
BEGIN
  INSERT INTO public.project_parties (
    project_id, party_kind, display_name, company_name, trade, email
  ) VALUES (
    v_project, 'sub', 'Hollis Millwork', 'Hollis & Sons LLC', 'Millwork',
    'hollis@paper.test.invalid'
  ) RETURNING id INTO v_party;
  INSERT INTO paper_ids VALUES ('party', v_party);

  v_scope := public.create_trade_scope(v_project, 'Kitchen millwork');
  v_scope_id := (v_scope->>'proposalId')::uuid;
  INSERT INTO paper_ids VALUES
    ('scope', v_scope_id), ('scope_doc', (v_scope->>'documentId')::uuid);

  INSERT INTO public.trade_scope_sections (
    proposal_id, project_room_id, room_name, prose, allocation_cents, sort_order
  ) VALUES (
    v_scope_id, v_room, 'Living room',
    'Full-height rift white oak cabinetry with integrated panels.', 900000, 0
  );

  -- Ask the sub, and mint them a link. Executing must end both.
  v_rfq := public.prepare_trade_rfq(v_scope_id, v_party, 'Please quote.', 'March start.');
  INSERT INTO paper_ids VALUES ('rfq', (v_rfq->>'id')::uuid);
  PERFORM set_config('paper.mint_target', v_rfq->>'id', true);
END $$;

SELECT pg_temp.assume_user(
  'ea000000-0000-4000-8000-000000000001', 'service_role'
);
SET LOCAL ROLE service_role;
DO $$
BEGIN
  PERFORM public.mint_trade_rfq_token(
    current_setting('paper.mint_target')::uuid
  );
END $$;
RESET ROLE;
SELECT pg_temp.assume_user('ea000000-0000-4000-8000-000000000001');

DO $$
DECLARE
  v_scope_id uuid := (SELECT value FROM paper_ids WHERE key = 'scope');
  v_party uuid := (SELECT value FROM paper_ids WHERE key = 'party');
BEGIN
  INSERT INTO public.trade_scope_bids (
    proposal_id, party_id, party_display_name, amount_cents, status, source
  ) VALUES (v_scope_id, v_party, 'Hollis Millwork', 700000, 'quoted', 'recorded');
  PERFORM public.set_trade_scope_party(v_scope_id, v_party);
  UPDATE public.trade_scope_terms SET client_price_cents = 900000,
    terms = 'Progress draws against the schedule below.'
  WHERE proposal_id = v_scope_id;

  INSERT INTO public.trade_scope_draws (
    proposal_id, label, percentage, amount_cents, sort_order, gates_on_acceptance
  ) VALUES
    (v_scope_id, 'Deposit', 40, 360000, 0, false),
    (v_scope_id, 'Final · on acceptance', 60, 540000, 1, true);

  PERFORM public.send_commercial_document(
    v_scope_id, public._commercial_document_fingerprint(v_scope_id),
    NULL, TIMESTAMPTZ '2027-01-01 00:00:00+00');
END $$;

-- The first-draw gate, honoured on the paper rail too. Constructed with the
-- draw guard off (the send seam refuses this schedule outright), so the
-- assertion below is about the EXECUTION rail's own belt and nothing else.
SAVEPOINT paper_first_draw_gate;
ALTER TABLE public.trade_scope_draws DISABLE TRIGGER guard_trade_scope_draws_trg;
DO $$
DECLARE
  v_scope uuid := (SELECT value FROM paper_ids WHERE key = 'scope');
  v_err text;
BEGIN
  UPDATE public.trade_scope_draws SET gates_on_acceptance = true
  WHERE proposal_id = v_scope AND sort_order = 0;
  BEGIN
    PERFORM public.execute_trade_scope_on_paper(v_scope, 'Paper Client', pg_temp.paper_date());
    ASSERT false, 'a paper execution must not bill an acceptance-gated deposit draw';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'the trade scope deposit draw gates on acceptance and cannot be billed at signature',
    format('paper first-draw gate refusal: %L', v_err);
END $$;
ROLLBACK TO SAVEPOINT paper_first_draw_gate;

DO $$
DECLARE
  v_scope uuid := (SELECT value FROM paper_ids WHERE key = 'scope');
  v_doc uuid := (SELECT value FROM paper_ids WHERE key = 'scope_doc');
  v_project uuid := (SELECT value FROM paper_ids WHERE key = 'paper_project');
  v_before integer;
  v_exec jsonb;
  v_retry jsonb;
  v_err text;
BEGIN
  SELECT count(*) INTO v_before FROM public.project_ffe_items WHERE project_id = v_project;

  PERFORM pg_temp.assume_user('ea000000-0000-4000-8000-000000000002');
  BEGIN
    PERFORM public.execute_trade_scope_on_paper(v_scope, 'Paper Client', pg_temp.paper_date());
    ASSERT false, 'the client must not execute a scope through the paper rail';
  EXCEPTION WHEN insufficient_privilege THEN v_err := SQLERRM;
  END;
  ASSERT v_err = format('trade scope %s not found or access denied', v_scope),
    format('client paper-execute refusal: %L', v_err);
  PERFORM pg_temp.assume_user('ea000000-0000-4000-8000-000000000003');
  BEGIN
    PERFORM public.execute_trade_scope_on_paper(v_scope, 'Paper Client', pg_temp.paper_date());
    ASSERT false, 'an outside studio must not execute a scope through the paper rail';
  EXCEPTION WHEN insufficient_privilege THEN v_err := SQLERRM;
  END;
  ASSERT v_err = format('trade scope %s not found or access denied', v_scope),
    format('outsider paper-execute refusal: %L', v_err);
  PERFORM pg_temp.assume_user('ea000000-0000-4000-8000-000000000001');

  v_exec := public.execute_trade_scope_on_paper(v_scope, 'Paper Client', pg_temp.paper_date());
  ASSERT (v_exec->>'newlyExecuted')::boolean, 'the paper scope executes';
  ASSERT v_exec->>'commercialState' = 'executed'
     AND v_exec->>'progressState' = 'none',
    'paper execution does not start the work; engagement does';
  INSERT INTO paper_ids VALUES ('scope_deposit', (v_exec->>'depositInvoiceId')::uuid);

  -- The deposit draw, issued.
  ASSERT (v_exec->>'depositRequiredCents')::integer = 360000,
    format('the deposit must be draw one: %s', v_exec->>'depositRequiredCents');
  ASSERT (SELECT status FROM public.invoices WHERE id = (v_exec->>'depositInvoiceId')::uuid) = 'sent',
    'the paper rail must ISSUE the deposit, not leave it a draft';
  ASSERT (SELECT invoice_id FROM public.trade_scope_draws
          WHERE proposal_id = v_scope AND sort_order = 0) = (v_exec->>'depositInvoiceId')::uuid,
    'draw one must be stamped under app.trade_draw_invoice_id';
  ASSERT (SELECT deposit_invoice_id FROM public.project_commercial_documents WHERE id = v_doc)
         = (v_exec->>'depositInvoiceId')::uuid,
    'the binding must carry the deposit invoice';
  ASSERT (SELECT (metadata->>'drawId')::uuid FROM public.invoice_line_items
          WHERE invoice_id = (v_exec->>'depositInvoiceId')::uuid)
         = (SELECT id FROM public.trade_scope_draws WHERE proposal_id = v_scope AND sort_order = 0),
    'the deposit line must name the draw it bills';

  -- Nothing appeared in any room.
  ASSERT (SELECT count(*) FROM public.project_ffe_items WHERE project_id = v_project) = v_before,
    'paper execution must mint no presence lines';

  -- The asking is over.
  ASSERT NOT EXISTS (SELECT 1 FROM public.trade_rfq_tokens
    WHERE proposal_id = v_scope AND status = 'active'),
    'paper execution must revoke every live RFQ link';
  ASSERT NOT EXISTS (SELECT 1 FROM public.trade_rfq_requests
    WHERE proposal_id = v_scope AND status <> 'closed'),
    'paper execution must close every open ask';

  -- The signature: the client's, no IP, the paper story.
  ASSERT (SELECT signer_user_id FROM public.commercial_document_signatures
          WHERE proposal_id = v_scope) = 'ea000000-0000-4000-8000-000000000002'
     AND (SELECT signed_ip IS NULL FROM public.commercial_document_signatures
          WHERE proposal_id = v_scope)
     AND (SELECT metadata->>'via' FROM public.commercial_document_signatures
          WHERE proposal_id = v_scope) = 'execute_trade_scope_on_paper'
     AND (SELECT (metadata->>'paperSignedOn')::date FROM public.commercial_document_signatures
          WHERE proposal_id = v_scope) = pg_temp.paper_date(),
    'the paper scope signature must name the client and the paper date';

  -- Retry is idempotent and bills nothing twice.
  v_retry := public.execute_trade_scope_on_paper(v_scope, 'Paper Client', pg_temp.paper_date());
  ASSERT NOT (v_retry->>'newlyExecuted')::boolean, 'a paper retry is not a new execution';
  ASSERT (v_retry->>'depositInvoiceId')::uuid = (v_exec->>'depositInvoiceId')::uuid,
    'a paper retry answers with the same deposit invoice';
  ASSERT (SELECT count(*) FROM public.invoices
          WHERE project_id = v_project AND memo LIKE 'Trade scope%') = 1,
    'a paper retry must not issue a second deposit';
END $$;

-- FALSIFY (3/6) — the trade twin's actor gate.
SAVEPOINT falsify_trade_actor;
DO $$
DECLARE v_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = '_execute_trade_scope_on_paper_authorized';
  ASSERT position('NOT public._can_author_proposal(v_proposal.designer_id)' IN v_def) > 0,
    'FALSIFY setup: the actor predicate must be findable';
  EXECUTE replace(v_def,
    'NOT public._can_author_proposal(v_proposal.designer_id)', 'false');
END $$;
DO $$
DECLARE v_result jsonb;
BEGIN
  PERFORM pg_temp.assume_user('ea000000-0000-4000-8000-000000000003');
  v_result := public.execute_trade_scope_on_paper(
    (SELECT value FROM paper_ids WHERE key = 'scope'), 'Paper Client', pg_temp.paper_date());
  ASSERT NOT (v_result->>'newlyExecuted')::boolean,
    'FALSIFY: with the actor predicate stripped the outsider call must reach the executed-retry branch, proving the gate is what refused it';
  PERFORM pg_temp.assume_user('ea000000-0000-4000-8000-000000000001');
END $$;
ROLLBACK TO SAVEPOINT falsify_trade_actor;

-- ═══════════════════════════════════════════════════════════════════════════
-- (6) PAPER ACCEPTANCE. The last act on the trade rail, and the one with the
--     most money behind it: acceptance releases the final draw.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_scope uuid := (SELECT value FROM paper_ids WHERE key = 'scope');
  v_deposit uuid := (SELECT value FROM paper_ids WHERE key = 'scope_deposit');
  v_err text;
BEGIN
  -- Not accepted, so the gated draw is not billable.
  BEGIN
    PERFORM public.issue_trade_draw_invoice(
      (SELECT id FROM public.trade_scope_draws WHERE proposal_id = v_scope AND sort_order = 1));
    ASSERT false, 'the acceptance-gated draw must not be billable before acceptance';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err IN (
    'earlier trade scope draws must be issued and paid before this one',
    'the acceptance-gated trade scope draw is billable only after the client accepts the work'),
    format('pre-acceptance draw refusal: %L', v_err);

  -- Not substantially complete, so there is nothing to accept.
  v_err := NULL;
  BEGIN
    PERFORM public.record_paper_trade_acceptance(v_scope, 'Paper Client', pg_temp.paper_date());
    ASSERT false, 'a scope nobody has finished must not accept';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'a trade scope must be substantially complete before the client accepts it',
    format('early-acceptance refusal: %L', v_err);

  -- Walk the work to substantial completion.
  PERFORM public.record_invoice_payment(v_deposit, 360000, 'check', 'PAPER-DEP', now(), NULL);
  PERFORM public.engage_trade_scope(v_scope);
  PERFORM public.mark_trade_scope_in_progress(v_scope);
  PERFORM public.record_trade_scope_substantial_completion(v_scope);
  ASSERT (SELECT progress_state FROM public.trade_scope_terms WHERE proposal_id = v_scope)
         = 'substantially_complete',
    'the ratchet must reach substantial completion';
END $$;

-- The acceptance carries a page too. This is the act with the most money behind
-- it — it is what releases the final draw — and until now it was the one paper
-- act with nowhere to file the signed sheet that authorized the release.
DO $$
DECLARE v_scope uuid := (SELECT value FROM paper_ids WHERE key = 'scope');
BEGIN
  INSERT INTO public.project_documents (
    id, proposal_id, title, doc_type, category, storage_path, client_visible, uploaded_by
  ) VALUES
    ('ea900000-0000-4000-8000-000000000004', v_scope,
     'Signed acceptance — scan', 'pdf', 'contract',
     v_scope || '/signed-acceptance.pdf', false,
     'ea000000-0000-4000-8000-000000000001'),
    ('ea900000-0000-4000-8000-000000000005', v_scope,
     'Signed acceptance — shared copy', 'pdf', 'contract',
     v_scope || '/signed-acceptance-shared.pdf', true,
     'ea000000-0000-4000-8000-000000000001');
END $$;

DO $$
DECLARE
  v_scope uuid := (SELECT value FROM paper_ids WHERE key = 'scope');
  v_accepted jsonb;
  v_again jsonb;
  v_draw jsonb;
  v_err text;
BEGIN
  -- The same pointer validation the signature rails use, on the same helper: a
  -- page filed against another document is not this acceptance's evidence.
  BEGIN
    PERFORM public.record_paper_trade_acceptance(
      v_scope, 'Paper Client', pg_temp.paper_date(),
      'ea900000-0000-4000-8000-000000000002');
    ASSERT false, 'an acceptance scan filed against another document must be refused';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'the scanned paper original must be filed against this document',
    format('foreign acceptance-scan refusal: %L', v_err);
  ASSERT (SELECT progress_state FROM public.trade_scope_terms WHERE proposal_id = v_scope)
         = 'substantially_complete',
    'a refused acceptance must leave the ratchet where it was';
  v_err := NULL;

  -- Still not the client's to record, and still not an outsider's.
  PERFORM pg_temp.assume_user('ea000000-0000-4000-8000-000000000002');
  BEGIN
    PERFORM public.record_paper_trade_acceptance(v_scope, 'Paper Client', pg_temp.paper_date());
    ASSERT false, 'the client must not record their own paper acceptance';
  EXCEPTION WHEN insufficient_privilege THEN v_err := SQLERRM;
  END;
  ASSERT v_err = format('trade scope %s not found or access denied', v_scope),
    format('client paper-acceptance refusal: %L', v_err);
  PERFORM pg_temp.assume_user('ea000000-0000-4000-8000-000000000003');
  BEGIN
    PERFORM public.record_paper_trade_acceptance(v_scope, 'Paper Client', pg_temp.paper_date());
    ASSERT false, 'an outside studio must not record a paper acceptance';
  EXCEPTION WHEN insufficient_privilege THEN v_err := SQLERRM;
  END;
  ASSERT v_err = format('trade scope %s not found or access denied', v_scope),
    format('outsider paper-acceptance refusal: %L', v_err);
  PERFORM pg_temp.assume_user('ea000000-0000-4000-8000-000000000001');

  v_accepted := public.record_paper_trade_acceptance(
    v_scope, 'Paper Client', pg_temp.paper_date(),
    'ea900000-0000-4000-8000-000000000004');
  ASSERT (v_accepted->>'changed')::boolean, 'the paper acceptance lands';
  ASSERT v_accepted->>'progressState' = 'accepted', 'the ratchet reaches accepted';
  ASSERT (v_accepted->>'acceptedOnPaper')::boolean, 'and says it came from paper';
  ASSERT (v_accepted->>'acceptanceScanDocumentId')::uuid
         = 'ea900000-0000-4000-8000-000000000004',
    'the money-unlocking act must answer with the page that authorized it';

  -- The stamps, in full: the CLIENT accepted; the STUDIO wrote it down.
  ASSERT (SELECT accepted_by FROM public.trade_scope_terms WHERE proposal_id = v_scope)
         = 'ea000000-0000-4000-8000-000000000002',
    'acceptance belongs to the client even when the studio records it';
  ASSERT (SELECT accepted_on_paper FROM public.trade_scope_terms WHERE proposal_id = v_scope),
    'accepted_on_paper must be stamped';
  ASSERT (SELECT acceptance_recorded_by FROM public.trade_scope_terms WHERE proposal_id = v_scope)
         = 'ea000000-0000-4000-8000-000000000001',
    'acceptance_recorded_by must name the studio author';
  ASSERT (SELECT accepted_at::date FROM public.trade_scope_terms WHERE proposal_id = v_scope)
         = pg_temp.paper_date(),
    'accepted_at is the date on the paper, not the moment of typing';
  ASSERT (SELECT acceptance_fingerprint FROM public.trade_scope_terms WHERE proposal_id = v_scope)
         = public._commercial_document_fingerprint(v_scope),
    'the acceptance must hash the document it accepted';
  ASSERT (SELECT acceptance_scan_document_id FROM public.trade_scope_terms
          WHERE proposal_id = v_scope) = 'ea900000-0000-4000-8000-000000000004',
    'acceptance_scan_document_id must carry the page';

  -- And that page freezes, on the second pointer leg of the same guard.
  BEGIN
    DELETE FROM public.project_documents WHERE id = 'ea900000-0000-4000-8000-000000000004';
    ASSERT false, 'deleting a recorded acceptance scan must be refused';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = format(
      'this file is the scanned paper original recorded against commercial document %s, and cannot be deleted',
      v_scope),
    format('acceptance-scan delete freeze: %L', v_err);
  v_err := NULL;

  -- Idempotent.
  v_again := public.record_paper_trade_acceptance(v_scope, 'Paper Client', pg_temp.paper_date());
  ASSERT NOT (v_again->>'changed')::boolean, 'a second paper acceptance changes nothing';
  ASSERT (v_again->>'acceptedOnPaper')::boolean, 'and still reports the paper tell';
  ASSERT (v_again->>'acceptanceScanDocumentId')::uuid
         = 'ea900000-0000-4000-8000-000000000004',
    'and still answers with the page';

  -- And the money it was gating is now billable.
  v_draw := public.issue_trade_draw_invoice(
    (SELECT id FROM public.trade_scope_draws WHERE proposal_id = v_scope AND sort_order = 1));
  ASSERT (v_draw->>'amountCents')::integer = 540000
     AND v_draw->>'invoiceStatus' = 'sent',
    'the acceptance-gated final draw must become issuable';
END $$;

-- The client's copy says the acceptance came from paper.
DO $$
DECLARE v_bundle jsonb;
BEGIN
  PERFORM pg_temp.assume_user('ea000000-0000-4000-8000-000000000002');
  v_bundle := public.get_client_commercial_document_bundle(
    (SELECT value FROM paper_ids WHERE key = 'scope'));
  ASSERT (v_bundle->'tradeScope'->'progress'->>'acceptedOnPaper')::boolean,
    'the client bundle must say the acceptance was recorded from paper';
  ASSERT (v_bundle->'tradeScope'->'progress'->>'state') = 'accepted',
    'and that the scope is accepted';
  -- The acceptance leg needs no paperAcceptedOn twin: acceptedAt IS the date on
  -- the paper here (record_paper_trade_acceptance writes accepted_at =
  -- p_paper_signed_on::timestamptz), so what the client's copy must print is
  -- already in the bundle — as a midnight timestamp whose DATE COMPONENT is the
  -- whole meaning. Readers must format it without shifting it west.
  ASSERT (v_bundle->'tradeScope'->'progress'->>'acceptedAt')::date
         = pg_temp.paper_date(),
    format('acceptedAt must carry the paper date — got %L',
           v_bundle->'tradeScope'->'progress'->>'acceptedAt');
  ASSERT (v_bundle->'tradeScope'->'progress'->>'acceptedAt')::timestamptz
         = pg_temp.paper_date()::timestamptz,
    'and land on the day boundary, so a UTC-formatted read is exact';
  -- The page is scoped exactly like the signature scan: the studio filed it
  -- unshared, so the client is told an acceptance happened and not handed the
  -- file id.
  ASSERT v_bundle->'tradeScope'->'progress'->>'acceptanceScanDocumentId' IS NULL,
    'an unshared acceptance scan must not reach the client bundle';
  PERFORM pg_temp.assume_user('ea000000-0000-4000-8000-000000000001');
END $$;

-- The other two legs of that same scoping. There is no legitimate door for
-- these: acceptance_scan_document_id is progress, the ratchet is already at
-- 'accepted', and guard_trade_scope_terms therefore refuses every further move
-- even under its own GUC (proved two blocks down). So the pointer is swapped by
-- FIXTURE BYPASS, with the guard off — the same standing this suite gives the
-- foreign-anchor signature in section 12, and for the same reason: the question
-- is what the READ EDGE does with a row the write edges would never have built.
-- Rolled back, so the recorded acceptance keeps pointing at the page it was
-- recorded with.
SAVEPOINT acceptance_scan_projection;
ALTER TABLE public.trade_scope_terms DISABLE TRIGGER guard_trade_scope_terms_trg;
DO $$
DECLARE
  v_scope uuid := (SELECT value FROM paper_ids WHERE key = 'scope');
  v_progress jsonb;
BEGIN
  UPDATE public.trade_scope_terms
  SET acceptance_scan_document_id = 'ea900000-0000-4000-8000-000000000005'
  WHERE proposal_id = v_scope;

  PERFORM pg_temp.assume_user('ea000000-0000-4000-8000-000000000002');
  v_progress := public.get_client_commercial_document_bundle(v_scope)
                #> '{tradeScope,progress}';
  ASSERT (v_progress->>'acceptanceScanDocumentId')::uuid
         = 'ea900000-0000-4000-8000-000000000005',
    'a shared acceptance scan must reach the client bundle';
  PERFORM pg_temp.assume_user('ea000000-0000-4000-8000-000000000001');

  -- And a shared page filed against a DIFFERENT document is not this scope's
  -- evidence, however shared it is.
  UPDATE public.trade_scope_terms
  SET acceptance_scan_document_id = 'ea900000-0000-4000-8000-000000000002'
  WHERE proposal_id = v_scope;

  PERFORM pg_temp.assume_user('ea000000-0000-4000-8000-000000000002');
  v_progress := public.get_client_commercial_document_bundle(v_scope)
                #> '{tradeScope,progress}';
  ASSERT v_progress->>'acceptanceScanDocumentId' IS NULL,
    'a shared acceptance scan filed against another document must not reach this bundle';
  PERFORM pg_temp.assume_user('ea000000-0000-4000-8000-000000000001');
END $$;
ROLLBACK TO SAVEPOINT acceptance_scan_projection;

-- The two new columns are progress, not content: they move only under the
-- canonical GUC, exactly like accepted_at and accepted_by.
DO $$
DECLARE
  v_scope uuid := (SELECT value FROM paper_ids WHERE key = 'scope');
  v_err text;
BEGIN
  BEGIN
    UPDATE public.trade_scope_terms SET accepted_on_paper = false
    WHERE proposal_id = v_scope;
    ASSERT false, 'accepted_on_paper must not be writable by hand';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'trade scope progress may only change through its canonical RPC',
    format('accepted_on_paper guard: %L', v_err);

  v_err := NULL;
  BEGIN
    UPDATE public.trade_scope_terms SET acceptance_recorded_by = NULL
    WHERE proposal_id = v_scope;
    ASSERT false, 'acceptance_recorded_by must not be writable by hand';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'trade scope progress may only change through its canonical RPC',
    format('acceptance_recorded_by guard: %L', v_err);

  v_err := NULL;
  BEGIN
    UPDATE public.trade_scope_terms SET acceptance_scan_document_id = NULL
    WHERE proposal_id = v_scope;
    ASSERT false, 'acceptance_scan_document_id must not be writable by hand';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'trade scope progress may only change through its canonical RPC',
    format('acceptance_scan_document_id guard: %L', v_err);
END $$;

-- FALSIFY (4/6) — guard_trade_scope_terms. With the trigger off both writes
-- land, which is what makes the two refusals above a test of the guard's
-- progress-column list and not of some other freeze.
SAVEPOINT falsify_terms_guard;
ALTER TABLE public.trade_scope_terms DISABLE TRIGGER guard_trade_scope_terms_trg;
DO $$
DECLARE v_scope uuid := (SELECT value FROM paper_ids WHERE key = 'scope');
BEGIN
  UPDATE public.trade_scope_terms
  SET accepted_on_paper = false, acceptance_recorded_by = NULL,
      acceptance_scan_document_id = NULL
  WHERE proposal_id = v_scope;
  ASSERT (SELECT NOT accepted_on_paper AND acceptance_recorded_by IS NULL
                 AND acceptance_scan_document_id IS NULL
          FROM public.trade_scope_terms WHERE proposal_id = v_scope),
    'FALSIFY: with the terms guard off all three paper stamps must move, proving the guard is what refused them';
END $$;
ROLLBACK TO SAVEPOINT falsify_terms_guard;

-- ════════════════════════════════════════════════════════════════════════════
-- (14) PAPERS ARE NOT TIME-BOXED — the fourth delta.
--
--      In the portal the link IS the offer: clicking it after valid_until has
--      passed would be accepting something that is no longer on the table, and
--      both client rails refuse exactly that. A printed copy is not a link. It
--      was signed on the date the record carries, and the studio is writing
--      down an act that already happened; refusing the record because a browser
--      link lapsed in the meantime discards a real signature to protect a rule
--      about a browser. record_paper_client_signature never had the guard and
--      record_offline_signature (00399) never had it either — the two execute
--      twins now match them, and the portal rails keep theirs.
--
--      Both instruments are built fresh here and the whole section is rolled
--      back: it exists to prove a refusal is GONE on one rail and PRESENT on
--      the other, not to leave two more executed documents lying around.
-- ════════════════════════════════════════════════════════════════════════════
SAVEPOINT paper_past_expiry;

DO $$
DECLARE
  v_project uuid := (SELECT value FROM paper_ids WHERE key = 'control_project');
  v_room uuid := (SELECT value FROM paper_ids WHERE key = 'control_project_room');
  v_ids uuid[];
  v_budget jsonb;
  v_published jsonb;
  v_checkpoint uuid;
  v_release jsonb;
  v_wave uuid;
  v_snapshot jsonb;
  v_exec jsonb;
  v_err text;
BEGIN
  -- A second release on the control project, so the fixture is a real wave and
  -- not a proposal wearing a wave's name.
  INSERT INTO public.project_ffe_items (
    project_id, project_room_id, name, ffe_category, item_type, status,
    quantity, unit_price_cents, trade_price_cents, markup_percent,
    line_total_cents, vendor_id, vendor_name, doc_code, sort_order
  ) VALUES
    (v_project, v_room, 'Late armchair', 'Seating', 'fixed', 'specified',
     1, 300000, 180000, 66.67, 300000,
     'ea710000-0000-4000-8000-000000000001', 'Paper Test Vendor', 'LR-03', 2),
    (v_project, v_room, 'Late lamp', 'Lighting', 'fixed', 'specified',
     1, 60000, 36000, 66.67, 60000,
     'ea710000-0000-4000-8000-000000000001', 'Paper Test Vendor', 'LR-04', 3);

  SELECT array_agg(i.id ORDER BY i.sort_order) INTO v_ids
  FROM public.project_ffe_items i
  WHERE i.project_id = v_project AND i.doc_code IN ('LR-03', 'LR-04');

  v_budget := public.derive_working_budget_draft(v_project);
  v_published := public.publish_budget_checkpoint(
    v_project, (v_budget->'version'->>'id')::uuid);
  v_checkpoint := (v_published->>'checkpointId')::uuid;
  PERFORM pg_temp.assume_user('ea000000-0000-4000-8000-000000000002');
  PERFORM public.acknowledge_budget_checkpoint(v_checkpoint);
  PERFORM pg_temp.assume_user('ea000000-0000-4000-8000-000000000001');

  v_release := public.create_furnishings_authorization_from_schedule(
    v_project, 'Late release', v_ids, NULL);
  v_wave := (v_release->>'proposalId')::uuid;
  v_snapshot := public.get_commercial_document_send_snapshot(v_wave);
  -- Sent with an offer window that has already closed.
  PERFORM public.send_commercial_document(
    v_wave, v_snapshot->>'documentFingerprint', NULL,
    TIMESTAMPTZ '2026-01-20 00:00:00+00');
  ASSERT (SELECT valid_until FROM public.proposals WHERE id = v_wave) < now(),
    'the expiry fixture must actually be expired';

  -- THE REGRESSION: the portal rail still refuses, in the same words.
  PERFORM pg_temp.assume_user('ea000000-0000-4000-8000-000000000002');
  BEGIN
    PERFORM public.execute_furnishings_authorization(v_wave, 'Paper Client');
    ASSERT false, 'the client rail must still refuse an expired authorization';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = format('furnishings authorization %s has expired', v_wave),
    format('portal expiry refusal: %L', v_err);
  PERFORM pg_temp.assume_user('ea000000-0000-4000-8000-000000000001');

  -- THE RULING: the paper rail records the act that already happened.
  v_exec := public.execute_furnishings_authorization_on_paper(
    v_wave, 'Paper Client', pg_temp.paper_date());
  ASSERT (v_exec->>'newlyExecuted')::boolean,
    'a printed furnishings authorization must record after its link lapsed';
  ASSERT jsonb_array_length(v_exec->'appliedItemIds') = 2,
    'and it must do the whole job, not a reduced one';
  ASSERT (SELECT commercial_state FROM public.proposals WHERE id = v_wave) = 'executed',
    'and leave the wave executed';
END $$;

DO $$
DECLARE
  v_project uuid := (SELECT value FROM paper_ids WHERE key = 'control_project');
  v_room uuid := (SELECT value FROM paper_ids WHERE key = 'control_project_room');
  v_party uuid;
  v_scope jsonb;
  v_scope_id uuid;
  v_exec jsonb;
  v_err text;
BEGIN
  INSERT INTO public.project_parties (
    project_id, party_kind, display_name, company_name, trade, email
  ) VALUES (
    v_project, 'sub', 'Late Millwork', 'Late & Co LLC', 'Millwork',
    'late@paper.test.invalid'
  ) RETURNING id INTO v_party;

  v_scope := public.create_trade_scope(v_project, 'Late kitchen millwork');
  v_scope_id := (v_scope->>'proposalId')::uuid;
  INSERT INTO public.trade_scope_sections (
    proposal_id, project_room_id, room_name, prose, allocation_cents, sort_order
  ) VALUES (
    v_scope_id, v_room, 'Living room',
    'Rift white oak cabinetry, second release.', 900000, 0
  );
  INSERT INTO public.trade_scope_bids (
    proposal_id, party_id, party_display_name, amount_cents, status, source
  ) VALUES (v_scope_id, v_party, 'Late Millwork', 700000, 'quoted', 'recorded');
  PERFORM public.set_trade_scope_party(v_scope_id, v_party);
  UPDATE public.trade_scope_terms SET client_price_cents = 900000,
    terms = 'Progress draws against the schedule below.'
  WHERE proposal_id = v_scope_id;
  INSERT INTO public.trade_scope_draws (
    proposal_id, label, percentage, amount_cents, sort_order, gates_on_acceptance
  ) VALUES
    (v_scope_id, 'Deposit', 40, 360000, 0, false),
    (v_scope_id, 'Final · on acceptance', 60, 540000, 1, true);

  PERFORM public.send_commercial_document(
    v_scope_id, public._commercial_document_fingerprint(v_scope_id),
    NULL, TIMESTAMPTZ '2026-01-20 00:00:00+00');
  ASSERT (SELECT valid_until FROM public.proposals WHERE id = v_scope_id) < now(),
    'the trade expiry fixture must actually be expired';

  PERFORM pg_temp.assume_user('ea000000-0000-4000-8000-000000000002');
  BEGIN
    PERFORM public.execute_trade_scope(v_scope_id, 'Paper Client');
    ASSERT false, 'the client rail must still refuse an expired trade scope';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = format('trade scope %s has expired', v_scope_id),
    format('portal trade expiry refusal: %L', v_err);
  PERFORM pg_temp.assume_user('ea000000-0000-4000-8000-000000000001');

  v_exec := public.execute_trade_scope_on_paper(
    v_scope_id, 'Paper Client', pg_temp.paper_date());
  ASSERT (v_exec->>'newlyExecuted')::boolean,
    'a printed trade scope must record after its link lapsed';
  ASSERT (v_exec->>'depositRequiredCents')::integer = 360000,
    'and it must still issue the deposit draw';
END $$;

ROLLBACK TO SAVEPOINT paper_past_expiry;

DO $$
BEGIN
  RAISE NOTICE 'executed_on_paper_test: all sections passed';
END $$;

ROLLBACK;
