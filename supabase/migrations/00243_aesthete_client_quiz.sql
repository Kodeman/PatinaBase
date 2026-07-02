-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 00243: Client quiz — profiles, loadings, submit/claim RPCs
--
-- Design contract: docs/prds/AE/aesthete-engine-system-design.md
--   §5.3 (client_style_profiles / quiz_option_loadings / quiz_rate_limits DDL)
--   §5.6 (RLS) · §7.1 (wire contract) · §7.2 (quiz v2 computation)
--   §4.3 (client dense-vector assembly) · §12.5 (quiz_sessions RLS fix)
--   §18 (RPC signatures)
-- (§15.4 row "00243 client_style_profiles" — replaces the G0 reservation in
-- place.)
--
-- What this ships:
--   1. §5.3 tables: client_style_profiles (ux_csp_current partial unique +
--      idx_csp_user), quiz_option_loadings, quiz_rate_limits.
--   2. quiz_option_loadings seed from the §7.2 table (all Q1–Q4 options +
--      Q5 catalyst options as zero-loading lead signals). Archetype loadings
--      resolve REAL styles rows by name (00006 taxonomy) at seed time,
--      skipping with a NOTICE when a name is missing.
--   3. _compute_quiz_profile(p_answers) — internal (not granted): the pure
--      §7.2 computation. Loadings are data; both submit_style_quiz (here)
--      and the frozen process_style_quiz shim (Wave 2A, 00246) share it.
--   4. submit_style_quiz — SECURITY DEFINER, anon+authenticated: validation,
--      in-DB rate backstop (10/IP/hour via x-forwarded-for, fail-open;
--      3 submits/hour/session_key), §4.3 dense-vector assembly,
--      quiz_sessions + client_style_profiles writes, §7.1 response.
--   5. claim_quiz_session — authenticated: binds anon rows on signup,
--      upserts client_profiles, bridges user_style_signals for iOS,
--      stamps conversion_event='signup'; idempotent; refuses foreign keys.
--   6. quiz_sessions RLS fix (§12.5): the wide-open "Allow all access"
--      policy is dropped; authenticated SELECT own rows only; anon gets NO
--      direct table access (writes are RPC-only via DEFINER); service_role
--      unaffected (bypasses RLS).
--   7. FKs deferred from 00242: taste_judgments.client_profile_id and
--      taste_corrections.client_profile_id now reference
--      client_style_profiles(id) (both tables are empty pre-launch — plain
--      ALTER, no NOT VALID dance needed).
--   8. Janitor: aesthete_quiz_janitor() + a daily pg_cron job (guarded-
--      unschedule string-body idiom) purging unclaimed anon rows > 90 days
--      and rate rows > 1 day. Pure SQL — no edge function.
--
-- Documented deviations / provisional choices (flagged to the conductor):
--   • Q5 catalyst option keys (new_home, refresh, milestone, moving,
--     just_looking) are PROVISIONAL until quiz content lands — they carry
--     zero spectrum loadings by design (§7.2: Q5 weight 0, lead tell only),
--     so renaming keys later is an UPDATE, not a math change.
--   • Loadings outside the §7.2 excerpt rows (soft_linen, aged_leather,
--     woven_rattan, starter, curated_comfort, discuss, all of Q2 but
--     family, all of Q5) are sensible provisional calibrations — the week-2
--     calibration session tunes them by UPDATE (calibration is data).
--   • §7.1 response: the documented keys ship verbatim; three ADDITIVE keys
--     ride along (spectrum_confidence — the per-dimension c_k map,
--     patina_affinity, version). Additive only; callers reading §7.1 keys
--     are unaffected.
--   • client_profiles gains a nullable user_id column (+ partial unique
--     index). §7.1 requires claim to "upsert client_profiles
--     .quiz_responses/style_preferences" but client_profiles (00001) has NO
--     user key — the upsert is impossible without one. Additive, nullable,
--     no behavior change for existing rows.
--   • Archetype weights accumulate RAW option loadings (not scaled by
--     question_weight) — §7.2 says "accumulate from option loadings"; the
--     question strength is already encoded in the loading magnitudes
--     (Q1 ~.5s vs Q3 ~.2s).
--   • archetype.confidence in the §7.1 response = primary weight / total
--     accumulated weight (a share, ∈ (0,1]); overall profile confidence =
--     mean of the six c_k. §7.1 shows example values without formulas.
--   • Dense vector (§4.3): quiz-image embeddings are NULL until content
--     ships → the assembly renormalizes onto the halves present (centroid-
--     only today). When style_centroids is empty (local dev has no product
--     vectors yet) style_vector stays NULL — that is FINE and downstream
--     must never assume NOT NULL.
--   • Janitor purge EXCLUDES anon profiles referenced by taste_judgments /
--     taste_corrections — engagement-gated learning (§7.1) must not lose
--     its referents; the FKs are plain NO ACTION so those deletes would
--     error anyway.
--   • user_style_signals bridge mapping documented at claim_quiz_session.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. client_style_profiles (§5.3) ─────────────────────────────────────────
CREATE TABLE client_style_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,   -- NULL until claimed
  session_key uuid NOT NULL,                                   -- client-held anon capability
  quiz_session_id uuid REFERENCES quiz_sessions(id),
  source text NOT NULL DEFAULT 'quiz' CHECK (source IN ('quiz','deep_dive','derived','behavioral')),
  style_vector vector(768),
  warmth real CHECK (warmth BETWEEN -1 AND 1), complexity real CHECK (complexity BETWEEN -1 AND 1),
  formality real CHECK (formality BETWEEN -1 AND 1), timelessness real CHECK (timelessness BETWEEN -1 AND 1),
  boldness real CHECK (boldness BETWEEN -1 AND 1), craftsmanship real CHECK (craftsmanship BETWEEN -1 AND 1),
  spectrum_confidence jsonb NOT NULL DEFAULT '{}',             -- per-dimension c_k
  archetype_weights jsonb NOT NULL DEFAULT '{}',               -- {style_id: weight}
  archetype_primary uuid REFERENCES styles(id),
  budget jsonb NOT NULL DEFAULT '{}',    -- {min_cents, max_cents, label, value_orientation, quality_vs_quantity}
  material_affinities jsonb DEFAULT '{}', functional_priorities jsonb DEFAULT '{}',
  patina_affinity real DEFAULT 0,
  confidence real DEFAULT 0.5,
  is_current boolean NOT NULL DEFAULT true, version int NOT NULL DEFAULT 1,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX ux_csp_current ON client_style_profiles(session_key) WHERE is_current;
CREATE INDEX idx_csp_user ON client_style_profiles(user_id) WHERE user_id IS NOT NULL;
-- Rate check + claim scan both hit (session_key, created_at) across versions.
CREATE INDEX idx_csp_session_created ON client_style_profiles(session_key, created_at);

COMMENT ON TABLE client_style_profiles IS
  'Client aesthetic profiles (design §5.3/§7): versioned per session_key, exactly one is_current (ux_csp_current). session_key is a client-held bearer capability — anon can cause rows via submit_style_quiz but never read the table (§5.6). style_vector is NULLABLE by design: it stays NULL until style_centroids/quiz-image embeddings exist (§4.3 fallback) — nothing downstream may assume NOT NULL.';
COMMENT ON COLUMN client_style_profiles.style_vector IS
  '§4.3 assembly: normalize(0.5·mean(chosen quiz-image embeddings) + 0.5·Σ archetype-weighted style_centroids), weights renormalized onto whichever halves exist. NULL when neither half is available (e.g. empty style_centroids in local dev) — a legitimate state.';

CREATE TRIGGER update_client_style_profiles_updated_at
  BEFORE UPDATE ON client_style_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ─── 2. quiz_option_loadings (§5.3/§7.2) ─────────────────────────────────────
CREATE TABLE quiz_option_loadings (            -- calibration is an UPDATE, not a migration
  question_key text NOT NULL,                  -- 'visual_resonance' | 'lifestyle' | 'material' | 'investment' | 'catalyst'
  option_key text NOT NULL,
  question_weight real NOT NULL DEFAULT 1.0,
  spectrum_deltas jsonb NOT NULL DEFAULT '{}', -- {"warmth": +0.6, "complexity": -0.5, ...}
  archetype_loadings jsonb DEFAULT '{}',       -- {style_id: weight}
  material_loadings jsonb DEFAULT '{}',
  budget jsonb, other jsonb DEFAULT '{}',      -- patina_affinity, priorities, catalyst class
  image_embedding vector(768),                 -- pre-embedded quiz imagery (NULL for non-visual options)
  PRIMARY KEY (question_key, option_key)
);

COMMENT ON TABLE quiz_option_loadings IS
  'Quiz v2 loadings-as-data (design §7.2): per-option spectrum deltas, archetype/material loadings, budget mapping, patina/priority signals, and (once quiz content ships) pre-computed image embeddings. Question weights: Q1 visual_resonance 1.0, Q3 material 0.7, Q2 lifestyle 0.3, Q4 investment 0.3, Q5 catalyst 0 (lead tell, not aesthetics). Calibration is an UPDATE, not a migration. Q5 option keys are provisional until quiz content lands (00243 header).';

-- ─── 3. quiz_rate_limits (§5.3/§7.1) ─────────────────────────────────────────
CREATE TABLE quiz_rate_limits (
  ip_hash text NOT NULL, window_start timestamptz NOT NULL, n int NOT NULL DEFAULT 1,
  PRIMARY KEY (ip_hash, window_start)
);

COMMENT ON TABLE quiz_rate_limits IS
  'In-DB abuse backstop for submit_style_quiz (design §7.1): 10 submissions per IP-hash per hour window, counted inside the DEFINER RPC from the x-forwarded-for header (fail-open when absent — Cloudflare in front of Kong is the real wall). Purged > 1 day by the aesthete-quiz-janitor cron.';

-- ─── 4. Seed: §7.2 loadings table ────────────────────────────────────────────
-- Archetype loadings reference REAL styles rows: names resolve against the
-- 00006 taxonomy at seed time; a missing name is skipped with a NOTICE (the
-- rest of the option row still lands).
DO $$
DECLARE
  r record;
  pair record;
  v_arch jsonb;
  v_style uuid;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      -- ── Q1 visual_resonance (weight 1.0) — the §7.2 excerpt rows verbatim ──
      ('visual_resonance', 'warm_minimal', 1.0::real,
       '{"warmth": 0.6, "complexity": -0.5, "formality": -0.2, "timelessness": 0.3, "boldness": -0.3, "craftsmanship": 0.3}'::jsonb,
       '[["Warm Modern", 0.5], ["Japandi", 0.3], ["Scandinavian Minimal", 0.2]]'::jsonb,
       '{}'::jsonb, NULL::jsonb, '{}'::jsonb),
      ('visual_resonance', 'cool_modern', 1.0,
       '{"warmth": -0.6, "complexity": -0.4, "formality": 0.2, "timelessness": 0, "boldness": 0.1, "craftsmanship": 0}',
       '[["Soft Contemporary", 0.4], ["Modern Industrial", 0.3]]',
       '{}', NULL, '{}'),
      ('visual_resonance', 'classic_comfort', 1.0,
       '{"warmth": 0.5, "complexity": 0.3, "formality": 0.3, "timelessness": 0.6, "boldness": -0.2, "craftsmanship": 0.2}',
       '[["Traditional", 0.4], ["Transitional", 0.4]]',
       '{}', NULL, '{}'),
      ('visual_resonance', 'eclectic_curated', 1.0,
       '{"warmth": 0.3, "complexity": 0.5, "formality": -0.2, "timelessness": 0, "boldness": 0.5, "craftsmanship": 0.4}',
       '[["Bohemian", 0.4], ["Maximalist", 0.3], ["Mid-Century Modern", 0.3]]',
       '{}', NULL, '{}'),

      -- ── Q2 lifestyle (weight 0.3, multi-select) ──
      -- family is the §7.2 excerpt row; the rest are provisional calibrations.
      ('lifestyle', 'family', 0.3,
       '{"formality": -0.2}',
       '[]',
       '{}', NULL, '{"functional_priorities": {"durability": "kids_pets"}}'),
      ('lifestyle', 'entertaining', 0.3,
       '{"formality": 0.1, "boldness": 0.2}',
       '[]',
       '{}', NULL, '{"functional_priorities": {"hosting": true}}'),
      ('lifestyle', 'sanctuary', 0.3,
       '{"warmth": 0.2, "complexity": -0.2, "formality": -0.2}',
       '[]',
       '{}', NULL, '{"functional_priorities": {"calm": true}}'),
      ('lifestyle', 'work_from_home', 0.3,
       '{"formality": 0.2, "complexity": -0.1}',
       '[]',
       '{}', NULL, '{"functional_priorities": {"workspace": true}}'),

      -- ── Q3 material (weight 0.7) ──
      -- weathered_oak + brushed_metal are §7.2 excerpt rows; patina_affinity
      -- per §7.2 prose (weathered oak +0.4, aged leather +0.5).
      ('material', 'weathered_oak', 0.7,
       '{"warmth": 0.2, "complexity": 0, "formality": 0, "timelessness": 0.2, "boldness": 0, "craftsmanship": 0.3}',
       '[]',
       '{"wood": 0.9}', NULL, '{"patina_affinity": 0.4}'),
      ('material', 'brushed_metal', 0.7,
       '{"warmth": -0.3, "complexity": -0.2, "formality": 0, "timelessness": 0, "boldness": 0.1, "craftsmanship": 0}',
       '[["Modern Industrial", 0.2]]',
       '{"metal": 0.9}', NULL, '{}'),
      ('material', 'soft_linen', 0.7,
       '{"warmth": 0.2, "complexity": -0.2, "formality": -0.2, "boldness": -0.2}',
       '[["Coastal", 0.2]]',
       '{"fabric": 0.9}', NULL, '{}'),
      ('material', 'aged_leather', 0.7,
       '{"warmth": 0.3, "timelessness": 0.3, "boldness": 0.1, "craftsmanship": 0.3}',
       '[]',
       '{"leather": 0.9}', NULL, '{"patina_affinity": 0.5}'),
      ('material', 'woven_rattan', 0.7,
       '{"warmth": 0.3, "complexity": 0.1, "formality": -0.3, "craftsmanship": 0.2}',
       '[["Coastal", 0.3], ["Bohemian", 0.2]]',
       '{"rattan": 0.9}', NULL, '{"patina_affinity": 0.2}'),

      -- ── Q4 investment (weight 0.3) ──
      -- heirloom is the §7.2 excerpt row (budget 5k–15k, ω +0.7); starter
      -- −0.6 and discuss (null range, ω +0.2, lead signal) per §7.2 prose.
      ('investment', 'heirloom', 0.3,
       '{"timelessness": 0.3, "craftsmanship": 0.4}',
       '[]',
       '{}',
       '{"min_cents": 500000, "max_cents": 1500000, "label": "Heirloom", "value_orientation": 0.7}',
       '{}'),
      ('investment', 'starter', 0.3,
       '{"craftsmanship": -0.1}',
       '[]',
       '{}',
       '{"min_cents": 50000, "max_cents": 200000, "label": "Starter", "value_orientation": -0.6}',
       '{}'),
      ('investment', 'curated_comfort', 0.3,
       '{"timelessness": 0.1, "craftsmanship": 0.1}',
       '[]',
       '{}',
       '{"min_cents": 200000, "max_cents": 500000, "label": "Curated Comfort", "value_orientation": 0.1}',
       '{}'),
      ('investment', 'discuss', 0.3,
       '{}',
       '[]',
       '{}',
       '{"min_cents": null, "max_cents": null, "label": "To be discussed", "value_orientation": 0.2, "lead_signal": true}',
       '{}'),

      -- ── Q5 catalyst (weight 0) — zero-loading lead signals ──
      -- Keys PROVISIONAL until quiz content lands (00243 header). lead_signal
      -- tiers are the funnel read, never aesthetics (§7.2).
      ('catalyst', 'new_home', 0.0,     '{}', '[]', '{}', NULL, '{"lead_signal": "high"}'),
      ('catalyst', 'moving', 0.0,       '{}', '[]', '{}', NULL, '{"lead_signal": "high"}'),
      ('catalyst', 'milestone', 0.0,    '{}', '[]', '{}', NULL, '{"lead_signal": "medium"}'),
      ('catalyst', 'refresh', 0.0,      '{}', '[]', '{}', NULL, '{"lead_signal": "medium"}'),
      ('catalyst', 'just_looking', 0.0, '{}', '[]', '{}', NULL, '{"lead_signal": "low"}')
    ) t(question_key, option_key, question_weight, deltas, archetypes, materials, budget, other)
  LOOP
    v_arch := '{}'::jsonb;
    FOR pair IN
      SELECT value->>0 AS style_name, (value->>1)::real AS w
        FROM jsonb_array_elements(r.archetypes)
    LOOP
      SELECT id INTO v_style FROM styles WHERE name = pair.style_name;
      IF v_style IS NULL THEN
        RAISE NOTICE '00243 seed: style "%" not found in the 00006 taxonomy — skipping its loading on %/%',
          pair.style_name, r.question_key, r.option_key;
      ELSE
        v_arch := v_arch || jsonb_build_object(v_style::text, pair.w);
      END IF;
    END LOOP;

    INSERT INTO quiz_option_loadings
      (question_key, option_key, question_weight, spectrum_deltas,
       archetype_loadings, material_loadings, budget, other)
    VALUES
      (r.question_key, r.option_key, r.question_weight, r.deltas,
       v_arch, r.materials, r.budget, r.other)
    ON CONFLICT (question_key, option_key) DO UPDATE SET
      question_weight    = EXCLUDED.question_weight,
      spectrum_deltas    = EXCLUDED.spectrum_deltas,
      archetype_loadings = EXCLUDED.archetype_loadings,
      material_loadings  = EXCLUDED.material_loadings,
      budget             = EXCLUDED.budget,
      other              = EXCLUDED.other;
  END LOOP;
END $$;

-- ─── 5. client_profiles.user_id (claim-upsert key — header deviation) ────────
ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_client_profiles_user ON client_profiles(user_id) WHERE user_id IS NOT NULL;

COMMENT ON COLUMN client_profiles.user_id IS
  'Added by 00243: claim_quiz_session (§7.1) upserts quiz_responses/style_preferences per user and client_profiles previously had no user key. Nullable — legacy rows keep NULL.';

-- ─── 6. _compute_quiz_profile — the pure §7.2 computation (internal) ─────────
-- Not granted to any client role: submit_style_quiz (below) and the frozen
-- process_style_quiz shim (00246, Wave 2A) call it internally.
--
-- Strictness posture: Q1/Q3/Q4 option keys must exist in the loadings table
-- (they drive the profile — a typo must fail loudly). Q5 catalyst and Q2
-- lifestyle entries missing from the table are tolerated with a NOTICE:
-- catalyst carries zero aesthetic loading by design, and lifestyle is
-- multi-select content that may evolve ahead of calibration.
CREATE OR REPLACE FUNCTION _compute_quiz_profile(p_answers jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dims text[] := ARRAY['warmth','complexity','formality','timelessness','boldness','craftsmanship'];
  v_dim text;
  v_s jsonb := '{}'::jsonb;       -- Σ question_weight · δ_k
  v_c jsonb := '{}'::jsonb;       -- Σ |δ_k| · question_weight (pre-cap)
  v_arch jsonb := '{}'::jsonb;    -- {style_id: accumulated weight}
  v_mats jsonb := '{}'::jsonb;    -- {material: affinity}
  v_fp jsonb := '{}'::jsonb;      -- merged functional priorities
  v_budget jsonb := '{}'::jsonb;
  v_patina real := 0;
  v_visual text; v_material text; v_investment text; v_catalyst text;
  v_lifestyle text[];
  v_entry text;
  v_row record;
  v_kv record;
  v_delta real;
  v_primary_id text; v_secondary_id text;
  v_primary_w real := 0; v_secondary_w real := 0; v_total_w real := 0;
  v_primary_name text; v_secondary_name text;
  v_conf_sum real := 0;
BEGIN
  -- Validate the five §7.1 answer keys.
  IF p_answers IS NULL OR jsonb_typeof(p_answers) <> 'object' THEN
    RAISE EXCEPTION '_compute_quiz_profile: p_answers must be a jsonb object';
  END IF;
  IF NOT (p_answers ? 'visual_resonance' AND p_answers ? 'lifestyle'
          AND p_answers ? 'material' AND p_answers ? 'investment'
          AND p_answers ? 'catalyst') THEN
    RAISE EXCEPTION '_compute_quiz_profile: answers must carry visual_resonance, lifestyle, material, investment, catalyst (§7.1)';
  END IF;
  IF jsonb_typeof(p_answers->'lifestyle') <> 'array' THEN
    RAISE EXCEPTION '_compute_quiz_profile: lifestyle must be an array of option keys';
  END IF;

  v_visual := p_answers->>'visual_resonance';
  v_material := p_answers->>'material';
  v_investment := p_answers->>'investment';
  v_catalyst := p_answers->>'catalyst';
  v_lifestyle := ARRAY(SELECT jsonb_array_elements_text(p_answers->'lifestyle'));

  -- Q1/Q3/Q4 are strict; Q5/Q2 entries are lenient (NOTICE + zero contribution).
  IF NOT EXISTS (SELECT 1 FROM quiz_option_loadings WHERE question_key = 'visual_resonance' AND option_key = v_visual) THEN
    RAISE EXCEPTION '_compute_quiz_profile: unknown visual_resonance option "%"', v_visual;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM quiz_option_loadings WHERE question_key = 'material' AND option_key = v_material) THEN
    RAISE EXCEPTION '_compute_quiz_profile: unknown material option "%"', v_material;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM quiz_option_loadings WHERE question_key = 'investment' AND option_key = v_investment) THEN
    RAISE EXCEPTION '_compute_quiz_profile: unknown investment option "%"', v_investment;
  END IF;
  IF v_catalyst IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM quiz_option_loadings WHERE question_key = 'catalyst' AND option_key = v_catalyst) THEN
    RAISE NOTICE '_compute_quiz_profile: catalyst option "%" has no loadings row (provisional Q5 vocab) — passed through with zero loading', v_catalyst;
  END IF;
  FOREACH v_entry IN ARRAY v_lifestyle LOOP
    IF NOT EXISTS (SELECT 1 FROM quiz_option_loadings WHERE question_key = 'lifestyle' AND option_key = v_entry) THEN
      RAISE NOTICE '_compute_quiz_profile: lifestyle option "%" has no loadings row — skipped', v_entry;
    END IF;
  END LOOP;

  -- Zero-init spectrum + confidence accumulators.
  FOREACH v_dim IN ARRAY v_dims LOOP
    v_s := v_s || jsonb_build_object(v_dim, 0);
    v_c := v_c || jsonb_build_object(v_dim, 0);
  END LOOP;

  -- Accumulate over chosen loadings.
  FOR v_row IN
    SELECT l.*
      FROM (
        SELECT 'visual_resonance' AS qk, v_visual AS ok
        UNION ALL SELECT 'material', v_material
        UNION ALL SELECT 'investment', v_investment
        UNION ALL SELECT 'catalyst', v_catalyst
        UNION ALL SELECT 'lifestyle', u FROM unnest(v_lifestyle) u
      ) c
      JOIN quiz_option_loadings l ON l.question_key = c.qk AND l.option_key = c.ok
  LOOP
    -- Spectrums: s_k += q_w · δ_k and confidence c_k += |δ_k| · q_w (§7.2).
    FOREACH v_dim IN ARRAY v_dims LOOP
      v_delta := COALESCE((v_row.spectrum_deltas->>v_dim)::real, 0);
      IF v_delta <> 0 THEN
        v_s := jsonb_set(v_s, ARRAY[v_dim],
          to_jsonb(round((((v_s->>v_dim)::real + v_row.question_weight * v_delta))::numeric, 4)));
        v_c := jsonb_set(v_c, ARRAY[v_dim],
          to_jsonb(round((((v_c->>v_dim)::real + abs(v_delta) * v_row.question_weight))::numeric, 4)));
      END IF;
    END LOOP;

    -- Archetypes: raw accumulation from option loadings (header note).
    FOR v_kv IN SELECT key, value FROM jsonb_each_text(COALESCE(v_row.archetype_loadings, '{}'::jsonb)) LOOP
      v_arch := v_arch || jsonb_build_object(
        v_kv.key, round((COALESCE((v_arch->>v_kv.key)::real, 0) + v_kv.value::real)::numeric, 4));
    END LOOP;

    -- Material affinities (capped at 1).
    FOR v_kv IN SELECT key, value FROM jsonb_each_text(COALESCE(v_row.material_loadings, '{}'::jsonb)) LOOP
      v_mats := v_mats || jsonb_build_object(
        v_kv.key, round(LEAST(1.0, COALESCE((v_mats->>v_kv.key)::real, 0) + v_kv.value::real)::numeric, 4));
    END LOOP;

    -- Patina affinity (direct, unweighted per §7.2 prose) + priorities + budget.
    v_patina := v_patina + COALESCE((v_row.other->>'patina_affinity')::real, 0);
    IF v_row.other ? 'functional_priorities' THEN
      v_fp := v_fp || (v_row.other->'functional_priorities');
    END IF;
    IF v_row.budget IS NOT NULL THEN
      v_budget := v_row.budget;
    END IF;
  END LOOP;

  -- Clip spectrums to [−1,1]; cap confidences at 1; sum for the overall mean.
  FOREACH v_dim IN ARRAY v_dims LOOP
    v_s := jsonb_set(v_s, ARRAY[v_dim],
      to_jsonb(round(GREATEST(-1.0, LEAST(1.0, (v_s->>v_dim)::real))::numeric, 4)));
    v_c := jsonb_set(v_c, ARRAY[v_dim],
      to_jsonb(round(LEAST(1.0, (v_c->>v_dim)::real)::numeric, 4)));
    v_conf_sum := v_conf_sum + (v_c->>v_dim)::real;
  END LOOP;

  v_patina := GREATEST(0.0, LEAST(1.0, v_patina));

  -- Primary / secondary archetype = top two accumulated weights.
  FOR v_kv IN SELECT key, value FROM jsonb_each_text(v_arch) ORDER BY value::real DESC, key LOOP
    v_total_w := v_total_w + v_kv.value::real;
    IF v_primary_id IS NULL THEN
      v_primary_id := v_kv.key; v_primary_w := v_kv.value::real;
    ELSIF v_secondary_id IS NULL THEN
      v_secondary_id := v_kv.key; v_secondary_w := v_kv.value::real;
    END IF;
  END LOOP;
  IF v_primary_id IS NOT NULL THEN
    SELECT name INTO v_primary_name FROM styles WHERE id = v_primary_id::uuid;
  END IF;
  IF v_secondary_id IS NOT NULL THEN
    SELECT name INTO v_secondary_name FROM styles WHERE id = v_secondary_id::uuid;
  END IF;

  RETURN jsonb_build_object(
    'spectrums', v_s,
    'spectrum_confidence', v_c,
    'archetype_weights', v_arch,
    'archetype', jsonb_build_object(
      'primary', v_primary_name,
      'primary_id', v_primary_id,
      'secondary', v_secondary_name,
      'secondary_id', v_secondary_id,
      'confidence', CASE WHEN v_total_w > 0 THEN round((v_primary_w / v_total_w)::numeric, 4) ELSE NULL END
    ),
    'budget', v_budget,
    'material_affinities', v_mats,
    'functional_priorities', v_fp,
    'patina_affinity', round(v_patina::numeric, 4),
    'catalyst', v_catalyst,
    'confidence', round((v_conf_sum / 6.0)::numeric, 4)
  );
END;
$$;

COMMENT ON FUNCTION _compute_quiz_profile(jsonb) IS
  'Pure quiz v2 computation (design §7.2): spectrums = clip(Σ q_w·δ, −1, 1); per-dimension confidence c_k = min(1, Σ|δ_k|·q_w); archetype weights accumulated raw from option loadings (primary=argmax, secondary=runner-up, confidence=primary share); Q4 budget passthrough; material affinities; patina affinity; Q2 functional priorities; Q5 catalyst passthrough. Loadings are data (quiz_option_loadings). INTERNAL — no client grants; called by submit_style_quiz (00243) and the frozen process_style_quiz shim (00246).';

-- ─── 7. submit_style_quiz — the §7.1 wire contract ───────────────────────────
CREATE OR REPLACE FUNCTION submit_style_quiz(
  p_session_key uuid,
  p_answers jsonb,
  p_timings jsonb DEFAULT '{}',
  p_source text DEFAULT 'web',
  p_attribution jsonb DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_user uuid;
  v_prev_user uuid;
  v_headers text;
  v_ip text;
  v_n int;
  v_recent int;
  v_profile jsonb;
  v_img vector;
  v_arch_vec vector;
  v_vec vector;
  v_quiz_id uuid;
  v_version int;
  v_profile_id uuid;
BEGIN
  -- ── validation ──
  IF p_session_key IS NULL THEN
    RAISE EXCEPTION 'submit_style_quiz: p_session_key is required (client-generated uuidv4, §7.1)';
  END IF;
  IF p_answers IS NULL OR jsonb_typeof(p_answers) <> 'object' THEN
    RAISE EXCEPTION 'submit_style_quiz: p_answers must be a jsonb object';
  END IF;
  IF pg_column_size(p_answers) >= 8192 THEN
    RAISE EXCEPTION 'submit_style_quiz: p_answers exceeds the 8 KB limit';
  END IF;
  IF NOT (p_answers ? 'visual_resonance' AND p_answers ? 'lifestyle'
          AND p_answers ? 'material' AND p_answers ? 'investment'
          AND p_answers ? 'catalyst') THEN
    RAISE EXCEPTION 'submit_style_quiz: answers must carry visual_resonance, lifestyle, material, investment, catalyst (§7.1)';
  END IF;

  -- ── in-DB rate backstop (§7.1: Cloudflare is the real wall) ──
  -- Per session key: max 3 submissions per hour (the 4th trips).
  SELECT count(*) INTO v_recent
    FROM client_style_profiles
   WHERE session_key = p_session_key
     AND created_at > now() - interval '1 hour';
  IF v_recent >= 3 THEN
    RAISE EXCEPTION 'submit_style_quiz: this session has submitted % times in the last hour — try again later', v_recent;
  END IF;

  -- Per IP: 10/hour keyed on the first x-forwarded-for hop. Fail-open when
  -- the header is absent or malformed (direct psql, local dev).
  BEGIN
    v_headers := NULLIF(current_setting('request.headers', true), '');
    IF v_headers IS NOT NULL THEN
      v_ip := trim(split_part(COALESCE(v_headers::jsonb->>'x-forwarded-for', ''), ',', 1));
      IF v_ip <> '' THEN
        INSERT INTO quiz_rate_limits (ip_hash, window_start, n)
        VALUES (md5(v_ip), date_trunc('hour', now()), 1)
        ON CONFLICT (ip_hash, window_start) DO UPDATE SET n = quiz_rate_limits.n + 1
        RETURNING n INTO v_n;
        IF v_n > 10 THEN
          RAISE EXCEPTION 'submit_style_quiz: too many submissions from this address — try again in an hour';
        END IF;
      END IF;
    END IF;
  EXCEPTION
    WHEN raise_exception THEN RAISE;   -- the limit itself
    WHEN OTHERS THEN
      RAISE NOTICE 'submit_style_quiz: rate-limit header parse failed (%) — failing open', SQLERRM;
  END;

  -- ── bearer-capability guard on resubmission ──
  -- A key claimed by user B refuses submissions from a DIFFERENT authed user;
  -- an anon resubmit on a claimed key keeps the claimed owner (the key is the
  -- capability, §7.1).
  SELECT user_id INTO v_prev_user
    FROM client_style_profiles
   WHERE session_key = p_session_key AND is_current
   LIMIT 1;
  IF v_prev_user IS NOT NULL AND v_caller IS NOT NULL AND v_caller <> v_prev_user THEN
    RAISE EXCEPTION 'submit_style_quiz: this session_key belongs to another account' USING ERRCODE = '42501';
  END IF;
  v_user := COALESCE(v_caller, v_prev_user);

  -- ── §7.2 computation ──
  v_profile := _compute_quiz_profile(p_answers);

  -- ── §4.3 dense-vector assembly (pure SQL, zero inference) ──
  -- Image half: mean of chosen options' pre-computed quiz-image embeddings
  -- (all NULL until quiz content ships).
  SELECT vec_normalize(sum(vec_normalize(l.image_embedding)))
    INTO v_img
    FROM (
      SELECT 'visual_resonance' AS qk, p_answers->>'visual_resonance' AS ok
      UNION ALL SELECT 'material', p_answers->>'material'
      UNION ALL SELECT 'lifestyle', u FROM jsonb_array_elements_text(p_answers->'lifestyle') u
    ) c
    JOIN quiz_option_loadings l
      ON l.question_key = c.qk AND l.option_key = c.ok AND l.image_embedding IS NOT NULL;

  -- Archetype half: Σ a_j · centroid_j over the archetypes that HAVE
  -- centroids (weights effectively renormalize under vec_normalize).
  SELECT vec_normalize(sum(vec_scale(sc.centroid, w.value::real)))
    INTO v_arch_vec
    FROM jsonb_each_text(COALESCE(v_profile->'archetype_weights', '{}'::jsonb)) w
    JOIN style_centroids sc ON sc.style_id = w.key::uuid;

  -- Blend 0.5/0.5; renormalize onto whichever halves exist; NULL when
  -- neither does (empty style_centroids in local dev) — a legitimate state.
  IF v_img IS NOT NULL AND v_arch_vec IS NOT NULL THEN
    v_vec := vec_normalize(vec_scale(v_img, 0.5) + vec_scale(v_arch_vec, 0.5));
  ELSIF v_img IS NOT NULL THEN
    v_vec := v_img;
  ELSE
    v_vec := v_arch_vec;  -- centroid-only fallback (§4.3), or NULL
  END IF;

  -- ── persist: quiz session + versioned profile ──
  INSERT INTO quiz_sessions (user_id, responses, computed_profile, completed_at)
  VALUES (
    v_user,
    jsonb_build_object('answers', p_answers, 'timings', COALESCE(p_timings, '{}'::jsonb),
                       'source', p_source, 'attribution', COALESCE(p_attribution, '{}'::jsonb)),
    v_profile,
    now())
  RETURNING id INTO v_quiz_id;

  UPDATE client_style_profiles
     SET is_current = false
   WHERE session_key = p_session_key AND is_current;

  SELECT COALESCE(max(version), 0) + 1 INTO v_version
    FROM client_style_profiles
   WHERE session_key = p_session_key;

  INSERT INTO client_style_profiles
    (user_id, session_key, quiz_session_id, source, style_vector,
     warmth, complexity, formality, timelessness, boldness, craftsmanship,
     spectrum_confidence, archetype_weights, archetype_primary,
     budget, material_affinities, functional_priorities,
     patina_affinity, confidence, is_current, version)
  VALUES
    (v_user, p_session_key, v_quiz_id, 'quiz', v_vec,
     (v_profile->'spectrums'->>'warmth')::real,
     (v_profile->'spectrums'->>'complexity')::real,
     (v_profile->'spectrums'->>'formality')::real,
     (v_profile->'spectrums'->>'timelessness')::real,
     (v_profile->'spectrums'->>'boldness')::real,
     (v_profile->'spectrums'->>'craftsmanship')::real,
     v_profile->'spectrum_confidence',
     v_profile->'archetype_weights',
     (v_profile->'archetype'->>'primary_id')::uuid,
     COALESCE(v_profile->'budget', '{}'::jsonb),
     COALESCE(v_profile->'material_affinities', '{}'::jsonb),
     COALESCE(v_profile->'functional_priorities', '{}'::jsonb),
     (v_profile->>'patina_affinity')::real,
     (v_profile->>'confidence')::real,
     true, v_version)
  RETURNING id INTO v_profile_id;

  -- ── §7.1 response (documented keys verbatim + additive keys, header note) ──
  RETURN jsonb_build_object(
    'profile_id', v_profile_id,
    'session_key', p_session_key,
    'archetype', jsonb_build_object(
      'primary', v_profile->'archetype'->>'primary',
      'secondary', v_profile->'archetype'->>'secondary',
      'confidence', (v_profile->'archetype'->'confidence')),
    'spectrums', v_profile->'spectrums',
    'budget', v_profile->'budget',
    'material_affinities', v_profile->'material_affinities',
    'catalyst', v_profile->>'catalyst',
    -- additive (not in the §7.1 example; documented in the 00243 header):
    'spectrum_confidence', v_profile->'spectrum_confidence',
    'patina_affinity', (v_profile->'patina_affinity'),
    'version', v_version
  );
END;
$$;

COMMENT ON FUNCTION submit_style_quiz(uuid, jsonb, jsonb, text, jsonb) IS
  'The quiz wire contract (design §7.1/§18): validates the five answer keys + 8 KB cap; in-DB rate backstop (10/IP-hash/hour from x-forwarded-for, fail-open; 3/hour/session_key); computes the §7.2 profile via _compute_quiz_profile; assembles the §4.3 dense vector from quiz-image embeddings + style_centroids (renormalized onto available halves, NULL when none); writes quiz_sessions + a versioned client_style_profiles row (previous is_current flipped); returns the §7.1 response. Anon-callable: the session_key is a bearer capability — anon causes rows, never reads tables.';

-- ─── 8. claim_quiz_session — merge on signup (§7.1) ──────────────────────────
-- user_style_signals bridge mapping (iOS legacy, 0..1 scale — documented per
-- the wave brief; never extends the legacy table):
--   warmth_preference        = (warmth + 1) / 2                     (§5.3 scale map)
--   texture_preference       = affinity-weighted material texture prior
--                              (wood .7, leather .8, rattan .6, fabric .4,
--                               metal .3, else .5 — the 00067 write bands),
--                              0.5 when no affinities
--   openness_preference      = clamp01((1 − complexity)/2
--                               + 0.1·[hosting] + 0.1·[durability=kids_pets])
--                              (complexity inverted; lifestyle bumps mirror 00067)
--   natural_light_preference = clamp01(0.5 + 0.2·aff(fabric) + 0.1·aff(rattan))
--                              (linen/rattan light-forward, mirroring 00067)
--   color_temperature        = warm ≥ +0.2 / cool ≤ −0.2 / neutral  (00067 bands)
--   formality_level          = structured ≥ +0.2 / relaxed ≤ −0.2 / balanced (00067 vocab)
--   space_density            = layered ≥ +0.2 / minimal ≤ −0.2 / balanced
--                              (complexity-driven; 00019 vocab)
CREATE OR REPLACE FUNCTION claim_quiz_session(p_session_key uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_owner uuid;
  v_profile client_style_profiles;
  v_answers jsonb;
  v_style_prefs uuid[];
  v_archetype_name text;
  v_budget_range jsonb;
  v_claimed_profiles int := 0;
  v_claimed_sessions int := 0;
  v_bridged boolean := false;
  v_warmth real; v_complexity real; v_formality real;
  v_texture real; v_openness real; v_light real;
  v_aff_fabric real; v_aff_rattan real;
  v_fp jsonb;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'claim_quiz_session: authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_session_key IS NULL THEN
    RAISE EXCEPTION 'claim_quiz_session: p_session_key is required';
  END IF;

  SELECT * INTO v_profile
    FROM client_style_profiles
   WHERE session_key = p_session_key AND is_current
   LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'claim_quiz_session: unknown session_key';
  END IF;

  -- Refuse keys claimed by another user (any version).
  SELECT user_id INTO v_owner
    FROM client_style_profiles
   WHERE session_key = p_session_key
     AND user_id IS NOT NULL AND user_id <> v_user
   LIMIT 1;
  IF v_owner IS NOT NULL THEN
    RAISE EXCEPTION 'claim_quiz_session: this session_key is already claimed by another account' USING ERRCODE = '42501';
  END IF;

  -- Bind user_id where NULL (idempotent: a re-claim matches 0 rows).
  UPDATE client_style_profiles
     SET user_id = v_user
   WHERE session_key = p_session_key AND user_id IS NULL;
  GET DIAGNOSTICS v_claimed_profiles = ROW_COUNT;

  UPDATE quiz_sessions q
     SET user_id = v_user
   WHERE q.user_id IS NULL
     AND q.id IN (SELECT quiz_session_id FROM client_style_profiles
                   WHERE session_key = p_session_key AND quiz_session_id IS NOT NULL);
  GET DIAGNOSTICS v_claimed_sessions = ROW_COUNT;

  -- Stamp the conversion (§7.1); only where unset — idempotent.
  UPDATE quiz_sessions q
     SET conversion_event = 'signup'
   WHERE q.conversion_event IS NULL
     AND q.id IN (SELECT quiz_session_id FROM client_style_profiles
                   WHERE session_key = p_session_key AND quiz_session_id IS NOT NULL);

  -- Re-read post-bind so the bridge below sees the claimed row.
  SELECT * INTO v_profile
    FROM client_style_profiles
   WHERE session_key = p_session_key AND is_current
   LIMIT 1;

  -- ── client_profiles upsert (quiz_responses + style_preferences, §7.1) ──
  SELECT responses->'answers' INTO v_answers
    FROM quiz_sessions WHERE id = v_profile.quiz_session_id;

  SELECT array_agg(style_id) INTO v_style_prefs
    FROM (SELECT key::uuid AS style_id
            FROM jsonb_each_text(COALESCE(v_profile.archetype_weights, '{}'::jsonb))
           ORDER BY value::real DESC) ranked;

  IF v_profile.archetype_primary IS NOT NULL THEN
    SELECT name INTO v_archetype_name FROM styles WHERE id = v_profile.archetype_primary;
  END IF;

  -- client_profiles.budget_range documents itself as {min,max,currency} —
  -- dollars, per the 00067 precedent.
  v_budget_range := jsonb_build_object(
    'min', CASE WHEN v_profile.budget->>'min_cents' IS NOT NULL
                THEN ((v_profile.budget->>'min_cents')::bigint / 100) END,
    'max', CASE WHEN v_profile.budget->>'max_cents' IS NOT NULL
                THEN ((v_profile.budget->>'max_cents')::bigint / 100) END,
    'currency', 'USD',
    'label', v_profile.budget->>'label');

  INSERT INTO client_profiles (user_id, archetype, budget_range, style_preferences, quiz_responses)
  VALUES (v_user, v_archetype_name, v_budget_range, COALESCE(v_style_prefs, '{}'::uuid[]), v_answers)
  ON CONFLICT (user_id) WHERE user_id IS NOT NULL DO UPDATE SET
    archetype         = EXCLUDED.archetype,
    budget_range      = EXCLUDED.budget_range,
    style_preferences = EXCLUDED.style_preferences,
    quiz_responses    = EXCLUDED.quiz_responses,
    updated_at        = now();

  -- ── user_style_signals bridge for iOS (mapping documented above) ──
  IF EXISTS (SELECT 1 FROM profiles WHERE id = v_user) THEN
    v_warmth := COALESCE(v_profile.warmth, 0);
    v_complexity := COALESCE(v_profile.complexity, 0);
    v_formality := COALESCE(v_profile.formality, 0);
    v_fp := COALESCE(v_profile.functional_priorities, '{}'::jsonb);
    v_aff_fabric := COALESCE((v_profile.material_affinities->>'fabric')::real, 0);
    v_aff_rattan := COALESCE((v_profile.material_affinities->>'rattan')::real, 0);

    SELECT COALESCE(sum(aff * t) / NULLIF(sum(aff), 0), 0.5) INTO v_texture
      FROM (SELECT value::real AS aff,
                   CASE key WHEN 'wood' THEN 0.7 WHEN 'leather' THEN 0.8
                            WHEN 'rattan' THEN 0.6 WHEN 'fabric' THEN 0.4
                            WHEN 'metal' THEN 0.3 ELSE 0.5 END AS t
              FROM jsonb_each_text(COALESCE(v_profile.material_affinities, '{}'::jsonb))) m;

    v_openness := GREATEST(0.0, LEAST(1.0,
      (1 - v_complexity) / 2
      + CASE WHEN v_fp ? 'hosting' THEN 0.1 ELSE 0 END
      + CASE WHEN v_fp->>'durability' = 'kids_pets' THEN 0.1 ELSE 0 END));
    v_light := GREATEST(0.0, LEAST(1.0, 0.5 + 0.2 * v_aff_fabric + 0.1 * v_aff_rattan));

    INSERT INTO user_style_signals
      (user_id, warmth_preference, openness_preference, texture_preference,
       natural_light_preference, color_temperature, formality_level, space_density,
       last_calculated_at)
    VALUES
      (v_user, (v_warmth + 1) / 2, v_openness, v_texture, v_light,
       CASE WHEN v_warmth >= 0.2 THEN 'warm' WHEN v_warmth <= -0.2 THEN 'cool' ELSE 'neutral' END,
       CASE WHEN v_formality >= 0.2 THEN 'structured' WHEN v_formality <= -0.2 THEN 'relaxed' ELSE 'balanced' END,
       CASE WHEN v_complexity >= 0.2 THEN 'layered' WHEN v_complexity <= -0.2 THEN 'minimal' ELSE 'balanced' END,
       now())
    ON CONFLICT (user_id) DO UPDATE SET
      warmth_preference        = EXCLUDED.warmth_preference,
      openness_preference      = EXCLUDED.openness_preference,
      texture_preference       = EXCLUDED.texture_preference,
      natural_light_preference = EXCLUDED.natural_light_preference,
      color_temperature        = EXCLUDED.color_temperature,
      formality_level          = EXCLUDED.formality_level,
      space_density            = EXCLUDED.space_density,
      last_calculated_at       = now(),
      updated_at               = now();
    v_bridged := true;
  ELSE
    RAISE NOTICE 'claim_quiz_session: no profiles row for % — user_style_signals bridge skipped', v_user;
  END IF;

  RETURN jsonb_build_object(
    'session_key', p_session_key,
    'user_id', v_user,
    'profile_id', v_profile.id,
    'claimed_profiles', v_claimed_profiles,
    'claimed_sessions', v_claimed_sessions,
    'bridged_style_signals', v_bridged
  );
END;
$$;

COMMENT ON FUNCTION claim_quiz_session(uuid) IS
  'Merge on signup (design §7.1/§18): binds user_id on quiz_sessions + client_style_profiles where NULL; upserts client_profiles.quiz_responses/style_preferences (via the 00243-added user_id key); bridges user_style_signals for iOS on the (x+1)/2 scale map (full mapping documented at the function definition); stamps conversion_event=signup. Idempotent; refuses keys claimed by another user.';

-- ─── 9. RLS (§5.6) ───────────────────────────────────────────────────────────
ALTER TABLE client_style_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_option_loadings ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_rate_limits ENABLE ROW LEVEL SECURITY;

-- client_style_profiles: own rows; assigned designer via designer_clients;
-- NO anon SELECT (anon reads only via RPC responses — prevents enumeration).
-- INSERT/UPDATE are RPC-only (DEFINER bypasses RLS → no policies). DELETE own.
CREATE POLICY "csp_select_own"
  ON client_style_profiles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "csp_select_assigned_designer"
  ON client_style_profiles FOR SELECT
  TO authenticated
  USING (
    user_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM designer_clients dc
       WHERE dc.designer_id = auth.uid()
         AND dc.client_id = client_style_profiles.user_id
    )
  );

CREATE POLICY "csp_delete_own"
  ON client_style_profiles FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- quiz_option_loadings: config data — authenticated reads, admin writes
-- (the dna_vocab/bias_templates pattern). No anon policy: anon consumes
-- loadings only through the DEFINER RPC.
CREATE POLICY "qol_select_authenticated"
  ON quiz_option_loadings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "qol_insert_admin"
  ON quiz_option_loadings FOR INSERT
  TO authenticated
  WITH CHECK (user_has_role(auth.uid(), 'super_admin'));

CREATE POLICY "qol_update_admin"
  ON quiz_option_loadings FOR UPDATE
  TO authenticated
  USING (user_has_role(auth.uid(), 'super_admin'))
  WITH CHECK (user_has_role(auth.uid(), 'super_admin'));

CREATE POLICY "qol_delete_admin"
  ON quiz_option_loadings FOR DELETE
  TO authenticated
  USING (user_has_role(auth.uid(), 'super_admin'));

-- quiz_rate_limits: admin SELECT; all writes happen inside the DEFINER RPC.
CREATE POLICY "qrl_select_admin"
  ON quiz_rate_limits FOR SELECT
  TO authenticated
  USING (user_has_role(auth.uid(), 'super_admin'));

-- ─── 10. quiz_sessions RLS fix (§12.5) ───────────────────────────────────────
-- 00001 shipped "Allow all access to quiz_sessions" (anon+authenticated, FOR
-- ALL, USING true) — any anon key could read every quiz session. Dropped.
-- Writes are RPC-only (submit_style_quiz / process_style_quiz are DEFINER);
-- authenticated users read their own rows; anon has NO direct table access;
-- service_role bypasses RLS as ever.
DROP POLICY IF EXISTS "Allow all access to quiz_sessions" ON quiz_sessions;

CREATE POLICY "quiz_sessions_select_own"
  ON quiz_sessions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

COMMENT ON TABLE quiz_sessions IS
  'Quiz submissions (append-only history). RLS fixed in 00243 (design §12.5): the 00001 wide-open policy is gone — writes are RPC-only (submit_style_quiz/process_style_quiz, SECURITY DEFINER), authenticated read own rows, anon has no direct access.';

-- ─── 11. FKs deferred from 00242 (parallel-wave contention rule) ─────────────
-- Both tables are empty pre-launch — plain ALTERs validate instantly.
ALTER TABLE taste_judgments
  ADD CONSTRAINT fk_taste_judgments_client_profile
  FOREIGN KEY (client_profile_id) REFERENCES client_style_profiles(id);

ALTER TABLE taste_corrections
  ADD CONSTRAINT fk_taste_corrections_client_profile
  FOREIGN KEY (client_profile_id) REFERENCES client_style_profiles(id);

COMMENT ON COLUMN taste_judgments.client_profile_id IS
  'References client_style_profiles(id) — FK added in 00243 (was deferred from 00242 under the parallel-migration contention rule).';
COMMENT ON COLUMN taste_corrections.client_profile_id IS
  'References client_style_profiles(id) — FK added in 00243 (was deferred from 00242 under the parallel-migration contention rule).';

-- ─── 12. Janitor (§7.1/§12.2) ────────────────────────────────────────────────
-- Purges (a) unclaimed anon client_style_profiles > 90 days that no
-- judgment/correction references (engagement-gated learning keeps its
-- referents — header note), (b) unclaimed anon quiz_sessions > 90 days not
-- referenced by a surviving profile, (c) rate rows > 1 day. Pure SQL — runs
-- in-DB via pg_cron, no edge function.
CREATE OR REPLACE FUNCTION aesthete_quiz_janitor()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profiles int;
  v_sessions int;
  v_rate int;
BEGIN
  DELETE FROM client_style_profiles p
   WHERE p.user_id IS NULL
     AND p.created_at < now() - interval '90 days'
     AND NOT EXISTS (SELECT 1 FROM taste_judgments j WHERE j.client_profile_id = p.id)
     AND NOT EXISTS (SELECT 1 FROM taste_corrections c WHERE c.client_profile_id = p.id);
  GET DIAGNOSTICS v_profiles = ROW_COUNT;

  DELETE FROM quiz_sessions q
   WHERE q.user_id IS NULL
     AND q.created_at < now() - interval '90 days'
     AND NOT EXISTS (SELECT 1 FROM client_style_profiles p WHERE p.quiz_session_id = q.id);
  GET DIAGNOSTICS v_sessions = ROW_COUNT;

  DELETE FROM quiz_rate_limits WHERE window_start < now() - interval '1 day';
  GET DIAGNOSTICS v_rate = ROW_COUNT;

  RETURN jsonb_build_object('profiles', v_profiles, 'sessions', v_sessions, 'rate_rows', v_rate);
END;
$$;

COMMENT ON FUNCTION aesthete_quiz_janitor() IS
  'Daily quiz hygiene (design §7.1/§12.2 janitor row): purges unclaimed anon client_style_profiles/quiz_sessions > 90 days (skipping profiles referenced by taste_judgments/taste_corrections, and sessions referenced by surviving profiles) + quiz_rate_limits > 1 day. Scheduled as aesthete-quiz-janitor (pg_cron, in-DB SQL — no edge function).';

-- Guarded-unschedule string-body idiom (00081/00092/00189/00241).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'aesthete-quiz-janitor') THEN
    PERFORM cron.unschedule('aesthete-quiz-janitor');
  END IF;
END $$;

SELECT cron.schedule(
  'aesthete-quiz-janitor',
  '45 3 * * *',
  $$
  SELECT public.aesthete_quiz_janitor();
  $$
);

-- ─── 13. Grants (§18) ────────────────────────────────────────────────────────
-- submit_style_quiz: anon + authenticated (the §7.1 wire contract).
-- claim_quiz_session: authenticated only. _compute_quiz_profile is internal
-- (no client roles). Janitor is cron/service only.
REVOKE ALL ON FUNCTION _compute_quiz_profile(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION submit_style_quiz(uuid, jsonb, jsonb, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION claim_quiz_session(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION aesthete_quiz_janitor() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION submit_style_quiz(uuid, jsonb, jsonb, text, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION claim_quiz_session(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION aesthete_quiz_janitor() TO service_role;
