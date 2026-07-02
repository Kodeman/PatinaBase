-- ═══════════════════════════════════════════════════════════════════════════
-- Aesthete Engine local-dev demo seed (Wave 2A)
--
-- Runs AFTER supabase/seed/products.sql: gives the 12 seed products
-- spectrums (8 canonical + 4 draft-only) + product_dna, and adds 2 extra
-- published demo products, so the anon quiz → top-10-with-whys walk is real
-- on a fresh `supabase db reset`. The body lives in
-- public.aesthete_dev_demo_seed() (migration 00244 §9) — guarded on the dev
-- seed sentinel product, idempotent, a no-op anywhere the dev catalog is
-- absent.
--
-- ⚠ This file must be listed in supabase/config.toml [db.seed].sql_paths
-- (ordered array, conductor single-touch) or it silently never runs.
-- ═══════════════════════════════════════════════════════════════════════════

SELECT public.aesthete_dev_demo_seed();
