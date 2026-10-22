-- 00853 / SQ-1748: closing lane state-machine regressions. Rolled back.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
SET LOCAL statement_timeout = '15s';
CREATE TEMP TABLE temp_schema_owner(id int);
DO $$ BEGIN
  EXECUTE format('GRANT USAGE ON SCHEMA %s TO service_role, authenticated', pg_my_temp_schema()::regnamespace);
  EXECUTE format('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA %s TO service_role, authenticated', pg_my_temp_schema()::regnamespace);
END $$;
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('85300000-0000-4000-8000-0000000000a1', 'us49-853-owner@test.invalid',  '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('85300000-0000-4000-8000-0000000000a2', 'us49-853-client@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES
  ('85300000-0000-4000-8000-0000000000a1', 'us49-853-owner@test.invalid',  'US49 853 Owner',  true,  now(), now()),
  ('85300000-0000-4000-8000-0000000000a2', 'us49-853-client@test.invalid', 'US49 853 Client', false, now(), now())
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email, full_name = EXCLUDED.full_name, is_designer = EXCLUDED.is_designer;
INSERT INTO public.organizations (id, type, name, slug, address)
VALUES ('85300000-0000-4000-8000-0000000000f1', 'design_studio', 'US49 853 Studio', 'us49-853-studio-test',
        '{"city": "Hudson"}'::jsonb);
INSERT INTO public.organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES ('85300000-0000-4000-8000-0000000000e1', '85300000-0000-4000-8000-0000000000a1',
        '85300000-0000-4000-8000-0000000000f1', 'owner', 'active', now());
INSERT INTO public.projects (id, name, designer_id, client_id, created_by, studio_id, status, show_makers)
SELECT ('85300000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, 'US49 853 House ' || n,
       '85300000-0000-4000-8000-0000000000a1', '85300000-0000-4000-8000-0000000000a2',
       '85300000-0000-4000-8000-0000000000a1', '85300000-0000-4000-8000-0000000000f1', 'active', false
FROM generate_series(1, 11) AS n;


UPDATE public.llm_feature_controls SET enabled = false WHERE feature = 'client-edition-compose';
UPDATE public.client_edition_requests SET status = 'done', lease_token = NULL, lease_expires_at = NULL WHERE status IN ('queued','leased');
UPDATE public.projects SET show_makers = true WHERE id = '85300000-0000-4000-8000-000000000001';
CREATE FUNCTION pg_temp.close_job(p_id uuid, p_snapshot jsonb) RETURNS void LANGUAGE sql AS $$
  SELECT public.close_project(p_id,
    '[{"key":"walkthrough","completed":true},{"key":"punch_list","completed":true},{"key":"payment","completed":true},{"key":"photography","completed":true},{"key":"photos","completed":true},{"key":"case_study","completed":true}]', p_snapshot);
$$;
GRANT EXECUTE ON FUNCTION pg_temp.close_job(uuid,jsonb) TO authenticated;
SET LOCAL request.jwt.claims = '{"sub":"85300000-0000-4000-8000-0000000000a1","role":"authenticated"}';
SET LOCAL ROLE authenticated;
SELECT lives_ok($$SELECT pg_temp.close_job('85300000-0000-4000-8000-000000000001', '{"description":"PRIVATE DESCRIPTION","value_cents":123456}')$$, 'closing: real close enqueues the final request');
SELECT lives_ok($$SELECT pg_temp.close_job('85300000-0000-4000-8000-000000000001', '{"value_cents":123456,"description":"PRIVATE DESCRIPTION"}')$$, 'closing: same close is idempotent');
SELECT throws_ok($$SELECT pg_temp.close_job('85300000-0000-4000-8000-000000000001', '{"description":"REWRITTEN"}')$$, '55000', NULL, 'closing: snapshot cannot be replaced before any approval');
SELECT lives_ok($$SELECT public.archive_project('85300000-0000-4000-8000-000000000001','completed')$$, 'closing: archive after completion is allowed');
SELECT lives_ok($$SELECT public.archive_project('85300000-0000-4000-8000-000000000002','active')$$, 'closing: archive from active also queues a final issue');
RESET ROLE;
SELECT is((SELECT count(*) FROM public.client_edition_requests WHERE closing AND project_id = '85300000-0000-4000-8000-000000000001'), 1::bigint, 'closing: repeated close and archive have one request total');
SELECT is((SELECT count(*) FROM public.client_edition_requests WHERE closing AND project_id = '85300000-0000-4000-8000-000000000002'), 1::bigint, 'closing: active archive has one request');
SELECT ok((SELECT closing_facts -> 'portfolio_snapshot' = '{"description":"PRIVATE DESCRIPTION","value_cents":123456}'::jsonb AND closing_facts #>> '{project,phase}' = 'final_walkthrough' FROM public.client_edition_requests WHERE closing AND project_id = '85300000-0000-4000-8000-000000000001'), 'closing: private portfolio and editorial facts captured at close');
SET LOCAL ROLE authenticated;

RESET ROLE;
UPDATE public.projects SET show_makers = false, name = 'Changed live title' WHERE id = '85300000-0000-4000-8000-000000000001';
CREATE TEMP TABLE claimed AS SELECT * FROM public.claim_client_edition_requests(20);
SELECT is((SELECT count(*) FROM claimed WHERE closing), 2::bigint, 'closing: closed jobs are claimed in the narrow final lane');
SELECT ok((SELECT closing_facts #>> '{project,showMakers}' = 'false' AND closing_facts #>> '{project,name}' <> 'Changed live title' FROM claimed WHERE project_id = '85300000-0000-4000-8000-000000000001'), 'closing: maker withdrawal stays live while editorial facts stay captured');
CREATE TEMP TABLE begun AS SELECT project_id, lease_token, public.begin_client_edition(id,lease_token) AS id FROM claimed WHERE closing;
RESET ROLE;
SELECT ok((SELECT bool_and(edition.closing AND edition.status = 'drafting' AND edition.facts ->> 'closing' = 'true') FROM begun JOIN public.client_editions AS edition USING(id)), 'closing: begin opens only the SQL-marked captured draft');
GRANT SELECT ON begun TO service_role, authenticated;
SELECT is(public.finish_client_edition((SELECT id FROM begun WHERE project_id = '85300000-0000-4000-8000-000000000001'), (SELECT lease_token FROM begun WHERE project_id = '85300000-0000-4000-8000-000000000001'), 'approved','plates_only','{"sourceHash":"close-hash","chapters":[],"hero":null}', '{}','[]','closing-test','deterministic',0,NULL), 'awaiting_review', 'closing: even an attempted plates-only auto-publish waits for review');
RESET ROLE;
SELECT ok((SELECT status = 'awaiting_review' AND kind = 'full' AND NOT auto_published AND frozen_at IS NULL AND facts -> 'portfolio_snapshot' ->> 'description' = 'PRIVATE DESCRIPTION' FROM public.client_editions WHERE id = (SELECT id FROM begun WHERE project_id = '85300000-0000-4000-8000-000000000001')), 'closing: awaiting draft retains SQL snapshot and is not published or frozen');
SET LOCAL ROLE authenticated;
SELECT ok(public.list_client_editions('85300000-0000-4000-8000-000000000001') #>> '{editions,0,closing}' = 'true' AND public.list_client_editions('85300000-0000-4000-8000-000000000001')::text NOT LIKE '%PRIVATE DESCRIPTION%', 'closing: Press band gets only the marker, never the portfolio snapshot');
SELECT lives_ok($$SELECT public.hold_client_edition((SELECT id FROM begun WHERE project_id = '85300000-0000-4000-8000-000000000001'))$$, 'closing: designer can hold without publishing');
SELECT lives_ok($$SELECT public.approve_client_edition((SELECT id FROM begun WHERE project_id = '85300000-0000-4000-8000-000000000001'))$$, 'closing: designer approval publishes the final issue');
RESET ROLE;
SELECT ok((SELECT status = 'approved' AND frozen_at IS NOT NULL AND NOT auto_published AND facts -> 'portfolioSnapshotRef' ->> 'present' = 'true' FROM public.client_editions WHERE id = (SELECT id FROM begun WHERE project_id = '85300000-0000-4000-8000-000000000001')), 'closing: approval freezes the final issue');
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.undo_client_edition((SELECT id FROM begun WHERE project_id = '85300000-0000-4000-8000-000000000001'))$$, '55000', NULL, 'closing: approved final issue cannot be undone');
SELECT throws_ok($$SELECT public.hold_client_edition((SELECT id FROM begun WHERE project_id = '85300000-0000-4000-8000-000000000001'))$$, '55000', NULL, 'closing: published final issue cannot be held');
RESET ROLE;
SELECT * FROM finish(true);
ROLLBACK;
