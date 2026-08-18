-- ═══════════════════════════════════════════════════════════════════════════
-- field_link_tokens + create/revoke/resolve tests (migration 00283)
--
-- Covers:
--   1. create_field_link returns a raw token ONCE; only sha256(token) is at rest
--      (token_hash = sha256(raw), and the raw is never stored).
--   2. resolve_field_link returns the narrow DTO — project/party + open owned
--      tasks, court items, punch list, and (receiver/gc) near deliveries.
--   3. Scoping: a task owned by ANOTHER party, and a DONE task, are excluded.
--   4. A bogus / wrong token resolves to NULL (no leak).
--   5. revoke_field_link kills the link (resolve → NULL after).
--   6. An expired token resolves to NULL.
--   7. create_field_link supersedes the prior active token (regenerate).
--   8. Authorization: a non-owner cannot create_field_link, and cannot SELECT the
--      designer-only token table.
--
-- How to run:
--   docker exec -i supabase_db_supabase psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 < supabase/tests/field/field_links_test.sql
--
-- Transaction-wrapped + ROLLBACK. The RPCs are SECURITY DEFINER and require
-- both an active authenticated DB role and auth.uid() for caller authority.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── fixtures ──────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('f1000000-0000-4000-8000-000000000001', 'f1-designer@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('f1000000-0000-4000-8000-000000000002', 'f1-outsider@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('f1000000-0000-4000-8000-000000000001', 'f1-designer@test.invalid', 'F1 Designer', NOW(), NOW()),
  ('f1000000-0000-4000-8000-000000000002', 'f1-outsider@test.invalid', 'F1 Outsider', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO designer_clients (id, designer_id, client_name, status)
VALUES ('f1000000-0000-4000-8000-0000000000c1', 'f1000000-0000-4000-8000-000000000001', 'F1 Household', 'active');

INSERT INTO projects (id, name, designer_id, created_by)
VALUES ('f1000000-0000-4000-8000-0000000000a1', 'F1 Project', 'f1000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001');

-- pty1 = the linked receiver; pty2 = a different party (scoping).
INSERT INTO project_parties (id, project_id, party_kind, display_name, phone)
VALUES
  ('f1000000-0000-4000-8000-0000000000b1', 'f1000000-0000-4000-8000-0000000000a1', 'receiver', 'Rex Receiver', '5559990000'),
  ('f1000000-0000-4000-8000-0000000000b2', 'f1000000-0000-4000-8000-0000000000a1', 'sub',      'Sal Sub',      '5558880000');

-- Tasks: t1 owned+open (shown), t2 owned+done (excluded), t3 other-party (excluded).
INSERT INTO project_tasks (id, project_id, title, owner, owner_party_id, status)
VALUES
  ('f1000000-0000-4000-8000-0000000000d1', 'f1000000-0000-4000-8000-0000000000a1', 'Receive sofa',  'receiver', 'f1000000-0000-4000-8000-0000000000b1', 'todo'),
  ('f1000000-0000-4000-8000-0000000000d2', 'f1000000-0000-4000-8000-0000000000a1', 'Old delivery',  'receiver', 'f1000000-0000-4000-8000-0000000000b1', 'done'),
  ('f1000000-0000-4000-8000-0000000000d3', 'f1000000-0000-4000-8000-0000000000a1', 'Sub-only task', 'sub',      'f1000000-0000-4000-8000-0000000000b2', 'todo');

-- Court items: an RFI (items) + a punch (punch) in the receiver's court.
INSERT INTO client_decisions (id, designer_client_id, designer_id, project_id, title, decision_type, coordination_kind, court, court_party_id, status)
VALUES
  ('f1000000-0000-4000-8000-0000000000e1', 'f1000000-0000-4000-8000-0000000000c1', 'f1000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-0000000000a1', 'Where to stage?', 'product', 'rfi',   'receiver', 'f1000000-0000-4000-8000-0000000000b1', 'pending'),
  ('f1000000-0000-4000-8000-0000000000e2', 'f1000000-0000-4000-8000-0000000000c1', 'f1000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-0000000000a1', 'Scuffed leg',     'product', 'punch', 'receiver', 'f1000000-0000-4000-8000-0000000000b1', 'pending');

-- A near delivery (receiver DTO): PO on p1 with a confirmed_eta in 5 days.
INSERT INTO vendors (id, name) VALUES ('f1000000-0000-4000-8000-000000000009', 'F1 Vendor');
INSERT INTO purchase_orders (id, designer_id, project_id, vendor_id, payment_pattern, total_cents, status, confirmed_eta)
VALUES ('f1000000-0000-4000-8000-000000000007', 'f1000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-0000000000a1', 'f1000000-0000-4000-8000-000000000009', 'net_30', 50000, 'confirmed', current_date + 5);
INSERT INTO project_ffe_items (id, project_id, name, status, quantity, line_total_cents, purchase_order_id)
VALUES ('f1000000-0000-4000-8000-000000000006', 'f1000000-0000-4000-8000-0000000000a1', 'Sofa', 'ordered', 1, 50000, 'f1000000-0000-4000-8000-000000000007');

-- ─── helpers ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION pg_temp.assume_user_role(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION pg_temp.reset_role()
RETURNS VOID AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', NULL, true);
END;
$$ LANGUAGE plpgsql;

-- ─── assertions ────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_token   TEXT;
  v_token2  TEXT;
  v_id      UUID;
  v_hash    TEXT;
  v_dto     JSONB;
  v_count   INTEGER;
  v_raised  BOOLEAN;
BEGIN
  PERFORM pg_temp.assume_user_role('f1000000-0000-4000-8000-000000000001');

  -- ── Case 1: create returns a raw token once; hash-only at rest ───────────
  SELECT id, token INTO v_id, v_token FROM public.create_field_link('f1000000-0000-4000-8000-0000000000b1');
  ASSERT v_token IS NOT NULL AND length(v_token) = 64, 'FAIL 1a: expected a 64-hex raw token';
  SELECT token_hash INTO v_hash FROM public.field_link_tokens WHERE id = v_id;
  ASSERT v_hash = encode(extensions.digest(v_token, 'sha256'), 'hex'),
    'FAIL 1b: token_hash must equal sha256(raw token)';
  ASSERT v_hash <> v_token, 'FAIL 1c: the raw token must NOT be stored';

  -- ── Case 2: resolve returns the narrow DTO ───────────────────────────────
  v_dto := public.resolve_field_link(v_token);
  ASSERT v_dto IS NOT NULL, 'FAIL 2a: a valid token should resolve';
  ASSERT (v_dto#>>'{project,id}') = 'f1000000-0000-4000-8000-0000000000a1', 'FAIL 2b: wrong project';
  ASSERT (v_dto#>>'{party,party_kind}') = 'receiver', 'FAIL 2c: wrong party kind';
  ASSERT jsonb_array_length(v_dto->'tasks') = 1, 'FAIL 2d: expected exactly 1 open owned task, got ' || jsonb_array_length(v_dto->'tasks');
  ASSERT jsonb_array_length(v_dto->'items') = 1, 'FAIL 2e: expected 1 court item (rfi), got ' || jsonb_array_length(v_dto->'items');
  ASSERT jsonb_array_length(v_dto->'punch') = 1, 'FAIL 2f: expected 1 punch item, got ' || jsonb_array_length(v_dto->'punch');
  ASSERT jsonb_array_length(v_dto->'deliveries') >= 1, 'FAIL 2g: receiver DTO should carry the near delivery';

  -- ── Case 3: scoping (own task only) ──────────────────────────────────────
  ASSERT (v_dto#>>'{tasks,0,id}') = 'f1000000-0000-4000-8000-0000000000d1',
    'FAIL 3: the only task must be the open owned one (not the done one, not the other party''s)';

  -- ── Case 4: bogus / wrong token → NULL ───────────────────────────────────
  ASSERT public.resolve_field_link('deadbeef') IS NULL, 'FAIL 4a: a bogus token must resolve to NULL';
  ASSERT public.resolve_field_link(NULL) IS NULL, 'FAIL 4b: NULL token must resolve to NULL';

  -- ── Case 5: revoke → resolve NULL ────────────────────────────────────────
  PERFORM public.revoke_field_link(v_id);
  ASSERT public.resolve_field_link(v_token) IS NULL, 'FAIL 5: a revoked link must resolve to NULL';

  -- ── Case 6: expiry → resolve NULL ────────────────────────────────────────
  v_hash := encode(extensions.digest('rawexpired', 'sha256'), 'hex');
  INSERT INTO public.field_link_tokens (party_id, project_id, token_hash, expires_at)
  VALUES ('f1000000-0000-4000-8000-0000000000b1', 'f1000000-0000-4000-8000-0000000000a1', v_hash, now() - interval '1 day');
  ASSERT public.resolve_field_link('rawexpired') IS NULL, 'FAIL 6: an expired link must resolve to NULL';

  -- ── Case 7: regenerate supersedes the prior active token ─────────────────
  SELECT token INTO v_token FROM public.create_field_link('f1000000-0000-4000-8000-0000000000b1');
  SELECT token INTO v_token2 FROM public.create_field_link('f1000000-0000-4000-8000-0000000000b1');
  ASSERT public.resolve_field_link(v_token) IS NULL, 'FAIL 7a: the superseded token must no longer resolve';
  ASSERT public.resolve_field_link(v_token2) IS NOT NULL, 'FAIL 7b: the fresh token must resolve';
  SELECT count(*) INTO v_count FROM public.field_link_tokens
   WHERE party_id = 'f1000000-0000-4000-8000-0000000000b1' AND status = 'active';
  ASSERT v_count = 1, 'FAIL 7c: at most one active token per party, got ' || v_count;

  PERFORM pg_temp.reset_role();
  RAISE NOTICE 'field_links: cases 1–7 passed.';
END
$$;

-- ── Case 8: authorization — non-owner cannot create or read tokens ─────────
DO $$
DECLARE
  v_raised BOOLEAN;
  v_count  INTEGER;
BEGIN
  -- 8a: a non-owner create_field_link raises.
  PERFORM pg_temp.assume_user_role('f1000000-0000-4000-8000-000000000002');
  v_raised := false;
  BEGIN
    PERFORM public.create_field_link('f1000000-0000-4000-8000-0000000000b1');
  EXCEPTION WHEN insufficient_privilege THEN v_raised := true;
  END;
  ASSERT v_raised, 'FAIL 8a: a non-owner must not mint a field link';
  PERFORM pg_temp.reset_role();

  -- 8b: the token table is designer-only — an outsider SELECTs nothing.
  PERFORM pg_temp.assume_user_role('f1000000-0000-4000-8000-000000000002');
  SELECT count(*) INTO v_count FROM public.field_link_tokens
   WHERE project_id = 'f1000000-0000-4000-8000-0000000000a1';
  ASSERT v_count = 0, 'FAIL 8b: an outsider must not read field_link_tokens, got ' || v_count;
  PERFORM pg_temp.reset_role();

  RAISE NOTICE 'field_links: case 8 (authorization) passed.';
  RAISE NOTICE 'All field_links assertions passed.';
END
$$;

ROLLBACK;
