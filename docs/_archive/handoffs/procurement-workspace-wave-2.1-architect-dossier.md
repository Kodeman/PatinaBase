# Procurement Workspace — Wave 2.1 Architect Dossier

**Sprint 2 · Wave 2.1 · Data Architect deliverable**
**Status:** Complete · Hand-off to Wave 2.2 (Migration Engineer A + B, parallel)
**Source orchestration plan:** `/Users/kody/.claude/plans/read-docs-prds-patina-procurement-worksp-steady-forest.md` §4 Sprint 2
**PRD references:** slides §3 (scope table), §8 (Calendar), §9 (Receiving), §12 (Phase 2)

---

## Reading summary

Key facts extracted before designing:

- `project_ffe_items` (00066) has `eta DATE` for expected delivery. **No `install_date` column exists** in any migration. Per-item delivery anchor is `eta`; install dates live at the project level via `project_phases.target_end_date WHERE phase_key ILIKE '%install%'`.
- `purchase_orders.status` CHECK (00148) — `'draft','confirmed','in_production','shipped','delivered','cancelled'`. **Wire contract. Do not alter.**
- `update_updated_at()` (no `_column` suffix) — canonical from 00001/00021. Used throughout 00148.
- `user_has_role(auth.uid(), 'studio_owner')` + `COMMENT ON POLICY` INERT annotation — established Sprint 1 pattern.
- `photo_asset_ids uuid[]` — soft reference; `media_assets` lives in `svc_media` Prisma schema, not public. No FK possible.
- Next available migration number: **00150**.

---

## 1. Migration Spec — `00150_receiving_and_damage_claims.sql`

```sql
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
  NULL::UUID                         AS inspection_id,
  NULL::receiving_inspection_outcome AS inspection_outcome,
  NULL::TEXT                         AS phase_key
FROM purchase_orders po
JOIN projects p  ON p.id = po.project_id
JOIN vendors v   ON v.id = po.vendor_id
LEFT JOIN project_ffe_items fi ON fi.purchase_order_id = po.id
WHERE po.confirmed_eta IS NOT NULL
  AND po.status NOT IN ('cancelled')
GROUP BY po.id, p.id, p.name, v.id, v.name

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
```

---

## 2. Conflict detection spec

**Decision: client-side TypeScript helper** (not server-side view).

Rationale: The data set for a 2-month calendar window is small (~60 rows for an active designer). Doing this in SQL requires self-joins with LATERAL or window functions over the cross-product — brittle, hard to test, and blocks the Calendar component from adding UI filtering without rewriting the view. A pure TS function is testable with vitest and runs client-side over the same `useDeliveryCalendar` data set.

```typescript
export const OVERLAP_WINDOW_DAYS = 7;
export const DRIFT_BUFFER_DAYS   = 14;

export type ConflictType = 'overlap' | 'late_arrival' | 'drift';

export interface DeliveryConflict {
  type:        ConflictType;
  projectId:   string;
  projectName: string;
  eventA:      DeliveryEvent;
  eventB:      DeliveryEvent;
  message:     string;
  suggestions: string[];
}

/**
 * Pure function. Groups events by project_id, then runs three passes:
 * 1. Sort deliveries by event_date; for each pair within OVERLAP_WINDOW_DAYS, emit overlap.
 * 2. For each delivery_expected, find install_milestone events for same project;
 *    if any delivery's event_date is after an install_milestone date, emit late_arrival.
 * 3. For each install_milestone, if nearest delivery ETA is within DRIFT_BUFFER_DAYS, emit drift.
 */
export function detectDeliveryConflicts(events: DeliveryEvent[]): DeliveryConflict[];
```

Wave 2.3 Calendar Builder implements the body in a new file `apps/designer-portal/src/lib/procurement/delivery-conflicts.ts` (or co-located with the Calendar page).

---

## 3. Hook stubs

Append to `packages/supabase/src/hooks/use-procurement.ts`.

```typescript
// ═══ TYPES ════════════════════════════════════════════════════════════════

export type ReceivingInspectionOutcome = 'clean' | 'damaged' | 'partial';
export type DamageClaimState = 'drafted' | 'vendor_notified' | 'resolved';

export interface ReceivingInspection {
  id:                  string;
  purchase_order_id:   string;
  inspected_at:        string;
  inspected_by:        string;
  outcome:             ReceivingInspectionOutcome;
  notes:               string | null;
  photo_asset_ids:     string[];
  created_at:          string;
  updated_at:          string;
  purchase_order?: {
    id: string; vendor_id: string; project_id: string; status: POStatus;
    vendor?: { id: string; name: string };
    project?: { id: string; name: string };
  };
  damage_claims?: DamageClaim[];
}

export interface DamageClaim {
  id:                      string;
  receiving_inspection_id: string;
  state:                   DamageClaimState;
  description:             string | null;
  vendor_notified_at:      string | null;
  resolved_at:             string | null;
  resolution_notes:        string | null;
  created_at:              string;
  updated_at:              string;
  inspection?: {
    id: string; purchase_order_id: string; outcome: ReceivingInspectionOutcome;
    purchase_order?: {
      id: string;
      vendor?: { id: string; name: string };
      project?: { id: string; name: string };
    };
  };
}

export interface DeliveryEvent {
  event_id:           string;
  project_id:         string;
  project_name:       string;
  purchase_order_id:  string | null;
  vendor_id:          string | null;
  vendor_name:        string | null;
  event_date:         string | null;
  event_type:         'delivery_expected' | 'install_milestone';
  po_status:          POStatus | null;
  delivered_date:     string | null;
  ffe_item_count:     number | null;
  line_total_cents:   number | null;
  inspection_id:      string | null;
  inspection_outcome: ReceivingInspectionOutcome | null;
  phase_key:          string | null;
}

export interface ReceivingInspectionFilters {
  vendorId?:  string;
  projectId?: string;
  outcome?:   ReceivingInspectionOutcome;
  sinceDate?: string;
}

export interface DamageClaimFilters {
  state?:     DamageClaimState;
  vendorId?:  string;
  sinceDate?: string;
}

export interface CreateReceivingInspectionInput {
  purchaseOrderId:   string;
  outcome:           ReceivingInspectionOutcome;
  notes?:            string;
  photoAssetIds?:    string[];
  receivedQuantity?: number;
}

export interface UpdateDamageClaimInput {
  id:                  string;
  state?:              DamageClaimState;
  description?:        string;
  vendor_notified_at?: string;
  resolved_at?:        string;
  resolution_notes?:   string;
}

export interface TodayProcurementCounts {
  arrivingThisWeek:   number;
  inspectionsPending: number;
  damageClaimsOpen:   number;
}

// ═══ QUERY HOOKS ══════════════════════════════════════════════════════════

/** Query key: ['receiving-inspections', filters] */
export function useReceivingInspections(filters?: ReceivingInspectionFilters): UseQueryResult<ReceivingInspection[]>;

/** Query key: ['damage-claims', filters] */
export function useDamageClaims(filters?: DamageClaimFilters): UseQueryResult<DamageClaim[]>;

/** Query key: ['delivery-calendar', rangeStart, rangeEnd]. ISO YYYY-MM-DD. */
export function useDeliveryCalendar(rangeStart: string, rangeEnd: string): UseQueryResult<DeliveryEvent[]>;

/** Query key: ['today-procurement-counts']. staleTime 5min. Never throws — returns zeros on error. */
export function useTodayProcurementCounts(): UseQueryResult<TodayProcurementCounts>;

// ═══ MUTATION HOOKS ═══════════════════════════════════════════════════════

/**
 * Logs a physical receiving inspection. Side effects (sequential, compensating delete on critical-path failure):
 *   1. INSERT receiving_inspections.
 *   2. UPDATE purchase_orders.delivered_date = inspected_at::date IF NULL.
 *   3. UPDATE purchase_orders.status = 'delivered' IF NOT IN (delivered, cancelled).
 *   4. IF outcome != 'clean': INSERT damage_claims (drafted, auto-description).
 *   5. IF receivedQuantity supplied: UPDATE project_ffe_items.received_quantity distributed across linked items.
 *   6. IF payment_pattern = 'net_30' AND delivered_date just transitioned from NULL: UPDATE po_payments.due_date = delivered_date + 30 WHERE kind = 'balance' AND state = 'pending'.
 *
 * Invalidates: ['receiving-inspections'], ['damage-claims'], ['purchase-orders'],
 *              ['purchase-order', poId], ['today-procurement-counts']
 */
export function useCreateReceivingInspection(): UseMutationResult<
  ReceivingInspection, Error, CreateReceivingInspectionInput
>;

/**
 * Partial update on a damage claim. Validates state transitions client-side:
 *   drafted → vendor_notified (sets vendor_notified_at = now() if absent)
 *   vendor_notified → resolved (sets resolved_at = now() if absent)
 * No backwards transitions in v1.
 *
 * Invalidates: ['damage-claims'], ['receiving-inspections'], ['today-procurement-counts']
 */
export function useUpdateDamageClaim(): UseMutationResult<DamageClaim, Error, UpdateDamageClaimInput>;
```

---

## 4. Auto-draft logic spec

When `useCreateReceivingInspection` runs with `outcome IN ('damaged','partial')`, the mutation auto-drafts a `damage_claims` row immediately after inserting the inspection. **Only step 4 (damage_claim INSERT) is in the critical path** — steps 2, 3, 5, 6 are fire-and-forget-with-warn because the inspection row is the ground truth.

Steps 2/3 (delivered_date + status): if these fail after the inspection commits, log a `console.warn` and continue. The inspection row is still authoritative; the dashboard re-derives state.

Step 4 (damage_claim INSERT): on failure, compensating DELETE on the inspection row (rolls back to pre-mutation state), then throw with combined error message.

Step 5 (received_quantity): fire-and-forget-with-warn. Drift recoverable.

Step 6 (NET-30 due_date update): fire-and-forget-with-warn. Filter MUST include `WHERE kind = 'balance' AND state = 'pending'` to never overwrite paid or already-dated rows.

### Auto-drafted description template

```typescript
const autoDraftDescription = (
  outcome: ReceivingInspectionOutcome,
  notes: string | undefined,
  vendorName: string,
  poNumber: string | null,
): string => {
  const head = outcome === 'damaged' ? 'Damage reported on delivery' : 'Partial delivery received';
  const poBit = poNumber ? ` (PO ${poNumber})` : '';
  const notesBit = notes ? `\n\nInspection notes: ${notes}` : '';
  return `${head} from ${vendorName}${poBit}.${notesBit}\n\nPlease describe the issue in detail before notifying the vendor.`;
};
```

Wave 2.3 designer-side claim form pre-fills the description from this template. Designer edits before clicking "Notify vendor."

---

## 5. Seed data spec

**File:** `supabase/seed/procurement_receiving_dev.sql`

```sql
DO $$
DECLARE
  v_designer_id         UUID;
  v_po_woodward         UUID;
  v_po_apparatus        UUID;
  v_inspection_clean    UUID := gen_random_uuid();
  v_inspection_damaged  UUID := gen_random_uuid();
BEGIN
  SELECT id INTO v_designer_id FROM profiles WHERE is_designer = true LIMIT 1;

  SELECT po.id INTO v_po_woodward
    FROM purchase_orders po JOIN vendors v ON v.id = po.vendor_id
   WHERE v.name ILIKE 'Woodward%' AND po.vendor_po_number = 'WS-188' LIMIT 1;

  SELECT po.id INTO v_po_apparatus
    FROM purchase_orders po JOIN vendors v ON v.id = po.vendor_id
   WHERE v.name ILIKE 'Apparatus%' AND po.vendor_po_number = 'AP-012' LIMIT 1;

  IF v_po_apparatus IS NULL THEN
    SELECT id INTO v_po_apparatus FROM purchase_orders
     WHERE designer_id = v_designer_id AND id != COALESCE(v_po_woodward, gen_random_uuid()) LIMIT 1;
  END IF;

  IF v_designer_id IS NULL OR v_po_woodward IS NULL THEN
    RAISE NOTICE 'Skipping receiving seed: prerequisites not found.';
    RETURN;
  END IF;

  -- Inspection 1: Clean Woodward sectional, 2026-05-27
  INSERT INTO receiving_inspections (id, purchase_order_id, inspected_at, inspected_by, outcome, notes, photo_asset_ids)
  SELECT v_inspection_clean, v_po_woodward, '2026-05-27T10:30:00+00:00'::timestamptz, v_designer_id,
         'clean', 'Sectional arrived in good condition. All 3 pieces accounted for. Packaging intact.', '{}'
  WHERE NOT EXISTS (SELECT 1 FROM receiving_inspections WHERE id = v_inspection_clean);

  UPDATE purchase_orders SET status = 'delivered', delivered_date = '2026-05-27'::date
   WHERE id = v_po_woodward AND delivered_date IS NULL;

  -- Inspection 2: Damaged Apparatus pendant, 2026-05-26
  INSERT INTO receiving_inspections (id, purchase_order_id, inspected_at, inspected_by, outcome, notes, photo_asset_ids)
  SELECT v_inspection_damaged, v_po_apparatus, '2026-05-26T14:15:00+00:00'::timestamptz, v_designer_id,
         'damaged', 'Chip on canopy of pendant cluster. Estimated 2cm chip on painted surface. 4 photos attached.', '{}'
  WHERE NOT EXISTS (SELECT 1 FROM receiving_inspections WHERE id = v_inspection_damaged);

  -- Damage claim drafted
  INSERT INTO damage_claims (receiving_inspection_id, state, description)
  SELECT v_inspection_damaged, 'drafted',
         'Damage reported on delivery from Apparatus Studio (PO AP-012).'
         || E'\n\nInspection notes: Chip on canopy of pendant cluster. Estimated 2cm chip on painted surface.'
         || E'\n\nPlease describe the issue in detail before notifying the vendor.'
  WHERE NOT EXISTS (SELECT 1 FROM damage_claims WHERE receiving_inspection_id = v_inspection_damaged);
END $$;
```

---

## 6. Hand-off contract for Wave 2.2

**Engineer A — Migration + Seed + Types:**
Apply `00150_receiving_and_damage_claims.sql` via `supabase db reset`. Verify enums + tables + RLS + columns (`delivered_date`, `received_quantity`). Apply `procurement_receiving_dev.sql` and verify 2 inspections + 1 damage claim. Regenerate types via `pnpm db:generate`. Confirm `pnpm --filter @patina/supabase type-check` exits 0.

**Engineer B — Hooks + Tests:**
Append Sprint 2 types and hook signatures to `packages/supabase/src/hooks/use-procurement.ts` and implement all 6 hooks. Export new symbols from `index.ts`. Unit tests covering: clean inspection (no claim), damaged inspection (claim auto-drafted), step 4 failure compensating delete, `useDeliveryCalendar` event_type discrimination, `useTodayProcurementCounts` rollup independence.

Both must wait for Engineer A's `db:generate` before merge.

---

## 7. Migration risks

- **R1:** `purchase_orders.status` enum is a wire contract. 00150 doesn't alter the CHECK. Hook sets `status='delivered'` (already in CHECK).
- **R2:** `delivery_events` view survives `db reset` — uses `CREATE OR REPLACE VIEW`, depends only on tables present in earlier migrations. Returns zero install rows if no `project_phases` rows match `phase_key ILIKE '%install%'`.
- **R3:** `photo_asset_ids` has no FK to media_assets (different Prisma schema). iOS engineer must use upload-session flow before passing UUIDs. Dangling UUIDs are application-level risk, not enforced by DB.
- **R4:** Migration ordering preserved (Supabase CLI applies in numeric order). Apply only via `supabase db reset` locally or `supabase migration up --single` on staging — never partial psql (CREATE TYPE is irreversible).
- **R5:** NET-30 due-date side effect in `useCreateReceivingInspection` step 6 — scoped to `WHERE kind='balance' AND state='pending'` to never overwrite paid rows. Wave 2.2 Engineer B must test this path.
- **R6:** Studio_owner RLS remains inert in v1 per the 00148 pattern. Annotated. v2 needs studio_members table.

---

**File paths for Wave 2.2 engineers:**

- `supabase/migrations/00150_receiving_and_damage_claims.sql` — create (Engineer A, lift Section 1 verbatim)
- `supabase/seed/procurement_receiving_dev.sql` — create (Engineer A, lift Section 5 verbatim)
- `packages/supabase/src/hooks/use-procurement.ts` — extend (Engineer B, append Section 3)
- `packages/supabase/src/hooks/index.ts` — modify (Engineer B, export new symbols)
