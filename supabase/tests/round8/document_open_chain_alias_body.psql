-- SQ-2006: imported legacy snapshots, not a signature/activation-writer test.
-- Run inside document_open_chain_alias_isolated.sql; all DDL/data rolls back.
CREATE FUNCTION pg_temp.alias_id(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('f8720000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid;
$$;
CREATE FUNCTION pg_temp.assert_alias(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION FAILED: %', label; END IF;
  RAISE NOTICE 'PASS: %', label;
END;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.alias_id(integer), pg_temp.assert_alias(boolean,text) TO authenticated;
SELECT pg_temp.assert_alias(NOT EXISTS (SELECT 1 FROM auth.users WHERE id = pg_temp.alias_id(1))
  AND NOT EXISTS (SELECT 1 FROM public.proposals WHERE id::text LIKE 'f8720000-%')
  AND NOT EXISTS (SELECT 1 FROM public.projects WHERE id::text LIKE 'f8720000-%'), 'fixture starts absent');

SET LOCAL session_replication_role = replica;
INSERT INTO auth.users(id,email,encrypted_password,email_confirmed_at,created_at,updated_at,aud,role)
SELECT pg_temp.alias_id(n), 'alias-'||n||'@test.invalid', '',now(),now(),now(),'authenticated','authenticated'
FROM unnest(ARRAY[1,2,6,7,8,9])n;
INSERT INTO public.profiles(id,email,full_name,is_designer)
SELECT id,email,'Alias fixture',true FROM auth.users WHERE id IN
 (pg_temp.alias_id(1),pg_temp.alias_id(2),pg_temp.alias_id(6),pg_temp.alias_id(7),pg_temp.alias_id(8),pg_temp.alias_id(9));
INSERT INTO public.organizations(id,type,name,slug,status) VALUES
(pg_temp.alias_id(3),'design_studio','Alias A','sq2006-alias-a','active'),
(pg_temp.alias_id(4),'design_studio','Alias B','sq2006-alias-b','active');
-- The owner sees BOTH studios: cross-studio assertions cannot pass just because
-- RLS hid the malformed chain. Actor 2 is unrelated; actor 6 shares only B with
-- the owner. Actors 8/9 retain B access but have an ineligible seat in A.
INSERT INTO public.organization_members(user_id,organization_id,role,status) VALUES
(pg_temp.alias_id(1),pg_temp.alias_id(3),'owner','active'),
(pg_temp.alias_id(1),pg_temp.alias_id(4),'owner','active'),
(pg_temp.alias_id(6),pg_temp.alias_id(4),'member','active'),
(pg_temp.alias_id(7),pg_temp.alias_id(3),'member','active'),
(pg_temp.alias_id(8),pg_temp.alias_id(3),'guest','active'),
(pg_temp.alias_id(8),pg_temp.alias_id(4),'member','active'),
(pg_temp.alias_id(9),pg_temp.alias_id(3),'member','suspended'),
(pg_temp.alias_id(9),pg_temp.alias_id(4),'member','active');
INSERT INTO public.user_roles(user_id,role_id,granted_by)
SELECT pg_temp.alias_id(1),id,pg_temp.alias_id(1) FROM public.roles WHERE name='studio_owner';
INSERT INTO public.designer_clients(id,designer_id,client_name,status) VALUES
(pg_temp.alias_id(5),pg_temp.alias_id(1),'Alias relationship','active');

INSERT INTO public.proposals(id,designer_id,designer_client_id,studio_id,title,status,version,parent_proposal_id,accepted_at,created_at)
SELECT pg_temp.alias_id(n),pg_temp.alias_id(1),pg_temp.alias_id(5),
  CASE WHEN n IN (60,61) THEN NULL ELSE pg_temp.alias_id(CASE WHEN n=40 THEN 4 ELSE 3 END) END,
  'Alias proposal '||n,status,version,
  CASE WHEN parent IS NULL THEN NULL ELSE pg_temp.alias_id(parent) END,accepted_at::timestamptz,'2026-01-01'::timestamptz
FROM (VALUES
 (10,'revised',1,NULL::integer,NULL::text),
 (11,'accepted',100,10,'2026-01-01'),
 (12,'accepted',3,10,'2026-02-01'),
 (13,'accepted',3,10,'2026-02-01'), -- exact timestamp/version/creation tie; highest id wins
 (14,'draft',101,10,'2026-03-01'), -- not accepted, despite a legacy project pointer
 (15,'revised',102,10,NULL),       -- superseded revision remains an alias, not the winner
 (20,'revised',1,NULL,NULL), (21,'draft',2,20,NULL),
 (30,'accepted',1,NULL,'2026-04-01'), -- duplicate root with same relationship is NOT this chain
 (40,'revised',1,NULL,NULL), (41,'accepted',2,40,'2026-05-01'), -- cross-studio revision
 (50,'revised',1,NULL,NULL), (51,'accepted',2,50,'2026-05-01'), -- cross-studio target
 (60,'revised',1,NULL,NULL), (61,'accepted',2,60,'2026-05-01')  -- studio-less alias
) AS x(n,status,version,parent,accepted_at);
INSERT INTO public.projects(id,name,created_by,designer_id,studio_id,status,proposal_id)
SELECT pg_temp.alias_id(100+n),'Alias project '||n,pg_temp.alias_id(1),pg_temp.alias_id(1),
  CASE WHEN n=61 THEN NULL ELSE pg_temp.alias_id(CASE WHEN n=51 THEN 4 ELSE 3 END) END,
  'active',pg_temp.alias_id(n)
FROM unnest(ARRAY[11,12,13,14,30,41,51,61])n;
UPDATE public.proposals SET project_id=pg_temp.alias_id(100 + right(id::text,12)::integer)
WHERE id IN (pg_temp.alias_id(11),pg_temp.alias_id(12),pg_temp.alias_id(13),pg_temp.alias_id(14),
             pg_temp.alias_id(30),pg_temp.alias_id(41),pg_temp.alias_id(51),pg_temp.alias_id(61));
SET LOCAL session_replication_role = origin;
CREATE TEMP TABLE alias_snapshot AS SELECT to_jsonb(p) row FROM public.proposals p WHERE id::text LIKE 'f8720000-%';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', pg_temp.alias_id(1)::text, true);
SELECT set_config('request.jwt.claims', jsonb_build_object('sub',pg_temp.alias_id(1),'role','authenticated')::text,true);
SELECT pg_temp.assert_alias(public.document_open(pg_temp.alias_id(10)) =
 jsonb_build_object('kind','redirect','projectId',pg_temp.alias_id(113)),
 'root resolves through newest accepted revision to its project (deterministic id tie)');
SELECT pg_temp.assert_alias(public.document_open(pg_temp.alias_id(15)) =
 jsonb_build_object('kind','redirect','projectId',pg_temp.alias_id(113)), 'superseded revision resolves to newest accepted project');
SELECT pg_temp.assert_alias(public.document_open(pg_temp.alias_id(13)) =
 jsonb_build_object('kind','redirect','projectId',pg_temp.alias_id(113)), 'activated revision keeps its own project redirect');
SELECT pg_temp.assert_alias(public.document_open(pg_temp.alias_id(11)) =
 jsonb_build_object('kind','redirect','projectId',pg_temp.alias_id(111)), 'older activated revision preserves its own project redirect');
SELECT pg_temp.assert_alias(public.document_open(pg_temp.alias_id(113))->'ids'->>'project_id' = pg_temp.alias_id(113)::text,
 'redirect target opens as its native project document');
SELECT pg_temp.assert_alias(public.document_open(pg_temp.alias_id(20))->>'kind' = 'engagement'
 AND public.document_open(pg_temp.alias_id(20))->'ids'->>'proposal_id'=pg_temp.alias_id(21)::text
 AND public.document_open(pg_temp.alias_id(20))=public.document_open(pg_temp.alias_id(21)),
 'unactivated chain keeps native root and live revision engagement');
SELECT pg_temp.assert_alias((SELECT count(*)=3 FROM public.proposals WHERE id IN
 (pg_temp.alias_id(40),pg_temp.alias_id(41),pg_temp.alias_id(51))) AND
 (SELECT count(*)=2 FROM public.projects WHERE id IN (pg_temp.alias_id(141),pg_temp.alias_id(151))),
 'cross-studio fixtures are all readable before boundary assertions');
SELECT pg_temp.assert_alias(public.document_open(pg_temp.alias_id(40))='{"kind":"missing"}'::jsonb,
 'cross-studio root cannot redirect through another studio revision');
SELECT pg_temp.assert_alias(public.document_open(pg_temp.alias_id(50))='{"kind":"missing"}'::jsonb,
 'same-studio revision cannot redirect root into another studio project');
SELECT pg_temp.assert_alias(public.document_open(pg_temp.alias_id(60)) =
 jsonb_build_object('kind','redirect','projectId',pg_temp.alias_id(161)),
 'designer resolves their own studio-less alias');
RESET ROLE;

-- SQ-2012 / SQ-2011 F1: inherited person-pair RLS still exposes these rows.
-- The new fallback must independently bind the caller to the recorded studio.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', pg_temp.alias_id(6)::text,true);
SELECT set_config('request.jwt.claims', jsonb_build_object('sub',pg_temp.alias_id(6),'role','authenticated')::text,true);
SELECT pg_temp.assert_alias(EXISTS(SELECT 1 FROM public.proposals WHERE id=pg_temp.alias_id(10))
 AND EXISTS(SELECT 1 FROM public.proposals WHERE id=pg_temp.alias_id(13))
 AND EXISTS(SELECT 1 FROM public.projects WHERE id=pg_temp.alias_id(113))
 AND NOT EXISTS(SELECT 1 FROM public.organization_members WHERE user_id=pg_temp.alias_id(6)
   AND organization_id=pg_temp.alias_id(3)), 'B-only co-member reads A alias rows without an A seat');
SELECT pg_temp.assert_alias(public.document_open(pg_temp.alias_id(10))='{"kind":"missing"}'::jsonb
 AND public.document_open(pg_temp.alias_id(15))='{"kind":"missing"}'::jsonb,
 'B-only co-member cannot resolve A studio aliases');
SELECT set_config('request.jwt.claim.sub', pg_temp.alias_id(7)::text,true);
SELECT set_config('request.jwt.claims', jsonb_build_object('sub',pg_temp.alias_id(7),'role','authenticated')::text,true);
SELECT pg_temp.assert_alias(public.document_open(pg_temp.alias_id(10)) =
 jsonb_build_object('kind','redirect','projectId',pg_temp.alias_id(113)),
 'active non-guest A member resolves A studio alias');
SELECT pg_temp.assert_alias(EXISTS(SELECT 1 FROM public.proposals WHERE id=pg_temp.alias_id(60))
 AND EXISTS(SELECT 1 FROM public.projects WHERE id=pg_temp.alias_id(161))
 AND public.document_open(pg_temp.alias_id(60))='{"kind":"missing"}'::jsonb,
 'co-member cannot resolve readable studio-less alias');
SELECT set_config('request.jwt.claim.sub', pg_temp.alias_id(8)::text,true);
SELECT set_config('request.jwt.claims', jsonb_build_object('sub',pg_temp.alias_id(8),'role','authenticated')::text,true);
SELECT pg_temp.assert_alias(EXISTS(SELECT 1 FROM public.projects WHERE id=pg_temp.alias_id(113))
 AND public.document_open(pg_temp.alias_id(10))='{"kind":"missing"}'::jsonb,
 'guest A seat cannot resolve readable A studio alias');
SELECT set_config('request.jwt.claim.sub', pg_temp.alias_id(9)::text,true);
SELECT set_config('request.jwt.claims', jsonb_build_object('sub',pg_temp.alias_id(9),'role','authenticated')::text,true);
SELECT pg_temp.assert_alias(EXISTS(SELECT 1 FROM public.projects WHERE id=pg_temp.alias_id(113))
 AND public.document_open(pg_temp.alias_id(10))='{"kind":"missing"}'::jsonb,
 'suspended A seat cannot resolve readable A studio alias');
RESET ROLE;
SET LOCAL session_replication_role = replica;
UPDATE public.organizations SET status='suspended' WHERE id=pg_temp.alias_id(3);
SET LOCAL session_replication_role = origin;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', pg_temp.alias_id(1)::text,true);
SELECT set_config('request.jwt.claims', jsonb_build_object('sub',pg_temp.alias_id(1),'role','authenticated')::text,true);
SELECT pg_temp.assert_alias(EXISTS(SELECT 1 FROM public.projects WHERE id=pg_temp.alias_id(113))
 AND public.document_open(pg_temp.alias_id(10))='{"kind":"missing"}'::jsonb,
 'suspended studio refuses alias even for its seated designer');
RESET ROLE;
SET LOCAL session_replication_role = replica;
UPDATE public.organizations SET status='active' WHERE id=pg_temp.alias_id(3);
SET LOCAL session_replication_role = origin;

-- Acceptance recency beats version. Version is the secondary tie-break.
SET LOCAL session_replication_role = replica;
UPDATE public.proposals SET accepted_at='2026-01-15' WHERE id=pg_temp.alias_id(13);
UPDATE public.proposals SET version=4 WHERE id=pg_temp.alias_id(12);
SET LOCAL session_replication_role = origin;
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_alias(public.document_open(pg_temp.alias_id(10))->>'projectId'=pg_temp.alias_id(112)::text,
 'newest acceptance wins over higher version on an older acceptance');
RESET ROLE;
SET LOCAL session_replication_role = replica;
UPDATE public.proposals SET accepted_at='2026-02-01' WHERE id=pg_temp.alias_id(13);
SET LOCAL session_replication_role = origin;
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_alias(public.document_open(pg_temp.alias_id(10))->>'projectId'=pg_temp.alias_id(112)::text,
 'equal acceptance timestamps choose the higher revision version');
RESET ROLE;
SET LOCAL session_replication_role = replica;
UPDATE public.proposals SET version=3 WHERE id=pg_temp.alias_id(12);
SET LOCAL session_replication_role = origin;

-- Independently hide every target document while keeping source proposals
-- visible; the invoker must use the same target-document access boundary.
CREATE POLICY sq2006_hide_targets ON public.projects AS RESTRICTIVE FOR SELECT TO authenticated USING (false);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_alias(EXISTS(SELECT 1 FROM public.proposals WHERE id=pg_temp.alias_id(10))
 AND NOT EXISTS(SELECT 1 FROM public.projects WHERE id=pg_temp.alias_id(113)), 'source readable but target denied');
SELECT pg_temp.assert_alias(public.document_open(pg_temp.alias_id(10))='{"kind":"missing"}'::jsonb,
 'root denied when the target document is unreadable');
RESET ROLE;
DROP POLICY sq2006_hide_targets ON public.projects;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', pg_temp.alias_id(2)::text,true);
SELECT set_config('request.jwt.claims', jsonb_build_object('sub',pg_temp.alias_id(2),'role','authenticated')::text,true);
SELECT pg_temp.assert_alias(public.document_open(pg_temp.alias_id(10))='{"kind":"missing"}'::jsonb
 AND public.document_open(pg_temp.alias_id(13))='{"kind":"missing"}'::jsonb
 AND public.document_open(pg_temp.alias_id(113))='{"kind":"missing"}'::jsonb,
 'non-member sees identical missing response for root revision and project');
RESET ROLE;
SELECT pg_temp.assert_alias(NOT EXISTS(
 (SELECT to_jsonb(p) FROM public.proposals p WHERE id::text LIKE 'f8720000-%' EXCEPT SELECT row FROM alias_snapshot)
 UNION ALL (SELECT row FROM alias_snapshot EXCEPT SELECT to_jsonb(p) FROM public.proposals p WHERE id::text LIKE 'f8720000-%')
), 'resolver reads never mutate proposal rows');
SELECT pg_temp.assert_alias(NOT (SELECT prosecdef FROM pg_proc WHERE oid='public.document_open(uuid)'::regprocedure)
 AND (SELECT provolatile='s' AND proconfig=ARRAY['search_path=""'] FROM pg_proc WHERE oid='public.document_open(uuid)'::regprocedure)
 AND has_function_privilege('authenticated','public.document_open(uuid)','EXECUTE')
 AND NOT has_function_privilege('anon','public.document_open(uuid)','EXECUTE')
 AND NOT has_function_privilege('service_role','public.document_open(uuid)','EXECUTE'), 'invoker stable search_path and ACLs unchanged');
