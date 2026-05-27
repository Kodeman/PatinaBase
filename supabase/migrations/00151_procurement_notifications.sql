-- ============================================================================
-- Migration 00151: Procurement Notifications
--
-- Adds procurement_notifications (in-app only for v1) + lightweight Postgres
-- triggers on po_payments and damage_claims to auto-create notification rows.
-- Migration 00150 must be applied first.
--
-- Source spec: docs/handoffs/procurement-workspace-wave-3.1-architect-dossier.md
-- §3 (Notifications model). Wave 3.2 / Sprint 3.
-- ============================================================================

-- ─── PART 1: KIND ENUM ──────────────────────────────────────────────────────

CREATE TYPE procurement_notification_kind AS ENUM (
  'deposit_due',
  'balance_due',
  'milestone_due',
  'delivery_this_week',
  'damage_claim_drafted'
);

COMMENT ON TYPE procurement_notification_kind IS
  'v1 in-app notification kinds for the procurement workspace. '
  'deposit_due / balance_due / milestone_due: fired when po_payments.state transitions to ''due'' from a non-due state. '
  'delivery_this_week: RESERVED — no trigger in v1. Intended for a weekly pg_cron job that scans purchase_orders.confirmed_eta. '
  'Deferred per dossier §7 risk 8 (pg_cron preload gotcha). Do not render in the UI feed in v1. '
  'damage_claim_drafted: fired on INSERT into damage_claims with state = ''drafted''.';

-- ─── PART 2: procurement_notifications TABLE ─────────────────────────────────

CREATE TABLE procurement_notifications (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind                      procurement_notification_kind NOT NULL,
  subject_purchase_order_id UUID        REFERENCES purchase_orders(id) ON DELETE CASCADE,
  subject_payment_id        UUID        REFERENCES po_payments(id) ON DELETE CASCADE,
  subject_inspection_id     UUID        REFERENCES receiving_inspections(id) ON DELETE CASCADE,
  read_at                   TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE procurement_notifications IS
  'In-app-only notification rows for the procurement workspace. '
  'One row per notification event. read_at = NULL means unread. '
  'v2 expansion: add a trigger or cron that fans out to notification-dispatch edge fn for email/push.';

COMMENT ON COLUMN procurement_notifications.subject_purchase_order_id IS
  'FK to purchase_orders ON DELETE CASCADE. If the PO is deleted, the notification is deleted.';

COMMENT ON COLUMN procurement_notifications.subject_payment_id IS
  'FK to po_payments ON DELETE CASCADE. If the payment row is deleted (compensating delete pattern), '
  'the notification is also deleted — prevents orphaned notifications.';

COMMENT ON COLUMN procurement_notifications.subject_inspection_id IS
  'FK to receiving_inspections ON DELETE CASCADE. Cascades correctly with the W1.2.6 compensating-delete '
  'pattern: damage_claims is deleted first (RESTRICT FK on receiving_inspections), then the inspection — '
  'at which point this notification cascades cleanly.';

-- ─── PART 3: INDEXES ────────────────────────────────────────────────────────

-- Primary read path: unread count badge + notification feed for a user.
-- Partial index on (user_id, read_at) WHERE read_at IS NULL satisfies the
-- useProcurementUnreadCount HEAD count query and the unread-feed query.
CREATE INDEX idx_procurement_notifications_user_unread
  ON procurement_notifications(user_id, created_at DESC)
  WHERE read_at IS NULL;

-- Full feed (read + unread) ordered by recency.
CREATE INDEX idx_procurement_notifications_user_all
  ON procurement_notifications(user_id, created_at DESC);

-- Used by the compensating-delete trigger pattern: look up by payment.
CREATE INDEX idx_procurement_notifications_payment
  ON procurement_notifications(subject_payment_id)
  WHERE subject_payment_id IS NOT NULL;

-- ─── PART 4: RLS ─────────────────────────────────────────────────────────────

ALTER TABLE procurement_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read their own procurement notifications"
  ON procurement_notifications FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users mark their own procurement notifications read"
  ON procurement_notifications FOR UPDATE
  TO authenticated
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Studio owner inert read policy — parallels the Sprint 1+2 pattern on
-- purchase_orders / po_payments / receiving_inspections / damage_claims.
-- In v1 this is INERT because the predicate joins through projects.designer_id
-- = auth.uid(), which only matches the solo-owner case. Kept in place so the
-- predicate shape and policy name survive the v2 studio_members migration as
-- a no-op rename target.
CREATE POLICY "Studio owners can read procurement notifications"
  ON procurement_notifications FOR SELECT
  TO authenticated
  USING (
    user_has_role(auth.uid(), 'studio_owner')
    AND EXISTS (
      SELECT 1 FROM purchase_orders po
      JOIN projects proj ON proj.id = po.project_id
      WHERE po.id = procurement_notifications.subject_purchase_order_id
        AND proj.designer_id = auth.uid()
    )
  );

-- INSERT and DELETE are service-role / trigger only. The trigger functions in
-- Parts 5 and 6 use SECURITY DEFINER and run as the function owner, bypassing
-- the missing authenticated INSERT policy. Clients never insert directly.

COMMENT ON POLICY "Users read their own procurement notifications"
  ON procurement_notifications IS
  'Scoped to auth.uid(). Notification rows are created by SECURITY DEFINER triggers — '
  'not by the authenticated user. No authenticated INSERT policy is needed.';

COMMENT ON POLICY "Users mark their own procurement notifications read"
  ON procurement_notifications IS
  'Allows the owning user to update their own rows (primarily to set read_at). '
  'WITH CHECK enforces user_id immutability via auth.uid() match.';

COMMENT ON POLICY "Studio owners can read procurement notifications"
  ON procurement_notifications IS
  'INERT in v1: proj.designer_id = auth.uid() only matches when the studio_owner is also the lead designer. '
  'Full multi-designer studio support requires a studio_members table (v2). Mirrors the policy comments on '
  'purchase_orders / po_payments / receiving_inspections / damage_claims.';

-- ─── PART 5: TRIGGER — po_payments state→due TRANSITION ─────────────────────
--
-- Fires AFTER UPDATE on po_payments when state transitions from a non-due
-- value to 'due'. Identifies the designer_id from the parent purchase_orders
-- row and inserts a notification row.
--
-- SECURITY DEFINER with a stable search_path so it runs with the function
-- owner's permissions and can INSERT into procurement_notifications without
-- needing an authenticated INSERT policy.

CREATE OR REPLACE FUNCTION notify_payment_due()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_designer_id UUID;
  v_kind        procurement_notification_kind;
BEGIN
  -- Only fire when state transitions TO 'due' from a non-due state.
  IF NEW.state <> 'due' OR OLD.state = 'due' THEN
    RETURN NEW;
  END IF;

  -- Resolve the designer who owns this PO.
  SELECT designer_id
    INTO v_designer_id
    FROM purchase_orders
   WHERE id = NEW.purchase_order_id;

  IF v_designer_id IS NULL THEN
    RETURN NEW;  -- Orphaned payment row, silently skip.
  END IF;

  -- Map payment kind to notification kind.
  v_kind := CASE NEW.kind
    WHEN 'deposit'   THEN 'deposit_due'::procurement_notification_kind
    WHEN 'balance'   THEN 'balance_due'::procurement_notification_kind
    WHEN 'milestone' THEN 'milestone_due'::procurement_notification_kind
    ELSE 'balance_due'::procurement_notification_kind
  END;

  INSERT INTO procurement_notifications (
    user_id,
    kind,
    subject_purchase_order_id,
    subject_payment_id
  ) VALUES (
    v_designer_id,
    v_kind,
    NEW.purchase_order_id,
    NEW.id
  );

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION notify_payment_due() IS
  'Trigger function: when a po_payments row transitions to state=''due'' from any non-due state, '
  'creates a procurement_notifications row addressed to the owning designer. SECURITY DEFINER so the '
  'INSERT bypasses RLS — clients never insert into procurement_notifications directly.';

CREATE TRIGGER trg_notify_payment_due
  AFTER UPDATE ON po_payments
  FOR EACH ROW
  EXECUTE FUNCTION notify_payment_due();

-- ─── PART 6: TRIGGER — damage_claims INSERT auto-draft ─────────────────────
--
-- Fires AFTER INSERT on damage_claims for new rows with state = 'drafted'
-- (the default, so this fires on every fresh auto-draft from the receiving
-- inspection hook). Resolves designer_id via the receiving_inspections →
-- purchase_orders chain.

CREATE OR REPLACE FUNCTION notify_damage_claim_drafted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_designer_id UUID;
  v_po_id       UUID;
  v_insp_id     UUID;
BEGIN
  IF NEW.state <> 'drafted' THEN
    RETURN NEW;
  END IF;

  v_insp_id := NEW.receiving_inspection_id;

  SELECT po.designer_id, po.id
    INTO v_designer_id, v_po_id
    FROM receiving_inspections ri
    JOIN purchase_orders po ON po.id = ri.purchase_order_id
   WHERE ri.id = v_insp_id;

  IF v_designer_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO procurement_notifications (
    user_id,
    kind,
    subject_purchase_order_id,
    subject_inspection_id
  ) VALUES (
    v_designer_id,
    'damage_claim_drafted',
    v_po_id,
    v_insp_id
  );

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION notify_damage_claim_drafted() IS
  'Trigger function: when a damage_claims row is inserted with state=''drafted'' (the default), '
  'creates a procurement_notifications row addressed to the owning designer. Resolves designer_id '
  'via receiving_inspections → purchase_orders. SECURITY DEFINER so the INSERT bypasses RLS.';

CREATE TRIGGER trg_notify_damage_claim_drafted
  AFTER INSERT ON damage_claims
  FOR EACH ROW
  EXECUTE FUNCTION notify_damage_claim_drafted();

-- ─── PART 7: updated_at TRIGGER ────────────────────────────────────────────

CREATE TRIGGER set_updated_at_procurement_notifications
  BEFORE UPDATE ON procurement_notifications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
