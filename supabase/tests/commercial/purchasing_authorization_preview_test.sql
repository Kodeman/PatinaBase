-- US-40: saved preview is an atomic, client-safe, read-only author snapshot.
-- Local only; rollback fixtures and never invoke external delivery.
BEGIN;
SET LOCAL statement_timeout = '5s';
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
-- Fresh own/custom/catalog references are captured by the canonical save helper.
INSERT INTO products (id,name,captured_at,layer,images) VALUES
('83614260-0000-4000-8000-000000000060','Photo fixture',now(),'catalog',ARRAY['https://images.example.test/catalog.jpg']);
UPDATE project_ffe_items SET product_id='83614260-0000-4000-8000-000000000060' WHERE id='83614260-0000-4000-8000-000000000050';
DELETE FROM project_ffe_item_images WHERE item_id='83614260-0000-4000-8000-000000000050';
INSERT INTO project_ffe_item_images (item_id,project_id,url,source,position,is_primary) VALUES
('83614260-0000-4000-8000-000000000050','83614260-0000-4000-8000-000000000020','https://images.example.test/own.jpg','upload',1,true),
('83614260-0000-4000-8000-000000000050','83614260-0000-4000-8000-000000000020','https://images.example.test/secondary.jpg','upload',0,false);
-- US-41: the studio's lead time on the flooring line, frozen with the save.
UPDATE project_ffe_items SET lead_time_weeks=8 WHERE id='83614260-0000-4000-8000-000000000050';
DO $$
DECLARE line public.project_ffe_items; snap jsonb;
BEGIN
  SELECT * INTO line FROM project_ffe_items WHERE id='83614260-0000-4000-8000-000000000050';
  snap := public._furnishing_authorization_item_snapshot(line);
  IF snap->'clientImage' IS DISTINCT FROM '{"version":1,"url":"https://images.example.test/own.jpg"}'::jsonb
     OR snap->>'productImageUrl' IS DISTINCT FROM 'https://images.example.test/catalog.jpg'
     OR NOT (snap ?& ARRAY['budgetMinCents','budgetMaxCents','docCode','customFields','notes','unit','needLabel','lineKind','parentFfeItemId','placements']) THEN
    RAISE EXCEPTION 'P15 canonical save freezes own primary and preserves snapshot keys: %',snap;
  END IF;
  SELECT * INTO line FROM project_ffe_items WHERE id='83614260-0000-4000-8000-000000000051';
  IF public._furnishing_authorization_item_snapshot(line)->'clientImage' IS DISTINCT FROM '{"version":1,"url":null}'::jsonb THEN
    RAISE EXCEPTION 'P16 custom missing photo is explicit null';
  END IF;
  line.product_id := '83614260-0000-4000-8000-000000000060';
  IF public._furnishing_authorization_item_snapshot(line)#>>'{clientImage,url}' IS DISTINCT FROM 'https://images.example.test/catalog.jpg' THEN
    RAISE EXCEPTION 'P17 catalog fallback only without own rows';
  END IF;
END $$;
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
 '{"unit":"sq_ft","placements":[{"roomName":"Living","quantity":1},{"roomName":"Dining","quantity":2}],"internalNotes":"PRIVATE_SENTINEL","margin":987654}'::jsonb || jsonb_build_object('clientImage',(SELECT public._furnishing_authorization_item_snapshot(i)->'clientImage' FROM project_ffe_items i WHERE i.id='83614260-0000-4000-8000-000000000050'),
   'leadTime',(SELECT public._furnishing_authorization_item_snapshot(i)->'leadTime' FROM project_ffe_items i WHERE i.id='83614260-0000-4000-8000-000000000050')),0),
('83614260-0000-4000-8000-000000000051','83614260-0000-4000-8000-000000000040','Lighting allowance',null,'allowance',3,2333,7001,987654,
 '{"unit":"lot","placements":[],"internalNotes":"PRIVATE_SENTINEL"}',1);
-- Save once via the same helper called by the creator and canonical insert guard.
CREATE TEMP TABLE frozen_photo AS SELECT public._commercial_document_fingerprint('83614260-0000-4000-8000-000000000030') fingerprint;
UPDATE project_ffe_item_images SET url='https://images.example.test/changed-live.jpg'
WHERE item_id='83614260-0000-4000-8000-000000000050' AND is_primary;
UPDATE products SET images=ARRAY['https://images.example.test/changed-catalog.jpg'] WHERE id='83614260-0000-4000-8000-000000000060';
UPDATE project_ffe_items SET lead_time_weeks=30 WHERE id='83614260-0000-4000-8000-000000000050';
DO $$
DECLARE line public.project_ffe_items; candidate_url text;
BEGIN
  IF public._commercial_document_fingerprint('83614260-0000-4000-8000-000000000030') IS DISTINCT FROM (SELECT fingerprint FROM frozen_photo) THEN
    RAISE EXCEPTION 'P18 live image and lead time edits cannot change saved fingerprint';
  END IF;
  SELECT * INTO line FROM project_ffe_items WHERE id='83614260-0000-4000-8000-000000000050';
  FOREACH candidate_url IN ARRAY ARRAY['javascript:alert(1)','http://images.example.test/a.jpg','https://user:pass@images.example.test/a.jpg','https://images.example.test/a.jpg?X-Amz-Signature=secret','https://images.example.test/a.jpg?%65xpires=100','https://images.example.test/storage/v1/object/sign/private/a.jpg?token=secret'] LOOP
    UPDATE project_ffe_item_images SET url=candidate_url WHERE item_id=line.id AND is_primary;
    IF public._furnishing_authorization_item_snapshot(line)->'clientImage' IS DISTINCT FROM '{"version":1,"url":null}'::jsonb THEN
      RAISE EXCEPTION 'P19 invalid own photo freezes null, never catalog: %',candidate_url;
    END IF;
  END LOOP;
END $$;
-- Custom line-owned primary does not require a catalog product.
INSERT INTO project_ffe_item_images (item_id,project_id,url,source,position,is_primary) VALUES
('83614260-0000-4000-8000-000000000051','83614260-0000-4000-8000-000000000020','https://images.example.test/custom.jpg','upload',0,true);
DO $$
DECLARE line public.project_ffe_items;
BEGIN
  SELECT * INTO line FROM project_ffe_items WHERE id='83614260-0000-4000-8000-000000000051';
  IF line.product_id IS NOT NULL OR public._furnishing_authorization_item_snapshot(line)->'clientImage' IS DISTINCT FROM '{"version":1,"url":"https://images.example.test/custom.jpg"}'::jsonb THEN
    RAISE EXCEPTION 'P21 custom-owned primary with product_id null';
  END IF;
END $$;
-- SET ROLE postgres deliberately exercises the canonical insert guard, not its
-- direct-session fixture bypass. No guard is disabled or changed.
SELECT pg_temp.preview_as('83614260-0000-4000-8000-000000000001');
SELECT set_config('app.furnishing_authorization_project_id','83614260-0000-4000-8000-000000000020',true);
SET LOCAL ROLE postgres;
DO $$
DECLARE source public.project_ffe_items; canonical jsonb; candidate jsonb; refusal text;
BEGIN
  SELECT * INTO source FROM project_ffe_items WHERE id='83614260-0000-4000-8000-000000000051';
  canonical := public._furnishing_authorization_item_snapshot(source);
  FOREACH candidate IN ARRAY ARRAY[canonical, jsonb_set(canonical,'{clientImage,url}','"https://images.example.test/forged.jpg"'), jsonb_set(canonical,'{leadTime,weeks}','99')] LOOP
    BEGIN
      INSERT INTO furnishing_authorization_items (source_ffe_item_id,commercial_document_id,project_room_id,product_id,name,room_name,category,item_type,quantity,client_unit_price_cents,client_line_total_cents,trade_unit_cost_cents,markup_percent,vendor_id,vendor_name,snapshot,sort_order)
      VALUES (source.id,'83614260-0000-4000-8000-000000000040',source.project_room_id,source.product_id,source.name,null,COALESCE(source.ffe_category,'Uncategorized'),source.item_type,source.quantity,source.unit_price_cents,source.line_total_cents,source.trade_price_cents,source.markup_percent,source.vendor_id,source.vendor_name,candidate,source.sort_order);
      IF candidate IS DISTINCT FROM canonical THEN RAISE EXCEPTION 'P22 forged image or lead time must be rejected'; END IF;
      -- Roll back the successful canonical probe without changing frozen rows.
      RAISE EXCEPTION SQLSTATE 'Z0001';
    EXCEPTION WHEN SQLSTATE 'Z0001' THEN NULL;
      WHEN unique_violation THEN
        IF candidate IS DISTINCT FROM canonical THEN RAISE EXCEPTION 'P22 forgery reached uniqueness instead of canonical validation'; END IF;
      WHEN check_violation THEN
        GET STACKED DIAGNOSTICS refusal = MESSAGE_TEXT;
        IF candidate = canonical OR refusal <> 'authorization item does not match its canonical draft/source' THEN RAISE; END IF;
    END;
  END LOOP;
  RAISE NOTICE 'P21-P22 custom primary and canonical forged-image rejection passed';
END $$;
RESET ROLE;
INSERT INTO project_ffe_items (id,project_id,name,status,item_type,quantity,unit,unit_price_cents,line_total_cents) SELECT ('83614260-0000-4000-8000-' || lpad((52+n)::text,12,'0'))::uuid,'83614260-0000-4000-8000-000000000020'::uuid,'Adversarial source','specified','fixed',1,'each',100,100 FROM generate_series(0,5) n;
-- Adversarial historical snapshots are fixture inserts, never immutable updates.
INSERT INTO proposals (id,project_id,designer_id,client_id,title,status,document_kind,commercial_state,total_amount,subtotal,deposit_percent) VALUES
('83614260-0000-4000-8000-000000000032','83614260-0000-4000-8000-000000000020','83614260-0000-4000-8000-000000000001','83614260-0000-4000-8000-000000000003','Adversarial safe projection','sent','furnishings_authorization','sent',100,100,0);
INSERT INTO project_commercial_documents (id,project_id,proposal_id,document_kind,wave_name,is_origin,bound_at,created_by) VALUES
('83614260-0000-4000-8000-000000000042','83614260-0000-4000-8000-000000000020','83614260-0000-4000-8000-000000000032','furnishings_authorization','Private wave',false,now(),'83614260-0000-4000-8000-000000000001');
INSERT INTO furnishing_authorization_items (source_ffe_item_id,commercial_document_id,name,item_type,quantity,client_unit_price_cents,client_line_total_cents,snapshot,sort_order)
SELECT ('83614260-0000-4000-8000-' || lpad((52+ord)::text,12,'0'))::uuid, '83614260-0000-4000-8000-000000000042'::uuid, 'Adversarial photo', 'fixed',1,100,100,
jsonb_build_object('internalNotes','SECRET_PROJECTION','clientImage',image,'leadTime',lead)
  || CASE ord WHEN 0 THEN '{"clientName":"Window seat"}'::jsonb WHEN 1 THEN '{"clientName":null}'::jsonb ELSE '{}'::jsonb END, ord
FROM (VALUES
(0,'{"version":1,"url":"https://images.example.test/safe.jpg","storagePath":"SECRET_PROJECTION","notes":"SECRET_PROJECTION"}'::jsonb,'{"version":1,"weeks":6,"source":"SECRET_PROJECTION"}'::jsonb),
(1,'{"version":1,"url":"https://images.example.test/storage/v1/object/sign/private/a.jpg?token=SECRET_PROJECTION"}'::jsonb,'{"version":1,"weeks":105}'::jsonb),
(2,'{"version":2,"url":"https://images.example.test/unknown.jpg"}'::jsonb,'{"version":2,"weeks":6}'::jsonb),
(3,NULL,'{"version":1,"weeks":"6"}'::jsonb),
(4,NULL,'{"version":1,"weeks":6.5}'::jsonb),
(5,NULL,'{"version":1,"weeks":-1}'::jsonb)) cases(ord,image,lead);
CREATE FUNCTION pg_temp.assert_safe_images(body jsonb) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF body#>'{items,0,clientImage}' IS DISTINCT FROM '{"version":1,"url":"https://images.example.test/safe.jpg"}'::jsonb
     OR body#>'{items,1,clientImage}' IS DISTINCT FROM '{"version":1,"url":null}'::jsonb
     OR body#>'{items,2}' ? 'clientImage'
     OR body::text LIKE '%SECRET_PROJECTION%' THEN
    RAISE EXCEPTION 'P23 adversarial client/preview image allowlist: %',body;
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.assert_safe_images(jsonb) TO authenticated;
-- US-41: only a v1 lead time projects, rebuilt from whole weeks 0..104.
CREATE FUNCTION pg_temp.assert_safe_lead_times(body jsonb) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF body#>'{items,0,leadTime}' IS DISTINCT FROM '{"version":1,"weeks":6}'::jsonb
     OR body#>'{items,1,leadTime}' IS DISTINCT FROM '{"version":1,"weeks":null}'::jsonb
     OR body#>'{items,2}' ? 'leadTime'
     OR body#>'{items,3,leadTime}' IS DISTINCT FROM '{"version":1,"weeks":null}'::jsonb
     OR body#>'{items,4,leadTime}' IS DISTINCT FROM '{"version":1,"weeks":null}'::jsonb
     OR body#>'{items,5,leadTime}' IS DISTINCT FROM '{"version":1,"weeks":null}'::jsonb
     OR body::text LIKE '%SECRET_PROJECTION%' THEN
    RAISE EXCEPTION 'P25 adversarial client/preview lead time allowlist: %',body;
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.assert_safe_lead_times(jsonb) TO authenticated;
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
  PERFORM pg_temp.assert_safe_images(public.get_commercial_document_send_snapshot('83614260-0000-4000-8000-000000000032')#>'{furnishingsPreview,body}');
  PERFORM pg_temp.assert_safe_lead_times(public.get_commercial_document_send_snapshot('83614260-0000-4000-8000-000000000032')#>'{furnishingsPreview,body}');
  IF (SELECT jsonb_agg(i->'leadTime' ORDER BY o) FROM jsonb_array_elements(public.get_commercial_document_send_snapshot('83614260-0000-4000-8000-000000000032')#>'{furnishingsPreview,body,items}') WITH ORDINALITY x(i,o))
     IS DISTINCT FROM (SELECT jsonb_agg(i->'leadTime' ORDER BY o) FROM jsonb_array_elements(public.get_client_commercial_document_bundle('83614260-0000-4000-8000-000000000032')#>'{furnishings,items}') WITH ORDINALITY x(i,o)) THEN
    RAISE EXCEPTION 'P26 preview and client bundle project the same lead times';
  END IF;
  -- US-41: a frozen clientName is the description; null or absent keeps the row name.
  IF (SELECT jsonb_agg(i->'description' ORDER BY o) FROM jsonb_array_elements(public.get_commercial_document_send_snapshot('83614260-0000-4000-8000-000000000032')#>'{furnishingsPreview,body,items}') WITH ORDINALITY x(i,o))
     IS DISTINCT FROM '["Window seat","Adversarial photo","Adversarial photo","Adversarial photo","Adversarial photo","Adversarial photo"]'::jsonb
     OR (SELECT jsonb_agg(i->'name' ORDER BY o) FROM jsonb_array_elements(public.get_client_commercial_document_bundle('83614260-0000-4000-8000-000000000032')#>'{furnishings,items}') WITH ORDINALITY x(i,o))
     IS DISTINCT FROM '["Window seat","Adversarial photo","Adversarial photo","Adversarial photo","Adversarial photo","Adversarial photo"]'::jsonb THEN
    RAISE EXCEPTION 'P27 client name projects from the frozen clientName only';
  END IF;
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
  IF item->'clientImage' IS DISTINCT FROM '{"version":1,"url":"https://images.example.test/own.jpg"}'::jsonb
     OR b#>'{items,1}' ? 'clientImage'
     OR public.get_client_commercial_document_bundle('83614260-0000-4000-8000-000000000030')#>'{furnishings,items,0,clientImage}' IS DISTINCT FROM item->'clientImage' THEN
    RAISE EXCEPTION 'P20 frozen image parity and absent legacy field: %',item;
  END IF;
  -- Frozen at 8 weeks; the live line now says 30 and must not leak through.
  IF item->'leadTime' IS DISTINCT FROM '{"version":1,"weeks":8}'::jsonb
     OR b#>'{items,1}' ? 'leadTime'
     OR public.get_client_commercial_document_bundle('83614260-0000-4000-8000-000000000030')#>'{furnishings,items,0,leadTime}' IS DISTINCT FROM item->'leadTime'
     OR public.get_client_commercial_document_bundle('83614260-0000-4000-8000-000000000030')#>'{furnishings,items,1}' ? 'leadTime' THEN
    RAISE EXCEPTION 'P24 frozen lead time parity and absent legacy field: %',b;
  END IF;
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
SELECT pg_temp.assert_safe_images(public.get_client_commercial_document_bundle('83614260-0000-4000-8000-000000000032')->'furnishings');
SELECT pg_temp.assert_safe_lead_times(public.get_client_commercial_document_bundle('83614260-0000-4000-8000-000000000032')->'furnishings');
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
CREATE TEMP TABLE before_stale_send AS
SELECT to_jsonb(p) proposal,
       (SELECT COALESCE(jsonb_agg(to_jsonb(d) ORDER BY d.id), '[]'::jsonb)
        FROM proposal_send_dispatches d WHERE d.proposal_id = p.id) dispatches
FROM proposals p WHERE p.id='83614260-0000-4000-8000-000000000030';
GRANT SELECT ON reviewed TO authenticated;
SET LOCAL ROLE authenticated;
DO $$
DECLARE refusal text;
BEGIN
  BEGIN
    PERFORM public.send_commercial_document('83614260-0000-4000-8000-000000000030',(SELECT fingerprint FROM reviewed));
    RAISE EXCEPTION 'P13 stale reviewed fingerprint must refuse with PT409';
  EXCEPTION WHEN SQLSTATE 'PT409' OR serialization_failure THEN
    GET STACKED DIAGNOSTICS refusal = RETURNED_SQLSTATE;
    IF refusal IS DISTINCT FROM 'PT409' THEN
      RAISE EXCEPTION 'P13 stale reviewed fingerprint must refuse with PT409, got %', refusal;
    END IF;
  END;
END $$;
RESET ROLE;
DO $$ BEGIN
  IF (SELECT proposal FROM before_stale_send) IS DISTINCT FROM
       (SELECT to_jsonb(p) FROM proposals p WHERE p.id='83614260-0000-4000-8000-000000000030')
     OR (SELECT dispatches FROM before_stale_send) IS DISTINCT FROM
       (SELECT COALESCE(jsonb_agg(to_jsonb(d) ORDER BY d.id), '[]'::jsonb) FROM proposal_send_dispatches d
        WHERE d.proposal_id='83614260-0000-4000-8000-000000000030') THEN
    RAISE EXCEPTION 'P14 stale PT409 refusal leaves exact proposal and dispatches unchanged';
  END IF;
  RAISE NOTICE 'P6-P14 access, no mutation, STABLE and stale refusal passed; no external delivery invoked';
END $$;
ROLLBACK;
