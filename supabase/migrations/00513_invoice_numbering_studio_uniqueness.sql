-- ═══════════════════════════════════════════════════════════════════════════
-- 00513 — Studio-aware invoice number uniqueness
--
-- Invoice numbering is per-studio: each design studio brand owns its own
-- INV-#### sequence, minted from studio_invoice_counters (keyed by studio_id
-- alone, shared across that studio's designers) in issue_invoice_for_actor and
-- _issue_invoice_authorized_legacy_00397. Only when an invoice has no studio
-- (a project without a studio) does numbering fall back to invoice_counters,
-- keyed by designer_id.
--
-- The uniqueness index never followed. uniq_invoices_designer_number is the
-- original per-designer partial index from 00178, authored before per-studio
-- numbering arrived in 00318 and never retightened. A designer whose projects
-- span two studios draws INV-0001 from each studio's independent counter and
-- collides under the per-designer index — even though per-studio numbering is
-- behaving exactly as designed. A multi-studio designer is a supported product
-- scenario, so this is a real, reachable numbering defect (surfaced by the
-- 00511 trade-draw access-control suite: designer 001 owns studio
-- d4851000-…-001 and is also the lead of a studio d4851000-…-002 trade project).
--
-- Fix: replace the legacy per-designer index with two partial unique indexes
-- that mirror the dual-counter namespaces exactly —
--   * studio-bound invoices are unique per (studio_id, invoice_number);
--   * studio-less invoices remain unique per (designer_id, invoice_number).
--
-- Safety on existing data: prod holds 20 numbered invoices, all studio-bound in
-- a single studio, contiguous INV-0001..0020, no duplicates, and zero
-- studio-less numbered rows. Every existing row therefore satisfies both new
-- partial indexes, so the swap builds cleanly on the live table. No other
-- invoice invariant is touched. The migration is idempotent.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- Studio-bound invoices (the normal path: set_invoice_studio_id always derives
-- a studio_id from the project, so this covers every real invoice). One
-- INV-#### sequence per studio, shared across that studio's designers — exactly
-- what studio_invoice_counters mints.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_invoices_studio_number
  ON public.invoices (studio_id, invoice_number)
  WHERE studio_id IS NOT NULL AND invoice_number IS NOT NULL;

-- Studio-less fallback (a project without a studio): one INV-#### sequence per
-- designer, matching invoice_counters. Currently unreachable in practice but
-- preserved so the fallback path keeps its uniqueness guarantee.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_invoices_designer_number_studioless
  ON public.invoices (designer_id, invoice_number)
  WHERE studio_id IS NULL AND invoice_number IS NOT NULL;

-- Retire the legacy per-designer index (00178) that predates per-studio
-- numbering. Dropped only after the replacements exist, so the table is never
-- left without number-uniqueness coverage mid-transaction.
DROP INDEX IF EXISTS public.uniq_invoices_designer_number;

DO $postcondition$
BEGIN
  IF to_regclass('public.uniq_invoices_studio_number') IS NULL
     OR to_regclass('public.uniq_invoices_designer_number_studioless') IS NULL
  THEN
    RAISE EXCEPTION
      '00513 studio-aware invoice uniqueness indexes are missing';
  END IF;
  IF to_regclass('public.uniq_invoices_designer_number') IS NOT NULL THEN
    RAISE EXCEPTION
      '00513 legacy per-designer invoice number index was not retired';
  END IF;
END
$postcondition$;

COMMIT;
