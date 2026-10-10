-- ═══════════════════════════════════════════════════════════════════════════
-- Remove without ceremony before publication, and restore (00731; US-21 D8,
-- T-11)
--
-- Anchors: archive_project_selection base 00435:521-545; removed_* columns
-- 00434:208-210; removed_disposition 00729; review publication
-- project_review_items.source_ffe_item_id → project_review_editions.status
-- <> 'draft' (00434:294-327); thread primary 00447:453.
--
-- Cases:
--   (1) An unpublished line is removed with no reason, then restored with its
--       prior disposition (scenario S5, a8: "Removed · 1" restorable). A second
--       remove is a no-op that keeps removed_disposition.
--   (2) A line in a published review edition needs a reason (≥ 5 characters).
--   (3) An authorized line refuses with the Record a change sentence.
--   (3b) A Trade Scope presence line refuses with the scope sentence.
--   (4) A line removed before 00731 (removed_disposition NULL) restores to
--       'candidate'.
--   (5) Restore refuses when the thread has another active primary, and
--       allows it when the only other line is superseded.
--   (6) Authority: a client cannot restore; anon has no EXECUTE.
--
-- Run:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f supabase/tests/ffe/pieces_remove_restore_test.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;
SET LOCAL statement_timeout='60s';

CREATE OR REPLACE FUNCTION pg_temp.assume_rr_actor(p_actor uuid) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',p_actor,'role','authenticated')::text,true);
  PERFORM set_config('request.jwt.claim.sub',p_actor::text,true);
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
END; $$;

INSERT INTO auth.users(id,email,encrypted_password,email_confirmed_at,created_at,updated_at,instance_id,aud,role) VALUES
('73100000-0000-4000-8000-000000000001','rr-owner@test.invalid','',now(),now(),now(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
('73100000-0000-4000-8000-000000000002','rr-client@test.invalid','',now(),now(),now(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated');
INSERT INTO public.profiles(id,email,full_name,is_designer) VALUES
('73100000-0000-4000-8000-000000000001','rr-owner@test.invalid','RR Owner',true),
('73100000-0000-4000-8000-000000000002','rr-client@test.invalid','RR Client',false) ON CONFLICT(id) DO NOTHING;
INSERT INTO public.organizations(id,name,slug,type,status) VALUES
('73140000-0000-4000-8000-000000000001','RR Studio','rr-studio-00731','design_studio','active');
INSERT INTO public.organization_members(user_id,organization_id,role,status) VALUES
('73100000-0000-4000-8000-000000000001','73140000-0000-4000-8000-000000000001','owner','active');
INSERT INTO public.user_roles(user_id,role_id,granted_by)
SELECT '73100000-0000-4000-8000-000000000001',role.id,'73100000-0000-4000-8000-000000000001'
FROM public.roles AS role WHERE role.name='studio_owner';
INSERT INTO public.projects(id,name,designer_id,client_id,created_by,studio_id) VALUES
('73110000-0000-4000-8000-000000000001','Remove Restore Project','73100000-0000-4000-8000-000000000001',
 '73100000-0000-4000-8000-000000000002','73100000-0000-4000-8000-000000000001','73140000-0000-4000-8000-000000000001');
INSERT INTO public.vendors(id,name) VALUES('73120000-0000-4000-8000-000000000001','RR Vendor');
INSERT INTO public.products(id,name,price_retail,price_trade,images,vendor_id,captured_by,captured_at,layer,status) VALUES
('73130000-0000-4000-8000-000000000001','RR Sofa',500000,300000,ARRAY['https://example.invalid/rr-sofa.jpg'],
 '73120000-0000-4000-8000-000000000001','73100000-0000-4000-8000-000000000001',now(),'catalog','published');

CREATE OR REPLACE FUNCTION pg_temp.rr_place(p_key text) RETURNS uuid LANGUAGE sql AS $$
  SELECT (public.place_product_in_project_v2(jsonb_build_object(
    'projectId','73110000-0000-4000-8000-000000000001','productId','73130000-0000-4000-8000-000000000001',
    'assignmentScope','throughout','disposition','selected','duplicateMode','create','idempotencyKey',p_key))->>'selectionId')::uuid;
$$;

DO $$
DECLARE
  v_line uuid; v_published uuid; v_authorized uuid; v_trade uuid; v_legacy uuid;
  v_a uuid; v_b uuid; v_c uuid; v_d uuid;
  v_result jsonb; v_row public.project_ffe_items%ROWTYPE; v_failed boolean;
BEGIN
  PERFORM pg_temp.assume_rr_actor('73100000-0000-4000-8000-000000000001');

  -- (1) Unpublished: removed with no reason, restored with its prior disposition.
  v_line:=pg_temp.rr_place('rr-unpublished');
  v_result:=public.archive_project_selection(v_line);
  SELECT * INTO v_row FROM public.project_ffe_items WHERE id=v_line;
  IF NOT (v_result->>'archived')::boolean OR v_row.removed_at IS NULL
     OR v_row.removed_by IS DISTINCT FROM '73100000-0000-4000-8000-000000000001'::uuid
     OR v_row.removal_reason IS DISTINCT FROM 'removed while building'
     OR v_row.removed_disposition IS DISTINCT FROM 'selected'
     OR v_row.design_disposition IS DISTINCT FROM 'not_selected' THEN
    RAISE EXCEPTION '(1) unpublished remove with no reason: got % / %', v_result, to_jsonb(v_row);
  END IF;
  PERFORM public.archive_project_selection(v_line,NULL);
  IF (SELECT removed_disposition FROM public.project_ffe_items WHERE id=v_line) IS DISTINCT FROM 'selected' THEN
    RAISE EXCEPTION '(1) a repeated remove overwrote removed_disposition';
  END IF;
  v_result:=public.restore_project_selection(v_line);
  SELECT * INTO v_row FROM public.project_ffe_items WHERE id=v_line;
  IF v_result IS DISTINCT FROM jsonb_build_object('selectionId',v_line,'restored',true)
     OR v_row.removed_at IS NOT NULL OR v_row.removed_by IS NOT NULL OR v_row.removal_reason IS NOT NULL
     OR v_row.removed_disposition IS NOT NULL OR v_row.design_disposition IS DISTINCT FROM 'selected' THEN
    RAISE EXCEPTION '(1) restore did not return the prior disposition: got % / %', v_result, to_jsonb(v_row);
  END IF;
  IF (SELECT primary_ffe_item_id FROM public.project_ffe_selection_threads WHERE id=v_row.selection_thread_id) IS DISTINCT FROM v_line THEN
    RAISE EXCEPTION '(1) restored line is not its thread primary';
  END IF;
  v_failed:=false;
  BEGIN PERFORM public.restore_project_selection(v_line);
  EXCEPTION WHEN check_violation THEN v_failed:=SQLERRM='This line is not removed.'; END;
  IF NOT v_failed THEN RAISE EXCEPTION '(1) restoring a live line was not refused'; END IF;

  -- (2) Published in a review edition: a reason is required.
  v_published:=pg_temp.rr_place('rr-published');
  PERFORM public.publish_project_review(jsonb_build_object('projectId','73110000-0000-4000-8000-000000000001',
    'title','Edition one','clientPriceMode','unit','boardIds','[]'::jsonb,
    'items',jsonb_build_array(jsonb_build_object('selectionId',v_published))));
  v_failed:=false;
  BEGIN PERFORM public.archive_project_selection(v_published,NULL);
  EXCEPTION WHEN check_violation THEN v_failed:=SQLERRM='archive reason must be at least 5 characters'; END;
  IF NOT v_failed THEN RAISE EXCEPTION '(2) published line removed with no reason'; END IF;
  v_failed:=false;
  BEGIN PERFORM public.archive_project_selection(v_published,'  no ');
  EXCEPTION WHEN check_violation THEN v_failed:=SQLERRM='archive reason must be at least 5 characters'; END;
  IF NOT v_failed THEN RAISE EXCEPTION '(2) published line removed with a 2-character reason'; END IF;
  PERFORM public.archive_project_selection(v_published,'  Client passed on it  ');
  SELECT * INTO v_row FROM public.project_ffe_items WHERE id=v_published;
  IF v_row.removal_reason IS DISTINCT FROM 'Client passed on it' OR v_row.removed_disposition IS DISTINCT FROM 'selected' THEN
    RAISE EXCEPTION '(2) published remove with a reason: got %', to_jsonb(v_row);
  END IF;

  -- (3) Authorized: refused with the Record a change sentence. The executed
  -- authorization is inserted directly (precedent release_security_test.sql
  -- :150-164); the RPC needs an executed design-services origin and a
  -- settled budget checkpoint, which this contract does not exercise.
  v_authorized:=pg_temp.rr_place('rr-authorized');
  INSERT INTO public.proposals(id,project_id,designer_id,title,status,document_kind,commercial_state,total_amount,subtotal)
  VALUES('73170000-0000-4000-8000-000000000001','73110000-0000-4000-8000-000000000001','73100000-0000-4000-8000-000000000001',
    'RR Authorization No. 1','accepted','furnishings_authorization','executed',500000,500000);
  INSERT INTO public.project_commercial_documents(id,project_id,proposal_id,document_kind,wave_name,is_origin,bound_at,executed_at,created_by)
  VALUES('73170000-0000-4000-8000-000000000002','73110000-0000-4000-8000-000000000001','73170000-0000-4000-8000-000000000001',
    'furnishings_authorization','Authorization No. 1',false,now(),now(),'73100000-0000-4000-8000-000000000001');
  INSERT INTO public.furnishing_authorization_items(id,commercial_document_id,source_ffe_item_id,product_id,name,room_name,
    category,item_type,quantity,client_unit_price_cents,client_line_total_cents,trade_unit_cost_cents,markup_percent,sort_order)
  VALUES('73170000-0000-4000-8000-000000000003','73170000-0000-4000-8000-000000000002',v_authorized,
    '73130000-0000-4000-8000-000000000001','RR Sofa','Throughout','seating','fixed',1,500000,500000,300000,66.67,0);
  IF public.ffe_line_authorization_state(v_authorized) IS NULL THEN
    RAISE EXCEPTION '(3) fixture: the line does not read as authorized';
  END IF;
  v_failed:=false;
  BEGIN PERFORM public.archive_project_selection(v_authorized,'Changed our minds');
  EXCEPTION WHEN check_violation THEN v_failed:=SQLERRM='Released lines change through Record a change.'; END;
  IF NOT v_failed THEN RAISE EXCEPTION '(3) authorized line was not refused with the Record a change sentence'; END IF;
  IF (SELECT removed_at FROM public.project_ffe_items WHERE id=v_authorized) IS NOT NULL THEN
    RAISE EXCEPTION '(3) authorized line was removed';
  END IF;

  -- (3b) A Trade Scope presence line is refused (W1 review, T-8 F5).
  v_trade:=pg_temp.rr_place('rr-trade-scope');
  INSERT INTO public.proposals(id,project_id,designer_id,title,status,document_kind,commercial_state,total_amount,subtotal)
  VALUES('73170000-0000-4000-8000-000000000011','73110000-0000-4000-8000-000000000001','73100000-0000-4000-8000-000000000001',
    'RR Trade Scope','accepted','trade_scope','executed',0,0);
  INSERT INTO public.project_commercial_documents(id,project_id,proposal_id,document_kind,is_origin,bound_at,executed_at,created_by)
  VALUES('73170000-0000-4000-8000-000000000012','73110000-0000-4000-8000-000000000001','73170000-0000-4000-8000-000000000011',
    'trade_scope',false,now(),now(),'73100000-0000-4000-8000-000000000001');
  PERFORM set_config('app.ffe_mutation_rpc','on',true);
  UPDATE public.project_ffe_items SET trade_scope_document_id='73170000-0000-4000-8000-000000000012' WHERE id=v_trade;
  v_failed:=false;
  BEGIN PERFORM public.archive_project_selection(v_trade,'Scope rewritten');
  EXCEPTION WHEN check_violation THEN v_failed:=SQLERRM='Trade Scope lines change in their scope.'; END;
  IF NOT v_failed THEN RAISE EXCEPTION '(3b) Trade Scope line was not refused with the scope sentence'; END IF;
  IF (SELECT removed_at FROM public.project_ffe_items WHERE id=v_trade) IS NOT NULL THEN
    RAISE EXCEPTION '(3b) Trade Scope line was removed';
  END IF;

  -- (4) Removed before 00731: no removed_disposition, restores to candidate.
  v_legacy:=pg_temp.rr_place('rr-legacy');
  PERFORM public.archive_project_selection(v_legacy);
  PERFORM set_config('app.ffe_mutation_rpc','on',true);
  UPDATE public.project_ffe_items SET removed_disposition=NULL WHERE id=v_legacy;
  PERFORM public.restore_project_selection(v_legacy);
  IF (SELECT design_disposition FROM public.project_ffe_items WHERE id=v_legacy) IS DISTINCT FROM 'candidate' THEN
    RAISE EXCEPTION '(4) a line with no removed_disposition did not restore to candidate';
  END IF;

  -- (5) Thread primary. A is replaced by B, then A is removed: B is the active
  -- primary, so A cannot come back.
  v_a:=pg_temp.rr_place('rr-thread-a');
  v_b:=(public.supersede_project_selection(jsonb_build_object('selectionId',v_a,'placementIds','[]'::jsonb))->>'selectionId')::uuid;
  PERFORM public.archive_project_selection(v_a);
  IF (SELECT removed_disposition FROM public.project_ffe_items WHERE id=v_a) IS DISTINCT FROM 'superseded' THEN
    RAISE EXCEPTION '(5) superseded line did not record its disposition on removal';
  END IF;
  v_failed:=false;
  BEGIN PERFORM public.restore_project_selection(v_a);
  EXCEPTION WHEN check_violation THEN v_failed:=SQLERRM='Another line now fills this need, so this one cannot be restored.'; END;
  IF NOT v_failed THEN RAISE EXCEPTION '(5) restore over another active primary was not refused'; END IF;
  IF (SELECT removed_at FROM public.project_ffe_items WHERE id=v_a) IS NULL THEN
    RAISE EXCEPTION '(5) refused restore still cleared removed_at';
  END IF;
  -- C is replaced by D, then D is removed: the primary is the superseded C,
  -- which is history, so D restores to selected.
  v_c:=pg_temp.rr_place('rr-thread-c');
  v_d:=(public.supersede_project_selection(jsonb_build_object('selectionId',v_c,'placementIds','[]'::jsonb))->>'selectionId')::uuid;
  PERFORM public.archive_project_selection(v_d);
  PERFORM public.restore_project_selection(v_d);
  IF (SELECT design_disposition FROM public.project_ffe_items WHERE id=v_d) IS DISTINCT FROM 'selected'
     OR (SELECT primary_ffe_item_id FROM public.project_ffe_selection_threads t
         JOIN public.project_ffe_items i ON i.selection_thread_id=t.id WHERE i.id=v_d) IS DISTINCT FROM v_d THEN
    RAISE EXCEPTION '(5) restore beside a superseded predecessor failed';
  END IF;

  -- (6) Authority: the project's client cannot restore.
  PERFORM public.archive_project_selection(v_d);
  PERFORM pg_temp.assume_rr_actor('73100000-0000-4000-8000-000000000002');
  v_failed:=false;
  BEGIN PERFORM public.restore_project_selection(v_d);
  EXCEPTION WHEN insufficient_privilege THEN v_failed:=true; END;
  IF NOT v_failed THEN RAISE EXCEPTION '(6) a client restored a line'; END IF;
END; $$;

DO $$ BEGIN
  IF has_function_privilege('anon','public.restore_project_selection(uuid)','EXECUTE')
     OR has_function_privilege('anon','public.archive_project_selection(uuid,text)','EXECUTE') THEN
    RAISE EXCEPTION '(6) anon can execute remove or restore';
  END IF;
  IF NOT has_function_privilege('authenticated','public.restore_project_selection(uuid)','EXECUTE') THEN
    RAISE EXCEPTION '(6) authenticated cannot execute restore';
  END IF;
END; $$;

ROLLBACK;
