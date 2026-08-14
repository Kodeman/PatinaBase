-- ═══════════════════════════════════════════════════════════════════════════
-- 00477 — Issued-on-paper integration test.
-- Runner: plain psql, ON_ERROR_STOP=1. Single transaction, ROLLBACK at the end.
-- Run:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f supabase/tests/commercial/design_services_paper_issue_test.sql
--
-- What this suite is for. 00425 let the studio record a signature taken on a
-- printed copy — but only against a document already 'sent', and the only door
-- to 'sent' fires a real email at a client who must already have an address on
-- file. 00477 opens a second door: issue on paper, no email. The risk is the
-- same pair 00425 named, so the sections are shaped the same way:
--
--   · UNDER-recording — the paper-issued rail quietly producing a lesser
--     engagement than the emailed one. Section (1) builds BOTH from identical
--     fixtures and diffs the resulting rows field by field.
--
--   · OVER-recording — the rail claiming more than happened, or concealing
--     what did. Sections (2), (3) and (7): the stamps say issuance was on
--     paper, nothing says an email left, and neither stamp is paintable by
--     hand.
--
-- And two that belong to this migration alone:
--   · STRICTLY ADDITIVE — section (5). Without p_issue_on_paper the act is the
--     shipped act, refusing from draft in 00425's exact words.
--   · ORDERING IS LOAD-BEARING — section (9). The signature trigger re-reads
--     the proposal at fire time, so it observes the mid-transaction flip to
--     'sent'. Proven by removing the impl's own state guard and watching the
--     TRIGGER refuse a draft-state insert on its own.
--
-- FALSIFIABILITY. Three refusals are proven to BITE, in the pattern
-- executed_on_paper_test.sql established: the live function definition is
-- rewritten with the predicate removed inside a SAVEPOINT, the refused call is
-- shown to SUCCEED, and the SAVEPOINT is rolled back. Those blocks are marked
-- FALSIFY.
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

-- The field-identity oracle, carried over from executed_on_paper_test.sql §1:
-- surrogate keys and clock readings collapse to a token (NULL-vs-set survives,
-- because that is itself a field); everything else stays literal. What remains
-- is business content, and that is what has to match across the two rails.
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

CREATE OR REPLACE FUNCTION pg_temp.jdiff(p_a jsonb, p_b jsonb)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(string_agg(
    format('%s: %s vs %s', k, COALESCE(p_a->>k, '∅'), COALESCE(p_b->>k, '∅')), '; '
    ORDER BY k), '(none)')
  FROM (SELECT jsonb_object_keys(p_a) AS k
        UNION SELECT jsonb_object_keys(p_b)) AS keys
  WHERE (p_a->k) IS DISTINCT FROM (p_b->k);
$$;

-- Deliberately in the past: a printed copy is signed before it is typed in.
CREATE OR REPLACE FUNCTION pg_temp.paper_date() RETURNS date
LANGUAGE sql IMMUTABLE AS $$ SELECT (DATE '2026-01-15') $$;

-- guard_commercial_signature_insert short-circuits for a bare superuser
-- session (00462:1948-1953) — current_user = session_user = postgres with no
-- role GUC set returns NEW unchecked. Section (9) is ABOUT that guard, so it
-- has to arrive as a real caller does: role set, so the bypass does not apply.
CREATE OR REPLACE FUNCTION pg_temp.assume_role(p_user_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_temp.assume_user(p_user_id);
  EXECUTE 'SET LOCAL ROLE authenticated';
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.reset_role()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE 'RESET ROLE';
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (0) FIXTURE — one studio, one client, one outsider, and one client who has
--     no email address at all (the person the emailed rail cannot serve).
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
) VALUES
  ('1a000000-0000-4000-8000-000000000001', 'issue-designer@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('1a000000-0000-4000-8000-000000000002', 'issue-client@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('1a000000-0000-4000-8000-000000000003', 'issue-outsider@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('1a000000-0000-4000-8000-000000000004', 'issue-emailless@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES
  ('1a000000-0000-4000-8000-000000000001', 'issue-designer@test.invalid', 'Issue Designer', true, now(), now()),
  ('1a000000-0000-4000-8000-000000000002', 'issue-client@test.invalid', 'Issue Client', false, now(), now()),
  ('1a000000-0000-4000-8000-000000000003', 'issue-outsider@test.invalid', 'Outside Designer', true, now(), now()),
  -- No email on file. send_commercial_document (00423:1773) refuses this
  -- person outright; the paper rail is the only rail that can serve them.
  ('1a000000-0000-4000-8000-000000000004', NULL, 'Emailless Client', false, now(), now())
ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, full_name = EXCLUDED.full_name;

INSERT INTO public.organizations (id, type, name, slug, status)
VALUES
  ('1a100000-0000-4000-8000-000000000001', 'design_studio', 'Issue Studio', 'issue-studio-test', 'active'),
  ('1a100000-0000-4000-8000-000000000002', 'design_studio', 'Other Issue Studio', 'other-issue-studio-test', 'active');
SELECT pg_temp.assume_user('1a000000-0000-4000-8000-000000000001', 'service_role');
INSERT INTO public.organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES
  ('1a110000-0000-4000-8000-000000000001', '1a000000-0000-4000-8000-000000000001',
   '1a100000-0000-4000-8000-000000000001', 'owner', 'active', now()),
  ('1a110000-0000-4000-8000-000000000002', '1a000000-0000-4000-8000-000000000003',
   '1a100000-0000-4000-8000-000000000002', 'owner', 'active', now());

INSERT INTO public.designer_clients (id, designer_id, client_id, client_name, status, source)
VALUES
  ('1a200000-0000-4000-8000-000000000001',
   '1a000000-0000-4000-8000-000000000001',
   '1a000000-0000-4000-8000-000000000002',
   'Issue Client', 'proposal', 'direct'),
  ('1a200000-0000-4000-8000-000000000002',
   '1a000000-0000-4000-8000-000000000001',
   '1a000000-0000-4000-8000-000000000004',
   'Emailless Client', 'proposal', 'direct');

CREATE TEMP TABLE issue_ids (key text PRIMARY KEY, value uuid NOT NULL) ON COMMIT DROP;

-- Mint a design-services agreement in DRAFT. Called with IDENTICAL content for
-- both rails, so any difference between them is the RAIL.
CREATE OR REPLACE FUNCTION pg_temp.mint_agreement(
  p_id uuid, p_title text,
  p_client uuid DEFAULT '1a000000-0000-4000-8000-000000000002',
  p_designer_client uuid DEFAULT '1a200000-0000-4000-8000-000000000001'
)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.proposals (
    id, designer_id, designer_client_id, client_id, title, description,
    total_amount, status, valid_until
  ) VALUES (
    p_id,
    '1a000000-0000-4000-8000-000000000001',
    p_designer_client, p_client,
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

SELECT pg_temp.assume_user('1a000000-0000-4000-8000-000000000001');
-- 01 = the emailed control. 02 = the paper-issued twin, never sent.
SELECT pg_temp.mint_agreement('1a300000-0000-4000-8000-000000000001', 'Issued rail engagement');
SELECT pg_temp.mint_agreement('1a300000-0000-4000-8000-000000000002', 'Issued rail engagement');
SELECT pg_temp.send_agreement('1a300000-0000-4000-8000-000000000001');

-- ═══════════════════════════════════════════════════════════════════════════
-- (1) THE HEADLINE — an agreement issued on paper from DRAFT, signed on paper,
--     and countersigned, produces the SAME engagement as one emailed, signed
--     in the portal, and countersigned.
-- ═══════════════════════════════════════════════════════════════════════════

-- CONTROL: the emailed rail, unchanged.
SELECT pg_temp.assume_user('1a000000-0000-4000-8000-000000000002');
SELECT public.sign_design_services_agreement(
  '1a300000-0000-4000-8000-000000000001', 'Issue Client'
);
SELECT pg_temp.assume_user('1a000000-0000-4000-8000-000000000001');
DO $$
DECLARE v_executed jsonb;
BEGIN
  v_executed := public.countersign_design_services_agreement(
    '1a300000-0000-4000-8000-000000000001', 'Issue Designer'
  );
  ASSERT (v_executed->>'newlyExecuted')::boolean, 'control countersign';
  INSERT INTO issue_ids VALUES ('control_project', (v_executed->>'projectId')::uuid);
END $$;

-- PAPER: still in draft, never sent. One call issues it and records the
-- signature; the UNCHANGED countersign then executes it.
DO $$
DECLARE
  v_recorded jsonb;
  v_executed jsonb;
BEGIN
  ASSERT (SELECT commercial_state FROM public.proposals
          WHERE id = '1a300000-0000-4000-8000-000000000002') = 'draft',
    'the paper fixture must start in draft, with no send behind it';

  -- As a REAL caller, not as the bare superuser session: otherwise
  -- guard_commercial_signature_insert takes its 00462:1948 bypass and this
  -- headline would prove nothing about the trigger the issue step has to
  -- satisfy.
  PERFORM pg_temp.assume_role('1a000000-0000-4000-8000-000000000001');
  v_recorded := public.record_paper_client_signature(
    '1a300000-0000-4000-8000-000000000002', 'Issue Client', pg_temp.paper_date(),
    NULL::uuid, true
  );
  PERFORM pg_temp.reset_role();
  ASSERT v_recorded->>'commercialState' = 'client_signed'
     AND (v_recorded->>'newlyClientSigned')::boolean
     AND (v_recorded->>'recorded')::boolean
     AND (v_recorded->>'signedOnPaper')::boolean,
    format('issuing and recording in one act must leave the document client-signed: %s', v_recorded);

  -- Mid-lifecycle, before the countersign: the issue step moved commercial_
  -- state and the two stamps, and nothing else. proposals.status is still
  -- where the drafting room left it — countersign reads commercial_state only
  -- (00475:661), so nothing downstream notices.
  ASSERT (SELECT status FROM public.proposals
          WHERE id = '1a300000-0000-4000-8000-000000000002') = 'draft',
    'the issue step must not touch proposals.status';
  ASSERT (SELECT sent_at FROM public.proposals
          WHERE id = '1a300000-0000-4000-8000-000000000002') IS NULL,
    'nothing was sent, so there is no sent_at';

  v_executed := public.countersign_design_services_agreement(
    '1a300000-0000-4000-8000-000000000002', 'Issue Designer'
  );
  ASSERT (v_executed->>'newlyExecuted')::boolean,
    'the UNCHANGED countersign must execute a paper-ISSUED agreement';
  INSERT INTO issue_ids VALUES ('paper_project', (v_executed->>'projectId')::uuid);
END $$;

-- FIELD IDENTITY. The two engagements are the same engagement.
DO $$
DECLARE
  v_control uuid := (SELECT value FROM issue_ids WHERE key = 'control_project');
  v_paper uuid := (SELECT value FROM issue_ids WHERE key = 'paper_project');
  a jsonb; b jsonb;
BEGIN
  ASSERT v_control IS DISTINCT FROM v_paper, 'two engagements, not one';

  SELECT pg_temp.shape(to_jsonb(p)) INTO a FROM public.projects p WHERE p.id = v_control;
  SELECT pg_temp.shape(to_jsonb(p)) INTO b FROM public.projects p WHERE p.id = v_paper;
  ASSERT a = b, format('project rows differ — %s', pg_temp.jdiff(a, b));

  SELECT pg_temp.shape(to_jsonb(x)) INTO a FROM public.project_billing_authorities x
  WHERE x.project_id = v_control;
  SELECT pg_temp.shape(to_jsonb(x)) INTO b FROM public.project_billing_authorities x
  WHERE x.project_id = v_paper;
  ASSERT a IS NOT NULL AND a = b,
    format('billing authority rows differ — %s', pg_temp.jdiff(a, b));

  SELECT jsonb_agg(pg_temp.shape(to_jsonb(r)) ORDER BY r.role_name) INTO a
  FROM public.project_billing_authority_rates r
  JOIN public.project_billing_authorities x ON x.id = r.billing_authority_id
  WHERE x.project_id = v_control;
  SELECT jsonb_agg(pg_temp.shape(to_jsonb(r)) ORDER BY r.role_name) INTO b
  FROM public.project_billing_authority_rates r
  JOIN public.project_billing_authorities x ON x.id = r.billing_authority_id
  WHERE x.project_id = v_paper;
  ASSERT a IS NOT NULL AND a = b, 'authority rate snapshots differ';

  -- invoice_number is a per-studio running counter, so it is expected to
  -- differ; every other field is not.
  SELECT pg_temp.shape(to_jsonb(i), ARRAY['invoice_number']) INTO a
  FROM public.invoices i WHERE i.project_id = v_control;
  SELECT pg_temp.shape(to_jsonb(i), ARRAY['invoice_number']) INTO b
  FROM public.invoices i WHERE i.project_id = v_paper;
  ASSERT a IS NOT NULL AND a = b,
    format('retainer invoice rows differ — %s', pg_temp.jdiff(a, b));
  ASSERT (SELECT total_cents FROM public.invoices WHERE project_id = v_paper) = 250000,
    'the paper-issued rail issues the same retainer';

  SELECT pg_temp.shape(to_jsonb(d)) INTO a FROM public.project_commercial_documents d
  WHERE d.project_id = v_control;
  SELECT pg_temp.shape(to_jsonb(d)) INTO b FROM public.project_commercial_documents d
  WHERE d.project_id = v_paper;
  ASSERT a = b, format('commercial binding rows differ — %s', pg_temp.jdiff(a, b));

  RAISE NOTICE 'PASS 1: a paper-issued agreement lands the same engagement as an emailed one';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (2) THE PROVENANCE STAMPS. The whole point of the two new columns: the
--     difference between the rails is STATED, not inferred.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  p public.proposals%ROWTYPE;
  c public.proposals%ROWTYPE;
BEGIN
  SELECT * INTO p FROM public.proposals WHERE id = '1a300000-0000-4000-8000-000000000002';
  SELECT * INTO c FROM public.proposals WHERE id = '1a300000-0000-4000-8000-000000000001';
  ASSERT p.issued_on_paper, 'the paper-issued document must say so';
  ASSERT p.paper_issued_by = '1a000000-0000-4000-8000-000000000001',
    'and must name the studio member who issued it';
  ASSERT p.sent_at IS NULL,
    'the executed paper document still carries no sent_at — nothing was ever sent';
  ASSERT p.proposal_send_dispatch_id IS NULL,
    'nothing was dispatched, so there is no dispatch link';
  -- Everything the countersign moved, it moved identically on both rails.
  ASSERT p.status = c.status AND p.commercial_state = c.commercial_state,
    format('the two rails must converge on the same lifecycle — %s/%s vs %s/%s',
           p.status, p.commercial_state, c.status, c.commercial_state);

  -- THE READER'S PREDICATE, exactly as the banner states it.
  ASSERT (p.issued_on_paper AND p.proposal_send_dispatch_id IS NULL),
    'issued on paper AND never emailed — the predicate any reader should use';

  ASSERT NOT c.issued_on_paper, 'an emailed document must not claim paper issuance';
  ASSERT c.paper_issued_by IS NULL, 'and must name nobody as its paper issuer';
  ASSERT c.sent_at IS NOT NULL AND c.proposal_send_dispatch_id IS NOT NULL,
    'this control fixture must actually have been emailed, or the contrast proves nothing';

  RAISE NOTICE 'PASS 2: the stamps distinguish a paper issuance from a real send';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (3) NO EMAIL LEFT — and the client the emailed rail cannot serve at all.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE v_dispatches integer;
BEGIN
  SELECT count(*) INTO v_dispatches FROM public.proposal_send_dispatches
  WHERE proposal_id = '1a300000-0000-4000-8000-000000000002';
  ASSERT v_dispatches = 0,
    format('a paper issuance must write no dispatch row — found %s', v_dispatches);
  SELECT count(*) INTO v_dispatches FROM public.proposal_send_dispatches
  WHERE proposal_id = '1a300000-0000-4000-8000-000000000001';
  ASSERT v_dispatches = 1,
    format('the emailed control must have exactly one dispatch row — found %s', v_dispatches);
END $$;

-- A client with no email on file. The emailed rail refuses them by name; the
-- paper rail carries them all the way to an executed engagement.
SELECT pg_temp.mint_agreement(
  '1a300000-0000-4000-8000-000000000008', 'Emailless engagement',
  '1a000000-0000-4000-8000-000000000004', '1a200000-0000-4000-8000-000000000002');

DO $$
DECLARE
  v_err text;
  v_recorded jsonb;
  v_executed jsonb;
BEGIN
  BEGIN
    PERFORM pg_temp.send_agreement('1a300000-0000-4000-8000-000000000008');
    ASSERT false, 'the emailed rail must refuse a client with no email';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'commercial document client must have an email before sending',
    format('emailless send refusal: %L', v_err);
  ASSERT (SELECT commercial_state FROM public.proposals
          WHERE id = '1a300000-0000-4000-8000-000000000008') = 'draft',
    'the refused send must leave the document exactly where it was';

  v_recorded := public.record_paper_client_signature(
    '1a300000-0000-4000-8000-000000000008', 'Emailless Client', pg_temp.paper_date(),
    NULL::uuid, true
  );
  ASSERT (v_recorded->>'newlyClientSigned')::boolean,
    'the paper rail must serve the client the emailed rail cannot';
  v_executed := public.countersign_design_services_agreement(
    '1a300000-0000-4000-8000-000000000008', 'Issue Designer'
  );
  ASSERT (v_executed->>'newlyExecuted')::boolean,
    'and must carry them to an executed engagement';

  RAISE NOTICE 'PASS 3: no email is written, and a client with no address can still be engaged';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (4) THE STATE RACE. p_issue_on_paper is a statement about what the caller
--     believes. If the document is not in draft the call refuses and NAMES the
--     state it found — it never silently performs a different act.
-- ═══════════════════════════════════════════════════════════════════════════

SELECT pg_temp.mint_agreement('1a300000-0000-4000-8000-000000000003', 'Sent probe');
SELECT pg_temp.send_agreement('1a300000-0000-4000-8000-000000000003');
SELECT pg_temp.mint_agreement('1a300000-0000-4000-8000-000000000004', 'Client-signed probe');
SELECT pg_temp.send_agreement('1a300000-0000-4000-8000-000000000004');
SELECT pg_temp.mint_agreement('1a300000-0000-4000-8000-000000000005', 'Declined probe');
SELECT pg_temp.send_agreement('1a300000-0000-4000-8000-000000000005');
SELECT pg_temp.mint_agreement('1a300000-0000-4000-8000-000000000006', 'Superseded probe');
SELECT pg_temp.send_agreement('1a300000-0000-4000-8000-000000000006');

SELECT pg_temp.assume_user('1a000000-0000-4000-8000-000000000002');
SELECT public.sign_design_services_agreement(
  '1a300000-0000-4000-8000-000000000004', 'Issue Client'
);
SELECT public.decline_proposal('1a300000-0000-4000-8000-000000000005', 'Going another way.');
SELECT pg_temp.assume_user('1a000000-0000-4000-8000-000000000001');

-- Retiring an edition has no first-class RPC; the guard's canonical GUC is the
-- only door, and this suite runs as postgres, so it is the rail's own door.
DO $$
BEGIN
  PERFORM set_config('app.commercial_document_id', '1a300000-0000-4000-8000-000000000006', true);
  UPDATE public.proposals SET
    commercial_state = 'superseded', superseded_at = now(),
    superseded_reason = 'Repriced.', updated_at = now()
  WHERE id = '1a300000-0000-4000-8000-000000000006';
  PERFORM set_config('app.commercial_document_id', '', true);
END $$;

DO $$
DECLARE
  v_err text;
  v_case record;
BEGIN
  FOR v_case IN
    SELECT * FROM (VALUES
      ('1a300000-0000-4000-8000-000000000003'::uuid, 'sent',
       'design services agreement 1a300000-0000-4000-8000-000000000003 is not issuable on paper (sent)'),
      ('1a300000-0000-4000-8000-000000000004'::uuid, 'client_signed',
       'design services agreement 1a300000-0000-4000-8000-000000000004 is not issuable on paper (client_signed)'),
      ('1a300000-0000-4000-8000-000000000002'::uuid, 'executed',
       'design services agreement 1a300000-0000-4000-8000-000000000002 is not issuable on paper (executed)'),
      ('1a300000-0000-4000-8000-000000000005'::uuid, 'declined',
       'design services agreement 1a300000-0000-4000-8000-000000000005 is not issuable on paper (declined)'),
      ('1a300000-0000-4000-8000-000000000006'::uuid, 'superseded',
       'design services agreement 1a300000-0000-4000-8000-000000000006 is not issuable on paper (superseded)')
    ) AS t(id, state, message)
  LOOP
    ASSERT (SELECT commercial_state FROM public.proposals WHERE id = v_case.id) = v_case.state,
      format('fixture for %s is not in %s', v_case.id, v_case.state);
    v_err := NULL;
    BEGIN
      PERFORM public.record_paper_client_signature(
        v_case.id, 'Issue Client', pg_temp.paper_date(), NULL::uuid, true);
      ASSERT false, format('a %s agreement must not be issuable on paper', v_case.state);
    EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
    END;
    ASSERT v_err = v_case.message,
      format('%s issue refusal: %L (wanted %L)', v_case.state, v_err, v_case.message);
  END LOOP;

  -- The refusal is total: nothing was stamped on the way out.
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.proposals
    WHERE id IN ('1a300000-0000-4000-8000-000000000003',
                 '1a300000-0000-4000-8000-000000000004',
                 '1a300000-0000-4000-8000-000000000005',
                 '1a300000-0000-4000-8000-000000000006')
      AND (issued_on_paper OR paper_issued_by IS NOT NULL)
  ), 'a refused issuance must leave no stamp behind';

  RAISE NOTICE 'PASS 4: a state race refuses by name and stamps nothing';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (5) STRICTLY ADDITIVE. Without the flag, the act is 00425's act — including
--     its refusal from draft, in its exact words. This is the regression that
--     proves 00477 added a capability rather than changing one.
-- ═══════════════════════════════════════════════════════════════════════════

SELECT pg_temp.mint_agreement('1a300000-0000-4000-8000-000000000007', 'Additive probe');

DO $$
DECLARE v_err text;
BEGIN
  -- Three-arg form (both new parameters defaulted).
  BEGIN
    PERFORM public.record_paper_client_signature(
      '1a300000-0000-4000-8000-000000000007', 'Issue Client', pg_temp.paper_date());
    ASSERT false, 'the default form must still refuse a draft';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'design services agreement 1a300000-0000-4000-8000-000000000007 is not recordable on paper (draft)',
    format('default-form draft refusal: %L', v_err);

  -- Four-arg form (the shape the shipped portal hook sends today).
  v_err := NULL;
  BEGIN
    PERFORM public.record_paper_client_signature(
      '1a300000-0000-4000-8000-000000000007', 'Issue Client', pg_temp.paper_date(), NULL::uuid);
    ASSERT false, 'the four-arg form must still refuse a draft';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'design services agreement 1a300000-0000-4000-8000-000000000007 is not recordable on paper (draft)',
    format('four-arg draft refusal: %L', v_err);

  -- Explicit FALSE is the same act as omitting it.
  v_err := NULL;
  BEGIN
    PERFORM public.record_paper_client_signature(
      '1a300000-0000-4000-8000-000000000007', 'Issue Client', pg_temp.paper_date(), NULL::uuid, false);
    ASSERT false, 'p_issue_on_paper => false must still refuse a draft';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'design services agreement 1a300000-0000-4000-8000-000000000007 is not recordable on paper (draft)',
    format('explicit-false draft refusal: %L', v_err);

  ASSERT NOT (SELECT issued_on_paper FROM public.proposals
              WHERE id = '1a300000-0000-4000-8000-000000000007'),
    'a refused default-form record must not stamp the document';

  RAISE NOTICE 'PASS 5: without the flag the act is unchanged, refusal message included';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (6) WHO MAY ISSUE. Issuing is a STUDIO act. Neither the client nor another
--     studio may perform it, and neither is told anything about the document.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE v_err text;
BEGIN
  PERFORM pg_temp.assume_user('1a000000-0000-4000-8000-000000000002');
  BEGIN
    PERFORM public.record_paper_client_signature(
      '1a300000-0000-4000-8000-000000000007', 'Issue Client', pg_temp.paper_date(), NULL::uuid, true);
    ASSERT false, 'the client must not issue their own agreement on paper';
  EXCEPTION WHEN insufficient_privilege THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'design services agreement 1a300000-0000-4000-8000-000000000007 not found or access denied',
    format('client-issue refusal: %L', v_err);

  PERFORM pg_temp.assume_user('1a000000-0000-4000-8000-000000000003');
  v_err := NULL;
  BEGIN
    PERFORM public.record_paper_client_signature(
      '1a300000-0000-4000-8000-000000000007', 'Issue Client', pg_temp.paper_date(), NULL::uuid, true);
    ASSERT false, 'an outside studio must not issue an agreement on paper';
  EXCEPTION WHEN insufficient_privilege THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'design services agreement 1a300000-0000-4000-8000-000000000007 not found or access denied',
    format('outsider-issue refusal: %L', v_err);
  PERFORM pg_temp.assume_user('1a000000-0000-4000-8000-000000000001');
END $$;

-- The two refusals above are end-to-end: the issue gate and the record gate
-- raise the same sentence, so either could have produced them. The issuance
-- door is addressed DIRECTLY here — it is zero-grant, so only this suite's
-- owner session can reach it, which is exactly what isolates the NEW gate from
-- the one 00425 already had.
DO $$
DECLARE v_err text;
BEGIN
  PERFORM pg_temp.assume_user('1a000000-0000-4000-8000-000000000002');
  BEGIN
    PERFORM public._issue_design_services_agreement_on_paper(
      '1a300000-0000-4000-8000-000000000007');
    ASSERT false, 'the client must not reach the issuance door';
  EXCEPTION WHEN insufficient_privilege THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'design services agreement 1a300000-0000-4000-8000-000000000007 not found or access denied',
    format('client issuance-door refusal: %L', v_err);

  PERFORM pg_temp.assume_user('1a000000-0000-4000-8000-000000000003');
  v_err := NULL;
  BEGIN
    PERFORM public._issue_design_services_agreement_on_paper(
      '1a300000-0000-4000-8000-000000000007');
    ASSERT false, 'an outside studio must not reach the issuance door';
  EXCEPTION WHEN insufficient_privilege THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'design services agreement 1a300000-0000-4000-8000-000000000007 not found or access denied',
    format('outsider issuance-door refusal: %L', v_err);
  PERFORM pg_temp.assume_user('1a000000-0000-4000-8000-000000000001');

  ASSERT (SELECT commercial_state FROM public.proposals
          WHERE id = '1a300000-0000-4000-8000-000000000007') = 'draft',
    'a refused issuance must leave the document in draft';
END $$;

-- FALSIFY (1/3) — _issue_design_services_agreement_on_paper's actor gate. With
-- _can_author_proposal removed from the live body the client's own issuance
-- lands, which is what makes the two refusals above a test of THAT predicate.
SAVEPOINT falsify_issue_actor;
DO $$
DECLARE v_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = '_issue_design_services_agreement_on_paper';
  ASSERT position('NOT public._can_author_proposal(v_proposal.designer_id)' IN v_def) > 0,
    'FALSIFY setup: the actor predicate must be findable in the live definition';
  EXECUTE replace(v_def,
    'NOT public._can_author_proposal(v_proposal.designer_id)', 'false');
END $$;
DO $$
BEGIN
  PERFORM pg_temp.assume_user('1a000000-0000-4000-8000-000000000002');
  PERFORM public._issue_design_services_agreement_on_paper(
    '1a300000-0000-4000-8000-000000000007');
  ASSERT (SELECT commercial_state FROM public.proposals
          WHERE id = '1a300000-0000-4000-8000-000000000007') = 'sent'
     AND (SELECT issued_on_paper FROM public.proposals
          WHERE id = '1a300000-0000-4000-8000-000000000007'),
    'FALSIFY: with the actor predicate stripped the client''s own issuance must land, proving the gate is what refused it';
  PERFORM pg_temp.assume_user('1a000000-0000-4000-8000-000000000001');
END $$;
ROLLBACK TO SAVEPOINT falsify_issue_actor;

DO $$ BEGIN
  RAISE NOTICE 'PASS 6: only the studio may issue on paper, and the gate is what says so';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (7) THE STAMPS ARE NOT PAINTABLE. public.proposals carries a broad
--     authenticated UPDATE grant gated by row-ownership RLS, so a new column
--     is hand-writable unless the lifecycle guard is told about it.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE v_err text;
BEGIN
  -- The OWNING designer, with no canonical GUC set: still refused.
  BEGIN
    UPDATE public.proposals SET issued_on_paper = true
    WHERE id = '1a300000-0000-4000-8000-000000000007';
    ASSERT false, 'issued_on_paper must not be paintable by hand';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'commercial lifecycle may only change through its canonical RPC',
    format('issued_on_paper hand-write refusal: %L', v_err);

  v_err := NULL;
  BEGIN
    UPDATE public.proposals SET paper_issued_by = '1a000000-0000-4000-8000-000000000001'
    WHERE id = '1a300000-0000-4000-8000-000000000007';
    ASSERT false, 'paper_issued_by must not be paintable by hand';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'commercial lifecycle may only change through its canonical RPC',
    format('paper_issued_by hand-write refusal: %L', v_err);

  -- An ordinary content edit on the same row still lands, so the assertions
  -- above are about these two columns and not about the row being frozen.
  UPDATE public.proposals SET description = 'Edited freely.'
  WHERE id = '1a300000-0000-4000-8000-000000000007';
END $$;

-- And the same, arriving the way the exposure actually would: the owning
-- designer, under the authenticated role, holding the table grant and passing
-- the row-ownership policy.
DO $$
DECLARE v_err text;
BEGIN
  PERFORM pg_temp.assume_role('1a000000-0000-4000-8000-000000000001');
  BEGIN
    UPDATE public.proposals SET issued_on_paper = true,
      paper_issued_by = '1a000000-0000-4000-8000-000000000001'
    WHERE id = '1a300000-0000-4000-8000-000000000007';
    ASSERT false, 'the owning designer must not be able to paint the stamps on';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  -- Proof the grant and the policy were not what stopped it: the same session
  -- may still edit ordinary content on the same row.
  UPDATE public.proposals SET description = 'Edited by the owner.'
  WHERE id = '1a300000-0000-4000-8000-000000000007';
  PERFORM pg_temp.reset_role();
  ASSERT v_err = 'commercial lifecycle may only change through its canonical RPC',
    format('owning-designer stamp refusal: %L', v_err);
END $$;

-- FALSIFY (2/3) — the two columns' clause inside guard_commercial_proposal_
-- authority. With it stripped the hand-write lands, proving the clause is what
-- refused it.
SAVEPOINT falsify_stamp_guard;
DO $$
DECLARE v_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'guard_commercial_proposal_authority';
  ASSERT position('OR NEW.issued_on_paper IS DISTINCT FROM OLD.issued_on_paper' IN v_def) > 0,
    'FALSIFY setup: the stamp clause must be findable in the live definition';
  EXECUTE replace(v_def,
    'OR NEW.issued_on_paper IS DISTINCT FROM OLD.issued_on_paper', '')
    ;
END $$;
DO $$
BEGIN
  UPDATE public.proposals SET issued_on_paper = true
  WHERE id = '1a300000-0000-4000-8000-000000000007';
  ASSERT (SELECT issued_on_paper FROM public.proposals
          WHERE id = '1a300000-0000-4000-8000-000000000007'),
    'FALSIFY: with the stamp clause stripped the hand-write must land, proving the clause is what refused it';
END $$;
ROLLBACK TO SAVEPOINT falsify_stamp_guard;

DO $$ BEGIN
  ASSERT NOT (SELECT issued_on_paper FROM public.proposals
              WHERE id = '1a300000-0000-4000-8000-000000000007'),
    'the falsification must have been rolled back';
  RAISE NOTICE 'PASS 7: neither stamp is writable outside the canonical RPC';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (8) READINESS PARITY. Issuing on paper must not be HARDER than sending by
--     email. The server bar is send_commercial_document's actual design-
--     services bar (00423:1610-1616) and nothing beyond it: terms exist, and
--     at least one role rate exists.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_err text;
  v_send_err text;
BEGIN
  INSERT INTO public.proposals (
    id, designer_id, designer_client_id, client_id, title, description,
    total_amount, status, valid_until
  ) VALUES (
    '1a300000-0000-4000-8000-000000000009',
    '1a000000-0000-4000-8000-000000000001',
    '1a200000-0000-4000-8000-000000000001',
    '1a000000-0000-4000-8000-000000000002',
    'Bare probe', 'No terms, no rates.', 0, 'draft', DATE '2027-01-01'
  );
  UPDATE public.proposals SET document_kind = 'design_services'
  WHERE id = '1a300000-0000-4000-8000-000000000009';

  BEGIN
    PERFORM public.record_paper_client_signature(
      '1a300000-0000-4000-8000-000000000009', 'Issue Client', pg_temp.paper_date(), NULL::uuid, true);
    ASSERT false, 'a document with no terms or rates must not be issuable on paper';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'design services agreement requires terms and at least one role rate',
    format('bare-issue refusal: %L', v_err);

  -- And the emailed rail refuses the same document for the same reason, so the
  -- two bars are the same bar rather than two bars that happen to both fire.
  BEGIN
    PERFORM pg_temp.send_agreement('1a300000-0000-4000-8000-000000000009');
    ASSERT false, 'the emailed rail must refuse the same bare document';
  EXCEPTION WHEN check_violation THEN v_send_err := SQLERRM;
  END;
  ASSERT v_send_err = 'design-services send requires terms and role rates',
    format('bare-send refusal: %L', v_send_err);

  RAISE NOTICE 'PASS 8: the paper bar is the emailed bar — terms and one rate, no more';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (9) ORDERING IS LOAD-BEARING. guard_commercial_signature_insert re-derives
--     the proposal with a fresh SELECT at trigger-fire time (00462:1954) and
--     refuses any client-role signature row unless commercial_state = 'sent'
--     (00462:1969). So the issue step MUST run before the impl's INSERT, and
--     it does — section (1) could not have passed otherwise.
--
--     Proven rather than inferred: with the impl's OWN state guard removed,
--     recording against a draft is still refused — by the TRIGGER, in the
--     trigger's words. That is the gate the mid-transaction flip satisfies.
-- ═══════════════════════════════════════════════════════════════════════════

SELECT pg_temp.mint_agreement('1a300000-0000-4000-8000-00000000000a', 'Ordering probe');

SAVEPOINT falsify_signature_trigger;
DO $$
DECLARE v_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = '_record_paper_client_signature_impl';
  ASSERT position('IF v_proposal.commercial_state IS DISTINCT FROM ''sent'' THEN' IN v_def) > 0,
    'FALSIFY setup: the impl state guard must be findable in the live definition';
  EXECUTE replace(v_def,
    'IF v_proposal.commercial_state IS DISTINCT FROM ''sent'' THEN',
    'IF false THEN');
END $$;
DO $$
DECLARE v_err text;
BEGIN
  PERFORM pg_temp.assume_role('1a000000-0000-4000-8000-000000000001');
  BEGIN
    PERFORM public.record_paper_client_signature(
      '1a300000-0000-4000-8000-00000000000a', 'Issue Client', pg_temp.paper_date());
    ASSERT false, 'the signature trigger must refuse a draft-state client signature on its own';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  PERFORM pg_temp.reset_role();
  ASSERT v_err = 'commercial signature does not match canonical signer/state/evidence',
    format('trigger-level state refusal: %L', v_err);
END $$;
ROLLBACK TO SAVEPOINT falsify_signature_trigger;

-- FALSIFY (3/3) — and with the impl guard stripped AND the flag passed, the
-- same call succeeds: the flip to 'sent' is exactly what the trigger observed.
SAVEPOINT falsify_ordering_positive;
DO $$
DECLARE v_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = '_record_paper_client_signature_impl';
  EXECUTE replace(v_def,
    'IF v_proposal.commercial_state IS DISTINCT FROM ''sent'' THEN',
    'IF false THEN');
END $$;
DO $$
DECLARE v_result jsonb;
BEGIN
  PERFORM pg_temp.assume_role('1a000000-0000-4000-8000-000000000001');
  v_result := public.record_paper_client_signature(
    '1a300000-0000-4000-8000-00000000000a', 'Issue Client', pg_temp.paper_date(), NULL::uuid, true);
  PERFORM pg_temp.reset_role();
  ASSERT (v_result->>'newlyClientSigned')::boolean,
    'the issue step is what admits the signature row past the trigger';
END $$;
ROLLBACK TO SAVEPOINT falsify_ordering_positive;

DO $$ BEGIN
  RAISE NOTICE 'PASS 9: the trigger gates on state at fire time, and the issue step is what satisfies it';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (10) SHAPE — ACLs, arity and the pinned search_path, as authored.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  -- The one public door: authenticated only.
  IF NOT has_function_privilege('authenticated',
       'public.record_paper_client_signature(uuid, text, date, uuid, boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL 10a: authenticated cannot execute record_paper_client_signature';
  END IF;
  IF has_function_privilege('anon',
       'public.record_paper_client_signature(uuid, text, date, uuid, boolean)', 'EXECUTE')
     OR has_function_privilege('service_role',
       'public.record_paper_client_signature(uuid, text, date, uuid, boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL 10b: record_paper_client_signature carries a grant it should not';
  END IF;

  -- The private issuance door: zero grants, service_role included.
  IF has_function_privilege('authenticated',
       'public._issue_design_services_agreement_on_paper(uuid)', 'EXECUTE')
     OR has_function_privilege('anon',
       'public._issue_design_services_agreement_on_paper(uuid)', 'EXECUTE')
     OR has_function_privilege('service_role',
       'public._issue_design_services_agreement_on_paper(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL 10c: _issue_design_services_agreement_on_paper carries a grant it should not';
  END IF;

  -- The four-arg entry point is GONE — one door, not two.
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'record_paper_client_signature'
      AND pg_get_function_identity_arguments(p.oid)
          = 'p_proposal_id uuid, p_signed_name text, p_paper_signed_on date, p_scan_document_id uuid'
  ) THEN
    RAISE EXCEPTION 'FAIL 10d: the superseded four-arg record_paper_client_signature still exists';
  END IF;
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'record_paper_client_signature') <> 1 THEN
    RAISE EXCEPTION 'FAIL 10e: record_paper_client_signature is overloaded';
  END IF;

  -- Both new/re-cut DEFINER doors pin search_path.
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('record_paper_client_signature',
                        '_issue_design_services_agreement_on_paper')
      AND (NOT p.prosecdef OR NOT ('search_path=public, pg_temp' = ANY (p.proconfig)))
  ) THEN
    RAISE EXCEPTION 'FAIL 10f: a door is not a search_path-pinned SECURITY DEFINER';
  END IF;

  -- The lifecycle guard stays SECURITY INVOKER — it must see the caller.
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'guard_commercial_proposal_authority'
      AND (p.prosecdef OR NOT ('search_path=public, pg_temp' = ANY (p.proconfig)))
  ) THEN
    RAISE EXCEPTION 'FAIL 10g: guard_commercial_proposal_authority changed security posture';
  END IF;

  RAISE NOTICE 'PASS 10: grants, arity and search_path are as authored';
END $$;

DO $$
BEGIN
  RAISE NOTICE 'design_services_paper_issue_test: all sections passed';
END $$;

ROLLBACK;
