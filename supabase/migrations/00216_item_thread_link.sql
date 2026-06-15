-- ═══════════════════════════════════════════════════════════════════════════
-- 00216 — per-item coordination thread (Track 5, R50)
--
-- A coordination item (RFI / Submittal / Punch / Selection / Sign-off) carries a
-- multi-party back-and-forth — the GC asks, the designer answers, the vendor
-- resubmits. R50: that conversation lives in ONE canonical comms_threads thread
-- anchored to the item via coordination_item_id. decision_comments is retained
-- for back-compat but is no longer the primary surface.
--
-- The unique partial index enforces ONE thread per item (a second thread for the
-- same item is a bug, not a feature). It's partial so the column stays NULL on
-- every non-coordination thread (direct / project / vendor_brief) without
-- colliding — only item-anchored threads participate in the uniqueness.
--
-- Additive only (D7): ADD COLUMN IF NOT EXISTS + CREATE UNIQUE INDEX IF NOT
-- EXISTS. ON DELETE SET NULL so deleting an item never cascade-deletes its
-- thread history. Existing comms threads are untouched (coordination_item_id NULL).
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.comms_threads
  ADD COLUMN IF NOT EXISTS coordination_item_id UUID
    REFERENCES public.client_decisions(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.comms_threads.coordination_item_id IS
  'Track 5 (R50): the coordination item (client_decisions) this thread is the '
  'canonical multi-party conversation for. NULL on every non-item thread. '
  'One thread per item — enforced by the partial unique index.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_comms_threads_coordination_item
  ON public.comms_threads(coordination_item_id)
  WHERE coordination_item_id IS NOT NULL;
