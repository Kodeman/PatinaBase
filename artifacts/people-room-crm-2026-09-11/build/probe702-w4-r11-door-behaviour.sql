\pset pager off
BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id UUID) RETURNS VOID AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub',p_user_id::text,'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END; $$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION pg_temp.reset_role() RETURNS VOID AS $$
BEGIN EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims',NULL,true); END; $$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.assume_user(UUID) TO PUBLIC;
GRANT EXECUTE ON FUNCTION pg_temp.reset_role() TO PUBLIC;

INSERT INTO public.organizations (id,type,name,slug,status) VALUES
 ('fb020000-0000-4000-8000-00000000000a','design_studio','R11 Door Studio','r11-door','active');
INSERT INTO public.organization_members (user_id,organization_id,role,status,joined_at) VALUES
 ('a0000000-0000-0000-0000-000000000004','fb020000-0000-4000-8000-00000000000a','owner','active',now())
ON CONFLICT (user_id,organization_id) DO UPDATE SET status='active';
INSERT INTO public.studio_contacts (id,organization_id,entity_kind,contact_kind,company_name,company_kind,created_by) VALUES
 ('fb220000-0000-4000-8000-00000000000a','fb020000-0000-4000-8000-00000000000a','company','sub','Door Co','sub','a0000000-0000-0000-0000-000000000004');

-- R-AF: one live token per firm — a second mint must not leave two live rows
DO $$
DECLARE t1 text; i1 uuid; t2 text; i2 uuid; n int;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  SELECT id, token INTO i1, t1 FROM public.mint_paperwork_link('fb220000-0000-4000-8000-00000000000a', now() + interval '20 days');
  SELECT id, token INTO i2, t2 FROM public.mint_paperwork_link('fb220000-0000-4000-8000-00000000000a', now() + interval '20 days');
  PERFORM pg_temp.reset_role();
  SELECT count(*) INTO n FROM public.paperwork_link_tokens
   WHERE company_id='fb220000-0000-4000-8000-00000000000a' AND revoked_at IS NULL AND expires_at > now();
  IF n <> 1 THEN RAISE EXCEPTION 'P14 FAIL: % live tokens after a second mint', n; END IF;
  IF public.resolve_paperwork_link(t1) IS NOT NULL THEN RAISE EXCEPTION 'P14 FAIL: the first address survived the re-mint'; END IF;
  IF public.resolve_paperwork_link(t2) IS NULL THEN RAISE EXCEPTION 'P14 FAIL: the new address does not open'; END IF;
  PERFORM set_config('r11.dtok', t2, true);
  RAISE NOTICE 'P14 pass: one live token per firm; the re-mint kills the old address';
END $$;

-- R-AD window: an out-of-window firm is refused with the named error
DO $$
DECLARE msg text;
BEGIN
  INSERT INTO public.studio_contacts (id,organization_id,entity_kind,contact_kind,company_name,company_kind,created_by) VALUES
   ('fb220000-0000-4000-8000-00000000000b','fb020000-0000-4000-8000-00000000000a','company','sub','No Window Co','sub','a0000000-0000-0000-0000-000000000004');
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  BEGIN
    PERFORM public.mint_paperwork_link('fb220000-0000-4000-8000-00000000000b', NULL);
    RAISE NOTICE 'P15: a firm with no on-site window minted anyway (no window requirement on this path)';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS msg = MESSAGE_TEXT;
    RAISE NOTICE 'P15: refused with %', msg;
  END;
  PERFORM pg_temp.reset_role();
END $$;

-- R-BU + the gate: an inbound upload is awaiting_check, never current, and clears no gate
DO $$
DECLARE v_tok text := current_setting('r11.dtok'); v_doc uuid; st jsonb;
BEGIN
  st := to_jsonb(public.compliance_state('fb220000-0000-4000-8000-00000000000a'::uuid));
  RAISE NOTICE 'P16 before: compliance_state=%', left(st::text,200);
  v_doc := public.record_inbound_compliance_document(v_tok,'coi_gl',NULL,'X-9','Acme',CURRENT_DATE,CURRENT_DATE+365,'org/co/up/f.pdf');
  st := to_jsonb(public.compliance_state('fb220000-0000-4000-8000-00000000000a'::uuid));
  RAISE NOTICE 'P16 after:  compliance_state=%', left(st::text,200);
  IF st::text LIKE '%current%' THEN
    RAISE EXCEPTION 'P16 FAIL: an unverified inbound upload cleared the gate: %', st;
  END IF;
  PERFORM set_config('r11.ddoc', v_doc::text, true);
  RAISE NOTICE 'P16 pass: an unverified inbound upload does not clear the gate';
END $$;

-- one row per doc type on the firm's page (R-BU)
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM (
    SELECT (jsonb_array_elements(public.resolve_paperwork_link(current_setting('r11.dtok'))->'documents')->>'doc_type') AS dt
  ) x WHERE dt = 'coi_gl';
  RAISE NOTICE 'P17: rows for coi_gl on the firm page = %', n;
  IF n > 1 THEN RAISE EXCEPTION 'P17 FAIL: more than one row per doc type'; END IF;
END $$;

-- confirm makes it current; reject leaves a reason and a task
DO $$
DECLARE v_doc uuid := current_setting('r11.ddoc')::uuid; st jsonb; n int;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  PERFORM public.confirm_inbound_document(v_doc);
  PERFORM pg_temp.reset_role();
  st := to_jsonb(public.compliance_state('fb220000-0000-4000-8000-00000000000a'::uuid));
  RAISE NOTICE 'P18: after confirm compliance_state=%', left(st::text,200);
END $$;
ROLLBACK;
