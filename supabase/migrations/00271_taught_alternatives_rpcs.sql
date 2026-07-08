-- ═══════════════════════════════════════════════════════════════════════════
-- 00271 — Designer-Taught Intelligence RPCs  (Schedule & Boards Wave 3 · Track A)
--
-- Three functions that turn a rejected line into a taught next step:
--
--   find_taught_alternatives(product, n)  — corpus-first similar products.
--       SECURITY INVOKER: the products RLS the caller already lives under scopes
--       the search to her own personal library + her studio's shelf + the shared
--       catalog — so the layer boost below yields *her* taught corpus first, the
--       network catalog second, with no cross-tenant leak and no service_role.
--       Reused by A1 (line Alternatives) and B6 (board "more like this" rail).
--
--   swap_line_to_product(line, product, feedback, rank) — the accept-swap act.
--       SECURITY INVOKER: relies on products RLS (you can only swap to a product
--       you can see) and proposal_items RLS for the write, with an explicit
--       owning-designer guard (the proposal_items policy is deliberately broad —
--       designer OR client — so we close it here). Delegates the thread writes to
--       the Wave-2 DEFINER RPCs (reply / resolve), and logs the accepted signal.
--
--   escalate_item_feedback_to_decision(feedback, decision) — the C4 back-link.
--       SECURITY DEFINER: item_feedback has no UPDATE policy and its event thread
--       is DEFINER-owned (00267), so setting decision_id + writing the 'replied'
--       event must run elevated, behind an internal owning-designer guard.
--
-- Every function: REVOKE ALL FROM PUBLIC, anon (the stack grants anon EXECUTE at
-- creation — I51) + explicit grants. Additive only (D7).
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- find_taught_alternatives — corpus-first product-to-product similarity.
--
-- Returns products similar to p_product_id by pgvector cosine similarity,
-- ordered by that similarity PLUS a layer boost so the designer's own taught
-- corpus (personal, then studio) outranks the catalog at comparable relevance.
-- similarity is returned RAW (0..1); the boost lives only in the sort key, so a
-- caller can re-rank on top (e.g. the A1 keyword filter) without unwinding it.
-- Empty when the source has no embedding — the caller degrades silently.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.find_taught_alternatives(
  p_product_id  uuid,
  p_match_count int DEFAULT 8
)
RETURNS TABLE (
  id            uuid,
  name          text,
  images        text[],
  price_retail  int,
  brand         text,
  source_url    text,
  layer         text,
  category      text,
  style_tags    text[],
  materials     text[],
  similarity    float
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH src AS (
    SELECT embedding FROM public.products WHERE id = p_product_id
  )
  SELECT
    p.id, p.name, p.images, p.price_retail, p.brand,
    p.source_url, p.layer, p.category, p.style_tags, p.materials,
    1 - (p.embedding <=> (SELECT embedding FROM src)) AS similarity
  FROM public.products p
  WHERE (SELECT embedding FROM src) IS NOT NULL
    AND p.embedding IS NOT NULL
    AND p.id <> p_product_id
    AND p.deleted_at IS NULL
    AND p.merged_into_id IS NULL
    AND 1 - (p.embedding <=> (SELECT embedding FROM src)) > 0.2
  ORDER BY
    (1 - (p.embedding <=> (SELECT embedding FROM src)))
      + CASE p.layer WHEN 'personal' THEN 0.15 WHEN 'studio' THEN 0.10 ELSE 0 END
    DESC
  LIMIT GREATEST(p_match_count, 0);
$$;

COMMENT ON FUNCTION public.find_taught_alternatives(uuid, int) IS
  'Corpus-first similar-product search for Designer-Taught Intelligence (A1/B6). '
  'SECURITY INVOKER — the caller''s products RLS scopes the corpus; the layer '
  'boost (personal +0.15, studio +0.10) surfaces her taught library ahead of the '
  'catalog at comparable relevance. Returns raw similarity for caller-side re-rank.';

REVOKE ALL ON FUNCTION public.find_taught_alternatives(uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_taught_alternatives(uuid, int) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- swap_line_to_product — accept a taught alternative by swapping the line to it.
--
-- Updates the proposal line to the chosen product (name / image / product_id /
-- prices, keeping product_id and vendor coherent), PRESERVING the line context
-- (quantity, room, doc_code, position, notes, custom fields). Then resolves the
-- rejection with a reply event noting the swap, and logs the accepted signal.
-- All one transaction — the line change and the flag resolution never diverge.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.swap_line_to_product(
  p_proposal_item_id uuid,
  p_product_id       uuid,
  p_feedback_id      uuid,
  p_rank             int DEFAULT NULL
)
RETURNS public.proposal_items
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_designer_id uuid;
  v_qty         int;
  v_product     public.products;
  v_vendor_name text;
  v_fb          public.item_feedback;
  v_unit_trade  int;
  v_unit_sell   int;
  v_item        public.proposal_items;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING errcode = 'insufficient_privilege';
  END IF;

  -- The line + its proposal's designer. RLS already gates the read; the explicit
  -- designer check closes the deliberately-broad proposal_items policy (which
  -- also admits the client) so only the owning designer may swap.
  SELECT pr.designer_id, pi.quantity
    INTO v_designer_id, v_qty
    FROM public.proposal_items pi
    JOIN public.proposals pr ON pr.id = pi.proposal_id
   WHERE pi.id = p_proposal_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'line % not found', p_proposal_item_id USING errcode = 'no_data_found';
  END IF;
  IF auth.uid() <> v_designer_id THEN
    RAISE EXCEPTION 'only the owning designer may swap a line' USING errcode = 'insufficient_privilege';
  END IF;

  -- The chosen product. RLS-gated read: you can only swap to a product you can
  -- see (own personal / your studio / catalog).
  SELECT * INTO v_product FROM public.products WHERE id = p_product_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'product % not found or not accessible', p_product_id USING errcode = 'no_data_found';
  END IF;

  -- The flag being answered must belong to this very line.
  SELECT * INTO v_fb FROM public.item_feedback WHERE id = p_feedback_id;
  IF NOT FOUND OR v_fb.proposal_item_id IS DISTINCT FROM p_proposal_item_id THEN
    RAISE EXCEPTION 'feedback % does not anchor line %', p_feedback_id, p_proposal_item_id
      USING errcode = 'no_data_found';
  END IF;

  v_unit_trade := COALESCE(v_product.price_trade, v_product.price_retail, 0);
  v_unit_sell  := COALESCE(v_product.price_retail, v_product.price_trade, 0);

  SELECT name INTO v_vendor_name FROM public.vendors WHERE id = v_product.vendor_id;

  UPDATE public.proposal_items
     SET product_id       = v_product.id,
         name             = v_product.name,
         image_url        = v_product.images[1],
         unit_price       = v_unit_trade,
         unit_sell_price  = v_unit_sell,
         line_total_cents = v_qty * v_unit_sell,
         markup_percent   = CASE WHEN v_unit_trade > 0
                                 THEN round((v_unit_sell - v_unit_trade)::numeric / v_unit_trade * 100, 2)
                                 ELSE markup_percent END,
         vendor_id        = v_product.vendor_id,
         vendor_name      = v_vendor_name,
         updated_at       = now()
   WHERE id = p_proposal_item_id
   RETURNING * INTO v_item;

  -- Answer the rejection: a reply that names the swap, then resolve it. These are
  -- the Wave-2 DEFINER RPCs; they re-verify designer ownership and own the thread.
  PERFORM public.reply_to_item_feedback(p_feedback_id, 'Swapped this line to ' || v_product.name || '.');
  PERFORM public.resolve_item_feedback(p_feedback_id);

  -- The accepted training signal (designer-own; RLS pins designer_id).
  INSERT INTO public.suggestion_events (context, action, product_id, feedback_id, rank)
  VALUES ('line_alternatives', 'accepted', p_product_id, p_feedback_id, p_rank);

  RETURN v_item;
END;
$$;

COMMENT ON FUNCTION public.swap_line_to_product(uuid, uuid, uuid, int) IS
  'Accept a taught alternative by swapping a proposal line to the chosen product '
  '(A1). Copies product identity + prices, preserves qty/room/doc_code/position, '
  'resolves the rejection with a swap reply, and logs the accepted signal — one '
  'transaction. SECURITY INVOKER behind an owning-designer guard.';

REVOKE ALL ON FUNCTION public.swap_line_to_product(uuid, uuid, uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.swap_line_to_product(uuid, uuid, uuid, int) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- escalate_item_feedback_to_decision — the C4 back-link.
--
-- Written after the designer composes a client Decision from a flagged line:
-- stamps item_feedback.decision_id and threads a 'replied' event noting the
-- escalation. The flag itself stays OPEN — the Decision is the instrument that
-- answers it; resolving happens when the client responds. DEFINER (item_feedback
-- has no UPDATE policy; the thread is DEFINER-owned), guarded to the owning
-- designer of BOTH the flag and the decision.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.escalate_item_feedback_to_decision(
  p_feedback_id uuid,
  p_decision_id uuid
)
RETURNS public.item_feedback
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_fb           public.item_feedback;
  v_gate         RECORD;
  v_owns_decision boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING errcode = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_fb FROM public.item_feedback WHERE id = p_feedback_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'feedback % not found', p_feedback_id USING errcode = 'no_data_found';
  END IF;

  SELECT * INTO v_gate
    FROM public.item_feedback_gate(v_fb.proposal_item_id, v_fb.ffe_item_id, v_fb.board_item_id);
  IF auth.uid() <> v_gate.designer_id THEN
    RAISE EXCEPTION 'only the owning designer may escalate' USING errcode = 'insufficient_privilege';
  END IF;

  -- The decision must belong to the same designer (guards against linking an
  -- arbitrary decision id through the DEFINER context).
  SELECT EXISTS (
    SELECT 1
      FROM public.client_decisions d
      JOIN public.designer_clients dc ON dc.id = d.designer_client_id
     WHERE d.id = p_decision_id
       AND dc.designer_id = auth.uid()
  ) INTO v_owns_decision;
  IF NOT v_owns_decision THEN
    RAISE EXCEPTION 'decision % not found or not owned', p_decision_id USING errcode = 'no_data_found';
  END IF;

  UPDATE public.item_feedback
     SET decision_id = p_decision_id, updated_at = now()
   WHERE id = p_feedback_id
   RETURNING * INTO v_fb;

  INSERT INTO public.item_feedback_events (feedback_id, actor, kind, body)
  VALUES (p_feedback_id, auth.uid(), 'replied', 'Put to the client as a Decision.');

  RETURN v_fb;
END;
$$;

COMMENT ON FUNCTION public.escalate_item_feedback_to_decision(uuid, uuid) IS
  'C4 back-link: stamp item_feedback.decision_id and thread a replied event when a '
  'flagged line is escalated to a client Decision. The flag stays open. DEFINER, '
  'guarded to the owning designer of both the flag and the decision.';

REVOKE ALL ON FUNCTION public.escalate_item_feedback_to_decision(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.escalate_item_feedback_to_decision(uuid, uuid) TO authenticated;
