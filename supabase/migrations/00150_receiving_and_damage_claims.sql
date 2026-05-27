-- ============================================================================
-- Migration 00150: Receiving Inspections, Damage Claims, Delivery Events
-- Apply order: after 00147, 00148, 00149.
-- ============================================================================

-- ─── PART 1: ENUMS ─────────────────────────────────────────────────────────

CREATE TYPE receiving_inspection_outcome AS ENUM ('clean','damaged','partial');

COMMENT ON TYPE receiving_inspection_outcome IS
  'Outcome of a physical receiving inspection. clean = all items received undamaged. damaged = one or more items show damage. partial = delivery is incomplete (wrong quantity or missing pieces) but not necessarily damaged.';

CREATE TYPE damage_claim_state AS ENUM ('drafted','vendor_notified','resolved');

COMMENT ON TYPE damage_claim_state IS
  'Lifecycle of a damage claim. drafted = auto-created by the system when a non-clean inspection is logged. vendor_notified = designer has sent the claim. resolved = vendor has responded and the issue is closed.';

-- ─── PART 2: COLUMN ADDITIONS TO EXISTING TABLES ───────────────────────────

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS delivered_date DATE;

COMMENT ON COLUMN purchase_orders.delivered_date IS
  'Actual delivery date. NULL until first receiving_inspection row is logged. For NET-30 POs, hook sets po_payments.due_date = delivered_date + 30 when this transitions from NULL.';

ALTER TABLE project_ffe_items
  ADD COLUMN IF NOT EXISTS received_quantity INTEGER;

COMMENT ON COLUMN project_ffe_items.received_quantity IS
  'Running count of units received so far. NULL for pre-00150 items. Updated by useCreateReceivingInspection on partial deliveries.';

-- ─── PART 3: receiving_inspections ─────────────────────────────────────────

CREATE TABLE receiving_inspections (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id    UUID         NOT NULL
                         REFERENCES purchase_orders(id) ON DELETE RESTRICT,
  inspected_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  inspected_by         UUID         NOT NULL
                         REFERENCES auth.users(id) ON DELETE RESTRICT,
  outcome              receiving_inspection_outcome NOT NULL,
  notes                TEXT,
  photo_asset_ids      UUID[]       NOT NULL DEFAULT '{}',
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE receiving_inspections IS
  'One row per physical receiving event. Multiple inspections per PO are allowed (partial deliveries arrive separately).';

COMMENT ON COLUMN receiving_inspections.photo_asset_ids IS
  'Array of MediaAsset UUIDs uploaded via the media service upload-session flow. Soft reference — no FK (media_assets lives in svc_media schema, not public).';

CREATE INDEX idx_receiving_inspections_po           ON receiving_inspections(purchase_order_id);
CREATE INDEX idx_receiving_inspections_inspected_by ON receiving_inspections(inspected_by);
CREATE INDEX idx_receiving_inspections_outcome      ON receiving_inspections(outcome);
CREATE INDEX idx_receiving_inspections_inspected_at ON receiving_inspections(inspected_at DESC);

-- ─── PART 4: damage_claims ─────────────────────────────────────────────────

CREATE TABLE damage_claims (
  id                        UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  receiving_inspection_id   UUID         NOT NULL
                              REFERENCES receiving_inspections(id) ON DELETE RESTRICT,
  state                     damage_claim_state NOT NULL DEFAULT 'drafted',
  description               TEXT,
  vendor_notified_at        TIMESTAMPTZ,
  resolved_at               TIMESTAMPTZ,
  resolution_notes          TEXT,
  created_at                TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_vendor_notified_at_requires_state
    CHECK (vendor_notified_at IS NULL OR state IN ('vendor_notified','resolved')),
  CONSTRAINT chk_resolved_at_requires_state
    CHECK (resolved_at IS NULL OR state = 'resolved')
);

COMMENT ON TABLE damage_claims IS
  'One row per damage or partial-delivery claim. Auto-drafted when a receiving_inspection is logged with outcome != clean. Designer edits description before transitioning to vendor_notified.';

CREATE INDEX idx_damage_claims_inspection        ON damage_claims(receiving_inspection_id);
CREATE INDEX idx_damage_claims_state             ON damage_claims(state);
CREATE INDEX idx_damage_claims_state_notified    ON damage_claims(state, vendor_notified_at)
  WHERE state IN ('drafted','vendor_notified');

-- ─── PART 5: INDEX ON purchase_orders FOR CALENDAR FEED ────────────────────

CREATE INDEX IF NOT EXISTS idx_purchase_orders_eta_calendar
  ON purchase_orders(confirmed_eta)
  WHERE status NOT IN ('cancelled','delivered')
    AND confirmed_eta IS NOT NULL;

-- ─── PART 6: delivery_events VIEW ──────────────────────────────────────────
-- A VIEW (not table) — every calendar event derives deterministically from
-- existing tables. View is SECURITY INVOKER (Supabase default), so PostgREST
-- enforces caller's RLS on base tables automatically.

CREATE OR REPLACE VIEW delivery_events AS
SELECT
  po.id                              AS event_id,
  po.project_id                      AS project_id,
  p.name                             AS project_name,
  po.id                              AS purchase_order_id,
  po.vendor_id                       AS vendor_id,
  v.name                             AS vendor_name,
  po.confirmed_eta                   AS event_date,
  'delivery_expected'::TEXT          AS event_type,
  po.status                          AS po_status,
  po.delivered_date                  AS delivered_date,
  COUNT(fi.id)                       AS ffe_item_count,
  SUM(fi.line_total_cents)           AS line_total_cents,
  -- LATERAL subquery selects the most recent receiving_inspection per PO so
  -- callers can resolve "what's the current inspection status on this
  -- delivery?" without an extra round-trip. NULL when no inspection has
  -- been logged yet. LATERAL does not introduce duplicate rows because it
  -- returns at most one row per PO and is joined LEFT.
  latest_inspection.id               AS inspection_id,
  latest_inspection.outcome          AS inspection_outcome,
  NULL::TEXT                         AS phase_key
FROM purchase_orders po
JOIN projects p  ON p.id = po.project_id
JOIN vendors v   ON v.id = po.vendor_id
LEFT JOIN project_ffe_items fi ON fi.purchase_order_id = po.id
LEFT JOIN LATERAL (
  SELECT ri.id, ri.outcome
  FROM receiving_inspections ri
  WHERE ri.purchase_order_id = po.id
  ORDER BY ri.inspected_at DESC
  LIMIT 1
) latest_inspection ON TRUE
WHERE po.confirmed_eta IS NOT NULL
  AND po.status NOT IN ('cancelled')
GROUP BY po.id, p.id, p.name, v.id, v.name, latest_inspection.id, latest_inspection.outcome

UNION ALL

SELECT
  ph.id                              AS event_id,
  ph.project_id                      AS project_id,
  p.name                             AS project_name,
  NULL::UUID                         AS purchase_order_id,
  NULL::UUID                         AS vendor_id,
  NULL::TEXT                         AS vendor_name,
  ph.target_end_date                 AS event_date,
  'install_milestone'::TEXT          AS event_type,
  NULL::TEXT                         AS po_status,
  NULL::DATE                         AS delivered_date,
  NULL::BIGINT                       AS ffe_item_count,
  NULL::BIGINT                       AS line_total_cents,
  NULL::UUID                         AS inspection_id,
  NULL::receiving_inspection_outcome AS inspection_outcome,
  ph.phase_key                       AS phase_key
FROM project_phases ph
JOIN projects p ON p.id = ph.project_id
WHERE ph.phase_key ILIKE '%install%'
  AND ph.target_end_date IS NOT NULL
  AND ph.status != 'completed';

COMMENT ON VIEW delivery_events IS
  'Unified calendar feed. One row per delivery event (PO-axis) + one row per install milestone (project_phases). RLS enforced via base tables. Conflict detection runs client-side.';

-- ─── PART 7: updated_at TRIGGERS ───────────────────────────────────────────

CREATE TRIGGER set_updated_at_receiving_inspections
  BEFORE UPDATE ON receiving_inspections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at_damage_claims
  BEFORE UPDATE ON damage_claims
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── PART 8: ROW LEVEL SECURITY ────────────────────────────────────────────

ALTER TABLE receiving_inspections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Designers manage inspections on their purchase orders"
  ON receiving_inspections FOR ALL
  TO authenticated
  USING  (EXISTS (SELECT 1 FROM purchase_orders po WHERE po.id = receiving_inspections.purchase_order_id AND po.designer_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM purchase_orders po WHERE po.id = receiving_inspections.purchase_order_id AND po.designer_id = auth.uid()));

CREATE POLICY "Studio owners can read inspections in their projects"
  ON receiving_inspections FOR SELECT
  TO authenticated
  USING (
    user_has_role(auth.uid(), 'studio_owner')
    AND EXISTS (
      SELECT 1 FROM purchase_orders po
      JOIN projects proj ON proj.id = po.project_id
      WHERE po.id = receiving_inspections.purchase_order_id
        AND proj.designer_id = auth.uid()
    )
  );

COMMENT ON POLICY "Studio owners can read inspections in their projects"
  ON receiving_inspections IS
  'INERT in v1: proj.designer_id = auth.uid() only matches when the studio_owner is also the lead designer. Full multi-designer studio support requires a studio_members table (v2).';

ALTER TABLE damage_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Designers manage damage claims for their inspections"
  ON damage_claims FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM receiving_inspections ri
      JOIN purchase_orders po ON po.id = ri.purchase_order_id
      WHERE ri.id = damage_claims.receiving_inspection_id
        AND po.designer_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM receiving_inspections ri
      JOIN purchase_orders po ON po.id = ri.purchase_order_id
      WHERE ri.id = damage_claims.receiving_inspection_id
        AND po.designer_id = auth.uid()
    )
  );

CREATE POLICY "Studio owners can read damage claims in their projects"
  ON damage_claims FOR SELECT
  TO authenticated
  USING (
    user_has_role(auth.uid(), 'studio_owner')
    AND EXISTS (
      SELECT 1 FROM receiving_inspections ri
      JOIN purchase_orders po ON po.id = ri.purchase_order_id
      JOIN projects proj ON proj.id = po.project_id
      WHERE ri.id = damage_claims.receiving_inspection_id
        AND proj.designer_id = auth.uid()
    )
  );

COMMENT ON POLICY "Studio owners can read damage claims in their projects"
  ON damage_claims IS
  'INERT in v1: see parallel comment on receiving_inspections policy.';
