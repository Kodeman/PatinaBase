-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 00242: Taste foundation — designer taste, house, biases, rules
--
-- Design contract: docs/prds/AE/aesthete-engine-system-design.md
--   §5.4 (all DDL) · §5.6 (RLS) · §8.3 (probes) · §8.5 (signature biases)
--   §9.1 (house versioning + curation ops) · §12.5 (export/retire) · §18 (RPCs)
-- (§15.4 row "00242 taste_foundation" — replaces the G0 reservation in place.)
--
-- What this ships:
--   1. All §5.4 tables: designer_taste_profiles, designer_taste_snapshots,
--      designer_style_confidence, taste_judgments, taste_corrections,
--      designer_portfolio_items, house_taste, signature_biases,
--      bias_templates (+ seed), taste_rules, style_centroids.
--   2. RLS per §5.6 (own-rows / lead / admin; append-only judgments and
--      corrections = no UPDATE/DELETE policies; house raw vector redacted
--      via v_house_taste_public).
--   3. RPCs (§18, SECURITY DEFINER, search_path pinned): submit_taste_judgment
--      (server-side probe injection §8.3), submit_taste_correction,
--      update_my_biases (view+override layer, never writes learned state),
--      export_designer_taste / retire_designer_taste (§12.5),
--      compute_house_taste_draft / activate_house_taste (§9.1), and the
--      refresh_style_centroids() nightly helper.
--   4. Dev seed: a provisional ACTIVE house_taste v1 so Wave-2A's match RPC
--      can read an active house from day one (replaced by the House Hundred
--      curation — Wave 5 human task, §9.1).
--
-- Documented deviations from the §5.4 sketch (flagged to the conductor):
--   • taste_judgments.client_profile_id / taste_corrections.client_profile_id
--     ship WITHOUT their `REFERENCES client_style_profiles(id)` FK — that
--     table is created by 00243, which is built IN PARALLEL by Wave 1B (the
--     delivery plan's contention rule: parallel migrations must not reference
--     each other's objects). Conductor to-do: add both FKs in a later spine
--     migration (2A's block or a small follow-up).
--   • designer_taste_profiles gains `retired_at timestamptz` — the §12.5
--     retire semantics ("exclude from future house recompute") need a stored
--     tombstone marker; compute_house_taste_draft filters on it.
--   • NEW table taste_probe_queue — the "simplest honest mechanism" for
--     §8.3's blind repeat probes: on submit, ~1-in-25 judgments (default
--     4%, GUC `aesthete.probe_rate` overridable for tests) enqueue a
--     reversed repeat of the just-judged pair, due ≥ 14 days out. The
--     teaching UI (Wave 3B) reads its own due probes and injects them as
--     ordinary pairs; when the designer answers a due probe pair, the RPC
--     records kind='probe' server-side and closes the queue row. Probes are
--     invisible in COPY (de-gamified law) — not at the API layer.
--
-- LEAD ROLE decision (documented per the wave brief): the roles system
-- (00021/00022) has domains consumer|designer|manufacturer|admin and NO
-- 'lead' role. Lead-gated operations (house curation, taste_rules house
-- scope, lead read paths) therefore accept ANY admin-domain role
-- (super_admin, ml_operator — "Aesthete Engine management specialist" —
-- quality_control, support_agent) OR a role literally named 'lead' if one is
-- ever seeded. Helper: is_aesthete_lead(). Tightening this to a dedicated
-- lead role is a one-line change there.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. designer_taste_profiles — the learned designer state (§5.4) ─────────
CREATE TABLE designer_taste_profiles (
  designer_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  taste_vector vector(768),                    -- v_D (EMA over judgment winners)
  portfolio_centroid vector(768),              -- v_D0, never decays
  theta real[],                                -- θ_D over the 94-d interpretable basis (§8.1)
  warmth real, complexity real, formality real, timelessness real, boldness real, craftsmanship real,
  confidence_map jsonb NOT NULL DEFAULT '{}',  -- {style_id: {score, n, label}}
  reliability real NOT NULL DEFAULT 0.15 CHECK (reliability BETWEEN 0 AND 1),
  deviation_from_house jsonb DEFAULT '{}',
  sources jsonb NOT NULL DEFAULT '{}',         -- {portfolio_items, judgments, corrections, rules}
  judgments_processed_at timestamptz,          -- nightly-refit watermark
  drift_flag boolean DEFAULT false,
  retired_at timestamptz,                      -- §12.5 tombstone (additive; see header)
  version int NOT NULL DEFAULT 1, updated_at timestamptz DEFAULT now()
);

COMMENT ON TABLE designer_taste_profiles IS
  'Learned designer taste state (design §5.4/§8): dense v_D + portfolio seed + θ over the interpretable basis + spectrums + reliability ρ_D. Written only by the nightly refit job and DEFINER RPCs — never directly by clients. retired_at is the §12.5 tombstone; retired designers are excluded from house recompute.';
COMMENT ON COLUMN designer_taste_profiles.retired_at IS
  'Set by retire_designer_taste (§12.5). Non-NULL rows are excluded from compute_house_taste_draft and carry no learned state (tombstoned).';

CREATE TRIGGER update_designer_taste_profiles_updated_at
  BEFORE UPDATE ON designer_taste_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ─── 2. designer_taste_snapshots — append-only history (§5.4) ───────────────
CREATE TABLE designer_taste_snapshots (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  designer_id uuid NOT NULL, version int NOT NULL,
  taste_vector vector(768), theta real[], spectrums jsonb, reliability real, sources jsonb,
  created_at timestamptz DEFAULT now(), UNIQUE (designer_id, version)
);

COMMENT ON TABLE designer_taste_snapshots IS
  'Append-only taste history (design §5.4): one row per nightly-refit version. Audit + export substrate. No FK to auth.users by design — snapshots outlive accounts; retire_designer_taste tombstones the vector/theta payloads in place.';

-- ─── 3. designer_style_confidence — per-archetype confidence map (§5.4) ─────
CREATE TABLE designer_style_confidence (
  designer_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  style_id uuid REFERENCES styles(id) ON DELETE CASCADE,
  level text NOT NULL CHECK (level IN ('learning','advanced','expert')),
  weight real GENERATED ALWAYS AS
    (CASE level WHEN 'expert' THEN 1.0 WHEN 'advanced' THEN 0.7 ELSE 0.4 END) STORED,
  judgment_count int DEFAULT 0, updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (designer_id, style_id)
);

COMMENT ON TABLE designer_style_confidence IS
  'Per-archetype designer confidence c_D(g) (design §5.4/§8.4), relational for the hot-path join. Written by the nightly stats job (service role) — no client write policies.';

CREATE TRIGGER update_designer_style_confidence_updated_at
  BEFORE UPDATE ON designer_style_confidence
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ─── 4. taste_judgments — the primary fuel; append-only (§5.4) ──────────────
-- client_profile_id: plain uuid, FK deferred (00243 builds client_style_profiles
-- in a parallel wave — see header deviation note).
CREATE TABLE taste_judgments (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  designer_id uuid NOT NULL REFERENCES auth.users(id),
  product_a uuid NOT NULL REFERENCES products(id),
  product_b uuid NOT NULL REFERENCES products(id),
  choice text NOT NULL CHECK (choice IN ('a','b','neither','both')),
  context text NOT NULL DEFAULT 'self' CHECK (context IN ('self','client','house')),
  client_profile_id uuid,                      -- → client_style_profiles(id); FK added post-00243
  kind text NOT NULL DEFAULT 'judgment' CHECK (kind IN ('judgment','probe','rule_pseudo')),
  session_id uuid REFERENCES teaching_sessions(id),
  latency_ms int, created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_tj_designer_time ON taste_judgments(designer_id, created_at);

COMMENT ON TABLE taste_judgments IS
  'Append-only pairwise taste judgments (design §5.4/§8) — the primary learning fuel. No UPDATE/DELETE policies: judgments are history; θ is a cache. kind=probe rows are §8.3 blind repeats recorded server-side by submit_taste_judgment.';
COMMENT ON COLUMN taste_judgments.client_profile_id IS
  'References client_style_profiles(id) (00243, parallel wave). FK constraint deferred to a later spine migration — see 00242 header.';

-- ─── 5. taste_corrections — directional overrides; append-only (§5.4) ───────
CREATE TABLE taste_corrections (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  designer_id uuid NOT NULL REFERENCES auth.users(id),
  subject text NOT NULL CHECK (subject IN ('match','dna','spectrum')),
  product_id uuid REFERENCES products(id),
  replacement_product_id uuid REFERENCES products(id),        -- correction-with-replacement
  client_profile_id uuid,                      -- → client_style_profiles(id); FK added post-00243
  direction jsonb NOT NULL DEFAULT '{}',       -- {"warmth": -0.3, "boldness": -0.2}
  free_text text,
  surface text CHECK (surface IN ('engine_ask','teaching','companion','library')),
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_tc_designer_time ON taste_corrections(designer_id, created_at);

COMMENT ON TABLE taste_corrections IS
  'Append-only directional corrections (design §5.4/§8.2): correction-with-replacement in client context = a weight-2.0 pairwise; structured direction feeds bias naming (§8.5). No UPDATE/DELETE policies.';
COMMENT ON COLUMN taste_corrections.client_profile_id IS
  'References client_style_profiles(id) (00243, parallel wave). FK constraint deferred to a later spine migration — see 00242 header.';

-- ─── 6. designer_portfolio_items (§5.4) ─────────────────────────────────────
CREATE TABLE designer_portfolio_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  designer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_path text NOT NULL,                  -- private bucket, capture-media pattern
  caption text, embedding vector(768),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','embedded','failed')),
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_dpi_designer ON designer_portfolio_items(designer_id);

COMMENT ON TABLE designer_portfolio_items IS
  'Designer portfolio images for the taste cold-start seed v_D0 (design §5.4/§4.3, Loop 3). Owner-managed rows; embeddings written by the portfolio_embed job (service role).';

-- ─── 7. house_taste — versioned rows; exactly one active (§5.4/§9.1) ────────
CREATE TABLE house_taste (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version int NOT NULL UNIQUE,
  taste_vector vector(768) NOT NULL,
  theta real[],
  warmth real, complexity real, formality real, timelessness real, boldness real, craftsmanship real,
  curated_overrides jsonb DEFAULT '{}',        -- {"warmth": {"op":"pin","value":0.55}, "boldness":{"op":"protect"}}
  computed_from jsonb NOT NULL DEFAULT '{}',   -- {designer_id: {weight}} snapshot, or {collection: "house-hundred"}
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','retired')),
  curated_by uuid, notes text, created_at timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX ux_house_active ON house_taste((1)) WHERE status = 'active';

COMMENT ON TABLE house_taste IS
  'Versioned house taste (design §5.4/§9.1): exactly one active row (ux_house_active). Writes go through the lead-gated RPCs (compute_house_taste_draft / activate_house_taste); rollback = reactivate a prior version. Raw vector is designer-IP-grade — redacted from non-lead reads via v_house_taste_public.';

-- ─── 8. signature_biases — "Your Eye"; view + override layer (§5.4/§8.5) ────
CREATE TABLE signature_biases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  designer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature_group text NOT NULL,                 -- e.g. 'warmth', 'archetype:modern_industrial', 'material:metal'
  direction text NOT NULL CHECK (direction IN ('+','-')),
  learned_strength real, displayed_strength real,
  name text NOT NULL, description text,
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','confirmed','edited','muted')),
  evidence jsonb DEFAULT '{}',                 -- exemplar product ids, correction citations
  version int NOT NULL DEFAULT 1, updated_at timestamptz DEFAULT now()
);
CREATE INDEX idx_sb_designer ON signature_biases(designer_id);

COMMENT ON TABLE signature_biases IS
  'Named designer biases ("Your Eye", design §8.5). learned_strength is machine state (nightly derivation); displayed_strength/status/name/description are the human override layer, edited ONLY via update_my_biases — edits never write back into θ.';

CREATE TRIGGER update_signature_biases_updated_at
  BEFORE UPDATE ON signature_biases
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ─── 9. bias_templates — human-authored bias names (§5.4/§8.5) ──────────────
CREATE TABLE bias_templates (
  pattern text PRIMARY KEY,                    -- 'warmth+ ∧ material:metal'
  name text NOT NULL, description text
);

COMMENT ON TABLE bias_templates IS
  'Feature-group pattern → human-authored bias name/one-liner (design §8.5). Config data: nightly bias derivation matches candidate patterns here before any Claude-proposed naming (which always needs designer/lead approval).';

-- Seed: the §8.5 worked examples plus the obvious single-axis leans, written
-- in the house voice (never scores, never "AI").
INSERT INTO bias_templates (pattern, name, description) VALUES
  ('warmth+ ∧ material:metal',        'Warms up cool pieces',  'Leans warm even on metal-forward pieces — softens an industrial read before it settles.'),
  ('craftsmanship+ ∧ patina+',        'Patina-first',          'Reaches for pieces built to age visibly — wear is the point, not the risk.'),
  ('warmth+',                          'Warm lean',             'Given the choice, picks the warmer read of a room.'),
  ('warmth-',                          'Cool lean',             'Keeps palettes cool and composed where others drift warm.'),
  ('boldness+',                        'Bold strokes',          'Backs the statement piece — comfortable letting one object carry the room.'),
  ('complexity-',                      'Quiet lines',           'Edits toward restraint — fewer moves, cleaner silhouettes.'),
  ('formality-',                       'At-ease rooms',         'Relaxes formal arrangements — approachable over composed.'),
  ('material:wood+',                   'Wood-first',            'Anchors rooms in wood before metal, glass, or stone.'),
  ('timelessness+ ∧ craftsmanship+',  'Built to stay',         'Chooses pieces that will read as right in twenty years — construction over trend.')
ON CONFLICT (pattern) DO NOTHING;

-- ─── 10. taste_rules — explicit rule builder (§5.4) ─────────────────────────
CREATE TABLE taste_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_scope text NOT NULL CHECK (owner_scope IN ('designer','house')),
  designer_id uuid REFERENCES auth.users(id),
  scope text NOT NULL DEFAULT 'global' CHECK (scope IN ('global','category','style')),
  scope_value text,
  predicate jsonb NOT NULL,                    -- {"all": [{"attr":"complexity","gte":0.5}]}
  action text NOT NULL CHECK (action IN ('boost','bury','block')),
  magnitude real DEFAULT 0.1 CHECK (magnitude BETWEEN 0 AND 0.5),
  status text NOT NULL DEFAULT 'active', created_at timestamptz DEFAULT now(),
  CHECK ((owner_scope = 'designer') = (designer_id IS NOT NULL))
);

COMMENT ON TABLE taste_rules IS
  'Explicit taste rules (design §5.4/§8.2): predicate jsonb + boost/bury/block, scope precedence global < category < style (salvaged from the old rule engine). House-scope rows (designer_id NULL) are lead-authored and visible to all designers; a rule row also emits a 0.5-weight rule_pseudo judgment (nightly, later wave).';

-- ─── 11. style_centroids — archetype anchors for in-DB client seeding ───────
CREATE TABLE style_centroids (
  style_id uuid PRIMARY KEY REFERENCES styles(id) ON DELETE CASCADE,
  centroid vector(768) NOT NULL,
  n_products int NOT NULL, computed_at timestamptz DEFAULT now()
);

COMMENT ON TABLE style_centroids IS
  'Per-archetype centroids of designer-confirmed catalog vectors (design §4.3/§5.4). Recomputed by refresh_style_centroids() (nightly phase 4); read in-DB by the quiz profile assembly — the pure-SQL hot path.';

-- ─── 12. taste_probe_queue — §8.3 blind-repeat mechanism (see header) ────────
CREATE TABLE taste_probe_queue (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  designer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_judgment_id bigint NOT NULL REFERENCES taste_judgments(id) ON DELETE CASCADE,
  product_a uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  product_b uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  due_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','answered','expired')),
  answered_judgment_id bigint REFERENCES taste_judgments(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_tpq_due ON taste_probe_queue(designer_id, due_at) WHERE status = 'pending';

COMMENT ON TABLE taste_probe_queue IS
  'Blind repeat probes (design §8.3): ~1-in-25 submitted judgments enqueue an order-reversed repeat of the same pair, due ≥ 14 days later. The teaching UI serves due rows as ordinary pairs; submit_taste_judgment recognizes the answer server-side, records kind=probe, and closes the row. Probe agreement blends into ρ_D at 25% (nightly). Never surfaced as a "consistency check" (de-gamified law).';

-- ─── 13. Lead helper (see header LEAD ROLE decision) ─────────────────────────
CREATE OR REPLACE FUNCTION is_aesthete_lead(p_user_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN user_has_role_domain(p_user_id, 'admin') OR user_has_role(p_user_id, 'lead');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION is_aesthete_lead(uuid) IS
  'Lead gate for house curation + lead read paths (design §9.1/§5.6). No dedicated lead role exists in 00021/00022, so: any admin-domain role OR a role literally named ''lead'' if one is ever seeded. Documented in 00242''s header.';

-- ─── 14. v_house_taste_public — the redacting view (§5.6/§12.5) ─────────────
-- Owned by postgres (default security_invoker = false → runs with owner
-- privileges, bypassing house_taste's lead-only RLS) and exposing ONLY
-- version/status/spectrum coordinates — never taste_vector, theta,
-- curated_overrides, computed_from, or notes. Granted to authenticated only;
-- anon cold-start reads happen inside the DEFINER match RPC (§5.6).
CREATE VIEW v_house_taste_public AS
SELECT
  version,
  status,
  warmth, complexity, formality, timelessness, boldness, craftsmanship,
  created_at
FROM house_taste;

COMMENT ON VIEW v_house_taste_public IS
  'Redacted house taste for authenticated surfaces (design §5.6): version/status/spectrum coords only. The raw taste_vector/theta are designer-IP-grade and never leave PostgREST to client roles.';

REVOKE ALL ON v_house_taste_public FROM PUBLIC, anon;
GRANT SELECT ON v_house_taste_public TO authenticated, service_role;

-- ─── 15. RLS (§5.6) ─────────────────────────────────────────────────────────
ALTER TABLE designer_taste_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE designer_taste_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE designer_style_confidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE taste_judgments ENABLE ROW LEVEL SECURITY;
ALTER TABLE taste_corrections ENABLE ROW LEVEL SECURITY;
ALTER TABLE designer_portfolio_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE house_taste ENABLE ROW LEVEL SECURITY;
ALTER TABLE signature_biases ENABLE ROW LEVEL SECURITY;
ALTER TABLE bias_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE taste_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE style_centroids ENABLE ROW LEVEL SECURITY;
ALTER TABLE taste_probe_queue ENABLE ROW LEVEL SECURITY;

-- designer_taste_profiles / _snapshots: own; lead/admin. No write policies
-- (job + DEFINER RPCs only).
CREATE POLICY "dtp_select_own_or_lead"
  ON designer_taste_profiles FOR SELECT
  TO authenticated
  USING (designer_id = auth.uid() OR is_aesthete_lead(auth.uid()));

CREATE POLICY "dts_select_own_or_lead"
  ON designer_taste_snapshots FOR SELECT
  TO authenticated
  USING (designer_id = auth.uid() OR is_aesthete_lead(auth.uid()));

-- designer_style_confidence: own; lead/admin. Writes are job/RPC only.
CREATE POLICY "dsc_select_own_or_lead"
  ON designer_style_confidence FOR SELECT
  TO authenticated
  USING (designer_id = auth.uid() OR is_aesthete_lead(auth.uid()));

-- taste_judgments: own; admin. INSERT own. Append-only: NO UPDATE/DELETE
-- policies (an authenticated UPDATE/DELETE silently affects 0 rows).
CREATE POLICY "tj_select_own_or_admin"
  ON taste_judgments FOR SELECT
  TO authenticated
  USING (designer_id = auth.uid() OR user_has_role(auth.uid(), 'super_admin'));

CREATE POLICY "tj_insert_own"
  ON taste_judgments FOR INSERT
  TO authenticated
  WITH CHECK (designer_id = auth.uid());

-- taste_corrections: same shape as judgments.
CREATE POLICY "tc_select_own_or_admin"
  ON taste_corrections FOR SELECT
  TO authenticated
  USING (designer_id = auth.uid() OR user_has_role(auth.uid(), 'super_admin'));

CREATE POLICY "tc_insert_own"
  ON taste_corrections FOR INSERT
  TO authenticated
  WITH CHECK (designer_id = auth.uid());

-- designer_portfolio_items: owner-managed (SELECT own+admin; INSERT/UPDATE/
-- DELETE own — the UPDATE is for captions; embeddings land via service role).
CREATE POLICY "dpi_select_own_or_admin"
  ON designer_portfolio_items FOR SELECT
  TO authenticated
  USING (designer_id = auth.uid() OR user_has_role(auth.uid(), 'super_admin'));

CREATE POLICY "dpi_insert_own"
  ON designer_portfolio_items FOR INSERT
  TO authenticated
  WITH CHECK (designer_id = auth.uid());

CREATE POLICY "dpi_update_own"
  ON designer_portfolio_items FOR UPDATE
  TO authenticated
  USING (designer_id = auth.uid())
  WITH CHECK (designer_id = auth.uid());

CREATE POLICY "dpi_delete_own"
  ON designer_portfolio_items FOR DELETE
  TO authenticated
  USING (designer_id = auth.uid());

-- house_taste: direct table reads are lead-only; everyone else goes through
-- v_house_taste_public (spectrum coords + version, no raw vector). No anon
-- policy — cold-start reads happen inside the DEFINER match RPC. Writes are
-- lead-RPC only (DEFINER bypasses RLS → no write policies).
CREATE POLICY "house_select_lead"
  ON house_taste FOR SELECT
  TO authenticated
  USING (is_aesthete_lead(auth.uid()));

-- signature_biases: SELECT own; lead/admin. Writes ONLY via update_my_biases
-- (the machine side is written by the nightly job as service role).
CREATE POLICY "sb_select_own_or_lead"
  ON signature_biases FOR SELECT
  TO authenticated
  USING (designer_id = auth.uid() OR is_aesthete_lead(auth.uid()));

-- bias_templates: config data — authenticated reads, admin writes (the
-- dna_vocab pattern).
CREATE POLICY "bt_select_authenticated"
  ON bias_templates FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "bt_insert_admin"
  ON bias_templates FOR INSERT
  TO authenticated
  WITH CHECK (user_has_role(auth.uid(), 'super_admin'));

CREATE POLICY "bt_update_admin"
  ON bias_templates FOR UPDATE
  TO authenticated
  USING (user_has_role(auth.uid(), 'super_admin'))
  WITH CHECK (user_has_role(auth.uid(), 'super_admin'));

CREATE POLICY "bt_delete_admin"
  ON bias_templates FOR DELETE
  TO authenticated
  USING (user_has_role(auth.uid(), 'super_admin'));

-- taste_rules: own + house rules to authenticated; INSERT own / lead for
-- house scope; UPDATE/DELETE own (house rows: lead).
CREATE POLICY "tr_select_own_or_house"
  ON taste_rules FOR SELECT
  TO authenticated
  USING (designer_id = auth.uid() OR owner_scope = 'house');

CREATE POLICY "tr_insert_own_or_lead_house"
  ON taste_rules FOR INSERT
  TO authenticated
  WITH CHECK (
    (owner_scope = 'designer' AND designer_id = auth.uid())
    OR (owner_scope = 'house' AND is_aesthete_lead(auth.uid()))
  );

CREATE POLICY "tr_update_own_or_lead_house"
  ON taste_rules FOR UPDATE
  TO authenticated
  USING (
    (owner_scope = 'designer' AND designer_id = auth.uid())
    OR (owner_scope = 'house' AND is_aesthete_lead(auth.uid()))
  )
  WITH CHECK (
    (owner_scope = 'designer' AND designer_id = auth.uid())
    OR (owner_scope = 'house' AND is_aesthete_lead(auth.uid()))
  );

CREATE POLICY "tr_delete_own_or_lead_house"
  ON taste_rules FOR DELETE
  TO authenticated
  USING (
    (owner_scope = 'designer' AND designer_id = auth.uid())
    OR (owner_scope = 'house' AND is_aesthete_lead(auth.uid()))
  );

-- style_centroids: derived catalog-layer aggregates — readable by any
-- authenticated user (they feed designer surfaces too); written only by
-- refresh_style_centroids() / the nightly job.
CREATE POLICY "sc_select_authenticated"
  ON style_centroids FOR SELECT
  TO authenticated
  USING (true);

-- taste_probe_queue: SELECT own (the teaching UI reads its own due probes to
-- inject them); all writes via the DEFINER RPC.
CREATE POLICY "tpq_select_own"
  ON taste_probe_queue FOR SELECT
  TO authenticated
  USING (designer_id = auth.uid());

-- ─── 16. RPC: submit_taste_judgment (§18, §8.3) ─────────────────────────────
-- p_pair: {"a": <product uuid>, "b": <product uuid>, "session_id": <optional
-- teaching_sessions uuid>}. Probe mechanics per the header: a due pending
-- probe matching (a, b) exactly is answered (kind='probe'); otherwise, with
-- probability aesthete.probe_rate (default 0.04 ≈ the design's ~1-in-25) the
-- new judgment enqueues its own reversed repeat, due in 14 days.
CREATE OR REPLACE FUNCTION submit_taste_judgment(
  p_pair jsonb,
  p_choice text,
  p_context text DEFAULT 'self',
  p_client_profile_id uuid DEFAULT NULL,
  p_latency_ms int DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_designer uuid := auth.uid();
  v_a uuid;
  v_b uuid;
  v_session uuid;
  v_kind text := 'judgment';
  v_probe_id bigint;
  v_judgment_id bigint;
  v_probe_rate real := COALESCE(NULLIF(current_setting('aesthete.probe_rate', true), '')::real, 0.04);
  v_sources jsonb;
BEGIN
  IF v_designer IS NULL THEN
    RAISE EXCEPTION 'submit_taste_judgment: authentication required' USING ERRCODE = '42501';
  END IF;

  v_a := (p_pair->>'a')::uuid;
  v_b := (p_pair->>'b')::uuid;
  v_session := (p_pair->>'session_id')::uuid;

  IF v_a IS NULL OR v_b IS NULL THEN
    RAISE EXCEPTION 'submit_taste_judgment: p_pair must carry product ids as {"a": uuid, "b": uuid}';
  END IF;
  IF v_a = v_b THEN
    RAISE EXCEPTION 'submit_taste_judgment: a judgment needs two distinct products';
  END IF;
  IF p_choice IS NULL OR p_choice NOT IN ('a', 'b', 'neither', 'both') THEN
    RAISE EXCEPTION 'submit_taste_judgment: p_choice must be a|b|neither|both, got %', COALESCE(p_choice, '<null>');
  END IF;
  IF p_context IS NULL OR p_context NOT IN ('self', 'client', 'house') THEN
    RAISE EXCEPTION 'submit_taste_judgment: p_context must be self|client|house, got %', COALESCE(p_context, '<null>');
  END IF;

  -- Is this pair the answer to a due probe? (Exact match on the reversed
  -- order the probe row stored.)
  SELECT id INTO v_probe_id
    FROM taste_probe_queue
   WHERE designer_id = v_designer
     AND status = 'pending'
     AND due_at <= now()
     AND product_a = v_a
     AND product_b = v_b
   ORDER BY due_at
   LIMIT 1
   FOR UPDATE;

  IF v_probe_id IS NOT NULL THEN
    v_kind := 'probe';
  END IF;

  INSERT INTO taste_judgments
    (designer_id, product_a, product_b, choice, context, client_profile_id, kind, session_id, latency_ms)
  VALUES
    (v_designer, v_a, v_b, p_choice, p_context, p_client_profile_id, v_kind, v_session, p_latency_ms)
  RETURNING id INTO v_judgment_id;

  IF v_probe_id IS NOT NULL THEN
    UPDATE taste_probe_queue
       SET status = 'answered', answered_judgment_id = v_judgment_id
     WHERE id = v_probe_id;
  ELSIF random() < v_probe_rate THEN
    -- Enqueue the reversed repeat, ≥ 14 days out (§8.3).
    INSERT INTO taste_probe_queue (designer_id, source_judgment_id, product_a, product_b, due_at)
    VALUES (v_designer, v_judgment_id, v_b, v_a, now() + interval '14 days');
  END IF;

  -- Bump the sources counter (creates the profile shell on first judgment;
  -- the nightly refit recomputes counters canonically).
  INSERT INTO designer_taste_profiles (designer_id, sources)
  VALUES (v_designer, jsonb_build_object('portfolio_items', 0, 'judgments', 1, 'corrections', 0, 'rules', 0))
  ON CONFLICT (designer_id) DO UPDATE
    SET sources = jsonb_set(
      COALESCE(designer_taste_profiles.sources, '{}'::jsonb),
      '{judgments}',
      to_jsonb(COALESCE((designer_taste_profiles.sources->>'judgments')::int, 0) + 1)
    )
  RETURNING sources INTO v_sources;

  RETURN jsonb_build_object('judgment_id', v_judgment_id, 'kind', v_kind, 'sources', v_sources);
END;
$$;

COMMENT ON FUNCTION submit_taste_judgment(jsonb, text, text, uuid, int) IS
  'Append a pairwise taste judgment (design §8/§18) with server-side §8.3 probe mechanics: answers a due reversed repeat as kind=probe, else enqueues one with probability aesthete.probe_rate (default 0.04). Bumps designer_taste_profiles.sources.judgments.';

-- ─── 17. RPC: submit_taste_correction (§18) ─────────────────────────────────
CREATE OR REPLACE FUNCTION submit_taste_correction(
  p_subject text,
  p_product_id uuid DEFAULT NULL,
  p_replacement_product_id uuid DEFAULT NULL,
  p_client_profile_id uuid DEFAULT NULL,
  p_direction jsonb DEFAULT '{}',
  p_free_text text DEFAULT NULL,
  p_surface text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_designer uuid := auth.uid();
  v_correction_id bigint;
  v_sources jsonb;
BEGIN
  IF v_designer IS NULL THEN
    RAISE EXCEPTION 'submit_taste_correction: authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_subject IS NULL OR p_subject NOT IN ('match', 'dna', 'spectrum') THEN
    RAISE EXCEPTION 'submit_taste_correction: p_subject must be match|dna|spectrum, got %', COALESCE(p_subject, '<null>');
  END IF;
  IF p_surface IS NOT NULL AND p_surface NOT IN ('engine_ask', 'teaching', 'companion', 'library') THEN
    RAISE EXCEPTION 'submit_taste_correction: p_surface must be engine_ask|teaching|companion|library, got %', p_surface;
  END IF;

  INSERT INTO taste_corrections
    (designer_id, subject, product_id, replacement_product_id, client_profile_id, direction, free_text, surface)
  VALUES
    (v_designer, p_subject, p_product_id, p_replacement_product_id, p_client_profile_id,
     COALESCE(p_direction, '{}'::jsonb), p_free_text, p_surface)
  RETURNING id INTO v_correction_id;

  INSERT INTO designer_taste_profiles (designer_id, sources)
  VALUES (v_designer, jsonb_build_object('portfolio_items', 0, 'judgments', 0, 'corrections', 1, 'rules', 0))
  ON CONFLICT (designer_id) DO UPDATE
    SET sources = jsonb_set(
      COALESCE(designer_taste_profiles.sources, '{}'::jsonb),
      '{corrections}',
      to_jsonb(COALESCE((designer_taste_profiles.sources->>'corrections')::int, 0) + 1)
    )
  RETURNING sources INTO v_sources;

  RETURN jsonb_build_object('correction_id', v_correction_id, 'sources', v_sources);
END;
$$;

COMMENT ON FUNCTION submit_taste_correction(text, uuid, uuid, uuid, jsonb, text, text) IS
  'Append a directional taste correction (design §8.2/§18). Correction-with-replacement in client context is consumed by the nightly refit as a weight-2.0 pairwise. Bumps designer_taste_profiles.sources.corrections.';

-- ─── 18. RPC: update_my_biases — the §8.5 edit invariant ────────────────────
-- p_overrides: jsonb ARRAY of {"id": <signature_biases uuid>, "status"?,
-- "displayed_strength"?, "name"?, "description"?}. Any other key raises —
-- the override layer NEVER writes learned fields (learned_strength,
-- feature_group, direction, evidence) or any θ/vector state.
CREATE OR REPLACE FUNCTION update_my_biases(p_overrides jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_designer uuid := auth.uid();
  v_item jsonb;
  v_key text;
  v_id uuid;
  v_updated int := 0;
  v_rows int;
BEGIN
  IF v_designer IS NULL THEN
    RAISE EXCEPTION 'update_my_biases: authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_overrides IS NULL OR jsonb_typeof(p_overrides) <> 'array' THEN
    RAISE EXCEPTION 'update_my_biases: p_overrides must be a jsonb array of override objects';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_overrides) LOOP
    FOR v_key IN SELECT jsonb_object_keys(v_item) LOOP
      IF v_key NOT IN ('id', 'status', 'displayed_strength', 'name', 'description') THEN
        RAISE EXCEPTION 'update_my_biases: "%" is not editable — the override layer never writes learned state (design §8.5)', v_key;
      END IF;
    END LOOP;

    v_id := (v_item->>'id')::uuid;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'update_my_biases: each override needs an "id"';
    END IF;
    IF (v_item->>'status') IS NOT NULL
       AND (v_item->>'status') NOT IN ('confirmed', 'edited', 'muted') THEN
      RAISE EXCEPTION 'update_my_biases: status must be confirmed|edited|muted (proposed is machine-set), got %', v_item->>'status';
    END IF;

    UPDATE signature_biases
       SET status             = COALESCE(v_item->>'status', status),
           displayed_strength = COALESCE((v_item->>'displayed_strength')::real, displayed_strength),
           name               = COALESCE(v_item->>'name', name),
           description        = COALESCE(v_item->>'description', description),
           version            = version + 1
     WHERE id = v_id AND designer_id = v_designer;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_updated := v_updated + v_rows;
  END LOOP;

  RETURN jsonb_build_object('updated', v_updated);
END;
$$;

COMMENT ON FUNCTION update_my_biases(jsonb) IS
  'Edit the "Your Eye" override layer (design §8.5): status/displayed_strength/name/description on own signature_biases rows only. Learned fields are rejected outright; overrides survive nightly refits (refit recomputes learned_strength; overrides re-apply on top).';

-- ─── 19. RPC: export_designer_taste (§12.5/§18) ─────────────────────────────
CREATE OR REPLACE FUNCTION export_designer_taste(p_designer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL
     OR (v_caller <> p_designer_id AND NOT user_has_role_domain(v_caller, 'admin')) THEN
    RAISE EXCEPTION 'export_designer_taste: only the owner or an admin may export a taste profile' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'designer_id', p_designer_id,
    'exported_at', now(),
    'profile', (SELECT to_jsonb(t) FROM designer_taste_profiles t WHERE t.designer_id = p_designer_id),
    'snapshots', COALESCE(
      (SELECT jsonb_agg(to_jsonb(s) ORDER BY s.version)
         FROM designer_taste_snapshots s WHERE s.designer_id = p_designer_id),
      '[]'::jsonb),
    'judgments', COALESCE(
      (SELECT jsonb_agg(to_jsonb(j) ORDER BY j.id)
         FROM taste_judgments j WHERE j.designer_id = p_designer_id),
      '[]'::jsonb),
    'corrections', COALESCE(
      (SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id)
         FROM taste_corrections c WHERE c.designer_id = p_designer_id),
      '[]'::jsonb),
    'biases', COALESCE(
      (SELECT jsonb_agg(to_jsonb(b) ORDER BY b.updated_at)
         FROM signature_biases b WHERE b.designer_id = p_designer_id),
      '[]'::jsonb)
  );
END;
$$;

COMMENT ON FUNCTION export_designer_taste(uuid) IS
  'Taste portability (design §12.5): full JSON — profile (vectors + θ), snapshots, judgments, corrections, biases. Owner-initiated; admins may export on a designer''s behalf. Ships week 0 — cheap now, contractual later.';

-- ─── 20. RPC: retire_designer_taste (§12.5/§18) ─────────────────────────────
-- Departure guardrail: tombstones the profile (retired_at + learned state
-- NULLed), tombstones snapshot payloads in place (rows kept as the version
-- audit trail), hard-deletes judgments/corrections per contract terms, and
-- removes derived state (biases, style confidence, probes). retired_at
-- excludes the designer from every future compute_house_taste_draft.
CREATE OR REPLACE FUNCTION retire_designer_taste(p_designer_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL
     OR (v_caller <> p_designer_id AND NOT user_has_role_domain(v_caller, 'admin')) THEN
    RAISE EXCEPTION 'retire_designer_taste: only the owner or an admin may retire a taste profile' USING ERRCODE = '42501';
  END IF;

  -- Tombstone the profile (create the shell if none exists — retirement must
  -- stick even for a designer who never taught).
  INSERT INTO designer_taste_profiles (designer_id, reliability, sources, retired_at)
  VALUES (p_designer_id, 0, '{}'::jsonb, now())
  ON CONFLICT (designer_id) DO UPDATE
    SET retired_at = now(),
        taste_vector = NULL,
        portfolio_centroid = NULL,
        theta = NULL,
        warmth = NULL, complexity = NULL, formality = NULL,
        timelessness = NULL, boldness = NULL, craftsmanship = NULL,
        confidence_map = '{}'::jsonb,
        deviation_from_house = '{}'::jsonb,
        reliability = 0,
        drift_flag = false;

  -- Tombstone snapshot payloads; keep the version rows (append-only audit).
  UPDATE designer_taste_snapshots
     SET taste_vector = NULL, theta = NULL
   WHERE designer_id = p_designer_id;

  -- Hard deletes per contract terms (§12.5). Probes first (FK on judgments,
  -- though the CASCADE would also clear them).
  DELETE FROM taste_probe_queue WHERE designer_id = p_designer_id;
  DELETE FROM taste_judgments WHERE designer_id = p_designer_id;
  DELETE FROM taste_corrections WHERE designer_id = p_designer_id;

  -- Derived state goes with the learned state it was derived from.
  DELETE FROM signature_biases WHERE designer_id = p_designer_id;
  DELETE FROM designer_style_confidence WHERE designer_id = p_designer_id;
END;
$$;

COMMENT ON FUNCTION retire_designer_taste(uuid) IS
  'Departure guardrail (design §12.5): tombstones the taste profile + snapshot payloads, hard-deletes judgments/corrections per contract terms, removes derived biases/confidence, and excludes the designer from future house recomputes via retired_at.';

-- ─── 21. RPC: compute_house_taste_draft (§9.1 Phase-2 consensus) ────────────
-- Consensus lands as a DRAFT row; activation is human (activate_house_taste).
-- Eligibility: unretired, ρ_D ≥ 0.3, ≥ 50 judgments, fitted θ + vector.
-- Weights: reliability-proportional, 10% trimmed element-wise mean over θ,
-- any single designer's normalized weight capped at 0.35 (no-runaway-capture
-- guardrail). With ZERO eligible designers this no-ops gracefully (NOTICE +
-- NULL) — which is every call until Phase 2's judgment histories exist.
--
-- v1 simplification (flagged in the delivery log): §9.1 words the consensus
-- per archetype g with weights ρ_D·c_D(g). Until designer_style_confidence
-- has real writers (Wave 4A nightly), this computes ONE global consensus
-- weighted by ρ_D — the per-archetype weighting refines here in Wave 4.
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
     AND taste_vector IS NOT NULL;

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

COMMENT ON FUNCTION compute_house_taste_draft() IS
  'Phase-2 house consensus (design §9.1): 10%-trimmed reliability-weighted mean of eligible designers'' θ/vector/spectrums, 0.35 per-designer cap, landing as a DRAFT house_taste row (activation is human). Gracefully no-ops (NOTICE + NULL) with zero eligible designers. v1 uses a global ρ_D weighting; per-archetype c_D(g) refines in Wave 4.';

-- ─── 22. RPC: activate_house_taste (§9.1 curation ops) ──────────────────────
-- Lead-gated. Applies the TARGET row's curated_overrides to its six spectrum
-- coordinates, then retires the current active row and activates the target
-- (rollback = activate a prior retired version). Curation ops:
--   PIN(dim, value)  — freeze the coordinate at value
--   NUDGE(dim, δ)    — shift the computed coordinate by δ, clamped to [−1,1]
--   PROTECT(dim)     — keep the CURRENTLY ACTIVE coordinate (a recompute
--                      cannot move a protected dial without the lead
--                      re-approving that coordinate)
CREATE OR REPLACE FUNCTION activate_house_taste(p_version int)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_target house_taste;
  v_active house_taste;
  v_dim text;
  v_op text;
  v_val real;
  v_coords jsonb;
BEGIN
  IF v_caller IS NOT NULL AND NOT is_aesthete_lead(v_caller) THEN
    RAISE EXCEPTION 'activate_house_taste: lead role required (see 00242 header)' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_target FROM house_taste WHERE version = p_version FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'activate_house_taste: no house_taste row at version %', p_version;
  END IF;
  IF v_target.status = 'active' THEN
    RAISE NOTICE 'activate_house_taste: version % is already active', p_version;
    RETURN;
  END IF;

  SELECT * INTO v_active FROM house_taste WHERE status = 'active' FOR UPDATE;

  v_coords := jsonb_build_object(
    'warmth', v_target.warmth, 'complexity', v_target.complexity,
    'formality', v_target.formality, 'timelessness', v_target.timelessness,
    'boldness', v_target.boldness, 'craftsmanship', v_target.craftsmanship);

  FOR v_dim IN SELECT jsonb_object_keys(COALESCE(v_target.curated_overrides, '{}'::jsonb)) LOOP
    IF v_dim NOT IN ('warmth', 'complexity', 'formality', 'timelessness', 'boldness', 'craftsmanship') THEN
      RAISE NOTICE 'activate_house_taste: override on "%" ignored — PIN/NUDGE/PROTECT apply to spectrum coordinates (§9.1)', v_dim;
      CONTINUE;
    END IF;

    v_op := lower(v_target.curated_overrides->v_dim->>'op');
    IF v_op = 'pin' THEN
      v_val := (v_target.curated_overrides->v_dim->>'value')::real;
    ELSIF v_op = 'nudge' THEN
      v_val := GREATEST(-1.0, LEAST(1.0,
        COALESCE((v_coords->>v_dim)::real, 0)
        + COALESCE((v_target.curated_overrides->v_dim->>'delta')::real, 0)));
    ELSIF v_op = 'protect' THEN
      IF v_active.id IS NULL THEN
        CONTINUE;  -- nothing active to protect against
      END IF;
      v_val := CASE v_dim
        WHEN 'warmth'        THEN v_active.warmth
        WHEN 'complexity'    THEN v_active.complexity
        WHEN 'formality'     THEN v_active.formality
        WHEN 'timelessness'  THEN v_active.timelessness
        WHEN 'boldness'      THEN v_active.boldness
        WHEN 'craftsmanship' THEN v_active.craftsmanship
      END;
    ELSE
      RAISE EXCEPTION 'activate_house_taste: unknown curation op "%" on "%" (want pin|nudge|protect)', COALESCE(v_op, '<null>'), v_dim;
    END IF;

    v_coords := jsonb_set(v_coords, ARRAY[v_dim], COALESCE(to_jsonb(v_val), 'null'::jsonb));
  END LOOP;

  -- Retire the incumbent first (ux_house_active allows exactly one).
  IF v_active.id IS NOT NULL AND v_active.id <> v_target.id THEN
    UPDATE house_taste SET status = 'retired' WHERE id = v_active.id;
  END IF;

  UPDATE house_taste
     SET status        = 'active',
         curated_by    = COALESCE(v_caller, curated_by),
         warmth        = (v_coords->>'warmth')::real,
         complexity    = (v_coords->>'complexity')::real,
         formality     = (v_coords->>'formality')::real,
         timelessness  = (v_coords->>'timelessness')::real,
         boldness      = (v_coords->>'boldness')::real,
         craftsmanship = (v_coords->>'craftsmanship')::real
   WHERE id = v_target.id;
END;
$$;

COMMENT ON FUNCTION activate_house_taste(int) IS
  'Lead-gated house activation (design §9.1): applies the target version''s curated_overrides (PIN/NUDGE/PROTECT on spectrum coordinates), retires the current active row, activates the target. Rollback = activate a prior retired version.';

-- ─── 23. refresh_style_centroids() — nightly phase-4 helper (§4.3) ──────────
-- Per-archetype centroid of designer-confirmed catalog vectors. Scope
-- decisions (documented, flagged):
--   • product_styles.source IN ('manual','validated') — both are
--     designer-written (§5.2); ml_predicted never counts.
--   • catalog layer + published only — centroids seed ANON client vectors
--     (§7.2); personal/studio vectors must not leak into a public aggregate.
--   • Archetypes with no qualifying vectors are skipped (full-refresh
--     delete-and-insert).
CREATE OR REPLACE FUNCTION refresh_style_centroids()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_n int;
BEGIN
  DELETE FROM style_centroids;

  INSERT INTO style_centroids (style_id, centroid, n_products, computed_at)
  SELECT s.id,
         vec_normalize(sum(vec_normalize(p.aesthete_vector))),
         count(*)::int,
         now()
    FROM styles s
    JOIN product_styles ps ON ps.style_id = s.id
                          AND ps.source IN ('manual', 'validated')
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

COMMENT ON FUNCTION refresh_style_centroids() IS
  'Full recompute of style_centroids (design §4.3/§12.2 nightly phase 4): per-archetype normalized centroid of designer-confirmed (manual/validated), published, catalog-layer aesthete_vectors. Skips archetypes with no vectors. Returns the number of centroids written.';

-- ─── 24. Grants (§18) ────────────────────────────────────────────────────────
-- Designer-facing RPCs: authenticated only (bodies gate further). The house
-- pair also grants service_role for the Wave-4 nightly. Centroids are
-- job-only.
REVOKE ALL ON FUNCTION submit_taste_judgment(jsonb, text, text, uuid, int) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION submit_taste_correction(text, uuid, uuid, uuid, jsonb, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION update_my_biases(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION export_designer_taste(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION retire_designer_taste(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION compute_house_taste_draft() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION activate_house_taste(int) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION refresh_style_centroids() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION is_aesthete_lead(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION submit_taste_judgment(jsonb, text, text, uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION submit_taste_correction(text, uuid, uuid, uuid, jsonb, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION update_my_biases(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION export_designer_taste(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION retire_designer_taste(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION compute_house_taste_draft() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION activate_house_taste(int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION refresh_style_centroids() TO service_role;
GRANT EXECUTE ON FUNCTION is_aesthete_lead(uuid) TO authenticated;

-- ─── 25. Dev seed: provisional ACTIVE house v1 ──────────────────────────────
-- ⚠ PROVISIONAL: a neutral, clearly-flagged active house so Wave-2A's match
-- RPC can read an active house from day one. taste_vector = normalized
-- all-ones (uniform direction — no aesthetic opinion), spectrums mid (0),
-- theta NULL. Replaced by the House Hundred curation (Wave 5 human task,
-- design §9.1) via compute/curate → activate_house_taste, which retires this
-- row. Idempotent: skipped when any active house already exists.
INSERT INTO house_taste
  (version, taste_vector, theta,
   warmth, complexity, formality, timelessness, boldness, craftsmanship,
   status, curated_by, notes, computed_from)
SELECT
  1,
  vec_normalize(array_fill(1.0::real, ARRAY[768])::vector),
  NULL,
  0, 0, 0, 0, 0, 0,
  'active',
  NULL,
  'provisional dev seed — replaced by House Hundred curation (Wave 5 human task; design §9.1)',
  '{"seed": "provisional"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM house_taste WHERE status = 'active');
