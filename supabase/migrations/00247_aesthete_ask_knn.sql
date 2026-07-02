-- ═══════════════════════════════════════════════════════════════════════════
-- 00247 — aesthete_ask_knn: the ask path's vector candidate entry (Wave 3C)
-- ═══════════════════════════════════════════════════════════════════════════
-- Design §3.2 #14 / §10.2 Stage 1: when a designer asks the Engine (⌘K /
-- librarian bar), the aesthete-ask edge fn embeds the ask text (kind=query,
-- 1.5 s budget) and unions a direct kNN over products.aesthete_vector with
-- aesthete_search() FTS candidates, then blends ranks in the fn.
--
-- This is the vector twin of aesthete_search (00244) and follows its seam
-- contract EXACTLY:
--   • candidate generation ONLY — (product_id, rank, match_source); nothing
--     downstream may depend on kNN internals.
--   • SECURITY INVOKER on purpose: products RLS (00152 three-layer law) keeps
--     it layer-aware transitively — a designer sees personal + studio +
--     catalog, another studio's shelves stay invisible. The 00008 DEFINER
--     similarity RPCs predate the layer law and are NOT layer-safe; the ask
--     path must never use them.
--   • grant is authenticated-only (+ service_role): the ask is a designer
--     surface (R31/R38); anon has no shelves to ask.
--
-- p_filters: {"category": text, "layer": text, "limit": int ≤ 200} — same
-- envelope as aesthete_search.
--
-- rank = cosine similarity (1 − cosine distance) ∈ [−1, 1] (unit vectors from
-- the worker ⇒ effectively [0, 1]). The caller blends by RANK POSITION (RRF),
-- not raw magnitude, so FTS ts_rank and cosine never need a shared scale.
--
-- NOTE (Wave 3C deviation, flagged in handoff): this number was not
-- pre-reserved on main — conductor re-checks numbering at the barrier
-- (delivery-plan contention rule 1).

CREATE OR REPLACE FUNCTION aesthete_ask_knn(p_embedding vector(768), p_filters jsonb DEFAULT '{}')
RETURNS TABLE (product_id uuid, rank real, match_source text)
LANGUAGE plpgsql STABLE
SET search_path = public
AS $fn$
DECLARE
  v_limit int := LEAST(GREATEST(COALESCE((p_filters->>'limit')::int, 50), 1), 200);
  v_category text := NULLIF(p_filters->>'category', '');
  v_layer text := NULLIF(p_filters->>'layer', '');
BEGIN
  IF p_embedding IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT p.id, (1 - (p.aesthete_vector <=> p_embedding))::real, 'vector'::text
    FROM products p
   WHERE p.aesthete_vector IS NOT NULL
     AND p.deleted_at IS NULL AND p.merged_into_id IS NULL
     AND (v_category IS NULL OR p.category = v_category)
     AND (v_layer IS NULL OR p.layer = v_layer)
   ORDER BY p.aesthete_vector <=> p_embedding, p.id
   LIMIT v_limit;
END $fn$;

COMMENT ON FUNCTION aesthete_ask_knn(vector, jsonb) IS
  'Vector candidate entry for the ask path (design §3.2 #14/§10.2 Stage 1): kNN over products.aesthete_vector for a query embedding. SECURITY INVOKER — products RLS enforces the three-layer law transitively (mirror of aesthete_search, 00244). Returns candidate ids + cosine similarity only; the aesthete-ask edge fn blends with FTS by rank (RRF). Takes NO free text — ask text never reaches the database (R31/R38).';

REVOKE ALL ON FUNCTION aesthete_ask_knn(vector, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION aesthete_ask_knn(vector, jsonb) TO authenticated, service_role;
