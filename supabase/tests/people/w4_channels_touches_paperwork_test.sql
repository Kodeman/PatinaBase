-- ═══════════════════════════════════════════════════════════════════════════
-- W4 (P3) — email channel status, the touch, CRM-29's hardened pay link, and
--           the trade-side compliance upload door
--
-- Migrations under test: 00635 (studio_touches + record_touch + record_notice
-- + notification_log's studio_contact_channel ref), 00636 (invoice_links
-- token_hash/expires_at, the re-headed producers and resolvers,
-- invoice_link_is_live), 00637 (paperwork_link_tokens,
-- paperwork_link_rate_limits, the compliance-documents bucket,
-- mint/revoke/resolve_paperwork_link, record_inbound_compliance_document,
-- confirm/reject_inbound_document, v_access_grants' twelfth branch).
--
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--        -v ON_ERROR_STOP=1 -f supabase/tests/people/w4_channels_touches_paperwork_test.sql
--
-- One transaction, ROLLBACKed. Every block builds its own fixture under the
-- fa… id space, so nothing here collides with W1a's, W1b's or W3's. The
-- seeded book is only READ, except block 5, which mints a pay link on a seeded
-- invoice and rolls it back.
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;

-- ─── helpers (the W1a / W1b / W3 shape) ────────────────────────────────────
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

-- ─── the studio, its standings, its book and its job ───────────────────────
-- a0…0004 owner, a0…0003 plain member, a0…0005 a stranger to this studio.
INSERT INTO public.organizations (id, type, name, slug, status) VALUES
  ('fa000000-0000-4000-8000-00000000000a', 'design_studio', 'W4 Test Studio', 'w4-studio-a', 'active');

INSERT INTO public.organization_members (user_id, organization_id, role, status, joined_at) VALUES
  ('a0000000-0000-0000-0000-000000000004', 'fa000000-0000-4000-8000-00000000000a', 'owner',  'active', now()),
  ('a0000000-0000-0000-0000-000000000003', 'fa000000-0000-4000-8000-00000000000a', 'member', 'active', now())
ON CONFLICT (user_id, organization_id) DO UPDATE SET role = EXCLUDED.role, status = 'active';

INSERT INTO public.studio_contacts
  (id, organization_id, entity_kind, contact_kind, company_name, company_kind, created_by) VALUES
  ('fa200000-0000-4000-8000-00000000000a','fa000000-0000-4000-8000-00000000000a','company','sub','Twin Cities Drywall Test','sub','a0000000-0000-0000-0000-000000000004'),
  ('fa200000-0000-4000-8000-00000000000b','fa000000-0000-4000-8000-00000000000a','company','sub','No Engagement Test Co','sub','a0000000-0000-0000-0000-000000000004');

INSERT INTO public.studio_contacts
  (id, organization_id, entity_kind, contact_kind, full_name, email, company_id, created_by) VALUES
  ('fa100000-0000-4000-8000-00000000000a','fa000000-0000-4000-8000-00000000000a','person','sub','Rosa Paperwork','rosa@tcdrywall.test','fa200000-0000-4000-8000-00000000000a','a0000000-0000-0000-0000-000000000004');

UPDATE public.studio_contacts
   SET paperwork_contact_person_id = 'fa100000-0000-4000-8000-00000000000a'
 WHERE id = 'fa200000-0000-4000-8000-00000000000a';

INSERT INTO public.projects
  (id, name, designer_id, studio_id, status, created_by, client_visibility_tier) VALUES
  ('fa300000-0000-4000-8000-00000000000a','W4 test job','a0000000-0000-0000-0000-000000000004','fa000000-0000-4000-8000-00000000000a','active','a0000000-0000-0000-0000-000000000004','full');

INSERT INTO public.project_parties
  (id, project_id, party_kind, display_name, phone, studio_contact_id, company_id,
   on_site_from, on_site_to, created_by) VALUES
  ('fa500000-0000-4000-8000-00000000000a','fa300000-0000-4000-8000-00000000000a','sub','Rosa Paperwork','(612) 555-0701',
   'fa100000-0000-4000-8000-00000000000a','fa200000-0000-4000-8000-00000000000a',
   CURRENT_DATE - 10, CURRENT_DATE + 120,'a0000000-0000-0000-0000-000000000004'),
  ('fa500000-0000-4000-8000-00000000000b','fa300000-0000-4000-8000-00000000000a','gc','Luis Super','(612) 555-0702',
   NULL, NULL, CURRENT_DATE - 30, CURRENT_DATE + 200,'a0000000-0000-0000-0000-000000000004');

INSERT INTO public.studio_contact_channels
  (id, owner_type, owner_id, channel_kind, value, status) VALUES
  ('fa600000-0000-4000-8000-00000000000a','person','fa100000-0000-4000-8000-00000000000a','email','rosa@tcdrywall.test','active');

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. notification_log carries the deliverability ref for an account-less letter
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.notification_log
    (user_id, type, channel, status, recipient, ref_type, ref_id)
  VALUES (NULL, 'compliance_chase', 'email', 'sent', 'rosa@tcdrywall.test',
          'studio_contact_channel', 'fa600000-0000-4000-8000-00000000000a')
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'BLOCK 1 FAIL: the channel-ref row did not land';
  END IF;

  BEGIN
    INSERT INTO public.notification_log (user_id, type, channel, status, ref_type, ref_id)
    VALUES (NULL, 'x', 'email', 'sent', 'not_a_ref_kind', 'fa600000-0000-4000-8000-00000000000a');
    RAISE EXCEPTION 'BLOCK 1 FAIL: an unknown ref_type was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  RAISE NOTICE '1. CRM-12 — notification_log accepts studio_contact_channel as a ref and still refuses an unknown kind: passed';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. record_touch — the org is resolved server-side, never passed in
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_seat_touch uuid;
  v_card_touch uuid;
  v_org        uuid;
BEGIN
  v_seat_touch := public.record_touch(
    p_subject_type => 'engagement',
    p_subject_id   => 'fa500000-0000-4000-8000-00000000000a',
    p_channel_kind => 'sms',
    p_direction    => 'out',
    p_actor_ref    => 'sms-dispatch');
  IF v_seat_touch IS NULL THEN
    RAISE EXCEPTION 'BLOCK 2 FAIL (a): a seat on a studio-stamped job wrote no touch';
  END IF;
  SELECT organization_id INTO v_org FROM public.studio_touches WHERE id = v_seat_touch;
  IF v_org <> 'fa000000-0000-4000-8000-00000000000a' THEN
    RAISE EXCEPTION 'BLOCK 2 FAIL (b): the seat touch landed at org %, not the job''s studio', v_org;
  END IF;

  v_card_touch := public.record_touch(
    p_subject_type => 'person',
    p_subject_id   => 'fa100000-0000-4000-8000-00000000000a',
    p_channel_kind => 'email');
  SELECT organization_id INTO v_org FROM public.studio_touches WHERE id = v_card_touch;
  IF v_org <> 'fa000000-0000-4000-8000-00000000000a' THEN
    RAISE EXCEPTION 'BLOCK 2 FAIL (c): the card touch resolved the wrong studio';
  END IF;

  -- A subject that resolves to nothing writes nothing rather than guessing.
  IF public.record_touch('person', 'fa100000-0000-4000-8000-0000000000ff') IS NOT NULL THEN
    RAISE EXCEPTION 'BLOCK 2 FAIL (d): an unresolvable subject wrote a touch';
  END IF;

  -- The two columns cannot disagree: a checked touch must name a class.
  BEGIN
    INSERT INTO public.studio_touches
      (organization_id, subject_type, subject_id, direction, decision_class, authority_check)
    VALUES ('fa000000-0000-4000-8000-00000000000a','engagement',
            'fa500000-0000-4000-8000-00000000000a','in','none','failed_no_authority');
    RAISE EXCEPTION 'BLOCK 2 FAIL (e): an authority verdict landed on a classless touch';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  RAISE NOTICE '2. E13 — record_touch resolves the studio from the subject (R-BD), refuses to file an unattributable touch, and holds decision_class and authority_check together: passed';
END $$;

-- ── a touch is the studio's to read and nobody else's ──────────────────────
DO $$
DECLARE v_seen integer;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000003');
  SELECT count(*) INTO v_seen FROM public.studio_touches
   WHERE organization_id = 'fa000000-0000-4000-8000-00000000000a';
  IF v_seen < 2 THEN
    RAISE EXCEPTION 'BLOCK 2 FAIL (f): a plain member of the studio read % touches, not its own', v_seen;
  END IF;

  -- and no authenticated member may write one by hand
  BEGIN
    INSERT INTO public.studio_touches
      (organization_id, subject_type, subject_id, direction)
    VALUES ('fa000000-0000-4000-8000-00000000000a','engagement',
            'fa500000-0000-4000-8000-00000000000a','in');
    PERFORM pg_temp.reset_role();
    RAISE EXCEPTION 'BLOCK 2 FAIL (g): a member wrote a touch straight through PostgREST';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM pg_temp.reset_role();

  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000005');
  SELECT count(*) INTO v_seen FROM public.studio_touches
   WHERE organization_id = 'fa000000-0000-4000-8000-00000000000a';
  PERFORM pg_temp.reset_role();
  IF v_seen <> 0 THEN
    RAISE EXCEPTION 'BLOCK 2 FAIL (h): a stranger read % of this studio''s touches', v_seen;
  END IF;

  RAISE NOTICE '2b. studio_touches RLS — the studio reads its own, a stranger reads none, and no member may write one by hand: passed';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. record_notice — CRM-23, and Patina Field's fixed wire shape
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_id    uuid;
  v_what  text;
  v_at    timestamptz;
  v_by    text;
  v_names text[];
  v_refs  uuid[];
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  SELECT n.id, n.what, n.recorded_at, n.recorded_by, n.told_names
    INTO v_id, v_what, v_at, v_by, v_names
    FROM public.record_notice(
      'fa300000-0000-4000-8000-00000000000a',
      'The lockbox changed to version 4.',
      ARRAY['fa500000-0000-4000-8000-00000000000a',
            'fa500000-0000-4000-8000-00000000000b',
            'fa100000-0000-4000-8000-0000000000ff']::uuid[]) n;
  PERFORM pg_temp.reset_role();

  IF v_id IS NULL OR v_what <> 'The lockbox changed to version 4.' OR v_at IS NULL THEN
    RAISE EXCEPTION 'BLOCK 3 FAIL (a): the notice did not come back in the shape Field decodes';
  END IF;
  IF v_by IS NULL THEN
    RAISE EXCEPTION 'BLOCK 3 FAIL (b): recorded_by came back empty — Field prints a NAME here';
  END IF;
  IF array_length(v_names, 1) <> 2 THEN
    RAISE EXCEPTION 'BLOCK 3 FAIL (c): told_names carried %, not the two refs that resolve', v_names;
  END IF;

  SELECT notified_refs INTO v_refs FROM public.studio_touches WHERE id = v_id;
  IF array_length(v_refs, 1) <> 2 THEN
    RAISE EXCEPTION 'BLOCK 3 FAIL (d): notified_refs and told_names disagree about who was told';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.studio_touches
     WHERE id = v_id AND subject_type = 'project'
       AND subject_id = 'fa300000-0000-4000-8000-00000000000a'
       AND channel_kind IS NULL
  ) THEN
    RAISE EXCEPTION 'BLOCK 3 FAIL (e): the notice is not filed against the job, with no channel guessed';
  END IF;

  RAISE NOTICE '3. CRM-23 — record_notice writes a project notice, drops refs that resolve to nothing, and answers in Field''s exact shape: passed';
END $$;

DO $$
BEGIN
  -- a notice with nothing in it
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  BEGIN
    PERFORM public.record_notice('fa300000-0000-4000-8000-00000000000a', '   ');
    PERFORM pg_temp.reset_role();
    RAISE EXCEPTION 'BLOCK 3 FAIL (f): an empty notice was recorded';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  PERFORM pg_temp.reset_role();

  -- a stranger
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000005');
  BEGIN
    PERFORM public.record_notice('fa300000-0000-4000-8000-00000000000a', 'The gate code changed.');
    PERFORM pg_temp.reset_role();
    RAISE EXCEPTION 'BLOCK 3 FAIL (g): a stranger recorded a notice on this studio''s job';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM pg_temp.reset_role();

  RAISE NOTICE '3b. record_notice refuses an empty notice and a stranger, with one refusal that names no facts: passed';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. CRM-29 — the pay link is hashed, dated, and regenerated on send
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_invoice uuid := 'b0000000-0000-0000-0000-00000000e142';   -- seeded, status 'sent'
  v_token   text;
  v_second  text;
  v_link    public.invoice_links%ROWTYPE;
  v_sheet   jsonb;
  v_json    jsonb;
BEGIN
  v_token := public.ensure_invoice_link(v_invoice);
  IF v_token IS NULL OR v_token !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'BLOCK 4 FAIL (a): no raw token came back from the mint';
  END IF;

  SELECT * INTO v_link FROM public.invoice_links
   WHERE invoice_id = v_invoice AND status = 'active';
  IF v_link.token IS NOT NULL THEN
    RAISE EXCEPTION 'BLOCK 4 FAIL (b): the plaintext column was written';
  END IF;
  IF v_link.token_hash <> encode(extensions.digest(v_token, 'sha256'), 'hex') THEN
    RAISE EXCEPTION 'BLOCK 4 FAIL (c): the stored hash is not sha256 of the emitted token';
  END IF;
  IF v_link.expires_at IS NULL
     OR v_link.expires_at > now() + interval '31 days'
     OR v_link.expires_at < now() + interval '29 days' THEN
    RAISE EXCEPTION 'BLOCK 4 FAIL (d): the mint did not set a 30-day clock (%)', v_link.expires_at;
  END IF;

  -- the raw token resolves; a hash presented as a token does not
  v_sheet := public.resolve_invoice_link(v_token, false);
  IF v_sheet IS NULL THEN
    RAISE EXCEPTION 'BLOCK 4 FAIL (e): the raw token did not open its own sheet';
  END IF;
  IF public.resolve_invoice_link(v_link.token_hash, false) IS NOT NULL THEN
    RAISE EXCEPTION 'BLOCK 4 FAIL (f): the stored hash works as a bearer token';
  END IF;

  -- regenerate on send: the next letter's address is a new one and the old
  -- address is dead the moment it lands
  v_second := public.ensure_invoice_link(v_invoice);
  IF v_second = v_token THEN
    RAISE EXCEPTION 'BLOCK 4 FAIL (g): the second letter carried the first letter''s address';
  END IF;
  IF public.resolve_invoice_link(v_token, false) IS NOT NULL THEN
    RAISE EXCEPTION 'BLOCK 4 FAIL (h): the superseded address still answers';
  END IF;

  -- an expired link dies into the same silence a revoked one does
  UPDATE public.invoice_links SET expires_at = now() - interval '1 day'
   WHERE invoice_id = v_invoice AND status = 'active';
  IF public.resolve_invoice_link(v_second, false) IS NOT NULL THEN
    RAISE EXCEPTION 'BLOCK 4 FAIL (i): an expired link still opened the sheet';
  END IF;
  IF public.invoice_link_is_live(v_invoice) THEN
    RAISE EXCEPTION 'BLOCK 4 FAIL (j): invoice_link_is_live called an expired link live';
  END IF;
  IF EXISTS (SELECT 1 FROM public.resolve_invoice_link_for_checkout(v_second)) THEN
    RAISE EXCEPTION 'BLOCK 4 FAIL (k): checkout resolved an expired link';
  END IF;

  RAISE NOTICE '4. CRM-29 — sha256 at rest, a 30-day clock, a fresh address per send, and one silence for revoked and expired alike: passed';
END $$;

-- ── the folio may learn the state, never the address ───────────────────────
DO $$
DECLARE v_json jsonb;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  v_json := public.get_invoice_link('b0000000-0000-0000-0000-00000000e142');
  PERFORM pg_temp.reset_role();
  IF v_json IS NULL THEN
    RAISE EXCEPTION 'BLOCK 4 FAIL (l): the folio read no link at all';
  END IF;
  IF v_json ? 'token' AND (v_json->>'token') IS NOT NULL THEN
    RAISE EXCEPTION 'BLOCK 4 FAIL (m): get_invoice_link handed back an address';
  END IF;
  IF (v_json->>'expires_at') IS NULL THEN
    RAISE EXCEPTION 'BLOCK 4 FAIL (n): the folio cannot see when the address dies';
  END IF;
  RAISE NOTICE '4b. get_invoice_link reports status and end date and no address, because there is none to report: passed';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. The paperwork door — the window rule (R-AD), the token, the never-overwrite
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_token   text;
  v_id      uuid;
  v_expires timestamptz;
BEGIN
  -- a firm with NO open engagement must be given a date out loud
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  BEGIN
    PERFORM public.mint_paperwork_link('fa200000-0000-4000-8000-00000000000b');
    PERFORM pg_temp.reset_role();
    RAISE EXCEPTION 'BLOCK 5 FAIL (a): a link was minted on a clock nobody named';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- with the studio's own date, it mints
  SELECT m.id, m.token, m.expires_at INTO v_id, v_token, v_expires
    FROM public.mint_paperwork_link('fa200000-0000-4000-8000-00000000000b',
                                    now() + interval '30 days') m;
  IF v_token !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'BLOCK 5 FAIL (b): the mint returned no raw token';
  END IF;

  -- with an open seat, the window is the engagement's
  SELECT m.token, m.expires_at INTO v_token, v_expires
    FROM public.mint_paperwork_link('fa200000-0000-4000-8000-00000000000a') m;
  PERFORM pg_temp.reset_role();
  IF v_expires::date <> (CURRENT_DATE + 121) THEN
    RAISE EXCEPTION 'BLOCK 5 FAIL (c): the window is %, not the seat''s on_site_to + a day', v_expires;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.paperwork_link_tokens
     WHERE company_id = 'fa200000-0000-4000-8000-00000000000a'
       AND status = 'active'
       AND token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex')
  ) THEN
    RAISE EXCEPTION 'BLOCK 5 FAIL (d): the token is not stored as its own sha256';
  END IF;

  -- the page's read answers on the raw token and carries no ids
  IF (public.resolve_paperwork_link(v_token))->>'company_name'
       <> 'Twin Cities Drywall Test' THEN
    RAISE EXCEPTION 'BLOCK 5 FAIL (e): the live token did not resolve its own firm';
  END IF;
  IF public.resolve_paperwork_link(repeat('c', 64)) IS NOT NULL
     OR public.resolve_paperwork_link('nope') IS NOT NULL THEN
    RAISE EXCEPTION 'BLOCK 5 FAIL (f): an unknown or malformed token said something';
  END IF;

  RAISE NOTICE '5. R-AD — no engagement means the studio names the date or the mint is refused; an open seat dates it from the window; sha256 at rest; one silence for every dead token: passed';
END $$;

-- ── a person card is not a firm, and another studio is not this one ────────
DO $$
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  BEGIN
    PERFORM public.mint_paperwork_link('fa100000-0000-4000-8000-00000000000a',
                                       now() + interval '30 days');
    PERFORM pg_temp.reset_role();
    RAISE EXCEPTION 'BLOCK 5 FAIL (g): a person card was given a firm''s door';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM pg_temp.reset_role();

  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000005');
  BEGIN
    PERFORM public.mint_paperwork_link('fa200000-0000-4000-8000-00000000000a');
    PERFORM pg_temp.reset_role();
    RAISE EXCEPTION 'BLOCK 5 FAIL (h): a stranger minted this studio''s paperwork link';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM pg_temp.reset_role();

  RAISE NOTICE '5b. the door is a firm''s and a studio''s: a person card and a stranger both get the same refusal: passed';
END $$;

-- ── the upload: never overwrites, never trusts the request ─────────────────
DO $$
DECLARE
  v_token    text;
  v_verified uuid := 'fa700000-0000-4000-8000-00000000000a';
  v_new      uuid;
  v_before   timestamptz;
  v_after    timestamptz;
  v_notices  integer;
BEGIN
  -- a COI the studio has already checked
  INSERT INTO public.studio_compliance_documents
    (id, organization_id, holder_type, holder_id, doc_type, blocks,
     issued_on, expires_on, verified_by, verified_at)
  VALUES (v_verified, 'fa000000-0000-4000-8000-00000000000a', 'company',
          'fa200000-0000-4000-8000-00000000000a', 'coi_gl', ARRAY['site_access']::text[],
          CURRENT_DATE - 300, CURRENT_DATE + 60,
          'a0000000-0000-0000-0000-000000000004', now() - interval '10 days');
  SELECT verified_at INTO v_before FROM public.studio_compliance_documents WHERE id = v_verified;

  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  SELECT m.token INTO v_token
    FROM public.mint_paperwork_link('fa200000-0000-4000-8000-00000000000a') m;
  PERFORM pg_temp.reset_role();

  v_new := public.record_inbound_compliance_document(
    v_token, 'coi_gl', NULL, 'GL-99', 'Western National Test',
    CURRENT_DATE, CURRENT_DATE + 365,
    'fa000000-0000-4000-8000-00000000000a/fa200000-0000-4000-8000-00000000000a/'
      || gen_random_uuid()::text || '/coi.pdf');

  IF v_new IS NULL THEN
    RAISE EXCEPTION 'BLOCK 6 FAIL (a): the upload recorded nothing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.studio_compliance_documents
     WHERE id = v_new AND source = 'field_link' AND inbound
       AND verified_at IS NULL AND verified_by IS NULL AND superseded_by IS NULL
       AND holder_id = 'fa200000-0000-4000-8000-00000000000a'
       AND organization_id = 'fa000000-0000-4000-8000-00000000000a'
  ) THEN
    RAISE EXCEPTION 'BLOCK 6 FAIL (b): the inbound row is not unverified paper on the token''s own firm';
  END IF;

  -- What a lapse blocks is the studio's policy on the paper, not the trade's:
  -- the renewal inherits it, which is also what lets R-AZ's successor rule be
  -- satisfiable at all.
  IF NOT EXISTS (
    SELECT 1 FROM public.studio_compliance_documents
     WHERE id = v_new AND blocks = ARRAY['site_access']::text[]
  ) THEN
    RAISE EXCEPTION 'BLOCK 6 FAIL (b2): the renewal did not inherit the studio''s gates';
  END IF;

  SELECT verified_at INTO v_after FROM public.studio_compliance_documents WHERE id = v_verified;
  IF v_after IS DISTINCT FROM v_before
     OR EXISTS (SELECT 1 FROM public.studio_compliance_documents
                 WHERE id = v_verified AND superseded_by IS NOT NULL) THEN
    RAISE EXCEPTION 'BLOCK 6 FAIL (c): the upload touched the verified document';
  END IF;

  -- R-AC: the owner hears about it
  SELECT count(*) INTO v_notices FROM public.notification_log
   WHERE type = 'compliance_document_inbound'
     AND (metadata->>'document_id') = v_new::text;
  IF v_notices < 1 THEN
    RAISE EXCEPTION 'BLOCK 6 FAIL (d): nobody at the studio was told';
  END IF;

  -- a revoked token reaches nothing
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  PERFORM public.revoke_paperwork_link(
    (SELECT id FROM public.paperwork_link_tokens
      WHERE company_id = 'fa200000-0000-4000-8000-00000000000a' AND status = 'active'),
    'The job finished.');
  PERFORM pg_temp.reset_role();
  BEGIN
    PERFORM public.record_inbound_compliance_document(v_token, 'w9');
    RAISE EXCEPTION 'BLOCK 6 FAIL (e): a revoked token still wrote a document';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  IF public.resolve_paperwork_link(v_token) IS NOT NULL THEN
    RAISE EXCEPTION 'BLOCK 6 FAIL (f): a revoked token still opened the page';
  END IF;

  RAISE NOTICE '6. spec §5 — an upload always INSERTs unverified paper on the TOKEN''S firm, never touches a verified document, tells the studio, and dies with its token: passed';
END $$;

-- ── confirm supersedes; reject records a reason and drafts one chase ───────
DO $$
DECLARE
  v_pending  uuid;
  v_verified uuid := 'fa700000-0000-4000-8000-00000000000a';
  v_tasks    integer;
  v_reject   uuid;
BEGIN
  SELECT id INTO v_pending FROM public.studio_compliance_documents
   WHERE holder_id = 'fa200000-0000-4000-8000-00000000000a'
     AND inbound AND verified_at IS NULL AND rejected_at IS NULL
   ORDER BY created_at DESC LIMIT 1;

  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000003');
  PERFORM public.confirm_inbound_document(v_pending);
  PERFORM pg_temp.reset_role();

  IF NOT EXISTS (
    SELECT 1 FROM public.studio_compliance_documents
     WHERE id = v_pending AND verified_at IS NOT NULL
       AND verified_by = 'a0000000-0000-0000-0000-000000000003'
  ) THEN
    RAISE EXCEPTION 'BLOCK 7 FAIL (a): the confirm did not stamp the paper';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.studio_compliance_documents
     WHERE id = v_verified AND superseded_by = v_pending
  ) THEN
    RAISE EXCEPTION 'BLOCK 7 FAIL (b): the old paper was not retired by the confirm';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.studio_compliance_documents WHERE id = v_verified) THEN
    RAISE EXCEPTION 'BLOCK 7 FAIL (c): the old paper was deleted';
  END IF;

  -- a second Confirm changes nothing
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000003');
  PERFORM public.confirm_inbound_document(v_pending);
  PERFORM pg_temp.reset_role();

  -- a LAPSED successor cannot retire a live dated one (R-AZ), and it says so.
  -- (An UNDATED one cannot exist for a certificate at all: 00623's
  -- dated_expiry CHECK refuses it at the door, which is why the edge function
  -- asks the firm for the date before it uploads.)
  INSERT INTO public.studio_compliance_documents
    (id, organization_id, holder_type, holder_id, doc_type, blocks,
     expires_on, source, inbound)
  VALUES ('fa700000-0000-4000-8000-00000000000c','fa000000-0000-4000-8000-00000000000a',
          'company','fa200000-0000-4000-8000-00000000000a','coi_gl',
          ARRAY['site_access']::text[], CURRENT_DATE - 5,'field_link', true);
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000003');
  BEGIN
    PERFORM public.confirm_inbound_document('fa700000-0000-4000-8000-00000000000c');
    PERFORM pg_temp.reset_role();
    RAISE EXCEPTION 'BLOCK 7 FAIL (c2): a lapsed paper retired a live one';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  PERFORM pg_temp.reset_role();
  IF EXISTS (SELECT 1 FROM public.studio_compliance_documents
              WHERE id = 'fa700000-0000-4000-8000-00000000000c' AND verified_at IS NOT NULL) THEN
    RAISE EXCEPTION 'BLOCK 7 FAIL (c3): the refused confirm still stamped the paper';
  END IF;

  -- reject: a reason is not optional, and one chase is drafted for review
  INSERT INTO public.studio_compliance_documents
    (id, organization_id, holder_type, holder_id, doc_type, source, inbound)
  VALUES ('fa700000-0000-4000-8000-00000000000b','fa000000-0000-4000-8000-00000000000a',
          'company','fa200000-0000-4000-8000-00000000000a','w9','field_link', true)
  RETURNING id INTO v_reject;

  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000003');
  BEGIN
    PERFORM public.reject_inbound_document(v_reject, '   ');
    PERFORM pg_temp.reset_role();
    RAISE EXCEPTION 'BLOCK 7 FAIL (d): a refusal with no reason was recorded';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  PERFORM public.reject_inbound_document(v_reject, 'The name on it is not the firm we contracted.');
  PERFORM public.reject_inbound_document(v_reject, 'A second tap.');
  PERFORM pg_temp.reset_role();

  IF NOT EXISTS (
    SELECT 1 FROM public.studio_compliance_documents
     WHERE id = v_reject AND rejected_at IS NOT NULL
       AND rejection_reason = 'The name on it is not the firm we contracted.'
  ) THEN
    RAISE EXCEPTION 'BLOCK 7 FAIL (e): the refusal or its reason did not land';
  END IF;

  SELECT count(*) INTO v_tasks FROM public.agent_tasks
   WHERE task_type = 'compliance_chase'
     AND entity_id = v_reject
     AND status = 'awaiting_review';
  IF v_tasks <> 1 THEN
    RAISE EXCEPTION 'BLOCK 7 FAIL (f): % chases were drafted, not exactly one awaiting_review', v_tasks;
  END IF;

  RAISE NOTICE '7. spec §6 — confirm stamps and supersedes without deleting, reject needs a reason and drafts exactly one awaiting_review chase, and both acts are idempotent: passed';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. v_access_grants carries the twelfth door, and no credential
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE v_row record;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  SELECT * INTO v_row FROM public.v_access_grants
   WHERE tier = 'paperwork_link'
     AND scope_id = 'fa000000-0000-4000-8000-00000000000a'
     AND revoke_reason = 'The job finished.'
   LIMIT 1;
  PERFORM pg_temp.reset_role();

  IF v_row.grant_id IS NULL THEN
    RAISE EXCEPTION 'BLOCK 8 FAIL (a): the paperwork door is not in the grants ledger';
  END IF;
  IF v_row.subject_type <> 'company' OR v_row.expires_at IS NULL THEN
    RAISE EXCEPTION 'BLOCK 8 FAIL (b): the paperwork grant does not name a firm and an end date';
  END IF;
  IF v_row.revoked_at IS NULL OR v_row.revoke_reason <> 'The job finished.' THEN
    RAISE EXCEPTION 'BLOCK 8 FAIL (c): the revoke and its reason are not readable in the ledger';
  END IF;
  IF v_row.grant_id ~ '[0-9a-f]{64}' THEN
    RAISE EXCEPTION 'BLOCK 8 FAIL (d): a token-shaped value is in the ledger';
  END IF;

  RAISE NOTICE '8. spec §8 — v_access_grants carries the paperwork link as its twelfth tier, with its end date, its revoke and its reason, and no credential: passed';
END $$;

DO $$ BEGIN RAISE NOTICE 'W4 SQL suite: all blocks passed'; END $$;

ROLLBACK;
