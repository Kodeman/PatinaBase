-- ═══════════════════════════════════════════════════════════════════════════
-- 00579 — The subcontract: Trade Agreements, signed by the sub on a token
--         link with no login.
-- Runner: plain psql, ON_ERROR_STOP=1. Single transaction, ROLLBACK at the end.
-- Run:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f supabase/tests/commercial/trade_agreement_test.sql
--
-- What this file exists to prove (build sheet §5, SQL-A1 … SQL-A9):
--   A1  The happy path: create -> send -> mint -> resolve -> sign, and the
--       token is revoked in the SAME transaction as the signature.
--   A2  A replay is idempotent, not an error: the original receipt, the
--       original signed_at, no second row, no moved fingerprint.
--   A3  Dead links are indistinguishable: garbage, an unknown hash, an expired
--       token, a draft agreement, a voided one and a link superseded by a
--       re-mint all resolve to nothing, with no error and no leak. The single
--       exception is the token a signature spent, which comes back read-only
--       as the settled receipt the sub reloads into (M2, §4.5, walk 16).
--   A4  RLS — a sub token reads only its own agreement, and anon and a foreign
--       authenticated user read ZERO rows from all three tables directly.
--   A5  The sub cannot see the bid ledger or the client's money: the DTO's key
--       set is frozen both ways, and no forbidden key appears at any depth.
--   A6  Signature immutability: UPDATE and DELETE both raise.
--   A7  Content freeze at send: an UPDATE of scope or price raises on a sent
--       agreement and succeeds on a draft.
--   A8  void refuses a signed agreement, succeeds on a sent one, and revokes
--       its tokens.
--   A9  THE PRIME'S SIGNATURE TABLE IS UNTOUCHED — party_role's CHECK and the
--       UNIQUE (proposal_id, party_role) index are byte-identical to their
--       pre-wave definitions.
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

CREATE OR REPLACE FUNCTION pg_temp.assume_service()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('role', 'service_role')::text, true);
  EXECUTE 'SET LOCAL ROLE service_role';
END;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.assume_service() TO PUBLIC;

CREATE OR REPLACE FUNCTION pg_temp.reset_role()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE 'RESET ROLE';
END;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.reset_role() TO PUBLIC;

-- The DTO's frozen key set (build sheet §4.5). An added key fails A5 in one
-- direction; a removed one fails it in the other.
CREATE TEMP TABLE _ta_dto_keys (key text PRIMARY KEY) ON COMMIT DROP;
INSERT INTO _ta_dto_keys VALUES
  ('studioName'), ('agreementTitle'), ('contactDisplayName'), ('scope'),
  ('priceCents'), ('currency'), ('schedule'), ('retainageBps'),
  ('payWhenPaidDays'), ('insuranceCertificateRequired'),
  ('lienWaiverPolicy'), ('state'), ('existingSignature');

-- What must never appear, at any depth, under any key.
CREATE TEMP TABLE _ta_forbidden (needle text PRIMARY KEY) ON COMMIT DROP;
INSERT INTO _ta_forbidden VALUES
  ('clientPriceCents'), ('gmp'), ('gmpCents'), ('scheduleOfValues'),
  ('projectName'), ('bids'), ('sovLineIds'), ('flowDownClauseKey'),
  ('contactEmail'), ('projectId'), ('studioId'), ('sourceProposalId');

-- ═══════════════════════════════════════════════════════════════════════════
-- (0) FIXTURE — one studio, its owner, a client, a project, two trades.
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
) VALUES
  ('a9000000-0000-4000-8000-000000000001', 'ta-lead@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a9000000-0000-4000-8000-000000000004', 'ta-client@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a9000000-0000-4000-8000-000000000009', 'ta-outsider@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

SET LOCAL session_replication_role = replica;
INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES
  ('a9000000-0000-4000-8000-000000000001', 'ta-lead@test.invalid', 'Trade Lead', true, now(), now()),
  ('a9000000-0000-4000-8000-000000000004', 'ta-client@test.invalid', 'Halvorsen Household', false, now(), now()),
  ('a9000000-0000-4000-8000-000000000009', 'ta-outsider@test.invalid', 'Trade Outsider', true, now(), now())
ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, full_name = EXCLUDED.full_name;
SET LOCAL session_replication_role = origin;

INSERT INTO public.organizations (id, type, name, slug, status)
VALUES
  ('a9100000-0000-4000-8000-000000000001', 'design_studio', 'Middle West Studio',
   'trade-agreement-test-a', 'active'),
  ('a9100000-0000-4000-8000-000000000002', 'design_studio', 'Another Studio',
   'trade-agreement-test-b', 'active');

SELECT pg_temp.assume_user('a9000000-0000-4000-8000-000000000001', 'service_role');
INSERT INTO public.organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES
  ('a9110000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000001',
   'a9100000-0000-4000-8000-000000000001', 'owner', 'active', now() - interval '2 days'),
  ('a9110000-0000-4000-8000-000000000002', 'a9000000-0000-4000-8000-000000000009',
   'a9100000-0000-4000-8000-000000000002', 'owner', 'active', now() - interval '2 days');

INSERT INTO public.user_roles (user_id, role_id, granted_by)
SELECT designer.id, role.id, designer.id
FROM (VALUES
  ('a9000000-0000-4000-8000-000000000001'::uuid),
  ('a9000000-0000-4000-8000-000000000009'::uuid)
) AS designer(id)
CROSS JOIN public.roles AS role WHERE role.name = 'studio_owner';

INSERT INTO public.designer_clients (id, designer_id, client_id, client_name, status, source)
VALUES ('a9200000-0000-4000-8000-000000000001',
        'a9000000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000004',
        'Halvorsen Household', 'proposal', 'active');

-- The project is named after the people who live in it, deliberately: A5 must
-- prove that name never reaches the sub.
INSERT INTO public.projects (
  id, designer_id, client_id, studio_id, name, status, start_date, created_by
) VALUES (
  'a9400000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000001',
  'a9000000-0000-4000-8000-000000000004', 'a9100000-0000-4000-8000-000000000001',
  'Halvorsen kitchen and mudroom', 'active', current_date,
  'a9000000-0000-4000-8000-000000000001');

INSERT INTO public.studio_contacts (
  id, organization_id, entity_kind, contact_kind, full_name, company_name, email,
  created_by
) VALUES
  ('a9500000-0000-4000-8000-000000000001', 'a9100000-0000-4000-8000-000000000001',
   'company', 'trade', 'Ingrid Halloran', 'Halloran Cabinetry',
   'ingrid@halloran.invalid', 'a9000000-0000-4000-8000-000000000001'),
  ('a9500000-0000-4000-8000-000000000002', 'a9100000-0000-4000-8000-000000000001',
   'company', 'trade', 'Bo Lindqvist', 'Lindqvist Electric',
   'bo@lindqvist.invalid', 'a9000000-0000-4000-8000-000000000001');

INSERT INTO public.studio_license_attestations (
  studio_id, credential_type, credential_number, state, expires_on, attested_by
) VALUES (
  'a9100000-0000-4000-8000-000000000001', 'WI Dwelling Contractor', '1234567',
  'WI', DATE '2029-03-31', 'a9000000-0000-4000-8000-000000000001');

CREATE OR REPLACE FUNCTION pg_temp.payload(
  p_title text, p_scope text, p_price integer)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object(
    'title', p_title,
    'scope', p_scope,
    'priceCents', p_price,
    'currency', 'USD',
    'trade', 'Cabinetry',
    'schedule', jsonb_build_object(
      'startOn', '2028-07-06', 'durationDays', 21,
      'sequencing', 'After rough-in inspection.'),
    'retainageBps', 500,
    'payWhenPaidDays', 7,
    'insuranceCertificateRequired', true,
    'lienWaiverPolicy', 'conditional_then_unconditional',
    'sovLineIds', jsonb_build_array('cabinetry'));
$$;
GRANT EXECUTE ON FUNCTION pg_temp.payload(text, text, integer) TO PUBLIC;

-- ═══════════════════════════════════════════════════════════════════════════
-- (A1) THE HAPPY PATH — create, send, mint, resolve, sign.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TEMP TABLE _ta_state (label text PRIMARY KEY, value text NOT NULL)
  ON COMMIT DROP;

DO $$
DECLARE
  v_a uuid;
  v_b uuid;
  v_sent jsonb;
  v_token text;
  v_token_b text;
  v_dto jsonb;
  v_result jsonb;
  v_fingerprint text;
BEGIN
  PERFORM pg_temp.assume_role('a9000000-0000-4000-8000-000000000001');
  v_a := public.create_trade_agreement(
    'a9400000-0000-4000-8000-000000000001',
    'a9500000-0000-4000-8000-000000000001',
    pg_temp.payload('Cabinetry & millwork',
                    'Fabricate and install the kitchen and mudroom cabinetry.',
                    3800000));
  v_b := public.create_trade_agreement(
    'a9400000-0000-4000-8000-000000000001',
    'a9500000-0000-4000-8000-000000000002',
    pg_temp.payload('Electrical',
                    'Rough-in and finish electrical for the kitchen.', 950000));
  PERFORM pg_temp.reset_role();

  INSERT INTO _ta_state VALUES ('agreement_a', v_a::text), ('agreement_b', v_b::text);

  ASSERT (SELECT state FROM public.studio_trade_agreements WHERE id = v_a) = 'draft',
    'A1: a new Trade Agreement is a draft';
  ASSERT (SELECT contact_display_name FROM public.studio_trade_agreements WHERE id = v_a)
         = 'Ingrid Halloran',
    'A1: the trade''s name is snapshotted, not joined';
  ASSERT (SELECT flow_down_clause_key FROM public.studio_trade_agreements WHERE id = v_a)
         IS NULL,
    'A1 (R16): the flow-down clause ships disabled and the key stays NULL';

  -- The ACL layer, before the trigger layer: a studio member reads this table
  -- and writes nothing on it directly. Every write is a definer seam with an
  -- opinion (00424's posture, transposed).
  PERFORM pg_temp.assume_role('a9000000-0000-4000-8000-000000000001');
  BEGIN
    UPDATE public.studio_trade_agreements SET scope = scope || ' Revised.'
    WHERE id = v_a;
    RAISE EXCEPTION 'A1: a studio member must not write this table directly';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  PERFORM pg_temp.reset_role();

  PERFORM pg_temp.assume_role('a9000000-0000-4000-8000-000000000001');
  v_sent := public.send_trade_agreement(v_a);
  PERFORM public.send_trade_agreement(v_b);
  PERFORM pg_temp.reset_role();
  ASSERT v_sent->>'state' = 'sent', format('A1: send stamps the state: %s', v_sent);
  ASSERT v_sent->>'contactEmail' = 'ingrid@halloran.invalid',
    'A1: the edge function is handed the recipient it must email';

  -- The token is minted by service_role and nobody else.
  PERFORM pg_temp.assume_role('a9000000-0000-4000-8000-000000000001');
  BEGIN
    PERFORM public.mint_trade_agreement_token(v_a);
    RAISE EXCEPTION 'A1: a studio member must not mint a link';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  PERFORM pg_temp.reset_role();

  PERFORM pg_temp.assume_service();
  SELECT token INTO v_token FROM public.mint_trade_agreement_token(v_a);
  SELECT token INTO v_token_b FROM public.mint_trade_agreement_token(v_b);
  PERFORM pg_temp.reset_role();
  INSERT INTO _ta_state VALUES ('token_a', v_token), ('token_b', v_token_b);

  ASSERT v_token ~ '^[0-9a-f]{64}$', 'A1: the raw token is 64 hex characters';
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.studio_trade_agreement_tokens
    WHERE token_hash = v_token
  ), 'A1: ONLY the hash is stored — the raw token must not be findable';
  ASSERT EXISTS (
    SELECT 1 FROM public.studio_trade_agreement_tokens
    WHERE token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex')
      AND agreement_id = v_a AND status = 'active'
  ), 'A1: the stored form is sha256 of the raw token';

  -- Resolve, and check the DTO against the frozen key list, both ways.
  PERFORM pg_temp.assume_service();
  v_dto := public.resolve_trade_agreement_link(v_token);
  PERFORM pg_temp.reset_role();
  ASSERT v_dto IS NOT NULL, 'A1: a live link resolves';
  ASSERT v_dto->>'agreementTitle' = 'Cabinetry & millwork',
    'A1: the DTO names the agreement';
  ASSERT (v_dto->>'priceCents')::bigint = 3800000,
    'A1: THEIR price, and it is the only price in the DTO';
  ASSERT v_dto->>'state' = 'sent', 'A1: the DTO reports the state';
  ASSERT v_dto->'existingSignature' IS NULL
         OR jsonb_typeof(v_dto->'existingSignature') = 'null',
    'A1: nothing is signed yet';
  ASSERT (SELECT last_used_at FROM public.studio_trade_agreement_tokens
          WHERE agreement_id = v_a AND status = 'active') IS NOT NULL,
    'A1: resolving bumps last_used_at';

  v_fingerprint := public._trade_agreement_fingerprint(v_a);

  PERFORM pg_temp.assume_service();
  v_result := public.sign_trade_agreement_by_token(
    v_token, 'Ingrid Halloran', '198.51.100.4');
  PERFORM pg_temp.reset_role();
  ASSERT v_result->>'outcome' = 'saved',
    format('A1: the sub signs with no login: %s', v_result);
  ASSERT (SELECT state FROM public.studio_trade_agreements WHERE id = v_a) = 'signed',
    'A1: the agreement reaches signed';
  ASSERT (SELECT count(*) FROM public.studio_trade_agreement_signatures
          WHERE agreement_id = v_a AND party = 'sub') = 1,
    'A1: exactly one sub signature';
  ASSERT (SELECT signer_user_id FROM public.studio_trade_agreement_signatures
          WHERE agreement_id = v_a AND party = 'sub') IS NULL,
    'A1: the sub has no account, so the row carries no user id';
  ASSERT (SELECT evidence_fingerprint FROM public.studio_trade_agreement_signatures
          WHERE agreement_id = v_a AND party = 'sub') = v_fingerprint,
    'A1: the fingerprint is computed over the agreement as it stood, inside the transaction';

  -- RC-1: revoked in the SAME transaction as the signature, not in a follow-up
  -- statement a crash could skip.
  ASSERT (SELECT status FROM public.studio_trade_agreement_tokens
          WHERE agreement_id = v_a) = 'revoked',
    'A1: a signed agreement''s link is spent, in the same transaction';
  -- M2: and the row remembers that its own signature is what spent it, which
  -- is the whole difference between a receipt and a dead link.
  ASSERT (SELECT spent_at FROM public.studio_trade_agreement_tokens
          WHERE agreement_id = v_a) IS NOT NULL,
    'A1: the spending signature stamps spent_at, in that same transaction';

  RAISE NOTICE 'PASS A1: create, send, mint, resolve, sign — and the link is spent';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (A2) A REPLAY IS IDEMPOTENT, NOT AN ERROR.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_a uuid := (SELECT value::uuid FROM _ta_state WHERE label = 'agreement_a');
  v_token text := (SELECT value FROM _ta_state WHERE label = 'token_a');
  v_first timestamptz;
  v_fingerprint text;
  v_result jsonb;
BEGIN
  SELECT signed_at, evidence_fingerprint INTO v_first, v_fingerprint
  FROM public.studio_trade_agreement_signatures
  WHERE agreement_id = v_a AND party = 'sub';

  PERFORM pg_temp.assume_service();
  v_result := public.sign_trade_agreement_by_token(
    v_token, 'Someone Else Entirely', '198.51.100.9');
  PERFORM pg_temp.reset_role();

  ASSERT v_result->>'outcome' = 'already_signed',
    format('A2: a replay returns the receipt, never an error: %s', v_result);
  ASSERT v_result->>'signedName' = 'Ingrid Halloran',
    'A2: the ORIGINAL name comes back, not the replayed one';
  ASSERT (v_result->>'signedAt')::timestamptz = v_first,
    'A2: signed_at does not move';
  ASSERT (SELECT count(*) FROM public.studio_trade_agreement_signatures
          WHERE agreement_id = v_a) = 1,
    'A2: no second signature row';
  ASSERT (SELECT evidence_fingerprint FROM public.studio_trade_agreement_signatures
          WHERE agreement_id = v_a AND party = 'sub') = v_fingerprint,
    'A2: the fingerprint is unchanged';

  RAISE NOTICE 'PASS A2: signing twice is the same receipt, not a second act';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (A3) DEAD LINKS ARE INDISTINGUISHABLE — six misses, six NULLs.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_b uuid := (SELECT value::uuid FROM _ta_state WHERE label = 'agreement_b');
  v_token_b text := (SELECT value FROM _ta_state WHERE label = 'token_b');
  v_token_a text := (SELECT value FROM _ta_state WHERE label = 'token_a');
  v_draft uuid;
  v_draft_token text;
  v_receipt jsonb;
  v_c uuid;
  v_old_token text;
  v_new_token text;
BEGIN
  PERFORM pg_temp.assume_role('a9000000-0000-4000-8000-000000000001');
  v_draft := public.create_trade_agreement(
    'a9400000-0000-4000-8000-000000000001',
    'a9500000-0000-4000-8000-000000000002',
    pg_temp.payload('A draft', 'Never sent.', 100000));
  PERFORM pg_temp.reset_role();

  PERFORM pg_temp.assume_service();
  -- (1) garbage
  ASSERT public.resolve_trade_agreement_link('not a token') IS NULL, 'A3(1): garbage';
  -- (2) a valid-format hash nobody minted
  ASSERT public.resolve_trade_agreement_link(repeat('a', 64)) IS NULL,
    'A3(2): a well-formed unknown token';
  -- (3) M2 — THE ONE REVOKED TOKEN THAT IS NOT A DEAD LINK. Agreement A's
  -- token was spent by its own signature, and the sub who just signed reloads
  -- their page: they get the settled receipt, not a 404. Nothing new crosses —
  -- the same thirteen keys, the same price, and state now reads 'signed'.
  v_receipt := public.resolve_trade_agreement_link(v_token_a);
  ASSERT v_receipt IS NOT NULL,
    'A3(3): a token spent by its OWN signature still resolves — the settled receipt (§4.5, walk 16)';
  ASSERT v_receipt->>'state' = 'signed',
    format('A3(3): and it resolves as signed: %s', v_receipt->>'state');
  ASSERT v_receipt->'existingSignature'->>'signedName' = 'Ingrid Halloran',
    'A3(3): carrying the signature that spent it';
  ASSERT NOT (v_receipt ? 'clientPriceCents') AND NOT (v_receipt ? 'projectName'),
    'A3(3): and still nothing of the client';
  -- (4) an expired token
  UPDATE public.studio_trade_agreement_tokens
  SET expires_at = now() - interval '1 day' WHERE agreement_id = v_b;
  ASSERT public.resolve_trade_agreement_link(v_token_b) IS NULL, 'A3(4): expired';
  UPDATE public.studio_trade_agreement_tokens
  SET expires_at = now() + interval '30 days' WHERE agreement_id = v_b;
  -- (5) a token on a DRAFT agreement — the portal cannot make one, the RPC can
  BEGIN
    SELECT token INTO v_draft_token
    FROM public.mint_trade_agreement_token(v_draft);
    RAISE EXCEPTION 'A3(5): a draft agreement must not be linkable at all';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
  -- (6) a token on a VOID agreement
  PERFORM pg_temp.reset_role();
  PERFORM pg_temp.assume_role('a9000000-0000-4000-8000-000000000001');
  PERFORM public.void_trade_agreement(v_b, 'Re-scoped.');
  PERFORM pg_temp.reset_role();
  PERFORM pg_temp.assume_service();
  ASSERT public.resolve_trade_agreement_link(v_token_b) IS NULL,
    'A3(6): a voided agreement''s link is dead';
  PERFORM pg_temp.reset_role();

  -- (7) M2's other half — RC-1 still holds for every revocation that is
  -- somebody else's decision. A re-mint supersedes the live link on a SENT
  -- agreement; the superseded one carries no spent_at and is dead, even though
  -- its agreement is perfectly alive and its successor resolves.
  PERFORM pg_temp.assume_role('a9000000-0000-4000-8000-000000000001');
  v_c := public.create_trade_agreement(
    'a9400000-0000-4000-8000-000000000001',
    'a9500000-0000-4000-8000-000000000002',
    pg_temp.payload('Re-minted', 'The link is replaced before anyone signs.',
                    250000));
  PERFORM public.send_trade_agreement(v_c);
  PERFORM pg_temp.reset_role();
  PERFORM pg_temp.assume_service();
  SELECT token INTO v_old_token FROM public.mint_trade_agreement_token(v_c);
  SELECT token INTO v_new_token FROM public.mint_trade_agreement_token(v_c);
  ASSERT public.resolve_trade_agreement_link(v_old_token) IS NULL,
    'A3(7): a link superseded by a re-mint is dead — an administrative revoke is not a receipt';
  ASSERT public.resolve_trade_agreement_link(v_new_token) IS NOT NULL,
    'A3(7): while the link that replaced it resolves';
  PERFORM pg_temp.reset_role();

  RAISE NOTICE 'PASS A3: seven kinds of link, and only the one a signature spent comes back';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (A5) THE SUB CANNOT SEE THE BID LEDGER OR THE CLIENT'S MONEY.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_c uuid;
  v_token text;
  v_dto jsonb;
  v_extra text[];
  v_missing text[];
  v_needle text;
BEGIN
  PERFORM pg_temp.assume_role('a9000000-0000-4000-8000-000000000001');
  v_c := public.create_trade_agreement(
    'a9400000-0000-4000-8000-000000000001',
    'a9500000-0000-4000-8000-000000000002',
    pg_temp.payload('Electrical, again',
                    'Rough-in and finish electrical.', 950000));
  PERFORM public.send_trade_agreement(v_c);
  PERFORM pg_temp.reset_role();

  PERFORM pg_temp.assume_service();
  SELECT token INTO v_token FROM public.mint_trade_agreement_token(v_c);
  v_dto := public.resolve_trade_agreement_link(v_token);
  PERFORM pg_temp.reset_role();

  -- The key set, frozen BOTH WAYS: an added key fails, a removed key fails.
  SELECT array_agg(k ORDER BY k) INTO v_extra
  FROM (SELECT jsonb_object_keys(v_dto) AS k
        EXCEPT SELECT key FROM _ta_dto_keys) AS s;
  ASSERT v_extra IS NULL,
    format('A5: the resolve DTO grew a key the sub must not have: %s', v_extra);

  SELECT array_agg(k ORDER BY k) INTO v_missing
  FROM (SELECT key AS k FROM _ta_dto_keys
        EXCEPT SELECT jsonb_object_keys(v_dto)) AS s;
  ASSERT v_missing IS NULL,
    format('A5: the resolve DTO lost a key the page renders: %s', v_missing);

  -- And nothing forbidden appears at ANY depth, under any key.
  FOR v_needle IN SELECT needle FROM _ta_forbidden LOOP
    ASSERT position(v_needle IN v_dto::text) = 0,
      format('A5: %L must never appear in the sub''s DTO', v_needle);
  END LOOP;

  -- Named explicitly, because these are the two that would be innocent-looking
  -- keys carrying the client's identity and the studio's comparison.
  ASSERT position('Halvorsen' IN v_dto::text) = 0,
    'A5: the project is named after the people who live in it — that name must not reach the sub';
  ASSERT position('Middle West Studio' IN v_dto::text) > 0,
    'A5: the sub is told who they are working FOR, and only that';

  RAISE NOTICE 'PASS A5: the DTO is frozen both ways, and carries no client, no project, no bid';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (A4) RLS — a sub token reads only its own agreement, and direct reads are
--      closed to anon and to a foreign authenticated user.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_a uuid := (SELECT value::uuid FROM _ta_state WHERE label = 'agreement_a');
  v_d uuid;
  v_token_d text;
  v_dto jsonb;
  v_seen integer;
BEGIN
  -- Two live agreements on the SAME project. Resolving D's token must answer
  -- for D and know nothing of A.
  PERFORM pg_temp.assume_role('a9000000-0000-4000-8000-000000000001');
  v_d := public.create_trade_agreement(
    'a9400000-0000-4000-8000-000000000001',
    'a9500000-0000-4000-8000-000000000002',
    pg_temp.payload('Tile setting', 'Set the kitchen and mudroom tile.', 470000));
  PERFORM public.send_trade_agreement(v_d);
  PERFORM pg_temp.reset_role();

  PERFORM pg_temp.assume_service();
  SELECT token INTO v_token_d FROM public.mint_trade_agreement_token(v_d);
  v_dto := public.resolve_trade_agreement_link(v_token_d);
  PERFORM pg_temp.reset_role();

  ASSERT v_dto->>'agreementTitle' = 'Tile setting',
    'A4: the token answers for its own agreement';
  ASSERT (v_dto->>'priceCents')::bigint = 470000,
    'A4: and for its own price';
  ASSERT position('3800000' IN v_dto::text) = 0,
    'A4: the OTHER trade''s price must not appear anywhere in this answer';
  ASSERT position('Cabinetry & millwork' IN v_dto::text) = 0,
    'A4: nor the other trade''s agreement';
  ASSERT position('Ingrid' IN v_dto::text) = 0,
    'A4: nor the other trade''s name';

  -- anon reads zero rows from all three tables.
  PERFORM set_config('request.jwt.claims', '', true);
  EXECUTE 'SET LOCAL ROLE anon';
  BEGIN
    SELECT count(*) INTO v_seen FROM public.studio_trade_agreements;
  EXCEPTION WHEN insufficient_privilege THEN
    v_seen := 0;
  END;
  ASSERT v_seen = 0, format('A4: anon reads no Trade Agreement, got %s', v_seen);
  BEGIN
    SELECT count(*) INTO v_seen FROM public.studio_trade_agreement_signatures;
  EXCEPTION WHEN insufficient_privilege THEN
    v_seen := 0;
  END;
  ASSERT v_seen = 0, format('A4: anon reads no signature, got %s', v_seen);
  BEGIN
    SELECT count(*) INTO v_seen FROM public.studio_trade_agreement_tokens;
  EXCEPTION WHEN insufficient_privilege THEN
    v_seen := 0;
  END;
  ASSERT v_seen = 0, format('A4: anon reads no token, got %s', v_seen);
  PERFORM pg_temp.reset_role();

  -- A foreign authenticated user — an owner of ANOTHER studio — reads zero.
  PERFORM pg_temp.assume_role('a9000000-0000-4000-8000-000000000009');
  SELECT count(*) INTO v_seen FROM public.studio_trade_agreements;
  ASSERT v_seen = 0,
    format('A4: another studio''s owner reads no Trade Agreement of ours, got %s', v_seen);
  SELECT count(*) INTO v_seen FROM public.studio_trade_agreement_signatures;
  ASSERT v_seen = 0, format('A4: nor any signature, got %s', v_seen);
  BEGIN
    SELECT count(*) INTO v_seen FROM public.studio_trade_agreement_tokens;
  EXCEPTION WHEN insufficient_privilege THEN
    v_seen := 0;
  END;
  ASSERT v_seen = 0, format('A4: nor any token, got %s', v_seen);
  PERFORM pg_temp.reset_role();

  -- And the studio itself DOES read its own.
  PERFORM pg_temp.assume_role('a9000000-0000-4000-8000-000000000001');
  SELECT count(*) INTO v_seen FROM public.studio_trade_agreements;
  ASSERT v_seen >= 4,
    format('A4: the studio reads its own Trade Agreements, got %s', v_seen);
  -- but not the token table, ever
  BEGIN
    SELECT count(*) INTO v_seen FROM public.studio_trade_agreement_tokens;
  EXCEPTION WHEN insufficient_privilege THEN
    v_seen := -1;
  END;
  ASSERT v_seen <= 0,
    format('A4: not even the studio reaches the credential table, got %s', v_seen);
  PERFORM pg_temp.reset_role();

  RAISE NOTICE 'PASS A4: one token, one agreement — and the tables are closed to everyone else';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (A6) (A7) (A8) IMMUTABILITY, THE CONTENT FREEZE, AND VOID.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_a uuid := (SELECT value::uuid FROM _ta_state WHERE label = 'agreement_a');
  v_e uuid;
  v_token text;
  v_err text;
  v_result jsonb;
BEGIN
  -- (A6) the signature is append-only, at the trigger level, for everyone.
  BEGIN
    UPDATE public.studio_trade_agreement_signatures
    SET signed_name = 'Not Ingrid' WHERE agreement_id = v_a;
    v_err := 'no refusal';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
  END;
  ASSERT v_err = 'a trade agreement signature is a record of an act and cannot be changed',
    format('A6 (UPDATE): %L', v_err);

  BEGIN
    DELETE FROM public.studio_trade_agreement_signatures WHERE agreement_id = v_a;
    v_err := 'no refusal';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
  END;
  ASSERT v_err = 'a trade agreement signature is a record of an act and cannot be changed',
    format('A6 (DELETE): %L', v_err);

  -- (A7) the content freeze at send. Driven as the OWNER, because the trigger
  -- is the layer under test here: the grant layer already refuses a studio
  -- member outright (asserted in A1), and the definer seams arrive as postgres.
  PERFORM pg_temp.assume_role('a9000000-0000-4000-8000-000000000001');
  v_e := public.create_trade_agreement(
    'a9400000-0000-4000-8000-000000000001',
    'a9500000-0000-4000-8000-000000000001',
    pg_temp.payload('Millwork extras', 'Two extra cabinet runs.', 220000));
  PERFORM pg_temp.reset_role();
  UPDATE public.studio_trade_agreements SET price_cents = 230000 WHERE id = v_e;
  PERFORM pg_temp.assume_role('a9000000-0000-4000-8000-000000000001');
  PERFORM public.send_trade_agreement(v_e);
  PERFORM pg_temp.reset_role();
  ASSERT (SELECT price_cents FROM public.studio_trade_agreements WHERE id = v_e) = 230000,
    'A7: a draft''s price moves freely';

  BEGIN
    UPDATE public.studio_trade_agreements SET price_cents = 999999 WHERE id = v_e;
    v_err := 'no refusal';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
  END;
  ASSERT v_err = 'this trade agreement has been sent, so its terms are fixed',
    format('A7 (price): %L', v_err);

  BEGIN
    UPDATE public.studio_trade_agreements SET scope = 'Something else' WHERE id = v_e;
    v_err := 'no refusal';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
  END;
  ASSERT v_err = 'this trade agreement has been sent, so its terms are fixed',
    format('A7 (scope): %L', v_err);

  -- (A8) void refuses a signed agreement, and takes the link with it on a sent one.
  PERFORM pg_temp.assume_role('a9000000-0000-4000-8000-000000000001');
  BEGIN
    PERFORM public.void_trade_agreement(v_a, 'Changed our minds');
    v_err := 'no refusal';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
  END;
  PERFORM pg_temp.reset_role();
  ASSERT v_err = 'a signed trade agreement is replaced by a new one, never withdrawn',
    format('A8 (signed): %L', v_err);

  PERFORM pg_temp.assume_service();
  SELECT token INTO v_token FROM public.mint_trade_agreement_token(v_e);
  PERFORM pg_temp.reset_role();
  ASSERT (SELECT count(*) FROM public.studio_trade_agreement_tokens
          WHERE agreement_id = v_e AND status = 'active') = 1,
    'A8: one live link before the void';

  PERFORM pg_temp.assume_role('a9000000-0000-4000-8000-000000000001');
  v_result := public.void_trade_agreement(v_e, 'Re-scoped.');
  PERFORM pg_temp.reset_role();
  ASSERT v_result->>'state' = 'void', format('A8: a sent agreement voids: %s', v_result);
  ASSERT (SELECT count(*) FROM public.studio_trade_agreement_tokens
          WHERE agreement_id = v_e AND status = 'active') = 0,
    'A8: the void takes every live link with it';

  PERFORM pg_temp.assume_service();
  v_result := public.sign_trade_agreement_by_token(v_token, 'Ingrid Halloran', NULL);
  PERFORM pg_temp.reset_role();
  ASSERT v_result->>'outcome' = 'agreement_void',
    format('A8: signing a withdrawn agreement says so, in its own sentence: %s', v_result);

  RAISE NOTICE 'PASS A6/A7/A8: append-only signatures, frozen terms, and a void that spends its links';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (A9) THE PRIME'S SIGNATURE TABLE IS UNTOUCHED.
--      No wave reopens commercial_document_signatures' two-party constraint,
--      and this is the assertion that would notice if one did.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE v_def text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_def FROM pg_constraint
  WHERE conrelid = 'public.commercial_document_signatures'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%party_role%';
  ASSERT v_def IS NOT NULL, 'A9: the party_role CHECK must still exist';
  ASSERT v_def LIKE '%client%' AND v_def LIKE '%studio%',
    format('A9: party_role admits client and studio: %s', v_def);
  ASSERT v_def NOT LIKE '%sub%',
    format('A9: THE SUB IS NOT A PARTY TO THE PRIME. %s', v_def);

  ASSERT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'commercial_document_signatures'
      AND indexdef ILIKE '%UNIQUE%'
      AND indexdef ILIKE '%proposal_id%'
      AND indexdef ILIKE '%party_role%'
  ), 'A9: UNIQUE (proposal_id, party_role) must still stand';

  -- And the sub's signature is nowhere near it.
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.commercial_document_signatures
    WHERE party_role NOT IN ('client', 'studio')
  ), 'A9: nothing but a client and a studio ever signs a prime';

  RAISE NOTICE 'PASS A9: the prime keeps its two parties, and the sub signs on its own table';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ACL — the wave's second migration, held to the same bar as its first.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TEMP TABLE _ta_acl (signature text PRIMARY KEY, grantees text[] NOT NULL)
  ON COMMIT DROP;
INSERT INTO _ta_acl VALUES
  ('public.create_trade_agreement(uuid,uuid,jsonb)',            ARRAY['authenticated']),
  ('public.send_trade_agreement(uuid)',                          ARRAY['authenticated']),
  ('public.void_trade_agreement(uuid,text)',                     ARRAY['authenticated']),
  ('public.list_trade_agreements(uuid)',                         ARRAY['authenticated']),
  ('public.mint_trade_agreement_token(uuid)',                    ARRAY['service_role']),
  ('public.resolve_trade_agreement_link(text)',                  ARRAY['service_role']),
  ('public.sign_trade_agreement_by_token(text,text,text)',        ARRAY['service_role']),
  ('public._trade_agreement_fingerprint(uuid)',                   ARRAY[]::text[]),
  ('public.guard_trade_agreement_authored()',                     ARRAY[]::text[]),
  ('public.guard_trade_agreement_signature_immutable()',          ARRAY[]::text[]);

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM _ta_acl LOOP
    ASSERT to_regprocedure(r.signature) IS NOT NULL,
      format('ACL: %s must exist', r.signature);
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
      format('ACL: %s grants drifted', r.signature);
  END LOOP;

  ASSERT NOT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name IN ('studio_trade_agreements',
                         'studio_trade_agreement_signatures',
                         'studio_trade_agreement_tokens')
      AND grantee IN ('anon', 'PUBLIC')
  ), 'ACL: anon holds nothing on the Trade Agreement tables';

  ASSERT NOT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name = 'studio_trade_agreement_tokens'
      AND grantee = 'authenticated'
  ), 'ACL: the credential table grants authenticated nothing at all';

  RAISE NOTICE 'PASS: every Trade Agreement RPC grants exactly one role, and anon holds nothing';
END $$;

ROLLBACK;
