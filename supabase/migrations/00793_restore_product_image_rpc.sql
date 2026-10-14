-- ═══════════════════════════════════════════════════════════════════════════
-- 00793 — restore_product_image: folio Undo puts one image back into the
--         CURRENT server list (US-34 N15 repair, SQ-1004 / SQ-1001 #2)
--
-- The folio's Undo wrote the whole images array it had cached. An image a
-- collaborator added after the remove, not yet seen by this browser, was
-- overwritten by that write. This RPC inserts only the removed image into
-- products.images as the row holds it at the moment of the write: one UPDATE,
-- so a concurrent change to the row is re-read under its row lock and kept.
--
-- p_index is the image's 0-based index when it was removed. It goes back at
-- that index, or at the end when the list is now shorter. An image already in
-- the list leaves it unchanged, so a repeated Undo never duplicates it.
--
-- Returns the row's images after the write, or NULL when no row was written:
-- an unknown id, a null image, or a row the caller's RLS does not let it
-- update and read back. The client treats NULL as a failure (triage R6).
--
-- SECURITY INVOKER: the products UPDATE and SELECT policies decide, exactly as
-- the folio's own PostgREST update().select() does. Grants: authenticated only.
-- Test: supabase/tests/library/restore_product_image_test.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION public.restore_product_image(
  p_product_id uuid,
  p_src text,
  p_index integer
)
RETURNS text[]
LANGUAGE sql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
  UPDATE public.products AS p
     SET images = CASE
           WHEN p_src = ANY (coalesce(p.images, '{}'::text[])) THEN p.images
           ELSE (coalesce(p.images, '{}'::text[]))[1:greatest(p_index, 0)]
                || p_src
                || (coalesce(p.images, '{}'::text[]))[greatest(p_index, 0) + 1:]
         END
   WHERE p.id = p_product_id
     AND p_src IS NOT NULL
  RETURNING p.images;
$$;

COMMENT ON FUNCTION public.restore_product_image(uuid, text, integer) IS
  'Folio Undo (00793, US-34 N15): puts one removed image back into the product''s CURRENT images '
  'at its old 0-based index (or the end), unless it is already there. Returns the images written, '
  'or NULL when no row was written. SECURITY INVOKER: the products RLS policies decide.';

REVOKE ALL ON FUNCTION public.restore_product_image(uuid, text, integer) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.restore_product_image(uuid, text, integer) TO authenticated;

COMMIT;
