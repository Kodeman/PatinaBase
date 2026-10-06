-- ═══════════════════════════════════════════════════════════════════════════
-- 00710 — The release gate: orders over a studio's threshold wait for an
--         owner or admin (US-16 Phase 2, C-32, R-PB2 + R-PB6; SQ-420)
-- ═══════════════════════════════════════════════════════════════════════════
-- d1 D1-12: "the day Leah is no longer the only person who can commit the
-- studio's money". R-PB2: an in-studio release gate, off by default, per
-- order. R-PB6: a System B seat (organization_members.role owner | admin)
-- releases — never System A's studio_owner.
--
-- ── WHAT THIS ADDS ──────────────────────────────────────────────────────────
-- organizations.release_threshold_cents    null = off (default). Orders whose
--   paper total is at or over it wait for release.
-- organizations.require_release_per_order  default false. On: every order
--   waits for release, whatever its total.
-- set_studio_release_gate(p_org, p_threshold_cents, p_require_per_order)
--   owner/admin only (is_org_admin_or_owner), like 00713's margin setter.
-- purchase_orders.status gains 'held_for_release' (a text CHECK, not an
--   enum, so it is rebuilt in place). Held paper is frozen: lines and terms
--   edit only on a draft.
-- purchase_orders hold/release/send-back record: held_at, held_by,
--   hold_note, released_at, released_by, released_total_cents, sent_back_at,
--   sent_back_by, send_back_note.
-- purchase_order_release_required(p_po_id)  the studio's gate applies.
-- po_is_sendable(p_po_id)  false when cancelled or held, or when the gate
--   applies and no release covers the paper's current total; a PO already
--   sent stays sendable (a resend). P2-13 (SQ-430) wires it into po-send,
--   which then refuses 409 held_for_release before any side effect.
-- hold_purchase_order_for_release(p_po_id, p_note)  a co-member holds an
--   unsent draft the gate applies to (the paper total is at or over the
--   threshold, or every order waits).
-- release_purchase_order(p_po_id)  owner/admin: a held PO (or an unsent draft
--   the gate applies to, when the releaser drafted it) returns to draft with
--   the release recorded against its total; the UI then sends it.
-- send_back_purchase_order(p_po_id, p_note)  owner/admin: a held PO returns
--   to draft with the note.
-- guard_purchase_order_release  the DB-level stop: sent_at can never be
--   stamped on a PO that is not sendable (the 00456 repricing-guard shape),
--   and a held PO leaves held only for draft or cancelled.
--
-- ── WHAT THIS DOES NOT DO ───────────────────────────────────────────────────
-- po-send is SQ-430's; the Ledger group, Desk need and order-paper acts are
-- the UI tickets'. Margin on the held paper is R1 (trade cost only, as today).
--
-- Adds GRANT/REVOKE → supabase/seed/00-legacy-grants.sql regenerated.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. The studio's gate ───────────────────────────────────────────────────

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS release_threshold_cents integer,
  ADD COLUMN IF NOT EXISTS require_release_per_order boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'organizations_release_threshold_ck'
       AND conrelid = 'public.organizations'::regclass
  ) THEN
    ALTER TABLE public.organizations
      ADD CONSTRAINT organizations_release_threshold_ck
      CHECK (release_threshold_cents IS NULL OR release_threshold_cents > 0);
  END IF;
END $$;

COMMENT ON COLUMN public.organizations.release_threshold_cents IS
  'R-PB2 (00710): orders whose paper total is at or over this wait for an owner/admin to release them. '
  'Null = off (default). Set through set_studio_release_gate.';
COMMENT ON COLUMN public.organizations.require_release_per_order IS
  'R-PB2 (00710): true = every order waits for an owner/admin release, whatever its total. Default false.';

CREATE OR REPLACE FUNCTION public.set_studio_release_gate(
  p_org uuid,
  p_threshold_cents integer,
  p_require_per_order boolean DEFAULT false
)
RETURNS public.organizations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_row public.organizations%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'set_studio_release_gate: not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_threshold_cents IS NOT NULL AND (p_threshold_cents <= 0 OR p_threshold_cents > 1000000000) THEN
    RAISE EXCEPTION 'set_studio_release_gate: the threshold is off (null) or 1 to 1000000000 cents'
      USING ERRCODE = 'check_violation';
  END IF;
  PERFORM 1 FROM public.organizations WHERE id = p_org FOR UPDATE;
  IF NOT FOUND OR NOT public.is_org_admin_or_owner(p_org) THEN
    RAISE EXCEPTION 'set_studio_release_gate: only an owner or admin can set the release gate'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.organizations
     SET release_threshold_cents = p_threshold_cents,
         require_release_per_order = COALESCE(p_require_per_order, false),
         updated_at = now()
   WHERE id = p_org
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION public.set_studio_release_gate(uuid, integer, boolean) IS
  'R-PB2 (00710): sets the studio''s release gate. Owner/admin seat only (R-PB6).';

REVOKE ALL ON FUNCTION public.set_studio_release_gate(uuid, integer, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_studio_release_gate(uuid, integer, boolean) TO authenticated;

-- ─── 2. The held state and its record ───────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'purchase_orders_status_check'
       AND conrelid = 'public.purchase_orders'::regclass
       AND pg_get_constraintdef(oid) LIKE '%held_for_release%'
  ) THEN
    ALTER TABLE public.purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_status_check;
    ALTER TABLE public.purchase_orders
      ADD CONSTRAINT purchase_orders_status_check
      CHECK (status IN ('draft', 'held_for_release', 'confirmed', 'in_production', 'shipped',
                        'delivered', 'cancelled'));
  END IF;
END $$;

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS held_at              timestamptz,
  ADD COLUMN IF NOT EXISTS held_by              uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS hold_note            text,
  ADD COLUMN IF NOT EXISTS released_at          timestamptz,
  ADD COLUMN IF NOT EXISTS released_by          uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS released_total_cents integer,
  ADD COLUMN IF NOT EXISTS sent_back_at         timestamptz,
  ADD COLUMN IF NOT EXISTS sent_back_by         uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS send_back_note       text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'purchase_orders_release_record_ck'
       AND conrelid = 'public.purchase_orders'::regclass
  ) THEN
    ALTER TABLE public.purchase_orders
      ADD CONSTRAINT purchase_orders_release_record_ck
      CHECK ((status <> 'held_for_release' OR held_at IS NOT NULL)
         AND ((released_at IS NULL) = (released_total_cents IS NULL))
         AND (hold_note IS NULL OR char_length(hold_note) <= 2000)
         AND (send_back_note IS NULL OR char_length(send_back_note) <= 2000));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_purchase_orders_held_for_release
  ON public.purchase_orders (project_id)
  WHERE status = 'held_for_release';

COMMENT ON COLUMN public.purchase_orders.released_total_cents IS
  'The paper total an owner/admin released (00710). A later total above it needs a new release.';

-- ─── 3. Whether the gate applies, and whether a PO may go out ───────────────

-- Internal: the gate for a studio and a total. No caller check.
CREATE OR REPLACE FUNCTION public._release_gate_applies(p_studio_id uuid, p_total_cents integer)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT COALESCE((
    SELECT o.require_release_per_order
        OR (o.release_threshold_cents IS NOT NULL
            AND COALESCE(p_total_cents, 0) >= o.release_threshold_cents)
      FROM public.organizations AS o
     WHERE o.id = p_studio_id
  ), false);
$$;

REVOKE ALL ON FUNCTION public._release_gate_applies(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._release_gate_applies(uuid, integer) TO service_role;

-- Internal: the sendability rule over one PO's values (used by the trigger,
-- which must judge the NEW row, and by po_is_sendable).
CREATE OR REPLACE FUNCTION public._po_release_cleared(
  p_status text,
  p_sent_at timestamptz,
  p_studio_id uuid,
  p_total_cents integer,
  p_released_at timestamptz,
  p_released_total_cents integer
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT CASE
    WHEN p_status IN ('cancelled', 'held_for_release') THEN false
    WHEN p_sent_at IS NOT NULL THEN true
    WHEN NOT public._release_gate_applies(p_studio_id, p_total_cents) THEN true
    ELSE p_released_at IS NOT NULL
         AND COALESCE(p_total_cents, 0) <= p_released_total_cents
  END;
$$;

REVOKE ALL ON FUNCTION public._po_release_cleared(text, timestamptz, uuid, integer, timestamptz, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._po_release_cleared(text, timestamptz, uuid, integer, timestamptz, integer)
  TO service_role;

CREATE OR REPLACE FUNCTION public.purchase_order_release_required(p_po_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT COALESCE((
    SELECT public._release_gate_applies(public.purchase_order_studio_id(po.id), po.total_cents)
      FROM public.purchase_orders AS po
     WHERE po.id = p_po_id
       AND (auth.uid() IS NULL OR public.can_send_purchase_order(po.id))
  ), false);
$$;

COMMENT ON FUNCTION public.purchase_order_release_required(uuid) IS
  'R-PB2 (00710): true when the PO''s studio gate applies to its paper total (at or over the '
  'threshold, or every order waits). False for a PO the caller cannot see.';

REVOKE ALL ON FUNCTION public.purchase_order_release_required(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purchase_order_release_required(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.po_is_sendable(p_po_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT COALESCE((
    SELECT public._po_release_cleared(
             po.status, po.sent_at, public.purchase_order_studio_id(po.id), po.total_cents,
             po.released_at, po.released_total_cents)
      FROM public.purchase_orders AS po
     WHERE po.id = p_po_id
       AND (auth.uid() IS NULL OR public.can_send_purchase_order(po.id))
  ), false);
$$;

COMMENT ON FUNCTION public.po_is_sendable(uuid) IS
  'C-32 (00710): may this PO go to the vendor now? False when cancelled or held_for_release, or when '
  'the studio''s release gate applies and no owner/admin release covers the current total; true for a '
  'PO already sent (a resend). False for a PO the caller cannot see. po-send (SQ-430) refuses 409 '
  'held_for_release on false; guard_purchase_order_release refuses the sent_at stamp regardless.';

REVOKE ALL ON FUNCTION public.po_is_sendable(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.po_is_sendable(uuid) TO authenticated, service_role;

-- ─── 4. The DB-level stop ───────────────────────────────────────────────────
-- Same shape as guard_purchase_order_repricing (00456): whatever path stamps
-- sent_at — po-send's service-role update included — a PO that is not
-- sendable is refused.

CREATE OR REPLACE FUNCTION public.guard_purchase_order_release()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_studio uuid;
BEGIN
  IF OLD.status = 'held_for_release' AND NEW.status NOT IN ('held_for_release', 'draft', 'cancelled') THEN
    RAISE EXCEPTION 'held_for_release: purchase order % waits for an owner or admin to release it', NEW.id
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.sent_at IS NULL AND NEW.sent_at IS NOT NULL THEN
    SELECT COALESCE(project.studio_id, public._primary_studio_for(project.designer_id)) INTO v_studio
      FROM public.projects AS project
     WHERE project.id = NEW.project_id;
    IF NOT public._po_release_cleared(NEW.status, NULL, v_studio, NEW.total_cents,
                                      NEW.released_at, NEW.released_total_cents) THEN
      RAISE EXCEPTION 'held_for_release: purchase order % waits for an owner or admin to release it', NEW.id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_purchase_order_release() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_purchase_order_release_trg ON public.purchase_orders;
CREATE TRIGGER guard_purchase_order_release_trg
  BEFORE UPDATE OF status, sent_at ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.guard_purchase_order_release();

-- ─── 5. Hold, release, send back ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.hold_purchase_order_for_release(p_po_id uuid, p_note text DEFAULT NULL)
RETURNS public.purchase_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_po   public.purchase_orders%ROWTYPE;
  v_note text := NULLIF(btrim(COALESCE(p_note, '')), '');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'hold_purchase_order_for_release: not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND OR NOT public.can_send_purchase_order(p_po_id) THEN
    RAISE EXCEPTION 'hold_purchase_order_for_release: purchase order % not found or access denied', p_po_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_po.status = 'held_for_release' THEN
    RETURN v_po;
  END IF;
  IF v_po.status <> 'draft' OR v_po.sent_at IS NOT NULL THEN
    RAISE EXCEPTION 'hold_purchase_order_for_release: only an unsent draft can be held (purchase order % is %)',
      p_po_id, v_po.status
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT public._release_gate_applies(public.purchase_order_studio_id(p_po_id), v_po.total_cents) THEN
    RAISE EXCEPTION 'hold_purchase_order_for_release: the studio''s release gate does not apply to purchase order %; send it',
      p_po_id
      USING ERRCODE = 'check_violation';
  END IF;
  IF char_length(v_note) > 2000 THEN
    RAISE EXCEPTION 'hold_purchase_order_for_release: the note is at most 2000 characters'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.ffe_mutation_rpc', 'on', true);
  UPDATE public.purchase_orders
     SET status = 'held_for_release',
         held_at = now(), held_by = v_uid, hold_note = v_note,
         released_at = NULL, released_by = NULL, released_total_cents = NULL
   WHERE id = p_po_id
  RETURNING * INTO v_po;
  RETURN v_po;
END;
$$;

COMMENT ON FUNCTION public.hold_purchase_order_for_release(uuid, text) IS
  'C-32 (00710): a co-member (can_send_purchase_order) holds an unsent draft the studio''s release gate '
  'applies to, with an optional note. Idempotent on a held PO.';

REVOKE ALL ON FUNCTION public.hold_purchase_order_for_release(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hold_purchase_order_for_release(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.release_purchase_order(p_po_id uuid)
RETURNS public.purchase_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_po     public.purchase_orders%ROWTYPE;
  v_studio uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'release_purchase_order: not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND OR NOT public.can_send_purchase_order(p_po_id) THEN
    RAISE EXCEPTION 'release_purchase_order: purchase order % not found or access denied', p_po_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_studio := public.purchase_order_studio_id(p_po_id);
  IF v_studio IS NULL OR NOT public.is_org_admin_or_owner(v_studio) THEN
    RAISE EXCEPTION 'release_purchase_order: only an owner or admin can release an order'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_po.status = 'held_for_release' THEN
    NULL;
  ELSIF v_po.status = 'draft' AND v_po.sent_at IS NULL
        AND public._release_gate_applies(v_studio, v_po.total_cents) THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'release_purchase_order: purchase order % is not waiting for release', p_po_id
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.ffe_mutation_rpc', 'on', true);
  UPDATE public.purchase_orders
     SET status = 'draft',
         released_at = now(), released_by = v_uid,
         released_total_cents = COALESCE(total_cents, 0)
   WHERE id = p_po_id
  RETURNING * INTO v_po;
  RETURN v_po;
END;
$$;

COMMENT ON FUNCTION public.release_purchase_order(uuid) IS
  'C-32 (00710, R-PB6): an owner/admin seat of the PO''s studio releases a held PO (or an unsent draft '
  'the gate applies to) at its current total; the PO returns to draft and po_is_sendable turns true '
  'until the total rises above the released figure.';

REVOKE ALL ON FUNCTION public.release_purchase_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.release_purchase_order(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.send_back_purchase_order(p_po_id uuid, p_note text)
RETURNS public.purchase_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_po     public.purchase_orders%ROWTYPE;
  v_studio uuid;
  v_note   text := NULLIF(btrim(COALESCE(p_note, '')), '');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'send_back_purchase_order: not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND OR NOT public.can_send_purchase_order(p_po_id) THEN
    RAISE EXCEPTION 'send_back_purchase_order: purchase order % not found or access denied', p_po_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_studio := public.purchase_order_studio_id(p_po_id);
  IF v_studio IS NULL OR NOT public.is_org_admin_or_owner(v_studio) THEN
    RAISE EXCEPTION 'send_back_purchase_order: only an owner or admin can send an order back'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_po.status <> 'held_for_release' THEN
    RAISE EXCEPTION 'send_back_purchase_order: purchase order % is not held for release', p_po_id
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_note IS NULL OR char_length(v_note) > 2000 THEN
    RAISE EXCEPTION 'send_back_purchase_order: a note of 1 to 2000 characters is required'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.ffe_mutation_rpc', 'on', true);
  UPDATE public.purchase_orders
     SET status = 'draft',
         sent_back_at = now(), sent_back_by = v_uid, send_back_note = v_note
   WHERE id = p_po_id
  RETURNING * INTO v_po;
  RETURN v_po;
END;
$$;

COMMENT ON FUNCTION public.send_back_purchase_order(uuid, text) IS
  'C-32 (00710, R-PB6): an owner/admin seat returns a held PO to draft with a note (1–2000 characters).';

REVOKE ALL ON FUNCTION public.send_back_purchase_order(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_back_purchase_order(uuid, text) TO authenticated;
