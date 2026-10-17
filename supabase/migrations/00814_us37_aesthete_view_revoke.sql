-- ═══════════════════════════════════════════════════════════════════════════
-- 00814 — Revoke public-role access to owner-rights Aesthete input views
-- Finding: SQ-1219 (confirmed read-only on Strata 2026-10-17). These views
-- bypass products RLS and expose personal/studio library data and catalog
-- commission rates. No application consumer reads them.
-- Rollback: GRANT SELECT ON public.v_aesthete_personal_input,
--   public.v_aesthete_studio_input, public.v_aesthete_catalog_input
--   TO anon, authenticated;
-- ═══════════════════════════════════════════════════════════════════════════
REVOKE ALL ON public.v_aesthete_personal_input,
              public.v_aesthete_studio_input,
              public.v_aesthete_catalog_input
  FROM anon, authenticated;
