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

-- ── a closed link is a receipt, and an expiry may not silence it (W4 r5 F1) ──
-- 00636's backfill dates every already-dead row from revoked_at, which is in
-- the past. If resolve_invoice_link tested expiry above its dead-link branch,
-- every client holding a /pay address for an invoice she has already paid (or
-- that was withdrawn) would get the generic DeadLink page on deploy day
-- instead of the K5/M10 withdrawn/settling sheet.
DO $$
DECLARE
  v_invoice uuid := 'b0000000-0000-0000-0000-00000000e142';
  v_token   text;
  v_sheet   jsonb;
BEGIN
  v_token := public.ensure_invoice_link(v_invoice);   -- revokes the expired one
  IF v_token IS NULL THEN
    RAISE EXCEPTION 'BLOCK 4c FAIL (a): no address to close';
  END IF;

  -- the shape _void_invoice_authorized leaves behind (00574:1004), dated the
  -- way 00636's backfill dates a row that was already dead when it ran
  UPDATE public.invoice_links
     SET status = 'closed',
         revoked_at = now() - interval '90 days',
         expires_at = now() - interval '90 days'
   WHERE invoice_id = v_invoice AND status = 'active';

  v_sheet := public.resolve_invoice_link(v_token, false);
  IF v_sheet IS NULL THEN
    RAISE EXCEPTION 'BLOCK 4c FAIL (b): a closed link with a backfill-shaped past expiry answered nothing — the client holding it reads DeadLink, not her receipt';
  END IF;
  IF (v_sheet->>'kind') <> 'withdrawn' THEN
    RAISE EXCEPTION 'BLOCK 4c FAIL (c): the closed link answered kind %, not withdrawn', v_sheet->>'kind';
  END IF;

  -- and the receipt is still not a pay door
  IF EXISTS (SELECT 1 FROM public.resolve_invoice_link_for_checkout(v_token)) THEN
    RAISE EXCEPTION 'BLOCK 4c FAIL (d): checkout resolved a closed link';
  END IF;

  RAISE NOTICE '4c. a closed link past its backfilled expiry still answers the withdrawn sheet, and still buys nothing: passed';
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

-- ═══════════════════════════════════════════════════════════════════════════
-- 9. ROUND-1 REVIEW FIXES — paper nobody checked is not paper the studio
--    holds, the confirm answers all four of R-AZ's legs, and the pay link's
--    end date reaches the ledger (QA-B1 / MAJOR-2, M-3, M-2, MAJOR-1)
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_firm     uuid := 'fa200000-0000-4000-8000-00000000000c';
  v_pending  uuid := 'fa700000-0000-4000-8000-00000000000d';
  v_typed    uuid := 'fa700000-0000-4000-8000-00000000000e';
BEGIN
  INSERT INTO public.studio_contacts
    (id, organization_id, entity_kind, contact_kind, company_name, company_kind, created_by)
  VALUES (v_firm, 'fa000000-0000-4000-8000-00000000000a', 'company', 'sub',
          'Paper Word Test Co', 'sub', 'a0000000-0000-0000-0000-000000000004');

  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  IF public.compliance_state(v_firm) <> 'not_on_file' THEN
    RAISE EXCEPTION 'BLOCK 9 FAIL (a): a firm holding nothing does not read not_on_file';
  END IF;
  PERFORM pg_temp.reset_role();

  -- (b) THE PENDING CASE. An in-force, GATING certificate arrives through the
  -- door and nobody has opened it: the studio holds nothing yet, and
  -- site_access may not read as satisfied on it.
  INSERT INTO public.studio_compliance_documents
    (id, organization_id, holder_type, holder_id, doc_type, blocks,
     expires_on, source, inbound)
  VALUES (v_pending, 'fa000000-0000-4000-8000-00000000000a', 'company', v_firm,
          'coi_gl', ARRAY['site_access']::text[], CURRENT_DATE + 365,
          'field_link', true);

  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  IF public.compliance_state(v_firm) <> 'not_on_file' THEN
    RAISE EXCEPTION 'BLOCK 9 FAIL (b): an unchecked upload moved the firm''s paper word to %',
      public.compliance_state(v_firm);
  END IF;
  -- and the fold every Directory row, seat line and roster row reads follows it
  IF public.identity_paper_state('fa100000-0000-4000-8000-00000000000a', v_firm)
       <> 'not_on_file' THEN
    RAISE EXCEPTION 'BLOCK 9 FAIL (b2): identity_paper_state counted the unchecked upload';
  END IF;
  PERFORM pg_temp.reset_role();

  -- (c) THE REJECTED CASE, named in its own right: a document the studio has
  -- explicitly REFUSED is not held either, and the leg that says so is written
  -- separately so a later edit cannot reopen this half alone.
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000003');
  PERFORM public.reject_inbound_document(v_pending, 'The certificate names another firm.');
  PERFORM pg_temp.reset_role();

  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  IF public.compliance_state(v_firm) <> 'not_on_file' THEN
    RAISE EXCEPTION 'BLOCK 9 FAIL (c): a REFUSED document still reads as the firm''s current paper (%)',
      public.compliance_state(v_firm);
  END IF;
  PERFORM pg_temp.reset_role();

  -- (d) The studio's own record is held the moment it is typed: the studio
  -- saying so IS the check, and useRecordComplianceDocument stamps no
  -- verified_at.
  INSERT INTO public.studio_compliance_documents
    (id, organization_id, holder_type, holder_id, doc_type, source, inbound)
  VALUES (v_typed, 'fa000000-0000-4000-8000-00000000000a', 'company', v_firm,
          'w9', 'studio', false);

  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  IF public.compliance_state(v_firm) <> 'current' THEN
    RAISE EXCEPTION 'BLOCK 9 FAIL (d): the studio''s own record stopped counting (%)',
      public.compliance_state(v_firm);
  END IF;
  PERFORM pg_temp.reset_role();

  RAISE NOTICE '9. QA-B1 / MAJOR-2 — an unchecked upload and a refused one are both absent from the firm''s paper word, on the card and through identity_paper_state, while the studio''s own record still counts: passed';
END $$;

-- ── the firm's own page says "Received" only about paper the firm sent ─────
DO $$
DECLARE
  v_firm  uuid := 'fa200000-0000-4000-8000-00000000000c';
  v_token text;
  v_docs  jsonb;
  v_row   jsonb;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  SELECT m.token INTO v_token
    FROM public.mint_paperwork_link(v_firm, now() + interval '30 days') m;
  PERFORM pg_temp.reset_role();

  v_docs := (public.resolve_paperwork_link(v_token, false))->'documents';
  SELECT d INTO v_row FROM jsonb_array_elements(v_docs) d
   WHERE d->>'doc_type' = 'w9';
  IF v_row IS NULL THEN
    RAISE EXCEPTION 'BLOCK 9b FAIL (a): the firm''s page does not carry the paper the studio holds';
  END IF;
  IF (v_row->>'awaiting_check')::boolean THEN
    RAISE EXCEPTION 'BLOCK 9b FAIL (b): the firm is told its own studio''s record "was received"';
  END IF;

  -- an inbound one, and only that one, is awaiting the studio's check
  PERFORM public.record_inbound_compliance_document(
    v_token, 'coi_gl', NULL, 'GL-55', 'Western National Test',
    CURRENT_DATE, CURRENT_DATE + 200,
    'fa000000-0000-4000-8000-00000000000a/' || v_firm::text || '/'
      || gen_random_uuid()::text || '/coi.pdf');

  v_docs := (public.resolve_paperwork_link(v_token, false))->'documents';
  SELECT d INTO v_row FROM jsonb_array_elements(v_docs) d
   WHERE d->>'doc_type' = 'coi_gl';
  IF v_row IS NULL OR NOT (v_row->>'awaiting_check')::boolean THEN
    RAISE EXCEPTION 'BLOCK 9b FAIL (c): the paper the firm just sent is not marked received';
  END IF;

  RAISE NOTICE '9b. MAJOR-1 — awaiting_check is the firm''s own upload, never the paper the studio typed itself: passed';
END $$;

-- ── one row per type, and the state IS the word (R-BU, W4 r7 MAJOR-2 / M-4) ──
-- Before this, resolve_paperwork_link computed the row's state from expires_on
-- and blocks alone and carried awaiting_check beside it as a flag. An
-- in-force certificate nobody had opened therefore read 'current' on the
-- firm's page while compliance_state read the same firm as not_on_file — two
-- surfaces, one fact, two answers. The state now says which it is, and a
-- refusal is a state too (M-4) instead of a row that silently disappears.
DO $$
DECLARE
  v_firm   uuid := 'fa200000-0000-4000-8000-00000000000c';
  v_token  text;
  v_docs   jsonb;
  v_row    jsonb;
  v_reject uuid := 'fa700000-0000-4000-8000-000000000021';
  v_pend   uuid;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  SELECT m.token INTO v_token
    FROM public.mint_paperwork_link(v_firm, now() + interval '30 days') m;
  PERFORM pg_temp.reset_role();

  -- (a) ONE ROW PER TYPE. coi_gl on this firm carries a refusal (block 9) and
  -- an unchecked upload (block 9b); the page speaks about the type once.
  v_docs := (public.resolve_paperwork_link(v_token, false))->'documents';
  IF (SELECT count(*) FROM jsonb_array_elements(v_docs) d
       WHERE d->>'doc_type' = 'coi_gl') <> 1 THEN
    RAISE EXCEPTION 'BLOCK 9c FAIL (a): coi_gl speaks % times, not once',
      (SELECT count(*) FROM jsonb_array_elements(v_docs) d WHERE d->>'doc_type' = 'coi_gl');
  END IF;

  -- (b) THE AGREEMENT. The only coi_gl paper anyone could act on is an upload
  -- nobody has opened, so the firm's page must not call it current — the word
  -- the studio's own read gives that paper is not_on_file.
  SELECT d INTO v_row FROM jsonb_array_elements(v_docs) d
   WHERE d->>'doc_type' = 'coi_gl';
  IF v_row->>'state' <> 'awaiting_check' THEN
    RAISE EXCEPTION 'BLOCK 9c FAIL (b): the firm''s page reads coi_gl as %, while the studio holds nothing of the kind',
      v_row->>'state';
  END IF;
  IF NOT (v_row->>'awaiting_check')::boolean OR v_row->>'refusal_reason' IS NOT NULL THEN
    RAISE EXCEPTION 'BLOCK 9c FAIL (b2): a fresh upload did not replace the older refusal as the type''s word';
  END IF;

  -- (c) THE CONFIRM IS WHAT MAKES IT CURRENT. A member opens the same upload
  -- and the page's word changes with the studio's.
  SELECT id INTO v_pend FROM public.studio_compliance_documents
   WHERE holder_id = v_firm AND doc_type = 'coi_gl'
     AND inbound AND verified_at IS NULL AND rejected_at IS NULL
   ORDER BY created_at DESC LIMIT 1;
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000003');
  PERFORM public.confirm_inbound_document(v_pend);
  PERFORM pg_temp.reset_role();

  v_docs := (public.resolve_paperwork_link(v_token, false))->'documents';
  SELECT d INTO v_row FROM jsonb_array_elements(v_docs) d
   WHERE d->>'doc_type' = 'coi_gl';
  IF v_row->>'state' NOT IN ('current', 'lapses_soon')
     OR (v_row->>'awaiting_check')::boolean THEN
    RAISE EXCEPTION 'BLOCK 9c FAIL (c): the confirmed certificate still reads % / awaiting %',
      v_row->>'state', v_row->>'awaiting_check';
  END IF;

  -- (d) M-4: A REFUSAL IS THE TYPE'S WORD WHEN NOTHING ELSE STANDS, and it
  -- carries the reason the studio typed. The chase is an agent draft that
  -- lands awaiting_review, so this page is the only place the firm can read it.
  INSERT INTO public.studio_compliance_documents
    (id, organization_id, holder_type, holder_id, doc_type, expires_on,
     source, inbound)
  VALUES (v_reject, 'fa000000-0000-4000-8000-00000000000a', 'company', v_firm,
          'bond', CURRENT_DATE + 100, 'field_link', true);
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000003');
  PERFORM public.reject_inbound_document(v_reject, 'The bond expired before the start date');
  PERFORM pg_temp.reset_role();

  v_docs := (public.resolve_paperwork_link(v_token, false))->'documents';
  SELECT d INTO v_row FROM jsonb_array_elements(v_docs) d
   WHERE d->>'doc_type' = 'bond';
  IF v_row IS NULL THEN
    RAISE EXCEPTION 'BLOCK 9c FAIL (d): the refused bond vanished from the firm''s page with no word';
  END IF;
  IF v_row->>'state' <> 'refused'
     OR v_row->>'refusal_reason' <> 'The bond expired before the start date'
     OR (v_row->>'awaiting_check')::boolean THEN
    RAISE EXCEPTION 'BLOCK 9c FAIL (d2): the refused bond reads % / %',
      v_row->>'state', v_row->>'refusal_reason';
  END IF;

  -- (e) and a refusal stops being the last word the moment the firm sends
  -- another of the same type.
  PERFORM public.record_inbound_compliance_document(
    v_token, 'bond', NULL, 'BOND-9', 'Western National Test',
    CURRENT_DATE, CURRENT_DATE + 300,
    'fa000000-0000-4000-8000-00000000000a/' || v_firm::text || '/'
      || gen_random_uuid()::text || '/bond.pdf');
  v_docs := (public.resolve_paperwork_link(v_token, false))->'documents';
  SELECT d INTO v_row FROM jsonb_array_elements(v_docs) d
   WHERE d->>'doc_type' = 'bond';
  IF v_row->>'state' <> 'awaiting_check' OR v_row->>'refusal_reason' IS NOT NULL THEN
    RAISE EXCEPTION 'BLOCK 9c FAIL (e): the replaced refusal is still the bond''s word (% / %)',
      v_row->>'state', v_row->>'refusal_reason';
  END IF;

  RAISE NOTICE '9b2. R-BU / M-4 — one row per doc type, awaiting_check is a state rather than a flag beside a wrong one, and a refusal reaches the firm in the studio''s own words: passed';
END $$;

-- ── the confirm answers all four of R-AZ's time-varying legs ──────────────
DO $$
DECLARE
  v_firm     uuid := 'fa200000-0000-4000-8000-00000000000d';
  v_long     uuid := 'fa700000-0000-4000-8000-000000000010';
  v_shorter  uuid := 'fa700000-0000-4000-8000-000000000011';
  v_undated  uuid := 'fa700000-0000-4000-8000-000000000012';
  v_lapsed   uuid := 'fa700000-0000-4000-8000-000000000013';
  v_state    text;
BEGIN
  INSERT INTO public.studio_contacts
    (id, organization_id, entity_kind, contact_kind, company_name, company_kind, created_by)
  VALUES (v_firm, 'fa000000-0000-4000-8000-00000000000a', 'company', 'sub',
          'Confirm Legs Test Co', 'sub', 'a0000000-0000-0000-0000-000000000004');

  -- (a) A SHORTER-DATED REPLACEMENT — the firm changes carrier mid-term. The
  -- trigger's compliance_successor_not_later was not pre-checked at all, so
  -- the confirm died on a constraint name and the pending row could never be
  -- confirmed, only refused (M-3).
  INSERT INTO public.studio_compliance_documents
    (id, organization_id, holder_type, holder_id, doc_type, blocks, expires_on,
     verified_by, verified_at)
  VALUES (v_long, 'fa000000-0000-4000-8000-00000000000a', 'company', v_firm,
          'coi_gl', ARRAY['site_access']::text[], CURRENT_DATE + 400,
          'a0000000-0000-0000-0000-000000000004', now() - interval '1 day');
  INSERT INTO public.studio_compliance_documents
    (id, organization_id, holder_type, holder_id, doc_type, blocks, expires_on,
     source, inbound)
  VALUES (v_shorter, 'fa000000-0000-4000-8000-00000000000a', 'company', v_firm,
          'coi_gl', ARRAY['site_access']::text[], CURRENT_DATE + 120,
          'field_link', true);

  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000003');
  BEGIN
    PERFORM public.confirm_inbound_document(v_shorter);
    PERFORM pg_temp.reset_role();
    RAISE EXCEPTION 'BLOCK 9c FAIL (a): a shorter-dated successor retired a longer one';
  EXCEPTION
    WHEN check_violation THEN
      IF SQLERRM NOT LIKE '%compliance_confirm_ends_sooner%' THEN
        RAISE EXCEPTION 'BLOCK 9c FAIL (a2): the refusal was %, not the pre-check''s sentence', SQLERRM;
      END IF;
  END;
  PERFORM pg_temp.reset_role();

  -- (b) A DATED PAPER OVER AN UNDATED ONE, with its date already passed. The
  -- lapsed leg only ran when the OLD row carried a date, so this one reached
  -- 00623's trigger too.
  INSERT INTO public.studio_compliance_documents
    (id, organization_id, holder_type, holder_id, doc_type, verified_by, verified_at)
  VALUES (v_undated, 'fa000000-0000-4000-8000-00000000000a', 'company', v_firm,
          'w9', 'a0000000-0000-0000-0000-000000000004', now() - interval '1 day');
  INSERT INTO public.studio_compliance_documents
    (id, organization_id, holder_type, holder_id, doc_type, expires_on, source, inbound)
  VALUES (v_lapsed, 'fa000000-0000-4000-8000-00000000000a', 'company', v_firm,
          'w9', CURRENT_DATE - 5, 'field_link', true);

  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000003');
  BEGIN
    PERFORM public.confirm_inbound_document(v_lapsed);
    PERFORM pg_temp.reset_role();
    RAISE EXCEPTION 'BLOCK 9c FAIL (b): a lapsed paper retired the undated one on file';
  EXCEPTION
    WHEN check_violation THEN
      IF SQLERRM NOT LIKE '%compliance_confirm_already_lapsed%' THEN
        RAISE EXCEPTION 'BLOCK 9c FAIL (b2): the refusal was %, not the pre-check''s sentence', SQLERRM;
      END IF;
  END;
  PERFORM pg_temp.reset_role();

  -- neither refusal stamped anything, and the paper on file is untouched
  IF EXISTS (SELECT 1 FROM public.studio_compliance_documents
              WHERE id IN (v_shorter, v_lapsed) AND verified_at IS NOT NULL)
     OR EXISTS (SELECT 1 FROM public.studio_compliance_documents
                 WHERE id IN (v_long, v_undated) AND superseded_by IS NOT NULL) THEN
    RAISE EXCEPTION 'BLOCK 9c FAIL (c): a refused confirm still wrote';
  END IF;

  -- and an honest renewal still lands
  UPDATE public.studio_compliance_documents
     SET expires_on = CURRENT_DATE + 500 WHERE id = v_shorter;
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000003');
  PERFORM public.confirm_inbound_document(v_shorter);
  PERFORM pg_temp.reset_role();
  IF NOT EXISTS (SELECT 1 FROM public.studio_compliance_documents
                  WHERE id = v_long AND superseded_by = v_shorter) THEN
    RAISE EXCEPTION 'BLOCK 9c FAIL (d): an honest renewal was not confirmed';
  END IF;

  RAISE NOTICE '9c. M-3 — the confirm answers all four supersede legs with a sentence of its own: a shorter-dated successor and a lapsed one are refused before anything is stamped, and an honest renewal still lands: passed';
END $$;

-- ── E9 reads the pay link's own end date ───────────────────────────────────
DO $$
DECLARE
  v_invoice uuid := 'b0000000-0000-0000-0000-00000000e142';   -- seeded, status 'sent'
  v_token   text;
  v_row     record;
  v_link    public.invoice_links%ROWTYPE;
BEGIN
  -- The seeded invoice's project records no studio (R-BD's legacy population),
  -- and this tier is gated on the record, so the invoice is given this test
  -- studio for the width of the transaction. What is under test is the
  -- BRANCH'S COLUMN, not its gate — w1b's suite owns the gate.
  UPDATE public.projects SET studio_id = 'fa000000-0000-4000-8000-00000000000a'
   WHERE id = (SELECT project_id FROM public.invoices WHERE id = v_invoice);

  v_token := public.ensure_invoice_link(v_invoice);
  SELECT * INTO v_link FROM public.invoice_links
   WHERE invoice_id = v_invoice AND status = 'active';

  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  SELECT * INTO v_row FROM public.v_access_grants
   WHERE tier = 'invoice_pay' AND subject_id = v_link.id;
  PERFORM pg_temp.reset_role();

  IF v_row.grant_id IS NULL THEN
    RAISE EXCEPTION 'BLOCK 9d FAIL (a): the pay link is not in the grants ledger for its own studio';
  END IF;
  IF v_row.expires_at IS DISTINCT FROM v_link.expires_at THEN
    RAISE EXCEPTION 'BLOCK 9d FAIL (b): E9 says the pay door ends % while the record says %',
      v_row.expires_at, v_link.expires_at;
  END IF;

  RAISE NOTICE '9d. M-2 — the invoice_pay tier carries the link''s own 30-day end date, not NULL: passed';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 10. A FIRM MERGE CARRIES THE PAPERWORK DOOR (W4 r3 MAJOR-3, 00629 amended)
--
-- The studio folds a duplicate firm card away. Before this fix the token stayed
-- on the absorbed card while §4e moved the documents to the survivor, so the
-- firm's own live page read `documents: []`, its next upload landed on a card
-- the survivor's queue never reads, and minting the survivor's own door left
-- two live doors for one firm identity (R-AF).
--
-- resolve_paperwork_link and record_inbound_compliance_document are
-- service-only (00637:651, :776) — the firm's browser holds no DB access — so
-- every call to them here is made with the role reset, exactly as block 5
-- does.
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO public.studio_contacts
  (id, organization_id, entity_kind, contact_kind, company_name, company_kind, created_by) VALUES
  ('fa2b0000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-00000000000a','company','sub','Northgate Electric (dup)','sub','a0000000-0000-0000-0000-000000000004'),
  ('fa2b0000-0000-4000-8000-000000000002','fa000000-0000-4000-8000-00000000000a','company','sub','Northgate Electric LLC','sub','a0000000-0000-0000-0000-000000000004');

DO $$
DECLARE
  v_dup      uuid := 'fa2b0000-0000-4000-8000-000000000001';  -- absorbed
  v_survivor uuid := 'fa2b0000-0000-4000-8000-000000000002';
  v_token    text;
  v_page     jsonb;
  v_live     int;
BEGIN
  -- The paper the studio holds, on the duplicate — the card a studio merges
  -- away is the card the door was minted on, because PR-o pre-picks the older.
  INSERT INTO public.studio_compliance_documents
    (organization_id, holder_type, holder_id, doc_type, issued_on, expires_on,
     blocks, verified_at, created_by)
  VALUES ('fa000000-0000-4000-8000-00000000000a','company', v_dup, 'coi_gl',
          CURRENT_DATE - 30, CURRENT_DATE + 300, ARRAY['site_access']::text[],
          now(), 'a0000000-0000-0000-0000-000000000004');

  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  SELECT m.token INTO v_token
    FROM public.mint_paperwork_link(v_dup, now() + interval '60 days') m;
  PERFORM pg_temp.reset_role();

  IF jsonb_array_length((public.resolve_paperwork_link(v_token))->'documents') = 0 THEN
    RAISE EXCEPTION 'BLOCK 10 FAIL (a): the firm''s page held no paper before the merge';
  END IF;

  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  PERFORM public.merge_studio_contacts(v_survivor, v_dup, 'company_name');
  PERFORM pg_temp.reset_role();

  -- 1. the token names the SURVIVOR, and is still live
  IF NOT EXISTS (
    SELECT 1 FROM public.paperwork_link_tokens
     WHERE token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex')
       AND company_id = v_survivor
       AND organization_id = 'fa000000-0000-4000-8000-00000000000a'
       AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'BLOCK 10 FAIL (b): the live door still names the card the studio folded away';
  END IF;

  -- 2. the firm's own page still lists the paper that moved with it
  v_page := public.resolve_paperwork_link(v_token);
  IF v_page IS NULL OR jsonb_array_length(v_page->'documents') = 0 THEN
    RAISE EXCEPTION 'BLOCK 10 FAIL (c): the firm is told the studio holds none of its paper';
  END IF;
  IF v_page->>'company_name' <> 'Northgate Electric LLC' THEN
    RAISE EXCEPTION 'BLOCK 10 FAIL (d): the door names % after the fold', v_page->>'company_name';
  END IF;

  -- 3. an upload through that same live link lands on the SURVIVOR's queue
  PERFORM public.record_inbound_compliance_document(
    p_token     => v_token,
    p_doc_type  => 'w9',
    p_file_path => 'compliance-documents/w9-after-merge.pdf');

  IF NOT EXISTS (
    SELECT 1 FROM public.studio_compliance_documents
     WHERE holder_id = v_survivor AND inbound IS TRUE
       AND verified_at IS NULL AND rejected_at IS NULL
  ) THEN
    RAISE EXCEPTION 'BLOCK 10 FAIL (e): the firm''s upload landed where the survivor''s band never looks';
  END IF;
  IF EXISTS (SELECT 1 FROM public.studio_compliance_documents WHERE holder_id = v_dup) THEN
    RAISE EXCEPTION 'BLOCK 10 FAIL (f): paper is still held by the absorbed card';
  END IF;

  -- 4. R-AF: exactly one live door for the firm identity
  SELECT count(*) INTO v_live FROM public.paperwork_link_tokens
   WHERE company_id IN (v_dup, v_survivor) AND status = 'active';
  IF v_live <> 1 THEN
    RAISE EXCEPTION 'BLOCK 10 FAIL (g): % live doors for one firm identity', v_live;
  END IF;

  RAISE NOTICE '10. W4 r3 MAJOR-3 — a firm merge carries the paperwork door: the token names the survivor, the firm''s page still lists its paper, its next upload lands on the survivor''s queue, and one door stays live: passed';
END $$;

-- ── the survivor already holds a door, and the sole-proprietor fold ────────
DO $$
DECLARE
  v_dup      uuid := 'fa2b0000-0000-4000-8000-000000000003';
  v_survivor uuid := 'fa2b0000-0000-4000-8000-000000000004';
  v_person   uuid := 'fa1b0000-0000-4000-8000-000000000001';
  v_firm     uuid := 'fa2b0000-0000-4000-8000-000000000005';
  v_dup_tok  text;
  v_surv_tok text;
  v_firm_tok text;
  v_live     int;
  v_reason   text;
BEGIN
  INSERT INTO public.studio_contacts
    (id, organization_id, entity_kind, contact_kind, company_name, company_kind, created_by) VALUES
    (v_dup,'fa000000-0000-4000-8000-00000000000a','company','sub','Bauer Tile (dup)','sub','a0000000-0000-0000-0000-000000000004'),
    (v_survivor,'fa000000-0000-4000-8000-00000000000a','company','sub','Bauer Tile Co','sub','a0000000-0000-0000-0000-000000000004'),
    (v_firm,'fa000000-0000-4000-8000-00000000000a','company','sub','Kowalski Tile','sub','a0000000-0000-0000-0000-000000000004');
  INSERT INTO public.studio_contacts
    (id, organization_id, entity_kind, contact_kind, full_name, is_sole_proprietor, created_by) VALUES
    (v_person,'fa000000-0000-4000-8000-00000000000a','person','sub','Dana Kowalski', true,'a0000000-0000-0000-0000-000000000004');

  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  SELECT m.token INTO v_dup_tok
    FROM public.mint_paperwork_link(v_dup, now() + interval '60 days') m;
  SELECT m.token INTO v_surv_tok
    FROM public.mint_paperwork_link(v_survivor, now() + interval '60 days') m;

  -- BOTH cards hold a live door. R-AF says the survivor keeps exactly one.
  PERFORM public.merge_studio_contacts(v_survivor, v_dup, 'company_name');

  SELECT count(*) INTO v_live FROM public.paperwork_link_tokens
   WHERE company_id = v_survivor AND status = 'active';
  IF v_live <> 1 THEN
    RAISE EXCEPTION 'BLOCK 10b FAIL (a): % live doors on the survivor', v_live;
  END IF;

  SELECT t.revoke_reason INTO v_reason FROM public.paperwork_link_tokens t
   WHERE t.token_hash = encode(extensions.digest(v_dup_tok, 'sha256'), 'hex');
  IF v_reason IS DISTINCT FROM 'The firm was merged into another card.' THEN
    RAISE EXCEPTION 'BLOCK 10b FAIL (b): the closed door gives the reason %', COALESCE(v_reason, '<null>');
  END IF;

  -- The sole-proprietor fold: the firm IS the person, and a paperwork link is
  -- a firm's door and never a person's — so it is closed, not repointed, and
  -- the fold itself still lands rather than aborting on a schema token.
  SELECT m.token INTO v_firm_tok
    FROM public.mint_paperwork_link(v_firm, now() + interval '60 days') m;
  PERFORM public.merge_studio_contacts(v_person, v_firm, 'company_name');
  IF EXISTS (SELECT 1 FROM public.paperwork_link_tokens
              WHERE company_id = v_firm AND status = 'active') THEN
    RAISE EXCEPTION 'BLOCK 10b FAIL (c): a folded sole proprietor''s firm still holds a live door';
  END IF;
  PERFORM pg_temp.reset_role();

  IF public.resolve_paperwork_link(v_dup_tok) IS NOT NULL THEN
    RAISE EXCEPTION 'BLOCK 10b FAIL (d): the absorbed card''s address is still a live door';
  END IF;
  IF public.resolve_paperwork_link(v_surv_tok) IS NULL THEN
    RAISE EXCEPTION 'BLOCK 10b FAIL (e): the survivor''s own door was closed by the fold';
  END IF;
  IF public.resolve_paperwork_link(v_firm_tok) IS NOT NULL THEN
    RAISE EXCEPTION 'BLOCK 10b FAIL (f): the folded firm''s address still answers';
  END IF;

  RAISE NOTICE '10b. R-AF across a fold — the survivor keeps exactly one live door with the absorbed one closed by reason, and a sole-proprietor fold closes the firm''s door rather than aborting: passed';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 11. AN other_named PAPER IS ITS NAME, NOT ITS TYPE (W4 r9 MAJOR-1)
-- ═══════════════════════════════════════════════════════════════════════════
-- resolve_paperwork_link keys an other_named document by
-- 'other_named:' || lower(doc_label), so the firm's page owes a Safety plan
-- and a Resale certificate separately. confirm_inbound_document picked its
-- predecessor by (holder, org, doc_type) alone, so confirming the one retired
-- the other — and when the mis-picked predecessor held a gate the new paper
-- did not, R-AZ's pre-check refused the confirm outright, leaving the firm's
-- paper confirmable by nobody. record_inbound_compliance_document inherited
-- the studio's gates the same doc_type-only way.
DO $$
DECLARE
  v_firm     uuid := 'fa2c0000-0000-4000-8000-000000000001';
  v_resale   uuid := 'fa7c0000-0000-4000-8000-000000000001';
  v_safety   uuid := 'fa7c0000-0000-4000-8000-000000000002';
  v_token    text;
  v_new_safe uuid;
  v_new_res  uuid;
  v_blocks   text[];
  v_page     jsonb;
BEGIN
  INSERT INTO public.studio_contacts
    (id, organization_id, entity_kind, contact_kind, company_name, company_kind, created_by)
  VALUES (v_firm, 'fa000000-0000-4000-8000-00000000000a', 'company', 'sub',
          'Named Paper Test Co', 'sub', 'a0000000-0000-0000-0000-000000000004');

  -- two DIFFERENT named papers the studio has confirmed, with different gates
  INSERT INTO public.studio_compliance_documents
    (id, organization_id, holder_type, holder_id, doc_type, doc_label, blocks,
     issued_on, expires_on, verified_by, verified_at)
  VALUES
    (v_resale, 'fa000000-0000-4000-8000-00000000000a', 'company', v_firm,
     'other_named', 'Resale certificate', ARRAY['payment']::text[],
     CURRENT_DATE - 100, CURRENT_DATE + 200,
     'a0000000-0000-0000-0000-000000000004', now() - interval '20 days'),
    (v_safety, 'fa000000-0000-4000-8000-00000000000a', 'company', v_firm,
     'other_named', 'Safety plan', ARRAY['site_access']::text[],
     CURRENT_DATE - 100, CURRENT_DATE + 100,
     'a0000000-0000-0000-0000-000000000004', now() - interval '10 days');

  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  SELECT m.token INTO v_token
    FROM public.mint_paperwork_link(v_firm, now() + interval '60 days') m;
  PERFORM pg_temp.reset_role();

  -- (a) the gates a renewal inherits come from the paper of the SAME NAME,
  --     case-folded exactly as the page folds it
  v_new_safe := public.record_inbound_compliance_document(
    v_token, 'other_named', 'SAFETY PLAN', NULL, NULL,
    CURRENT_DATE, CURRENT_DATE + 400, NULL);
  SELECT blocks INTO v_blocks FROM public.studio_compliance_documents WHERE id = v_new_safe;
  IF v_blocks IS DISTINCT FROM ARRAY['site_access']::text[] THEN
    RAISE EXCEPTION 'BLOCK 11 FAIL (a): the new Safety plan inherited % — the gates of another named paper', v_blocks;
  END IF;

  v_new_res := public.record_inbound_compliance_document(
    v_token, 'other_named', 'resale certificate', NULL, NULL,
    CURRENT_DATE, CURRENT_DATE + 400, NULL);
  SELECT blocks INTO v_blocks FROM public.studio_compliance_documents WHERE id = v_new_res;
  IF v_blocks IS DISTINCT FROM ARRAY['payment']::text[] THEN
    RAISE EXCEPTION 'BLOCK 11 FAIL (b): the new Resale certificate inherited %', v_blocks;
  END IF;

  -- (b) the confirm lands rather than being refused against a paper that has
  --     nothing to do with it (the face-2 inert act), and retires ONLY the
  --     paper of the same name
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000003');
  PERFORM public.confirm_inbound_document(v_new_safe);
  PERFORM pg_temp.reset_role();

  IF NOT EXISTS (SELECT 1 FROM public.studio_compliance_documents
                  WHERE id = v_safety AND superseded_by = v_new_safe) THEN
    RAISE EXCEPTION 'BLOCK 11 FAIL (c): the Safety plan on file was not retired by its own renewal';
  END IF;
  IF EXISTS (SELECT 1 FROM public.studio_compliance_documents
              WHERE id = v_resale AND superseded_by IS NOT NULL) THEN
    RAISE EXCEPTION 'BLOCK 11 FAIL (d): confirming a Safety plan retired the firm''s Resale certificate';
  END IF;

  -- (c) and the other named paper still confirms on its own account
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000003');
  PERFORM public.confirm_inbound_document(v_new_res);
  PERFORM pg_temp.reset_role();

  IF NOT EXISTS (SELECT 1 FROM public.studio_compliance_documents
                  WHERE id = v_resale AND superseded_by = v_new_res) THEN
    RAISE EXCEPTION 'BLOCK 11 FAIL (e): the Resale certificate was not retired by its own renewal';
  END IF;
  IF EXISTS (SELECT 1 FROM public.studio_compliance_documents
              WHERE id = v_new_safe AND superseded_by IS NOT NULL) THEN
    RAISE EXCEPTION 'BLOCK 11 FAIL (f): confirming a Resale certificate retired the Safety plan';
  END IF;

  -- (d) the firm's page and the studio's book agree: two named papers, both
  --     standing, neither awaiting a check
  v_page := public.resolve_paperwork_link(v_token, false);
  IF (SELECT count(*) FROM jsonb_array_elements(v_page->'documents') d
       WHERE (d->>'state') = 'current') <> 2 THEN
    RAISE EXCEPTION 'BLOCK 11 FAIL (g): the firm''s page reads % — not two current named papers', v_page->'documents';
  END IF;

  RAISE NOTICE '11. W4 r9 MAJOR-1 — an other_named paper supersedes and inherits gates by its own case-folded name: a Safety plan no longer retires a Resale certificate, and no longer has to be refused for failing to carry its gates: passed';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 12. THE RECEIPT LETTER MAY NOT REVOKE THE ADDRESS THE PAYER IS RETURNING TO
--     (W4 r9 BLOCKING-1)
-- ═══════════════════════════════════════════════════════════════════════════
-- settle_invoice_checkout_payment stamps the payment succeeded and 00428's
-- sync trigger mirrors that onto the attempt in the same statement, so by the
-- time stripe-webhook asks for the receipt's address the in-flight guard is
-- already down. It used to revoke the link the payer was standing on and mint
-- a replacement: the return nonce then resolved to nothing and a client who
-- had just paid was sent to /pay/dead.
DO $$
DECLARE
  v_invoice uuid := 'b0000000-0000-0000-0000-00000000e142';
  v_token   text;
  v_link    uuid;
  v_hash    text;
  v_nonce   text := repeat('a', 64);
  v_nonce2  text := repeat('b', 64);
  v_answer  jsonb;
  v_after   text;
  v_link2   uuid;
BEGIN
  v_token := public.ensure_invoice_link(v_invoice);
  SELECT id, token_hash INTO v_link, v_hash
    FROM public.invoice_links WHERE invoice_id = v_invoice AND status = 'active';

  -- the payer came through the /pay door, paid, and Stripe has settled
  INSERT INTO public.invoice_checkout_attempts
    (invoice_id, payer_id, invoice_link_id, stripe_customer_id, amount_cents,
     currency, state, stripe_idempotency_key, stripe_checkout_session_id,
     return_nonce, nonce_return_origin, finalized_at)
  VALUES (v_invoice, NULL, v_link, 'cus_w4r9_test', 12345, 'usd', 'succeeded',
          'idem_w4r9_test_1', 'cs_w4r9_test_1', v_nonce,
          'https://client.patina.cloud', now());

  -- the receipt letter asks for an address and is told there is none to carry
  IF public.ensure_invoice_link(v_invoice) IS NOT NULL THEN
    RAISE EXCEPTION 'BLOCK 12 FAIL (a): the receipt letter minted a fresh address inside the return window';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.invoice_links
                  WHERE id = v_link AND status = 'active' AND token_hash = v_hash) THEN
    RAISE EXCEPTION 'BLOCK 12 FAIL (b): the address the payer is standing on was revoked under her';
  END IF;
  IF public.resolve_invoice_link(v_token, false) IS NULL THEN
    RAISE EXCEPTION 'BLOCK 12 FAIL (c): the payer''s own /pay address stopped opening';
  END IF;

  -- and the return still lands on her sheet, re-addressed once
  v_answer := public.resolve_invoice_return_nonce(v_nonce);
  IF v_answer IS NULL OR (v_answer->>'state') <> 'rotated' THEN
    RAISE EXCEPTION 'BLOCK 12 FAIL (d): the return nonce answered % — the payer lands on /pay/dead', COALESCE(v_answer::text, '<null>');
  END IF;
  v_after := v_answer->>'token';
  IF public.resolve_invoice_link(v_after, false) IS NULL THEN
    RAISE EXCEPTION 'BLOCK 12 FAIL (e): the address the return handed the payer does not open';
  END IF;
  IF (public.resolve_invoice_return_nonce(v_nonce)->>'state') <> 'spent' THEN
    RAISE EXCEPTION 'BLOCK 12 FAIL (f): a replayed nonce rotated something (R-BT)';
  END IF;

  -- NEGATIVE CONTROL: a day later the letter rotates as it always did
  UPDATE public.invoice_checkout_attempts
     SET finalized_at = now() - interval '48 hours',
         updated_at   = now() - interval '48 hours'
   WHERE stripe_idempotency_key = 'idem_w4r9_test_1';
  IF public.ensure_invoice_link(v_invoice) IS NULL THEN
    RAISE EXCEPTION 'BLOCK 12 FAIL (g): the guard never lifts, so no later letter can carry an address';
  END IF;

  -- AND F2 IS UNTOUCHED: a nonce whose link a Regenerate revoked is still
  -- dead, because a nonce may never alias a token minted after its attempt.
  -- That is why the LETTER had to stop revoking rather than the return
  -- learning to follow a later mint.
  SELECT id INTO v_link2 FROM public.invoice_links
   WHERE invoice_id = v_invoice AND status = 'active';
  INSERT INTO public.invoice_checkout_attempts
    (invoice_id, payer_id, invoice_link_id, stripe_customer_id, amount_cents,
     currency, state, stripe_idempotency_key, stripe_checkout_session_id,
     return_nonce, nonce_return_origin, created_at, finalized_at)
  VALUES (v_invoice, NULL, v_link2, 'cus_w4r9_test', 12345, 'usd', 'expired',
          'idem_w4r9_test_2', 'cs_w4r9_test_2', v_nonce2,
          'https://client.patina.cloud',
          now() - interval '49 hours', now() - interval '48 hours');
  PERFORM public.ensure_invoice_link(v_invoice);   -- a later letter revokes v_link2
  IF EXISTS (SELECT 1 FROM public.invoice_links WHERE id = v_link2 AND status = 'active') THEN
    RAISE EXCEPTION 'BLOCK 12 FAIL (h): the fixture did not revoke the claimed link';
  END IF;
  IF public.resolve_invoice_return_nonce(v_nonce2) IS NOT NULL THEN
    RAISE EXCEPTION 'BLOCK 12 FAIL (i): a nonce became an alias for a token minted after its attempt (F2)';
  END IF;

  RAISE NOTICE '12. W4 r9 BLOCKING-1 — a link-borne Checkout owns its address through the return window: the receipt letter holds rather than revoking, the return nonce still lands on the payer''s sheet, a day later the letter rotates again, and F2''s revoked-link silence is untouched: passed';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 13. W4 r10 BLOCKING-1 / MAJOR-1 — THE GUARD READS THE RETURN ORIGIN, NOT
--     THE ACTOR COLUMN (R-BZ)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Block 12 proved the LINK-borne rail. The r9 fix was written as
-- `invoice_link_id IS NOT NULL`, and chk_invoice_attempt_actor makes an
-- attempt either link-borne or payer-borne and never both — so the guard never
-- fired on the rail that actually carries a signed-in client through Stripe.
-- create-checkout-session claims with payer_id and STILL rides
-- /pay/return/<nonce> whenever the invoice has a live link. The moment the
-- webhook wrote 'succeeded' the next letter rotated the token the client was
-- holding: the nonce resolved to nothing, /pay/return/<nonce> 303'd to
-- /pay/dead, and the retry read "this link was already used", which was false.
--
-- One fact decides it now: nonce_return_origin, read in exactly one place —
-- public.invoice_letter_must_hold, which is what ensure_invoice_link asks and
-- what invoice-send and invoice-reminders ask.
DO $$
DECLARE
  v_invoice uuid := 'b0000000-0000-0000-0000-00000000e142';
  v_payer   uuid;
  v_token   text;
  v_link    uuid;
  v_hash    text;
  v_nonce   text := repeat('c', 64);
  v_nonce2  text := repeat('d', 64);
  v_answer  jsonb;
BEGIN
  -- Clear block 12's attempts so this block reasons about its own rows only.
  DELETE FROM public.invoice_checkout_attempts WHERE invoice_id = v_invoice;

  SELECT COALESCE(i.client_id, p.client_id) INTO v_payer
    FROM public.invoices i
    LEFT JOIN public.projects p ON p.id = i.project_id
   WHERE i.id = v_invoice;
  IF v_payer IS NULL THEN
    RAISE EXCEPTION 'BLOCK 13 FAIL (setup): the fixture invoice has no payer';
  END IF;

  v_token := public.ensure_invoice_link(v_invoice);
  SELECT id, token_hash INTO v_link, v_hash
    FROM public.invoice_links WHERE invoice_id = v_invoice AND status = 'active';

  -- A SIGNED-IN payer paid, and her return rode the nonce because the invoice
  -- had a live link when she started (create-checkout-session stamps the
  -- origin at claim time). invoice_link_id is NULL — the actor column says
  -- "payer", the fact says "the link is load-bearing".
  INSERT INTO public.invoice_checkout_attempts
    (invoice_id, payer_id, invoice_link_id, stripe_customer_id, amount_cents,
     currency, state, stripe_idempotency_key, stripe_checkout_session_id,
     return_nonce, nonce_return_origin, finalized_at)
  VALUES (v_invoice, v_payer, NULL, 'cus_w4r10_test', 12345, 'usd', 'succeeded',
          'idem_w4r10_test_1', 'cs_w4r10_test_1', v_nonce,
          'https://client.patina.cloud', now());

  IF NOT public.invoice_letter_must_hold(v_invoice) THEN
    RAISE EXCEPTION 'BLOCK 13 FAIL (a): the predicate does not hold for a payer-borne attempt that rode the nonce';
  END IF;
  IF public.ensure_invoice_link(v_invoice) IS NOT NULL THEN
    RAISE EXCEPTION 'BLOCK 13 FAIL (b): the receipt letter rotated the token the payer is holding';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.invoice_links
                  WHERE id = v_link AND status = 'active' AND token_hash = v_hash) THEN
    RAISE EXCEPTION 'BLOCK 13 FAIL (c): the payer''s address was revoked under her';
  END IF;
  IF public.resolve_invoice_link(v_token, false) IS NULL THEN
    RAISE EXCEPTION 'BLOCK 13 FAIL (d): the payer''s own /pay address stopped opening';
  END IF;

  v_answer := public.resolve_invoice_return_nonce(v_nonce);
  IF v_answer IS NULL OR (v_answer->>'state') <> 'rotated' THEN
    RAISE EXCEPTION 'BLOCK 13 FAIL (e): the payer''s return answered % — she lands on /pay/dead', COALESCE(v_answer::text, '<null>');
  END IF;
  IF public.resolve_invoice_link(v_answer->>'token', false) IS NULL THEN
    RAISE EXCEPTION 'BLOCK 13 FAIL (f): the address the return handed the payer does not open';
  END IF;

  -- THE BATCHED PREDICATE IS THE SAME PREDICATE (invoice-reminders' scan).
  IF NOT EXISTS (
    SELECT 1 FROM public.invoice_letters_must_hold(ARRAY[v_invoice]) AS held
     WHERE held = v_invoice
  ) THEN
    RAISE EXCEPTION 'BLOCK 13 FAIL (g): the batched predicate disagrees with the scalar one';
  END IF;

  -- NEGATIVE CONTROL 1: a payer-borne attempt whose return NEVER rode the
  -- nonce (no live link when she started) holds nothing — the letters are free
  -- to mint, which is the behaviour the actor-column reading got right.
  DELETE FROM public.invoice_checkout_attempts WHERE invoice_id = v_invoice;
  INSERT INTO public.invoice_checkout_attempts
    (invoice_id, payer_id, invoice_link_id, stripe_customer_id, amount_cents,
     currency, state, stripe_idempotency_key, stripe_checkout_session_id,
     return_nonce, nonce_return_origin, finalized_at)
  VALUES (v_invoice, v_payer, NULL, 'cus_w4r10_test', 12345, 'usd', 'succeeded',
          'idem_w4r10_test_2', 'cs_w4r10_test_2', v_nonce2, NULL, now());

  IF public.invoice_letter_must_hold(v_invoice) THEN
    RAISE EXCEPTION 'BLOCK 13 FAIL (h): a return that never rode the nonce still holds the letter';
  END IF;
  IF public.ensure_invoice_link(v_invoice) IS NULL THEN
    RAISE EXCEPTION 'BLOCK 13 FAIL (i): the letter has no address although nothing is load-bearing';
  END IF;
  -- And its nonce rotates nothing, because Stripe was never given it as an
  -- address: the replay is readable ('spent'), never a rotation.
  IF public.resolve_invoice_return_nonce(v_nonce2) IS NOT NULL
     AND (public.resolve_invoice_return_nonce(v_nonce2)->>'state') = 'rotated' THEN
    RAISE EXCEPTION 'BLOCK 13 FAIL (j): a nonce that never addressed anything rotated a link';
  END IF;

  -- NEGATIVE CONTROL 2: the in-flight leg is untouched by any of this.
  DELETE FROM public.invoice_checkout_attempts WHERE invoice_id = v_invoice;
  INSERT INTO public.invoice_checkout_attempts
    (invoice_id, payer_id, invoice_link_id, stripe_customer_id, amount_cents,
     currency, state, stripe_idempotency_key, return_nonce, nonce_return_origin)
  VALUES (v_invoice, v_payer, NULL, 'cus_w4r10_test', 12345, 'usd', 'claimed',
          'idem_w4r10_test_3', repeat('e', 64), NULL);
  IF NOT public.invoice_letter_must_hold(v_invoice) THEN
    RAISE EXCEPTION 'BLOCK 13 FAIL (k): a Checkout in flight no longer holds the letter';
  END IF;

  -- THE STAMP IS THE ONLY DOOR ONTO THE FACT, and it is closed to a finalized
  -- attempt: an origin can never be back-dated onto a flight that is over.
  IF NOT public.stamp_invoice_checkout_return_origin(
       (SELECT id FROM public.invoice_checkout_attempts
         WHERE stripe_idempotency_key = 'idem_w4r10_test_3'),
       'https://client.patina.cloud') THEN
    RAISE EXCEPTION 'BLOCK 13 FAIL (l): the driver could not stamp a live attempt';
  END IF;
  UPDATE public.invoice_checkout_attempts
     SET state = 'failed', finalized_at = now(), nonce_return_origin = NULL
   WHERE stripe_idempotency_key = 'idem_w4r10_test_3';
  IF public.stamp_invoice_checkout_return_origin(
       (SELECT id FROM public.invoice_checkout_attempts
         WHERE stripe_idempotency_key = 'idem_w4r10_test_3'),
       'https://client.patina.cloud') THEN
    RAISE EXCEPTION 'BLOCK 13 FAIL (m): a closed flight accepted a return-origin stamp';
  END IF;

  RAISE NOTICE '13. W4 r10 BLOCKING-1/MAJOR-1 — the mint guard reads nonce_return_origin, not the actor column: a signed-in payer''s address survives her own receipt, her return still lands, the batched predicate agrees, and neither a nonce-less return nor a closed flight can move it: passed';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 14. W4 r10 MAJOR-2 — THE ANONYMOUS DOOR'S BUCKET CANNOT BE SWITCHED OFF
--     BY A HEADER (R-CA)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- paperwork_link_rate_limit_hit took `p_ip inet` on a door whose caller writes
-- the address. `not-an-ip` and the ordinary proxy value `1.2.3.4:5678` both
-- raised 22P02; PostgREST returned it as an error; the edge function's
-- `if (error) return true` read that as "within limit". One header disabled
-- upload-door-spec §2's bucket. The parameter is text now, every unparsable
-- value falls to the next key rather than raising, and a caller with NO
-- address is bucketed by the link's own row id — never left unbucketed.
DO $$
DECLARE
  v_token  text;
  v_id     uuid;
  v_key    text;
  v_hits   integer;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  SELECT m.id, m.token INTO v_id, v_token
    FROM public.mint_paperwork_link('fa200000-0000-4000-8000-00000000000a') m;
  PERFORM pg_temp.reset_role();

  DELETE FROM public.paperwork_link_rate_limits;

  -- (a) A malformed address does not raise, and does not vanish either.
  IF NOT public.paperwork_link_rate_limit_hit('not-an-ip', v_token) THEN
    RAISE EXCEPTION 'BLOCK 14 FAIL (a): a first attempt was refused';
  END IF;
  SELECT bucket_key INTO v_key FROM public.paperwork_link_rate_limits;
  IF v_key <> 'link:' || v_id::text THEN
    RAISE EXCEPTION 'BLOCK 14 FAIL (b): a malformed address bucketed as %, not by the link', v_key;
  END IF;

  -- (c) An ip:port value is an address with a port, and the edge strips it;
  --     even if one reached here it buckets rather than raising.
  DELETE FROM public.paperwork_link_rate_limits;
  PERFORM public.paperwork_link_rate_limit_hit('1.2.3.4:5678', v_token);
  IF NOT EXISTS (SELECT 1 FROM public.paperwork_link_rate_limits) THEN
    RAISE EXCEPTION 'BLOCK 14 FAIL (c): an ip:port value bucketed nothing';
  END IF;

  -- (d) No address and no token at all still lands in a bucket.
  DELETE FROM public.paperwork_link_rate_limits;
  PERFORM public.paperwork_link_rate_limit_hit(NULL, NULL);
  IF NOT EXISTS (SELECT 1 FROM public.paperwork_link_rate_limits WHERE bucket_key = 'anon') THEN
    RAISE EXCEPTION 'BLOCK 14 FAIL (d): a caller with nothing to key on was left unbucketed';
  END IF;

  -- (e) A real address buckets by address, and the limit still bites — one
  --     bucket across both the resolve and the upload (spec §2).
  DELETE FROM public.paperwork_link_rate_limits;
  FOR v_hits IN 1..20 LOOP
    IF NOT public.paperwork_link_rate_limit_hit('203.0.113.9', v_token) THEN
      RAISE EXCEPTION 'BLOCK 14 FAIL (e): attempt % of 20 was refused', v_hits;
    END IF;
  END LOOP;
  IF public.paperwork_link_rate_limit_hit('203.0.113.9', v_token) THEN
    RAISE EXCEPTION 'BLOCK 14 FAIL (f): the 21st attempt in the minute was allowed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.paperwork_link_rate_limits
                  WHERE bucket_key = 'ip:203.0.113.9') THEN
    RAISE EXCEPTION 'BLOCK 14 FAIL (g): a valid address did not bucket by address';
  END IF;

  -- (h) An unknown token with no address is the SAME answer as a real one —
  --     the fallback is not an oracle for whether a token exists.
  DELETE FROM public.paperwork_link_rate_limits;
  IF NOT public.paperwork_link_rate_limit_hit(NULL, repeat('9', 64)) THEN
    RAISE EXCEPTION 'BLOCK 14 FAIL (h): an unknown token read differently from a real one';
  END IF;

  RAISE NOTICE '14. W4 r10 MAJOR-2 — the paperwork bucket is keyed by text and never raises on a caller-written address: a malformed header buckets by the link, an ip:port value buckets, a caller with nothing to key on lands in the shared bucket, and the limit still bites at 20: passed';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 15. W4 r11 MAJOR-2 — THE BUCKET IS NOT AN EXISTENCE ORACLE FOR THE TOKEN
-- ═══════════════════════════════════════════════════════════════════════════
--
-- The first shape of the ladder was ip → link → one shared `anon` key, and the
-- `link:` lookup carried NO liveness predicate. A revoked or expired token
-- therefore still resolved to its own private bucket while everything
-- unresolved shared `anon`. Probe P9: an address-less caller (which
-- `cf-connecting-ip` and `x-forwarded-for` both allow, being caller-written)
-- spent `anon` with twenty junk knocks, after which a 64-hex value that had
-- never been minted answered 429 while a 64-hex value that had been minted and
-- since died answered "within limit". That is precisely what upload-door-spec
-- acceptance 4 forbids the door to say: "neither path reveals whether the
-- token once existed."
--
-- Now: the `link:` branch carries the resolvers' own liveness predicate, and a
-- well-formed token that resolves to no live link is bucketed by its OWN
-- sha256 — the value already stored at rest. A dead token and a never-minted
-- one get identical private buckets and identical answers, and no well-formed
-- token can spend a bucket another caller depends on.
DO $$
DECLARE
  v_live_id uuid;  v_live text;
  v_dead_id uuid;  v_dead text;
  v_exp_id  uuid;  v_exp  text;
  v_unknown text := repeat('a', 64);
  v_i       integer;
  v_a       boolean;
  v_b       boolean;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  -- One firm holds ONE live door (R-AF), so a re-mint revokes the first
  -- address: that is how a genuinely revoked token is made here.
  SELECT m.id, m.token INTO v_dead_id, v_dead
    FROM public.mint_paperwork_link('fa200000-0000-4000-8000-00000000000a') m;
  SELECT m.id, m.token INTO v_live_id, v_live
    FROM public.mint_paperwork_link('fa200000-0000-4000-8000-00000000000a') m;
  -- The second firm has no engagement window, so the studio names the date
  -- (R-AD); it is then time-travelled past, the one state a mint refuses.
  SELECT m.id, m.token INTO v_exp_id, v_exp
    FROM public.mint_paperwork_link('fa200000-0000-4000-8000-00000000000b',
                                    now() + interval '30 days') m;
  PERFORM pg_temp.reset_role();

  UPDATE public.paperwork_link_tokens
     SET expires_at = now() - interval '1 day'
   WHERE id = v_exp_id;

  IF (SELECT status FROM public.paperwork_link_tokens WHERE id = v_dead_id) <> 'revoked' THEN
    RAISE EXCEPTION 'BLOCK 15 SETUP: the re-mint did not revoke the first address';
  END IF;

  -- (a) A LIVE token with no address still buckets by the link's own row id,
  --     which is R-CA's requirement and is unchanged.
  DELETE FROM public.paperwork_link_rate_limits;
  PERFORM public.paperwork_link_rate_limit_hit(NULL, v_live);
  IF NOT EXISTS (SELECT 1 FROM public.paperwork_link_rate_limits
                  WHERE bucket_key = 'link:' || v_live_id::text) THEN
    RAISE EXCEPTION 'BLOCK 15 FAIL (a): a live token did not bucket by its link';
  END IF;

  -- (b) A REVOKED token reaches no link bucket at all …
  DELETE FROM public.paperwork_link_rate_limits;
  PERFORM public.paperwork_link_rate_limit_hit(NULL, v_dead);
  IF EXISTS (SELECT 1 FROM public.paperwork_link_rate_limits
              WHERE bucket_key = 'link:' || v_dead_id::text) THEN
    RAISE EXCEPTION 'BLOCK 15 FAIL (b): a revoked token still resolved to its own link bucket';
  END IF;
  -- … and lands in a bucket of its own hash instead.
  IF NOT EXISTS (SELECT 1 FROM public.paperwork_link_rate_limits
                  WHERE bucket_key = 'tok:' || encode(extensions.digest(v_dead, 'sha256'), 'hex')) THEN
    RAISE EXCEPTION 'BLOCK 15 FAIL (c): a revoked token was not bucketed by its own hash';
  END IF;

  -- (d) An EXPIRED token reads exactly the same way.
  DELETE FROM public.paperwork_link_rate_limits;
  PERFORM public.paperwork_link_rate_limit_hit(NULL, v_exp);
  IF EXISTS (SELECT 1 FROM public.paperwork_link_rate_limits
              WHERE bucket_key = 'link:' || v_exp_id::text) THEN
    RAISE EXCEPTION 'BLOCK 15 FAIL (d): an expired token still resolved to its own link bucket';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.paperwork_link_rate_limits
                  WHERE bucket_key = 'tok:' || encode(extensions.digest(v_exp, 'sha256'), 'hex')) THEN
    RAISE EXCEPTION 'BLOCK 15 FAIL (e): an expired token was not bucketed by its own hash';
  END IF;

  -- (f) A never-minted token takes the same key shape — the two are one
  --     population now, which is the whole point.
  DELETE FROM public.paperwork_link_rate_limits;
  PERFORM public.paperwork_link_rate_limit_hit(NULL, v_unknown);
  IF NOT EXISTS (SELECT 1 FROM public.paperwork_link_rate_limits
                  WHERE bucket_key = 'tok:' || encode(extensions.digest(v_unknown, 'sha256'), 'hex')) THEN
    RAISE EXCEPTION 'BLOCK 15 FAIL (f): an unminted token was not bucketed by its own hash';
  END IF;

  -- (g) PROBE P9, REPLAYED. Twenty-one junk knocks from twenty-one distinct
  --     never-minted tokens no longer saturate anything shared: each one has
  --     its own bucket, so none is refused and `anon` is never touched.
  DELETE FROM public.paperwork_link_rate_limits;
  FOR v_i IN 1..21 LOOP
    IF NOT public.paperwork_link_rate_limit_hit(NULL, lpad(to_hex(v_i), 64, '0')) THEN
      RAISE EXCEPTION 'BLOCK 15 FAIL (g): junk knock % was refused — a shared bucket is back', v_i;
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM public.paperwork_link_rate_limits WHERE bucket_key = 'anon') THEN
    RAISE EXCEPTION 'BLOCK 15 FAIL (h): a well-formed token fell into the shared anon bucket';
  END IF;

  -- (i) And after all that noise the two answers a watcher would compare are
  --     the same answer. Under the old ladder this pair read false / true.
  v_a := public.paperwork_link_rate_limit_hit(NULL, v_unknown);
  v_b := public.paperwork_link_rate_limit_hit(NULL, v_dead);
  IF v_a IS DISTINCT FROM v_b THEN
    RAISE EXCEPTION 'BLOCK 15 FAIL (i): an unminted token answered %, a dead one % — the door is an oracle', v_a, v_b;
  END IF;

  -- (j) The hash bucket is a real limiter, not a way around one: twenty knocks
  --     on the dead token pass and the twenty-first is refused.
  DELETE FROM public.paperwork_link_rate_limits;
  FOR v_i IN 1..20 LOOP
    IF NOT public.paperwork_link_rate_limit_hit(NULL, v_dead) THEN
      RAISE EXCEPTION 'BLOCK 15 FAIL (j): attempt % of 20 on a hash bucket was refused', v_i;
    END IF;
  END LOOP;
  IF public.paperwork_link_rate_limit_hit(NULL, v_dead) THEN
    RAISE EXCEPTION 'BLOCK 15 FAIL (k): the 21st attempt in the minute was allowed';
  END IF;

  -- (l) A caller presenting NO token at all still lands in the shared bucket —
  --     a caller who can open nothing, and so can deny nothing to one who can.
  DELETE FROM public.paperwork_link_rate_limits;
  PERFORM public.paperwork_link_rate_limit_hit(NULL, NULL);
  IF NOT EXISTS (SELECT 1 FROM public.paperwork_link_rate_limits WHERE bucket_key = 'anon') THEN
    RAISE EXCEPTION 'BLOCK 15 FAIL (l): a caller with nothing to key on was left unbucketed';
  END IF;

  DELETE FROM public.paperwork_link_rate_limits;
  RAISE NOTICE '15. W4 r11 MAJOR-2 — the paperwork bucket tells no one whether a token was ever minted: a dead token reaches no link bucket, a dead and an unminted token share one key shape and one answer, junk knocks cannot spend a shared bucket, and the per-token limit still bites at 20: passed';
END $$;

DO $$ BEGIN RAISE NOTICE 'W4 SQL suite: all blocks passed'; END $$;

ROLLBACK;
