-- ════════════════════════════════════════════════════════════════════════════
-- Aesthete Engine — demo seed  (SKELETON — Wave 0A; real data lands Wave 3D)
--
-- Populates the local stack with the demo dataset the Aesthete Engine walks
-- and eval suites run against: a curated catalog slice with DNA + spectrums,
-- clearly-flagged synthetic judgments, and one designer portfolio — so that
-- `scripts/aesthete-gate.sh walk` and `scripts/aesthete-eval/` (§14) have
-- deterministic ground to stand on. Design contract:
-- docs/prds/AE/aesthete-engine-system-design.md (§5, §14).
--
-- Naming follows the repo's demo-seed convention (cf.
-- scripts/the-document-track5-demo-coordination.sql): fixed UUIDs +
-- ON CONFLICT / guarded UPDATEs — idempotent, safe to re-run. Run after
-- `supabase db reset` (which applies migrations 00236+):
--
--   docker exec -i supabase_db_supabase psql -U postgres -d postgres \
--     < scripts/aesthete-demo-seed.sql
--
-- All synthetic rows are tagged so learning loops and audits can exclude
-- them; synthetic judgments are demo theater, never training truth.
-- ════════════════════════════════════════════════════════════════════════════

begin;

DO $$
BEGIN
  RAISE NOTICE 'aesthete-demo-seed: skeleton only — sections below are stubs; real data lands in Wave 3D.';
END $$;

-- ── 1. Products (curated demo catalog slice, ~300–500) ── Wave 3D ───────────
-- Fixed-UUID catalog-layer products spanning archetypes, categories, and
-- budget tiers (so persona hard filters + the budget bell have range).
-- INSERT INTO products (...) VALUES (...) ON CONFLICT (id) DO NOTHING;

-- ── 2. DNA drafts (product_dna_drafts, §5.2) ── Wave 3D ─────────────────────
-- Draft rows as if aesthete-dna-draft produced them (confidence spread across
-- the triage bands) so the teaching-prefill walk has material.
-- INSERT INTO product_dna_drafts (...) ON CONFLICT DO NOTHING;

-- ── 3. Validated spectrums (product_dna, §5.2) ── Wave 3D ───────────────────
-- A validated subset (≥ the walk's needs) carrying six-spectrum values +
-- archetypes; vectors arrive via the embed pipeline (Wave 2B), not this file.
-- INSERT INTO product_dna (...) ON CONFLICT (product_id) DO UPDATE ...;

-- ── 4. Judgments (taste_judgments, §5.4 — SYNTHETIC, clearly flagged) ── 3D ──
-- Synthetic side-by-side judgments for the demo designer, tagged synthetic so
-- nightly refits/audits can exclude them (learning bars are proven on
-- synthetic separately; see delivery-plan human-in-the-loop table).
-- INSERT INTO taste_judgments (...) ON CONFLICT DO NOTHING;

-- ── 5. Designer portfolio (portfolio ingestion seed, §8/§9) ── Wave 3D ──────
-- One seeded designer portfolio (images → embed → geometric median) so the
-- dial's designer stop differs visibly from house (§14.7 criterion v).
-- INSERT INTO ... ON CONFLICT DO NOTHING;

DO $$
BEGIN
  RAISE NOTICE 'aesthete-demo-seed: no rows written (skeleton). Rolling back.';
END $$;

-- Wave 3D: flip to COMMIT once sections are populated.
rollback;
