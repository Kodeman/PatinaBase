\pset pager off
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

-- two studios
INSERT INTO public.organizations (id,type,name,slug,status) VALUES
 ('fb000000-0000-4000-8000-00000000000a','design_studio','R11 Studio A','r11-a','active'),
 ('fb000000-0000-4000-8000-00000000000b','design_studio','R11 Studio B','r11-b','active');
INSERT INTO public.organization_members (user_id,organization_id,role,status,joined_at) VALUES
 ('a0000000-0000-0000-0000-000000000004','fb000000-0000-4000-8000-00000000000a','owner','active',now()),
 ('a0000000-0000-0000-0000-000000000005','fb000000-0000-4000-8000-00000000000b','owner','active',now())
ON CONFLICT (user_id,organization_id) DO UPDATE SET role=EXCLUDED.role,status='active';

INSERT INTO public.studio_contacts (id,organization_id,entity_kind,contact_kind,company_name,company_kind,created_by) VALUES
 ('fb200000-0000-4000-8000-00000000000a','fb000000-0000-4000-8000-00000000000a','company','sub','A Drywall','sub','a0000000-0000-0000-0000-000000000004'),
 ('fb200000-0000-4000-8000-00000000000b','fb000000-0000-4000-8000-00000000000b','company','sub','B Drywall','sub','a0000000-0000-0000-0000-000000000005');
INSERT INTO public.studio_contacts (id,organization_id,entity_kind,contact_kind,full_name,created_by) VALUES
 ('fb100000-0000-4000-8000-00000000000a','fb000000-0000-4000-8000-00000000000a','person','sub','A Person','a0000000-0000-0000-0000-000000000004');

INSERT INTO public.projects (id,name,designer_id,studio_id,status,created_by,client_visibility_tier) VALUES
 ('fb300000-0000-4000-8000-00000000000a','R11 job A','a0000000-0000-0000-0000-000000000004','fb000000-0000-4000-8000-00000000000a','active','a0000000-0000-0000-0000-000000000004','full');
INSERT INTO public.project_parties (id,project_id,party_kind,display_name,company_id,on_site_from,on_site_to,created_by) VALUES
 ('fb500000-0000-4000-8000-00000000000a','fb300000-0000-4000-8000-00000000000a','sub','A Crew','fb200000-0000-4000-8000-00000000000a',CURRENT_DATE-5,CURRENT_DATE+90,'a0000000-0000-0000-0000-000000000004');

-- P1: B's owner may not mint on A's firm
DO $$
DECLARE v record;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000005');
  BEGIN
    SELECT * INTO v FROM public.mint_paperwork_link('fb200000-0000-4000-8000-00000000000a', NULL);
    RAISE EXCEPTION 'P1 FAIL: cross-tenant mint succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'P1 pass: cross-tenant mint refused';
  END;
  PERFORM pg_temp.reset_role();
END $$;

-- P2: A's owner mints; token is 64 hex; only hash stored
DO $$
DECLARE v_token text; v_id uuid; v_exp timestamptz; v_hash text;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  SELECT id, token, expires_at INTO v_id, v_token, v_exp
    FROM public.mint_paperwork_link('fb200000-0000-4000-8000-00000000000a', NULL);
  PERFORM pg_temp.reset_role();
  IF v_token !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'P2 FAIL: token shape'; END IF;
  SELECT token_hash INTO v_hash FROM public.paperwork_link_tokens WHERE id=v_id;
  IF v_hash = v_token THEN RAISE EXCEPTION 'P2 FAIL: plaintext at rest'; END IF;
  PERFORM set_config('r11.token', v_token, true);
  PERFORM set_config('r11.tokid', v_id::text, true);
  RAISE NOTICE 'P2 pass: minted, hashed at rest, expires %', v_exp;
END $$;

-- P3: B's owner cannot see A's token row; A's owner can
DO $$
DECLARE n int;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000005');
  SELECT count(*) INTO n FROM public.paperwork_link_tokens WHERE organization_id='fb000000-0000-4000-8000-00000000000a';
  PERFORM pg_temp.reset_role();
  IF n <> 0 THEN RAISE EXCEPTION 'P3 FAIL: cross-tenant token read = %', n; END IF;
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  SELECT count(*) INTO n FROM public.paperwork_link_tokens WHERE organization_id='fb000000-0000-4000-8000-00000000000a';
  PERFORM pg_temp.reset_role();
  IF n <> 1 THEN RAISE EXCEPTION 'P3 FAIL: own token read = %', n; END IF;
  RAISE NOTICE 'P3 pass: token rows are studio-scoped';
END $$;

-- P4: v_access_grants twelfth tier is studio-scoped
DO $$
DECLARE n int;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000005');
  SELECT count(*) INTO n FROM public.v_access_grants WHERE tier='paperwork_link' AND scope_id='fb000000-0000-4000-8000-00000000000a';
  PERFORM pg_temp.reset_role();
  IF n <> 0 THEN RAISE EXCEPTION 'P4 FAIL: stranger sees A paperwork grant'; END IF;
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  SELECT count(*) INTO n FROM public.v_access_grants WHERE tier='paperwork_link' AND scope_id='fb000000-0000-4000-8000-00000000000a';
  PERFORM pg_temp.reset_role();
  IF n <> 1 THEN RAISE EXCEPTION 'P4 FAIL: owner sees % paperwork grants', n; END IF;
  RAISE NOTICE 'P4 pass: twelfth tier is tenant-scoped';
END $$;

-- P5: a verified doc of the same type is never touched by an upload
DO $$
DECLARE v_doc uuid; v_old uuid; v_tok text := current_setting('r11.token'); before record; after record;
BEGIN
  INSERT INTO public.studio_compliance_documents
    (id, organization_id, holder_type, holder_id, doc_type, expires_on, blocks, verified_by, verified_at, source, inbound)
  VALUES ('fb700000-0000-4000-8000-00000000000a','fb000000-0000-4000-8000-00000000000a','company','fb200000-0000-4000-8000-00000000000a','coi_gl',CURRENT_DATE+60,ARRAY['site_access'],'a0000000-0000-0000-0000-000000000004',now(),'studio',false)
  RETURNING id INTO v_old;
  SELECT verified_at, verified_by, superseded_by, blocks INTO before FROM public.studio_compliance_documents WHERE id=v_old;

  v_doc := public.record_inbound_compliance_document(v_tok,'coi_gl',NULL,'X-1','Acme',CURRENT_DATE,CURRENT_DATE+365,'org/co/up/f.pdf');
  SELECT verified_at, verified_by, superseded_by, blocks INTO after FROM public.studio_compliance_documents WHERE id=v_old;
  IF before IS DISTINCT FROM after THEN RAISE EXCEPTION 'P5 FAIL: verified row changed'; END IF;
  IF (SELECT holder_id FROM public.studio_compliance_documents WHERE id=v_doc) <> 'fb200000-0000-4000-8000-00000000000a'
   OR (SELECT organization_id FROM public.studio_compliance_documents WHERE id=v_doc) <> 'fb000000-0000-4000-8000-00000000000a'
  THEN RAISE EXCEPTION 'P5 FAIL: holder not from the token'; END IF;
  IF (SELECT blocks FROM public.studio_compliance_documents WHERE id=v_doc) <> ARRAY['site_access'] THEN
    RAISE EXCEPTION 'P5 FAIL: gates not inherited';
  END IF;
  PERFORM set_config('r11.doc', v_doc::text, true);
  RAISE NOTICE 'P5 pass: upload inserts unverified on the token''s firm, inherits gates, never touches the verified row';
END $$;

-- P6: B's owner cannot confirm or reject A's inbound document
DO $$
DECLARE v_doc uuid := current_setting('r11.doc')::uuid;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000005');
  BEGIN
    PERFORM public.confirm_inbound_document(v_doc);
    RAISE EXCEPTION 'P6 FAIL: cross-tenant confirm';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.reject_inbound_document(v_doc,'no');
    RAISE EXCEPTION 'P6 FAIL: cross-tenant reject';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM pg_temp.reset_role();
  RAISE NOTICE 'P6 pass: confirm/reject are studio-gated';
END $$;

-- P7: revoke then every read dies into the same silence
DO $$
DECLARE v_tok text := current_setting('r11.token'); v_id uuid := current_setting('r11.tokid')::uuid; n int;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  PERFORM public.revoke_paperwork_link(v_id, 'done');
  PERFORM pg_temp.reset_role();
  IF public.resolve_paperwork_link(v_tok) IS NOT NULL THEN RAISE EXCEPTION 'P7 FAIL: revoked resolves'; END IF;
  SELECT count(*) INTO n FROM public.paperwork_link_storage_context(v_tok);
  IF n <> 0 THEN RAISE EXCEPTION 'P7 FAIL: revoked storage context'; END IF;
  BEGIN
    PERFORM public.record_inbound_compliance_document(v_tok,'w9');
    RAISE EXCEPTION 'P7 FAIL: revoked token wrote a document';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RAISE NOTICE 'P7 pass: a revoked token reaches nothing';
END $$;

-- P8: expired token, same
DO $$
DECLARE v_tok text; v_id uuid; n int;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  SELECT id, token INTO v_id, v_tok FROM public.mint_paperwork_link('fb200000-0000-4000-8000-00000000000a', now() + interval '1 day');
  PERFORM pg_temp.reset_role();
  UPDATE public.paperwork_link_tokens SET expires_at = now() - interval '1 minute' WHERE id = v_id;
  IF public.resolve_paperwork_link(v_tok) IS NOT NULL THEN RAISE EXCEPTION 'P8 FAIL: expired resolves'; END IF;
  SELECT count(*) INTO n FROM public.paperwork_link_storage_context(v_tok);
  IF n <> 0 THEN RAISE EXCEPTION 'P8 FAIL: expired storage context'; END IF;
  BEGIN
    PERFORM public.record_inbound_compliance_document(v_tok,'w9');
    RAISE EXCEPTION 'P8 FAIL: expired token wrote a document';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM set_config('r11.expired', v_tok, true);
  RAISE NOTICE 'P8 pass: an expired token reaches nothing';
END $$;

-- P9: the rate bucket as an existence oracle for an address-less caller
DO $$
DECLARE v_dead text := current_setting('r11.expired');
        v_fake text := repeat('ab',32);
        r_dead text; r_fake text;
BEGIN
  DELETE FROM public.paperwork_link_rate_limits;
  -- saturate the shared 'anon' bucket with junk tokens (20 hits)
  FOR i IN 1..20 LOOP
    PERFORM public.paperwork_link_rate_limit_hit(NULL, v_fake);
  END LOOP;
  r_fake := public.paperwork_link_rate_limit_hit(NULL, v_fake)::text;   -- 21st unknown-token knock
  r_dead := public.paperwork_link_rate_limit_hit(NULL, v_dead)::text;   -- a token that EXISTS but is dead
  RAISE NOTICE 'P9 observed: unknown-token knock=% ; existing-but-dead-token knock=% ; buckets=%',
    r_fake, r_dead, (SELECT string_agg(bucket_key||'='||attempt_count, ', ' ORDER BY bucket_key) FROM public.paperwork_link_rate_limits);
END $$;

ROLLBACK;
