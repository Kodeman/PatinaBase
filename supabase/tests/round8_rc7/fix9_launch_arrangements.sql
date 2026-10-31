\set ON_ERROR_STOP on
\if :{?fix9_system_identifier}
\else
\echo 'FIX9 requires the owned cluster identifier captured at stack start'
\quit 1
\endif
SELECT :'HOST' = '127.0.0.1' AND :'PORT' = '61622'
  AND (SELECT system_identifier::text FROM pg_control_system()) = :'fix9_system_identifier'
  AS owned_stack \gset
\if :owned_stack
\else
DO $$ BEGIN RAISE EXCEPTION 'FIX9 refuses a non-owned 127.0.0.1:61622 cluster'; END $$;
\quit 1
\endif

-- Run from this file's repo location: \ir resolves relative to the script, not the shell cwd.
-- 00905 replays at stack start; this re-apply is a no-op (ON CONFLICT DO NOTHING).
\ir ../../migrations/00905_round8_launch_service_arrangements.sql

BEGIN;
DO $$ BEGIN
  IF (SELECT enabled FROM public.server_capabilities WHERE key = 'scope_editions') IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FIX9 C2 must remain inactive after 00905';
  END IF;
END $$;
UPDATE public.server_capabilities SET enabled = true WHERE key = 'scope_editions';
GRANT EXECUTE ON FUNCTION public.apply_service_arrangement(uuid,text,uuid) TO authenticated;

DO $$
DECLARE preset_key text; preset_parts jsonb; slots jsonb;
BEGIN
  IF (SELECT count(*) FROM public.service_arrangements
      WHERE version = 1 AND arrangement_key IN ('patina_six','design_only','whole_home','fast_track')) <> 4 THEN
    RAISE EXCEPTION 'FIX9 expected four launch arrangements';
  END IF;
  FOR preset_key, preset_parts IN SELECT a.arrangement_key, a.parts FROM public.service_arrangements a
    WHERE a.version = 1 AND a.arrangement_key IN ('patina_six','design_only','whole_home','fast_track') LOOP
    IF (SELECT phase_template_slug <> preset_key FROM public.service_arrangements
        WHERE arrangement_key = preset_key AND version = 1)
      OR jsonb_array_length(preset_parts) <> 1 THEN
      RAISE EXCEPTION 'FIX9 invalid template or parts for %', preset_key;
    END IF;
    slots := preset_parts->0->'payload'->'responsibilities';
    IF (SELECT count(*) FROM jsonb_object_keys(slots)) <> 5
      OR NOT slots ?& ARRAY['design','purchasing','payer','fabrication_contract','installation']
      OR EXISTS (SELECT 1 FROM jsonb_each_text(slots) s WHERE s.value NOT IN ('studio','client','gc','other','none')) THEN
      RAISE EXCEPTION 'FIX9 invalid responsibility slots for %', preset_key;
    END IF;
  END LOOP;
END $$;

CREATE TEMP TABLE fix9_results(
  arrangement_key text PRIMARY KEY, proposal_id uuid NOT NULL,
  first jsonb NOT NULL, replay jsonb NOT NULL, alias jsonb NOT NULL
);
GRANT INSERT ON fix9_results TO authenticated;
INSERT INTO public.proposals (id, designer_id, studio_id, title, status, document_kind, commercial_state)
SELECT ('f9050000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'a0000000-0000-0000-0000-000000000004',
  'b0000000-0000-0000-0000-000000000001',
  'FIX9 ' || arrangement_key, 'draft', 'design_services', 'draft'
FROM (VALUES (1,'patina_six'),(2,'design_only'),(3,'whole_home'),(4,'fast_track')) x(n,arrangement_key);

SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000004', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE r record; first jsonb; replay jsonb; alias jsonb; refusal_state text; refusal_message text;
  prior_phases uuid[];
BEGIN
  FOR r IN SELECT x.arrangement_key, ('f9050000-0000-4000-8000-' || lpad(x.n::text, 12, '0'))::uuid AS proposal_id
    FROM (VALUES (1,'patina_six'),(2,'design_only'),(3,'whole_home'),(4,'fast_track')) x(n,arrangement_key)
  LOOP
    first := public.apply_service_arrangement(r.proposal_id,r.arrangement_key,
      ('f9050001-0000-4000-8000-' || right(r.proposal_id::text,12))::uuid);
    replay := public.apply_service_arrangement(r.proposal_id,r.arrangement_key,
      ('f9050001-0000-4000-8000-' || right(r.proposal_id::text,12))::uuid);
    alias := public.apply_service_arrangement(r.proposal_id,r.arrangement_key,
      ('f9050002-0000-4000-8000-' || right(r.proposal_id::text,12))::uuid);
    INSERT INTO fix9_results VALUES (r.arrangement_key,r.proposal_id,first,replay,alias);
    SELECT COALESCE(array_agg(id ORDER BY id),'{}'::uuid[]) INTO prior_phases
      FROM public.proposal_phases WHERE proposal_id=r.proposal_id;
    BEGIN
      PERFORM public.apply_service_arrangement(r.proposal_id,
        CASE WHEN r.arrangement_key='patina_six' THEN 'design_only' ELSE 'patina_six' END,
        gen_random_uuid());
      RAISE EXCEPTION 'FIX9 different arrangement unexpectedly applied %',r.arrangement_key;
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS refusal_state = RETURNED_SQLSTATE, refusal_message = MESSAGE_TEXT;
      IF refusal_state <> '23514' OR refusal_message <> 'arrangement_already_applied' THEN
        RAISE EXCEPTION 'FIX9 different arrangement %: % %',r.arrangement_key,refusal_state,refusal_message;
      END IF;
    END;
    IF (SELECT COALESCE(array_agg(id ORDER BY id),'{}'::uuid[])
        FROM public.proposal_phases WHERE proposal_id=r.proposal_id) IS DISTINCT FROM prior_phases THEN
      RAISE EXCEPTION 'FIX9 different arrangement changed phases for %',r.arrangement_key;
    END IF;
    PERFORM set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000005',true);
    BEGIN
      PERFORM public.apply_service_arrangement(r.proposal_id,r.arrangement_key,gen_random_uuid());
      RAISE EXCEPTION 'FIX9 outsider unexpectedly applied %',r.arrangement_key;
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS refusal_state = RETURNED_SQLSTATE, refusal_message = MESSAGE_TEXT;
      IF refusal_state <> '42501' OR refusal_message <> 'scope_proposal_access_denied' THEN
        RAISE EXCEPTION 'FIX9 outsider %: % %',r.arrangement_key,refusal_state,refusal_message;
      END IF;
    END;
    PERFORM set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000004',true);
  END LOOP;
END $$;
RESET ROLE;

DO $$
DECLARE r record; expected integer; actual uuid[];
BEGIN
  IF (SELECT count(*) FROM fix9_results) <> 4 THEN
    RAISE EXCEPTION 'FIX9 did not exercise four arrangements';
  END IF;
  FOR r IN SELECT * FROM fix9_results LOOP
    SELECT jsonb_array_length(t.phases) INTO expected FROM public.phase_templates t WHERE t.slug=r.arrangement_key;
    SELECT array_agg(id ORDER BY id) INTO actual FROM public.proposal_phases WHERE proposal_id=r.proposal_id;
    IF r.first->>'replayed' <> 'false' OR r.replay->>'replayed' <> 'true'
      OR r.alias->>'replayed' <> 'true'
      OR r.first->>'arrangementVersion' <> '1'
      OR r.first->'phaseIds' <> r.replay->'phaseIds'
      OR r.first->'phaseIds' <> r.alias->'phaseIds'
      OR jsonb_array_length(r.first->'phaseIds') <> expected
      OR (SELECT count(*) FROM jsonb_array_elements_text(r.first->'phaseIds') p
          WHERE p.value::uuid = ANY(actual)) <> expected
      OR cardinality(actual) <> expected
      OR r.first->'partKeys' <> r.replay->'partKeys'
      OR (SELECT count(*) FROM public.proposal_service_arrangement_applications
          WHERE proposal_id=r.proposal_id) <> 2
      OR (SELECT count(*) FROM public.proposal_phase_template_applications
          WHERE proposal_id=r.proposal_id) <> 1
      OR (SELECT count(*) FROM public.proposal_agreement_parts
          WHERE proposal_id=r.proposal_id AND kind='scope_package') <> 1 THEN
      RAISE EXCEPTION 'FIX9 first/replay/alias/phase/receipt assertion failed for %',r.arrangement_key;
    END IF;
    RAISE NOTICE 'PASS FIX9 %: % phases, first/replay/alias receipts, outsider refused',r.arrangement_key,expected;
  END LOOP;
END $$;
ROLLBACK;
