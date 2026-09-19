-- ═══════════════════════════════════════════════════════════════════════════
-- client_phone_identity — phone-only client identity + the client capability
-- (migration 00650, The Field Line Phase 2, US-3 P21/P22)
--
-- Covers:
--   1. Identity. A phone-only invitation row is valid; an email-only one still
--      is; a row with NEITHER is refused; an unparseable phone is refused
--      rather than stored as typed.
--   2. create_client_link returns a raw token ONCE; only sha256(token) is at
--      rest, and the raw value appears in no column of the row.
--   3. The capability speaks for its OWN invitation, project, party and actions
--      and for nothing else — a token minted on one house does not name another.
--   4. Expired, revoked and forwarded tokens are refused, and a refusal writes
--      no audit row.
--   5. A phone change on project_parties keeps party_id and the capability's
--      scope exactly as they were minted.
--   6. The email token path is untouched: the plaintext token still resolves
--      the same row, and an email-only invitation mints nothing.
--   7. The kickoff consent write lands the exact row shape
--      channelConsentDecision() reads (_shared/sms.ts: status,
--      refusal_unanswered, recorded_at, updated_at, source, recorded_by, keyed
--      on organization_id + channel_kind + channel_value in E.164).
--   8. Authorization: the three functions are service_role only, and
--      client_links / client_link_uses are readable by nobody else.
--
-- How to run (P26 — a disposable TEMPLATE template0 clone, NEVER the shared
-- stack, and never `supabase db reset`):
--   psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/field/client_phone_identity_test.sql
--
-- Transaction-wrapped + ROLLBACK. record_channel_invite is SECURITY DEFINER and
-- gated on an active studio membership, so that case assumes an authenticated
-- role the way field_links_test.sql does.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── fixtures ──────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('c1600000-0000-4000-8000-000000000001', 'c16-designer@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c1600000-0000-4000-8000-000000000002', 'c16-outsider@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('c1600000-0000-4000-8000-000000000001', 'c16-designer@test.invalid', 'C16 Designer', NOW(), NOW()),
  ('c1600000-0000-4000-8000-000000000002', 'c16-outsider@test.invalid', 'C16 Outsider', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO organizations (id, type, name, slug, status)
VALUES ('c1600000-0000-4000-8000-0000000000f1', 'design_studio', 'C16 Studio', 'c16-studio', 'active');

INSERT INTO organization_members (user_id, organization_id, role, status)
VALUES ('c1600000-0000-4000-8000-000000000001', 'c1600000-0000-4000-8000-0000000000f1', 'owner', 'active');

INSERT INTO designer_clients (id, designer_id, client_name, status)
VALUES ('c1600000-0000-4000-8000-0000000000c1', 'c1600000-0000-4000-8000-000000000001', 'C16 Household', 'active');

-- Two houses: the capability must never speak for the second one.
INSERT INTO projects (id, name, designer_id, created_by)
VALUES
  ('c1600000-0000-4000-8000-0000000000a1', 'C16 House One', 'c1600000-0000-4000-8000-000000000001', 'c1600000-0000-4000-8000-000000000001'),
  ('c1600000-0000-4000-8000-0000000000a2', 'C16 House Two', 'c1600000-0000-4000-8000-000000000001', 'c1600000-0000-4000-8000-000000000001');

-- The homeowner's seat on house one, on the same number as the letter.
INSERT INTO project_parties (id, project_id, party_kind, display_name, phone)
VALUES ('c1600000-0000-4000-8000-0000000000b1', 'c1600000-0000-4000-8000-0000000000a1', 'client', 'Dana Homeowner', '5551230000');

-- ─── helpers (field_links_test.sql's, verbatim) ─────────────────────────────
CREATE OR REPLACE FUNCTION pg_temp.assume_user_role(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.assume_user_role(UUID) TO PUBLIC;

CREATE OR REPLACE FUNCTION pg_temp.reset_role()
RETURNS VOID AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', NULL, true);
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.reset_role() TO PUBLIC;

-- ═══════════════════════════════════════════════════════════════════════════
-- Case 1 — identity
-- ═══════════════════════════════════════════════════════════════════════════
DO $case1$
DECLARE
  v_phone   text;
  v_email   text;
  v_raised  boolean;
BEGIN
  -- 1a: a phone and no email is a homeowner we can reach.
  INSERT INTO public.client_invitations (id, token, email, phone, designer_id, designer_client_id, project_id, kind)
  VALUES ('c1600000-0000-4000-8000-000000000011', 'c16-token-phone-only',
          NULL, '(555) 123-0000',
          'c1600000-0000-4000-8000-000000000001',
          'c1600000-0000-4000-8000-0000000000c1',
          'c1600000-0000-4000-8000-0000000000a1', 'invite');
  SELECT phone, email INTO v_phone, v_email
    FROM public.client_invitations WHERE id = 'c1600000-0000-4000-8000-000000000011';
  ASSERT v_email IS NULL, 'FAIL 1a: a phone-only invitation must keep a NULL email';
  ASSERT v_phone = '+15551230000',
    'FAIL 1a: the phone must be stored in E.164, got ' || COALESCE(v_phone, '<null>');

  -- 1b: the email path is untouched — an email-only row is still valid.
  INSERT INTO public.client_invitations (id, token, email, designer_id, designer_client_id, project_id, kind)
  VALUES ('c1600000-0000-4000-8000-000000000012', 'c16-token-email-only',
          'dana@test.invalid',
          'c1600000-0000-4000-8000-000000000001',
          'c1600000-0000-4000-8000-0000000000c1',
          'c1600000-0000-4000-8000-0000000000a1', 'invite');
  SELECT phone, email INTO v_phone, v_email
    FROM public.client_invitations WHERE id = 'c1600000-0000-4000-8000-000000000012';
  ASSERT v_phone IS NULL, 'FAIL 1b: an email-only invitation must keep a NULL phone';
  ASSERT v_email = 'dana@test.invalid', 'FAIL 1b: the email must survive verbatim';

  -- 1c: NEITHER is not an identity.
  v_raised := false;
  BEGIN
    INSERT INTO public.client_invitations (token, email, phone, designer_id, project_id)
    VALUES ('c16-token-neither', NULL, NULL,
            'c1600000-0000-4000-8000-000000000001',
            'c1600000-0000-4000-8000-0000000000a1');
  EXCEPTION WHEN check_violation THEN v_raised := true;
  END;
  ASSERT v_raised, 'FAIL 1c: an invitation with neither an email nor a phone must be refused';

  -- 1d: an unparseable phone is refused, never stored as typed.
  v_raised := false;
  BEGIN
    INSERT INTO public.client_invitations (token, email, phone, designer_id, project_id)
    VALUES ('c16-token-badphone', NULL, 'call the house',
            'c1600000-0000-4000-8000-000000000001',
            'c1600000-0000-4000-8000-0000000000a1');
  EXCEPTION WHEN check_violation THEN v_raised := true;
  END;
  ASSERT v_raised, 'FAIL 1d: a phone that cannot be read as a number must be refused';

  RAISE NOTICE 'client_phone_identity: case 1 (identity) passed.';
END
$case1$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Cases 2-6 — the capability
-- ═══════════════════════════════════════════════════════════════════════════
DO $case2$
DECLARE
  v_id       uuid;
  v_token    text;
  v_id2      uuid;
  v_token2   uuid;
  v_token_b  text;
  v_id_b     uuid;
  v_hash     text;
  v_res      jsonb;
  v_party    uuid;
  v_scope    jsonb;
  v_count    integer;
  v_uses     integer;
  v_last     timestamptz;
BEGIN
  -- ── Case 2: mint. Raw token once; hash-only at rest. ────────────────────
  SELECT id, token INTO v_id, v_token
    FROM public.create_client_link(
      'c1600000-0000-4000-8000-000000000011',
      ARRAY['open_letter', 'approve_selection', 'select_window']);
  ASSERT v_token IS NOT NULL AND length(v_token) = 64,
    'FAIL 2a: expected a 64-hex raw token';
  SELECT token_hash, party_id, scope INTO v_hash, v_party, v_scope
    FROM public.client_links WHERE id = v_id;
  ASSERT v_hash = encode(extensions.digest(v_token, 'sha256'), 'hex'),
    'FAIL 2b: token_hash must equal sha256(raw token)';
  ASSERT v_hash <> v_token, 'FAIL 2c: the raw token must NOT be stored';
  -- The raw value must appear in NO column of the row, not merely outside
  -- token_hash: a capability leaked through `scope` would be no better.
  SELECT count(*) INTO v_count FROM public.client_links cl
   WHERE cl.id = v_id AND to_jsonb(cl)::text LIKE '%' || v_token || '%';
  ASSERT v_count = 0, 'FAIL 2d: the raw token appears somewhere in the stored row';

  -- ── Case 3: the scope names its own invitation, house, seat and actions. ─
  ASSERT v_party = 'c1600000-0000-4000-8000-0000000000b1',
    'FAIL 3a: the seat on this house and this phone must be frozen into the row';
  ASSERT (v_scope->>'invitation_id') = 'c1600000-0000-4000-8000-000000000011',
    'FAIL 3b: wrong invitation in scope';
  ASSERT (v_scope->>'project_id') = 'c1600000-0000-4000-8000-0000000000a1',
    'FAIL 3c: wrong project in scope';
  ASSERT (v_scope->>'party_id') = 'c1600000-0000-4000-8000-0000000000b1',
    'FAIL 3d: wrong party in scope';
  ASSERT v_scope->'actions' = '["open_letter","approve_selection","select_window"]'::jsonb,
    'FAIL 3e: wrong actions in scope, got ' || (v_scope->'actions')::text;

  v_res := public.resolve_client_link(v_token, 'open', 'test');
  ASSERT v_res IS NOT NULL, 'FAIL 3f: a live capability must resolve';
  ASSERT (v_res->>'invitation_id') = 'c1600000-0000-4000-8000-000000000011',
    'FAIL 3g: resolve must answer with its own invitation';
  ASSERT (v_res->>'project_id') = 'c1600000-0000-4000-8000-0000000000a1',
    'FAIL 3h: resolve must answer with its own project';
  ASSERT v_res->'scope' = v_scope, 'FAIL 3i: resolve must answer with the stored scope';
  SELECT last_used_at INTO v_last FROM public.client_links WHERE id = v_id;
  ASSERT v_last IS NOT NULL, 'FAIL 3j: a resolution must stamp last_used_at';
  SELECT count(*) INTO v_uses FROM public.client_link_uses WHERE link_id = v_id;
  ASSERT v_uses = 1, 'FAIL 3k: a resolution must write exactly one audit row, got ' || v_uses;

  -- ── Case 4: forwarded to another house — the token names only its own. ──
  -- A second letter, on house two, with its own capability. Neither token may
  -- ever answer with the other's invitation or project.
  INSERT INTO public.client_invitations (id, token, email, phone, designer_id, designer_client_id, project_id, kind)
  VALUES ('c1600000-0000-4000-8000-000000000013', 'c16-token-phone-two',
          NULL, '5554440000',
          'c1600000-0000-4000-8000-000000000001',
          'c1600000-0000-4000-8000-0000000000c1',
          'c1600000-0000-4000-8000-0000000000a2', 'invite');
  SELECT id, token INTO v_id_b, v_token_b
    FROM public.create_client_link('c1600000-0000-4000-8000-000000000013', ARRAY['open_letter']);

  v_res := public.resolve_client_link(v_token);
  ASSERT (v_res->>'project_id') <> 'c1600000-0000-4000-8000-0000000000a2',
    'FAIL 4a: house one''s capability must not name house two';
  ASSERT (v_res->>'invitation_id') <> 'c1600000-0000-4000-8000-000000000013',
    'FAIL 4b: house one''s capability must not name house two''s letter';
  v_res := public.resolve_client_link(v_token_b);
  ASSERT (v_res->>'project_id') = 'c1600000-0000-4000-8000-0000000000a2',
    'FAIL 4c: house two''s capability must name house two';
  ASSERT v_res->'scope'->'actions' = '["open_letter"]'::jsonb,
    'FAIL 4d: house two''s capability must carry only the actions it was minted with';
  -- And the seat of house one is NOT in house two's scope.
  ASSERT (v_res->>'party_id') IS DISTINCT FROM 'c1600000-0000-4000-8000-0000000000b1',
    'FAIL 4e: house two''s capability must not name house one''s seat';

  -- ── Case 5: a wrong, an expired and a revoked token are all refused. ────
  ASSERT public.resolve_client_link('deadbeef') IS NULL,
    'FAIL 5a: a bogus token must resolve to NULL';
  ASSERT public.resolve_client_link(NULL) IS NULL,
    'FAIL 5b: a NULL token must resolve to NULL';
  ASSERT public.resolve_client_link('') IS NULL,
    'FAIL 5c: an empty token must resolve to NULL';

  v_hash := encode(extensions.digest('c16-expired-raw', 'sha256'), 'hex');
  INSERT INTO public.client_links (id, invitation_id, project_id, token_hash, scope, expires_at)
  VALUES ('c1600000-0000-4000-8000-0000000000e1',
          'c1600000-0000-4000-8000-000000000011',
          'c1600000-0000-4000-8000-0000000000a1',
          v_hash,
          jsonb_build_object('project_id', 'c1600000-0000-4000-8000-0000000000a1',
                             'party_id', NULL,
                             'invitation_id', 'c1600000-0000-4000-8000-000000000011',
                             'actions', '["open_letter"]'::jsonb),
          now() - interval '1 day');
  ASSERT public.resolve_client_link('c16-expired-raw') IS NULL,
    'FAIL 5d: an expired capability must resolve to NULL';

  PERFORM public.revoke_client_link(v_id_b);
  ASSERT public.resolve_client_link(v_token_b) IS NULL,
    'FAIL 5e: a revoked capability must resolve to NULL';
  -- A refusal is silent on the record too: no use row for the refused tries.
  SELECT count(*) INTO v_uses FROM public.client_link_uses
   WHERE link_id IN (v_id_b, 'c1600000-0000-4000-8000-0000000000e1');
  ASSERT v_uses = 1,
    'FAIL 5f: only house two''s ONE live resolution may be on the record, got ' || v_uses;

  -- Re-minting supersedes the prior live link (hash-at-rest precludes reuse).
  SELECT id, token INTO v_id2, v_token
    FROM public.create_client_link('c1600000-0000-4000-8000-000000000011', ARRAY['open_letter']);
  SELECT count(*) INTO v_count FROM public.client_links
   WHERE invitation_id = 'c1600000-0000-4000-8000-000000000011' AND status = 'active';
  ASSERT v_count = 1,
    'FAIL 5g: one live capability per invitation after a re-mint, got ' || v_count;

  -- ── Case 6: a phone change keeps the seat and the scope. ────────────────
  UPDATE public.project_parties
     SET phone = '5557778888'
   WHERE id = 'c1600000-0000-4000-8000-0000000000b1';
  SELECT party_id, scope INTO v_party, v_scope FROM public.client_links WHERE id = v_id;
  ASSERT v_party = 'c1600000-0000-4000-8000-0000000000b1',
    'FAIL 6a: a phone change must not move party_id';
  ASSERT (v_scope->>'party_id') = 'c1600000-0000-4000-8000-0000000000b1',
    'FAIL 6b: a phone change must not rewrite the capability''s scope';
  v_res := public.resolve_client_link(v_token);
  ASSERT (v_res->>'party_id') = 'c1600000-0000-4000-8000-0000000000b1',
    'FAIL 6c: the live capability must still name the same person';
  ASSERT (SELECT phone_e164 FROM public.project_parties
           WHERE id = 'c1600000-0000-4000-8000-0000000000b1') = '+15557778888',
    'FAIL 6d: the seat itself should hold the new number';

  RAISE NOTICE 'client_phone_identity: cases 2-6 (capability) passed.';
END
$case2$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Case 7 — the email token path is untouched
-- ═══════════════════════════════════════════════════════════════════════════
DO $case7$
DECLARE
  v_id    uuid;
  v_count integer;
BEGIN
  SELECT id INTO v_id FROM public.client_invitations WHERE token = 'c16-token-email-only';
  ASSERT v_id = 'c1600000-0000-4000-8000-000000000012',
    'FAIL 7a: the plaintext email token must still resolve its own row';
  SELECT count(*) INTO v_count FROM public.client_links WHERE invitation_id = v_id;
  ASSERT v_count = 0,
    'FAIL 7b: an email-only letter mints no capability, got ' || v_count;
  -- And the phone-only row is reachable by its own plaintext token as well:
  -- one page, two ways in, the SAME row (US-3 P21).
  SELECT id INTO v_id FROM public.client_invitations WHERE token = 'c16-token-phone-only';
  ASSERT v_id = 'c1600000-0000-4000-8000-000000000011',
    'FAIL 7c: the phone letter''s own row must still be reachable by token';
  RAISE NOTICE 'client_phone_identity: case 7 (email path untouched) passed.';
END
$case7$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Case 8 — the kickoff consent write, in the shape the rail reads
-- ═══════════════════════════════════════════════════════════════════════════
-- channelConsentDecision() (_shared/sms.ts) reads exactly one row, keyed on
-- (organization_id, channel_kind='sms', channel_value), and selects
-- "status, refusal_unanswered, recorded_at, updated_at, source, recorded_by".
-- The kickoff box writes through record_channel_invite — the SAME door the
-- trade add path uses (use-coordination.ts useAddProjectParty) — so this case
-- asserts the door leaves every one of those fields answerable.
DO $case8$
DECLARE
  v_row public.studio_channel_consent;
BEGIN
  PERFORM pg_temp.assume_user_role('c1600000-0000-4000-8000-000000000001');
  PERFORM public.record_channel_invite(
    'c1600000-0000-4000-8000-0000000000f1',
    'sms',
    '(555) 123-0000',
    'kickoff_checkbox',
    'Kickoff consent box ticked in Patina, 19 September 2026.',
    'field-sms-v1',
    'c1600000-0000-4000-8000-0000000000a1');
  PERFORM pg_temp.reset_role();

  SELECT * INTO v_row FROM public.studio_channel_consent
   WHERE organization_id = 'c1600000-0000-4000-8000-0000000000f1'
     AND channel_kind = 'sms'
     AND channel_value = '+15551230000';
  ASSERT FOUND,
    'FAIL 8a: the consent record must be keyed on the E.164 phone the letter carries';
  ASSERT v_row.status = 'pending',
    'FAIL 8b: record_channel_invite records the invite as pending, got ' || v_row.status;
  ASSERT v_row.source = 'kickoff_checkbox',
    'FAIL 8c: the source must be the kickoff box, got ' || COALESCE(v_row.source, '<null>');
  ASSERT v_row.disclosure_version = 'field-sms-v1',
    'FAIL 8d: the disclosure version the trade path uses must travel with it';
  ASSERT v_row.recorded_at IS NOT NULL, 'FAIL 8e: recorded_at must be stamped';
  ASSERT v_row.updated_at IS NOT NULL, 'FAIL 8f: updated_at must be stamped';
  ASSERT v_row.recorded_by = 'c1600000-0000-4000-8000-000000000001',
    'FAIL 8g: the studio member who ticked the box must be on the record';
  ASSERT v_row.refusal_unanswered = false,
    'FAIL 8h: a fresh kickoff consent carries no unanswered refusal';
  ASSERT v_row.origin_project_id = 'c1600000-0000-4000-8000-0000000000a1',
    'FAIL 8i: the job the consent came from should be nameable';
  -- And the frozen legacy mirror is NOT written (00594 R-AS): the trade path
  -- writes no sms_consent_* column either, and refuse_legacy_consent_write()
  -- would refuse one.
  ASSERT (SELECT sms_consent_status FROM public.project_parties
           WHERE id = 'c1600000-0000-4000-8000-0000000000b1') = 'not_asked',
    'FAIL 8j: project_parties.sms_consent_* is frozen legacy and must stay untouched';

  RAISE NOTICE 'client_phone_identity: case 8 (consent read shape) passed.';
END
$case8$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Case 9 — authorization
-- ═══════════════════════════════════════════════════════════════════════════
DO $case9$
BEGIN
  ASSERT NOT has_function_privilege('anon',
    'public.create_client_link(uuid,text[],interval)', 'EXECUTE'),
    'FAIL 9a: anon must not mint a capability';
  ASSERT NOT has_function_privilege('authenticated',
    'public.create_client_link(uuid,text[],interval)', 'EXECUTE'),
    'FAIL 9b: an authenticated caller must not mint a capability';
  ASSERT NOT has_function_privilege('anon',
    'public.resolve_client_link(text,text,text)', 'EXECUTE'),
    'FAIL 9c: anon must not resolve a capability';
  ASSERT NOT has_function_privilege('authenticated',
    'public.resolve_client_link(text,text,text)', 'EXECUTE'),
    'FAIL 9d: an authenticated caller must not resolve a capability';
  ASSERT NOT has_function_privilege('authenticated',
    'public.revoke_client_link(uuid)', 'EXECUTE'),
    'FAIL 9e: an authenticated caller must not revoke a capability';
  ASSERT has_function_privilege('service_role',
    'public.create_client_link(uuid,text[],interval)', 'EXECUTE'),
    'FAIL 9f: service_role must be able to mint';
  ASSERT has_function_privilege('service_role',
    'public.resolve_client_link(text,text,text)', 'EXECUTE'),
    'FAIL 9g: service_role must be able to resolve';
  ASSERT has_function_privilege('service_role',
    'public.revoke_client_link(uuid)', 'EXECUTE'),
    'FAIL 9h: service_role must be able to revoke';

  ASSERT NOT has_table_privilege('anon', 'public.client_links', 'SELECT'),
    'FAIL 9i: anon must not read client_links';
  ASSERT NOT has_table_privilege('authenticated', 'public.client_links', 'SELECT'),
    'FAIL 9j: an authenticated caller must not read client_links';
  ASSERT NOT has_table_privilege('authenticated', 'public.client_link_uses', 'SELECT'),
    'FAIL 9k: an authenticated caller must not read client_link_uses';
  ASSERT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.client_links'::regclass),
    'FAIL 9l: client_links must have RLS enabled';
  ASSERT (SELECT count(*) FROM pg_policies
           WHERE schemaname = 'public' AND tablename IN ('client_links', 'client_link_uses')) = 0,
    'FAIL 9m: deny-all means NO policy exists on either table';

  RAISE NOTICE 'client_phone_identity: case 9 (authorization) passed.';
  RAISE NOTICE 'All client_phone_identity assertions passed.';
END
$case9$;

ROLLBACK;
