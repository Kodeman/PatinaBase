-- ============================================================================
-- Migration 00188: PO numbering, send columns, vendor order routing
--
-- The schema half of the PO send flow: when a designer sends a purchase
-- order to a vendor for the first time, the po-send edge function (a) calls
-- assign_po_number() under the caller's JWT to stamp OUR outbound number
-- atomically, (b) renders the PO PDF into the project-documents bucket,
-- (c) emails the vendor at orders_email (falling back to
-- contact_info->>'email'), and (d) stamps sent_at / ship_to /
-- po_document_path on the header.
--
-- Contents:
--   1. purchase_orders: ADD COLUMN po_number, ship_to, po_document_path,
--      sent_at (+ comments) and the partial UNIQUE index
--      uniq_purchase_orders_designer_po_number (one PO-XXXX per designer).
--   2. po_counters — per-designer sequential PO numbering, cloned from
--      invoice_counters (00178). RLS enabled with ZERO authenticated
--      policies: service-role/RPC only.
--   3. vendors: ADD COLUMN orders_email (+ comment) — explicit order-routing
--      inbox for the send flow.
--   4. assign_po_number(p_po_id) RETURNS purchase_orders — SECURITY DEFINER,
--      owner-scoped, idempotent; mirrors issue_invoice's race-safe
--      ON CONFLICT counter upsert (00178).
--
-- Migrations 00148 (purchase_orders/po_payments) and 00178 (the
-- invoice_counters pattern this clones) must be applied first. Re-run safe:
-- ADD COLUMN IF NOT EXISTS, CREATE TABLE IF NOT EXISTS, CREATE UNIQUE INDEX
-- IF NOT EXISTS, CREATE OR REPLACE + idempotent GRANT/REVOKE/COMMENT.
-- ============================================================================

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. purchase_orders — send columns + per-designer number uniqueness
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS po_number        TEXT,
  ADD COLUMN IF NOT EXISTS ship_to          TEXT,
  ADD COLUMN IF NOT EXISTS po_document_path TEXT,
  ADD COLUMN IF NOT EXISTS sent_at          TIMESTAMPTZ;

COMMENT ON COLUMN public.purchase_orders.po_number IS
  'OUR outbound purchase-order number (PO-0001, PO-0002, …), a per-designer '
  'sequence assigned by assign_po_number (00188) on first send. Distinct '
  'from vendor_po_number, which is the VENDOR''s confirmation number for the '
  'same order. NULL until the PO is first sent.';

COMMENT ON COLUMN public.purchase_orders.ship_to IS
  'Free-text ship-to address printed on the outbound PO document. The send '
  'flow defaults it from projects.site_address at send time — the column '
  'itself is nullable with no default, and the designer may override it per '
  'PO before sending.';

COMMENT ON COLUMN public.purchase_orders.po_document_path IS
  'Storage object path of the rendered PO PDF inside the project-documents '
  'bucket (set by the po-send edge function). Store the PATH only — sign '
  'URLs on demand (createSignedUrl) when serving; never persist signed URLs.';

COMMENT ON COLUMN public.purchase_orders.sent_at IS
  'When the PO was first emailed to the vendor by the po-send edge function. '
  'NULL = never sent.';

-- One live PO-XXXX per designer; unnumbered (NULL) drafts are unconstrained.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_purchase_orders_designer_po_number
  ON public.purchase_orders(designer_id, po_number)
  WHERE po_number IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. po_counters — per-designer sequential numbering (invoice_counters clone)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.po_counters (
  designer_id UUID    PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  next_number INTEGER NOT NULL DEFAULT 1
);

-- ZERO authenticated policies on purpose (same posture as invoice_counters,
-- 00178): the counter must only ever move inside the SECURITY DEFINER
-- assign_po_number RPC (or via service_role), so the sequence stays atomic,
-- race-safe, and tamper-proof. Any direct authenticated read/write path
-- would let a client skip or replay numbers.
ALTER TABLE public.po_counters ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.po_counters IS
  'Per-designer sequential purchase-order numbering (PO-0001, …). Row stores '
  'the last assigned number; touched only inside assign_po_number (00188). '
  'RLS enabled with zero policies — service-role/RPC only. Clone of '
  'invoice_counters (00178).';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. vendors.orders_email — explicit order-routing inbox
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS orders_email TEXT;

COMMENT ON COLUMN public.vendors.orders_email IS
  'Explicit order-routing email address for the PO send flow. The po-send '
  'edge function resolves the recipient via the fallback chain: orders_email '
  '→ contact_info->>''email''. NULL = fall through to contact_info.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. assign_po_number — idempotent, race-safe outbound numbering
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Called by the po-send edge function under the CALLER's JWT before
-- rendering the PO document, so numbering stays atomic and race-safe even
-- when two sends fire concurrently:
--   • the header row is locked FOR UPDATE first — a concurrent call on the
--     SAME PO blocks, then returns the already-stamped number (idempotent),
--   • the counter upsert is the exact issue_invoice (00178) shape — INSERT
--     … ON CONFLICT (designer_id) DO UPDATE SET next_number = next_number+1
--     RETURNING next_number — which row-locks the counter, so two sends of
--     DIFFERENT POs for the same designer serialize and never share a number.
-- The row stores the LAST assigned number (DEFAULT 1 = first insert assigns
-- PO-0001 without incrementing).

CREATE OR REPLACE FUNCTION public.assign_po_number(p_po_id UUID)
RETURNS purchase_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_po     purchase_orders;
  v_number INTEGER;
BEGIN
  -- Owner-scoped lock (designer_id = auth.uid()); non-owners get the same
  -- error as a missing row so the RPC leaks nothing.
  SELECT * INTO v_po
    FROM purchase_orders
   WHERE id = p_po_id
     AND designer_id = auth.uid()
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'assign_po_number: purchase order % not found or access denied', p_po_id;
  END IF;

  -- Idempotent: already numbered → return the row unchanged (counter
  -- untouched).
  IF v_po.po_number IS NOT NULL THEN
    RETURN v_po;
  END IF;

  -- Sequential per-designer number. Row stores the last assigned number
  -- (same race-safe upsert shape as issue_invoice, 00178).
  INSERT INTO po_counters (designer_id)
  VALUES (v_po.designer_id)
  ON CONFLICT (designer_id)
    DO UPDATE SET next_number = po_counters.next_number + 1
  RETURNING next_number INTO v_number;

  UPDATE purchase_orders
     SET po_number = 'PO-' || LPAD(v_number::TEXT, 4, '0')
   WHERE id = p_po_id
   RETURNING * INTO v_po;

  RETURN v_po;
END;
$$;

COMMENT ON FUNCTION public.assign_po_number(UUID) IS
  'Assigns OUR outbound PO number (PO-0001, …) from the per-designer '
  'po_counters sequence. Idempotent — a PO that already has a po_number is '
  'returned unchanged without touching the counter. Race-safe via FOR UPDATE '
  'on the header + the issue_invoice-style ON CONFLICT counter upsert '
  '(00178). SECURITY DEFINER, owner-scoped (designer_id = auth.uid()); '
  'called by the po-send edge function under the caller''s JWT before '
  'rendering the PO document.';

REVOKE ALL ON FUNCTION public.assign_po_number(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_po_number(UUID) TO authenticated;
