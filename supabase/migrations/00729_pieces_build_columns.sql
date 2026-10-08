-- ═══════════════════════════════════════════════════════════════════════════
-- 00729 — The Build room's columns (US-21 slice 1, W2; T-9, SQ-615)
-- ═══════════════════════════════════════════════════════════════════════════
-- CONTRACT §2 "00729 in full" (artifacts/pieces-building-room-2026-10-08/
-- build/CONTRACT.md). Columns and backfills only: no RPCs, no grants. The
-- writers arrive in 00730–00736 (T-10 to T-16), which also exercise these
-- columns in their SQL tests.
--
-- ── WHAT THIS ADDS ──────────────────────────────────────────────────────────
-- project_ffe_items.unit (D3)
--   How the quantity is counted: each, sq_ft, lin_ft, roll, yard, box, hour,
--   lot. NOT NULL DEFAULT 'each', so every existing line reads as today.
--
-- project_ffe_items.rough_cents (D12)
--   The internal Rough $ for a line, ≥ 0 or NULL. Clients cannot read the
--   raw table (client SELECT policy dropped 00434:11 / 00462:925; writes
--   revoked 00438:442); it stays protected by omission, so it must never be
--   added to any client RPC or payload.
--
-- project_ffe_items.line_kind (D5)
--   'goods' (default, every existing line) or 'labor'. A labor line is a
--   child of its piece (link_kind 'labor'); see the CHECK below.
--
-- project_ffe_items.link_kind (D4)
--   Why a line points at parent_ffe_item_id (00702): 'com', 'labor' or
--   'accessory'. NULL exactly when there is no parent. Every existing child
--   is a COM fabric line (link_ffe_pair, 00702:108, was the only writer), so
--   the backfill stamps them 'com'.
--
-- project_ffe_items.removed_disposition (D8)
--   The design_disposition a line held when it was removed, so a restore
--   (00731) returns it there rather than to a guess. removed_at, removed_by
--   and removal_reason already exist (00434:208-210).
--
-- project_ffe_selection_threads.need_label (D2)
--   The studio's name for the need ("Sofa, living room"), which survives a
--   product fill. The fill still overwrites the line name (00678:1378); from
--   00730 on it never touches need_label. Backfilled from the thread's
--   primary item name (primary_ffe_item_id).
--
-- ── CHECKs ──────────────────────────────────────────────────────────────────
-- Value CHECKs on unit, rough_cents, line_kind and link_kind, plus two
-- cross-column CHECKs added NOT VALID before the link_kind backfill and
-- VALIDATEd after it:
--   project_ffe_items_link_kind_iff_parent
--     (parent_ffe_item_id IS NULL) = (link_kind IS NULL)
--   project_ffe_items_labor_is_linked
--     (line_kind = 'labor') = (link_kind IS NOT DISTINCT FROM 'labor')
-- Consequence: a hard delete of a parent line now refuses, because the FK's
-- ON DELETE SET NULL (00702:91) would leave link_kind set. Nothing hard
-- deletes FF&E lines (authenticated has no DELETE; removal is archive, Q11);
-- a whole-project cascade deletes parent and child in one statement and is
-- unaffected.
--
-- ── BACKFILL WITHOUT SIDE EFFECTS ───────────────────────────────────────────
-- The link_kind backfill writes only the new column. It runs with the user
-- triggers on project_ffe_items disabled so it does not bump updated_at
-- (set_updated_at) or the thread rows (zz_set_project_ffe_thread_primary_trg).
-- updated_at feeds the spec-book snapshot (_spec_book_resolve_field
-- sourceUpdatedAt, 00714:146-256), so a bump would report a spec-book
-- revision on every issued book holding a COM line. The guards
-- (a_ffe_rpc_mutation_only_trg and the lock triggers) only police columns
-- this UPDATE does not touch. Disable, update and re-enable share one DO
-- statement, so a failure rolls all three back together. Every trigger on
-- the table is enabled ('O') before this file; ENABLE TRIGGER USER restores
-- exactly that.
--
-- ── D15: selected_media ─────────────────────────────────────────────────────
-- Checked, not missing: 00435:984-985 already grants
-- UPDATE (… selected_media …) ON public.project_ffe_specs TO authenticated,
-- and no later file revokes it. No GRANT here, so 00-legacy-grants needs no
-- regeneration for this file.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, DROP CONSTRAINT IF EXISTS before
-- each ADD, and both backfills only touch rows still NULL.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. project_ffe_items: the build columns ────────────────────────────────

ALTER TABLE public.project_ffe_items
  ADD COLUMN IF NOT EXISTS unit text NOT NULL DEFAULT 'each',
  ADD COLUMN IF NOT EXISTS rough_cents integer,
  ADD COLUMN IF NOT EXISTS line_kind text NOT NULL DEFAULT 'goods',
  ADD COLUMN IF NOT EXISTS link_kind text,
  ADD COLUMN IF NOT EXISTS removed_disposition text;

ALTER TABLE public.project_ffe_items
  DROP CONSTRAINT IF EXISTS project_ffe_items_unit_check,
  ADD CONSTRAINT project_ffe_items_unit_check CHECK (
    unit IN ('each', 'sq_ft', 'lin_ft', 'roll', 'yard', 'box', 'hour', 'lot')
  ),
  DROP CONSTRAINT IF EXISTS project_ffe_items_rough_cents_check,
  ADD CONSTRAINT project_ffe_items_rough_cents_check CHECK (
    rough_cents IS NULL OR rough_cents >= 0
  ),
  DROP CONSTRAINT IF EXISTS project_ffe_items_line_kind_check,
  ADD CONSTRAINT project_ffe_items_line_kind_check CHECK (
    line_kind IN ('goods', 'labor')
  ),
  DROP CONSTRAINT IF EXISTS project_ffe_items_link_kind_check,
  ADD CONSTRAINT project_ffe_items_link_kind_check CHECK (
    link_kind IS NULL OR link_kind IN ('com', 'labor', 'accessory')
  );

-- Cross-column CHECKs: NOT VALID now, VALIDATE after the backfill (§3).
ALTER TABLE public.project_ffe_items
  DROP CONSTRAINT IF EXISTS project_ffe_items_link_kind_iff_parent,
  ADD CONSTRAINT project_ffe_items_link_kind_iff_parent CHECK (
    (parent_ffe_item_id IS NULL) = (link_kind IS NULL)
  ) NOT VALID,
  DROP CONSTRAINT IF EXISTS project_ffe_items_labor_is_linked,
  ADD CONSTRAINT project_ffe_items_labor_is_linked CHECK (
    (line_kind = 'labor') = (link_kind IS NOT DISTINCT FROM 'labor')
  ) NOT VALID;

COMMENT ON COLUMN public.project_ffe_items.rough_cents IS
  'Internal Rough $ for the line (00729, D12). Studio-only: never select it in any client RPC or payload.';

-- ─── 2. Backfill: every existing child is a COM pair ────────────────────────

DO $$
BEGIN
  PERFORM set_config('app.ffe_mutation_rpc', 'on', true);
  ALTER TABLE public.project_ffe_items DISABLE TRIGGER USER;
  UPDATE public.project_ffe_items
  SET link_kind = 'com'
  WHERE parent_ffe_item_id IS NOT NULL
    AND link_kind IS NULL;
  ALTER TABLE public.project_ffe_items ENABLE TRIGGER USER;
END;
$$;

-- ─── 3. Validate the cross-column CHECKs ────────────────────────────────────

ALTER TABLE public.project_ffe_items
  VALIDATE CONSTRAINT project_ffe_items_link_kind_iff_parent;
ALTER TABLE public.project_ffe_items
  VALIDATE CONSTRAINT project_ffe_items_labor_is_linked;

-- ─── 4. project_ffe_selection_threads.need_label ────────────────────────────

ALTER TABLE public.project_ffe_selection_threads
  ADD COLUMN IF NOT EXISTS need_label text;

UPDATE public.project_ffe_selection_threads thread
SET need_label = item.name
FROM public.project_ffe_items item
WHERE item.id = thread.primary_ffe_item_id
  AND thread.need_label IS NULL;
