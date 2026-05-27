-- ============================================================================
-- Migration 00148: Procurement Workspace v1
--
-- Adds purchase_orders (PO header), po_payments (one row per payment event),
-- extends project_ffe_items with purchase_order_id FK, and adds
-- default_payment_terms to vendors.
--
-- Deliberately excludes receiving_inspections, damage_claims, delivery_events
-- (Wave 2.1) and QBO export schema (Wave 3.1).
-- ============================================================================

-- ============================================================================
-- PART 1: ENUMS
-- ============================================================================

CREATE TYPE purchase_order_payment_pattern AS ENUM (
  'fifty_fifty',
  'thirty_seventy',
  'full_upfront',
  'net_30',
  'custom_milestones'
);

CREATE TYPE po_payment_kind AS ENUM (
  'deposit',
  'balance',
  'milestone'
);

CREATE TYPE po_payment_state AS ENUM (
  'pending',
  'due',
  'paid'
);

-- ============================================================================
-- PART 2: EXTEND EXISTING TABLES
-- ============================================================================

ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS default_payment_terms purchase_order_payment_pattern;

ALTER TABLE project_ffe_items
  ADD COLUMN IF NOT EXISTS purchase_order_id UUID;

-- ============================================================================
-- PART 3: purchase_orders (PO header table)
-- ============================================================================

CREATE TABLE purchase_orders (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  designer_id             UUID        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  project_id              UUID        NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  vendor_id               UUID        NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
  vendor_po_number        TEXT,
  confirmed_eta           DATE,
  payment_pattern         purchase_order_payment_pattern NOT NULL,
  total_cents             INTEGER     NOT NULL DEFAULT 0
                            CHECK (total_cents >= 0),
  status                  TEXT        NOT NULL DEFAULT 'draft'
                            CHECK (status IN ('draft','confirmed','in_production','shipped','delivered','cancelled')),
  is_patina_catalog       BOOLEAN     NOT NULL DEFAULT false,
  notes                   TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_purchase_orders_designer   ON purchase_orders(designer_id);
CREATE INDEX idx_purchase_orders_project    ON purchase_orders(project_id);
CREATE INDEX idx_purchase_orders_vendor     ON purchase_orders(vendor_id);
CREATE INDEX idx_purchase_orders_status     ON purchase_orders(status);

-- ============================================================================
-- PART 4: po_payments
-- ============================================================================

CREATE TABLE po_payments (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id   UUID        NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  kind                po_payment_kind  NOT NULL,
  amount_cents        INTEGER     NOT NULL DEFAULT 0
                        CHECK (amount_cents >= 0),
  due_date            DATE,
  paid_date           DATE,
  state               po_payment_state NOT NULL DEFAULT 'pending',
  label               TEXT,
  notes               TEXT,
  sort_order          INTEGER     NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_po_payments_purchase_order ON po_payments(purchase_order_id);
CREATE INDEX idx_po_payments_state_due_date ON po_payments(state, due_date);

-- ============================================================================
-- PART 5: FK from project_ffe_items to purchase_orders
-- ============================================================================

ALTER TABLE project_ffe_items
  ADD CONSTRAINT fk_ffe_items_purchase_order
    FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_project_ffe_items_purchase_order
  ON project_ffe_items(purchase_order_id)
  WHERE purchase_order_id IS NOT NULL;

-- ============================================================================
-- PART 6: updated_at TRIGGERS
-- ============================================================================

CREATE TRIGGER set_updated_at_purchase_orders
  BEFORE UPDATE ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at_po_payments
  BEFORE UPDATE ON po_payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- PART 7: ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Designers manage their own purchase orders"
  ON purchase_orders FOR ALL
  TO authenticated
  USING  (designer_id = auth.uid())
  WITH CHECK (designer_id = auth.uid());

CREATE POLICY "Studio owners can read purchase orders in their projects"
  ON purchase_orders FOR SELECT
  TO authenticated
  USING (
    user_has_role(auth.uid(), 'studio_owner')
    AND EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = purchase_orders.project_id
        AND p.designer_id = auth.uid()
    )
  );

ALTER TABLE po_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Designers manage payments on their purchase orders"
  ON po_payments FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM purchase_orders po
      WHERE po.id = purchase_order_id
        AND po.designer_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM purchase_orders po
      WHERE po.id = purchase_order_id
        AND po.designer_id = auth.uid()
    )
  );

CREATE POLICY "Studio owners can read payments in their projects"
  ON po_payments FOR SELECT
  TO authenticated
  USING (
    user_has_role(auth.uid(), 'studio_owner')
    AND EXISTS (
      SELECT 1 FROM purchase_orders po
      JOIN projects p ON p.id = po.project_id
      WHERE po.id = purchase_order_id
        AND p.designer_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 8: COMMENTS
-- ============================================================================

COMMENT ON TABLE purchase_orders IS
  'Vendor purchase order header. One PO covers one vendor across one project. Payment pattern drives the shape of po_payments rows.';

COMMENT ON TABLE po_payments IS
  'One row per scheduled payment event (deposit, balance, milestone). State transitions are triggered by procurement stage advances and designer log-payment actions.';

COMMENT ON COLUMN purchase_orders.is_patina_catalog IS
  'When true, Patina handles payments internally. po_payments rows still exist for accounting but the "Patina handled" pill replaces deposit/balance pills in the designer UI.';

COMMENT ON COLUMN project_ffe_items.purchase_order_id IS
  'Nullable FK to purchase_orders. NULL for all pre-v1 rows. Set when the designer creates a PO covering this item via the Order Assistant.';

COMMENT ON COLUMN vendors.default_payment_terms IS
  'Pre-fills the payment_pattern field on new POs for this vendor. Designer overrides per-PO if the vendor offers different terms for a specific item.';
