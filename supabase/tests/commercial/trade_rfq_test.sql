-- 00424 Trade RFQ integration test.
-- Runner: plain psql, ON_ERROR_STOP=1. The transaction rolls back.
-- Run:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f supabase/tests/commercial/trade_rfq_test.sql
--
-- What this suite is for: 00424 hands a THIRD PARTY — a sub with no login, no
-- seat and no relationship to the client — a live link into a commercial
-- document. Three things therefore have to be pinned harder than usual:
--
--   · WHAT THE LINK SHOWS. The DTO is asserted key-for-key, and its ABSENCES
--     are asserted twice over: by `?` on every key that must not exist, and by
--     regex on the serialized payload, so a value that arrives nested under an
--     innocent key is caught too. The client price, the draw schedule, another
--     party's number and the client's identity must not be in there — not by
--     any route.
--   · WHAT THE LINK IS. A credential, stored as sha256 and never re-emitted.
--     Minting supersedes; the superseded link dies immediately; a dead link and
--     a link that never existed answer identically (NULL).
--   · WHEN THE ASKING STOPS. The client's signature ends the buying. Every live
--     link dies at execution and every open ask closes, and a sub who arrives
--     afterwards is told the truth — the window is closed — rather than that
--     their link is broken.
--
-- FALSIFIABILITY. Four refusals are proven to BITE rather than merely to be
-- present: each is re-run inside a SAVEPOINT with exactly one predicate stripped
-- out of the LIVE function body (rewritten from pg_get_functiondef, so what runs
-- is the shipped body minus that predicate and nothing else), asserting the leak
-- comes back, before rolling the savepoint back — which restores the definition,
-- because DDL is transactional. Those blocks are marked FALSIFY. Without them a
-- passing refusal only proves that SOMETHING refused.

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id uuid, p_role text DEFAULT 'authenticated')
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_user_id, 'role', p_role
  )::text, true);
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (1) FIXTURE — an executed design-services engagement, two rooms, two subs,
--     and TWO trade scopes: one that walks the whole rail, and one that stays a
--     draft so section (10) can ask prepare_trade_rfq about a foreign party
--     without the executed-scope window answering first.
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
) VALUES
  ('d9000000-0000-4000-8000-000000000001', 'rfq-designer@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('d9000000-0000-4000-8000-000000000002', 'rfq-buyer@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('d9000000-0000-4000-8000-000000000003', 'rfq-stranger@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES
  ('d9000000-0000-4000-8000-000000000001', 'rfq-designer@test.invalid', 'RFQ Designer', true, now(), now()),
  ('d9000000-0000-4000-8000-000000000002', 'rfq-buyer@test.invalid', 'Wren Ashford', false, now(), now()),
  ('d9000000-0000-4000-8000-000000000003', 'rfq-stranger@test.invalid', 'RFQ Stranger', false, now(), now())
ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, full_name = EXCLUDED.full_name;

INSERT INTO public.organizations (id, type, name, slug, status)
VALUES ('d9100000-0000-4000-8000-000000000001', 'design_studio',
        'RFQ Rail Studio', 'rfq-rail-test', 'active');
SELECT pg_temp.assume_user('d9000000-0000-4000-8000-000000000001', 'service_role');
INSERT INTO public.organization_members (
  id, user_id, organization_id, role, status, joined_at
) VALUES (
  'd9110000-0000-4000-8000-000000000001',
  'd9000000-0000-4000-8000-000000000001',
  'd9100000-0000-4000-8000-000000000001', 'owner', 'active', now()
);

INSERT INTO public.designer_clients (
  id, designer_id, client_id, client_name, status, source
) VALUES (
  'd9200000-0000-4000-8000-000000000001',
  'd9000000-0000-4000-8000-000000000001',
  'd9000000-0000-4000-8000-000000000002',
  'Wren Ashford', 'proposal', 'direct'
);

CREATE TEMP TABLE rfq_ids (key text PRIMARY KEY, value uuid NOT NULL) ON COMMIT DROP;

SELECT pg_temp.assume_user('d9000000-0000-4000-8000-000000000001');
INSERT INTO public.proposals (
  id, designer_id, designer_client_id, client_id, title, description,
  total_amount, status, valid_until
) VALUES (
  'd9300000-0000-4000-8000-000000000001',
  'd9000000-0000-4000-8000-000000000001',
  'd9200000-0000-4000-8000-000000000001',
  'd9000000-0000-4000-8000-000000000002',
  'Ashford residence', 'The origin document.', 0, 'draft',
  now() + interval '180 days'
);
INSERT INTO public.proposal_phases (
  id, proposal_id, name, phase_key, duration_days, lane, fee_cents, sort_order
) VALUES (
  'd9310000-0000-4000-8000-000000000001',
  'd9300000-0000-4000-8000-000000000001',
  'Design development', 'design-development', 30, 'main', 0, 0
);
DO $$
DECLARE v_snapshot jsonb;
BEGIN
  PERFORM public.upsert_design_services_draft(
    'd9300000-0000-4000-8000-000000000001',
    jsonb_build_object(
      'scope', 'Whole-home interior design services.',
      'deliverables', jsonb_build_array('Concept', 'Selections', 'Trade coordination'),
      'exclusions', jsonb_build_array('Structural engineering'),
      'billingCeilingCents', 800000,
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
    'd9300000-0000-4000-8000-000000000001'
  );
  PERFORM public.send_commercial_document(
    'd9300000-0000-4000-8000-000000000001',
    v_snapshot->>'documentFingerprint', NULL, now() + interval '180 days'
  );
END $$;
SELECT pg_temp.assume_user('d9000000-0000-4000-8000-000000000002');
SELECT public.sign_design_services_agreement(
  'd9300000-0000-4000-8000-000000000001', 'Wren Ashford'
);
SELECT pg_temp.assume_user('d9000000-0000-4000-8000-000000000001');
DO $$
DECLARE v_executed jsonb;
BEGIN
  v_executed := public.countersign_design_services_agreement(
    'd9300000-0000-4000-8000-000000000001', 'RFQ Designer'
  );
  ASSERT (v_executed->>'newlyExecuted')::boolean, 'origin countersign';
  INSERT INTO rfq_ids VALUES ('project', (v_executed->>'projectId')::uuid);
END $$;

DO $$
DECLARE
  v_project uuid := (SELECT value FROM rfq_ids WHERE key = 'project');
  v_kitchen uuid; v_bath uuid;
BEGIN
  INSERT INTO public.project_rooms (project_id, name, sort_order)
  VALUES (v_project, 'Kitchen', 0) RETURNING id INTO v_kitchen;
  INSERT INTO public.project_rooms (project_id, name, sort_order)
  VALUES (v_project, 'Primary bath', 1) RETURNING id INTO v_bath;
  INSERT INTO rfq_ids VALUES ('kitchen', v_kitchen), ('bath', v_bath);

  -- The two subs the studio is shopping to. Neither has a login.
  INSERT INTO public.project_parties (
    id, project_id, party_kind, display_name, company_name, trade, email, phone
  ) VALUES
    ('d9800000-0000-4000-8000-000000000001', v_project, 'sub', 'Hollis Millwork',
     'Hollis & Sons LLC', 'Millwork', 'hollis@rfq.test.invalid', '555-0101'),
    ('d9800000-0000-4000-8000-000000000002', v_project, 'sub', 'Renn Casework',
     'Renn Surfaces Inc', 'Casework', 'renn@rfq.test.invalid', '555-0202');
END $$;

-- A second project with its own party, so the cross-project refusal in (10) is
-- proven against a REAL party of another project rather than a missing uuid.
INSERT INTO public.projects (id, name, client_id, designer_id, created_by)
VALUES ('d9500000-0000-4000-8000-000000000009', 'Another residence',
        'd9000000-0000-4000-8000-000000000002',
        'd9000000-0000-4000-8000-000000000001',
        'd9000000-0000-4000-8000-000000000001');
INSERT INTO public.project_parties (
  id, project_id, party_kind, display_name, company_name, trade
) VALUES (
  'd9800000-0000-4000-8000-000000000009',
  'd9500000-0000-4000-8000-000000000009', 'sub', 'Outsider Trades',
  'Outsider LLC', 'Millwork'
);

-- The scope that walks the rail, and the draft that stays behind.
DO $$
DECLARE
  v_project uuid := (SELECT value FROM rfq_ids WHERE key = 'project');
  v_kitchen uuid := (SELECT value FROM rfq_ids WHERE key = 'kitchen');
  v_bath uuid := (SELECT value FROM rfq_ids WHERE key = 'bath');
  v_scope jsonb;
  v_scope_id uuid;
  v_second jsonb;
BEGIN
  v_scope := public.create_trade_scope(v_project, 'Kitchen and bath millwork');
  v_scope_id := (v_scope->>'proposalId')::uuid;
  INSERT INTO rfq_ids VALUES
    ('scope', v_scope_id), ('scope_doc', (v_scope->>'documentId')::uuid);

  -- The work, as prose, one section per room. The words are chosen to contain
  -- none of the tokens section (4) probes the payload for — no "price", no
  -- "draw", no "allocation", no digits — so those probes test the DTO and not
  -- an accident of the fixture's vocabulary.
  INSERT INTO public.trade_scope_sections (
    proposal_id, project_room_id, room_name, prose, sort_order
  ) VALUES
    (v_scope_id, v_kitchen, 'Kitchen',
     'Full-height rift white oak cabinetry with integrated appliance panels and '
     'a waterfall island surround.', 0),
    (v_scope_id, v_bath, 'Primary bath',
     'Floating vanity in matching oak with a stone deck, plus a linen tower.', 1);

  UPDATE public.trade_scope_terms SET
    client_price_cents = 900000,
    terms = 'Half of the balance is due at rough-in.'
  WHERE proposal_id = v_scope_id;

  v_second := public.create_trade_scope(v_project, 'Stair and rail package');
  INSERT INTO rfq_ids VALUES ('scope2', (v_second->>'proposalId')::uuid);
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (2) PREPARING AN ASK. Upsert-by-draft: preparing again while the ask is still
--     unsent REVISES it. And the snapshot is a FREEZE — the sections stay
--     editable in draft, and what the sub was asked does not move under them.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_scope uuid := (SELECT value FROM rfq_ids WHERE key = 'scope');
  v_first jsonb;
  v_second jsonb;
  v_rfq_id uuid;
BEGIN
  v_first := public.prepare_trade_rfq(
    v_scope, 'd9800000-0000-4000-8000-000000000001',
    'Send your number for the cabinetry and the vanity.',
    'Fabrication start in March.'
  );
  v_rfq_id := (v_first->>'id')::uuid;
  INSERT INTO rfq_ids VALUES ('rfq_hollis', v_rfq_id);

  ASSERT v_first->>'status' = 'draft',
    'a prepared ask is a draft until something sends it';
  ASSERT v_first->>'partyDisplayName' = 'Hollis Millwork',
    'prepare must snapshot the party name it was given';
  ASSERT (v_first->>'sentAt') IS NULL AND (v_first->>'respondedAt') IS NULL,
    'nothing has been sent and nothing has come back';

  -- The snapshot and its hash.
  ASSERT (SELECT scope_snapshot_hash FROM public.trade_rfq_requests WHERE id = v_rfq_id)
         ~ '^[0-9a-f]{64}$',
    'the ask must carry a sha256 hex hash of what it froze';
  ASSERT v_first->>'scopeSnapshotHash'
         = (SELECT scope_snapshot_hash FROM public.trade_rfq_requests WHERE id = v_rfq_id),
    'and hand the same hash back to the caller';
  ASSERT (SELECT jsonb_array_length(scope_snapshot->'sections')
          FROM public.trade_rfq_requests WHERE id = v_rfq_id) = 2,
    'the snapshot must carry both sections';
  ASSERT (SELECT scope_snapshot->'sections'->0->>'roomName'
          FROM public.trade_rfq_requests WHERE id = v_rfq_id) = 'Kitchen',
    'the snapshot must carry the room a section happens in';

  -- The snapshot is what a sub is asked, not what the studio is charging. No
  -- allocation, no price, no draw schedule reaches it.
  ASSERT NOT ((SELECT scope_snapshot FROM public.trade_rfq_requests WHERE id = v_rfq_id)
              ? 'clientPriceCents')
     AND NOT ((SELECT scope_snapshot FROM public.trade_rfq_requests WHERE id = v_rfq_id)
              ? 'draws')
     AND (SELECT scope_snapshot::text FROM public.trade_rfq_requests WHERE id = v_rfq_id)
         !~* 'allocation',
    'the frozen snapshot must carry no client money';

  -- Prepare again while it is still a draft: the SAME row moves.
  v_second := public.prepare_trade_rfq(
    v_scope, 'd9800000-0000-4000-8000-000000000001',
    'Send your number by Friday, please.',
    'Fabrication start in March, install the first week of May.'
  );
  ASSERT (v_second->>'id')::uuid = v_rfq_id,
    'preparing again must revise the unsent ask, not open a second one';
  ASSERT v_second->>'message' = 'Send your number by Friday, please.'
     AND v_second->>'timeline' = 'Fabrication start in March, install the first week of May.',
    'the revision must actually take';
  ASSERT (SELECT count(*) FROM public.trade_rfq_requests
          WHERE proposal_id = v_scope
            AND party_id = 'd9800000-0000-4000-8000-000000000001') = 1,
    'and must leave exactly one row behind';

  -- CLEARING. NULL means "leave what is there" — the caller is not talking about
  -- that field. An explicit empty string is the studio taking words back, and a
  -- form that cannot take them back makes its own first draft permanent: every
  -- later ask carries a timeline the studio has since changed its mind about.
  PERFORM public.prepare_trade_rfq(
    v_scope, 'd9800000-0000-4000-8000-000000000001', NULL, NULL);
  ASSERT (SELECT message FROM public.trade_rfq_requests WHERE id = v_rfq_id)
         = 'Send your number by Friday, please.'
     AND (SELECT timeline FROM public.trade_rfq_requests WHERE id = v_rfq_id)
         = 'Fabrication start in March, install the first week of May.',
    'an absent message leaves the stored one alone';

  PERFORM public.prepare_trade_rfq(
    v_scope, 'd9800000-0000-4000-8000-000000000001', '', '   ');
  ASSERT (SELECT message FROM public.trade_rfq_requests WHERE id = v_rfq_id) IS NULL
     AND (SELECT timeline FROM public.trade_rfq_requests WHERE id = v_rfq_id) IS NULL,
    'an explicit empty string clears it — whitespace included';

  -- Put the words back; the rest of the suite reads them off the DTO.
  PERFORM public.prepare_trade_rfq(
    v_scope, 'd9800000-0000-4000-8000-000000000001',
    'Send your number by Friday, please.',
    'Fabrication start in March, install the first week of May.');
  ASSERT (SELECT message FROM public.trade_rfq_requests WHERE id = v_rfq_id)
         = 'Send your number by Friday, please.',
    'and writing them again takes';
END $$;

-- THE FREEZE. The sections are edited AFTER Hollis was asked. Hollis's ask must
-- still read the words it went out with; Renn, asked afterwards, gets the new
-- ones. The two snapshots differing is what proves the first one is frozen and
-- not merely a view.
DO $$
DECLARE
  v_scope uuid := (SELECT value FROM rfq_ids WHERE key = 'scope');
  v_rfq_hollis uuid := (SELECT value FROM rfq_ids WHERE key = 'rfq_hollis');
  v_rfq_renn uuid;
  v_renn jsonb;
BEGIN
  UPDATE public.trade_scope_sections
  SET prose = 'Full-height rift white oak cabinetry, integrated appliance panels, '
              'a waterfall island surround, and a butler pantry run.'
  WHERE proposal_id = v_scope AND sort_order = 0;

  ASSERT (SELECT scope_snapshot->'sections'->0->>'prose'
          FROM public.trade_rfq_requests WHERE id = v_rfq_hollis)
         = 'Full-height rift white oak cabinetry with integrated appliance panels and '
           'a waterfall island surround.',
    'the ask must still read the words it went out with';
  ASSERT (SELECT prose FROM public.trade_scope_sections
          WHERE proposal_id = v_scope AND sort_order = 0)
         <> (SELECT scope_snapshot->'sections'->0->>'prose'
             FROM public.trade_rfq_requests WHERE id = v_rfq_hollis),
    'the live section really did move, or the freeze above proves nothing';

  v_renn := public.prepare_trade_rfq(
    v_scope, 'd9800000-0000-4000-8000-000000000002',
    'Same package — what would you charge?', 'March start.'
  );
  v_rfq_renn := (v_renn->>'id')::uuid;
  INSERT INTO rfq_ids VALUES ('rfq_renn', v_rfq_renn);
  ASSERT (SELECT scope_snapshot->'sections'->0->>'prose'
          FROM public.trade_rfq_requests WHERE id = v_rfq_renn)
         LIKE '%butler pantry run.',
    'an ask prepared after the edit must freeze the CURRENT words';
  ASSERT (SELECT scope_snapshot_hash FROM public.trade_rfq_requests WHERE id = v_rfq_renn)
         <> (SELECT scope_snapshot_hash FROM public.trade_rfq_requests WHERE id = v_rfq_hollis),
    'two different questions must not hash the same';
END $$;

-- Stamping status/sent_at/party_email is the edge function's act
-- (trade-rfq-send, first-send-only). Standing in for it here so the rest of the
-- suite tests the DATABASE rail rather than the dispatcher.
UPDATE public.trade_rfq_requests SET
  status = 'sent', sent_at = now(),
  party_email = (SELECT email FROM public.project_parties WHERE id = party_id)
WHERE proposal_id = (SELECT value FROM rfq_ids WHERE key = 'scope')
  AND status = 'draft';

-- ═══════════════════════════════════════════════════════════════════════════
-- (3) MINTING THE LINK. Service role only, raw token returned once, and
--     re-minting kills what came before.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_rfq uuid := (SELECT value FROM rfq_ids WHERE key = 'rfq_hollis');
  v_id uuid;
  v_raw text;
  v_err text;
BEGIN
  -- An authenticated studio member cannot mint. Handing over the link is the
  -- send's act, not a member's.
  BEGIN
    SELECT m.id, m.token INTO v_id, v_raw FROM public.mint_trade_rfq_token(v_rfq) m;
    ASSERT false, 'an authenticated caller must not mint an RFQ link';
  EXCEPTION WHEN insufficient_privilege THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'minting a trade RFQ link requires service_role',
    format('mint role refusal: %L', v_err);

  PERFORM pg_temp.assume_user('d9000000-0000-4000-8000-000000000001', 'service_role');
  SELECT m.id, m.token INTO v_id, v_raw FROM public.mint_trade_rfq_token(v_rfq) m;
  ASSERT v_raw ~ '^[0-9a-f]{64}$',
    format('the raw token must be 32 random bytes as hex: %L', v_raw);
  PERFORM set_config('rfq.token_stale', v_raw, true);
  INSERT INTO rfq_ids VALUES ('token_stale', v_id);

  -- Only the hash is at rest. The raw value appears nowhere in the row.
  ASSERT (SELECT token_hash FROM public.trade_rfq_tokens WHERE id = v_id)
         = encode(extensions.digest(v_raw, 'sha256'), 'hex'),
    'the stored hash must be sha256 of the token that was handed out';
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.trade_rfq_tokens t
    WHERE t.id = v_id AND t.token_hash = v_raw),
    'the raw token must never be what is stored';
  ASSERT (SELECT count(*) FROM public.trade_rfq_tokens
          WHERE rfq_request_id = v_rfq AND status = 'active') = 1,
    'one live link per ask';
  ASSERT (SELECT expires_at > now() + interval '29 days'
            AND expires_at < now() + interval '31 days'
          FROM public.trade_rfq_tokens WHERE id = v_id),
    'an RFQ link lives thirty days';
END $$;

-- Re-mint. Hash-at-rest means "send it again" can only mean "revoke and cut a
-- fresh one" — so the link already in the sub's inbox must die.
DO $$
DECLARE
  v_rfq uuid := (SELECT value FROM rfq_ids WHERE key = 'rfq_hollis');
  v_stale text := current_setting('rfq.token_stale');
  v_id uuid;
  v_raw text;
BEGIN
  SELECT m.id, m.token INTO v_id, v_raw FROM public.mint_trade_rfq_token(v_rfq) m;
  PERFORM set_config('rfq.token_hollis', v_raw, true);
  INSERT INTO rfq_ids VALUES ('token_hollis', v_id);

  ASSERT v_raw <> v_stale, 'a re-mint must not re-emit the prior token';
  ASSERT (SELECT status FROM public.trade_rfq_tokens
          WHERE id = (SELECT value FROM rfq_ids WHERE key = 'token_stale')) = 'revoked',
    'the superseded link must be revoked at the row';
  ASSERT (SELECT count(*) FROM public.trade_rfq_tokens
          WHERE rfq_request_id = v_rfq AND status = 'active') = 1,
    'and still exactly one live link';
  ASSERT public.resolve_trade_rfq_link(v_stale) IS NULL,
    'the superseded link must be dead the moment it is superseded';
  ASSERT public.resolve_trade_rfq_link(v_raw) IS NOT NULL,
    'and the fresh one must work, or the NULL above is not about revocation';
END $$;

-- Renn's link, minted once and left alone.
DO $$
DECLARE
  v_rfq uuid := (SELECT value FROM rfq_ids WHERE key = 'rfq_renn');
  v_id uuid;
  v_raw text;
BEGIN
  SELECT m.id, m.token INTO v_id, v_raw FROM public.mint_trade_rfq_token(v_rfq) m;
  PERFORM set_config('rfq.token_renn', v_raw, true);
  INSERT INTO rfq_ids VALUES ('token_renn', v_id);
END $$;
SELECT pg_temp.assume_user('d9000000-0000-4000-8000-000000000001');

-- FALSIFY (MINT AUTHORITY) — the service_role assertion is neutered in the live
-- body (its comparison is rewritten so it can never fire) and an authenticated
-- member mints a live credential. That is what the refusal above is holding
-- shut; the 42501 could otherwise have come from anywhere.
SAVEPOINT mint_falsify;
DO $$
DECLARE
  v_def text := pg_get_functiondef('public.mint_trade_rfq_token(uuid)'::regprocedure);
  v_stripped text;
BEGIN
  v_stripped := replace(v_def,
    'COALESCE(auth.role(), '''') <> ''service_role''',
    'false');
  ASSERT v_stripped <> v_def,
    'FALSIFY: the service_role assertion must actually be in the shipped body, or there is nothing to strip';
  EXECUTE v_stripped;
END $$;
DO $$
DECLARE
  v_rfq uuid := (SELECT value FROM rfq_ids WHERE key = 'rfq_renn');
  v_id uuid;
  v_raw text;
BEGIN
  SELECT m.id, m.token INTO v_id, v_raw FROM public.mint_trade_rfq_token(v_rfq) m;
  ASSERT v_raw ~ '^[0-9a-f]{64}$',
    'FALSIFY: without the role assertion an authenticated member mints a live link — that assertion is the only thing stopping it';
END $$;
ROLLBACK TO SAVEPOINT mint_falsify;
DO $$
DECLARE v_err text; v_id uuid; v_raw text;
BEGIN
  BEGIN
    SELECT m.id, m.token INTO v_id, v_raw
    FROM public.mint_trade_rfq_token((SELECT value FROM rfq_ids WHERE key = 'rfq_renn')) m;
    ASSERT false, 'the savepoint rollback must restore the shipped mint body';
  EXCEPTION WHEN insufficient_privilege THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'minting a trade RFQ link requires service_role',
    format('post-rollback refusal: %L', v_err);
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (4) THE GUEST READ. What the sub is shown, and — asserted twice over — what
--     they are not.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_scope uuid := (SELECT value FROM rfq_ids WHERE key = 'scope');
  v_project uuid := (SELECT value FROM rfq_ids WHERE key = 'project');
  v_rfq uuid := (SELECT value FROM rfq_ids WHERE key = 'rfq_hollis');
  v_token_id uuid := (SELECT value FROM rfq_ids WHERE key = 'token_hollis');
  v_raw text := current_setting('rfq.token_hollis');
  v_dto jsonb;
  v_used_before timestamptz;
BEGIN
  -- now() is the TRANSACTION timestamp and this whole suite is one transaction,
  -- so a bump to now() is only observable against a value that predates it. The
  -- link is backdated an hour first; every "it moved" assertion in this file
  -- works the same way.
  UPDATE public.trade_rfq_tokens SET last_used_at = now() - interval '1 hour'
  WHERE id = v_token_id;
  SELECT last_used_at INTO v_used_before FROM public.trade_rfq_tokens WHERE id = v_token_id;
  v_dto := public.resolve_trade_rfq_link(v_raw);
  ASSERT v_dto IS NOT NULL, 'a live link must resolve';

  -- THE CONTRACT, key for key. An added key is a leak until proven otherwise,
  -- so this is an equality and not a containment.
  ASSERT (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(v_dto) k)
         = ARRAY['existingResponse','message','partyDisplayName',
                 'rfq','scopeTitle','sections','studioName','timeline'],
    format('DTO key set: %s', (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(v_dto) k));
  ASSERT (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(v_dto->'rfq') k)
         = ARRAY['id','respondedAt','status'],
    'the rfq object is exactly id, status and respondedAt';

  -- The values.
  ASSERT v_dto->>'studioName' = 'RFQ Rail Studio',
    format('studioName: %L', v_dto->>'studioName');
  -- NO PROJECT NAME, and this fixture is the argument for it: studios name
  -- projects after the people who live in them. 'Ashford residence' is the
  -- client's surname wearing a neutral-looking key, and a sub who is told the
  -- studio's name and the scope's title has everything they need to price the
  -- work without it.
  ASSERT (SELECT name FROM public.projects WHERE id = v_project) LIKE '%Ashford%',
    'fixture: the project is named after the client, or the absence below proves nothing';
  ASSERT NOT (v_dto ? 'projectName'),
    'the DTO must not carry the project''s name';
  ASSERT position('Ashford' in v_dto::text) = 0,
    'nor the client''s surname by way of one';
  ASSERT v_dto->>'scopeTitle' = 'Kitchen and bath millwork',
    format('scopeTitle: %L', v_dto->>'scopeTitle');
  ASSERT v_dto->>'partyDisplayName' = 'Hollis Millwork',
    format('partyDisplayName: %L', v_dto->>'partyDisplayName');
  ASSERT v_dto->>'timeline' = 'Fabrication start in March, install the first week of May.',
    'the timeline the studio wrote';
  ASSERT v_dto->>'message' = 'Send your number by Friday, please.',
    'the message the studio wrote';
  ASSERT (v_dto->>'existingResponse') IS NULL,
    'nothing has come back yet, so there is no prior answer to show';
  ASSERT v_dto->'rfq'->>'id' = v_rfq::text
     AND v_dto->'rfq'->>'status' = 'sent'
     AND (v_dto->'rfq'->>'respondedAt') IS NULL,
    'the ask reports itself sent and unanswered';

  -- The sections come from the SNAPSHOT, and carry only the room and the words.
  ASSERT jsonb_array_length(v_dto->'sections') = 2, 'both rooms travel';
  ASSERT (SELECT array_agg(k ORDER BY k)
          FROM jsonb_object_keys(v_dto->'sections'->0) k) = ARRAY['prose','roomName'],
    'a section is exactly a room name and the words';
  ASSERT v_dto->'sections'->0->>'roomName' = 'Kitchen'
     AND v_dto->'sections'->1->>'roomName' = 'Primary bath',
    'the rooms arrive in the order they were written in';
  ASSERT v_dto->'sections'->0->>'prose'
         = 'Full-height rift white oak cabinetry with integrated appliance panels and '
           'a waterfall island surround.',
    'the sub reads the question that was ASKED, not the section as it reads now';

  -- ── THE ABSENCES, probe one: no such key, anywhere in the object ─────────
  ASSERT NOT (v_dto ? 'clientPriceCents') AND NOT (v_dto ? 'clientPrice')
     AND NOT (v_dto ? 'draws') AND NOT (v_dto ? 'drawSchedule')
     AND NOT (v_dto ? 'bids') AND NOT (v_dto ? 'otherBids')
     AND NOT (v_dto ? 'allocationCents') AND NOT (v_dto ? 'tradeScope')
     AND NOT (v_dto ? 'clientId') AND NOT (v_dto ? 'clientName')
     AND NOT (v_dto ? 'client') AND NOT (v_dto ? 'invoice')
     AND NOT (v_dto ? 'terms') AND NOT (v_dto ? 'currency'),
    'the DTO must carry no key for the studio''s money, the schedule, other bids or the client';
  ASSERT NOT (v_dto->'sections'->0 ? 'allocationCents')
     AND NOT (v_dto->'sections'->0 ? 'projectRoomId'),
    'nor may a section carry an allocation or a room id';

  -- ── THE ABSENCES, probe two: no such VALUE, however it is nested ─────────
  -- The fixture's prose and room names deliberately contain none of these
  -- tokens, so a hit here is the DTO and not the vocabulary.
  ASSERT v_dto::text !~* 'clientprice' AND v_dto::text !~* 'allocation'
     AND v_dto::text !~ '"draws"' AND v_dto::text !~ '"bids"',
    format('payload token probe: %s', v_dto::text);
  ASSERT position('900000' in v_dto::text) = 0,
    'the client price must not appear in the payload under any key';
  ASSERT position('360000' in v_dto::text) = 0
     AND position('270000' in v_dto::text) = 0,
    'nor may any draw amount';
  ASSERT position('Wren Ashford' in v_dto::text) = 0
     AND position('rfq-buyer@test.invalid' in v_dto::text) = 0,
    'the client''s identity is the studio''s and the client''s, not a sub''s';
  ASSERT position('Renn Casework' in v_dto::text) = 0,
    'a sub must not learn who else was asked';

  -- The link records that it was used.
  ASSERT (SELECT last_used_at FROM public.trade_rfq_tokens WHERE id = v_token_id) > v_used_before,
    'resolving must stamp last_used_at';
  ASSERT (SELECT last_used_at FROM public.trade_rfq_tokens WHERE id = v_token_id) = now(),
    'and stamp it with the moment of use';
END $$;

-- Every kind of miss answers identically: NULL. A dead link and a link that
-- never existed are indistinguishable from the outside.
SAVEPOINT resolve_misses;
DO $$
DECLARE
  v_renn_token uuid := (SELECT value FROM rfq_ids WHERE key = 'token_renn');
  v_renn text := current_setting('rfq.token_renn');
BEGIN
  ASSERT public.resolve_trade_rfq_link(NULL) IS NULL, 'NULL token';
  ASSERT public.resolve_trade_rfq_link('') IS NULL, 'empty token';
  ASSERT public.resolve_trade_rfq_link('   ') IS NULL, 'blank token';
  ASSERT public.resolve_trade_rfq_link('not-a-token') IS NULL, 'garbage token';
  ASSERT public.resolve_trade_rfq_link(repeat('f', 64)) IS NULL,
    'a well-shaped token that was never minted';
  ASSERT public.resolve_trade_rfq_link(current_setting('rfq.token_stale')) IS NULL,
    'a revoked token';

  -- Expiry, proven on a live link by moving its clock rather than by waiting.
  ASSERT public.resolve_trade_rfq_link(v_renn) IS NOT NULL,
    'fixture: Renn''s link is live, or the expiry assertion proves nothing';
  UPDATE public.trade_rfq_tokens SET expires_at = now() - interval '1 day'
  WHERE id = v_renn_token;
  ASSERT public.resolve_trade_rfq_link(v_renn) IS NULL, 'an expired token';
END $$;
ROLLBACK TO SAVEPOINT resolve_misses;

-- FALSIFY (LINK LIVENESS) — the status and expiry predicates are stripped out of
-- resolve's live body, and both dead links come back to life. Without this the
-- NULLs above could equally have come from a broken hash.
SAVEPOINT resolve_falsify;
DO $$
DECLARE
  v_def text := pg_get_functiondef('public.resolve_trade_rfq_link(text)'::regprocedure);
  v_stripped text;
BEGIN
  v_stripped := replace(v_def, 'AND t.status = ''active''', '');
  ASSERT v_stripped <> v_def,
    'FALSIFY: the active-status predicate must be in the shipped body';
  v_def := v_stripped;
  v_stripped := replace(v_def, 'AND t.expires_at > now()', '');
  ASSERT v_stripped <> v_def,
    'FALSIFY: the expiry predicate must be in the shipped body';
  EXECUTE v_stripped;
END $$;
DO $$
DECLARE
  v_renn_token uuid := (SELECT value FROM rfq_ids WHERE key = 'token_renn');
BEGIN
  ASSERT public.resolve_trade_rfq_link(current_setting('rfq.token_stale')) IS NOT NULL,
    'FALSIFY: without the status predicate a revoked link resolves — that predicate is what kills it';
  UPDATE public.trade_rfq_tokens SET expires_at = now() - interval '1 day'
  WHERE id = v_renn_token;
  ASSERT public.resolve_trade_rfq_link(current_setting('rfq.token_renn')) IS NOT NULL,
    'FALSIFY: and without the expiry predicate an expired link resolves too';
END $$;
ROLLBACK TO SAVEPOINT resolve_falsify;
DO $$
BEGIN
  ASSERT public.resolve_trade_rfq_link(current_setting('rfq.token_stale')) IS NULL,
    'the savepoint rollback must restore the shipped resolve body';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (5) THE ANSWER. A number comes back, becomes a bid the studio can select, and
--     stamps the paperwork it arrived on.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_scope uuid := (SELECT value FROM rfq_ids WHERE key = 'scope');
  v_rfq uuid := (SELECT value FROM rfq_ids WHERE key = 'rfq_hollis');
  v_token_id uuid := (SELECT value FROM rfq_ids WHERE key = 'token_hollis');
  v_raw text := current_setting('rfq.token_hollis');
  v_result jsonb;
  v_bid public.trade_scope_bids%ROWTYPE;
  v_err text;
BEGIN
  -- An anonymous browser does not reach this function. The portal's server
  -- action re-resolves the token and calls in as the service client.
  BEGIN
    PERFORM public.submit_trade_rfq_response(v_raw, 712500, 'Includes shop details.');
    ASSERT false, 'an authenticated caller must not answer an RFQ directly';
  EXCEPTION WHEN insufficient_privilege THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'answering a trade RFQ requires service_role',
    format('submit role refusal: %L', v_err);

  PERFORM pg_temp.assume_user(NULL, 'service_role');

  BEGIN
    PERFORM public.submit_trade_rfq_response(v_raw, -1, NULL);
    ASSERT false, 'a negative number is not a bid';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'a trade RFQ response must carry a whole, non-negative amount in cents',
    format('negative-amount refusal: %L', v_err);

  BEGIN
    PERFORM public.submit_trade_rfq_response('not-a-token', 712500, NULL);
    ASSERT false, 'a garbage token must not reach the ledger';
  EXCEPTION WHEN no_data_found THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'invalid_rfq_link', format('garbage-token refusal: %L', v_err);

  v_result := public.submit_trade_rfq_response(v_raw, 712500, 'Includes shop details.');
  ASSERT (v_result->>'ok')::boolean, 'the answer was recorded';
  ASSERT NOT (v_result->>'replayed')::boolean, 'the first answer is not a replay';
  ASSERT (v_result->>'amountCents')::integer = 712500, 'the number that came back';
  INSERT INTO rfq_ids VALUES ('bid_hollis', (v_result->>'bidId')::uuid);

  SELECT * INTO v_bid FROM public.trade_scope_bids WHERE id = (v_result->>'bidId')::uuid;
  ASSERT v_bid.source = 'party_response',
    'an answered bid is a party response, not something the studio wrote down';
  ASSERT v_bid.status = 'quoted',
    'answering quotes; only the studio selects';
  ASSERT v_bid.party_id = 'd9800000-0000-4000-8000-000000000001'
     AND v_bid.party_display_name = 'Hollis Millwork',
    'the bid names the party the ask went to, snapshotted';
  ASSERT v_bid.note = 'Includes shop details.', 'the note travels';
  ASSERT v_bid.responded_at IS NOT NULL, 'and it records when';

  -- (11) THE PROVENANCE. Both columns 00423 left bare are real FKs now, and the
  -- submit path is what fills them.
  ASSERT v_bid.rfq_request_id = v_rfq,
    'the bid must name the ask it answers';
  ASSERT v_bid.response_token_id = v_token_id,
    'and the link it arrived on';
  ASSERT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.trade_scope_bids'::regclass
      AND conname = 'trade_scope_bids_rfq_request_id_fkey' AND contype = 'f'),
    'rfq_request_id must be a real foreign key, not a bare uuid';
  ASSERT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.trade_scope_bids'::regclass
      AND conname = 'trade_scope_bids_response_token_id_fkey' AND contype = 'f'),
    'and so must response_token_id';

  -- The ask records that it was answered.
  ASSERT (SELECT status FROM public.trade_rfq_requests WHERE id = v_rfq) = 'responded',
    'the ask moves to responded';
  ASSERT (SELECT responded_at FROM public.trade_rfq_requests WHERE id = v_rfq) = now(),
    'and stamps when';

  -- Backdate both stamps by an hour so the next two sections can tell "moved"
  -- from "did not move" — see the note in (4) about the transaction clock.
  UPDATE public.trade_rfq_requests SET responded_at = now() - interval '1 hour'
  WHERE id = v_rfq;
  UPDATE public.trade_scope_bids SET responded_at = now() - interval '1 hour'
  WHERE id = (v_result->>'bidId')::uuid;
  PERFORM set_config('rfq.backdated', (now() - interval '1 hour')::text, true);
END $$;

-- The sub reads their own number back — the one thing about the buying position
-- they ARE entitled to see.
DO $$
DECLARE v_dto jsonb := public.resolve_trade_rfq_link(current_setting('rfq.token_hollis'));
BEGIN
  ASSERT (v_dto->'existingResponse'->>'amountCents')::integer = 712500
     AND v_dto->'existingResponse'->>'note' = 'Includes shop details.'
     AND (v_dto->'existingResponse'->>'respondedAt') IS NOT NULL,
    'the sub must be shown the number they already gave, not an empty form';
  ASSERT (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(v_dto->'existingResponse') k)
         = ARRAY['amountCents','note','respondedAt'],
    'and nothing else about it';
  ASSERT v_dto->'rfq'->>'status' = 'responded',
    'the ask reports itself answered';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (6) THE REPLAY. The same number again — a double-submitted form, a retried
--     request, a back button — moves the BID not at all. It is not, however, a
--     non-event: the sub opened the link and pressed the button, and the ask and
--     the link record that they did. "Idempotent" here means the ledger holds
--     still, not that the paperwork forgets the visit.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_scope uuid := (SELECT value FROM rfq_ids WHERE key = 'scope');
  v_rfq uuid := (SELECT value FROM rfq_ids WHERE key = 'rfq_hollis');
  v_bid uuid := (SELECT value FROM rfq_ids WHERE key = 'bid_hollis');
  v_token_id uuid := (SELECT value FROM rfq_ids WHERE key = 'token_hollis');
  v_backdated timestamptz := current_setting('rfq.backdated')::timestamptz;
  v_result jsonb;
BEGIN
  ASSERT (SELECT responded_at FROM public.trade_scope_bids WHERE id = v_bid) = v_backdated,
    'fixture: the stamps are in the past, or "did not move" is unobservable';
  -- The link's clock too, for the same reason.
  UPDATE public.trade_rfq_tokens SET last_used_at = now() - interval '1 hour'
  WHERE id = v_token_id;

  v_result := public.submit_trade_rfq_response(
    current_setting('rfq.token_hollis'), 712500, 'Includes shop details.');
  ASSERT (v_result->>'replayed')::boolean, 'an identical answer is a replay';
  ASSERT (v_result->>'bidId')::uuid = v_bid, 'and it is the same bid';
  ASSERT (SELECT count(*) FROM public.trade_scope_bids
          WHERE proposal_id = v_scope AND source = 'party_response') = 1,
    'a replay must not open a second row';
  ASSERT (SELECT responded_at FROM public.trade_scope_bids WHERE id = v_bid) = v_backdated,
    'and must not move when the answer arrived';
  ASSERT (SELECT responded_at FROM public.trade_rfq_requests WHERE id = v_rfq) = v_backdated,
    'nor when the ask was answered';
  ASSERT (v_result->>'respondedAt')::timestamptz = v_backdated,
    'the replay reports the moment the answer actually arrived';

  -- ...and what a replay DOES move. last_used_at is the only evidence anywhere
  -- that the sub came back, and it is the column a studio reads before chasing
  -- someone it thinks has gone quiet.
  ASSERT (SELECT last_used_at FROM public.trade_rfq_tokens WHERE id = v_token_id) = now(),
    'a replay must still stamp the link it arrived on';
  ASSERT (SELECT status FROM public.trade_rfq_requests WHERE id = v_rfq) = 'responded',
    'and the ask must still read answered';
END $$;

-- The bookkeeping is UNCONDITIONAL, not a leftover from the first answer. The
-- ask and the link are put back the way they read before the sub ever replied,
-- and the identical number is replayed: the ask comes back to 'responded' and
-- stamps a first-answer time, the link records the visit, and the BID — which
-- really is idempotent — does not move. Rolled back afterwards, because the
-- sections that follow read the real stamps.
SAVEPOINT replay_bookkeeping;
DO $$
DECLARE
  v_rfq uuid := (SELECT value FROM rfq_ids WHERE key = 'rfq_hollis');
  v_bid uuid := (SELECT value FROM rfq_ids WHERE key = 'bid_hollis');
  v_token_id uuid := (SELECT value FROM rfq_ids WHERE key = 'token_hollis');
  v_backdated timestamptz := current_setting('rfq.backdated')::timestamptz;
  v_result jsonb;
BEGIN
  UPDATE public.trade_rfq_requests SET status = 'sent', responded_at = NULL
  WHERE id = v_rfq;
  UPDATE public.trade_rfq_tokens SET last_used_at = NULL WHERE id = v_token_id;

  v_result := public.submit_trade_rfq_response(
    current_setting('rfq.token_hollis'), 712500, 'Includes shop details.');
  ASSERT (v_result->>'replayed')::boolean, 'still a replay: the bid is unchanged';
  ASSERT (SELECT status FROM public.trade_rfq_requests WHERE id = v_rfq) = 'responded',
    'a replay stamps the ask answered even when the ask has forgotten';
  ASSERT (SELECT responded_at FROM public.trade_rfq_requests WHERE id = v_rfq) = now(),
    'and stamps a first-answer time when there is none to keep';
  ASSERT (SELECT last_used_at FROM public.trade_rfq_tokens WHERE id = v_token_id) = now(),
    'and records that the link was used';
  ASSERT (SELECT responded_at FROM public.trade_scope_bids WHERE id = v_bid) = v_backdated
     AND (SELECT amount_cents FROM public.trade_scope_bids WHERE id = v_bid) = 712500,
    'while the bid is untouched — that is the whole of what idempotent means here';
END $$;
ROLLBACK TO SAVEPOINT replay_bookkeeping;
DO $$
BEGIN
  ASSERT (SELECT responded_at FROM public.trade_rfq_requests
          WHERE id = (SELECT value FROM rfq_ids WHERE key = 'rfq_hollis'))
         = current_setting('rfq.backdated')::timestamptz,
    'the savepoint rollback must put the real stamps back';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (7) THE REVISION. A different number is last-write-wins on the SAME row —
--     one party, one answer, whatever they last said.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_scope uuid := (SELECT value FROM rfq_ids WHERE key = 'scope');
  v_rfq uuid := (SELECT value FROM rfq_ids WHERE key = 'rfq_hollis');
  v_bid uuid := (SELECT value FROM rfq_ids WHERE key = 'bid_hollis');
  v_was timestamptz := current_setting('rfq.backdated')::timestamptz;
  v_result jsonb;
BEGIN
  v_result := public.submit_trade_rfq_response(
    current_setting('rfq.token_hollis'), 698000, 'Revised — panels included.');
  ASSERT NOT (v_result->>'replayed')::boolean, 'a different number is not a replay';
  ASSERT (v_result->>'bidId')::uuid = v_bid, 'and it lands on the same row';
  ASSERT (v_result->>'amountCents')::integer = 698000, 'the new number is returned';
  ASSERT (SELECT amount_cents FROM public.trade_scope_bids WHERE id = v_bid) = 698000
     AND (SELECT note FROM public.trade_scope_bids WHERE id = v_bid) = 'Revised — panels included.',
    'the ledger carries what they last said';
  ASSERT (SELECT responded_at FROM public.trade_scope_bids WHERE id = v_bid) > v_was
     AND (SELECT responded_at FROM public.trade_scope_bids WHERE id = v_bid) = now(),
    'and when they last said it';
  ASSERT (SELECT count(*) FROM public.trade_scope_bids
          WHERE proposal_id = v_scope AND source = 'party_response') = 1,
    'still exactly one answer from this party';
  ASSERT (SELECT responded_at FROM public.trade_rfq_requests WHERE id = v_rfq) = v_was,
    'the ASK still records when the sub first came back — a revision is not a first answer';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (8) THE AWARD. Once the studio selects the number, the sub cannot move it.
-- ═══════════════════════════════════════════════════════════════════════════
SELECT pg_temp.assume_user('d9000000-0000-4000-8000-000000000001');
DO $$
DECLARE
  v_bid uuid := (SELECT value FROM rfq_ids WHERE key = 'bid_hollis');
  v_selected jsonb;
BEGIN
  v_selected := public.select_trade_bid(v_bid);
  ASSERT v_selected->>'status' = 'selected'
     AND (v_selected->>'amountCents')::integer = 698000,
    'the studio selects the answered bid';
  ASSERT (SELECT party_display_name FROM public.trade_scope_terms
          WHERE proposal_id = (SELECT value FROM rfq_ids WHERE key = 'scope')) = 'Hollis Millwork',
    'and the party snapshot follows onto the terms';
END $$;

SELECT pg_temp.assume_user(NULL, 'service_role');
DO $$
DECLARE
  v_bid uuid := (SELECT value FROM rfq_ids WHERE key = 'bid_hollis');
  v_err text;
BEGIN
  BEGIN
    PERFORM public.submit_trade_rfq_response(
      current_setting('rfq.token_hollis'), 640000, 'Sharper, if you are still deciding.');
    ASSERT false, 'a selected number must not move under the award';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'bid_locked', format('bid-locked refusal: %L', v_err);
  ASSERT (SELECT amount_cents FROM public.trade_scope_bids WHERE id = v_bid) = 698000,
    'and the ledger still says what was selected';
END $$;

-- FALSIFY (BID LOCK) — the lock is two halves and BOTH have to go before the
-- number moves: the read-side branch, which refuses when the row it locked is
-- already selected, and the write-side guard on the ON CONFLICT, which refuses
-- when a row became selected between that read and the write. Stripping only one
-- leaves the other holding, which is the point of writing it twice.
SAVEPOINT lock_falsify;
DO $$
DECLARE
  v_def text := pg_get_functiondef('public.submit_trade_rfq_response(text,integer,text)'::regprocedure);
  v_stripped text;
BEGIN
  v_stripped := replace(v_def, 'IF v_bid.status = ''selected'' THEN', 'IF false THEN');
  ASSERT v_stripped <> v_def,
    'FALSIFY: the bid-lock branch must be in the shipped body';
  v_def := v_stripped;
  v_stripped := replace(v_def,
    'WHERE trade_scope_bids.status <> ''selected''', 'WHERE true');
  ASSERT v_stripped <> v_def,
    'FALSIFY: the write-side half of the lock — the ON CONFLICT guard — must be in the shipped body too';
  EXECUTE v_stripped;
END $$;
DO $$
DECLARE v_bid uuid := (SELECT value FROM rfq_ids WHERE key = 'bid_hollis');
BEGIN
  PERFORM public.submit_trade_rfq_response(
    current_setting('rfq.token_hollis'), 640000, 'Sharper, if you are still deciding.');
  ASSERT (SELECT amount_cents FROM public.trade_scope_bids WHERE id = v_bid) = 640000,
    'FALSIFY: without the lock the selected number moves under the award — that branch is the only thing holding it';
END $$;
ROLLBACK TO SAVEPOINT lock_falsify;
DO $$
BEGIN
  ASSERT (SELECT amount_cents FROM public.trade_scope_bids
          WHERE id = (SELECT value FROM rfq_ids WHERE key = 'bid_hollis')) = 698000,
    'the savepoint rollback must restore both the body and the ledger';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (9) THE CLIENT SIGNS, AND THE ASKING STOPS. Execution revokes every live link
--     for the scope and closes every open ask — and a sub who arrives afterward
--     is told the truth rather than that their link is broken.
-- ═══════════════════════════════════════════════════════════════════════════
SELECT pg_temp.assume_user('d9000000-0000-4000-8000-000000000001');
DO $$
DECLARE
  v_scope uuid := (SELECT value FROM rfq_ids WHERE key = 'scope');
BEGIN
  INSERT INTO public.trade_scope_draws (
    proposal_id, label, percentage, amount_cents, sort_order, gates_on_acceptance
  ) VALUES
    (v_scope, 'Deposit', 40, 360000, 0, false),
    (v_scope, 'Rough-in', 30, 270000, 1, false),
    (v_scope, 'Acceptance', 30, 270000, 2, true);

  -- Fixture, stated rather than assumed: two live links and two open asks are
  -- about to meet a signature.
  ASSERT (SELECT count(*) FROM public.trade_rfq_tokens
          WHERE proposal_id = v_scope AND status = 'active') = 2,
    'fixture: two live links, or the revocation below proves nothing';
  ASSERT (SELECT count(*) FROM public.trade_rfq_requests
          WHERE proposal_id = v_scope AND status <> 'closed') = 2,
    'fixture: two open asks';

  PERFORM public.send_commercial_document(
    v_scope, public._commercial_document_fingerprint(v_scope),
    NULL, now() + interval '30 days');
END $$;

-- Sending does NOT close the asking: the studio is still buying right up until
-- the client signs, which is exactly when a late number is worth having.
DO $$
DECLARE v_scope uuid := (SELECT value FROM rfq_ids WHERE key = 'scope');
BEGIN
  ASSERT (SELECT count(*) FROM public.trade_rfq_tokens
          WHERE proposal_id = v_scope AND status = 'active') = 2,
    'a sent scope is still out for bid';
  ASSERT public.resolve_trade_rfq_link(current_setting('rfq.token_renn')) IS NOT NULL,
    'and its links still resolve';
END $$;

SELECT pg_temp.assume_user('d9000000-0000-4000-8000-000000000002');
DO $$
DECLARE
  v_scope uuid := (SELECT value FROM rfq_ids WHERE key = 'scope');
  v_exec jsonb;
BEGIN
  v_exec := public.execute_trade_scope(v_scope, 'Wren Ashford');
  ASSERT (v_exec->>'newlyExecuted')::boolean, 'the client signs';

  -- THE DELTA.
  ASSERT (SELECT count(*) FROM public.trade_rfq_tokens
          WHERE proposal_id = v_scope AND status = 'active') = 0,
    'execution must revoke every live link for the scope';
  ASSERT (SELECT count(*) FROM public.trade_rfq_requests
          WHERE proposal_id = v_scope AND status = 'closed') = 2,
    'and close every open ask';
  ASSERT (SELECT bool_and(closed_at IS NOT NULL) FROM public.trade_rfq_requests
          WHERE proposal_id = v_scope),
    'a closed ask records when it closed';
END $$;

SELECT pg_temp.assume_user(NULL, 'service_role');
DO $$
DECLARE v_err text;
BEGIN
  -- The read path is simply dead.
  ASSERT public.resolve_trade_rfq_link(current_setting('rfq.token_renn')) IS NULL,
    'a link revoked by the award must not resolve';

  -- The write path says WHY. This is the ordering PART 7 argues for: the window
  -- is checked before the link's liveness, so the sub who opens the email an
  -- hour late is told the work was awarded rather than that their link is
  -- broken. Reorder those two checks and this assertion reads invalid_rfq_link.
  BEGIN
    PERFORM public.submit_trade_rfq_response(current_setting('rfq.token_renn'), 660000, NULL);
    ASSERT false, 'no number may be answered into a signed document';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'bid_window_closed', format('closed-window refusal: %L', v_err);

  -- ...and the same for the party whose number WAS selected.
  BEGIN
    PERFORM public.submit_trade_rfq_response(current_setting('rfq.token_hollis'), 600000, NULL);
    ASSERT false, 'not even the awarded sub may move their number afterwards';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'bid_window_closed', format('closed-window refusal (awarded): %L', v_err);
END $$;

-- Preparing a new ask against a signed scope is refused at the other end too.
SELECT pg_temp.assume_user('d9000000-0000-4000-8000-000000000001');
DO $$
DECLARE
  v_scope uuid := (SELECT value FROM rfq_ids WHERE key = 'scope');
  v_err text;
BEGIN
  BEGIN
    PERFORM public.prepare_trade_rfq(
      v_scope, 'd9800000-0000-4000-8000-000000000002', 'One more look?', NULL);
    ASSERT false, 'an executed scope is not out for bid';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'a trade scope may only be put out for bid while it is a draft or out for signature',
    format('prepare window refusal: %L', v_err);
END $$;

-- And a closed ask cannot be re-linked.
SELECT pg_temp.assume_user('d9000000-0000-4000-8000-000000000001', 'service_role');
DO $$
DECLARE
  v_rfq uuid := (SELECT value FROM rfq_ids WHERE key = 'rfq_renn');
  v_id uuid; v_raw text; v_err text;
BEGIN
  BEGIN
    SELECT m.id, m.token INTO v_id, v_raw FROM public.mint_trade_rfq_token(v_rfq) m;
    ASSERT false, 'a closed ask must not mint a fresh link';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = format('trade RFQ %s is closed and cannot be re-linked', v_rfq),
    format('closed-relink refusal: %L', v_err);
END $$;

-- FALSIFY (THE CLOSED WINDOW) — post-signature, FIVE independent things refuse a
-- late number, and this block found them by having to strip each in turn before
-- the leak would come out: the window gate reads the scope's commercial_state;
-- the same gate reads the ask's closed status (the execution delta wrote it);
-- the execution delta also revoked the link, so the liveness gate refuses; the
-- ask is no longer 'sent' or 'responded'; and the awarded bid is selected, so
-- both halves of the bid lock refuse. Neutering any four of them still leaves
-- one holding, which is the point. With all of them gone the leak arrives: a sub
-- reprices work the client has signed and paid a deposit on.
SAVEPOINT window_falsify;
DO $$
DECLARE
  v_def text := pg_get_functiondef('public.submit_trade_rfq_response(text,integer,text)'::regprocedure);
  v_stripped text;
BEGIN
  v_stripped := replace(v_def,
    'IF v_proposal.commercial_state NOT IN (''draft'', ''sent'')', 'IF false');
  ASSERT v_stripped <> v_def, 'FALSIFY: the window gate must be in the shipped body';
  v_def := v_stripped;
  v_stripped := replace(v_def, 'OR v_request.status = ''closed''', '');
  ASSERT v_stripped <> v_def,
    'FALSIFY: the closed-ask half of the window gate must be in the shipped body';
  v_def := v_stripped;
  v_stripped := replace(v_def,
    'IF v_token.status <> ''active'' OR v_token.expires_at <= now() THEN', 'IF false THEN');
  ASSERT v_stripped <> v_def, 'FALSIFY: the token-liveness gate must be in the shipped body';
  v_def := v_stripped;
  v_stripped := replace(v_def,
    'IF v_request.status NOT IN (''sent'', ''responded'') THEN', 'IF false THEN');
  ASSERT v_stripped <> v_def, 'FALSIFY: the ask-status gate must be in the shipped body';
  v_def := v_stripped;
  v_stripped := replace(v_def, 'IF v_bid.status = ''selected'' THEN', 'IF false THEN');
  ASSERT v_stripped <> v_def, 'FALSIFY: the bid lock must be in the shipped body';
  v_def := v_stripped;
  v_stripped := replace(v_def,
    'WHERE trade_scope_bids.status <> ''selected''', 'WHERE true');
  ASSERT v_stripped <> v_def,
    'FALSIFY: and so must the write-side half of that lock';
  EXECUTE v_stripped;
END $$;
DO $$
DECLARE v_result jsonb;
BEGIN
  v_result := public.submit_trade_rfq_response(current_setting('rfq.token_hollis'), 600000, NULL);
  ASSERT (v_result->>'amountCents')::integer = 600000,
    'FALSIFY: with the window and liveness gates gone, a sub reprices a signed document — those gates are what hold it shut';
END $$;
ROLLBACK TO SAVEPOINT window_falsify;
DO $$
DECLARE v_err text;
BEGIN
  BEGIN
    PERFORM public.submit_trade_rfq_response(current_setting('rfq.token_hollis'), 600000, NULL);
    ASSERT false, 'the savepoint rollback must restore the shipped submit body';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'bid_window_closed', format('post-rollback refusal: %L', v_err);
  ASSERT (SELECT amount_cents FROM public.trade_scope_bids
          WHERE id = (SELECT value FROM rfq_ids WHERE key = 'bid_hollis')) = 698000,
    'and the ledger';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (10) THE TABLE EDGE, AND WHOSE PARTY MAY BE ASKED.
--
--      Both new tables are design-studio-only and say so themselves rather than
--      leaning on public.proposals to say it for them — the tightened posture
--      00423 applied to the four trade tables. So the section removes the
--      incidental cover (a permissive proposals policy) and asks the RFQ
--      policies directly, from a client seat and from a stranger's.
-- ═══════════════════════════════════════════════════════════════════════════
SELECT pg_temp.assume_user('d9000000-0000-4000-8000-000000000001');
DO $$
DECLARE v_scope uuid := (SELECT value FROM rfq_ids WHERE key = 'scope');
BEGIN
  PERFORM set_config('rfq.scope', v_scope::text, true);
  PERFORM set_config('rfq.n_requests',
    (SELECT count(*) FROM public.trade_rfq_requests WHERE proposal_id = v_scope)::text, true);
  PERFORM set_config('rfq.n_tokens',
    (SELECT count(*) FROM public.trade_rfq_tokens WHERE proposal_id = v_scope)::text, true);
  ASSERT current_setting('rfq.n_requests')::int > 0
     AND current_setting('rfq.n_tokens')::int > 0,
    'fixture: there are rows to be refused, or the zeroes below prove nothing';
END $$;

SAVEPOINT open_proposals_read;
CREATE POLICY trade_rfq_test_open_proposals ON public.proposals
  FOR SELECT TO authenticated USING (true);

-- The client. They signed the document; they still have no business in the
-- studio's buying record.
SELECT pg_temp.assume_user('d9000000-0000-4000-8000-000000000002');
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_scope uuid := current_setting('rfq.scope')::uuid;
BEGIN
  ASSERT (SELECT count(*) FROM public.proposals WHERE id = v_scope) = 1,
    'the permissive proposals policy must really be in force, or the zeroes below prove nothing';
  ASSERT (SELECT count(*) FROM public.trade_rfq_requests WHERE proposal_id = v_scope) = 0,
    'the client must read zero asks';
  ASSERT (SELECT count(*) FROM public.trade_rfq_tokens WHERE proposal_id = v_scope) = 0,
    'and zero link rows';
END $$;
RESET ROLE;

-- A stranger with no relationship to anything.
SELECT pg_temp.assume_user('d9000000-0000-4000-8000-000000000003');
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_scope uuid := current_setting('rfq.scope')::uuid;
BEGIN
  ASSERT (SELECT count(*) FROM public.trade_rfq_requests WHERE proposal_id = v_scope) = 0,
    'an outsider must read zero asks';
  ASSERT (SELECT count(*) FROM public.trade_rfq_tokens WHERE proposal_id = v_scope) = 0,
    'and zero link rows';
  ASSERT (SELECT count(*) FROM public.trade_rfq_requests) = 0
     AND (SELECT count(*) FROM public.trade_rfq_tokens) = 0,
    'nor anything on any other scope';
END $$;
RESET ROLE;

-- ...and the owning studio still reads its own, under the same open policy, so
-- the zeroes above are the RFQ predicate and not a broken fixture.
SELECT pg_temp.assume_user('d9000000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_scope uuid := current_setting('rfq.scope')::uuid;
BEGIN
  ASSERT (SELECT count(*) FROM public.trade_rfq_requests WHERE proposal_id = v_scope)
         = current_setting('rfq.n_requests')::int,
    'the owning studio still reads its own asks';
  ASSERT (SELECT count(*) FROM public.trade_rfq_tokens WHERE proposal_id = v_scope)
         = current_setting('rfq.n_tokens')::int,
    'and its own link rows';
END $$;

-- ...and what the owning studio may DO with them, which is READ and nothing
-- else. RLS says whose rows these are; the ACL says which verbs a logged-in
-- session may use directly, and the answer is SELECT. Every write on this rail
-- has an opinion attached to it — the freeze, the revoke-then-mint, the close —
-- and a table-level UPDATE grant would let a member hand-write past all three.
-- token_hash is not readable at all: it is sha256 of a live credential, a
-- studio member has no use for it, and a `select('*')` that quietly returned it
-- is exactly the shape of accident this grant exists to make loud.
DO $$
DECLARE
  v_scope uuid := current_setting('rfq.scope')::uuid;
  v_code text;
  v_n integer;
BEGIN
  BEGIN
    UPDATE public.trade_rfq_requests SET message = 'rewritten by hand'
    WHERE proposal_id = v_scope;
    ASSERT false, 'a studio member must not write the ask table directly';
  EXCEPTION WHEN insufficient_privilege THEN v_code := SQLSTATE;
  END;
  ASSERT v_code = '42501', format('ask-table UPDATE refusal: %L', v_code);

  v_code := NULL;
  BEGIN
    INSERT INTO public.trade_rfq_requests (proposal_id, party_id)
    VALUES (v_scope, 'd9800000-0000-4000-8000-000000000001');
    ASSERT false, 'nor open one by hand';
  EXCEPTION WHEN insufficient_privilege THEN v_code := SQLSTATE;
  END;
  ASSERT v_code = '42501', format('ask-table INSERT refusal: %L', v_code);

  v_code := NULL;
  BEGIN
    UPDATE public.trade_rfq_tokens SET status = 'active' WHERE proposal_id = v_scope;
    ASSERT false, 'nor un-revoke a dead link';
  EXCEPTION WHEN insufficient_privilege THEN v_code := SQLSTATE;
  END;
  ASSERT v_code = '42501', format('token-table UPDATE refusal: %L', v_code);

  -- The credential column, by name and by star.
  v_code := NULL;
  BEGIN
    EXECUTE 'SELECT token_hash FROM public.trade_rfq_tokens LIMIT 1';
    ASSERT false, 'token_hash must not be readable by a logged-in session';
  EXCEPTION WHEN insufficient_privilege THEN v_code := SQLSTATE;
  END;
  ASSERT v_code = '42501', format('token_hash SELECT refusal: %L', v_code);

  v_code := NULL;
  BEGIN
    EXECUTE 'SELECT * FROM public.trade_rfq_tokens LIMIT 1';
    ASSERT false, 'and select(*) must fail loudly rather than hand it over';
  EXCEPTION WHEN insufficient_privilege THEN v_code := SQLSTATE;
  END;
  ASSERT v_code = '42501', format('token select-star refusal: %L', v_code);

  -- The granted columns still read, or the refusals above are just a broken
  -- table. This is the shape the designer portal's own token-free reads take.
  SELECT count(*) INTO v_n FROM (
    SELECT id, rfq_request_id, proposal_id, party_id, status, expires_at,
           last_used_at, created_at
    FROM public.trade_rfq_tokens WHERE proposal_id = v_scope
  ) t;
  ASSERT v_n = current_setting('rfq.n_tokens')::int,
    'the granted columns must still read under the studio policy';

  -- And the portal's actual query on the ask table — select('*') — still works,
  -- because SELECT is granted there in full.
  SELECT count(*) INTO v_n FROM (
    SELECT * FROM public.trade_rfq_requests WHERE proposal_id = v_scope
  ) r;
  ASSERT v_n = current_setting('rfq.n_requests')::int,
    'useTradeRfqs reads the ask table with select(*) — SELECT-only must not break it';
END $$;
RESET ROLE;

-- And anon, which on a stack that still auto-grants at creation would otherwise
-- be holding a table-level grant on a live credential's shadow, with RLS as the
-- only thing between an anonymous key and it.
SET LOCAL ROLE anon;
DO $$
DECLARE v_code text;
BEGIN
  BEGIN
    EXECUTE 'SELECT count(*) FROM public.trade_rfq_requests';
    ASSERT false, 'anon must not reach the ask table at all';
  EXCEPTION WHEN insufficient_privilege THEN v_code := SQLSTATE;
  END;
  ASSERT v_code = '42501', format('anon ask-table refusal: %L', v_code);

  v_code := NULL;
  BEGIN
    EXECUTE 'SELECT count(*) FROM public.trade_rfq_tokens';
    ASSERT false, 'nor the link table';
  EXCEPTION WHEN insufficient_privilege THEN v_code := SQLSTATE;
  END;
  ASSERT v_code = '42501', format('anon token-table refusal: %L', v_code);
END $$;
RESET ROLE;
ROLLBACK TO SAVEPOINT open_proposals_read;
SELECT pg_temp.assume_user('d9000000-0000-4000-8000-000000000001');

-- A party from another project is not this scope's to ask. Proven against the
-- STILL-DRAFT scope, so the refusal is the party rule and not the window.
DO $$
DECLARE
  v_scope2 uuid := (SELECT value FROM rfq_ids WHERE key = 'scope2');
  v_project uuid := (SELECT value FROM rfq_ids WHERE key = 'project');
  v_err text;
BEGIN
  ASSERT (SELECT commercial_state FROM public.proposals WHERE id = v_scope2) = 'draft',
    'fixture: the second scope is still a draft, or the refusal below is the window';
  BEGIN
    PERFORM public.prepare_trade_rfq(
      v_scope2, 'd9800000-0000-4000-8000-000000000009', 'Interested?', NULL);
    ASSERT false, 'a party from another project must not be asked';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = format('party %s does not belong to project %s',
                        'd9800000-0000-4000-8000-000000000009', v_project),
    format('cross-project refusal: %L', v_err);
  ASSERT (SELECT count(*) FROM public.trade_rfq_requests WHERE proposal_id = v_scope2) = 0,
    'and nothing is left behind';

  -- The same party against its OWN project's scope is fine — the refusal is
  -- about the pairing, not about that party.
  PERFORM public.prepare_trade_rfq(
    v_scope2, 'd9800000-0000-4000-8000-000000000001', 'Stair and rail?', NULL);
  ASSERT (SELECT count(*) FROM public.trade_rfq_requests WHERE proposal_id = v_scope2) = 1,
    'a party of this project may be asked';
END $$;

-- A stranger cannot prepare an ask on someone else's scope at all.
SELECT pg_temp.assume_user('d9000000-0000-4000-8000-000000000003');
DO $$
DECLARE
  v_scope2 uuid := (SELECT value FROM rfq_ids WHERE key = 'scope2');
  v_err text;
BEGIN
  BEGIN
    PERFORM public.prepare_trade_rfq(
      v_scope2, 'd9800000-0000-4000-8000-000000000002', 'Hello', NULL);
    ASSERT false, 'a stranger must not put another studio''s scope out for bid';
  EXCEPTION WHEN insufficient_privilege THEN v_err := SQLERRM;
  END;
  ASSERT v_err = format('trade scope %s not found or access denied', v_scope2),
    format('stranger prepare refusal: %L', v_err);
END $$;
SELECT pg_temp.assume_user('d9000000-0000-4000-8000-000000000001');

-- ═══════════════════════════════════════════════════════════════════════════
-- (12) THE DRAFT ASK'S LINK. One rule seen from both ends: a question that is
--      still being written has not been asked, and a question that HAS been
--      handed over must not be rewritten underneath whoever is holding it.
--
--      mint_trade_rfq_token refuses only a CLOSED ask, so a partial send — the
--      link cut, the status stamp lost to a failure between two writes — leaves
--      a draft ask with a live link behind. That shape is the subject here.
-- ═══════════════════════════════════════════════════════════════════════════
SELECT pg_temp.assume_user('d9000000-0000-4000-8000-000000000001', 'service_role');
DO $$
DECLARE
  v_scope2 uuid := (SELECT value FROM rfq_ids WHERE key = 'scope2');
  v_rfq uuid;
  v_id uuid; v_raw text; v_err text;
BEGIN
  SELECT id INTO v_rfq FROM public.trade_rfq_requests
  WHERE proposal_id = v_scope2
    AND party_id = 'd9800000-0000-4000-8000-000000000001';
  ASSERT v_rfq IS NOT NULL, 'fixture: the second scope has an ask';
  ASSERT (SELECT status FROM public.trade_rfq_requests WHERE id = v_rfq) = 'draft',
    'fixture: and it is still a draft, or nothing below is about drafts';
  INSERT INTO rfq_ids VALUES ('rfq_scope2', v_rfq);

  SELECT m.id, m.token INTO v_id, v_raw FROM public.mint_trade_rfq_token(v_rfq) m;
  PERFORM set_config('rfq.token_scope2', v_raw, true);
  INSERT INTO rfq_ids VALUES ('token_scope2', v_id);
  ASSERT (SELECT status FROM public.trade_rfq_tokens WHERE id = v_id) = 'active',
    'fixture: the link is live, or the refusals below are about a dead one';

  -- The read path is dead...
  ASSERT public.resolve_trade_rfq_link(v_raw) IS NULL,
    'a link whose ask is still a draft must not resolve';
  -- ...and so is the write path, for the same reason. submit answers an ask that
  -- is 'sent' or 'responded' and nothing else; before this the two disagreed,
  -- and resolve would show a sub a question the studio had not finished asking.
  BEGIN
    PERFORM public.submit_trade_rfq_response(v_raw, 500000, NULL);
    ASSERT false, 'nor may a draft ask be answered';
  EXCEPTION WHEN no_data_found THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'invalid_rfq_link', format('draft-ask submit refusal: %L', v_err);
END $$;

-- The freeze, from the other end. The link is in the party's hands; the studio
-- may not re-snapshot the ask under them.
SELECT pg_temp.assume_user('d9000000-0000-4000-8000-000000000001');
DO $$
DECLARE
  v_scope2 uuid := (SELECT value FROM rfq_ids WHERE key = 'scope2');
  v_rfq uuid := (SELECT value FROM rfq_ids WHERE key = 'rfq_scope2');
  v_hash_before text := (SELECT scope_snapshot_hash FROM public.trade_rfq_requests
                         WHERE id = (SELECT value FROM rfq_ids WHERE key = 'rfq_scope2'));
  v_err text;
BEGIN
  -- The sections move, the way a draft scope's sections do.
  INSERT INTO public.trade_scope_sections (proposal_id, room_name, prose, sort_order)
  VALUES (v_scope2, 'Stair hall', 'White oak treads on a painted stringer.', 0);

  BEGIN
    PERFORM public.prepare_trade_rfq(
      v_scope2, 'd9800000-0000-4000-8000-000000000001', 'Different words now.', NULL);
    ASSERT false, 'a question already in the party''s hands must not be rewritten under them';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'the request is already in the party''s hands — revoke its link before revising',
    format('live-link revise refusal: %L', v_err);
  ASSERT (SELECT scope_snapshot_hash FROM public.trade_rfq_requests WHERE id = v_rfq)
         = v_hash_before
     AND (SELECT message FROM public.trade_rfq_requests WHERE id = v_rfq) = 'Stair and rail?',
    'and nothing about the ask moved';

  -- REVOKE, THEN REVISE — which is the instruction the refusal gives, so it had
  -- better be one the rail actually accepts.
  UPDATE public.trade_rfq_tokens SET status = 'revoked'
  WHERE id = (SELECT value FROM rfq_ids WHERE key = 'token_scope2');
  PERFORM public.prepare_trade_rfq(
    v_scope2, 'd9800000-0000-4000-8000-000000000001', 'Different words now.', NULL);
  ASSERT (SELECT scope_snapshot_hash FROM public.trade_rfq_requests WHERE id = v_rfq)
         <> v_hash_before
     AND (SELECT message FROM public.trade_rfq_requests WHERE id = v_rfq) = 'Different words now.',
    'with the link revoked the ask revises normally';
  PERFORM set_config('rfq.hash_scope2',
    (SELECT scope_snapshot_hash FROM public.trade_rfq_requests WHERE id = v_rfq), true);
END $$;

-- An EXPIRED link is not in anyone's hands either — the qualifier in the check
-- is load-bearing, so it gets its own probe.
SELECT pg_temp.assume_user('d9000000-0000-4000-8000-000000000001', 'service_role');
DO $$
DECLARE
  v_rfq uuid := (SELECT value FROM rfq_ids WHERE key = 'rfq_scope2');
  v_id uuid; v_raw text;
BEGIN
  SELECT m.id, m.token INTO v_id, v_raw FROM public.mint_trade_rfq_token(v_rfq) m;
  UPDATE public.trade_rfq_tokens SET expires_at = now() - interval '1 day' WHERE id = v_id;
END $$;
SELECT pg_temp.assume_user('d9000000-0000-4000-8000-000000000001');
DO $$
DECLARE
  v_scope2 uuid := (SELECT value FROM rfq_ids WHERE key = 'scope2');
  v_rfq uuid := (SELECT value FROM rfq_ids WHERE key = 'rfq_scope2');
BEGIN
  PERFORM public.prepare_trade_rfq(
    v_scope2, 'd9800000-0000-4000-8000-000000000001', 'Revised again.', NULL);
  ASSERT (SELECT message FROM public.trade_rfq_requests WHERE id = v_rfq) = 'Revised again.',
    'an expired link does not hold the question shut';
END $$;

-- FALSIFY (THE LIVE-LINK FREEZE) — the check is neutered in prepare's live body
-- and the frozen question moves while a live credential points at it. The link
-- and the words it was cut against are supposed to stay bound together; without
-- this predicate they come apart silently.
SELECT pg_temp.assume_user('d9000000-0000-4000-8000-000000000001', 'service_role');
DO $$
DECLARE
  v_rfq uuid := (SELECT value FROM rfq_ids WHERE key = 'rfq_scope2');
  v_id uuid; v_raw text;
BEGIN
  SELECT m.id, m.token INTO v_id, v_raw FROM public.mint_trade_rfq_token(v_rfq) m;
  INSERT INTO rfq_ids VALUES ('token_scope2_live', v_id);
  PERFORM set_config('rfq.token_scope2_live', v_raw, true);
END $$;
SELECT pg_temp.assume_user('d9000000-0000-4000-8000-000000000001');
SAVEPOINT freeze_falsify;
DO $$
DECLARE
  v_def text := pg_get_functiondef('public.prepare_trade_rfq(uuid,uuid,text,text)'::regprocedure);
  v_stripped text;
BEGIN
  v_stripped := replace(v_def, 'WHERE t.rfq_request_id = v_request.id', 'WHERE false');
  ASSERT v_stripped <> v_def,
    'FALSIFY: the live-link check must actually be in the shipped body';
  EXECUTE v_stripped;
END $$;
DO $$
DECLARE
  v_scope2 uuid := (SELECT value FROM rfq_ids WHERE key = 'scope2');
  v_rfq uuid := (SELECT value FROM rfq_ids WHERE key = 'rfq_scope2');
  v_was text := current_setting('rfq.hash_scope2');
BEGIN
  ASSERT (SELECT status FROM public.trade_rfq_tokens
          WHERE id = (SELECT value FROM rfq_ids WHERE key = 'token_scope2_live')) = 'active',
    'FALSIFY fixture: the link is live';
  UPDATE public.trade_scope_sections
  SET prose = 'White oak treads, painted stringer, and a wrought rail.'
  WHERE proposal_id = v_scope2 AND room_name = 'Stair hall';
  PERFORM public.prepare_trade_rfq(
    v_scope2, 'd9800000-0000-4000-8000-000000000001', 'Rewritten under them.', NULL);
  ASSERT (SELECT scope_snapshot_hash FROM public.trade_rfq_requests WHERE id = v_rfq) <> v_was,
    'FALSIFY: without the check the question moves while the party holds a live link to it — that check is the only thing binding them';
END $$;
ROLLBACK TO SAVEPOINT freeze_falsify;
DO $$
DECLARE v_err text;
BEGIN
  BEGIN
    PERFORM public.prepare_trade_rfq(
      (SELECT value FROM rfq_ids WHERE key = 'scope2'),
      'd9800000-0000-4000-8000-000000000001', 'Rewritten under them.', NULL);
    ASSERT false, 'the savepoint rollback must restore the shipped prepare body';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'the request is already in the party''s hands — revoke its link before revising',
    format('post-rollback refusal: %L', v_err);
END $$;

-- Stamp the ask sent (the dispatcher's act, as in section 2), so the link is a
-- real one for the sections that follow — and so the NULL at the top of this
-- section is proven to have been about the DRAFT status and not about the link.
UPDATE public.trade_rfq_requests SET status = 'sent', sent_at = now()
WHERE id = (SELECT value FROM rfq_ids WHERE key = 'rfq_scope2');
DO $$
BEGIN
  ASSERT public.resolve_trade_rfq_link(current_setting('rfq.token_scope2_live')) IS NOT NULL,
    'the same link resolves once the ask is sent — so the earlier NULL was the draft, not the link';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (13) THE LOCK ORDER. submit_trade_rfq_response and the two seams that retire
--      a scope touch the same three tables, and they are the two things that
--      genuinely race: the client presses Sign while a sub presses Send. Both
--      must take proposals BEFORE trade_rfq_tokens and trade_rfq_requests, or
--      Postgres resolves the ABBA by killing one of them with a 40P01 at
--      signature time.
--
--      A true two-session deadlock cannot be staged here: this suite is one
--      uncommitted transaction, so a second session cannot even see the
--      fixture. What is pinned instead is the ORDER ITSELF, read off the LIVE
--      bodies — which is the property the deadlock is a consequence of, and the
--      thing a future edit would break. The falsification below shows what a
--      functional suite cannot: with the scope lock removed, every other
--      assertion in this file still passes.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_submit text := pg_get_functiondef('public.submit_trade_rfq_response(text,integer,text)'::regprocedure);
  v_exec text := pg_get_functiondef('public._execute_trade_scope_authorized(uuid,text,uuid,text)'::regprocedure);
  v_void text := pg_get_functiondef('public.void_trade_scope(uuid,text)'::regprocedure);
  v_close text := pg_get_functiondef('public._close_trade_rfqs_for_scope(uuid)'::regprocedure);
  v_scope_lock integer;
  v_token_lock integer;
  v_ask_lock integer;
BEGIN
  v_scope_lock := position('WHERE id = v_proposal_id FOR SHARE' in v_submit);
  v_token_lock := position('WHERE t.token_hash = v_hash FOR UPDATE' in v_submit);
  v_ask_lock := position('WHERE id = v_token.rfq_request_id FOR UPDATE' in v_submit);
  ASSERT v_scope_lock > 0,
    'submit must lock the scope — without it there is no shared order to keep';
  ASSERT v_token_lock > 0 AND v_ask_lock > 0,
    'submit must lock the link and the ask it is writing against';
  ASSERT v_scope_lock < v_token_lock,
    'submit must lock the scope BEFORE the link (execution takes them in that order)';
  ASSERT v_token_lock < v_ask_lock,
    'and the link before the ask';

  -- The other side of the pair. Both retiring seams lock the proposal first and
  -- reach the RFQ tables only through the helper.
  ASSERT position('WHERE id = p_proposal_id FOR UPDATE' in v_exec) > 0
     AND position('_close_trade_rfqs_for_scope' in v_exec) > 0
     AND position('WHERE id = p_proposal_id FOR UPDATE' in v_exec)
         < position('_close_trade_rfqs_for_scope' in v_exec),
    'execution must hold the scope before it closes the asking';
  ASSERT position('WHERE id = p_proposal_id FOR UPDATE' in v_void) > 0
     AND position('_close_trade_rfqs_for_scope' in v_void) > 0
     AND position('WHERE id = p_proposal_id FOR UPDATE' in v_void)
         < position('_close_trade_rfqs_for_scope' in v_void),
    'and so must voiding';

  -- The helper never reaches back for the scope: its callers already hold it.
  -- A helper that re-locked the proposal would reopen the cycle from the far
  -- side of the same fix.
  ASSERT position('public.proposals' in v_close) = 0,
    'the close helper must not touch public.proposals';

  -- The sweep lives in ONE place, which is the other half of the void fix: the
  -- execution delta and the void delta are now the same call, and they were two
  -- divergent copies — one of them missing — before.
  ASSERT (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public'
            AND p.prosrc LIKE '%trade_rfq_tokens SET status = ''revoked''%'
            AND p.prosrc LIKE '%WHERE proposal_id = p_proposal_id AND status = ''active''%') = 1,
    'the scope-wide revoke must exist exactly once in the schema — in the helper';
  ASSERT (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public'
            AND p.prosrc LIKE '%_close_trade_rfqs_for_scope(p_proposal_id)%') = 2,
    'and exactly two callers reach it: execution and void';
END $$;

-- FALSIFY (THE SCOPE LOCK) — ` FOR SHARE` is stripped from submit's live body,
-- which is precisely the pre-fix hazard: the function reads the proposal without
-- locking it and then locks the token, so a signature running beside it takes
-- the same two rows in the opposite order. The leak this exposes is not a wrong
-- answer — it is that NOTHING ELSE NOTICES. The reverted function answers a live
-- ask perfectly, which is why a lock-order bug survives a green suite and shows
-- up as a 40P01 in front of a client instead.
SELECT pg_temp.assume_user(NULL, 'service_role');
SAVEPOINT scope_lock_falsify;
DO $$
DECLARE
  v_def text := pg_get_functiondef('public.submit_trade_rfq_response(text,integer,text)'::regprocedure);
  v_stripped text;
BEGIN
  v_stripped := replace(v_def, ' FOR SHARE;', ';');
  ASSERT v_stripped <> v_def,
    'FALSIFY: the scope lock must actually be in the shipped body';
  EXECUTE v_stripped;
END $$;
DO $$
DECLARE
  v_def text := pg_get_functiondef('public.submit_trade_rfq_response(text,integer,text)'::regprocedure);
  v_result jsonb;
BEGIN
  ASSERT position('WHERE id = v_proposal_id FOR SHARE' in v_def) = 0,
    'FALSIFY: the reverted body must no longer lock the scope';
  v_result := public.submit_trade_rfq_response(
    current_setting('rfq.token_scope2_live'), 415000, 'Stair package.');
  ASSERT (v_result->>'ok')::boolean AND (v_result->>'amountCents')::integer = 415000,
    'FALSIFY: and it still answers perfectly — which is exactly why only the structural check above can see the bug';
END $$;
ROLLBACK TO SAVEPOINT scope_lock_falsify;
DO $$
DECLARE
  v_def text := pg_get_functiondef('public.submit_trade_rfq_response(text,integer,text)'::regprocedure);
BEGIN
  ASSERT position('WHERE id = v_proposal_id FOR SHARE' in v_def) > 0,
    'the savepoint rollback must restore the shipped submit body';
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.trade_scope_bids
    WHERE proposal_id = (SELECT value FROM rfq_ids WHERE key = 'scope2')),
    'and the bid the reverted body wrote';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (14) VOIDING CLOSES THE ASKING TOO. A scope stops being out for bid in two
--      ways, and the studio retiring the document is the one that is easy to
--      forget: a void leaves commercial_state 'superseded', and a link that
--      still resolved afterwards would invite a sub to spend an evening pricing
--      work that no longer exists — and then let them answer into it.
-- ═══════════════════════════════════════════════════════════════════════════
SELECT pg_temp.assume_user('d9000000-0000-4000-8000-000000000001');
DO $$
DECLARE v_scope2 uuid := (SELECT value FROM rfq_ids WHERE key = 'scope2');
BEGIN
  ASSERT (SELECT commercial_state FROM public.proposals WHERE id = v_scope2) = 'draft',
    'fixture: the second scope is still voidable';
  ASSERT (SELECT count(*) FROM public.trade_rfq_tokens
          WHERE proposal_id = v_scope2 AND status = 'active') = 1,
    'fixture: one live link, or the revocation below proves nothing';
  ASSERT (SELECT count(*) FROM public.trade_rfq_requests
          WHERE proposal_id = v_scope2 AND status <> 'closed') = 1,
    'fixture: one open ask';
  ASSERT public.resolve_trade_rfq_link(current_setting('rfq.token_scope2_live')) IS NOT NULL,
    'fixture: and it resolves';
END $$;

-- FALSIFY (THE VOID SWEEP) — the helper call is removed from void's live body,
-- and the voided document keeps a live link into itself: it resolves, and a sub
-- answers a number into paperwork the studio has retired.
SAVEPOINT void_falsify;
DO $$
DECLARE
  v_def text := pg_get_functiondef('public.void_trade_scope(uuid,text)'::regprocedure);
  v_stripped text;
BEGIN
  v_stripped := replace(v_def,
    'PERFORM public._close_trade_rfqs_for_scope(p_proposal_id);', 'NULL;');
  ASSERT v_stripped <> v_def,
    'FALSIFY: the sweep must actually be in the shipped void body';
  EXECUTE v_stripped;
END $$;
DO $$
DECLARE
  v_scope2 uuid := (SELECT value FROM rfq_ids WHERE key = 'scope2');
BEGIN
  PERFORM public.void_trade_scope(v_scope2, 'Client pulled the stair package.');
  ASSERT (SELECT commercial_state FROM public.proposals WHERE id = v_scope2) = 'superseded',
    'FALSIFY fixture: the void itself still happened';
  ASSERT (SELECT count(*) FROM public.trade_rfq_tokens
          WHERE proposal_id = v_scope2 AND status = 'active') = 1,
    'FALSIFY: without the sweep a retired document keeps a live link';
  ASSERT public.resolve_trade_rfq_link(current_setting('rfq.token_scope2_live')) IS NOT NULL,
    'FALSIFY: and that link still shows a sub work the studio has cancelled';
END $$;
ROLLBACK TO SAVEPOINT void_falsify;

-- The shipped body.
DO $$
DECLARE
  v_scope2 uuid := (SELECT value FROM rfq_ids WHERE key = 'scope2');
  v_voided jsonb;
BEGIN
  ASSERT (SELECT commercial_state FROM public.proposals WHERE id = v_scope2) = 'draft',
    'the savepoint rollback must un-void the scope as well as restore the body';
  v_voided := public.void_trade_scope(v_scope2, 'Client pulled the stair package.');
  ASSERT v_voided->>'commercialState' = 'superseded', 'the studio retires the scope';

  ASSERT (SELECT count(*) FROM public.trade_rfq_tokens
          WHERE proposal_id = v_scope2 AND status = 'active') = 0,
    'voiding must revoke every live link for the scope';
  ASSERT (SELECT count(*) FROM public.trade_rfq_requests
          WHERE proposal_id = v_scope2 AND status <> 'closed') = 0,
    'and close every open ask';
  ASSERT (SELECT bool_and(closed_at IS NOT NULL) FROM public.trade_rfq_requests
          WHERE proposal_id = v_scope2),
    'a closed ask records when it closed';
END $$;

SELECT pg_temp.assume_user(NULL, 'service_role');
DO $$
DECLARE v_err text;
BEGIN
  -- The raw token resolves to nothing at all.
  ASSERT public.resolve_trade_rfq_link(current_setting('rfq.token_scope2_live')) IS NULL,
    'a link into a voided scope must resolve NULL';

  -- And the write path says why, the same way the awarded one does.
  BEGIN
    PERFORM public.submit_trade_rfq_response(
      current_setting('rfq.token_scope2_live'), 415000, 'Stair package.');
    ASSERT false, 'no number may be answered into a retired document';
  EXCEPTION WHEN check_violation THEN v_err := SQLERRM;
  END;
  ASSERT v_err = 'bid_window_closed', format('voided-scope refusal: %L', v_err);

  ASSERT NOT EXISTS (
    SELECT 1 FROM public.trade_scope_bids
    WHERE proposal_id = (SELECT value FROM rfq_ids WHERE key = 'scope2')),
    'and nothing landed on the retired scope';
END $$;
SELECT pg_temp.assume_user('d9000000-0000-4000-8000-000000000001');

SELECT 'trade_rfq_test: PASS' AS result;

ROLLBACK;
