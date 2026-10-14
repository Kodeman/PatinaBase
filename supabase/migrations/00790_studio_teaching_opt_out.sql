-- ═══════════════════════════════════════════════════════════════════════════
-- 00790 — R5 (V23): a studio can keep its teaching to itself
--
-- A studio's corrections (spectrums, style tags, validation votes, taste
-- judgments) help Patina read pieces better for every studio. An owner or
-- admin can now turn that off: organizations.share_teaching (default true),
-- set through set_studio_teaching_sharing, logged to audit_logs.
--
-- SHAPE (SQ-931 contract, option c): nothing moves on the write path.
-- Teaching keeps landing in the shared tables; shareability is derived LIVE
-- from the teacher (assigned_by / validator_id / designer_id) and their
-- current ACTIVE memberships. A designer in several studios is excluded if
-- ANY of them opted out. Flipping the setting takes effect on the next call
-- in both directions — nothing is copied, deleted or backfilled.
--
--   _teaching_shareable(user)            false iff any active studio opted out
--   _teaching_visible_to(teacher, reader) shareable, or reader is the teacher,
--                                        or the two share an active studio
--   teaching_row_visible(teacher)        RLS wrapper: reader = auth.uid()
--
-- READERS RE-ISSUED (each from its latest body, verbatim apart from the
-- marked 00790 lines):
--   • _aesthete_product_spectrum / _aesthete_phi / _aesthete_taste_term /
--     _aesthete_primary_archetype gain p_reader uuid DEFAULT NULL (NULL =
--     shared teaching only). The one-argument signatures are DROPPED first
--     so existing one-argument calls resolve to the new default rather than
--     becoming ambiguous.
--   • get_aesthete_matches (00244): the reader is p_designer_id — spectrum,
--     taste term and the primary-style LATERAL (rules, why) honour it.
--   • get_taste_refit_payload / preview_taste_update: the designer's own φ.
--   • get_designer_reliability_inputs / refresh_designer_teaching_stats: an
--     opted-out validator's votes count only inside their studio.
--   • refresh_style_centroids / compute_house_taste_draft /
--     seed_house_from_validated_catalog: shared teaching only.
--   • derive_signature_biases keeps the default (public φ).
--   • product_style_spectrum's read-all policy becomes
--     teaching_row_visible(assigned_by).
--
-- NOT SCRUBBED (settled): already-assembled client_style_profiles, the
-- ACTIVE house_taste row and match_events. Nightly-derived tables
-- (style_centroids, designer_teaching_stats, ρ, θ_D) follow at the next run.
-- product_styles display reads (anon catalog, search, spec PDF) stay
-- read-all: an opted-out studio's style tag still labels a shared catalog
-- piece but trains and scores nothing.
--
-- Adds GRANT/REVOKE → supabase/seed/00-legacy-grants.sql needs regenerating
-- (integration, once per wave).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. The studio's setting ────────────────────────────────────────────────

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS share_teaching boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.organizations.share_teaching IS
  'R5 (00790): true (default) = this studio''s corrections help Patina for every studio. '
  'False = they stay with the studio: its members'' teaching is skipped by every cross-studio reader. '
  'Set through set_studio_teaching_sharing.';

CREATE OR REPLACE FUNCTION public.guard_share_teaching_setter()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NEW.share_teaching IS DISTINCT FROM OLD.share_teaching
     AND current_user NOT IN ('postgres', 'service_role') THEN
    RAISE EXCEPTION 'share_teaching must be changed through set_studio_teaching_sharing'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS organizations_guard_share_teaching_setter ON public.organizations;
CREATE TRIGGER organizations_guard_share_teaching_setter
  BEFORE UPDATE OF share_teaching ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.guard_share_teaching_setter();

-- ─── 2. Who may read whose teaching ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._teaching_shareable(p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT NOT EXISTS (
    SELECT 1
      FROM organization_members om
      JOIN organizations o ON o.id = om.organization_id
     WHERE om.user_id = p_user
       AND om.status = 'active'
       AND NOT o.share_teaching);
$fn$;

COMMENT ON FUNCTION public._teaching_shareable(uuid) IS
  'R5 (00790): false iff ANY active studio of this user keeps its teaching. A user with no studio (the ML engine actor, a NULL teacher) is shareable. Internal — never granted to client roles.';

CREATE OR REPLACE FUNCTION public._teaching_visible_to(p_teacher uuid, p_reader uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT public._teaching_shareable(p_teacher)
      OR (p_reader IS NOT NULL
          AND (p_reader = p_teacher
               OR EXISTS (
                 SELECT 1
                   FROM organization_members a
                   JOIN organization_members b USING (organization_id)
                  WHERE a.user_id = p_teacher AND a.status = 'active'
                    AND b.user_id = p_reader  AND b.status = 'active')));
$fn$;

COMMENT ON FUNCTION public._teaching_visible_to(uuid, uuid) IS
  'R5 (00790): whether p_teacher''s teaching may shape what p_reader gets: shared teaching always; kept teaching only for the teacher and anyone in an active studio with them. NULL reader = shared only. Internal — never granted to client roles (it would answer "do these two share a studio").';

CREATE OR REPLACE FUNCTION public.teaching_row_visible(p_teacher uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT public._teaching_visible_to(p_teacher, auth.uid());
$fn$;

COMMENT ON FUNCTION public.teaching_row_visible(uuid) IS
  'R5 (00790): RLS predicate for teaching rows — _teaching_visible_to(teacher, auth.uid()).';

REVOKE ALL ON FUNCTION public._teaching_shareable(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._teaching_visible_to(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.teaching_row_visible(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.teaching_row_visible(uuid) TO authenticated;

-- The legacy emergence scorer uses service role; return only labels from
-- currently shareable teachers, without exposing the internal predicate.
CREATE OR REPLACE FUNCTION public.emergence_shareable_product_styles(p_product_ids uuid[])
RETURNS TABLE (product_id uuid, style_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT ps.product_id, s.name
    FROM public.product_styles ps
    JOIN public.styles s ON s.id = ps.style_id
   WHERE ps.product_id = ANY(p_product_ids)
     AND public._teaching_shareable(ps.assigned_by);
$fn$;

REVOKE ALL ON FUNCTION public.emergence_shareable_product_styles(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.emergence_shareable_product_styles(uuid[]) TO service_role;

-- ─── 3. The setter (owner/admin, the 00710 pattern) ─────────────────────────

CREATE OR REPLACE FUNCTION public.set_studio_teaching_sharing(
  p_studio_id uuid,
  p_share boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_old boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'set_studio_teaching_sharing: not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_share IS NULL THEN
    RAISE EXCEPTION 'set_studio_teaching_sharing: share is true or false' USING ERRCODE = 'null_value_not_allowed';
  END IF;
  SELECT o.share_teaching INTO v_old FROM public.organizations o WHERE o.id = p_studio_id FOR UPDATE;
  IF NOT FOUND OR NOT public.is_org_admin_or_owner(p_studio_id) THEN
    RAISE EXCEPTION 'set_studio_teaching_sharing: only an owner or admin can change teaching sharing'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_old IS DISTINCT FROM p_share THEN
    UPDATE public.organizations
       SET share_teaching = p_share,
           updated_at = now()
     WHERE id = p_studio_id;

    INSERT INTO public.audit_logs
      (user_id, organization_id, action, resource_type, resource_id, old_values, new_values)
    VALUES
      (auth.uid(), p_studio_id, 'studio_teaching_sharing_set', 'organizations', p_studio_id,
       jsonb_build_object('share_teaching', v_old),
       jsonb_build_object('share_teaching', p_share));
  END IF;

  RETURN p_share;
END;
$$;

COMMENT ON FUNCTION public.set_studio_teaching_sharing(uuid, boolean) IS
  'R5 (00790): turns the studio''s teaching sharing on or off. Owner/admin seat only; each change is logged to audit_logs (actor, at, old/new). Refreshes nothing inline — live readers follow on their next call, nightly tables at the next run.';

REVOKE ALL ON FUNCTION public.set_studio_teaching_sharing(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_studio_teaching_sharing(uuid, boolean) TO authenticated;

-- ─── 4. The spectrum table reads only visible teaching ──────────────────────
-- Pure teaching table; its only app reader is the teaching UI. The teacher and
-- their studio still see their own rows.

DROP POLICY IF EXISTS "Users can read all product style spectrum" ON public.product_style_spectrum;
DROP POLICY IF EXISTS "Users can read visible product style spectrum" ON public.product_style_spectrum;
CREATE POLICY "Users can read visible product style spectrum"
  ON public.product_style_spectrum FOR SELECT
  TO authenticated
  USING (public.teaching_row_visible(assigned_by));

DROP POLICY IF EXISTS "Users can read teaching validations" ON public.teaching_validations;
DROP POLICY IF EXISTS "Users can read visible teaching validations" ON public.teaching_validations;
CREATE POLICY "Users can read visible teaching validations"
  ON public.teaching_validations FOR SELECT
  TO authenticated
  USING (public.teaching_row_visible(validator_id));

-- ─── 5. Internal model helpers gain the reader ──────────────────────────────

DROP FUNCTION IF EXISTS public._aesthete_taste_term(real[], uuid);
DROP FUNCTION IF EXISTS public._aesthete_phi(uuid);
DROP FUNCTION IF EXISTS public._aesthete_primary_archetype(uuid);
DROP FUNCTION IF EXISTS public._aesthete_product_spectrum(uuid);

CREATE OR REPLACE FUNCTION _aesthete_product_spectrum(p_product_id uuid, p_reader uuid DEFAULT NULL)
RETURNS TABLE (spectrums jsonb, conf jsonb, origin text)
LANGUAGE plpgsql STABLE
SET search_path = public
AS $fn$
DECLARE
  v_dims text[] := ARRAY['warmth','complexity','formality','timelessness','boldness','craftsmanship'];
  v_row product_style_spectrum;
  v_default real;
  v_s jsonb;
  v_c jsonb;
  v_draft jsonb;
  v_draft_conf jsonb;
  v_overall real;
BEGIN
  SELECT * INTO v_row FROM product_style_spectrum pss WHERE pss.product_id = p_product_id;
  -- 00790: the canonical row counts only where its teacher's teaching is
  -- visible to p_reader; otherwise the draft below answers.
  IF FOUND AND _teaching_visible_to(v_row.assigned_by, p_reader) THEN
    v_s := jsonb_strip_nulls(jsonb_build_object(
      'warmth', v_row.warmth, 'complexity', v_row.complexity, 'formality', v_row.formality,
      'timelessness', v_row.timelessness, 'boldness', v_row.boldness, 'craftsmanship', v_row.craftsmanship));
    IF v_s <> '{}'::jsonb THEN
      v_default := CASE WHEN v_row.source = 'validated' THEN 0.95 ELSE 0.7 END;
      SELECT COALESCE(jsonb_object_agg(k, LEAST(1.0, GREATEST(0.0,
               COALESCE((v_row.confidence->>k)::real, v_default)))), '{}'::jsonb)
        INTO v_c
        FROM jsonb_object_keys(v_s) k;
      RETURN QUERY SELECT v_s, v_c,
        CASE WHEN v_row.source = 'validated' THEN 'validated' ELSE 'canonical' END;
      RETURN;
    END IF;
  END IF;

  SELECT d.draft->'style'->'spectrums',
         d.draft->'style'->'spectrum_conf',
         COALESCE((d.draft->>'overall_confidence')::real, 0.5)
    INTO v_draft, v_draft_conf, v_overall
    FROM product_dna_drafts d
   WHERE d.product_id = p_product_id
   ORDER BY d.created_at DESC, d.id DESC
   LIMIT 1;

  IF v_draft IS NOT NULL AND jsonb_typeof(v_draft) = 'object' THEN
    SELECT COALESCE(jsonb_object_agg(k, GREATEST(-1.0, LEAST(1.0, (v_draft->>k)::real))), '{}'::jsonb)
      INTO v_s
      FROM unnest(v_dims) k
     WHERE v_draft ? k AND jsonb_typeof(v_draft->k) = 'number';
    IF v_s <> '{}'::jsonb THEN
      SELECT COALESCE(jsonb_object_agg(k, LEAST(0.6, GREATEST(0.0,
               COALESCE((v_draft_conf->>k)::real, v_overall, 0.5)))), '{}'::jsonb)
        INTO v_c
        FROM jsonb_object_keys(v_s) k;
      RETURN QUERY SELECT v_s, v_c, 'draft'::text;
    END IF;
  END IF;
  RETURN;
END $fn$;

COMMENT ON FUNCTION _aesthete_product_spectrum(uuid, uuid) IS
  'Canonical-else-draft spectrum read (design §5.2): designer-written product_style_spectrum (validated 0.95 / manual 0.7 per-dim default) else latest draft spectrums capped at 0.6 confidence. Internal — the whole catalog is matchable from drafts while designers work the queue. 00790: the canonical row counts only when _teaching_visible_to(assigned_by, p_reader); NULL p_reader = shared teaching only.';

CREATE OR REPLACE FUNCTION _aesthete_primary_archetype(p_product_id uuid, p_reader uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE sql STABLE
SET search_path = public
AS $fn$
  SELECT ps.style_id
    FROM product_styles ps
    JOIN styles s ON s.id = ps.style_id AND s.is_archetype
   WHERE ps.product_id = p_product_id
     AND _teaching_visible_to(ps.assigned_by, p_reader)  -- 00790
   ORDER BY ps.confidence DESC NULLS LAST, s.display_order NULLS LAST, s.name
   LIMIT 1
$fn$;

COMMENT ON FUNCTION _aesthete_primary_archetype(uuid, uuid) IS
  'Primary archetype of a product: highest-confidence archetype row in product_styles, ties broken by the φ ordering law (styles.display_order NULLS LAST, name). Style-group resolver for the nightly refit/reliability (00248). 00790: only product_styles rows whose teaching is visible to p_reader; NULL p_reader = shared teaching only.';

CREATE OR REPLACE FUNCTION _aesthete_phi(p_product_id uuid, p_reader uuid DEFAULT NULL)
RETURNS real[]
LANGUAGE plpgsql STABLE
SET search_path = public
AS $fn$
DECLARE
  v_phi real[] := '{}';
  v_spec record;
  v_dim text;
  v_arch real[];
  v_arch_sum real;
  v_mats text[];
  v_bucket text;
  v_buckets text[] := ARRAY['wood','metal','fabric','stone','glass','leather','rattan','marble','ceramic','mixed'];
  v_hit text[];
  v_dna record;
  v_vec real[];
  v_norm double precision;
  i int;
BEGIN
  -- [1..6] spectrums ⊙ confidence
  SELECT ps.spectrums, ps.conf INTO v_spec FROM _aesthete_product_spectrum(p_product_id, p_reader) ps;
  FOREACH v_dim IN ARRAY ARRAY['warmth','complexity','formality','timelessness','boldness','craftsmanship'] LOOP
    v_phi := v_phi || COALESCE(
      ((v_spec.spectrums->>v_dim)::real * COALESCE((v_spec.conf->>v_dim)::real, 0.5)), 0)::real;
  END LOOP;

  -- [7..18] archetype weights (canonical style ordering — see header)
  SELECT array_agg(COALESCE(pw.wt, 0) ORDER BY s.display_order NULLS LAST, s.name),
         sum(COALESCE(pw.wt, 0))
    INTO v_arch, v_arch_sum
    FROM styles s
    LEFT JOIN LATERAL (
      SELECT COALESCE(ps2.confidence, 1.0)::real AS wt
        FROM product_styles ps2
       WHERE ps2.product_id = p_product_id AND ps2.style_id = s.id
         AND _teaching_visible_to(ps2.assigned_by, p_reader)  -- 00790
       LIMIT 1) pw ON true;
  IF v_arch IS NULL THEN v_arch := array_fill(0::real, ARRAY[12]); v_arch_sum := 0; END IF;
  FOR i IN 1..array_length(v_arch, 1) LOOP
    v_phi := v_phi || CASE WHEN v_arch_sum > 0 THEN (v_arch[i] / v_arch_sum)::real ELSE 0::real END;
  END LOOP;

  -- [19..28] materials one-hot
  SELECT p.materials INTO v_mats FROM products p WHERE p.id = p_product_id;
  SELECT COALESCE(array_agg(DISTINCT _aesthete_material_bucket(m.x)), '{}')
    INTO v_hit FROM unnest(COALESCE(v_mats, '{}'::text[])) m(x);
  FOREACH v_bucket IN ARRAY v_buckets LOOP
    v_phi := v_phi || CASE
      WHEN v_bucket = 'mixed' AND (array_length(v_hit, 1) >= 3 OR 'mixed' = ANY(v_hit)) THEN 1::real
      WHEN v_bucket <> 'mixed' AND v_bucket = ANY(v_hit) THEN 1::real
      ELSE 0::real END;
  END LOOP;

  -- [29..30] patina_potential, craftsmanship_tier
  SELECT d.patina_potential, d.craftsmanship_tier INTO v_dna
    FROM product_dna d WHERE d.product_id = p_product_id;
  v_phi := v_phi || COALESCE(v_dna.patina_potential, 0)::real;
  v_phi := v_phi || COALESCE(v_dna.craftsmanship_tier, 0)::real;

  -- [31..94] Matryoshka-truncated aesthete_vector, ℓ2-normalized
  SELECT (p.aesthete_vector::real[])[1:64] INTO v_vec
    FROM products p WHERE p.id = p_product_id AND p.aesthete_vector IS NOT NULL;
  IF v_vec IS NULL THEN
    v_phi := v_phi || array_fill(0::real, ARRAY[64]);
  ELSE
    SELECT sqrt(sum(x * x)) INTO v_norm FROM unnest(v_vec) x;
    IF v_norm IS NULL OR v_norm = 0 THEN
      v_phi := v_phi || array_fill(0::real, ARRAY[64]);
    ELSE
      FOR i IN 1..64 LOOP
        v_phi := v_phi || (COALESCE(v_vec[i], 0) / v_norm)::real;
      END LOOP;
    END IF;
  END IF;

  RETURN v_phi;
END $fn$;

COMMENT ON FUNCTION _aesthete_phi(uuid, uuid) IS
  'The §8.1 94-d interpretable feature map φ(p). Ordering contract (Wave 4A refit MUST match): 6 conf-weighted spectrums · 12 archetypes by styles.display_order NULLS LAST, name · 10 material one-hots (wood, metal, fabric, stone, glass, leather, rattan, marble, ceramic, mixed) · patina_potential · craftsmanship_tier · 64-d normalized Matryoshka slice of aesthete_vector. NO price/budget features — structural §13 guardrail. 00790: spectrum and archetype slots read only teaching visible to p_reader; NULL p_reader = shared teaching only.';

CREATE OR REPLACE FUNCTION _aesthete_taste_term(p_theta real[], p_product_id uuid, p_reader uuid DEFAULT NULL)
RETURNS real
LANGUAGE plpgsql STABLE
SET search_path = public
AS $fn$
DECLARE
  v_phi real[];
  v_dot double precision;
BEGIN
  IF p_theta IS NULL THEN RETURN NULL; END IF;
  v_phi := _aesthete_phi(p_product_id, p_reader);
  SELECT sum(t.x * v_phi[t.ord]) INTO v_dot
    FROM unnest(p_theta) WITH ORDINALITY t(x, ord)
   WHERE t.ord <= array_length(v_phi, 1);
  IF v_dot IS NULL THEN RETURN NULL; END IF;
  RETURN (1.0 / (1.0 + exp(-v_dot)))::real;
END $fn$;

REVOKE ALL ON FUNCTION _aesthete_product_spectrum(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION _aesthete_primary_archetype(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION _aesthete_phi(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION _aesthete_taste_term(real[], uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ─── 6. get_aesthete_matches (00244, its only definition) ───────────────────

CREATE OR REPLACE FUNCTION get_aesthete_matches(
  p_session_key uuid,                  -- client capability (anon or claimed)
  p_designer_id uuid  DEFAULT NULL,    -- NULL → pure house
  p_w real            DEFAULT NULL,    -- NULL → context default (0 anon, 0.35 assigned)
  p_category text     DEFAULT NULL,
  p_room_id uuid      DEFAULT NULL,
  p_layer text        DEFAULT 'catalog',
  p_limit int         DEFAULT 10,
  p_offset int        DEFAULT 0,
  p_explore_ratio real DEFAULT 0.2,
  p_weights_profile text DEFAULT 'default'
) RETURNS TABLE (product_id uuid, rank int, score real, confidence real,
                 is_exploration boolean, why jsonb)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_t0 timestamptz := clock_timestamp();
  v_caller uuid := auth.uid();
  -- 00790: whose studio's private teaching this match may read. NULL (pure
  -- house, anon) reads shared teaching only.
  v_reader uuid := p_designer_id;
  v_profile client_style_profiles;
  v_house_version int;
  v_house_vec vector;
  v_theta_h real[];
  v_theta_d real[];
  v_rho real := 0;
  v_cbar real := 0.4;
  v_w real;
  v_w_eff real := 0;
  v_vd vector;
  v_blend vector;
  v_query vector;
  v_weights jsonb;
  v_weights_version int;
  v_w_style real; v_w_spec real; v_w_taste real; v_w_mc real; v_w_budget real;
  v_w_function real; v_w_ctx real; v_w_patina real; v_w_beh real; v_w_pen real;
  v_client_s jsonb;
  v_client_c jsonb;
  v_aff jsonb;
  v_fp jsonb;
  v_patina_aff real;
  v_client_warmth real;
  v_bmin bigint; v_bmax bigint; v_omega real := 0;
  v_demand_kids boolean := false;
  v_layer text;
  v_limit int; v_offset int;
  v_n_explore int; v_exploit_needed int;
  v_total int := 0;
  v_room_w double precision; v_room_l double precision;
  v_pick uuid;
  v_nov double precision; v_nov_calc double precision; v_es_weight double precision;
  v_rank int;
  r record; rr record;
  v_reasons jsonb; v_cautions jsonb; v_used text[]; v_has_concrete boolean;
  v_band text; v_phrase text; v_reason jsonb; v_axis text;
  v_results jsonb := '[]'::jsonb;
  v_why jsonb;
  v_source text;
  v_latency int;
  i int;
BEGIN
  -- ── resolve + validate ──
  IF p_session_key IS NULL THEN
    RAISE EXCEPTION 'get_aesthete_matches: p_session_key is required (§10.1)';
  END IF;
  v_limit := LEAST(GREATEST(COALESCE(p_limit, 10), 1), 50);
  v_offset := GREATEST(COALESCE(p_offset, 0), 0);

  -- weights profile: highest active version of the requested name, falling
  -- back to 'default' (§5.5).
  SELECT mwp.weights, mwp.version INTO v_weights, v_weights_version
    FROM match_weight_profiles mwp
   WHERE mwp.name = COALESCE(p_weights_profile, 'default') AND mwp.is_active
   ORDER BY mwp.version DESC LIMIT 1;
  IF v_weights IS NULL AND COALESCE(p_weights_profile, 'default') <> 'default' THEN
    SELECT mwp.weights, mwp.version INTO v_weights, v_weights_version
      FROM match_weight_profiles mwp
     WHERE mwp.name = 'default' AND mwp.is_active
     ORDER BY mwp.version DESC LIMIT 1;
  END IF;
  IF v_weights IS NULL THEN
    RAISE EXCEPTION 'get_aesthete_matches: no active match_weight_profiles row (seed missing?)';
  END IF;
  v_w_style    := COALESCE((v_weights->>'style_dense')::real, 0.30);
  v_w_spec     := COALESCE((v_weights->>'spectrum')::real, 0.15);
  v_w_taste    := COALESCE((v_weights->>'taste')::real, 0.12);
  v_w_mc       := COALESCE((v_weights->>'material_color')::real, 0.10);
  v_w_budget   := COALESCE((v_weights->>'budget')::real, 0.10);
  v_w_function := COALESCE((v_weights->>'function')::real, 0.08);
  v_w_ctx      := COALESCE((v_weights->>'context')::real, 0.05);
  v_w_patina   := COALESCE((v_weights->>'patina')::real, 0.05);
  v_w_beh      := COALESCE((v_weights->>'behavioral')::real, 0.05);
  v_w_pen      := COALESCE((v_weights->>'penalty')::real, 0.30);

  -- client profile by bearer capability: unknown keys 404 (§7.1/§10.2).
  SELECT csp.* INTO v_profile
    FROM client_style_profiles csp
   WHERE csp.session_key = p_session_key AND csp.is_current
   LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'get_aesthete_matches: unknown session_key' USING ERRCODE = 'P0002';
  END IF;
  IF v_profile.user_id IS NOT NULL AND v_caller IS NOT NULL AND v_caller <> v_profile.user_id THEN
    RAISE EXCEPTION 'get_aesthete_matches: this session_key belongs to another account' USING ERRCODE = '42501';
  END IF;

  -- layer visibility — enforced INTERNALLY (DEFINER bypasses RLS, §5.6):
  -- anon ⇒ catalog only, whatever was asked for.
  v_layer := COALESCE(p_layer, 'catalog');
  IF v_layer NOT IN ('personal', 'studio', 'catalog') THEN
    RAISE EXCEPTION 'get_aesthete_matches: p_layer must be personal|studio|catalog, got %', v_layer;
  END IF;
  IF v_caller IS NULL THEN
    v_layer := 'catalog';
  END IF;

  -- house (active row; provisional v1 seed from 00242 until House Hundred).
  SELECT ht.version, ht.taste_vector, ht.theta
    INTO v_house_version, v_house_vec, v_theta_h
    FROM house_taste ht WHERE ht.status = 'active'
   ORDER BY ht.version DESC LIMIT 1;

  -- designer + dial (§9.2/§9.3).
  IF p_designer_id IS NOT NULL THEN
    SELECT COALESCE(dtp.reliability, 0.15), dtp.theta,
           COALESCE(dtp.taste_vector, dtp.portfolio_centroid)
      INTO v_rho, v_theta_d, v_vd
      FROM designer_taste_profiles dtp
     WHERE dtp.designer_id = p_designer_id AND dtp.retired_at IS NULL;
    IF NOT FOUND THEN
      v_rho := 0.15;  -- §9.3 cold start: dial exists from day one, bends slowly
    END IF;
    SELECT COALESCE(avg(dsc.weight), 0.4) INTO v_cbar
      FROM designer_style_confidence dsc WHERE dsc.designer_id = p_designer_id;
  END IF;
  v_w := LEAST(1.0, GREATEST(0.0,
          COALESCE(p_w, CASE WHEN p_designer_id IS NOT NULL THEN 0.35 ELSE 0 END)));
  v_w_eff := v_w * v_rho * v_cbar;   -- global w_eff (tinting + logging; header note)

  -- v_blend (dense, ANN tinting only) with §9.2 NULL-handling.
  IF v_vd IS NOT NULL AND v_house_vec IS NOT NULL THEN
    v_blend := vec_normalize(vec_lerp(v_vd, v_house_vec, v_w_eff));
  ELSIF v_vd IS NOT NULL THEN
    v_blend := v_vd;
  ELSE
    v_blend := v_house_vec;          -- may be NULL → tinting skipped
  END IF;

  -- v_query (§10.2 Stage 1): 0.8·v_client + 0.2·v_blend.
  IF v_profile.style_vector IS NOT NULL THEN
    IF v_blend IS NOT NULL THEN
      v_query := vec_normalize(vec_scale(v_profile.style_vector, 0.8) + vec_scale(v_blend, 0.2));
    ELSE
      v_query := v_profile.style_vector;
    END IF;
  END IF;

  -- client-side scoring inputs.
  v_client_s := jsonb_strip_nulls(jsonb_build_object(
    'warmth', v_profile.warmth, 'complexity', v_profile.complexity,
    'formality', v_profile.formality, 'timelessness', v_profile.timelessness,
    'boldness', v_profile.boldness, 'craftsmanship', v_profile.craftsmanship));
  v_client_c := COALESCE(v_profile.spectrum_confidence, '{}'::jsonb);
  v_aff := COALESCE(v_profile.material_affinities, '{}'::jsonb);
  v_fp := COALESCE(v_profile.functional_priorities, '{}'::jsonb);
  v_patina_aff := COALESCE(v_profile.patina_affinity, 0);
  v_client_warmth := v_profile.warmth;
  v_bmin := NULLIF(v_profile.budget->>'min_cents', '')::bigint;
  v_bmax := NULLIF(v_profile.budget->>'max_cents', '')::bigint;
  v_omega := COALESCE((v_profile.budget->>'value_orientation')::real, 0);
  v_demand_kids := (v_fp->>'durability') = 'kids_pets';

  IF p_room_id IS NOT NULL THEN
    SELECT rm.width_meters, rm.length_meters INTO v_room_w, v_room_l
      FROM rooms rm WHERE rm.id = p_room_id;
  END IF;

  -- ANN session knobs, guarded by which index landed (§5.1/§10.2).
  IF v_query IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_indexes pi WHERE pi.schemaname = 'public' AND pi.indexname = 'idx_products_aesthete_hnsw') THEN
      EXECUTE 'SET LOCAL hnsw.ef_search = 100';
    ELSIF EXISTS (SELECT 1 FROM pg_indexes pi WHERE pi.schemaname = 'public' AND pi.indexname = 'idx_products_aesthete_ivf') THEN
      EXECUTE 'SET LOCAL ivfflat.probes = 10';
    END IF;
  END IF;

  -- ── Stage 0: hard filters + enrichment (§10.2) ──
  DROP TABLE IF EXISTS _ae_base;
  CREATE TEMP TABLE _ae_base (
    pid uuid PRIMARY KEY, pname text, pbrand text, pcategory text, pprice int,
    pmaterials text[], pvec vector(768), pdims jsonb, pstatus text, plead int,
    pspec jsonb, pspec_conf jsonb, pspec_origin text,
    pstyle_id uuid, pstyle_name text,
    ppatina real, phonesty real, pcraft real, pcolor_temp real, pcolor text,
    pdurable text[], pcomfort real, pflex real, pfunction text,
    pvalue_story text, pprovenance text, pdna_conf jsonb, has_dna boolean,
    rattrs jsonb
  ) ON COMMIT DROP;

  INSERT INTO _ae_base
  SELECT p.id, p.name, p.brand, p.category, p.price_retail,
         p.materials, p.aesthete_vector, p.dimensions, p.status, p.lead_time_weeks,
         sp.spectrums, sp.conf, sp.origin,
         prim.style_id, prim.style_name,
         d.patina_potential, d.material_honesty, d.craftsmanship_tier, d.color_temperature,
         d.dominant_color,
         d.durability_for, d.comfort, d.flexibility, d.primary_function,
         d.value_story, d.provenance_story, d.confidence, (d.product_id IS NOT NULL),
         jsonb_strip_nulls(COALESCE(sp.spectrums, '{}'::jsonb) || jsonb_build_object(
           'category', p.category, 'subcategory', p.subcategory, 'brand', p.brand,
           'layer', p.layer, 'price_retail', p.price_retail,
           'materials', CASE WHEN p.materials IS NOT NULL THEN to_jsonb(p.materials) END,
           'style', prim.style_name,
           'patina_potential', d.patina_potential, 'material_honesty', d.material_honesty,
           'craftsmanship_tier', d.craftsmanship_tier, 'color_temperature', d.color_temperature,
           'dominant_color', d.dominant_color, 'palette_family', d.palette_family,
           'sheen', d.sheen, 'pattern_density', d.pattern_density,
           'line_quality', d.line_quality, 'visual_scale', d.visual_scale))
    FROM products p
    LEFT JOIN LATERAL (SELECT ps.spectrums, ps.conf, ps.origin
                         FROM _aesthete_product_spectrum(p.id, v_reader) ps) sp ON true
    LEFT JOIN product_dna d ON d.product_id = p.id
    LEFT JOIN LATERAL (
      SELECT ps2.style_id, st.name AS style_name
        FROM product_styles ps2 JOIN styles st ON st.id = ps2.style_id
       WHERE ps2.product_id = p.id
         AND _teaching_visible_to(ps2.assigned_by, v_reader)  -- 00790
       ORDER BY ps2.is_primary DESC NULLS LAST, ps2.confidence DESC NULLS LAST, st.name
       LIMIT 1) prim ON true
   WHERE p.deleted_at IS NULL
     AND p.merged_into_id IS NULL
     AND CASE v_layer
           WHEN 'catalog' THEN p.layer = 'catalog' AND p.status = 'published'
           WHEN 'personal' THEN p.layer = 'personal' AND p.owner_user_id = v_caller
                AND COALESCE(p.status, 'draft') NOT IN ('deprecated', 'archived')
           WHEN 'studio' THEN p.layer = 'studio'
                AND p.studio_id IN (SELECT om.organization_id FROM organization_members om
                                     WHERE om.user_id = v_caller AND om.status = 'active')
                AND COALESCE(p.status, 'draft') NOT IN ('deprecated', 'archived')
         END
     AND (p_category IS NULL OR p.category = p_category)
     -- price ≤ 1.25·budget_max when present; NULL prices pass (missing data
     -- is never an exclusion — T_budget just drops for them) (§10.2/§10.4)
     AND (v_bmax IS NULL OR p.price_retail IS NULL OR p.price_retail::numeric <= 1.25 * v_bmax)
     -- designer contraindications (designer_clients.contraindicated_style_ids):
     -- Phase-2 column — does not exist yet (§7.3); filter lands with it.
     -- kids/pets durability demand (§10.2): exclude only on an explicit
     -- honest contraindication; missing DNA never excludes.
     AND (NOT v_demand_kids
          OR d.maintenance_reality IS NULL
          OR NOT (COALESCE(d.maintenance_reality->>'kids', '') IN ('avoid', 'no')
               OR COALESCE(d.maintenance_reality->>'pets', '') IN ('avoid', 'no')));

  -- taste_rules action='block' — hard pre-filter (§10.2, salvage §c).
  DELETE FROM _ae_base b
   WHERE EXISTS (
     SELECT 1 FROM taste_rules tr
      WHERE tr.status = 'active' AND tr.action = 'block'
        AND (tr.owner_scope = 'house' OR (p_designer_id IS NOT NULL AND tr.designer_id = p_designer_id))
        AND (tr.scope = 'global'
             OR (tr.scope = 'category' AND tr.scope_value = b.pcategory)
             OR (tr.scope = 'style' AND (tr.scope_value = b.pstyle_id::text OR tr.scope_value = b.pstyle_name)))
        AND _aesthete_rule_matches(tr.predicate, b.rattrs));

  -- ── Stage 1: candidates (§10.2) ──
  DROP TABLE IF EXISTS _ae_cand;
  CREATE TEMP TABLE _ae_cand (pid uuid PRIMARY KEY, cdist real) ON COMMIT DROP;

  IF v_query IS NOT NULL THEN
    -- ANN top-200 by aesthete_vector <=> v_query (exact scan over the
    -- hard-filtered set — §12.3 accepts this at MVP scale).
    INSERT INTO _ae_cand (pid, cdist)
    SELECT b.pid, (b.pvec <=> v_query)::real
      FROM _ae_base b
     WHERE b.pvec IS NOT NULL
     ORDER BY b.pvec <=> v_query, b.pid
     LIMIT 200;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM _ae_cand) THEN
    -- Spectrum-only candidate generation — THE working path until product
    -- vectors exist (client style_vector NULL in local dev): every
    -- hard-filtered product with any spectrum row (canonical or draft),
    -- capped 200 by spectrum distance.
    INSERT INTO _ae_cand (pid, cdist)
    SELECT b.pid, COALESCE(_aesthete_spectrum_distance(v_client_s, b.pspec), 2.0)
      FROM _ae_base b
     WHERE b.pspec IS NOT NULL
     ORDER BY COALESCE(_aesthete_spectrum_distance(v_client_s, b.pspec), 2.0), b.pid
     LIMIT 200;
  END IF;

  -- ── Stage 2: scoring (§10.3) ──
  DROP TABLE IF EXISTS _ae_scored;
  CREATE TEMP TABLE _ae_scored (
    pid uuid PRIMARY KEY, pname text, pbrand text, pcolor text, pvec vector(768),
    pprice int, plead int, pstatus text, pspec jsonb, pspec_conf jsonb,
    pdna_conf jsonb, has_dna boolean,
    t_style_dense real, t_spectrum real, t_taste real, t_mc real,
    t_budget real, b_over boolean, b_soft boolean,
    t_function real, t_context real, t_patina real, t_behavioral real,
    pen real, rule_adj real, weff_p real,
    w_avail real, s_score real, row_conf real, contributions jsonb
  ) ON COMMIT DROP;

  INSERT INTO _ae_scored
  SELECT z.pid, z.pname, z.pbrand, z.pcolor, z.pvec, z.pprice, z.plead, z.pstatus,
         z.pspec, z.pspec_conf, z.pdna_conf, z.has_dna,
         z.t_style_dense, z.t_spectrum, z.t_taste, z.t_mc,
         z.t_budget, z.b_over, z.b_soft,
         z.t_function, z.t_context, z.t_patina, z.t_behavioral,
         z.pen, z.rule_adj, z.weff_p,
         z.w_avail,
         -- S = Σ w_t·T_t / Σ w_t(available)  −  w_pen·P  +  soft-rule adj
         (CASE WHEN z.w_avail > 0 THEN
            (COALESCE(z.t_style_dense * v_w_style, 0)
           + COALESCE(z.t_spectrum * v_w_spec, 0)
           + COALESCE(z.t_taste * v_w_taste * z.weff_p, 0)
           + COALESCE(z.t_mc * v_w_mc, 0)
           + COALESCE(z.t_budget * v_w_budget, 0)
           + COALESCE(z.t_function * v_w_function, 0)
           + COALESCE(z.t_context * v_w_ctx, 0)
           + COALESCE(z.t_patina * v_w_patina, 0)
           + COALESCE(z.t_behavioral * v_w_beh, 0)) / z.w_avail
          ELSE 0.5 END
          - v_w_pen * COALESCE(z.pen, 0) + z.rule_adj)::real,
         -- row confidence = Σ(available weights) × mean(attr confidences)
         (z.w_avail * COALESCE((
            SELECT avg(cx.x) FROM unnest(ARRAY[
              CASE WHEN z.t_style_dense IS NOT NULL THEN 1.0 END,
              CASE WHEN z.t_spectrum IS NOT NULL THEN
                (SELECT avg(e.value::numeric)::double precision FROM jsonb_each_text(z.pspec_conf) e) END,
              CASE WHEN z.has_dna THEN COALESCE(
                (SELECT avg(e2.value::numeric)::double precision FROM jsonb_each_text(z.pdna_conf) e2), 0.6) END,
              CASE WHEN z.t_budget IS NOT NULL THEN 1.0 END
            ]) cx(x) WHERE cx.x IS NOT NULL), 0.5))::real,
         -- per-term weighted contributions (renormalized) — the why's terms
         -- map AND the match_events audit payload (salvage §d two-layer idea)
         CASE WHEN z.w_avail > 0 THEN jsonb_strip_nulls(jsonb_build_object(
           'style_dense', CASE WHEN z.t_style_dense IS NOT NULL THEN round((z.t_style_dense * v_w_style / z.w_avail)::numeric, 4) END,
           'spectrum', CASE WHEN z.t_spectrum IS NOT NULL THEN round((z.t_spectrum * v_w_spec / z.w_avail)::numeric, 4) END,
           'taste', CASE WHEN z.t_taste IS NOT NULL THEN round((z.t_taste * v_w_taste * z.weff_p / z.w_avail)::numeric, 4) END,
           'material_color', CASE WHEN z.t_mc IS NOT NULL THEN round((z.t_mc * v_w_mc / z.w_avail)::numeric, 4) END,
           'budget', CASE WHEN z.t_budget IS NOT NULL THEN round((z.t_budget * v_w_budget / z.w_avail)::numeric, 4) END,
           'function', CASE WHEN z.t_function IS NOT NULL THEN round((z.t_function * v_w_function / z.w_avail)::numeric, 4) END,
           'context', CASE WHEN z.t_context IS NOT NULL THEN round((z.t_context * v_w_ctx / z.w_avail)::numeric, 4) END,
           'patina', CASE WHEN z.t_patina IS NOT NULL THEN round((z.t_patina * v_w_patina / z.w_avail)::numeric, 4) END,
           'behavioral', CASE WHEN z.t_behavioral IS NOT NULL THEN round((z.t_behavioral * v_w_beh / z.w_avail)::numeric, 4) END,
           'penalty', CASE WHEN COALESCE(z.pen, 0) > 0 THEN round((-v_w_pen * z.pen)::numeric, 4) END,
           'rule_adj', CASE WHEN z.rule_adj <> 0 THEN round(z.rule_adj::numeric, 4) END))
         ELSE '{}'::jsonb END
  FROM (
    SELECT y.*,
           (CASE WHEN y.t_style_dense IS NOT NULL THEN v_w_style ELSE 0 END
          + CASE WHEN y.t_spectrum IS NOT NULL THEN v_w_spec ELSE 0 END
          + CASE WHEN y.t_taste IS NOT NULL THEN v_w_taste * y.weff_p ELSE 0 END
          + CASE WHEN y.t_mc IS NOT NULL THEN v_w_mc ELSE 0 END
          + CASE WHEN y.t_budget IS NOT NULL THEN v_w_budget ELSE 0 END
          + CASE WHEN y.t_function IS NOT NULL THEN v_w_function ELSE 0 END
          + CASE WHEN y.t_context IS NOT NULL THEN v_w_ctx ELSE 0 END
          + CASE WHEN y.t_patina IS NOT NULL THEN v_w_patina ELSE 0 END
          + CASE WHEN y.t_behavioral IS NOT NULL THEN v_w_beh ELSE 0 END)::real AS w_avail
    FROM (
      SELECT b.pid, b.pname, b.pbrand, b.pcolor, b.pvec, b.pprice, b.plead, b.pstatus,
             b.pspec, b.pspec_conf, b.pdna_conf, b.has_dna,
             -- T_style_dense: affine-calibrated cosine (§10.3)
             CASE WHEN v_query IS NOT NULL AND b.pvec IS NOT NULL
                  THEN LEAST(1.0, GREATEST(0.0, ((1.0 - (b.pvec <=> v_query)) - 0.25) / 0.60))::real
             END AS t_style_dense,
             _aesthete_spectrum_term(v_client_s, v_client_c, b.pspec, b.pspec_conf) AS t_spectrum,
             -- T_taste: σ(θ_blendᵀφ); θ_blend per-product via c_D(g) (§9.2)
             CASE WHEN (v_theta_h IS NOT NULL OR v_theta_d IS NOT NULL) AND (v_w * v_rho) > 0
                  THEN _aesthete_taste_term(
                         _aesthete_theta_blend(v_theta_h, v_theta_d,
                           (v_w * v_rho * COALESCE(dsc.weight, 0.4))::real), b.pid, v_reader)
             END AS t_taste,
             _aesthete_material_color_term(v_aff, b.pmaterials, b.pcolor_temp, v_client_warmth) AS t_mc,
             bt.t AS t_budget, COALESCE(bt.over_anchor, false) AS b_over, COALESCE(bt.softened, false) AS b_soft,
             _aesthete_function_term(v_fp, b.pdurable, b.pcomfort, b.pflex, b.pfunction,
                                     (b.pspec->>'complexity')::real) AS t_function,
             _aesthete_context_term(b.pdims, v_room_w::real, v_room_l::real) AS t_context,
             CASE WHEN b.ppatina IS NOT NULL OR b.phonesty IS NOT NULL
                  THEN GREATEST(COALESCE(b.ppatina, 0) * v_patina_aff,
                                COALESCE(b.phonesty, 0) * 0.4)::real
             END AS t_patina,
             LEAST(1.0, COALESCE(pbs.smoothed_save_rate, 0.1) / 0.2)::real AS t_behavioral,
             LEAST(1.0,
               CASE WHEN b.pstatus IN ('deprecated', 'archived') THEN 0.7 ELSE 0 END
             + CASE WHEN b.plead >= 20 THEN 0.2 WHEN b.plead >= 12 THEN 0.1 ELSE 0 END)::real AS pen,
             COALESCE(radj.adj, 0)::real AS rule_adj,
             (v_w * v_rho * COALESCE(dsc.weight, 0.4))::real AS weff_p
        FROM _ae_cand c
        JOIN _ae_base b ON b.pid = c.pid
        LEFT JOIN designer_style_confidence dsc
               ON p_designer_id IS NOT NULL
              AND dsc.designer_id = p_designer_id AND dsc.style_id = b.pstyle_id
        LEFT JOIN product_behavior_stats pbs ON pbs.product_id = b.pid
        LEFT JOIN LATERAL _aesthete_budget_term(
               b.pprice, v_bmin, v_bmax, v_omega, b.pcraft,
               (b.pvalue_story IS NOT NULL OR b.pprovenance IS NOT NULL)) bt ON true
        LEFT JOIN LATERAL (
          -- COALESCE inside: GREATEST/LEAST ignore NULLs, so an empty rule
          -- set would otherwise clamp to -0.5 instead of 0.
          SELECT LEAST(0.5, GREATEST(-0.5, COALESCE(
                   sum(CASE tr.action WHEN 'boost' THEN tr.magnitude ELSE -tr.magnitude END), 0)))::real AS adj
            FROM taste_rules tr
           WHERE tr.status = 'active' AND tr.action IN ('boost', 'bury')
             AND (tr.owner_scope = 'house' OR (p_designer_id IS NOT NULL AND tr.designer_id = p_designer_id))
             AND (tr.scope = 'global'
                  OR (tr.scope = 'category' AND tr.scope_value = b.pcategory)
                  OR (tr.scope = 'style' AND (tr.scope_value = b.pstyle_id::text OR tr.scope_value = b.pstyle_name)))
             AND _aesthete_rule_matches(tr.predicate, b.rattrs)) radj ON true
    ) y
  ) z;

  SELECT count(*)::int INTO v_total FROM _ae_scored;

  -- ── deterministic exploration seed (§10.5): per (session_key, day) ──
  PERFORM setseed(GREATEST(-1.0, LEAST(1.0,
    hashtext(p_session_key::text || current_date::text)::double precision / 2147483648.0)));

  -- exploration floor (§10.5/§13): GREATEST(1, floor(ratio·limit)), capped
  -- at limit−1 (a 1-row page stays exploit) and later at pool size.
  v_n_explore := LEAST(
    GREATEST(1, floor(LEAST(GREATEST(COALESCE(p_explore_ratio, 0.2), 0.0), 0.5) * v_limit)::int),
    GREATEST(v_limit - 1, 0));
  v_exploit_needed := v_offset + (v_limit - v_n_explore);

  -- ── MMR diversification (salvage §b: λ = 0.8; caps ≤3/brand, ≤5/color) ──
  DROP TABLE IF EXISTS _ae_out;
  CREATE TEMP TABLE _ae_out (
    pid uuid PRIMARY KEY, sel_order int, page_rank int, explore boolean, why jsonb
  ) ON COMMIT DROP;

  FOR i IN 1..v_exploit_needed LOOP
    EXIT WHEN i > v_total;
    v_pick := NULL;
    SELECT s.pid INTO v_pick
      FROM _ae_scored s
     WHERE NOT EXISTS (SELECT 1 FROM _ae_out o WHERE o.pid = s.pid)
       AND (s.pbrand IS NULL OR (SELECT count(*) FROM _ae_out o2 JOIN _ae_scored s2 ON s2.pid = o2.pid
                                  WHERE s2.pbrand = s.pbrand) < 3)
       AND (s.pcolor IS NULL OR (SELECT count(*) FROM _ae_out o3 JOIN _ae_scored s3 ON s3.pid = o3.pid
                                  WHERE s3.pcolor = s.pcolor) < 5)
     ORDER BY
       0.8 * LEAST(1.0, GREATEST(0.0, s.s_score))
       + 0.2 * COALESCE((
           -- diversity vs the already-selected set: 0.6·feature + 0.4·embedding
           -- when vectors exist, feature-only otherwise (salvage §b)
           SELECT CASE
             WHEN s.pvec IS NOT NULL AND bool_or(s5.pvec IS NOT NULL) THEN
               0.6 * (1.0
                 - 0.5 * max(CASE WHEN s.pbrand IS NOT NULL AND s5.pbrand = s.pbrand THEN 1 ELSE 0 END)
                 - 0.5 * max(CASE WHEN s.pcolor IS NOT NULL AND s5.pcolor = s.pcolor THEN 1 ELSE 0 END))
               + 0.4 * LEAST(1.0, min(CASE WHEN s5.pvec IS NOT NULL THEN (s.pvec <=> s5.pvec) END))
             ELSE
               (1.0
                 - 0.5 * max(CASE WHEN s.pbrand IS NOT NULL AND s5.pbrand = s.pbrand THEN 1 ELSE 0 END)
                 - 0.5 * max(CASE WHEN s.pcolor IS NOT NULL AND s5.pcolor = s.pcolor THEN 1 ELSE 0 END))
           END
           FROM _ae_out o5 JOIN _ae_scored s5 ON s5.pid = o5.pid), 1.0) DESC,
       s.pid
     LIMIT 1;

    IF v_pick IS NULL THEN
      -- caps exhausted the pool — relax them rather than return a short page
      SELECT s.pid INTO v_pick FROM _ae_scored s
       WHERE NOT EXISTS (SELECT 1 FROM _ae_out o WHERE o.pid = s.pid)
       ORDER BY s.s_score DESC, s.pid LIMIT 1;
    END IF;
    EXIT WHEN v_pick IS NULL;

    INSERT INTO _ae_out (pid, sel_order, page_rank, explore)
    VALUES (v_pick, i, CASE WHEN i > v_offset THEN i - v_offset END, false);
  END LOOP;

  -- ── exploration slots (§10.5): Boltzmann·novelty over ranks 20–80 ──
  DROP TABLE IF EXISTS _ae_pool;
  CREATE TEMP TABLE _ae_pool (pid uuid PRIMARY KEY, s_score real, skey double precision) ON COMMIT DROP;

  INSERT INTO _ae_pool (pid, s_score)
  SELECT rk.rpid, rk.rscore
    FROM (SELECT s.pid AS rpid, s.s_score AS rscore,
                 row_number() OVER (ORDER BY s.s_score DESC, s.pid)::int AS rn
            FROM _ae_scored s) rk
   WHERE rk.rn BETWEEN 20 AND 80
     AND NOT EXISTS (SELECT 1 FROM _ae_out o WHERE o.pid = rk.rpid);

  IF NOT EXISTS (SELECT 1 FROM _ae_pool) THEN
    -- small-catalog fallback (header note): all non-selected candidates
    INSERT INTO _ae_pool (pid, s_score)
    SELECT s.pid, s.s_score FROM _ae_scored s
     WHERE NOT EXISTS (SELECT 1 FROM _ae_out o WHERE o.pid = s.pid);
  END IF;

  -- Efraimidis–Spirakis weighted sampling without replacement, iterated in a
  -- FIXED order so the seeded random() stream is reproducible within a day.
  FOR rr IN SELECT pl.pid AS ppid, pl.s_score AS pscore FROM _ae_pool pl
             ORDER BY pl.s_score DESC, pl.pid LOOP
    v_nov := 0.7;  -- §10.5 no-history default
    IF v_profile.user_id IS NOT NULL THEN
      SELECT 1.0 - max(1.0 - (sp.pvec <=> hp.aesthete_vector)) INTO v_nov_calc
        FROM _ae_scored sp,
             interactions ia JOIN products hp ON hp.id::text = ia.product_id
       WHERE sp.pid = rr.ppid AND sp.pvec IS NOT NULL
         AND ia.user_id = v_profile.user_id AND ia.event_type = 'save'
         AND hp.aesthete_vector IS NOT NULL;
      IF v_nov_calc IS NOT NULL THEN v_nov := v_nov_calc; END IF;
    END IF;
    v_es_weight := exp(LEAST(1.0, GREATEST(0.0, rr.pscore)) / 0.1) * GREATEST(v_nov, 0.05);
    UPDATE _ae_pool pl SET skey = power(random(), 1.0 / v_es_weight) WHERE pl.pid = rr.ppid;
  END LOOP;

  v_rank := (SELECT count(*)::int FROM _ae_out o WHERE o.page_rank IS NOT NULL);
  FOR rr IN SELECT pl.pid AS ppid FROM _ae_pool pl
             ORDER BY pl.skey DESC NULLS LAST, pl.pid LIMIT v_n_explore LOOP
    v_rank := v_rank + 1;
    INSERT INTO _ae_out (pid, sel_order, page_rank, explore)
    VALUES (rr.ppid, NULL, v_rank, true);
  END LOOP;

  -- ── the "why" payload (§10.6) — computed from the same scored terms ──
  DROP TABLE IF EXISTS _ae_rsn;
  CREATE TEMP TABLE _ae_rsn (term text, tval real, contrib real, concrete boolean) ON COMMIT DROP;

  FOR r IN
    SELECT o.pid AS opid, o.page_rank AS oprank, o.explore AS oexplore,
           s.pprice, s.plead, s.pstatus, s.pspec,
           s.t_style_dense, s.t_spectrum, s.t_taste, s.t_mc,
           s.t_budget, s.b_over, s.b_soft,
           s.t_function, s.t_context, s.t_patina, s.t_behavioral, s.pen,
           s.w_avail, s.s_score, s.row_conf, s.contributions
      FROM _ae_out o JOIN _ae_scored s ON s.pid = o.pid
     WHERE o.page_rank IS NOT NULL
     ORDER BY o.page_rank
  LOOP
    -- candidate reasons: per-term floors keep the copy honest (behavioral
    -- must beat its own prior; patina's ceiling is structurally low).
    -- TRUNCATE, not bare DELETE: PostgREST sessions load safeupdate, which
    -- rejects DELETE without WHERE even on temp tables.
    TRUNCATE _ae_rsn;
    INSERT INTO _ae_rsn (term, tval, contrib, concrete)
    SELECT x.term, x.tval, COALESCE((r.contributions->>x.term)::real, 0), x.concrete
      FROM (VALUES
        ('style_dense',    r.t_style_dense, false, 0.45::real),
        ('spectrum',       r.t_spectrum,    false, 0.45),
        ('taste',          r.t_taste,       false, 0.50),
        ('material_color', r.t_mc,          true,  0.45),
        ('budget',         r.t_budget,      true,  0.50),
        ('function',       r.t_function,    true,  0.50),
        ('context',        CASE WHEN p_room_id IS NOT NULL THEN r.t_context END, true, 0.55),
        ('patina',         r.t_patina,      true,  0.30),
        ('behavioral',     r.t_behavioral,  false, 0.65)
      ) x(term, tval, concrete, floor_t)
     WHERE x.tval IS NOT NULL AND x.tval >= x.floor_t;

    v_reasons := '[]'::jsonb;
    v_used := '{}'::text[];
    v_has_concrete := false;

    FOR rr IN SELECT n.term AS nterm, n.tval AS ntval, n.contrib AS ncontrib, n.concrete AS nconcrete
                FROM _ae_rsn n ORDER BY n.contrib DESC NULLS LAST, n.term LOOP
      EXIT WHEN jsonb_array_length(v_reasons) >= 3;
      v_band := CASE WHEN rr.nterm = 'budget' AND r.b_soft THEN 'value_story'
                     WHEN rr.ntval >= 0.66 THEN 'high' ELSE 'mid' END;
      SELECT wp.template INTO v_phrase FROM why_phrases wp WHERE wp.term = rr.nterm AND wp.band = v_band;
      IF v_phrase IS NULL THEN
        SELECT wp.template INTO v_phrase FROM why_phrases wp
         WHERE wp.term = 'generic' AND wp.band = CASE WHEN rr.ntval >= 0.66 THEN 'high' ELSE 'mid' END;
      END IF;
      CONTINUE WHEN v_phrase IS NULL;
      v_reason := jsonb_build_object('term', rr.nterm, 'phrase', v_phrase,
                                     'contribution', round(rr.ncontrib::numeric, 4));
      IF rr.nterm = 'budget' THEN
        v_reason := v_reason || jsonb_build_object('detail', jsonb_build_object(
          'perception', CASE WHEN r.b_over THEN 'stretch' ELSE 'fair' END,
          'price_cents', r.pprice));
      END IF;
      v_reasons := v_reasons || v_reason;
      v_used := v_used || rr.nterm;
      IF rr.nconcrete THEN v_has_concrete := true; END IF;
    END LOOP;

    -- ≥ 1 concrete reason (material/dimension/price — §10.6): swap the last
    -- pick for the best available concrete term when none made the cut.
    IF NOT v_has_concrete THEN
      SELECT n.term AS nterm, n.tval AS ntval, n.contrib AS ncontrib INTO rr
        FROM _ae_rsn n
       WHERE n.concrete AND NOT (n.term = ANY(v_used)) AND n.tval >= 0.40
       ORDER BY n.contrib DESC NULLS LAST, n.term LIMIT 1;
      IF FOUND THEN
        v_band := CASE WHEN rr.nterm = 'budget' AND r.b_soft THEN 'value_story'
                       WHEN rr.ntval >= 0.66 THEN 'high' ELSE 'mid' END;
        SELECT wp.template INTO v_phrase FROM why_phrases wp WHERE wp.term = rr.nterm AND wp.band = v_band;
        IF v_phrase IS NOT NULL THEN
          v_reason := jsonb_build_object('term', rr.nterm, 'phrase', v_phrase,
                                         'contribution', round(rr.ncontrib::numeric, 4));
          IF rr.nterm = 'budget' THEN
            v_reason := v_reason || jsonb_build_object('detail', jsonb_build_object(
              'perception', CASE WHEN r.b_over THEN 'stretch' ELSE 'fair' END,
              'price_cents', r.pprice));
          END IF;
          IF jsonb_array_length(v_reasons) >= 3 THEN
            v_reasons := (v_reasons - (jsonb_array_length(v_reasons) - 1)) || v_reason;
          ELSE
            v_reasons := v_reasons || v_reason;
          END IF;
        END IF;
      END IF;
    END IF;

    -- cautions (§10.6): budget stretch, room fit, penalty leaks
    v_cautions := '[]'::jsonb;
    IF r.b_over AND r.t_budget IS NOT NULL AND r.t_budget < 0.5 THEN
      SELECT wp.template INTO v_phrase FROM why_phrases wp WHERE wp.term = 'budget' AND wp.band = 'caution_over';
      IF v_phrase IS NOT NULL THEN
        v_cautions := v_cautions || jsonb_build_object('term', 'budget', 'phrase', v_phrase,
          'penalty', round(((r.t_budget - 0.5) * v_w_budget)::numeric, 4));
      END IF;
    END IF;
    IF p_room_id IS NOT NULL AND r.t_context IS NOT NULL AND r.t_context <= 0.45 THEN
      SELECT wp.template INTO v_phrase FROM why_phrases wp WHERE wp.term = 'context' AND wp.band = 'caution';
      IF v_phrase IS NOT NULL THEN
        v_cautions := v_cautions || jsonb_build_object('term', 'context', 'phrase', v_phrase,
          'penalty', round(((r.t_context - 0.5) * v_w_ctx)::numeric, 4));
      END IF;
    END IF;
    IF r.pstatus IN ('deprecated', 'archived') THEN
      SELECT wp.template INTO v_phrase FROM why_phrases wp WHERE wp.term = 'penalty' AND wp.band = 'discontinued';
      IF v_phrase IS NOT NULL THEN
        v_cautions := v_cautions || jsonb_build_object('term', 'penalty', 'phrase', v_phrase,
          'penalty', round((-v_w_pen * 0.7)::numeric, 4));
      END IF;
    END IF;
    IF r.plead >= 12 THEN
      SELECT wp.template INTO v_phrase FROM why_phrases wp WHERE wp.term = 'penalty' AND wp.band = 'lead_time';
      IF v_phrase IS NOT NULL THEN
        v_cautions := v_cautions || jsonb_build_object('term', 'penalty', 'phrase', v_phrase,
          'penalty', round((-v_w_pen * CASE WHEN r.plead >= 20 THEN 0.2 ELSE 0.1 END)::numeric, 4));
      END IF;
    END IF;

    -- stretch copy for exploration rows (§10.5): honest, named axis
    v_axis := NULL;
    IF r.oexplore THEN
      SELECT dx.dim INTO v_axis
        FROM (VALUES
          ('warmth', v_profile.warmth, (r.pspec->>'warmth')::real),
          ('complexity', v_profile.complexity, (r.pspec->>'complexity')::real),
          ('formality', v_profile.formality, (r.pspec->>'formality')::real),
          ('timelessness', v_profile.timelessness, (r.pspec->>'timelessness')::real),
          ('boldness', v_profile.boldness, (r.pspec->>'boldness')::real),
          ('craftsmanship', v_profile.craftsmanship, (r.pspec->>'craftsmanship')::real)
        ) dx(dim, cs, ps)
       WHERE dx.cs IS NOT NULL AND dx.ps IS NOT NULL
       ORDER BY abs(dx.cs - dx.ps) DESC, dx.dim LIMIT 1;

      SELECT wp.template INTO v_phrase FROM why_phrases wp WHERE wp.term = 'exploration' AND wp.band = 'stretch';
      IF v_phrase IS NOT NULL THEN
        v_reason := jsonb_build_object('term', 'exploration', 'phrase', v_phrase, 'contribution', 0);
        IF jsonb_array_length(v_reasons) >= 3 THEN
          v_reasons := (v_reasons - (jsonb_array_length(v_reasons) - 1)) || v_reason;
        ELSE
          v_reasons := v_reasons || v_reason;
        END IF;
      END IF;
    END IF;

    v_why := jsonb_build_object(
      'score', round((100 * LEAST(1.0, GREATEST(0.0, r.s_score)))::numeric),
      'confidence', round(r.row_conf::numeric, 2),
      'is_exploration', r.oexplore,
      'weights_version', v_weights_version,
      'blend', jsonb_build_object(
        'w', round(v_w::numeric, 4), 'w_effective', round(v_w_eff::numeric, 4),
        'designer_id', p_designer_id, 'house_version', v_house_version),
      'terms', COALESCE(r.contributions, '{}'::jsonb),
      'top_reasons', v_reasons,
      'cautions', v_cautions,
      'stretch_axis', v_axis);

    UPDATE _ae_out o SET why = v_why WHERE o.pid = r.opid;

    v_results := v_results || jsonb_build_object(
      'product_id', r.opid, 'score', round(r.s_score::numeric, 4),
      'terms', COALESCE(r.contributions, '{}'::jsonb), 'is_exploration', r.oexplore);
  END LOOP;

  -- ── log ONE match_events row per call (§5.5/§12.4) ──
  v_source := COALESCE(NULLIF(current_setting('aesthete.match_source', true), ''),
                       CASE WHEN v_caller IS NULL THEN 'quiz' ELSE 'client_portal' END);
  v_latency := round(extract(epoch FROM clock_timestamp() - v_t0) * 1000)::int;

  INSERT INTO match_events
    (session_key, user_id, designer_id, source, context,
     w, w_effective, house_version, weights_version, results, latency_ms)
  VALUES
    (p_session_key, v_profile.user_id, p_designer_id, v_source,
     jsonb_strip_nulls(jsonb_build_object(
       'category', p_category, 'room_id', p_room_id, 'layer', v_layer,
       'limit', v_limit, 'offset', v_offset,
       'explore_ratio', p_explore_ratio, 'candidates', v_total)),
     v_w, v_w_eff, v_house_version, v_weights_version, v_results, v_latency);

  RETURN QUERY
  SELECT o.pid, o.page_rank, s.s_score, s.row_conf, o.explore, o.why
    FROM _ae_out o JOIN _ae_scored s ON s.pid = o.pid
   WHERE o.page_rank IS NOT NULL
   ORDER BY o.page_rank;
END $fn$;

-- ─── 7. Nightly readers (00248) ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_taste_refit_payload(p_designer_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  WITH pairs AS (
    -- One pair row per judgment (all kinds) …
    SELECT j.id,
           'judgment:' || j.kind AS source,
           j.product_a AS pa,
           j.product_b AS pb,
           j.choice,
           CASE j.kind WHEN 'rule_pseudo' THEN 0.5 ELSE 1.0 END::real AS weight,
           j.created_at
      FROM taste_judgments j
     WHERE j.designer_id = p_designer_id
    UNION ALL
    -- … plus each correction-with-replacement as (replacement ≻ rejected).
    SELECT c.id,
           'correction',
           c.replacement_product_id,
           c.product_id,
           'a',
           2.0::real,                          -- §8.2 live-client stakes
           c.created_at
      FROM taste_corrections c
     WHERE c.designer_id = p_designer_id
       AND c.product_id IS NOT NULL
       AND c.replacement_product_id IS NOT NULL
  ),
  -- φ memoized per distinct product (a judgment history revisits products).
  phis AS (
    SELECT prods.pid, to_jsonb(_aesthete_phi(prods.pid, p_designer_id)) AS phi
      FROM (SELECT DISTINCT pa AS pid FROM pairs
            UNION
            SELECT DISTINCT pb FROM pairs) prods
  ),
  items AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'id', r.id,
             'source', r.source,
             'phi_a', fa.phi,
             'phi_b', fb.phi,
             'choice', r.choice,
             'weight', r.weight,
             'age_days', round((extract(epoch FROM (now() - r.created_at)) / 86400.0)::numeric, 4),
             'style_group', CASE
               WHEN r.choice = 'a' THEN _aesthete_primary_archetype(r.pa, p_designer_id)
               WHEN r.choice = 'b' THEN _aesthete_primary_archetype(r.pb, p_designer_id)
               ELSE NULL END,
             'created_at', r.created_at
           ) ORDER BY r.created_at, r.id), '[]'::jsonb) AS judgments,
           count(*) FILTER (WHERE r.source LIKE 'judgment:%') AS n_judgments,
           count(*) FILTER (WHERE r.source = 'correction') AS n_corrections
      FROM pairs r
      JOIN phis fa ON fa.pid = r.pa
      JOIN phis fb ON fb.pid = r.pb
  )
  SELECT jsonb_build_object(
    'designer_id', p_designer_id,
    -- SQL NULL → JSON null; the worker treats a null prior as the zero vector.
    'theta_prior', to_jsonb((SELECT h.theta FROM house_taste h WHERE h.status = 'active')),
    'house_version', (SELECT h.version FROM house_taste h WHERE h.status = 'active'),
    -- Watermark: EVERYTHING appended so far counts as processed — including
    -- rejection-only corrections the v1 refit carries no pairwise term for.
    'watermark', greatest(
      (SELECT max(created_at) FROM taste_judgments  WHERE designer_id = p_designer_id),
      (SELECT max(created_at) FROM taste_corrections WHERE designer_id = p_designer_id)),
    'n_judgments', i.n_judgments,
    'n_corrections', i.n_corrections,
    'judgments', i.judgments)
  FROM items i
$fn$;

CREATE OR REPLACE FUNCTION preview_taste_update(p_judgment_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_caller uuid := auth.uid();
  v_j taste_judgments;
  v_theta real[];
  v_theta_h real[];
  v_phi_w real[];   -- winner
  v_phi_l real[];   -- loser
  v_r real;
  v_dot double precision := 0;
  v_p_hat double precision;
  v_eta double precision;
  v_step_sq double precision := 0;
  v_step_norm double precision;
  v_scale double precision := 1.0;
  v_bounded boolean := false;
  i int;
BEGIN
  SELECT * INTO v_j FROM taste_judgments WHERE id = p_judgment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'preview_taste_update: no judgment %', p_judgment_id;
  END IF;
  -- Owner-only for JWT callers; auth.uid() IS NULL = service/postgres path
  -- (the EXECUTE grants restrict who gets here).
  IF v_caller IS NOT NULL AND v_caller <> v_j.designer_id THEN
    RAISE EXCEPTION 'preview_taste_update: judgment % belongs to another designer', p_judgment_id
      USING ERRCODE = '42501';
  END IF;

  IF v_j.choice NOT IN ('a', 'b') THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'no_pairwise_preference');
  END IF;

  v_r := CASE v_j.kind WHEN 'rule_pseudo' THEN 0.5 ELSE 1.0 END;
  v_phi_w := _aesthete_phi(CASE v_j.choice WHEN 'a' THEN v_j.product_a ELSE v_j.product_b END, v_j.designer_id);
  v_phi_l := _aesthete_phi(CASE v_j.choice WHEN 'a' THEN v_j.product_b ELSE v_j.product_a END, v_j.designer_id);

  -- Base θ: current θ_D, else θ_H, else the zero vector (cold everything).
  SELECT p.theta INTO v_theta FROM designer_taste_profiles p
   WHERE p.designer_id = v_j.designer_id;
  IF v_theta IS NULL THEN
    SELECT h.theta INTO v_theta_h FROM house_taste h WHERE h.status = 'active';
    v_theta := COALESCE(v_theta_h, array_fill(0::real, ARRAY[94]));
  END IF;
  IF array_length(v_theta, 1) IS DISTINCT FROM 94 THEN
    RAISE EXCEPTION 'preview_taste_update: stored theta is %-d, expected the 94-d basis',
      COALESCE(array_length(v_theta, 1), 0);
  END IF;

  FOR i IN 1..94 LOOP
    v_dot := v_dot + v_theta[i] * (v_phi_w[i] - v_phi_l[i]);
  END LOOP;
  v_p_hat := 1.0 / (1.0 + exp(-v_dot));
  v_eta := 0.05 * v_r * (1.0 - v_p_hat);

  FOR i IN 1..94 LOOP
    v_step_sq := v_step_sq + (v_eta * (v_phi_w[i] - v_phi_l[i]))^2;
  END LOOP;
  v_step_norm := sqrt(v_step_sq);
  IF v_step_norm > 0.25 THEN                      -- the documented bound
    v_scale := 0.25 / v_step_norm;
    v_bounded := true;
  END IF;

  FOR i IN 1..94 LOOP
    v_theta[i] := (v_theta[i] + v_scale * v_eta * (v_phi_w[i] - v_phi_l[i]))::real;
  END LOOP;

  -- Preview writes θ + the flag ONLY: no version bump, no snapshot, no
  -- watermark movement — the nightly refit recomputes from truth.
  INSERT INTO designer_taste_profiles (designer_id, theta, sources)
  VALUES (v_j.designer_id, v_theta, jsonb_build_object('theta_preview', true))
  ON CONFLICT (designer_id) DO UPDATE
    SET theta = EXCLUDED.theta,
        sources = COALESCE(designer_taste_profiles.sources, '{}'::jsonb)
                  || jsonb_build_object('theta_preview', true);

  RETURN jsonb_build_object(
    'applied', true,
    'p_hat', round(v_p_hat::numeric, 6),
    'step_norm', round((v_scale * v_step_norm)::numeric, 6),
    'bounded', v_bounded,
    'preview', true
  );
END $fn$;

CREATE OR REPLACE FUNCTION get_designer_reliability_inputs(p_designer_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT jsonb_build_object(
    'designer_id', p_designer_id,
    'n_judgments', (SELECT count(*) FROM taste_judgments WHERE designer_id = p_designer_id),
    'n_usable',    (SELECT count(*) FROM taste_judgments
                     WHERE designer_id = p_designer_id AND choice IN ('a','b')),
    'last_judgment_at', (SELECT max(created_at) FROM taste_judgments WHERE designer_id = p_designer_id),
    -- §8.3 blind-repeat probe agreement: the probe row stores the REVERSED
    -- pair, so agreement = the choice flipped (a↔b); neither/both agree with
    -- themselves.
    'probe', (
      SELECT jsonb_build_object(
        'n', count(*),
        'agreement', CASE WHEN count(*) = 0 THEN NULL
          ELSE round(avg(CASE
            WHEN (sj.choice = 'a' AND aj.choice = 'b')
              OR (sj.choice = 'b' AND aj.choice = 'a')
              OR (sj.choice IN ('neither','both') AND aj.choice = sj.choice)
            THEN 1.0 ELSE 0.0 END)::numeric, 4) END)
        FROM taste_probe_queue q
        JOIN taste_judgments sj ON sj.id = q.source_judgment_id
        JOIN taste_judgments aj ON aj.id = q.answered_judgment_id
       WHERE q.designer_id = p_designer_id AND q.status = 'answered'),
    -- §8.4 consensus_g: agreement (confirm share) of OTHER designers'
    -- validations on products this designer taught, per primary archetype.
    'consensus', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'style_id', g.style_id, 'n', g.n, 'agreement', g.agreement))
        FROM (
          SELECT _aesthete_primary_archetype(pss.product_id, p_designer_id) AS style_id,
                 count(tv.id) AS n,
                 round(avg(CASE WHEN tv.vote = 'confirm' THEN 1.0 ELSE 0.0 END)::numeric, 4) AS agreement
            FROM product_style_spectrum pss
            JOIN teaching_validations tv ON tv.product_id = pss.product_id
                                        AND tv.validator_id <> pss.assigned_by
                                        AND _teaching_visible_to(tv.validator_id, pss.assigned_by)  -- 00790
           WHERE pss.assigned_by = p_designer_id
           GROUP BY 1) g
       WHERE g.style_id IS NOT NULL), '[]'::jsonb),
    -- Judgment exposure per archetype (winner's primary archetype — the same
    -- grouping the refit payload carries).
    'style_counts', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('style_id', s.style_id, 'n', s.n))
        FROM (
          SELECT _aesthete_primary_archetype(
                   CASE j.choice WHEN 'a' THEN j.product_a ELSE j.product_b END, p_designer_id) AS style_id,
                 count(*) AS n
            FROM taste_judgments j
           WHERE j.designer_id = p_designer_id AND j.choice IN ('a','b')
           GROUP BY 1) s
       WHERE s.style_id IS NOT NULL), '[]'::jsonb)
  )
$fn$;

CREATE OR REPLACE FUNCTION refresh_designer_teaching_stats()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_n int;
BEGIN
  WITH designers AS (
    SELECT DISTINCT assigned_by AS designer_id FROM product_style_spectrum
    UNION
    SELECT DISTINCT validator_id FROM teaching_validations
  ),
  accuracy AS (
    -- Validation-consensus agreement on the designer's taught products:
    -- confirm votes by OTHERS / all votes by others. No votes → 0 (honest
    -- cold state; the CHECK constraint needs a number).
    SELECT pss.assigned_by AS designer_id,
           avg(CASE WHEN tv.vote = 'confirm' THEN 1.0 ELSE 0.0 END) AS score
      FROM product_style_spectrum pss
      JOIN teaching_validations tv ON tv.product_id = pss.product_id
                                  AND tv.validator_id <> pss.assigned_by
                                  AND _teaching_visible_to(tv.validator_id, pss.assigned_by)  -- 00790
     GROUP BY pss.assigned_by
  ),
  impact AS (
    -- match_events rows citing ≥ 1 product whose spectrum the designer taught.
    SELECT d.designer_id, count(*) AS n
      FROM designers d
      JOIN match_events me ON EXISTS (
        SELECT 1
          FROM jsonb_array_elements(me.results) r
          JOIN product_style_spectrum pss
            ON pss.product_id = (r->>'product_id')::uuid
           AND pss.assigned_by = d.designer_id)
     GROUP BY d.designer_id
  )
  INSERT INTO designer_teaching_stats (designer_id, accuracy_score, match_impact_count)
  SELECT d.designer_id,
         COALESCE(a.score, 0)::real,
         COALESCE(i.n, 0)::int
    FROM designers d
    LEFT JOIN accuracy a ON a.designer_id = d.designer_id
    LEFT JOIN impact i ON i.designer_id = d.designer_id
  ON CONFLICT (designer_id) DO UPDATE
    SET accuracy_score = EXCLUDED.accuracy_score,
        match_impact_count = EXCLUDED.match_impact_count;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $fn$;

CREATE OR REPLACE FUNCTION refresh_style_centroids()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_n int;
BEGIN
  DELETE FROM style_centroids WHERE true;  -- full refresh; WHERE satisfies safeupdate

  INSERT INTO style_centroids (style_id, centroid, n_products, computed_at)
  SELECT s.id,
         vec_normalize(sum(vec_normalize(p.aesthete_vector))),
         count(*)::int,
         now()
    FROM styles s
    JOIN product_styles ps ON ps.style_id = s.id
                          AND ps.source IN ('manual', 'validated')
                          AND _teaching_shareable(ps.assigned_by)  -- 00790
    JOIN products p ON p.id = ps.product_id
   WHERE s.is_archetype = TRUE
     AND p.layer = 'catalog'
     AND p.status = 'published'
     AND p.aesthete_vector IS NOT NULL
   GROUP BY s.id;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

-- ─── 8. House readers (00242, 00249) ────────────────────────────────────────

CREATE OR REPLACE FUNCTION compute_house_taste_draft()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_ids uuid[];
  v_ws real[];
  v_n int;
  v_sum real := 0;
  v_over real;
  v_uncapped real;
  v_i int;
  v_iter int;
  v_trim int;
  v_theta real[];
  v_vec vector;
  v_warmth real; v_complexity real; v_formality real;
  v_timelessness real; v_boldness real; v_craftsmanship real;
  v_computed_from jsonb;
  v_version int;
  v_id uuid;
BEGIN
  -- Lead gate: JWT callers must be leads; auth.uid() IS NULL means the call
  -- came in as service_role/postgres (the nightly), which the EXECUTE grants
  -- already restrict.
  IF v_caller IS NOT NULL AND NOT is_aesthete_lead(v_caller) THEN
    RAISE EXCEPTION 'compute_house_taste_draft: lead role required (see 00242 header)' USING ERRCODE = '42501';
  END IF;

  SELECT array_agg(designer_id), array_agg(reliability)
    INTO v_ids, v_ws
    FROM designer_taste_profiles
   WHERE retired_at IS NULL
     AND reliability >= 0.3
     AND COALESCE((sources->>'judgments')::int, 0) >= 50
     AND theta IS NOT NULL
     AND taste_vector IS NOT NULL
     -- 00790: a designer in any studio that keeps its teaching stays out of the house.
     AND _teaching_shareable(designer_id);

  v_n := COALESCE(array_length(v_ids, 1), 0);
  IF v_n = 0 THEN
    RAISE NOTICE 'compute_house_taste_draft: no eligible designers (unretired, reliability >= 0.3, >= 50 judgments, fitted theta) — no draft created';
    RETURN NULL;
  END IF;

  -- Normalize reliability weights.
  FOR v_i IN 1..v_n LOOP v_sum := v_sum + v_ws[v_i]; END LOOP;
  FOR v_i IN 1..v_n LOOP v_ws[v_i] := v_ws[v_i] / v_sum; END LOOP;

  -- 0.35 per-designer cap with redistribution. Arithmetically infeasible
  -- below 3 designers (weights must sum to 1) — skipped with a NOTICE; §9.1
  -- presumes a fuller roster.
  IF v_n >= 3 THEN
    FOR v_iter IN 1..10 LOOP
      v_over := 0; v_uncapped := 0;
      FOR v_i IN 1..v_n LOOP
        IF v_ws[v_i] > 0.35 THEN
          v_over := v_over + (v_ws[v_i] - 0.35);
          v_ws[v_i] := 0.35;
        ELSE
          v_uncapped := v_uncapped + v_ws[v_i];
        END IF;
      END LOOP;
      EXIT WHEN v_over <= 1e-9 OR v_uncapped <= 1e-9;
      FOR v_i IN 1..v_n LOOP
        IF v_ws[v_i] < 0.35 THEN
          v_ws[v_i] := v_ws[v_i] + v_over * (v_ws[v_i] / v_uncapped);
        END IF;
      END LOOP;
    END LOOP;
  ELSE
    RAISE NOTICE 'compute_house_taste_draft: roster of % is below 3 — the 0.35 per-designer cap is infeasible and skipped', v_n;
  END IF;

  v_trim := floor(v_n * 0.10)::int;

  -- θ_H: element-wise 10%-trimmed weighted mean.
  SELECT array_agg(elem_avg ORDER BY k) INTO v_theta
  FROM (
    SELECT z.k, sum(z.val * z.w) / NULLIF(sum(z.w), 0) AS elem_avg
      FROM (
        SELECT t.k, t.val, e.w,
               row_number() OVER (PARTITION BY t.k ORDER BY t.val) AS rn,
               count(*)     OVER (PARTITION BY t.k) AS cnt
          FROM unnest(v_ids, v_ws) AS e(designer_id, w)
          JOIN designer_taste_profiles p ON p.designer_id = e.designer_id
          CROSS JOIN LATERAL unnest(p.theta) WITH ORDINALITY AS t(val, k)
      ) z
     WHERE z.rn > v_trim AND z.rn <= z.cnt - v_trim
     GROUP BY z.k
  ) q;

  -- v_H: weight-blended dense vectors, re-normalized (vec helpers, 00239).
  SELECT vec_normalize(sum(vec_scale(p.taste_vector, e.w)))
    INTO v_vec
    FROM unnest(v_ids, v_ws) AS e(designer_id, w)
    JOIN designer_taste_profiles p ON p.designer_id = e.designer_id;

  -- s_H: weighted means over the designers that carry each coordinate.
  SELECT
    sum(p.warmth        * e.w) FILTER (WHERE p.warmth        IS NOT NULL) / NULLIF(sum(e.w) FILTER (WHERE p.warmth        IS NOT NULL), 0),
    sum(p.complexity    * e.w) FILTER (WHERE p.complexity    IS NOT NULL) / NULLIF(sum(e.w) FILTER (WHERE p.complexity    IS NOT NULL), 0),
    sum(p.formality     * e.w) FILTER (WHERE p.formality     IS NOT NULL) / NULLIF(sum(e.w) FILTER (WHERE p.formality     IS NOT NULL), 0),
    sum(p.timelessness  * e.w) FILTER (WHERE p.timelessness  IS NOT NULL) / NULLIF(sum(e.w) FILTER (WHERE p.timelessness  IS NOT NULL), 0),
    sum(p.boldness      * e.w) FILTER (WHERE p.boldness      IS NOT NULL) / NULLIF(sum(e.w) FILTER (WHERE p.boldness      IS NOT NULL), 0),
    sum(p.craftsmanship * e.w) FILTER (WHERE p.craftsmanship IS NOT NULL) / NULLIF(sum(e.w) FILTER (WHERE p.craftsmanship IS NOT NULL), 0)
    INTO v_warmth, v_complexity, v_formality, v_timelessness, v_boldness, v_craftsmanship
    FROM unnest(v_ids, v_ws) AS e(designer_id, w)
    JOIN designer_taste_profiles p ON p.designer_id = e.designer_id;

  SELECT jsonb_object_agg(e.designer_id::text, jsonb_build_object('weight', round(e.w::numeric, 4)))
    INTO v_computed_from
    FROM unnest(v_ids, v_ws) AS e(designer_id, w);

  SELECT COALESCE(max(version), 0) + 1 INTO v_version FROM house_taste;

  INSERT INTO house_taste
    (version, taste_vector, theta,
     warmth, complexity, formality, timelessness, boldness, craftsmanship,
     status, curated_by, notes, computed_from)
  VALUES
    (v_version, v_vec, v_theta,
     v_warmth, v_complexity, v_formality, v_timelessness, v_boldness, v_craftsmanship,
     'draft', v_caller,
     format('consensus draft over %s designer(s) — §9.1: reliability-weighted, 10%% trimmed, 0.35 cap', v_n),
     COALESCE(v_computed_from, '{}'::jsonb))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION seed_house_from_validated_catalog()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_vecs vector[];
  v_n int;
  v_med record;
  v_vec vector;
  v_warmth real; v_complexity real; v_formality real;
  v_timelessness real; v_boldness real; v_craftsmanship real;
  v_theta real[];
  v_version int;
  v_id uuid;
BEGIN
  IF v_caller IS NOT NULL AND NOT is_aesthete_lead(v_caller) THEN
    RAISE EXCEPTION 'seed_house_from_validated_catalog: lead role required (see 00242 header)'
      USING ERRCODE = '42501';
  END IF;

  SELECT array_agg(p.aesthete_vector) INTO v_vecs
    FROM products p
    JOIN product_style_spectrum pss ON pss.product_id = p.id
                                   AND _teaching_shareable(pss.assigned_by)  -- 00790
   WHERE p.layer = 'catalog'
     AND p.status = 'published'
     AND p.aesthete_vector IS NOT NULL;

  v_n := COALESCE(array_length(v_vecs, 1), 0);
  IF v_n = 0 THEN
    RAISE NOTICE 'seed_house_from_validated_catalog: no validated catalog products with vectors — no draft created';
    RETURN NULL;
  END IF;

  SELECT * INTO v_med FROM _aesthete_geometric_median(v_vecs);
  v_vec := vec_normalize(v_med.median);

  -- s_H: per-dimension confidence-weighted means over canonical rows
  -- (weight = the row's per-dimension confidence, default 0.5 when unset —
  -- the _aesthete_product_spectrum default).
  SELECT
    sum(pss.warmth        * COALESCE((pss.confidence->>'warmth')::real,        0.5)) FILTER (WHERE pss.warmth        IS NOT NULL)
      / NULLIF(sum(COALESCE((pss.confidence->>'warmth')::real,        0.5)) FILTER (WHERE pss.warmth        IS NOT NULL), 0),
    sum(pss.complexity    * COALESCE((pss.confidence->>'complexity')::real,    0.5)) FILTER (WHERE pss.complexity    IS NOT NULL)
      / NULLIF(sum(COALESCE((pss.confidence->>'complexity')::real,    0.5)) FILTER (WHERE pss.complexity    IS NOT NULL), 0),
    sum(pss.formality     * COALESCE((pss.confidence->>'formality')::real,     0.5)) FILTER (WHERE pss.formality     IS NOT NULL)
      / NULLIF(sum(COALESCE((pss.confidence->>'formality')::real,     0.5)) FILTER (WHERE pss.formality     IS NOT NULL), 0),
    sum(pss.timelessness  * COALESCE((pss.confidence->>'timelessness')::real,  0.5)) FILTER (WHERE pss.timelessness  IS NOT NULL)
      / NULLIF(sum(COALESCE((pss.confidence->>'timelessness')::real,  0.5)) FILTER (WHERE pss.timelessness  IS NOT NULL), 0),
    sum(pss.boldness      * COALESCE((pss.confidence->>'boldness')::real,      0.5)) FILTER (WHERE pss.boldness      IS NOT NULL)
      / NULLIF(sum(COALESCE((pss.confidence->>'boldness')::real,      0.5)) FILTER (WHERE pss.boldness      IS NOT NULL), 0),
    sum(pss.craftsmanship * COALESCE((pss.confidence->>'craftsmanship')::real, 0.5)) FILTER (WHERE pss.craftsmanship IS NOT NULL)
      / NULLIF(sum(COALESCE((pss.confidence->>'craftsmanship')::real, 0.5)) FILTER (WHERE pss.craftsmanship IS NOT NULL), 0)
    INTO v_warmth, v_complexity, v_formality, v_timelessness, v_boldness, v_craftsmanship
    FROM products p
    JOIN product_style_spectrum pss ON pss.product_id = p.id
                                   AND _teaching_shareable(pss.assigned_by)  -- 00790
   WHERE p.layer = 'catalog'
     AND p.status = 'published'
     AND p.aesthete_vector IS NOT NULL;

  -- θ_H: spectrum-aligned weights, zero deviation (§9.1 MVP reading).
  v_theta := ARRAY[
    COALESCE(v_warmth, 0), COALESCE(v_complexity, 0), COALESCE(v_formality, 0),
    COALESCE(v_timelessness, 0), COALESCE(v_boldness, 0), COALESCE(v_craftsmanship, 0)
  ]::real[] || array_fill(0::real, ARRAY[88]);

  SELECT COALESCE(max(version), 0) + 1 INTO v_version FROM house_taste;

  INSERT INTO house_taste
    (version, taste_vector, theta,
     warmth, complexity, formality, timelessness, boldness, craftsmanship,
     status, curated_by, notes, computed_from)
  VALUES
    (v_version, v_vec, v_theta,
     v_warmth, v_complexity, v_formality, v_timelessness, v_boldness, v_craftsmanship,
     'draft', v_caller,
     format('validated-catalog fallback draft over %s product(s) — §9.1 MVP / risk #12; lead hand-sets via curated_overrides, then activate_house_taste', v_n),
     jsonb_build_object('collection', 'validated-catalog', 'n_products', v_n))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
