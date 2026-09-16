\pset pager off
\set ON_ERROR_STOP on
BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id UUID) RETURNS VOID AS $$
BEGIN
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',p_user_id::text,'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END; $$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.assume_user(UUID) TO PUBLIC;
CREATE OR REPLACE FUNCTION pg_temp.reset_role() RETURNS VOID AS $$
BEGIN EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims',NULL,true); END; $$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.reset_role() TO PUBLIC;

-- ── fixtures: two studios, two firms, one job each ──────────────────────────
INSERT INTO public.organizations (id,type,name,slug,status) VALUES
 ('fc000000-0000-4000-8000-00000000000a','design_studio','R14 Studio A','r14-a','active'),
 ('fc000000-0000-4000-8000-00000000000b','design_studio','R14 Studio B','r14-b','active');
INSERT INTO public.organization_members (user_id,organization_id,role,status,joined_at) VALUES
 ('a0000000-0000-0000-0000-000000000004','fc000000-0000-4000-8000-00000000000a','owner','active',now()),
 ('a0000000-0000-0000-0000-000000000005','fc000000-0000-4000-8000-00000000000b','owner','active',now())
ON CONFLICT (user_id,organization_id) DO UPDATE SET role=EXCLUDED.role,status='active';

INSERT INTO public.studio_contacts (id,organization_id,entity_kind,contact_kind,company_name,company_kind,created_by) VALUES
 ('fc200000-0000-4000-8000-00000000000a','fc000000-0000-4000-8000-00000000000a','company','sub','A Millwork','sub','a0000000-0000-0000-0000-000000000004'),
 ('fc200000-0000-4000-8000-00000000000b','fc000000-0000-4000-8000-00000000000b','company','sub','B Millwork','sub','a0000000-0000-0000-0000-000000000005');

INSERT INTO public.projects (id,name,designer_id,studio_id,status,created_by,client_visibility_tier) VALUES
 ('fc300000-0000-4000-8000-00000000000a','R14 job A','a0000000-0000-0000-0000-000000000004','fc000000-0000-4000-8000-00000000000a','active','a0000000-0000-0000-0000-000000000004','full'),
 ('fc300000-0000-4000-8000-00000000000b','R14 job B','a0000000-0000-0000-0000-000000000005','fc000000-0000-4000-8000-00000000000b','active','a0000000-0000-0000-0000-000000000005','full');
-- live engagements so R-AD can read a window off the job
INSERT INTO public.project_parties (id,project_id,party_kind,display_name,company_id,on_site_from,on_site_to,created_by) VALUES
 ('fc500000-0000-4000-8000-00000000000a','fc300000-0000-4000-8000-00000000000a','sub','A Crew','fc200000-0000-4000-8000-00000000000a',CURRENT_DATE-5,CURRENT_DATE+90,'a0000000-0000-0000-0000-000000000004'),
 ('fc500000-0000-4000-8000-00000000000d','fc300000-0000-4000-8000-00000000000b','sub','B Crew','fc200000-0000-4000-8000-00000000000b',CURRENT_DATE-5,CURRENT_DATE+90,'a0000000-0000-0000-0000-000000000005');

-- ═══ Q1  a token verified at rest; expiry and revocation refuse ════════════
DO $$
DECLARE v_tok text; v_id uuid; v_hash text; j jsonb; n int;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  SELECT id, token INTO v_id, v_tok
    FROM public.mint_paperwork_link('fc200000-0000-4000-8000-00000000000a', NULL);
  PERFORM pg_temp.reset_role();

  IF v_tok !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Q1 FAIL: token shape %', v_tok; END IF;
  SELECT token_hash INTO v_hash FROM public.paperwork_link_tokens WHERE id = v_id;
  IF v_hash = v_tok OR v_hash <> encode(extensions.digest(v_tok,'sha256'),'hex') THEN
    RAISE EXCEPTION 'Q1 FAIL: token not stored as sha256 at rest';
  END IF;
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema='public' AND table_name='paperwork_link_tokens' AND column_name='token';
  IF n <> 0 THEN RAISE EXCEPTION 'Q1 FAIL: a plaintext token column exists'; END IF;

  j := public.resolve_paperwork_link(v_tok, false);
  IF j IS NULL THEN RAISE EXCEPTION 'Q1 FAIL: live token did not resolve'; END IF;

  IF public.resolve_paperwork_link(repeat('0',64), false) IS NOT NULL THEN
    RAISE EXCEPTION 'Q1 FAIL: bogus token resolved'; END IF;
  IF public.resolve_paperwork_link(substr(v_tok,1,63), false) IS NOT NULL THEN
    RAISE EXCEPTION 'Q1 FAIL: truncated token resolved'; END IF;
  IF public.resolve_paperwork_link(upper(v_tok), false) IS NOT NULL THEN
    RAISE EXCEPTION 'Q1 FAIL: case-folded token resolved'; END IF;
  IF public.paperwork_link_storage_context(repeat('0',64)) IS NOT NULL THEN
    RAISE EXCEPTION 'Q1 FAIL: bogus token got a storage context'; END IF;

  UPDATE public.paperwork_link_tokens SET expires_at = now() - interval '1 day' WHERE id = v_id;
  IF public.resolve_paperwork_link(v_tok, false) IS NOT NULL THEN
    RAISE EXCEPTION 'Q1 FAIL: expired token resolved'; END IF;
  IF (SELECT organization_id FROM public.paperwork_link_storage_context(v_tok)) IS NOT NULL THEN
    RAISE EXCEPTION 'Q1 FAIL: expired token got a storage context'; END IF;

  UPDATE public.paperwork_link_tokens
     SET expires_at = now() + interval '30 days', status = 'revoked', revoked_at = now()
   WHERE id = v_id;
  IF public.resolve_paperwork_link(v_tok, false) IS NOT NULL THEN
    RAISE EXCEPTION 'Q1 FAIL: revoked token resolved'; END IF;
  IF (SELECT organization_id FROM public.paperwork_link_storage_context(v_tok)) IS NOT NULL THEN
    RAISE EXCEPTION 'Q1 FAIL: revoked token got a storage context'; END IF;

  BEGIN
    PERFORM public.record_inbound_compliance_document(
      p_token => v_tok, p_doc_type => 'w9', p_file_path => 'x/y.pdf');
    RAISE EXCEPTION 'Q1 FAIL: a revoked token filed paper';
  EXCEPTION WHEN insufficient_privilege OR invalid_parameter_value OR check_violation
    OR no_data_found OR raise_exception THEN
    IF SQLERRM LIKE 'Q1 FAIL%' THEN RAISE; END IF;
    RAISE NOTICE 'Q1 pass: live resolves; bogus/truncated/uppercased/expired/revoked all refuse (write refused: %)', SQLERRM;
  END;
END $$;

-- ═══ Q2  an inbound upload never overwrites a verified row ═════════════════
DO $$
DECLARE v_tok text; v_ctx record; v_verified uuid; v_new uuid; v_after record;
BEGIN
  -- studio files a VERIFIED W-9 for the firm
  INSERT INTO public.studio_compliance_documents
    (id, organization_id, holder_type, holder_id, doc_type, doc_label,
     file_path, verified_at, verified_by, created_by)
  VALUES ('fc400000-0000-4000-8000-00000000000a','fc000000-0000-4000-8000-00000000000a',
          'company','fc200000-0000-4000-8000-00000000000a','w9','W-9',
          'compliance-documents/verified-original.pdf', now(),
          'a0000000-0000-0000-0000-000000000004','a0000000-0000-0000-0000-000000000004')
  RETURNING id INTO v_verified;

  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  SELECT token INTO v_tok FROM public.mint_paperwork_link('fc200000-0000-4000-8000-00000000000a', NULL);
  PERFORM pg_temp.reset_role();

  SELECT * INTO v_ctx FROM public.paperwork_link_storage_context(v_tok);
  IF v_ctx.organization_id IS NULL THEN RAISE EXCEPTION 'Q2 FAIL: no storage context'; END IF;

  v_new := public.record_inbound_compliance_document(
    p_token     => v_tok,
    p_doc_type  => 'w9',
    p_doc_label => 'W-9',
    p_file_path => v_ctx.organization_id || '/' || v_ctx.company_id || '/u9/forged.pdf');

  IF v_new IS NULL OR v_new = v_verified THEN
    RAISE EXCEPTION 'Q2 FAIL: inbound reused the verified row (new=%, verified=%)', v_new, v_verified;
  END IF;

  SELECT file_path, verified_at, superseded_by INTO v_after
    FROM public.studio_compliance_documents WHERE id = v_verified;
  IF v_after.file_path <> 'compliance-documents/verified-original.pdf'
     OR v_after.verified_at IS NULL OR v_after.superseded_by IS NOT NULL THEN
    RAISE EXCEPTION 'Q2 FAIL: verified row was touched: %', v_after;
  END IF;

  IF (SELECT verified_at FROM public.studio_compliance_documents WHERE id = v_new) IS NOT NULL THEN
    RAISE EXCEPTION 'Q2 FAIL: inbound row landed pre-verified';
  END IF;
  IF (SELECT inbound FROM public.studio_compliance_documents WHERE id = v_new) IS NOT TRUE THEN
    RAISE EXCEPTION 'Q2 FAIL: inbound row not flagged inbound';
  END IF;
  IF (SELECT organization_id FROM public.studio_compliance_documents WHERE id = v_new)
     <> 'fc000000-0000-4000-8000-00000000000a' THEN
    RAISE EXCEPTION 'Q2 FAIL: inbound row landed in the wrong studio';
  END IF;
  PERFORM set_config('r14.inbound', v_new::text, false);
  RAISE NOTICE 'Q2 pass: inbound INSERTs alongside; verified original untouched';
END $$;

-- ═══ Q3  the token's own firm is the only path the door hands out ══════════
DO $$
DECLARE v_tok_b text; v_ctx record;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000005');
  SELECT token INTO v_tok_b FROM public.mint_paperwork_link('fc200000-0000-4000-8000-00000000000b', NULL);
  PERFORM pg_temp.reset_role();
  SELECT * INTO v_ctx FROM public.paperwork_link_storage_context(v_tok_b);
  IF v_ctx.organization_id <> 'fc000000-0000-4000-8000-00000000000b'
     OR v_ctx.company_id <> 'fc200000-0000-4000-8000-00000000000b' THEN
    RAISE EXCEPTION 'Q3 FAIL: storage context crossed tenants: %', v_ctx;
  END IF;
  -- and B's token cannot file paper against A's firm: the RPC never takes a
  -- company id, it reads one off the token.
  RAISE NOTICE 'Q3 pass: storage context is the token''s own org/company (%/%)',
    v_ctx.organization_id, v_ctx.company_id;
END $$;

-- ═══ Q4  storage read policy: member reads own, stranger reads nothing ═════
DO $$
DECLARE n int; v_owner uuid := 'a0000000-0000-0000-0000-000000000004';
BEGIN
  INSERT INTO storage.objects (bucket_id, name, owner, metadata)
  VALUES ('compliance-documents',
          'fc000000-0000-4000-8000-00000000000a/fc200000-0000-4000-8000-00000000000a/u1/w9.pdf',
          NULL, '{}'::jsonb),
         ('compliance-documents',
          'fc000000-0000-4000-8000-00000000000b/fc200000-0000-4000-8000-00000000000b/u2/w9.pdf',
          NULL, '{}'::jsonb);

  PERFORM pg_temp.assume_user(v_owner);
  SELECT count(*) INTO n FROM storage.objects
   WHERE bucket_id='compliance-documents' AND name LIKE 'fc0000%';
  PERFORM pg_temp.reset_role();
  IF n <> 1 THEN RAISE EXCEPTION 'Q4 FAIL: A sees % of the two fixtures, expected 1', n; END IF;
  PERFORM pg_temp.assume_user(v_owner);
  SELECT count(*) INTO n FROM storage.objects
   WHERE bucket_id='compliance-documents'
     AND name LIKE 'fc000000-0000-4000-8000-00000000000b/%';
  PERFORM pg_temp.reset_role();
  IF n <> 0 THEN RAISE EXCEPTION 'Q4 FAIL: A read B''s folder'; END IF;

  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000005');
  SELECT count(*) INTO n FROM storage.objects
   WHERE bucket_id='compliance-documents' AND name LIKE 'fc0000%';
  PERFORM pg_temp.reset_role();
  IF n <> 1 THEN RAISE EXCEPTION 'Q4 FAIL: B sees % of the two fixtures, expected 1', n; END IF;
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000005');
  SELECT count(*) INTO n FROM storage.objects
   WHERE bucket_id='compliance-documents'
     AND name LIKE 'fc000000-0000-4000-8000-00000000000a/%';
  PERFORM pg_temp.reset_role();
  IF n <> 0 THEN RAISE EXCEPTION 'Q4 FAIL: B read A''s folder'; END IF;

  -- and an anonymous caller reads nothing at all (bucket is private)
  PERFORM set_config('role','anon',true);
  EXECUTE 'SET LOCAL ROLE anon';
  SELECT count(*) INTO n FROM storage.objects WHERE bucket_id='compliance-documents';
  EXECUTE 'RESET ROLE';
  IF n <> 0 THEN RAISE EXCEPTION 'Q4 FAIL: anon read % objects', n; END IF;
  RAISE NOTICE 'Q4 pass: each studio sees only its own folder; anon sees none';
END $$;

-- ═══ Q4b  the uuid-cast trap: a non-uuid first segment in THIS bucket ══════
DO $$
DECLARE n int;
BEGIN
  INSERT INTO storage.objects (bucket_id, name, owner, metadata)
  VALUES ('compliance-documents','legacy/loose.pdf', NULL, '{}'::jsonb);
  BEGIN
    PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
    SELECT count(*) INTO n FROM storage.objects WHERE bucket_id = 'compliance-documents';
    PERFORM pg_temp.reset_role();
    n := n;
    RAISE NOTICE 'Q4b: non-uuid segment tolerated, member still sees % rows', n;
  EXCEPTION WHEN invalid_text_representation THEN
    PERFORM pg_temp.reset_role();
    RAISE NOTICE 'Q4b: CONFIRMED 22P02 — a non-uuid first segment blinds the whole bucket scan';
  END;
  -- (left in place; the whole probe rolls back. storage.protect_delete()
  --  forbids a direct DELETE here.)
END $$;

-- ═══ Q5  /pay: hashed lookup lives, plaintext lookup is dead ═══════════════
DO $$
DECLARE v_inv uuid := 'fc600000-0000-4000-8000-00000000000a';
        v_tok text; v_row record; j jsonb; n int;
BEGIN
  INSERT INTO public.invoices (id, project_id, designer_id, studio_id, invoice_number,
                               status, subtotal_cents, total_cents, amount_paid_cents,
                               currency, issue_date, due_date)
  VALUES (v_inv,'fc300000-0000-4000-8000-00000000000a','a0000000-0000-0000-0000-000000000004',
          'fc000000-0000-4000-8000-00000000000a','R14-0001','sent',125000,125000,0,'usd',
          CURRENT_DATE, CURRENT_DATE + 14);

  SELECT public.ensure_invoice_link(v_inv) INTO v_tok;
  IF v_tok IS NULL OR v_tok !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Q5 FAIL: no pay token minted (%)', v_tok;
  END IF;

  -- the address in the letter still opens
  j := public.resolve_invoice_link(v_tok, false);
  IF j IS NULL OR j->'invoice'->>'number' IS DISTINCT FROM 'R14-0001' THEN
    RAISE EXCEPTION 'Q5 FAIL: /pay/<token> no longer resolves: %', j;
  END IF;
  IF j ? 'token' AND j->>'token' IS NOT NULL THEN
    RAISE EXCEPTION 'Q5 FAIL: reader echoes a token back';
  END IF;
  SELECT * INTO v_row FROM public.resolve_invoice_link_for_checkout(v_tok);
  IF v_row.invoice_id IS DISTINCT FROM v_inv THEN
    RAISE EXCEPTION 'Q5 FAIL: checkout resolver lost the token';
  END IF;
  IF public.resolve_invoice_link(repeat('0',64), false) IS NOT NULL THEN
    RAISE EXCEPTION 'Q5 FAIL: bogus pay token resolved'; END IF;

  -- the plaintext column is frozen, so a legacy plaintext lookup fails closed
  SELECT count(*) INTO n FROM public.invoice_links WHERE token = v_tok;
  IF n <> 0 THEN RAISE EXCEPTION 'Q5 FAIL: plaintext token survives at rest'; END IF;
  SELECT count(*) INTO n FROM public.invoice_links WHERE token IS NOT NULL;
  IF n <> 0 THEN RAISE EXCEPTION 'Q5 FAIL: % plaintext tokens at rest', n; END IF;
  SELECT count(*) INTO n FROM public.invoice_links
   WHERE invoice_id = v_inv AND token_hash = public.invoice_link_token_hash(v_tok);
  IF n <> 1 THEN RAISE EXCEPTION 'Q5 FAIL: hashed row missing'; END IF;

  -- expiry: a stale link refuses on an unpaid invoice
  UPDATE public.invoice_links SET expires_at = now() - interval '1 day' WHERE invoice_id = v_inv;
  j := public.resolve_invoice_link(v_tok, false);
  IF j IS NOT NULL THEN RAISE EXCEPTION 'Q5 FAIL: expired /pay resolved: %', j; END IF;
  SELECT * INTO v_row FROM public.resolve_invoice_link_for_checkout(v_tok);
  IF v_row.invoice_id IS NOT NULL THEN RAISE EXCEPTION 'Q5 FAIL: expired /pay took a payment'; END IF;
  RAISE NOTICE 'Q5 pass: hashed lookup live, plaintext dead, expiry closes both readers';
END $$;

-- ═══ Q6  record_touch resolves the org itself; a caller cannot aim it ══════
DO $$
DECLARE v_id uuid; v_org uuid;
BEGIN
  SELECT public.record_touch('engagement','fc500000-0000-4000-8000-00000000000a','email','out')
    INTO v_id;
  SELECT organization_id INTO v_org FROM public.studio_touches WHERE id = v_id;
  IF v_org <> 'fc000000-0000-4000-8000-00000000000a' THEN
    RAISE EXCEPTION 'Q6 FAIL: touch filed in %', v_org;
  END IF;

  -- an unknown subject writes nothing at all
  SELECT public.record_touch('engagement','fc500000-0000-4000-8000-0000000000ff','email','out')
    INTO v_id;
  IF v_id IS NOT NULL THEN RAISE EXCEPTION 'Q6 FAIL: touch on a stranger subject'; END IF;
  RAISE NOTICE 'Q6 pass: org resolved server-side, unknown subject writes nothing';
END $$;

-- ═══ Q7  studio_touches is read-only to members and scoped to the studio ═══
DO $$
DECLARE n int;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000005');
  SELECT count(*) INTO n FROM public.studio_touches
   WHERE organization_id='fc000000-0000-4000-8000-00000000000a';
  PERFORM pg_temp.reset_role();
  IF n <> 0 THEN RAISE EXCEPTION 'Q7 FAIL: cross-tenant touch read = %', n; END IF;

  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  SELECT count(*) INTO n FROM public.studio_touches
   WHERE organization_id='fc000000-0000-4000-8000-00000000000a';
  IF n < 1 THEN RAISE EXCEPTION 'Q7 FAIL: own touch unreadable'; END IF;
  BEGIN
    INSERT INTO public.studio_touches (organization_id,subject_type,subject_id,direction,occurred_at)
    VALUES ('fc000000-0000-4000-8000-00000000000a','project',
            'fc300000-0000-4000-8000-00000000000a','out',now());
    PERFORM pg_temp.reset_role();
    RAISE EXCEPTION 'Q7 FAIL: a member wrote a touch by hand';
  EXCEPTION WHEN insufficient_privilege OR sqlstate '42501' THEN
    PERFORM pg_temp.reset_role();
    RAISE NOTICE 'Q7 pass: members read their own touches, never write';
  END;
END $$;

-- ═══ Q8  record_notice: refs and names, and a duplicate display name ═══════
DO $$
DECLARE v record; v_refs uuid[];
BEGIN
  INSERT INTO public.project_parties (id,project_id,party_kind,display_name,created_by) VALUES
   ('fc500000-0000-4000-8000-00000000000b','fc300000-0000-4000-8000-00000000000a','sub','Same Name','a0000000-0000-0000-0000-000000000004'),
   ('fc500000-0000-4000-8000-00000000000c','fc300000-0000-4000-8000-00000000000a','sub','Same Name','a0000000-0000-0000-0000-000000000004');

  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  SELECT * INTO v FROM public.record_notice(
    'fc300000-0000-4000-8000-00000000000a','Slab pour moved to Tuesday',
    ARRAY['fc500000-0000-4000-8000-00000000000b','fc500000-0000-4000-8000-00000000000c',
          'fc500000-0000-4000-8000-0000000000ff']::uuid[]);
  PERFORM pg_temp.reset_role();

  IF array_length(v.told_names,1) <> 2 THEN
    RAISE EXCEPTION 'Q8 FAIL: told_names = %', v.told_names;
  END IF;
  SELECT notified_refs INTO v_refs FROM public.studio_touches WHERE id = v.id;
  IF array_length(v_refs,1) <> 2 THEN
    RAISE EXCEPTION 'Q8 FAIL: notified_refs = %', v_refs;
  END IF;
  IF NOT (v_refs @> ARRAY['fc500000-0000-4000-8000-00000000000b',
                          'fc500000-0000-4000-8000-00000000000c']::uuid[]) THEN
    RAISE EXCEPTION 'Q8 FAIL: refs dropped a seat: %', v_refs;
  END IF;
  RAISE NOTICE 'Q8 pass: stranger id dropped, both same-named seats kept (names=%, refs=%)',
    v.told_names, v_refs;
END $$;

-- ═══ Q9  a stranger cannot record a notice on someone else's job ═══════════
DO $$
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000005');
  BEGIN
    PERFORM public.record_notice('fc300000-0000-4000-8000-00000000000a','I was here', '{}'::uuid[]);
    PERFORM pg_temp.reset_role();
    RAISE EXCEPTION 'Q9 FAIL: cross-tenant notice recorded';
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM pg_temp.reset_role();
    RAISE NOTICE 'Q9 pass: cross-tenant notice refused';
  END;
END $$;

-- ═══ Q10  confirm / reject are studio-gated ════════════════════════════════
DO $$
DECLARE v_doc uuid := current_setting('r14.inbound')::uuid;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000005');
  BEGIN
    PERFORM public.confirm_inbound_document(v_doc);
    PERFORM pg_temp.reset_role();
    RAISE EXCEPTION 'Q10 FAIL: stranger confirmed inbound paper';
  EXCEPTION WHEN insufficient_privilege OR no_data_found THEN
    PERFORM pg_temp.reset_role();
    RAISE NOTICE 'Q10a pass: cross-tenant confirm refused';
  END;
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000005');
  BEGIN
    PERFORM public.reject_inbound_document(v_doc, 'That is not our firm.');
    PERFORM pg_temp.reset_role();
    RAISE EXCEPTION 'Q10 FAIL: stranger rejected inbound paper';
  EXCEPTION WHEN insufficient_privilege OR no_data_found THEN
    PERFORM pg_temp.reset_role();
    RAISE NOTICE 'Q10b pass: cross-tenant reject refused';
  END;
END $$;

-- ═══ Q11  grants: no definer RPC of this wave is open to PUBLIC/anon ═══════
DO $$
DECLARE r record; bad text := '';
BEGIN
  FOR r IN
    SELECT p.proname,
           has_function_privilege('anon',   p.oid, 'EXECUTE') AS anon_x,
           has_function_privilege('public', p.oid, 'EXECUTE') AS pub_x
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public'
       AND p.proname IN ('mint_paperwork_link','revoke_paperwork_link',
                         'resolve_paperwork_link','record_inbound_compliance_document',
                         'confirm_inbound_document','reject_inbound_document',
                         'paperwork_link_storage_context','paperwork_link_rate_limit_hit',
                         'record_touch','record_notice','ensure_invoice_link',
                         'resolve_invoice_link','resolve_invoice_link_for_checkout',
                         'resolve_invoice_return_nonce','stamp_invoice_checkout_return_origin',
                         'invoice_letter_must_hold','invoice_letters_must_hold')
  LOOP
    IF r.anon_x OR r.pub_x THEN
      bad := bad || format(' %s(anon=%s,public=%s)', r.proname, r.anon_x, r.pub_x);
    END IF;
  END LOOP;
  IF bad <> '' THEN RAISE EXCEPTION 'Q11 FAIL: open to anon/PUBLIC:%', bad; END IF;
  RAISE NOTICE 'Q11 pass: every W4 definer RPC is closed to anon and PUBLIC';
END $$;

-- ═══ Q12  every W4 definer RPC pins search_path ════════════════════════════
DO $$
DECLARE r record; bad text := '';
BEGIN
  FOR r IN
    SELECT p.proname, p.prosecdef, p.proconfig
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.prosecdef
       AND p.proname IN ('mint_paperwork_link','revoke_paperwork_link',
                         'resolve_paperwork_link','record_inbound_compliance_document',
                         'confirm_inbound_document','reject_inbound_document',
                         'paperwork_link_storage_context','paperwork_link_rate_limit_hit',
                         'record_touch','record_notice','studio_contact_org',
                         'ensure_invoice_link','get_invoice_link','invoice_link_is_live',
                         'resolve_invoice_link','resolve_invoice_link_for_checkout',
                         'resolve_invoice_return_nonce','stamp_invoice_checkout_return_origin',
                         'invoice_letter_must_hold','invoice_letters_must_hold',
                         'invoice_link_token_hash')
  LOOP
    IF r.proconfig IS NULL OR NOT EXISTS (
         SELECT 1 FROM unnest(r.proconfig) c WHERE c LIKE 'search_path=%') THEN
      bad := bad || ' ' || r.proname;
    END IF;
  END LOOP;
  IF bad <> '' THEN RAISE EXCEPTION 'Q12 FAIL: unpinned search_path:%', bad; END IF;
  RAISE NOTICE 'Q12 pass: every W4 SECURITY DEFINER pins search_path';
END $$;

ROLLBACK;
