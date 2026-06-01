-- Migration: 00172_decision_room_product_linkage.sql
-- Decision Framework Wave 1 (Spine) · PT-D-1-2
--
-- Adds room + product linkage so decisions can be scoped to a specific room
-- and an option can carry a real catalog product (delivery plan cluster D —
-- the iOS / extension surfaces need this to attach captures to a decision).
--
--   • client_decisions.room_id          → public.project_rooms(id)  (00066)
--   • client_decision_options.product_id → public.products(id)      (00001)
--
-- Both FKs ON DELETE SET NULL so deleting a room/product never cascades a
-- decision away. Guarded with IF NOT EXISTS for idempotent re-runs.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. client_decisions.room_id
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.client_decisions
  ADD COLUMN IF NOT EXISTS room_id UUID REFERENCES public.project_rooms(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.client_decisions.room_id IS
  'Optional link to the project_rooms row this decision is scoped to. '
  'ON DELETE SET NULL — deleting the room detaches but never removes the decision.';

-- Room-scoped dashboard / timeline queries ("open decisions in this room").
CREATE INDEX IF NOT EXISTS idx_client_decisions_room_status
  ON public.client_decisions(room_id, status)
  WHERE room_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. client_decision_options.product_id
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.client_decision_options
  ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES public.products(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.client_decision_options.product_id IS
  'Optional link to the catalog product this option represents (e.g. an '
  'extension capture sent as a decision option). ON DELETE SET NULL.';
