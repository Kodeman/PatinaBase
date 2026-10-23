-- 00855 / SQ-1768: real PO creation, release, service send stamp and backfill.
-- All fixtures, reapplied DDL and backfill effects roll back. A failed assertion
-- raises at the end so ON_ERROR_STOP produces a nonzero exit, not a TAP false green.
BEGIN;
SET LOCAL statement_timeout = '45s';
SET LOCAL lock_timeout = '5s';
CREATE TEMP TABLE f02_results (name text, passed boolean);
CREATE FUNCTION pg_temp.check_f02(p_name text, p_passed boolean) RETURNS void
LANGUAGE sql AS $$ INSERT INTO f02_results VALUES (p_name, COALESCE(p_passed, false)); $$;
CREATE TEMP TABLE f02_cases (name text PRIMARY KEY, item_id uuid, po_id uuid);
GRANT SELECT ON f02_cases TO service_role;

DO $fixtures$
DECLARE
  v_actor uuid := gen_random_uuid();
  v_org uuid := gen_random_uuid();
  v_project uuid := gen_random_uuid();
  v_vendor uuid := gen_random_uuid();
  v_name text; v_item uuid; v_po public.purchase_orders%ROWTYPE;
BEGIN
  INSERT INTO auth.users (id,email,encrypted_password,email_confirmed_at,created_at,updated_at,instance_id,aud,role)
  VALUES (v_actor,v_actor || '@test.invalid','',now(),now(),now(),
    '00000000-0000-0000-0000-000000000000','authenticated','authenticated');
  INSERT INTO public.profiles (id,email,full_name)
  VALUES (v_actor,v_actor || '@test.invalid','F02 Designer') ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.organizations (id,type,name,slug)
  VALUES (v_org,'design_studio','F02 Studio','f02-' || v_org);
  INSERT INTO public.organization_members (organization_id,user_id,role,status,joined_at)
  VALUES (v_org,v_actor,'owner','active',now());
  INSERT INTO public.projects (id,name,designer_id,created_by,studio_id)
  VALUES (v_project,'F02 Buying',v_actor,v_actor,v_org);
  INSERT INTO public.vendors (id,name) VALUES (v_vendor,'F02 Maker');
  PERFORM set_config('request.jwt.claim.sub',v_actor::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_actor,'role','authenticated')::text,true);
  PERFORM set_config('app.ffe_mutation_rpc','on',true);

  FOREACH v_name IN ARRAY ARRAY['draft','held','sent','later','add_line','cancel','purchased',
    'legacy_draft','legacy_released','legacy_held','legacy_sent','legacy_recorded',
    'legacy_billed','legacy_void','legacy_returned','legacy_later','standalone'] LOOP
    v_item := gen_random_uuid();
    INSERT INTO public.project_ffe_items (id,project_id,name,status,quantity,unit_price_cents,
      trade_price_cents,line_total_cents,vendor_id,design_disposition,blocked)
    VALUES (v_item,v_project,'F02 ' || v_name,'approved',1,10000,10000,10000,v_vendor,'selected',false);
    INSERT INTO f02_cases VALUES (v_name,v_item,NULL);
    IF v_name NOT IN ('purchased','add_line','standalone') THEN
      v_po := public.create_purchase_order(v_project,v_vendor,'net_30',ARRAY[v_item]);
      UPDATE f02_cases SET po_id=v_po.id WHERE name=v_name;
    END IF;
  END LOOP;
  PERFORM pg_temp.check_f02('draft PO creation does not order the item',
    (SELECT status='approved' FROM public.project_ffe_items WHERE id=(SELECT item_id FROM f02_cases WHERE name='draft')));

  -- The actual purchase RPC remains a commitment, not a draft order.
  PERFORM public.record_studio_purchase(jsonb_build_object('projectId',v_project,
    'ffeItemId',(SELECT item_id FROM f02_cases WHERE name='purchased'),
    'kind','card_retail','payeeName','F02 Shop','purchasedOn',current_date,'amountCents',10000));
  PERFORM pg_temp.check_f02('record_studio_purchase still orders the item',
    (SELECT status='ordered' FROM public.project_ffe_items WHERE id=(SELECT item_id FROM f02_cases WHERE name='purchased')));

  -- Gate every order, then exercise the authoritative hold/release path.
  PERFORM public.set_studio_release_gate(v_org,NULL,true);
  PERFORM public.hold_purchase_order_for_release((SELECT po_id FROM f02_cases WHERE name='held'));
  PERFORM pg_temp.check_f02('held unsent PO does not order the item',
    (SELECT status='approved' FROM public.project_ffe_items WHERE id=(SELECT item_id FROM f02_cases WHERE name='held')));
  v_po := public.release_purchase_order((SELECT po_id FROM f02_cases WHERE name='held'));
  PERFORM pg_temp.check_f02('released unsent PO does not order the item',
    v_po.released_at IS NOT NULL AND v_po.sent_at IS NULL AND v_po.status='draft' AND
    (SELECT status='approved' FROM public.project_ffe_items WHERE id=(SELECT item_id FROM f02_cases WHERE name='held')));
  PERFORM public.hold_purchase_order_for_release((SELECT po_id FROM f02_cases WHERE name='legacy_held'));
  PERFORM public.release_purchase_order((SELECT po_id FROM f02_cases WHERE name='legacy_released'));
  -- Keep the real release gate off for the independent send tests below.
  PERFORM public.set_studio_release_gate(v_org,NULL,false);
END;
$fixtures$;

-- This is po-send's actual service-role write: sent_at alone, no status change.
SET LOCAL ROLE service_role;
UPDATE public.purchase_orders SET sent_at=now()
WHERE id IN (SELECT po_id FROM f02_cases WHERE name IN ('sent','legacy_sent'));
RESET ROLE;
SELECT pg_temp.check_f02('sent_at-only service stamp orders linked items',
  (SELECT item.status='ordered' AND po.status='draft'
   FROM f02_cases c JOIN public.project_ffe_items item ON item.id=c.item_id
   JOIN public.purchase_orders po ON po.id=c.po_id WHERE c.name='sent'));

UPDATE public.project_ffe_items SET status='installed'
WHERE id=(SELECT item_id FROM f02_cases WHERE name='later');
UPDATE public.purchase_orders SET sent_at=now()
WHERE id=(SELECT po_id FROM f02_cases WHERE name='later');
SELECT pg_temp.check_f02('send stamp never demotes a later item stage',
  (SELECT status='installed' FROM public.project_ffe_items WHERE id=(SELECT item_id FROM f02_cases WHERE name='later')));
-- The existing immutable-line trigger requires each header to match its lines.
UPDATE public.purchase_orders SET total_cents=20000
WHERE id=(SELECT po_id FROM f02_cases WHERE name='draft');
UPDATE public.project_ffe_items SET purchase_order_id=(SELECT po_id FROM f02_cases WHERE name='draft')
WHERE id=(SELECT item_id FROM f02_cases WHERE name='add_line');
SELECT pg_temp.check_f02('adding a line to an unsent PO does not order it',
  (SELECT status='approved' FROM public.project_ffe_items WHERE id=(SELECT item_id FROM f02_cases WHERE name='add_line')));
UPDATE public.purchase_orders SET total_cents=20000
WHERE id=(SELECT po_id FROM f02_cases WHERE name='sent');
UPDATE public.project_ffe_items SET purchase_order_id=(SELECT po_id FROM f02_cases WHERE name='sent')
WHERE id=(SELECT item_id FROM f02_cases WHERE name='add_line');
SELECT pg_temp.check_f02('adding a line to a sent PO orders it',
  (SELECT status='ordered' FROM public.project_ffe_items WHERE id=(SELECT item_id FROM f02_cases WHERE name='add_line')));
UPDATE public.purchase_orders SET status='confirmed' WHERE id=(SELECT po_id FROM f02_cases WHERE name='draft');
SELECT pg_temp.check_f02('confirmation without sent_at does not order the item',
  (SELECT status='approved' FROM public.project_ffe_items WHERE id=(SELECT item_id FROM f02_cases WHERE name='draft')));
UPDATE public.purchase_orders SET status='cancelled' WHERE id=(SELECT po_id FROM f02_cases WHERE name='cancel');
SELECT pg_temp.check_f02('cancelling an unsent draft leaves no stale ordered stage',
  (SELECT status='approved' AND purchase_order_id IS NULL FROM public.project_ffe_items
   WHERE id=(SELECT item_id FROM f02_cases WHERE name='cancel')));

-- Existing shipment/payment cascade is independent of the draft/send split.
INSERT INTO public.po_payments (purchase_order_id,kind,amount_cents,state,paid_date)
SELECT po_id,'deposit',10000,'paid',current_date FROM f02_cases WHERE name='sent';
UPDATE public.purchase_orders SET status='shipped',payment_pattern='fifty_fifty'
WHERE id=(SELECT po_id FROM f02_cases WHERE name='sent');
SELECT pg_temp.check_f02('shipping retains the item and balance side effects',
  (SELECT status='shipped' FROM public.project_ffe_items WHERE id=(SELECT item_id FROM f02_cases WHERE name='sent'))
  AND (SELECT state='due' FROM public.po_payments WHERE kind='balance'
    AND purchase_order_id=(SELECT po_id FROM f02_cases WHERE name='sent')));

-- Reconstruct the legacy-only stamp without disabling guards or triggers.
UPDATE public.project_ffe_items SET status='ordered'
WHERE id IN (SELECT item_id FROM f02_cases WHERE name LIKE 'legacy_%' OR name='standalone');
UPDATE public.project_ffe_items SET status='production'
WHERE id=(SELECT item_id FROM f02_cases WHERE name='legacy_later');
INSERT INTO public.studio_purchases (project_id,ffe_item_id,kind,payee_name,purchased_on,amount_cents,status,
  voided_at,void_reason,returned_on)
SELECT item.project_id,c.item_id,'card_retail','F02 Shop',current_date,10000,
  replace(c.name,'legacy_',''),
  CASE WHEN c.name='legacy_void' THEN now() END,
  CASE WHEN c.name='legacy_void' THEN 'F02 void' END,
  CASE WHEN c.name='legacy_returned' THEN current_date END
FROM f02_cases c JOIN public.project_ffe_items item ON item.id=c.item_id
WHERE c.name IN ('legacy_recorded','legacy_billed','legacy_void','legacy_returned');
CREATE TEMP TABLE f02_before_backfill AS SELECT item.id,item.status,item.updated_at,item.ctid AS row_version
FROM public.project_ffe_items item JOIN f02_cases c ON c.item_id=item.id;

-- A negative control can skip reapplication to exercise the installed baseline.
\if :{?skip_backfill}
\else
\ir ../migrations/00855_po_sent_counts_as_ordered.sql
\endif
SELECT pg_temp.check_f02('backfill repairs only unsent-only ordered rows',
  (SELECT bool_and(item.status='approved') FROM f02_cases c JOIN public.project_ffe_items item ON item.id=c.item_id
   WHERE c.name IN ('legacy_draft','legacy_released','legacy_held','legacy_void','legacy_returned')));
SELECT pg_temp.check_f02('backfill leaves sent and live purchased rows untouched',
  (SELECT bool_and(item.status=b.status AND item.updated_at=b.updated_at AND item.ctid=b.row_version)
   FROM f02_cases c JOIN public.project_ffe_items item ON item.id=c.item_id
   JOIN f02_before_backfill b ON b.id=item.id
   WHERE c.name IN ('legacy_sent','legacy_recorded','legacy_billed','purchased')));
SELECT pg_temp.check_f02('backfill preserves later stages and unlinked ordered rows',
  (SELECT bool_and(item.status=b.status AND item.updated_at=b.updated_at AND item.ctid=b.row_version)
   FROM f02_cases c JOIN public.project_ffe_items item ON item.id=c.item_id
   JOIN f02_before_backfill b ON b.id=item.id WHERE c.name IN ('legacy_later','standalone')));
CREATE TEMP TABLE f02_after_backfill AS SELECT item.id,item.status,item.updated_at,item.ctid AS row_version
FROM public.project_ffe_items item JOIN f02_cases c ON c.item_id=item.id;
\if :{?skip_backfill}
\else
\ir ../migrations/00855_po_sent_counts_as_ordered.sql
\endif
SELECT pg_temp.check_f02('backfill is idempotent including updated_at',
  (SELECT bool_and(item.status=b.status AND item.updated_at=b.updated_at AND item.ctid=b.row_version)
   FROM f02_after_backfill b JOIN public.project_ffe_items item ON item.id=b.id));
SET CONSTRAINTS ALL IMMEDIATE;
TABLE f02_results;
DO $assertions$
DECLARE v_failed integer;
BEGIN
  SELECT count(*) INTO v_failed FROM f02_results WHERE NOT passed;
  IF v_failed>0 THEN RAISE EXCEPTION 'F02: % failed assertions',v_failed; END IF;
  RAISE NOTICE 'F02: % passed assertions', (SELECT count(*) FROM f02_results);
END;
$assertions$;
ROLLBACK;
