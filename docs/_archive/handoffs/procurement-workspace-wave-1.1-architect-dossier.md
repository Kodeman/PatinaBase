# Procurement Workspace — Wave 1.1 Architect Dossier

**Sprint 1 · Wave 1.1 · Data Architect deliverable**
**Status:** Complete · Hand-off to Wave 1.2 (Migration Engineer ×2)
**Source orchestration plan:** `/Users/kody/.claude/plans/read-docs-prds-patina-procurement-worksp-steady-forest.md`

This is the design dossier produced by the Wave 1.1 Data Architect. Wave 1.2 implements this exactly as specified — any deviation must be flagged and surfaced before merge.

---

## Reading Summary

Key facts extracted from the codebase before designing:

- `project_ffe_items` lives in migration 00066. Status is a plain TEXT column with CHECK constraint (not a CREATE TYPE enum) — new PO status enum does not conflict. `vendor_id` is plain UUID with no FK (line 273 of 00066).
- `update_updated_at()` (no `_column` suffix) is canonical from 00001/00021. The `_column` variant in 00066 is a duplicate. Recent migrations (00145+) all use `update_updated_at()`.
- `user_has_role(user_id, role_name)` is defined in 00021 and used in 00058+. `studio_owner` role seeded in 00022.
- Recent migration style: `IF NOT EXISTS` on indexes, `DO $$ ... $$` for loops, RLS enable before policies, `FOR ALL` / `FOR SELECT` with explicit `USING` + `WITH CHECK`.
- Next migration number: **00148**.

---

## 1. Migration Spec

**Filename:** `supabase/migrations/00148_procurement_workspace_v1.sql`

```sql
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
```

---

## 2. State-Machine Spec

**Override rule (load-bearing):** procurement state never waits for payment state. The DB has no FK or CHECK preventing `status = 'shipped'` while a `po_payments` row is `due`. The application layer surfaces a non-blocking warning badge.

### Procurement Stage → Payment State

| Procurement Stage | deposit row state | balance/milestone row state | System action |
|---|---|---|---|
| `specified` | (no rows yet) | (no rows yet) | PO not yet created |
| `quoted` | (no rows yet) | (no rows yet) | PO not yet created |
| `approved` | `pending` (created when PO drafted) | `pending` | PO may be drafted; no payment due |
| `ordered` | **`due`** | `pending` | On transition: deposit row flips to `due`; set `due_date` from Order Assistant Step 4. For `full_upfront`: single payment flips to `due`. For `net_30`: no flip yet. |
| `production` | `due` → `paid` (after designer logs) | `pending` (balance pre-staged) | No automatic flip; designer logs deposit paid manually |
| `shipped` | `paid` (flag if not) | **`due`** | Balance/final-milestone flips to `due`. If deposit still `due`, raise "deposit overdue" flag but do NOT block. For `net_30`: still `pending`. |
| `delivered` | `paid` | `due` (newly for `net_30`) | For `net_30`: flip balance to `due`, `due_date = delivered_date + 30 days`. Other patterns: balance already `due`. |
| `installed` | `paid` | `paid` (ideally) | Final reconciliation. If balance still `due` at install, alert. PO status → `delivered`. |

### Pattern-Specific Notes

| Pattern | deposit row | balance row | Notes |
|---|---|---|---|
| `fifty_fifty` | 50% of total, `due` at `ordered` | 50%, `due` at `shipped` | Most common |
| `thirty_seventy` | 30%, `due` at `ordered` | 70%, `due` at `shipped` | Same triggers, different amounts |
| `full_upfront` | 100%, `due` at `ordered` | (no row) | Single deposit row; mark paid_in_full when logged |
| `net_30` | (no row) | 100%, `due` at `delivered` + 30d | No deposit |
| `custom_milestones` | First milestone, `due` at `ordered` | Remaining milestones with own triggers | 2–4 milestone rows; designer-managed |

---

## 3. Hook Stubs

All hooks go in: `packages/supabase/src/hooks/use-procurement.ts`

```typescript
export type PaymentPattern =
  | 'fifty_fifty'
  | 'thirty_seventy'
  | 'full_upfront'
  | 'net_30'
  | 'custom_milestones';

export type POPaymentKind   = 'deposit' | 'balance' | 'milestone';
export type POPaymentState  = 'pending' | 'due' | 'paid';

export type POStatus =
  | 'draft' | 'confirmed' | 'in_production' | 'shipped' | 'delivered' | 'cancelled';

export interface PurchaseOrder {
  id: string;
  designer_id: string;
  project_id: string;
  vendor_id: string;
  vendor_po_number: string | null;
  confirmed_eta: string | null;
  payment_pattern: PaymentPattern;
  total_cents: number;
  status: POStatus;
  is_patina_catalog: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  vendor?: { id: string; name: string; default_payment_terms: PaymentPattern | null };
  project?: { id: string; name: string };
  payments?: POPayment[];
}

export interface POPayment {
  id: string;
  purchase_order_id: string;
  kind: POPaymentKind;
  amount_cents: number;
  due_date: string | null;
  paid_date: string | null;
  state: POPaymentState;
  label: string | null;
  notes: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface POFilters {
  projectId?: string;
  vendorId?: string;
  status?: POStatus;
  paymentState?: POPaymentState;
}

/** Fetches purchase orders for the authenticated designer.
 *  Joins vendor name, project name, and nested po_payments. */
function usePurchaseOrders(filters?: POFilters): UseQueryResult<PurchaseOrder[]>;

/** Fetches all payment rows for a single PO, ordered by sort_order asc. */
function usePOPayments(purchaseOrderId: string): UseQueryResult<POPayment[]>;

/** Reads the default_payment_terms column for a single vendor. */
function useVendorPaymentTerms(vendorId: string): UseQueryResult<PaymentPattern | null>;

/** Mutation: updates vendors.default_payment_terms. */
function useUpdateVendorPaymentTerms(): UseMutationResult<
  void,
  Error,
  { vendorId: string; terms: PaymentPattern }
>;

/** Mutation: creates a purchase_orders header row and the appropriate
 *  po_payments rows for the chosen payment_pattern. Also updates
 *  project_ffe_items.purchase_order_id atomically for the supplied ffeItemIds. */
function useCreatePurchaseOrder(): UseMutationResult<
  PurchaseOrder,
  Error,
  {
    projectId: string;
    vendorId: string;
    vendorPoNumber?: string;
    confirmedEta?: string;
    paymentPattern: PaymentPattern;
    totalCents: number;
    isPatinaCatalog?: boolean;
    ffeItemIds: string[];
    depositDueDate?: string;
    depositAmountCents?: number;
    customMilestones?: Array<{
      label: string;
      amountCents: number;
      dueDate?: string;
      sortOrder: number;
    }>;
  }
>;

/** Mutation: logs a payment as paid. Sets paid_date = today, state = 'paid'.
 *  Flips next pending payment to 'due' if pattern requires it. */
function useLogPaymentPaid(): UseMutationResult<
  POPayment,
  Error,
  { paymentId: string; purchaseOrderId: string; paidDate?: string; notes?: string }
>;

/** Mutation: advances a po_payment row to 'due' state.
 *  Called from useUpdateFFEItemStatus onSuccess when status crosses trigger boundary. */
function useAdvancePaymentToDue(): UseMutationResult<
  POPayment,
  Error,
  { paymentId: string; purchaseOrderId: string; dueDate?: string }
>;
```

**Query key conventions:**
- `['purchase-orders', filters]` — flat list keyed by filters
- `['purchase-order', id]` — single PO detail
- `['po-payments', purchaseOrderId]` — payments for one PO

**Critical integration note:** `useCreatePurchaseOrder` must update `project_ffe_items.purchase_order_id` for every `ffeItemId` inside the same mutation function (not a separate hook). The DB does not enforce atomicity — it is application-level.

---

## 4. Seed Data Spec

**File to create:** `supabase/seed/procurement_workspace_dev.sql`
**Apply after:** existing seed.sql (or after `supabase db reset` runs 00148).

```sql
-- ============================================================================
-- Procurement Workspace v1 — Development Seed Data
-- ============================================================================

UPDATE vendors SET default_payment_terms = 'fifty_fifty'
  WHERE name ILIKE 'Nordic Atelier';

UPDATE vendors SET default_payment_terms = 'fifty_fifty'
  WHERE name ILIKE 'Woodward%Sons';

UPDATE vendors SET default_payment_terms = 'thirty_seventy'
  WHERE name ILIKE 'Sawkille%';

UPDATE vendors SET default_payment_terms = 'net_30'
  WHERE name ILIKE 'Apparatus%';

UPDATE vendors SET default_payment_terms = 'full_upfront'
  WHERE name ILIKE 'Ceramica%';

DO $$
DECLARE
  v_designer_id  UUID;
  v_proj_chen    UUID;
  v_proj_olsen   UUID;
  v_v_nordic     UUID;
  v_v_woodward   UUID;
  v_v_sawkille   UUID;
  v_v_apparatus  UUID;
  v_v_ceramica   UUID;

  v_po1  UUID := gen_random_uuid();
  v_po2  UUID := gen_random_uuid();
  v_po3  UUID := gen_random_uuid();
  v_po4  UUID := gen_random_uuid();
  v_po5  UUID := gen_random_uuid();
  v_po6  UUID := gen_random_uuid();
  v_po7  UUID := gen_random_uuid();
  v_po8  UUID := gen_random_uuid();
BEGIN
  SELECT id INTO v_designer_id FROM profiles WHERE is_designer = true LIMIT 1;
  SELECT id INTO v_proj_chen   FROM projects WHERE name ILIKE 'Chen%' LIMIT 1;
  SELECT id INTO v_proj_olsen  FROM projects WHERE name ILIKE 'Olsen%' LIMIT 1;
  SELECT id INTO v_v_nordic    FROM vendors WHERE name ILIKE 'Nordic Atelier' LIMIT 1;
  SELECT id INTO v_v_woodward  FROM vendors WHERE name ILIKE 'Woodward%' LIMIT 1;
  SELECT id INTO v_v_sawkille  FROM vendors WHERE name ILIKE 'Sawkille%' LIMIT 1;
  SELECT id INTO v_v_apparatus FROM vendors WHERE name ILIKE 'Apparatus%' LIMIT 1;
  SELECT id INTO v_v_ceramica  FROM vendors WHERE name ILIKE 'Ceramica%' LIMIT 1;

  IF v_designer_id IS NULL OR v_proj_chen IS NULL THEN
    RAISE NOTICE 'Skipping procurement seed: required projects or designer not found.';
    RETURN;
  END IF;

  -- PO 1: Nordic Atelier / Chen Residence — 50/50, in production, deposit paid
  INSERT INTO purchase_orders (id, designer_id, project_id, vendor_id, vendor_po_number,
    confirmed_eta, payment_pattern, total_cents, status)
  VALUES (v_po1, v_designer_id, v_proj_chen, v_v_nordic, 'NA-2026-041',
    '2026-07-18', 'fifty_fifty', 762000, 'in_production');
  INSERT INTO po_payments (purchase_order_id, kind, amount_cents, due_date, paid_date, state, sort_order)
  VALUES (v_po1, 'deposit', 381000, '2026-04-12', '2026-04-12', 'paid', 0),
         (v_po1, 'balance', 381000, NULL, NULL, 'pending', 1);

  -- PO 2: Woodward & Sons / Chen — 50/50, deposit paid, balance DUE
  INSERT INTO purchase_orders (id, designer_id, project_id, vendor_id, vendor_po_number,
    confirmed_eta, payment_pattern, total_cents, status)
  VALUES (v_po2, v_designer_id, v_proj_chen, v_v_woodward, 'WS-188',
    '2026-05-20', 'fifty_fifty', 680000, 'in_production');
  INSERT INTO po_payments (purchase_order_id, kind, amount_cents, due_date, paid_date, state, sort_order)
  VALUES (v_po2, 'deposit', 340000, '2026-04-08', '2026-04-08', 'paid', 0),
         (v_po2, 'balance', 340000, '2026-05-12', NULL, 'due', 1);

  -- PO 3: Sawkille / Chen — 30/70, just ordered, deposit DUE
  INSERT INTO purchase_orders (id, designer_id, project_id, vendor_id, vendor_po_number,
    confirmed_eta, payment_pattern, total_cents, status)
  VALUES (v_po3, v_designer_id, v_proj_chen, v_v_sawkille, 'SK-087',
    '2026-08-02', 'thirty_seventy', 240000, 'confirmed');
  INSERT INTO po_payments (purchase_order_id, kind, amount_cents, due_date, paid_date, state, sort_order)
  VALUES (v_po3, 'deposit', 72000, '2026-04-19', NULL, 'due', 0),
         (v_po3, 'balance', 168000, NULL, NULL, 'pending', 1);

  -- PO 4: Apparatus / Olsen — net_30, shipped
  INSERT INTO purchase_orders (id, designer_id, project_id, vendor_id, vendor_po_number,
    confirmed_eta, payment_pattern, total_cents, status)
  VALUES (v_po4, v_designer_id, COALESCE(v_proj_olsen, v_proj_chen),
    COALESCE(v_v_apparatus, v_v_woodward), 'AP-012',
    '2026-05-06', 'net_30', 420000, 'shipped');
  INSERT INTO po_payments (purchase_order_id, kind, amount_cents, due_date, paid_date, state, sort_order)
  VALUES (v_po4, 'balance', 420000, NULL, NULL, 'pending', 0);

  -- PO 5: Ceramica / Olsen — full_upfront, shipped, paid
  INSERT INTO purchase_orders (id, designer_id, project_id, vendor_id, vendor_po_number,
    confirmed_eta, payment_pattern, total_cents, status)
  VALUES (v_po5, v_designer_id, COALESCE(v_proj_olsen, v_proj_chen),
    COALESCE(v_v_ceramica, v_v_sawkille), 'CER-0044',
    '2026-05-25', 'full_upfront', 189000, 'shipped');
  INSERT INTO po_payments (purchase_order_id, kind, amount_cents, due_date, paid_date, state, sort_order)
  VALUES (v_po5, 'deposit', 189000, '2026-04-01', '2026-04-01', 'paid', 0);

  -- PO 6: Nordic / Olsen — 50/50, draft
  INSERT INTO purchase_orders (id, designer_id, project_id, vendor_id,
    payment_pattern, total_cents, status)
  VALUES (v_po6, v_designer_id, COALESCE(v_proj_olsen, v_proj_chen), v_v_nordic,
    'fifty_fifty', 340000, 'draft');
  INSERT INTO po_payments (purchase_order_id, kind, amount_cents, due_date, state, sort_order)
  VALUES (v_po6, 'deposit', 170000, NULL, 'pending', 0),
         (v_po6, 'balance', 170000, NULL, 'pending', 1);

  -- PO 7: Woodward / Olsen — net_30, delivered, balance DUE
  INSERT INTO purchase_orders (id, designer_id, project_id, vendor_id, vendor_po_number,
    payment_pattern, total_cents, status)
  VALUES (v_po7, v_designer_id, COALESCE(v_proj_olsen, v_proj_chen),
    v_v_woodward, 'WS-201', 'net_30', 510000, 'delivered');
  INSERT INTO po_payments (purchase_order_id, kind, amount_cents, due_date, state, sort_order)
  VALUES (v_po7, 'balance', 510000, '2026-06-05', NULL, 'due', 0);

  -- PO 8: Sawkille / Chen — custom_milestones
  INSERT INTO purchase_orders (id, designer_id, project_id, vendor_id, vendor_po_number,
    payment_pattern, total_cents, status)
  VALUES (v_po8, v_designer_id, v_proj_chen, v_v_sawkille, 'SK-102',
    'custom_milestones', 960000, 'in_production');
  INSERT INTO po_payments (purchase_order_id, kind, amount_cents, due_date, paid_date, state, label, sort_order)
  VALUES (v_po8, 'milestone', 288000, '2026-03-15', '2026-03-15', 'paid', 'Deposit — 30%', 0),
         (v_po8, 'milestone', 384000, '2026-05-30', NULL, 'pending', 'Mid-production — 40%', 1),
         (v_po8, 'milestone', 288000, NULL, NULL, 'pending', 'Before ship — 30%', 2);
END $$;
```

---

## 5. Migration Risks

- **Existing `project_ffe_items` rows:** `purchase_order_id` is nullable with no DEFAULT — no backfill needed. FK is `ON DELETE SET NULL`.
- **`project_ffe_items.vendor_id`** already exists (line 273 of 00066) as plain UUID with no FK. Do not touch — it remains the denormalized vendor backup for unlinked items.
- **`CREATE TYPE` is irreversible** without a full drop. If migration partially applies, re-run will fail with "type already exists." Apply only via `supabase db reset` locally and `supabase migration up --single` on staging — never partial psql.
- **`user_has_role()`** is from 00021 — sequential numbering guarantees availability before 00148.
- **`update_updated_at()` name:** Migration 00066 defines `update_updated_at_column()` (different name). This migration calls `update_updated_at()` matching 00001/00021/00145. Verify `\df update_updated_at` after reset.
- **`feedback_supabase_clean_rebuild_gotchas.md`:** No new cron jobs in 00148, so pg_cron permission risk is low. Still confirm Kong base64 keys + Coolify `pull && up --force-recreate` path before any prod apply.

---

## 6. Hand-off Contract for Wave 1.2

Wave 1.2 dispatches **two Migration Engineers in parallel**.

**Engineer A — Migration + Seed + Types:**
1. Create `supabase/migrations/00148_procurement_workspace_v1.sql` exactly as Section 1.
2. Create `supabase/seed/procurement_workspace_dev.sql` exactly as Section 4.
3. Run `supabase db reset` (or equivalent local apply). Verify enums exist (`\dT`), RLS enabled (`\dp purchase_orders`), policies created.
4. Regenerate types (`pnpm db:generate` in `packages/supabase`).
5. Confirm `pnpm --filter @patina/supabase type-check` exits 0.
6. Apply seed; verify 8 rows in `purchase_orders`.

**Engineer B — Hook implementations:**
1. Create `packages/supabase/src/hooks/use-procurement.ts` with all 7 hooks from Section 3.
2. Export from `packages/supabase/src/hooks/index.ts`.
3. Unit tests (vitest, mock Supabase client) for `usePurchaseOrders`, `usePOPayments`, `useCreatePurchaseOrder`.
4. Confirm `pnpm --filter @patina/supabase type-check && pnpm --filter @patina/supabase test` exits 0.

**Both must wait for Engineer A's `db:generate` before merge** — Engineer B's tests need the new types in `database.types.ts`.

**Acceptance signal (joint):** `supabase db reset` completes clean; `pnpm --filter @patina/supabase type-check` exits 0; a smoke component calling `usePurchaseOrders({ projectId: '<chen-project-id>' })` returns 4 seeded Chen Residence POs.

### File paths

- `supabase/migrations/00148_procurement_workspace_v1.sql` — create (Engineer A)
- `supabase/seed/procurement_workspace_dev.sql` — create (Engineer A)
- `packages/supabase/src/hooks/use-procurement.ts` — create (Engineer B)
- `packages/supabase/src/hooks/index.ts` — modify (Engineer B)
- `supabase/migrations/00066_proposal_project_flow_v2.sql` — reference for `project_ffe_items` column list
- `supabase/migrations/00058_tighten_rls_policies.sql` — reference RLS pattern with `user_has_role`
- `packages/supabase/src/hooks/use-project-v2.ts` — hook style reference
- `packages/supabase/src/hooks/use-vendors.ts` — vendor extension reference
