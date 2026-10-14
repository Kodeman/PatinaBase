-- 00790 — R5: a studio can keep its teaching to itself (pgTAP).
--
-- Fixture: studio A keeps its teaching (a1 owner, a2 member, c1 admin, d1
-- only invited); studio B shares (b1 owner, b2 member); studio C shares (c1
-- owner, so c1 sits in A and C). Catalog piece P is taught by a1 (spectrum,
-- archetype tag S, a draft row); piece Q is taught by b1 (spectrum, tag S2).
-- Proves no leak at each cross-studio reader while A keeps its teaching, then
-- that flipping A back restores every reader in the same transaction.
--
-- Run: supabase test db supabase/tests/aesthete/teaching_opt_out_test.sql
-- The transaction is rolled back.
BEGIN;
SELECT plan(61);

-- ─── fixtures ───────────────────────────────────────────────────────────────

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
SELECT u.id::uuid, u.email, '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'
  FROM (VALUES
    ('79000000-0000-4000-8000-000000000001', 'optout-a1@test.invalid'),
    ('79000000-0000-4000-8000-000000000002', 'optout-a2@test.invalid'),
    ('79000000-0000-4000-8000-000000000003', 'optout-b1@test.invalid'),
    ('79000000-0000-4000-8000-000000000004', 'optout-b2@test.invalid'),
    ('79000000-0000-4000-8000-000000000005', 'optout-c1@test.invalid'),
    ('79000000-0000-4000-8000-000000000006', 'optout-d1@test.invalid')
  ) u(id, email)
ON CONFLICT (id) DO NOTHING;

INSERT INTO profiles (id, email, full_name, created_at, updated_at)
SELECT u.id, u.email, 'Opt-out ' || split_part(u.email, '@', 1), now(), now()
  FROM auth.users u WHERE u.id::text LIKE '79000000-0000-4000-8000-00000000000%'
ON CONFLICT (id) DO NOTHING;

INSERT INTO organizations (id, type, name, slug) VALUES
  ('79000000-0000-4000-8000-000000000011', 'design_studio', 'Opt-out Studio A', 'optout-a-790-test'),
  ('79000000-0000-4000-8000-000000000012', 'design_studio', 'Opt-out Studio B', 'optout-b-790-test'),
  ('79000000-0000-4000-8000-000000000013', 'design_studio', 'Opt-out Studio C', 'optout-c-790-test');

INSERT INTO organization_members (id, user_id, organization_id, role, status, joined_at) VALUES
  ('79000000-0000-4000-8000-000000000041', '79000000-0000-4000-8000-000000000001', '79000000-0000-4000-8000-000000000011', 'owner',  'active',  now()),
  ('79000000-0000-4000-8000-000000000042', '79000000-0000-4000-8000-000000000002', '79000000-0000-4000-8000-000000000011', 'member', 'active',  now()),
  ('79000000-0000-4000-8000-000000000043', '79000000-0000-4000-8000-000000000005', '79000000-0000-4000-8000-000000000011', 'admin',  'active',  now()),
  ('79000000-0000-4000-8000-000000000044', '79000000-0000-4000-8000-000000000006', '79000000-0000-4000-8000-000000000011', 'member', 'invited', now()),
  ('79000000-0000-4000-8000-000000000045', '79000000-0000-4000-8000-000000000003', '79000000-0000-4000-8000-000000000012', 'owner',  'active',  now()),
  ('79000000-0000-4000-8000-000000000046', '79000000-0000-4000-8000-000000000004', '79000000-0000-4000-8000-000000000012', 'member', 'active',  now()),
  ('79000000-0000-4000-8000-000000000047', '79000000-0000-4000-8000-000000000005', '79000000-0000-4000-8000-000000000013', 'owner',  'active',  now());

INSERT INTO styles (id, name, is_archetype, display_order) VALUES
  ('79000000-0000-4000-8000-000000000021', 'Opt-out Archetype S 790', true, 990),
  ('79000000-0000-4000-8000-000000000022', 'Opt-out Archetype S2 790', true, 991);

INSERT INTO products (id, name, description, category, price_retail, layer, status,
                      patina_managed, brand, materials, source_url, captured_by,
                      captured_at, published_at, quality_score, aesthete_vector)
VALUES
  ('79000000-0000-4000-8000-000000000031', 'Opt-out Piece P', 'opt-out fixture', 'optout-790', 800000,
   'catalog', 'published', true, 'OP', ARRAY['White oak'], 'http://test.invalid/optout/p',
   '79000000-0000-4000-8000-000000000001', now(), now(), 70,
   (ARRAY[0.9::real] || array_fill(0.03::real, ARRAY[767]))::vector(768)),
  ('79000000-0000-4000-8000-000000000032', 'Opt-out Piece Q', 'opt-out fixture', 'optout-790', 800000,
   'catalog', 'published', true, 'OQ', ARRAY['Walnut'], 'http://test.invalid/optout/q',
   '79000000-0000-4000-8000-000000000003', now(), now(), 70,
   (array_fill(0.03::real, ARRAY[767]) || ARRAY[0.9::real])::vector(768));

INSERT INTO product_style_spectrum
  (product_id, warmth, complexity, formality, timelessness, boldness, craftsmanship, assigned_by, source)
VALUES
  ('79000000-0000-4000-8000-000000000031', 0.7, -0.5, -0.2, 0.5, -0.3, 0.6, '79000000-0000-4000-8000-000000000001', 'manual'),
  ('79000000-0000-4000-8000-000000000032', 0.2, 0.1, 0.0, 0.1, 0.0, 0.2, '79000000-0000-4000-8000-000000000003', 'manual');

INSERT INTO product_styles (product_id, style_id, confidence, assigned_by, is_primary, source) VALUES
  ('79000000-0000-4000-8000-000000000031', '79000000-0000-4000-8000-000000000021', 0.9, '79000000-0000-4000-8000-000000000001', true, 'manual'),
  ('79000000-0000-4000-8000-000000000032', '79000000-0000-4000-8000-000000000022', 0.9, '79000000-0000-4000-8000-000000000003', true, 'manual');

INSERT INTO product_dna_drafts (product_id, draft, model, prompt_version, overall_confidence) VALUES
  ('79000000-0000-4000-8000-000000000031',
   '{"style": {"spectrums": {"warmth": -0.4, "boldness": 0.2}}, "overall_confidence": 0.5}',
   'fixture', 'optout-790', 0.5);

-- Validation votes: on b1's Q from a2 (kept studio) and b2 (sharing);
-- on a1's P from b1 (sharing) and a2 (a1's own studio).
INSERT INTO teaching_validations (product_id, validator_id, vote) VALUES
  ('79000000-0000-4000-8000-000000000032', '79000000-0000-4000-8000-000000000002', 'flag'),
  ('79000000-0000-4000-8000-000000000032', '79000000-0000-4000-8000-000000000004', 'confirm'),
  ('79000000-0000-4000-8000-000000000031', '79000000-0000-4000-8000-000000000003', 'confirm'),
  ('79000000-0000-4000-8000-000000000031', '79000000-0000-4000-8000-000000000002', 'confirm');

-- a1 and b1 are both house-eligible (unretired, ρ ≥ 0.3, ≥ 50 judgments, fitted).
INSERT INTO designer_taste_profiles (designer_id, theta, taste_vector, reliability, sources)
SELECT d.id::uuid, array_fill(0.1::real, ARRAY[94]),
       (array_fill(0.03::real, ARRAY[768]))::vector(768), 0.8, '{"judgments": 60}'::jsonb
  FROM (VALUES ('79000000-0000-4000-8000-000000000001'), ('79000000-0000-4000-8000-000000000003')) d(id)
ON CONFLICT (designer_id) DO UPDATE
  SET theta = EXCLUDED.theta, taste_vector = EXCLUDED.taste_vector,
      reliability = EXCLUDED.reliability, sources = EXCLUDED.sources, retired_at = NULL;

-- A house rule that blocks style S: P drops from a match exactly when the
-- match can see a1's S tag.
INSERT INTO taste_rules (owner_scope, scope, scope_value, predicate, action, status)
VALUES ('house', 'style', '79000000-0000-4000-8000-000000000021',
        '{"all": [{"attr": "category", "eq": "optout-790"}]}', 'block', 'active');

-- φ archetype slot of S (dims 7.. follow styles by display_order NULLS LAST, name).
CREATE FUNCTION pg_temp.phi_s(p_reader uuid) RETURNS real LANGUAGE sql AS $$
  SELECT (public._aesthete_phi('79000000-0000-4000-8000-000000000031', p_reader))[6 + x.rn]
    FROM (SELECT s.id, row_number() OVER (ORDER BY s.display_order NULLS LAST, s.name) AS rn
            FROM public.styles s) x
   WHERE x.id = '79000000-0000-4000-8000-000000000021';
$$;

CREATE FUNCTION pg_temp.consensus_n(p_designer uuid, p_style uuid) RETURNS int LANGUAGE sql AS $$
  SELECT (e->>'n')::int
    FROM jsonb_array_elements(public.get_designer_reliability_inputs(p_designer)->'consensus') e
   WHERE e->>'style_id' = p_style::text;
$$;

CREATE TEMP TABLE t_ids (k text PRIMARY KEY, id uuid);
CREATE TEMP TABLE t_match (k text, product_id uuid);
GRANT ALL ON t_match TO PUBLIC;

-- ─── 1. The setter: owner/admin only, logged ────────────────────────────────

SELECT ok(NOT has_function_privilege('anon', 'public.set_studio_teaching_sharing(uuid, boolean)', 'EXECUTE'),
          'anon cannot execute set_studio_teaching_sharing');
SELECT ok(NOT has_function_privilege('public', 'public.set_studio_teaching_sharing(uuid, boolean)', 'EXECUTE'),
          'public cannot execute set_studio_teaching_sharing');
SELECT is((SELECT share_teaching FROM organizations WHERE id = '79000000-0000-4000-8000-000000000012'), true,
          'a studio shares its teaching by default');

SELECT set_config('request.jwt.claims', '{"sub": "79000000-0000-4000-8000-000000000001", "role": "authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT is(public.set_studio_teaching_sharing('79000000-0000-4000-8000-000000000011', false), false,
          'the owner turns studio A''s sharing off');
SELECT set_config('app.teaching_sharing_setter', 'on', true);
SELECT throws_ok($$UPDATE public.organizations SET share_teaching = true WHERE id = '79000000-0000-4000-8000-000000000011'$$,
                 '42501', NULL, 'an owner cannot bypass the setter by setting the GUC');
RESET ROLE;

SELECT set_config('request.jwt.claims', '{"sub": "79000000-0000-4000-8000-000000000002", "role": "authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.set_studio_teaching_sharing('79000000-0000-4000-8000-000000000011', true)$$,
                 '42501', NULL, 'a member cannot change teaching sharing');
RESET ROLE;

SELECT set_config('request.jwt.claims', '{"sub": "79000000-0000-4000-8000-000000000003", "role": "authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.set_studio_teaching_sharing('79000000-0000-4000-8000-000000000011', true)$$,
                 '42501', NULL, 'an owner of another studio cannot change studio A');
RESET ROLE;

SELECT set_config('request.jwt.claims', '', true);
SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT public.set_studio_teaching_sharing('79000000-0000-4000-8000-000000000011', true)$$,
                 '42501', NULL, 'anon cannot change teaching sharing');
RESET ROLE;

SELECT set_config('request.jwt.claims', '{"sub": "79000000-0000-4000-8000-000000000005", "role": "authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT is(public.set_studio_teaching_sharing('79000000-0000-4000-8000-000000000011', false), false,
          'an admin may set it (unchanged here)');
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true);

SELECT is((SELECT share_teaching FROM organizations WHERE id = '79000000-0000-4000-8000-000000000011'), false,
          'studio A keeps its teaching');
SELECT is((SELECT count(*) FROM audit_logs
            WHERE action = 'studio_teaching_sharing_set'
              AND organization_id = '79000000-0000-4000-8000-000000000011'),
          1::bigint, 'one audit row: only a change is logged');
SELECT is((SELECT user_id::text || ':' || (old_values->>'share_teaching') || '>' || (new_values->>'share_teaching')
             FROM audit_logs
            WHERE action = 'studio_teaching_sharing_set'
              AND organization_id = '79000000-0000-4000-8000-000000000011'),
          '79000000-0000-4000-8000-000000000001:true>false', 'the audit row names the actor and the change');

-- ─── 2. Helpers: privileges and the membership rule ─────────────────────────

SELECT ok(NOT EXISTS (
  SELECT 1 FROM public.emergence_shareable_product_styles(ARRAY['79000000-0000-4000-8000-000000000031'::uuid])
  WHERE style_name = 'Opt-out Archetype S 790'),
  'emergence scorer labels exclude opted-out teacher');
SELECT ok(EXISTS (
  SELECT 1 FROM public.emergence_shareable_product_styles(ARRAY['79000000-0000-4000-8000-000000000032'::uuid])
  WHERE style_name = 'Opt-out Archetype S2 790'),
  'emergence scorer labels retain shareable teacher');

SELECT ok(NOT has_function_privilege('authenticated', 'public._teaching_shareable(uuid)', 'EXECUTE'),
          'authenticated cannot execute _teaching_shareable');
SELECT ok(NOT has_function_privilege('authenticated', 'public._teaching_visible_to(uuid, uuid)', 'EXECUTE'),
          'authenticated cannot execute _teaching_visible_to');
SELECT ok(NOT has_function_privilege('anon', 'public.teaching_row_visible(uuid)', 'EXECUTE'),
          'anon cannot execute teaching_row_visible');
SELECT ok(has_function_privilege('authenticated', 'public.teaching_row_visible(uuid)', 'EXECUTE'),
          'authenticated can execute teaching_row_visible (the RLS predicate)');

SELECT is(public._teaching_shareable('79000000-0000-4000-8000-000000000001'), false, 'a1 (studio A) is not shareable');
SELECT is(public._teaching_shareable('79000000-0000-4000-8000-000000000005'), false,
          'c1 (A and sharing C) is not shareable: any opted-out studio excludes');
SELECT is(public._teaching_shareable('79000000-0000-4000-8000-000000000003'), true, 'b1 (studio B) is shareable');
SELECT is(public._teaching_shareable('00000000-0000-0000-0000-000000000000'), true, 'the engine actor is shareable');
SELECT is(public._teaching_shareable('79000000-0000-4000-8000-000000000006'), true,
          'd1, only invited to A, is shareable');

-- ─── 3. Spectrum and φ ──────────────────────────────────────────────────────

SELECT is((SELECT origin FROM public._aesthete_product_spectrum('79000000-0000-4000-8000-000000000031')),
          'draft', 'P without a reader reads the draft, not a1''s spectrum');
SELECT is((SELECT origin FROM public._aesthete_product_spectrum('79000000-0000-4000-8000-000000000031',
                                                                 '79000000-0000-4000-8000-000000000003')),
          'draft', 'P read for b1 (another studio) reads the draft');
SELECT is((SELECT origin FROM public._aesthete_product_spectrum('79000000-0000-4000-8000-000000000031',
                                                                 '79000000-0000-4000-8000-000000000002')),
          'canonical', 'P read for a2 (a1''s studio) reads a1''s spectrum');
SELECT is((SELECT origin FROM public._aesthete_product_spectrum('79000000-0000-4000-8000-000000000032',
                                                                 '79000000-0000-4000-8000-000000000002')),
          'canonical', 'Q (shared) reads canonical for anyone');
SELECT is(pg_temp.phi_s('79000000-0000-4000-8000-000000000003'), 0::real,
          'φ archetype slot S is 0 for b1');
SELECT ok(pg_temp.phi_s('79000000-0000-4000-8000-000000000002') > 0,
          'φ archetype slot S is set for a2');
SELECT is(public._aesthete_primary_archetype('79000000-0000-4000-8000-000000000031'), NULL::uuid,
          'P has no public primary archetype');

-- ─── 4. Centroids ───────────────────────────────────────────────────────────

SELECT ok(public.refresh_style_centroids() >= 1, 'centroids refreshed');
SELECT is((SELECT count(*) FROM style_centroids WHERE style_id = '79000000-0000-4000-8000-000000000021'),
          0::bigint, 'S (taught only in A) has no centroid');
SELECT is((SELECT count(*) FROM style_centroids WHERE style_id = '79000000-0000-4000-8000-000000000022'),
          1::bigint, 'S2 (taught in B) has a centroid');

-- ─── 5. get_aesthete_matches ────────────────────────────────────────────────

SET LOCAL ROLE anon;
SELECT ok(submit_style_quiz('79000000-aaaa-4000-8000-000000000001'::uuid,
  '{"visual_resonance": "warm_minimal", "lifestyle": ["family"], "material": "weathered_oak", "investment": "heirloom", "catalyst": "new_home"}'::jsonb,
  '{}'::jsonb, 'marketing_site', '{}'::jsonb) IS NOT NULL, 'an anon visitor takes the quiz');
INSERT INTO t_match
SELECT 'house', m.product_id
  FROM get_aesthete_matches(p_session_key := '79000000-aaaa-4000-8000-000000000001', p_category := 'optout-790', p_limit := 10) m;
INSERT INTO t_match
SELECT 'a1', m.product_id
  FROM get_aesthete_matches(p_session_key := '79000000-aaaa-4000-8000-000000000001',
                            p_designer_id := '79000000-0000-4000-8000-000000000001',
                            p_category := 'optout-790', p_limit := 10) m;
RESET ROLE;

SELECT ok(EXISTS (SELECT 1 FROM t_match WHERE k = 'house' AND product_id = '79000000-0000-4000-8000-000000000031'),
          'an anon catalog match does not see a1''s style S on P (the S block rule does not fire)');
SELECT ok(NOT EXISTS (SELECT 1 FROM t_match WHERE k = 'a1' AND product_id = '79000000-0000-4000-8000-000000000031'),
          'a match through a1 sees S on P (the S block rule removes it)');

-- ─── 6. House consensus and the validated-catalog seed ──────────────────────

INSERT INTO t_ids VALUES ('draft_out', public.compute_house_taste_draft());
SELECT ok(NOT ((SELECT computed_from FROM house_taste WHERE id = (SELECT id FROM t_ids WHERE k = 'draft_out'))
               ? '79000000-0000-4000-8000-000000000001'),
          'an eligible a1 is absent from the house draft');
SELECT ok((SELECT computed_from FROM house_taste WHERE id = (SELECT id FROM t_ids WHERE k = 'draft_out'))
          ? '79000000-0000-4000-8000-000000000003',
          'b1 is in the house draft');

INSERT INTO t_ids VALUES ('seed_out', public.seed_house_from_validated_catalog());

-- ─── 7. Validation votes ────────────────────────────────────────────────────

SELECT is(pg_temp.consensus_n('79000000-0000-4000-8000-000000000003', '79000000-0000-4000-8000-000000000022'), 1,
          'b1''s consensus counts b2''s vote, not a2''s');
SELECT is(pg_temp.consensus_n('79000000-0000-4000-8000-000000000001', '79000000-0000-4000-8000-000000000021'), 2,
          'a1''s consensus counts b1''s vote and a2''s (same studio)');
SELECT ok(public.refresh_designer_teaching_stats() >= 1, 'teaching stats refreshed');
SELECT is((SELECT accuracy_score FROM designer_teaching_stats WHERE designer_id = '79000000-0000-4000-8000-000000000003'),
          1::real, 'b1''s accuracy excludes a2''s flag');

-- ─── 8. The spectrum table's read policy ────────────────────────────────────

SELECT set_config('request.jwt.claims', '{"sub": "79000000-0000-4000-8000-000000000003", "role": "authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM product_style_spectrum WHERE product_id = '79000000-0000-4000-8000-000000000031'),
          0::bigint, 'b1 cannot read a1''s spectrum row');
SELECT is((SELECT count(*) FROM product_style_spectrum WHERE product_id = '79000000-0000-4000-8000-000000000032'),
          1::bigint, 'b1 reads shared teaching');
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"sub": "79000000-0000-4000-8000-000000000001", "role": "authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM product_style_spectrum WHERE product_id = '79000000-0000-4000-8000-000000000031'),
          1::bigint, 'a1 reads its own spectrum row');
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"sub": "79000000-0000-4000-8000-000000000002", "role": "authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM product_style_spectrum WHERE product_id = '79000000-0000-4000-8000-000000000031'),
          1::bigint, 'a2 reads its studio''s spectrum row');
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"sub": "79000000-0000-4000-8000-000000000002", "role": "authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM teaching_validations WHERE product_id = '79000000-0000-4000-8000-000000000031'),
          2::bigint, 'a co-studio member can read opted-out validator rows');
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"sub": "79000000-0000-4000-8000-000000000003", "role": "authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM teaching_validations WHERE product_id = '79000000-0000-4000-8000-000000000031'),
          1::bigint, 'an unrelated studio cannot read opted-out validator rows');
RESET ROLE;

-- ─── 9. Flip back (by the admin): every reader restores ─────────────────────

SELECT set_config('request.jwt.claims', '{"sub": "79000000-0000-4000-8000-000000000005", "role": "authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT is(public.set_studio_teaching_sharing('79000000-0000-4000-8000-000000000011', true), true,
          'the admin turns studio A''s sharing back on');
SELECT is((SELECT count(*) FROM product_style_spectrum WHERE product_id = '79000000-0000-4000-8000-000000000031'),
          1::bigint, 'c1 reads P either way');
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"sub": "79000000-0000-4000-8000-000000000003", "role": "authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM product_style_spectrum WHERE product_id = '79000000-0000-4000-8000-000000000031'),
          1::bigint, 'after the flip back b1 reads a1''s spectrum row');
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true);

SELECT is((SELECT count(*) FROM audit_logs
            WHERE action = 'studio_teaching_sharing_set'
              AND organization_id = '79000000-0000-4000-8000-000000000011'
              AND user_id = '79000000-0000-4000-8000-000000000005'
              AND new_values->>'share_teaching' = 'true'),
          1::bigint, 'the flip back is logged with the admin as actor');
SELECT is(public._teaching_shareable('79000000-0000-4000-8000-000000000001'), true, 'a1 is shareable again');
SELECT is((SELECT origin FROM public._aesthete_product_spectrum('79000000-0000-4000-8000-000000000031',
                                                                 '79000000-0000-4000-8000-000000000003')),
          'canonical', 'P read for b1 is canonical again');
SELECT ok(pg_temp.phi_s('79000000-0000-4000-8000-000000000003') > 0, 'φ archetype slot S is set for b1 again');

SELECT ok(public.refresh_style_centroids() >= 1, 'centroids refreshed after the flip back');
SELECT is((SELECT count(*) FROM style_centroids WHERE style_id = '79000000-0000-4000-8000-000000000021'),
          1::bigint, 'S has a centroid again');

SET LOCAL ROLE anon;
INSERT INTO t_match
SELECT 'house_back', m.product_id
  FROM get_aesthete_matches(p_session_key := '79000000-aaaa-4000-8000-000000000001', p_category := 'optout-790', p_limit := 10) m;
RESET ROLE;
SELECT ok(NOT EXISTS (SELECT 1 FROM t_match WHERE k = 'house_back' AND product_id = '79000000-0000-4000-8000-000000000031'),
          'an anon catalog match sees S on P again (the S block rule removes it)');

INSERT INTO t_ids VALUES ('draft_back', public.compute_house_taste_draft());
SELECT ok((SELECT computed_from FROM house_taste WHERE id = (SELECT id FROM t_ids WHERE k = 'draft_back'))
          ? '79000000-0000-4000-8000-000000000001',
          'a1 is back in the house draft');

INSERT INTO t_ids VALUES ('seed_back', public.seed_house_from_validated_catalog());
SELECT is((SELECT (computed_from->>'n_products')::int FROM house_taste WHERE id = (SELECT id FROM t_ids WHERE k = 'seed_back')),
          (SELECT (computed_from->>'n_products')::int FROM house_taste WHERE id = (SELECT id FROM t_ids WHERE k = 'seed_out')) + 1,
          'the validated-catalog seed counts P only while A shares');

SELECT is(pg_temp.consensus_n('79000000-0000-4000-8000-000000000003', '79000000-0000-4000-8000-000000000022'), 2,
          'b1''s consensus counts a2''s vote again');

SELECT * FROM finish();
ROLLBACK;
