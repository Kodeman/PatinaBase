-- 00866 / SQ-1804 — inbound notices describe this delivery, not the full PO.
-- Fixtures and composed drafts roll back; never reset the shared database.
BEGIN;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '5s';
CREATE TEMP TABLE inbound_notice_results(label text, passed boolean);
CREATE FUNCTION pg_temp.check_inbound(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO inbound_notice_results VALUES(label, ok IS TRUE);
  RAISE NOTICE '%: %', CASE WHEN ok IS TRUE THEN 'PASS' ELSE 'FAIL' END, label;
END;
$$;
DO $inbound_notices$
DECLARE
  actor uuid := gen_random_uuid(); org uuid;
  project uuid := gen_random_uuid(); vendor uuid := gen_random_uuid();
  receiver uuid := gen_random_uuid(); contact uuid := gen_random_uuid();
  po uuid := gen_random_uuid(); chair uuid := gen_random_uuid(); lamp uuid := gen_random_uuid();
  first_shipment uuid := gen_random_uuid(); second_shipment uuid := gen_random_uuid(); legacy_shipment uuid := gen_random_uuid();
  first_notice public.procurement_drafts%ROWTYPE;
  second_notice public.procurement_drafts%ROWTYPE;
  legacy_notice public.procurement_drafts%ROWTYPE;
  replay public.procurement_drafts%ROWTYPE;
  advance_notice public.procurement_drafts%ROWTYPE;
  helper regprocedure := 'public._compose_receiver_inbound_draft(uuid,uuid,date,date,text,text)'::regprocedure;
  first_pieces text := E'- 4 × Dining chair (set of 6)\n- 1 × Table lamp';
  second_pieces text := '- 2 × Dining chair (set of 6)';
  full_pieces text := E'- 6 × Dining chair (set of 6)\n- 3 × Table lamp';
BEGIN
  INSERT INTO auth.users(id,email,encrypted_password,email_confirmed_at,created_at,updated_at,instance_id,aud,role)
  VALUES(actor,actor||'@sq1804.test.invalid','',now(),now(),now(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated');
  INSERT INTO public.profiles(id,email,full_name,is_designer)
  VALUES(actor,actor||'@sq1804.test.invalid','Inbound notice designer',true)
  ON CONFLICT(id) DO UPDATE SET is_designer=true;
  org := public._primary_studio_for(actor);
  INSERT INTO public.projects(id,name,designer_id,created_by,studio_id,status)
  VALUES(project,'SQ1804 inbound notices',actor,actor,org,'active');
  INSERT INTO public.vendors(id,name) VALUES(vendor,'SQ1804 maker');
  INSERT INTO public.studio_contacts(id,organization_id,entity_kind,contact_kind,full_name,email)
  VALUES(contact,org,'person','receiver','Rae Dock','dock@sq1804.test.invalid');
  INSERT INTO public.studio_locations(id,organization_id,kind,label,studio_contact_id)
  VALUES(receiver,org,'receiver','SQ1804 warehouse',contact);
  INSERT INTO public.purchase_orders(id,designer_id,created_by,project_id,vendor_id,payment_pattern,total_cents,status,is_patina_catalog,ship_to_location_id,sidemark)
  VALUES(po,actor,actor,project,vendor,'net_30',900,'confirmed',false,receiver,'SQ1804 dining');
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  INSERT INTO public.project_ffe_items(id,project_id,name,status,quantity,vendor_id,unit_price_cents,design_disposition,sort_order,purchase_order_id)
  VALUES(chair,project,'Dining chair (set of 6)','approved',6,vendor,100,'selected',1,po),
    (lamp,project,'Table lamp','approved',3,vendor,100,'selected',2,po);
  INSERT INTO public.po_shipments(id,purchase_order_id,shipped_on,current_eta,carrier,tracking)
  VALUES(first_shipment,po,current_date,current_date+2,'Estes','SQ1804-PRO'),
    (second_shipment,po,current_date,current_date+2,'Estes','SQ1804-PRO'),
    (legacy_shipment,po,current_date,current_date+2,'Estes','SQ1804-PRO');
  INSERT INTO public.po_shipment_lines(shipment_id,ffe_item_id,qty)
  VALUES(first_shipment,chair,4),(first_shipment,lamp,1),(second_shipment,chair,2);

  SET LOCAL ROLE authenticated;
  first_notice := public.compose_receiver_inbound_draft(first_shipment);
  second_notice := public.compose_receiver_inbound_draft(second_shipment);
  legacy_notice := public.compose_receiver_inbound_draft(legacy_shipment);
  replay := public.compose_receiver_inbound_draft(first_shipment);
  RESET ROLE;
  PERFORM pg_temp.check_inbound(split_part(split_part(first_notice.body,E'Pieces:\n',2),E'\n\n',1)=first_pieces,
    'four-of-six shipment lists shipped quantities for each line in order');
  PERFORM pg_temp.check_inbound(split_part(split_part(second_notice.body,E'Pieces:\n',2),E'\n\n',1)=second_pieces,
    'two-of-six shipment lists only its own pieces');
  PERFORM pg_temp.check_inbound(split_part(split_part(legacy_notice.body,E'Pieces:\n',2),E'\n\n',1)=full_pieces,
    'no-lines shipment keeps full PO quantities');
  PERFORM pg_temp.check_inbound(replace(first_notice.body,first_pieces,'')=replace(legacy_notice.body,full_pieces,'')
    AND replace(second_notice.body,second_pieces,'')=replace(legacy_notice.body,full_pieces,''),
    'only pieces differ between notices with identical shipment facts');
  -- Composition already creates a fresh draft on every call. Preserve that
  -- behavior: replay stability means identical content, not row deduplication.
  PERFORM pg_temp.check_inbound(replay.body=first_notice.body AND replay.subject=first_notice.subject,
    're-compose preserves identical notice content');
  PERFORM pg_temp.check_inbound(replay.id<>first_notice.id
    AND (SELECT count(*)=2 FROM public.procurement_drafts WHERE shipment_id=first_shipment),
    're-compose keeps existing fresh-row behavior');
  PERFORM pg_temp.check_inbound(first_notice.organization_id=org AND first_notice.project_id=project
    AND first_notice.purchase_order_id=po AND first_notice.shipment_id=first_shipment
    AND first_notice.kind='receiver_inbound_notice' AND first_notice.to_contact_id=contact
    AND first_notice.to_email='dock@sq1804.test.invalid' AND first_notice.status='awaiting_review'
    AND first_notice.sent_at IS NULL AND first_notice.sent_by IS NULL,
    'notice keeps recipient subject linkage and draft-only state');
  advance_notice := public._compose_receiver_inbound_draft(po,NULL,current_date,current_date+2,'Estes','SQ1804-PRO');
  PERFORM pg_temp.check_inbound(advance_notice.body=legacy_notice.body AND advance_notice.shipment_id IS NULL,
    'advance notice without shipment keeps full PO listing');
  PERFORM pg_temp.check_inbound(NOT has_function_privilege('anon',helper,'EXECUTE')
    AND NOT has_function_privilege('authenticated',helper,'EXECUTE')
    AND has_function_privilege('service_role',helper,'EXECUTE'),
    'helper remains service-role only, not executable by anon or authenticated');
  PERFORM pg_temp.check_inbound((SELECT pg_get_userbyid(proowner)='postgres' AND prosecdef
    AND proconfig=ARRAY['search_path=public, pg_temp'] FROM pg_proc WHERE oid=helper),
    'helper keeps postgres owner security definer and pinned search path');
  UPDATE public.purchase_orders SET ship_to_location_id=NULL WHERE id=po;
  SET LOCAL ROLE authenticated;
  replay := public.compose_receiver_inbound_draft(first_shipment);
  RESET ROLE;
  PERFORM pg_temp.check_inbound(replay.id IS NULL
    AND (SELECT count(*)=2 FROM public.procurement_drafts WHERE shipment_id=first_shipment),
    'public wrapper still creates no job-site notice');
END;
$inbound_notices$;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM inbound_notice_results WHERE NOT passed) THEN
    RAISE EXCEPTION 'assertion failed: % inbound notice regressions',
      (SELECT count(*) FROM inbound_notice_results WHERE NOT passed);
  END IF;
  RAISE NOTICE 'PASS 00866: % assertions',(SELECT count(*) FROM inbound_notice_results);
END $$;
ROLLBACK;
