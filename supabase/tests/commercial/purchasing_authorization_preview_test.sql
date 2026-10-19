-- US-40: saved preview is an atomic, client-safe, read-only author snapshot.
-- Local only; rollback fixtures and never invoke external delivery.
BEGIN;
SET LOCAL statement_timeout = '60s';
SET LOCAL timezone = 'UTC';
CREATE FUNCTION pg_temp.preview_as(actor uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', actor, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', actor::text, true);
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.preview_as(uuid) TO authenticated;
INSERT INTO auth.users (id,email,encrypted_password,email_confirmed_at,created_at,updated_at,instance_id,aud,role)
SELECT ('83614260-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
       'preview-' || n || '@test.invalid','',now(),now(),now(),
       '00000000-0000-0000-0000-000000000000','authenticated','authenticated'
FROM generate_series(1,4) n;
INSERT INTO profiles (id,email,full_name,is_designer)
SELECT id,email,'Preview fixture',id <> '83614260-0000-4000-8000-000000000003' FROM auth.users
WHERE id::text LIKE '83614260-%' ON CONFLICT (id) DO NOTHING;
INSERT INTO organizations (id,type,name,slug) VALUES
('83614260-0000-4000-8000-000000000010','design_studio','Preview A','preview-test-a'),
('83614260-0000-4000-8000-000000000011','design_studio','Preview B','preview-test-b');
INSERT INTO organization_members (user_id,organization_id,role,status,joined_at) VALUES
('83614260-0000-4000-8000-000000000001','83614260-0000-4000-8000-000000000010','owner','active',now()),
('83614260-0000-4000-8000-000000000002','83614260-0000-4000-8000-000000000010','member','active',now()),
('83614260-0000-4000-8000-000000000004','83614260-0000-4000-8000-000000000011','owner','active',now());
INSERT INTO projects (id,name,designer_id,client_id,created_by,studio_id) VALUES
('83614260-0000-4000-8000-000000000020','Preview project','83614260-0000-4000-8000-000000000001',
 '83614260-0000-4000-8000-000000000003','83614260-0000-4000-8000-000000000001','83614260-0000-4000-8000-000000000010');
-- Deliberately different live names/units must never replace frozen rows.
INSERT INTO project_ffe_items (id,project_id,name,status,item_type,quantity,unit,unit_price_cents,line_total_cents) VALUES
('83614260-0000-4000-8000-000000000050','83614260-0000-4000-8000-000000000020','Changed live flooring','specified','fixed',3,'each',9999,29997),
('83614260-0000-4000-8000-000000000051','83614260-0000-4000-8000-000000000020','Changed live allowance','specified','fixed',3,'each',9999,29997);
INSERT INTO proposals (id,project_id,designer_id,client_id,title,status,document_kind,commercial_state,total_amount,subtotal,deposit_percent) VALUES
('83614260-0000-4000-8000-000000000030','83614260-0000-4000-8000-000000000020','83614260-0000-4000-8000-000000000001',
 '83614260-0000-4000-8000-000000000003','Saved authorization','draft','furnishings_authorization','draft',10001,10001,25),
('83614260-0000-4000-8000-000000000031','83614260-0000-4000-8000-000000000020','83614260-0000-4000-8000-000000000001',
 '83614260-0000-4000-8000-000000000003','Services','draft','design_services','draft',0,0,0);
INSERT INTO project_commercial_documents (id,project_id,proposal_id,document_kind,wave_name,is_origin,bound_at,created_by) VALUES
('83614260-0000-4000-8000-000000000040','83614260-0000-4000-8000-000000000020','83614260-0000-4000-8000-000000000030',
 'furnishings_authorization','UNREVIEWED_WAVE',false,now(),'83614260-0000-4000-8000-000000000001');
INSERT INTO furnishing_authorization_items (source_ffe_item_id,commercial_document_id,name,room_name,item_type,quantity,client_unit_price_cents,client_line_total_cents,trade_unit_cost_cents,snapshot,sort_order) VALUES
('83614260-0000-4000-8000-000000000050','83614260-0000-4000-8000-000000000040','Frozen flooring','Living','fixed',3,1000,3000,987654,
 '{"unit":"sq_ft","placements":[{"roomName":"Living","quantity":1},{"roomName":"Dining","quantity":2}],"internalNotes":"PRIVATE_SENTINEL","margin":987654}',0),
('83614260-0000-4000-8000-000000000051','83614260-0000-4000-8000-000000000040','Lighting allowance',null,'allowance',3,2333,7001,987654,
 '{"unit":"lot","placements":[],"internalNotes":"PRIVATE_SENTINEL"}',1);
CREATE TEMP TABLE before_preview AS
SELECT (SELECT jsonb_agg(to_jsonb(p)) FROM proposals p WHERE id::text LIKE '83614260-%') proposals,
       (SELECT jsonb_agg(to_jsonb(d)) FROM project_commercial_documents d WHERE id::text LIKE '83614260-%') documents,
       (SELECT jsonb_agg(to_jsonb(i) ORDER BY sort_order) FROM furnishing_authorization_items i WHERE commercial_document_id='83614260-0000-4000-8000-000000000040') items;
GRANT SELECT ON before_preview TO authenticated;
SELECT pg_temp.preview_as('83614260-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
DO $$
DECLARE s jsonb; b jsonb; item jsonb; needle text;
BEGIN
  s := public.get_commercial_document_send_snapshot('83614260-0000-4000-8000-000000000030');
  b := s #> '{furnishingsPreview,body}';
  IF s->>'proposalId' <> '83614260-0000-4000-8000-000000000030'
     OR s #>> '{furnishingsPreview,proposalId}' IS DISTINCT FROM s->>'proposalId'
     OR s #>> '{furnishingsPreview,projectId}' IS DISTINCT FROM '83614260-0000-4000-8000-000000000020'
     OR s #>> '{furnishingsPreview,state}' IS DISTINCT FROM 'draft'
     OR s->>'documentFingerprint' IS NULL OR NOT (s ? 'updatedAt') THEN
    RAISE EXCEPTION 'P1 atomic saved identity/version';
  END IF;
  item := b #> '{items,0}';
  IF item->>'description' IS DISTINCT FROM 'Frozen flooring' OR item->>'unit' IS DISTINCT FROM 'sq_ft'
     OR item->'rooms' IS DISTINCT FROM '[{"name":"Living","quantity":1,"unit":"sq_ft"},{"name":"Dining","quantity":2,"unit":"sq_ft"}]'::jsonb THEN
    RAISE EXCEPTION 'P2 frozen rooms and units: %', item;
  END IF;
  IF b #> '{items,1,allowance}' IS DISTINCT FROM 'true'::jsonb
     OR b #>> '{items,1,clientLineTotalCents}' IS DISTINCT FROM '7001'
     OR b #>> '{items,1,clientUnitPriceCents}' IS DISTINCT FROM '2333'
     OR b->>'totalAmountCents' IS DISTINCT FROM '10001' OR (b->>'depositPercent')::numeric IS DISTINCT FROM 25::numeric THEN
    RAISE EXCEPTION 'P3 allowance/stated total/contractual deposit: %', b;
  END IF;
  FOREACH needle IN ARRAY ARRAY['trade','cost','margin','snapshot','PRIVATE_SENTINEL','987654','UNREVIEWED_WAVE','depositPaid','depositRequired','invoice'] LOOP
    IF position(lower(needle) IN lower(s::text)) > 0 THEN RAISE EXCEPTION 'P4 private/unfingerprinted field: %',needle; END IF;
  END LOOP;
  s := public.get_commercial_document_send_snapshot('83614260-0000-4000-8000-000000000031');
  IF s ? 'furnishingsPreview' OR (SELECT count(*) FROM jsonb_object_keys(s)) <> 3 THEN
    RAISE EXCEPTION 'P5 other document-kind compatibility';
  END IF;
  RAISE NOTICE 'P1-P5 author atomic snapshot, frozen body, privacy, compatibility passed';
END $$;
SELECT pg_temp.preview_as('83614260-0000-4000-8000-000000000002');
DO $$ BEGIN
  IF public.get_commercial_document_send_snapshot('83614260-0000-4000-8000-000000000030') #>> '{furnishingsPreview,title}' IS DISTINCT FROM 'Saved authorization' THEN
    RAISE EXCEPTION 'P6 studio co-member access';
  END IF;
END $$;
SELECT pg_temp.preview_as('83614260-0000-4000-8000-000000000003');
DO $$ BEGIN
  BEGIN
    PERFORM public.get_commercial_document_send_snapshot('83614260-0000-4000-8000-000000000030');
    RAISE EXCEPTION 'P7 client preview must refuse';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.get_client_commercial_document_bundle('83614260-0000-4000-8000-000000000030');
    RAISE EXCEPTION 'P8 actual client unsent read must refuse';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT pg_temp.preview_as('83614260-0000-4000-8000-000000000004');
DO $$ BEGIN
  BEGIN
    PERFORM public.get_commercial_document_send_snapshot('83614260-0000-4000-8000-000000000030');
    RAISE EXCEPTION 'P9 wrong studio must refuse';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $$ BEGIN
  BEGIN
    PERFORM public.get_commercial_document_send_snapshot('83614260-0000-4000-8000-000000000030');
    RAISE EXCEPTION 'P10 anon must refuse';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
DO $$ BEGIN
  IF (SELECT proposals FROM before_preview) IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(p)) FROM proposals p WHERE id::text LIKE '83614260-%')
     OR (SELECT documents FROM before_preview) IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(d)) FROM project_commercial_documents d WHERE id::text LIKE '83614260-%')
     OR (SELECT items FROM before_preview) IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(i) ORDER BY sort_order) FROM furnishing_authorization_items i WHERE commercial_document_id='83614260-0000-4000-8000-000000000040') THEN
    RAISE EXCEPTION 'P11 reads leave draft and reservations unchanged';
  END IF;
  IF (SELECT provolatile FROM pg_proc WHERE oid='public.get_commercial_document_send_snapshot(uuid)'::regprocedure) <> 's'
     OR (SELECT provolatile FROM pg_proc WHERE oid='public.get_client_commercial_document_bundle(uuid)'::regprocedure) <> 's' THEN
    RAISE EXCEPTION 'P12 atomic readers remain STABLE';
  END IF;
END $$;
SELECT pg_temp.preview_as('83614260-0000-4000-8000-000000000001');
CREATE TEMP TABLE reviewed AS SELECT public.get_commercial_document_send_snapshot('83614260-0000-4000-8000-000000000030')->>'documentFingerprint' fingerprint;
-- Draft metadata may change, frozen item rows may not. The existing comparator
-- must refuse the displayed old token BEFORE any transition or delivery work.
UPDATE proposals SET description='Changed after review' WHERE id='83614260-0000-4000-8000-000000000030';
GRANT SELECT ON reviewed TO authenticated;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN
    PERFORM public.send_commercial_document('83614260-0000-4000-8000-000000000030',(SELECT fingerprint FROM reviewed));
    RAISE EXCEPTION 'P13 stale reviewed fingerprint must refuse';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
END $$;
RESET ROLE;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM proposals WHERE id='83614260-0000-4000-8000-000000000030' AND (sent_at IS NOT NULL OR status <> 'draft' OR commercial_state <> 'draft')) THEN
    RAISE EXCEPTION 'P14 stale refusal leaves unsent draft';
  END IF;
  RAISE NOTICE 'P6-P14 access, no mutation, STABLE and stale refusal passed; no external delivery invoked';
END $$;
ROLLBACK;
