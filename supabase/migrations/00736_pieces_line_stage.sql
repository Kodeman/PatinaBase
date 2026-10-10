-- ═══════════════════════════════════════════════════════════════════════════
-- 00736 — The derived stage of a line (US-21 slice 1, W2; T-16, SQ-622)
-- ═══════════════════════════════════════════════════════════════════════════
-- CONTRACT §2 "00736 in full" and §3.3 (artifacts/pieces-building-room-
-- 2026-10-08/build/CONTRACT.md); direction.md D1 rows 6–9 and the labor rule.
-- New functions only; no CREATE OR REPLACE base, no table change.
--
-- ── WHAT THIS ADDS ──────────────────────────────────────────────────────────
-- public.ffe_line_authorization(p project_ffe_items) RETURNS text
--   PostgREST computed field for the TS mirror (LineStageInput
--   .authorizationState). Wraps ffe_line_authorization_state(p.id) (00705:79):
--   'executed', 'client_signed', 'sent' or NULL.
--
--   SECURITY DEFINER, deliberately. ffe_line_authorization_state is closed to
--   authenticated (00705:101-102; asserted service-side only by
--   tests/procurement/phase2_ack_drafts_quotes_exceptions_test.sql case K2),
--   so an invoker wrapper could not run under a studio session. The definer
--   wrapper never trusts the row it is handed: it re-reads the line by p.id
--   and answers only when the caller can buy for that line's project
--   (can_buy_for_project, 00702:60), or when there is no end-user identity
--   (postgres / service_role; anon has no EXECUTE). A forged row for another
--   studio's line returns NULL.
--
-- public.ffe_line_stage(p project_ffe_items) RETURNS text
--   STABLE, SECURITY INVOKER SQL, usable as a PostgREST computed field. The
--   stage word before an order. First match wins:
--     NULL        status is ordered or later (ordered, production, shipped,
--                 delivered, installed): rows 1–5 stay with the TS precedence
--                 in stamp-derivation.ts.
--     released    the line sits on a sent, client-signed or executed
--                 authorization (row 6).
--     ready       a product or a maker, quantity > 0, and either a fixed client
--                 price > 0 or an allowance ceiling > 0; for a labor line, its
--                 piece's own ffe_line_stage is ready or released (row 7).
--     specced     a product, or a maker (row 8).
--     placeholder neither a product nor a maker, whatever price it carries
--                 (row 9).
--   "A maker" is vendor_id, or a non-blank vendor_name (Hollis Millwork's
--   custom cabinet). item_type 'tbd' is never ready.
--   A labor line of a released piece is itself on that authorization (00733
--   expands the release with every labor child; add_labor_line, 00732,
--   refuses a released parent), so it reads released by its own row.
--   The parent lookup recurses at most once: a labor line's parent is a goods
--   piece (00732's one-level check).
--
-- Rough $ (rough_cents, D12) never enters either function: a rough figure
-- never promotes a line (R7c, R9a).
--
-- ── GRANTS ──────────────────────────────────────────────────────────────────
-- Both: REVOKE ALL FROM PUBLIC, anon; GRANT EXECUTE TO authenticated,
-- service_role. ffe_line_authorization_state keeps its 00705 grants.
-- Adds GRANT/REVOKE → regenerate supabase/seed/00-legacy-grants.sql (the W2
-- reset owner, T-17).
--
-- Idempotent: CREATE OR REPLACE throughout.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. The authorization a line sits on ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ffe_line_authorization(p public.project_ffe_items)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT public.ffe_line_authorization_state(item.id)
  FROM public.project_ffe_items AS item
  WHERE item.id = p.id
    AND ((SELECT auth.uid()) IS NULL OR public.can_buy_for_project(item.project_id));
$$;

COMMENT ON FUNCTION public.ffe_line_authorization(public.project_ffe_items) IS
  'US-21 D1 (00736): computed field. The strongest live authorization state the line sits on '
  '(executed, client_signed, sent) or NULL, via ffe_line_authorization_state. Answers only for '
  'a caller who can buy for the line''s project.';

REVOKE ALL ON FUNCTION public.ffe_line_authorization(public.project_ffe_items) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ffe_line_authorization(public.project_ffe_items) TO authenticated, service_role;

-- ─── 2. The stage word before an order ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ffe_line_stage(p public.project_ffe_items)
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT CASE
    WHEN p.status IN ('ordered', 'production', 'shipped', 'delivered', 'installed') THEN NULL
    WHEN public.ffe_line_authorization(p) IS NOT NULL THEN 'released'
    WHEN (p.product_id IS NOT NULL OR p.vendor_id IS NOT NULL OR NULLIF(btrim(p.vendor_name), '') IS NOT NULL)
     AND p.quantity > 0
     AND ((p.item_type = 'fixed' AND p.unit_price_cents > 0)
          OR (p.item_type = 'allowance' AND p.budget_max_cents > 0))
     AND (p.line_kind IS DISTINCT FROM 'labor'
          OR (SELECT public.ffe_line_stage(parent)
              FROM public.project_ffe_items AS parent
              WHERE parent.id = p.parent_ffe_item_id) IN ('ready', 'released'))
    THEN 'ready'
    WHEN p.product_id IS NOT NULL OR p.vendor_id IS NOT NULL OR NULLIF(btrim(p.vendor_name), '') IS NOT NULL
    THEN 'specced'
    ELSE 'placeholder'
  END;
$$;

COMMENT ON FUNCTION public.ffe_line_stage(public.project_ffe_items) IS
  'US-21 D1 (00736): computed field. placeholder | specced | ready | released before an order; '
  'NULL from ordered on (the goods words). A labor line is ready only when its piece is ready '
  'or released. Rough $ never counts.';

REVOKE ALL ON FUNCTION public.ffe_line_stage(public.project_ffe_items) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ffe_line_stage(public.project_ffe_items) TO authenticated, service_role;
