-- 00860 / F-02: the real Desk feed distinguishes drafts, releases and sends.
BEGIN;
SET LOCAL statement_timeout = '45s';
SET LOCAL lock_timeout = '5s';
CREATE TEMP TABLE desk_po_cases (name text PRIMARY KEY, proposal_id uuid, po_id uuid);
GRANT SELECT ON desk_po_cases TO authenticated, service_role;
DO $fixtures$
DECLARE
  actor uuid := gen_random_uuid();
  org uuid := gen_random_uuid();
  project uuid := gen_random_uuid();
  vendor uuid := gen_random_uuid();
  proposal uuid := gen_random_uuid();
  proposal_item uuid := gen_random_uuid();
  item uuid := gen_random_uuid();
  po public.purchase_orders%ROWTYPE;
BEGIN
  INSERT INTO auth.users (id,email,encrypted_password,email_confirmed_at,created_at,updated_at,instance_id,aud,role)
  VALUES (actor,actor || '@test.invalid','',now(),now(),now(),
    '00000000-0000-0000-0000-000000000000','authenticated','authenticated');
  INSERT INTO public.profiles (id,email,full_name)
  VALUES (actor,actor || '@test.invalid','Desk PO Designer') ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.organizations (id,type,name,slug)
  VALUES (org,'design_studio','Desk PO Studio','desk-po-' || org);
  INSERT INTO public.organization_members (organization_id,user_id,role,status,joined_at)
  VALUES (org,actor,'owner','active',now());
  INSERT INTO public.projects (id,name,designer_id,created_by,studio_id)
  VALUES (project,'Desk PO Buying',actor,actor,org);
  INSERT INTO public.vendors (id,name) VALUES (vendor,'Desk PO Maker');
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  PERFORM set_config('app.ffe_mutation_rpc','on',true);
  INSERT INTO public.proposals (id,project_id,designer_id,title)
  VALUES (proposal,project,actor,'Desk PO proposal');
  INSERT INTO public.proposal_items (id,proposal_id,name,quantity,unit_price,unit_sell_price,line_total_cents)
  VALUES (proposal_item,proposal,'Desk PO piece',1,10000,10000,10000);
  INSERT INTO public.project_ffe_items (id,project_id,name,status,quantity,unit_price_cents,
    trade_price_cents,line_total_cents,vendor_id,design_disposition,blocked,source_proposal_item_id)
  VALUES (item,project,'Desk PO piece','approved',1,10000,10000,10000,vendor,'selected',false,proposal_item);
  po := public.create_purchase_order(project,vendor,'net_30',ARRAY[item]);
  INSERT INTO desk_po_cases VALUES ('order',proposal,po.id);
END;
$fixtures$;
CREATE FUNCTION pg_temp.assert_po_sent(expected boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE rows jsonb; actual jsonb;
BEGIN
  rows := public.desk_read(NULL)->'live_proposals';
  SELECT pi->'ffe'->0->'po_sent' INTO actual
  FROM jsonb_array_elements(rows) AS pr,
       jsonb_array_elements(pr->'items') AS pi
  WHERE pr->>'id' = (SELECT proposal_id::text FROM desk_po_cases WHERE name='order');
  IF actual IS DISTINCT FROM to_jsonb(expected) THEN
    RAISE EXCEPTION '%: expected %, got %',label,expected,actual;
  END IF;
  RAISE NOTICE 'PASS: %', label;
END;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.assert_po_sent(boolean,text) TO authenticated;
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_po_sent(false,'draft PO is not sent in the Desk feed');
SELECT public.release_purchase_order(po_id) FROM desk_po_cases;
SELECT pg_temp.assert_po_sent(false,'released unsent PO is not sent in the Desk feed');
RESET ROLE;
SET LOCAL ROLE service_role;
UPDATE public.purchase_orders SET sent_at=now() WHERE id=(SELECT po_id FROM desk_po_cases);
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_po_sent(true,'sent PO is sent in the Desk feed');
RESET ROLE;
ROLLBACK;
