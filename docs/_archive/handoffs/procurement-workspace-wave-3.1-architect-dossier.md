Now I have all the context I need. Let me compose the full design dossier.

---

# Procurement Workspace — Wave 3.1 Architect Dossier

**Sprint 3 · Wave 3.1 · Data Architect deliverable**
**Status:** Complete · Hand-off to Wave 3.2 (Edge Function Engineer + Migration Engineer + Component Builder, parallel)
**Source orchestration plan:** `/Users/kody/.claude/plans/read-docs-prds-patina-procurement-worksp-steady-forest.md` §4 Sprint 3
**PRD references:** §3 (scope table), §11 (Bookkeeper Export modal), §12 Phase 3 (capture-to-slot, notifications, pilot), §13 (v2 deferrals)

---

## Reading Summary

Key facts extracted from the codebase before designing:

- `user_roles`, `roles`, and `user_has_role()` are in `00021_user_management_foundation.sql`. `studio_owner` role is seeded in `00022_seed_roles_permissions.sql`. `useUserRoles()` already exists in `packages/supabase/src/hooks/use-permissions.ts` (line 117). `useIsStudioOwner()` does NOT exist — must be added.
- `proposal_captures` table (migration 00130) is the existing capture-to-proposal pipeline. It writes `proposal_items` rows (pre-activation) not `project_ffe_items` rows (post-activation). Sprint 3 scope is the post-activation path: product → `project_ffe_items.product_id`. The linkage column already exists: `project_ffe_items.product_id UUID REFERENCES products(id) ON DELETE SET NULL` (00066 line 261).
- Products written by the Chrome extension use `products.captured_by` (nullable per 00060). The extension builds payloads via `apps/extension/src/lib/payloads.ts`. The extension does NOT write to `project_ffe_items` — that is exclusively a portal-side write path with RLS guarded through `projects.designer_id = auth.uid()`.
- PostHog is initialized at `apps/designer-portal/src/lib/analytics/posthog.ts`. Event tracking pattern is `apps/designer-portal/src/lib/analytics/events.ts`. Feature flag reading pattern follows `posthog.isFeatureEnabled(flagName)` — no existing `useFeatureFlag` wrapper hook, but one must be added.
- CSP `connect-src` in `apps/designer-portal/next.config.js` (lines 26–27) needs a `https://us.i.posthog.com` entry for PostHog events + flag evaluation; also needs `https://api.patina.cloud/functions/v1/qbo-export` — actually already covered by `https://api.patina.cloud`.
- The edge function main dispatcher at `supabase/functions/main/index.ts` spawns user workers by path segment. New function `qbo-export` just needs its directory at `supabase/functions/qbo-export/index.ts` — the dispatcher routes automatically.
- `notification-dispatch` edge function (existing) handles email/push/in_app channels via `notification_log` table. Sprint 3 procurement notifications are a separate, simpler in-app-only table.
- Next available migration number: **00151**.
- `purchase_orders.delivered_date` (added 00150), `po_payments.state` enum `pending | due | paid` (00148), `po_payments.kind` enum `deposit | balance | milestone` (00148) — all wire contracts respected.
- `delivery_events` view is SECURITY INVOKER (enforces caller's RLS). The QBO export edge function will NOT use this view — it queries `purchase_orders` + `po_payments` directly with service-role.

---

## Section 1: QBO CSV Column Mapping (PRD §11)

### Design decision: one row per `po_payments` row

The PRD §11 preview shows "23 transactions · 8 vendors · $42,800 total." With 8 POs across 5 vendors in the seed data, 23 transactions confirms one row per payment event (deposit + balance = 2 rows per 50/50 PO, single row for net_30, etc.). This maps directly to the `po_payments` table shape. A single PO like PO 8 (custom_milestones, 3 rows) contributes 3 CSV rows.

### QBO Bills Import CSV column spec

QuickBooks Online's "Bills" import format (the standard vendor-bill CSV accepted by QBO's Import Data function) expects these columns. The mapping below follows the canonical QBO Bills import template with Patina-specific derivations:

| # | Header string | Source | Notes |
|---|---|---|---|
| 1 | `Vendor` | `vendors.name` | Required by QBO. Escape commas/quotes per RFC 4180. |
| 2 | `Bill Date` | `purchase_orders.created_at::date` | ISO 8601 `YYYY-MM-DD`. QBO accepts this format. Use PO created_at as the "bill origination" date. |
| 3 | `Due Date` | `po_payments.due_date` | ISO 8601. NULL renders as empty string (not required by QBO). |
| 4 | `Bill No.` | `purchase_orders.vendor_po_number` | QBO's reference number field. Falls back to `po.id::text` if vendor_po_number is NULL. |
| 5 | `Line Description` | `[kind_label] — [project_name]` | Derived: `'Deposit' / 'Balance' / 'Milestone [label]'` + ` — ` + `projects.name`. Max 4000 chars (QBO limit). |
| 6 | `Line Amount` | `po_payments.amount_cents / 100.0` | Formatted as decimal string with 2 decimal places (`3400.00`). No currency symbol (QBO infers USD). |
| 7 | `Account` | `"Cost of Goods Sold"` | Default QBO chart-of-accounts category. Bookkeeper overrides manually in QBO after import if needed. String is a QBO-recognized account name. |
| 8 | `Payment Status` | `po_payments.state` | Rendered as `"Paid"` / `"Unpaid"` (QBO's expected payment status values). Map: `paid` → `"Paid"`, `due` | `pending` → `"Unpaid"`. |
| 9 | `Paid Date` | `po_payments.paid_date` | ISO 8601. Empty string if NULL. |
| 10 | `Project` | `projects.name` | Not a standard QBO Bills field but accepted as an extra column (QBO ignores unknown columns on import). Included for bookkeeper reconciliation. |
| 11 | `Payment Pattern` | `purchase_orders.payment_pattern` | Extra column (ignored by QBO, useful for bookkeeper). Render human-readable: `"50/50"` / `"30/70"` / `"Full Upfront"` / `"NET-30"` / `"Custom Milestones"`. |

**Header row (exact):**

```
Vendor,Bill Date,Due Date,Bill No.,Line Description,Line Amount,Account,Payment Status,Paid Date,Project,Payment Pattern
```

**Per-row derivation example** (PO 2 from seed — Woodward & Sons, 50/50, deposit paid + balance due):

```csv
Woodward & Sons,2026-04-08,2026-04-08,WS-188,Deposit — Chen Residence,3400.00,Cost of Goods Sold,Paid,2026-04-08,Chen Residence,50/50
Woodward & Sons,2026-04-08,2026-05-12,WS-188,Balance — Chen Residence,3400.00,Cost of Goods Sold,Unpaid,,Chen Residence,50/50
```

**Payment state → `po_payments.state` filter mapping:**

| UI checkbox | Included `po_payments.state` values | Date filter anchor |
|---|---|---|
| "Deposits paid in this period" | `paid` AND `kind = 'deposit'` AND `paid_date BETWEEN start AND end` | `po_payments.paid_date` |
| "Balances paid in this period" | `paid` AND `kind IN ('balance','milestone')` AND `paid_date BETWEEN start AND end` | `po_payments.paid_date` |
| "Outstanding payments due" | `state IN ('due','pending')` AND `po.created_at BETWEEN start AND end` | `purchase_orders.created_at::date` |
| "Patina Catalog transactions" | `purchase_orders.is_patina_catalog = true` | cross-cuts all of the above |

**Filter interaction rules:**
1. If none of the three include-flags are checked, return empty CSV (no rows, just header).
2. If "Patina Catalog transactions" is unchecked (default), add `AND po.is_patina_catalog = false` to the base query.
3. `project_ids[]` filter adds `AND po.project_id = ANY(project_ids)`.
4. `vendor_ids[]` filter adds `AND po.vendor_id = ANY(vendor_ids)`.
5. All three include-flags can overlap in the same date range — UNION ALL their result sets, then ORDER BY `vendor_name, bill_date, bill_no, kind`.

**RFC 4180 quoting rule** (critical for vendor names with commas or notes with newlines):
Every field is double-quoted in the output. Embedded double-quotes are escaped as `""`. This avoids field-count drift on import. Newlines inside `notes` are replaced with a space before quoting.

---

## Section 2: Deno Edge Function Spec

### File

`supabase/functions/qbo-export/index.ts`

No shared utility file needed beyond what the runtime already provides. All logic is inline in the single file to match existing edge function conventions (e.g., `notification-dispatch/index.ts`, `companion-message/index.ts`).

### Auth and permission check

The function uses the caller's JWT to verify authentication, then switches to service-role for the actual data query (since v1 studio_owner RLS is inert — the RLS policy exists but scopes to `proj.designer_id = auth.uid()` which only matches the solo-owner case). This is safe because the service-role read is explicitly scoped via `WHERE po.designer_id = auth.uid()` using the verified JWT uid extracted from the caller's token.

The `user_has_role()` check cannot be called directly from a Deno function without going through PostgREST. Instead: call the Supabase service-role client to run a small SQL query verifying the caller's `studio_owner` role before executing the main export query.

### Request shape

```
POST /functions/v1/qbo-export
Authorization: Bearer <user-JWT>
Content-Type: application/json

{
  "startDate": "2026-04-01",   // ISO YYYY-MM-DD, required
  "endDate":   "2026-04-30",   // ISO YYYY-MM-DD, required
  "includeDepositsPaid":    true,
  "includeBalancesPaid":    true,
  "includeOutstanding":     true,
  "includePatinaCatalog":   false,
  "projectIds":   [],          // optional, empty = all projects
  "vendorIds":    []           // optional, empty = all vendors
}
```

### Pseudo-code outline

```typescript
// supabase/functions/qbo-export/index.ts
// Self-hosted edge runtime: no serve() wrapper needed.
// The main dispatcher in supabase/functions/main/index.ts routes here.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  // 1. Extract caller JWT from Authorization header.
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Missing authorization" }, 401);
  }
  const callerJwt = authHeader.slice(7);

  // 2. Create service-role client for reads; user client to resolve uid.
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const svcClient = createClient(supabaseUrl, serviceRoleKey);

  // 3. Verify auth.uid() from JWT via service-role auth.getUser(callerJwt).
  const { data: { user }, error: authError } = await svcClient.auth.getUser(callerJwt);
  if (authError || !user) {
    return json({ error: "Unauthorized" }, 401);
  }
  const callerId = user.id;

  // 4. Verify studio_owner role.
  const { data: roleRows } = await svcClient
    .from("user_roles")
    .select("role:roles(name)")
    .eq("user_id", callerId);
  const hasStudioOwner = roleRows?.some((r: any) => r.role?.name === "studio_owner");
  if (!hasStudioOwner) {
    return json({ error: "Forbidden: studio_owner role required" }, 403);
  }

  // 5. Parse and validate request body.
  let body: ExportParams;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const { startDate, endDate, includeDepositsPaid, includeBalancesPaid,
          includeOutstanding, includePatinaCatalog, projectIds, vendorIds } = body;

  if (!startDate || !endDate) {
    return json({ error: "startDate and endDate are required" }, 400);
  }
  if (!includeDepositsPaid && !includeBalancesPaid && !includeOutstanding) {
    // Return header-only CSV — valid, zero rows.
    return csvResponse(CSV_HEADER + "\n", startDate);
  }

  // 6. Build UNION ALL query for all three include-buckets.
  //    Scoped to callerId's own purchase_orders (designer_id = callerId).
  //    projectIds / vendorIds filters applied if non-empty.
  const rows = await fetchExportRows(svcClient, {
    callerId, startDate, endDate,
    includeDepositsPaid, includeBalancesPaid, includeOutstanding, includePatinaCatalog,
    projectIds: projectIds ?? [],
    vendorIds:  vendorIds  ?? [],
  });

  // 7. Render CSV.
  const csv = [CSV_HEADER, ...rows.map(renderRow)].join("\n") + "\n";
  return csvResponse(csv, startDate);
});
```

### SQL query strategy (inside `fetchExportRows`)

The function runs a single parameterized SQL query via `svcClient.rpc()` or a raw SQL call through the PostgREST `/rpc` path. To keep it simple and avoid creating a new RPC (which requires a migration), use the service-role client's `.from()` chained query:

```sql
-- Conceptual SQL. Implemented as a programmatic Supabase client query
-- composed in TypeScript. UNION ALL of the three buckets.

SELECT
  v.name            AS vendor_name,
  po.created_at::date AS bill_date,
  pmt.due_date,
  COALESCE(po.vendor_po_number, po.id::text) AS bill_no,
  CASE
    WHEN pmt.kind = 'deposit'   THEN 'Deposit — ' || proj.name
    WHEN pmt.kind = 'balance'   THEN 'Balance — ' || proj.name
    WHEN pmt.kind = 'milestone' THEN 'Milestone ' || COALESCE(pmt.label,'') || ' — ' || proj.name
  END AS line_description,
  (pmt.amount_cents / 100.0)::numeric(12,2) AS line_amount,
  'Cost of Goods Sold' AS account,
  CASE WHEN pmt.state = 'paid' THEN 'Paid' ELSE 'Unpaid' END AS payment_status,
  pmt.paid_date,
  proj.name AS project_name,
  po.payment_pattern
FROM po_payments pmt
JOIN purchase_orders po ON po.id = pmt.purchase_order_id
JOIN vendors v          ON v.id  = po.vendor_id
JOIN projects proj      ON proj.id = po.project_id
WHERE po.designer_id = $callerId
  AND (po.is_patina_catalog = false OR $includePatinaCatalog = true)
  AND (array_length($projectIds, 1) IS NULL OR po.project_id = ANY($projectIds))
  AND (array_length($vendorIds, 1) IS NULL  OR po.vendor_id  = ANY($vendorIds))
  AND (
        -- Deposits paid in period
        ($includeDepositsPaid  AND pmt.kind = 'deposit'
         AND pmt.state = 'paid' AND pmt.paid_date BETWEEN $startDate AND $endDate)
        OR
        -- Balances/milestones paid in period
        ($includeBalancesPaid  AND pmt.kind IN ('balance','milestone')
         AND pmt.state = 'paid' AND pmt.paid_date BETWEEN $startDate AND $endDate)
        OR
        -- Outstanding payments (anchor on PO created_at in period)
        ($includeOutstanding   AND pmt.state IN ('due','pending')
         AND po.created_at::date BETWEEN $startDate AND $endDate)
      )
ORDER BY vendor_name, bill_date, bill_no,
         CASE pmt.kind WHEN 'deposit' THEN 0 WHEN 'balance' THEN 1 ELSE 2 END,
         pmt.sort_order
```

This is expressed in TypeScript as sequential `.from('po_payments').select(...)` joins using Supabase client PostgREST syntax, or as a single raw SQL call via `svcClient.rpc('qbo_export_query', params)` if TypeScript chain gets unwieldy. For v1, the TypeScript-chain approach is preferred to avoid a migration dependency.

### Response

```
HTTP/1.1 200 OK
Content-Type: text/csv; charset=utf-8
Content-Disposition: attachment; filename="patina-vendor-bills-2026-04-30.csv"

Vendor,Bill Date,Due Date,Bill No.,Line Description,...
```

### Edge function deployment considerations (from `project_email_prod_deploy_gotchas.md`)

The QBO function has no pg_cron dependency (issue 4 from the gotchas does not apply). The relevant constraints are:

1. **Main dispatcher routing**: The `supabase/functions/main/index.ts` dispatcher routes by the first path segment. Creating `supabase/functions/qbo-export/index.ts` is sufficient — no change to `main/index.ts` needed.

2. **`--main-service` CMD**: The `Dockerfile.edge-runtime` already sets `CMD ["start", "--main-service", "/home/deno/functions/main", "--port", "9000"]`. The new function directory is automatically picked up. Confirmed pattern matches `confirm-scan-bundle` and other post-email-system functions.

3. **Migration 00079 ↔ 00081 `invoke_edge_function` conflict**: Does not apply to `qbo-export` — this function is invoked via direct HTTP call from the portal, not via `pg_cron` or `invoke_edge_function` SQL. Zero interaction with the dual-auth header issue.

4. **CSP**: The portal's `connect-src` already includes `https://api.patina.cloud` (lines 26–27 of `apps/designer-portal/next.config.js`). No CSP change needed for QBO export calls.

5. **`SUPABASE_SERVICE_ROLE_KEY` env var**: Available to edge functions at runtime via `Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")`. This is injected by the edge runtime container from the Coolify env, not from pg_cron. No migration interaction.

---

## Section 3: Notifications Model

### Decision rationale

The existing `notification-dispatch` edge function and `notification_log` table serve the email/push pipeline. Sprint 3 procurement notifications are in-app-only badge counts and a dismissible notification feed — they do not go through Resend or push tokens. A dedicated `procurement_notifications` table is the right design: it avoids coupling to the email template system, keeps the procurement domain isolated, and is trivially extendable to email in v2 by adding a trigger that calls `notification-dispatch`.

### Migration 00151 — `procurement_notifications` table + triggers

**File:** `supabase/migrations/00151_procurement_notifications.sql`

```sql
-- ============================================================================
-- Migration 00151: Procurement Notifications
--
-- Adds procurement_notifications (in-app only for v1) + lightweight Postgres
-- triggers on po_payments and damage_claims to auto-create notification rows.
-- Migration 00150 must be applied first.
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
  'deposit_due / balance_due / milestone_due: fired when po_payments.state transitions to due. '
  'delivery_this_week: fired when purchase_orders.confirmed_eta falls within the next 7 days (pg_cron job, v2). '
  'damage_claim_drafted: fired on INSERT into damage_claims.';

-- ─── PART 2: procurement_notifications TABLE ─────────────────────────────────

CREATE TABLE procurement_notifications (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind                    procurement_notification_kind NOT NULL,
  subject_purchase_order_id UUID      REFERENCES purchase_orders(id) ON DELETE CASCADE,
  subject_payment_id      UUID        REFERENCES po_payments(id) ON DELETE CASCADE,
  subject_inspection_id   UUID        REFERENCES receiving_inspections(id) ON DELETE CASCADE,
  read_at                 TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
  'FK to receiving_inspections ON DELETE CASCADE.';

-- ─── PART 3: INDEXES ────────────────────────────────────────────────────────

-- Primary read path: unread count badge + notification feed for a user.
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

-- INSERT and DELETE are service-role only (triggers use service role context).
-- No authenticated INSERT policy — clients never insert directly.

-- ─── PART 5: TRIGGER — po_payments state→due TRANSITION ─────────────────────
--
-- Fires AFTER UPDATE on po_payments when state transitions from a non-due value
-- to 'due'. Identifies the designer_id from the parent purchase_orders row
-- and inserts a notification.
--
-- The trigger deliberately uses SECURITY DEFINER with a stable search_path
-- so it runs with the postgres role and can INSERT into procurement_notifications
-- without needing an authenticated INSERT policy.

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

CREATE TRIGGER trg_notify_payment_due
  AFTER UPDATE ON po_payments
  FOR EACH ROW
  EXECUTE FUNCTION notify_payment_due();

-- ─── PART 6: TRIGGER — damage_claims INSERT auto-draft ─────────────────────
--
-- Fires AFTER INSERT on damage_claims (state = 'drafted' only — which is the
-- default, so this fires on every new damage claim).
-- Resolves designer_id via the receiving_inspections → purchase_orders chain.

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

CREATE TRIGGER trg_notify_damage_claim_drafted
  AFTER INSERT ON damage_claims
  FOR EACH ROW
  EXECUTE FUNCTION notify_damage_claim_drafted();

-- ─── PART 7: COMMENTS ON POLICIES ───────────────────────────────────────────

COMMENT ON POLICY "Users read their own procurement notifications"
  ON procurement_notifications IS
  'Scoped to auth.uid(). Notification rows are created by SECURITY DEFINER triggers — '
  'not by the authenticated user. No authenticated INSERT policy is needed.';
```

### Hook stubs

Append to `packages/supabase/src/hooks/use-procurement.ts`:

```typescript
// ═══════════════════════════════════════════════════════════════════════════
// TYPES — Sprint 3 Notifications
// ═══════════════════════════════════════════════════════════════════════════

export type ProcurementNotificationKind =
  | 'deposit_due'
  | 'balance_due'
  | 'milestone_due'
  | 'delivery_this_week'
  | 'damage_claim_drafted';

export interface ProcurementNotification {
  id: string;
  user_id: string;
  kind: ProcurementNotificationKind;
  subject_purchase_order_id: string | null;
  subject_payment_id: string | null;
  subject_inspection_id: string | null;
  read_at: string | null;
  created_at: string;
  // Optional joins for display
  purchase_order?: {
    id: string;
    vendor_id: string;
    project_id: string;
    vendor?: { id: string; name: string };
    project?: { id: string; name: string };
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// QUERY HOOKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Returns procurement notifications for the authenticated user.
 * Query key: ['procurement-notifications', { unreadOnly }]
 * staleTime: 60 seconds. Realtime subscription recommended for v2.
 */
export function useProcurementNotifications(opts?: {
  unreadOnly?: boolean;
  limit?: number;
}): UseQueryResult<ProcurementNotification[]>;

/**
 * Returns the count of unread procurement notifications.
 * Rendered as a badge on the Procurement nav zone.
 * Query key: ['procurement-unread-count']
 * staleTime: 30 seconds. Never throws — returns 0 on error.
 */
export function useProcurementUnreadCount(): UseQueryResult<number>;

// ═══════════════════════════════════════════════════════════════════════════
// MUTATION HOOKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Marks a single notification as read. Sets read_at = now().
 * Invalidates: ['procurement-notifications'], ['procurement-unread-count']
 *
 * Input: { notificationId: string }
 */
export function useMarkNotificationRead(): UseMutationResult<
  ProcurementNotification,
  Error,
  { notificationId: string }
>;

/**
 * Marks all unread notifications for the current user as read.
 * Invalidates: ['procurement-notifications'], ['procurement-unread-count']
 */
export function useMarkAllNotificationsRead(): UseMutationResult<
  { count: number },
  Error,
  void
>;
```

**Implementation notes for Wave 3.2 Migration Engineer:**
- `useProcurementNotifications` query: `.from('procurement_notifications').select('*, purchase_order:purchase_orders(id, vendor_id, project_id, vendor:vendors(id, name), project:projects(id, name))').eq('user_id', user.id).order('created_at', { ascending: false })`. Add `.is('read_at', null)` when `unreadOnly: true`.
- `useProcurementUnreadCount`: `.from('procurement_notifications').select('id', { count: 'exact', head: true }).eq('user_id', user.id).is('read_at', null)`. Return `count ?? 0`. Wrap in try/catch returning 0.
- `useMarkNotificationRead`: `.update({ read_at: new Date().toISOString() }).eq('id', notificationId).eq('user_id', user.id)`.

---

## Section 4: Studio-Owner Permission Gating

### Role infrastructure (existing)

- `user_roles` table: `00021_user_management_foundation.sql`
- `studio_owner` role seeded: `00022_seed_roles_permissions.sql` line 17
- `user_has_role(p_user_id, p_role_name)` function: `00021_user_management_foundation.sql` line 472
- `useUserRoles()` hook: `packages/supabase/src/hooks/use-permissions.ts` line 117 — returns `UserRoleAssignment[]` where each item has `.role.name`
- No `useIsStudioOwner()` convenience hook exists yet — must be added

### New convenience hook (add to `use-permissions.ts`)

```typescript
/**
 * Returns whether the authenticated user has the studio_owner role.
 * Uses the existing useUserRoles() data so it does not make an extra network call.
 * Returns { isStudioOwner: false, isLoading: true } while roles are loading.
 */
export function useIsStudioOwner(): { isStudioOwner: boolean; isLoading: boolean } {
  const { data: roles, isLoading } = useUserRoles();

  if (isLoading || !roles) {
    return { isStudioOwner: false, isLoading: true };
  }

  const isStudioOwner = roles.some(r => r.role.name === 'studio_owner');
  return { isStudioOwner, isLoading: false };
}
```

Export from `packages/supabase/src/hooks/index.ts`.

### Client-side gating surfaces

**Surface 1: "Export to QBO" CTA in the procurement subnav**

The subnav is rendered by `apps/designer-portal/src/components/portal/procurement-subnav.tsx` (file confirmed to not yet exist — it is created by Sprint 2 Component Builder or is part of the procurement layout). Wave 3.2 Component Builder locates the subnav rendering component (likely in `apps/designer-portal/src/app/(portal)/portal/procurement/layout.tsx` or a subnav component file) and adds:

```tsx
const { isStudioOwner, isLoading: rolesLoading } = useIsStudioOwner();

// In the subnav JSX:
{!rolesLoading && isStudioOwner && (
  <button onClick={() => setExportModalOpen(true)}>
    Export to QBO
  </button>
)}
```

The CTA is hidden — not disabled — for non-studio-owners. This is intentional: a regular designer should not see the option at all, consistent with PRD §11 ("Studio owner only. No bookkeeper login, no permissions matrix.").

**Surface 2: Payment data visibility**

In v1, payment data (`po_payments`) is readable by the owning designer. No additional gating needed for viewing. The studio_owner read policy on `po_payments` is present in migration 00148 (INERT v1 pattern — scopes to `proj.designer_id = auth.uid()`). This remains inert and is not changed.

### Server-side gating (edge function)

As specified in Section 2: the edge function checks `user_roles` via service-role client before executing the query. Returns `403` with `{ error: "Forbidden: studio_owner role required" }`.

### v2 path — real studio membership

When studios grow to multi-designer, the studio_owner gating needs a `studio_members` table:

```sql
-- v2 only — do NOT create in Sprint 3
CREATE TABLE studio_members (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id  UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('owner','designer','bookkeeper')),
  invited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  UNIQUE (studio_id, user_id)
);
```

The QBO export edge function would then accept `studio_id` param and scope `WHERE po.designer_id = ANY(SELECT user_id FROM studio_members WHERE studio_id = $studioId AND role IN ('owner','designer'))`. The client-side `useIsStudioOwner()` hook would query `studio_members.role = 'owner'` instead of `user_roles.name = 'studio_owner'`.

---

## Section 5: Capture-to-Slot Integration (PRD §12 Phase 3)

### Existing capture pipeline anatomy

The Chrome extension (Plasmo, `apps/extension/`) writes to two tables:
1. `products` — via `buildProductInsertPayload()` in `apps/extension/src/lib/payloads.ts`. Sets `captured_by = userId`. This is "Layer 1" (raw captured product).
2. `proposal_captures` — via `buildCapturePayload()`. Links a `product_id` to a `proposal_id + scope_room_id` in a proposal (pre-project-activation). The `consume_capture()` RPC in migration 00130 turns a `proposal_capture` into a `proposal_items` row.

The Sprint 3 "capture-to-slot" scope per the brief is: captured product → **`project_ffe_items.product_id`** (post-activation project, not pre-activation proposal). This is a different path than `consume_capture()` which writes to `proposal_items`.

### Schema decision: no new table needed

`project_ffe_items.product_id` (migration 00066 line 261) already exists as a nullable FK to `products`. Setting this column is the entirety of the "slot assignment" operation. No `captured_at_slot` column is needed because:
- The slot already has `updated_at` (from the `update_updated_at` trigger)
- `products.captured_at` records when the product was captured
- An audit trail is not required for v1 (PRD §13 doesn't list capture audit as a v2 deferred feature)

There is no need for a `captures` audit table in v1. The `proposal_captures` table already serves as the capture inbox for pre-activation flows. Post-activation (project FFE) slot assignment is a direct mutation.

### Hook spec

Add to `packages/supabase/src/hooks/use-procurement.ts` (or more naturally to `packages/supabase/src/hooks/use-project-v2.ts` since it modifies `project_ffe_items`). Given the domain belongs more to the project layer, place it in `use-project-v2.ts` alongside `useUpdateFFEItemStatus` and `useProjectFFEItems`.

```typescript
/**
 * Assigns a captured product to a specific FFE item slot in a project.
 * Sets project_ffe_items.product_id = productId WHERE id = ffeItemId.
 *
 * RLS check: the designer must own the project that contains the FFE item.
 * This is enforced by the existing policy:
 *   "Designers manage their project FFE items" ON project_ffe_items FOR ALL
 *   USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.designer_id = auth.uid()))
 *
 * No schema change needed. No new migration needed.
 *
 * Invalidates: ['project-ffe-items', projectId], ['purchase-orders', { projectId }]
 *              (so By Vendor + By Status views refresh)
 *
 * Input: { productId: string; ffeItemId: string; projectId: string }
 */
export function useAssignProductToFfeSlot(): UseMutationResult<
  { id: string; product_id: string },
  Error,
  { productId: string; ffeItemId: string; projectId: string }
>;
```

**Implementation:**
```typescript
// Inside the mutation function:
const { data, error } = await supabase
  .from('project_ffe_items')
  .update({ product_id: productId })
  .eq('id', ffeItemId)
  .select('id, product_id')
  .single();
```

### Extension integration scope boundary

The Chrome extension does NOT call `useAssignProductToFfeSlot` directly — it is a browser extension with its own Supabase client. The assignment happens in the designer portal when the designer drags/drops or selects a captured product into an FFE slot. The extension's role ends at writing the `products` row and optionally a `proposal_captures` row. The portal surfaces the captured product via the existing product picker.

Wave 3.3 (Integration Engineer) will wire the Extension Sidepanel's "Send to slot" UI (if it exists) or will add a "Select from my captures" option to the FFE item product picker in the portal. The `useAssignProductToFfeSlot` mutation is the exact hook that wave calls.

### Layer promotion scope clarification

PRD §12 Phase 3 lists "Layer 1 → Layer 2 promotion flow" and "Layer 2 → Layer 3 nomination flow." Per the brief's explicit out-of-scope statement, admin-portal-side layer promotion is out of Sprint 3 scope. What IS in scope:
- **Layer 1 → Layer 2 (for designer):** this is simply assigning a product to an FFE slot via `useAssignProductToFfeSlot`. The designer "promotes" an unvetted capture by actively placing it.
- **Layer 2 → Layer 3 (nomination):** marking a product as "suggested for Patina Catalog" — this is `products.status = 'nominated'` or similar. Check migration 00060 for current `products.status` column. If a `nominated_for_catalog` boolean doesn't exist, Wave 3.3 Integration Engineer adds it as part of the promotion UI (not a migration in this sprint — check first, add via 00152 if needed).

The data architect recommendation: **do not add a Layer 2→3 column in migration 00151**. Leave it to Wave 3.3's Integration Engineer to verify whether `products.status` already covers this or if a new boolean is needed, then add it in a follow-on migration if required. This is explicitly deferred from the data layer dossier to avoid blocking on a decision that belongs in the product domain.

---

## Section 6: PostHog Feature Flag + Metrics Spec

### Feature flag

**Flag name:** `procurement-workspace-pilot`
**Type:** Boolean
**Default:** Off (false for all users)
**Initial cohort:** Enable for `kody@kochaver.com` (prod UUID `e01db20f-87c6-45a6-bc18-84c68e0e7452`) + 2 designers to be named by Kody at pilot turn-on. Configure in PostHog dashboard — no code change needed to add users to the cohort.

### Gating implementation

**Navigation gating** (`apps/designer-portal/src/config/navigation.ts`):

The `ZONES` array is a static config — it does not currently support async feature flag evaluation. The correct pattern is to keep the zone config as-is (procurement zone stays in the array) but conditionally hide/show the nav entry in the zone renderer component.

Wave 3.4 Analytics Engineer locates the component that renders the top-level nav zones (likely `apps/designer-portal/src/components/portal/portal-shell.tsx` or the nav bar component from Sprint 1 builder work) and wraps the procurement zone entry:

```tsx
// In the component that maps ZONES to nav items:
import { useFeatureFlag } from '@/hooks/use-feature-flag';

// ...inside the component:
const pilotEnabled = useFeatureFlag('procurement-workspace-pilot');

// Filter zones before rendering:
const visibleZones = ZONES.filter(zone => {
  if (zone.key === 'procurement') return pilotEnabled;
  return true;
});
```

**Route gating** — the `/portal/procurement/*` route group should show a "Coming soon" placeholder when the flag is off. Add to `apps/designer-portal/src/app/(portal)/portal/procurement/layout.tsx`:

```tsx
// At the top of the layout:
import { useFeatureFlag } from '@/hooks/use-feature-flag';

export default function ProcurementLayout({ children }: { children: React.ReactNode }) {
  const pilotEnabled = useFeatureFlag('procurement-workspace-pilot');
  if (!pilotEnabled) {
    return <ComingSoonPlaceholder zone="Procurement" />;
  }
  return <>{children}</>;
}
```

**`useFeatureFlag` hook** (create at `apps/designer-portal/src/hooks/use-feature-flag.ts`):

```typescript
import { posthog } from '@/lib/analytics/posthog';
import { useState, useEffect } from 'react';

/**
 * Returns the boolean value of a PostHog feature flag.
 * Returns true (enabled) when PostHog is unreachable or uninitialized —
 * fail-open so the procurement workspace remains accessible to pilot users
 * even if PostHog is down.
 *
 * Fail-open rationale: the feature is built and safe; PostHog is analytics
 * infrastructure, not auth infrastructure. A PostHog outage should not lock
 * pilot users out of their workspace.
 */
export function useFeatureFlag(flagName: string): boolean {
  const [enabled, setEnabled] = useState<boolean>(true); // fail-open default

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // onFeatureFlags fires when flags load. If PostHog is not initialized
    // (key not set, network blocked), the callback never fires and the
    // initial true default remains.
    const unsubscribe = posthog.onFeatureFlags(() => {
      const value = posthog.isFeatureEnabled(flagName);
      // isFeatureEnabled returns undefined if flag doesn't exist — treat as enabled.
      setEnabled(value !== false);
    });

    // Check immediately in case flags are already loaded.
    const immediate = posthog.isFeatureEnabled(flagName);
    if (immediate !== undefined) {
      setEnabled(immediate !== false);
    }

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [flagName]);

  return enabled;
}
```

### Exposure events

Add to `apps/designer-portal/src/lib/analytics/events.ts`:

```typescript
export const procurementEvents = {
  /** Fired when user navigates into /portal/procurement/*. */
  zoneVisited: (properties?: { sub_view?: string }) =>
    track('procurement_zone_visited', properties),

  /** Fired when useCreatePurchaseOrder mutation succeeds. */
  poCreated: (properties?: {
    payment_pattern?: string;
    vendor_id?: string;
    total_cents?: number;
  }) => track('procurement_po_created', properties),

  /** Fired when useCreateReceivingInspection mutation succeeds. */
  inspectionLogged: (properties?: { outcome?: string; has_photos?: boolean }) =>
    track('procurement_inspection_logged', properties),

  /** Fired when qbo-export edge function returns a CSV (HTTP 200). */
  qboExported: (properties?: {
    row_count?: number;
    date_range_days?: number;
    include_paid?: boolean;
    include_outstanding?: boolean;
  }) => track('procurement_qbo_exported', properties),

  /** Fired when a damage claim is created (auto-draft or manual). */
  damageClaimCreated: (properties?: { outcome?: string }) =>
    track('procurement_damage_claim_created', properties),
};
```

**Wiring guidance for Wave 3.4:**
- `zoneVisited`: call in `apps/designer-portal/src/app/(portal)/portal/procurement/layout.tsx` `useEffect` on mount (once per zone entry, not per tab switch).
- `poCreated`: call in `useCreatePurchaseOrder`'s `onSuccess` callback in the Order Assistant component.
- `inspectionLogged`: call in `useCreateReceivingInspection`'s `onSuccess` in the Log Delivery form.
- `qboExported`: call in the Bookkeeper Export modal component after the fetch to `qbo-export` returns 200.
- `damageClaimCreated`: call in the `useCreateReceivingInspection` `onSuccess` when `outcome !== 'clean'` (since damage claim auto-drafts in that path).

### Success metrics spec (for Wave 3.4 dashboard tiles)

| # | Metric name | PostHog query type | Data source | Target |
|---|---|---|---|---|
| 1 | Order-day duration | Funnel or custom insight | Time between `procurement_po_created` events, grouped by designer_id per week. Or: query `purchase_orders WHERE status IN ('ordered','confirmed','in_production',...)` + `created_at` vs first status-change timestamp. | 60% reduction vs Sprint 1 baseline (Sprint 1 had no event tracking, so baseline = first 2 weeks of pilot) |
| 2 | Damage discovery lag | HogQL trend | `procurement_inspection_logged` events where `outcome != 'clean'`, correlated with `procurement_po_created` where the `confirmed_eta` is the delivery date. In-DB: `AVG(ri.inspected_at::date - po.delivered_date)` for POs where `delivered_date IS NOT NULL AND outcome != 'clean'`. | Under 48 hours |
| 3 | Payment status accuracy | Funnel completion or HogQL | `SELECT COUNT(*) FROM purchase_orders po WHERE NOT EXISTS (SELECT 1 FROM po_payments WHERE purchase_order_id = po.id)` divided by total POs. Target: 0% orphaned POs (100% have payment rows). Secondary: PO count with payment_pattern = 'fifty_fifty' has exactly 2 po_payments rows. | 100% of POs have payment state |
| 4 | Bookkeeper handoff time | Session analysis | Average time between consecutive `procurement_qbo_exported` events per designer_id. High frequency (weekly) = bookkeeper happy. | Subjective — report frequency |
| 5 | Calendar conflicts prevented | Custom trend | Count of `DeliveryConflict` objects shown in the Calendar (surfaced via a `procurement_zone_visited` property `{ sub_view: 'calendar', conflict_count: N }` — add this to the zoneVisited event payload). Count conflicts where the conflict date is in the future at the time of viewing. | Increase over pilot period |

**Metric 5 implementation note:** The calendar conflict count requires a small property addition to `zoneVisited`. When navigating to the calendar sub-view, pass `{ sub_view: 'calendar', conflicts_shown: detectDeliveryConflicts(events).length }`. This gives the Analytics Engineer a filterable property without requiring a separate event.

---

## Section 7: Migration and Deployment Risks

**Risk 1 — 00151 trigger interaction with the W1.2.6 compensating-delete pattern**

The Wave 1.2.6 compensating delete (`useCreateReceivingInspection` step 4 failure) deletes the `receiving_inspections` row that was just inserted. If `trg_notify_damage_claim_drafted` fires on the `damage_claims` INSERT and THEN the compensating delete removes the `receiving_inspections` row, the notification row is left with a dangling `subject_inspection_id` — UNLESS the FK is `ON DELETE CASCADE`.

Migration 00151 defines `subject_inspection_id UUID REFERENCES receiving_inspections(id) ON DELETE CASCADE`. If the compensating delete on `receiving_inspections` fires (inspection delete → damage_claims delete via `damage_claims.receiving_inspection_id ON DELETE RESTRICT` blocks), the delete chain fails silently or throws.

Correct ordering: the compensating delete in Wave 1.2.6 deletes `damage_claims` first (it already does per the dossier: "compensating DELETE on the inspection row — step 4 failure rolls back to pre-mutation state"), then deletes `receiving_inspections`. When `damage_claims` is deleted, the `procurement_notifications` row with `subject_inspection_id` is also deleted via CASCADE. This is correct behavior — no orphaned notification.

**Verification:** Wave 3.2 Migration Engineer must test: INSERT inspection (outcome=damaged) → damage_claim auto-draft → notification created → simulate step 4 failure (manual DELETE of damage_claim then DELETE of inspection) → confirm notification is also gone.

**Risk 2 — po_payments trigger on state changes triggered by existing hooks**

`useAdvancePaymentToDue` and `useLogPaymentPaid` already UPDATE `po_payments.state`. The new `trg_notify_payment_due` trigger fires on ANY UPDATE where `NEW.state = 'due' AND OLD.state != 'due'`. This is intentional — those hooks are the state-transition mechanism. However, the test suite must be updated: unit tests that mock Supabase UPDATE responses on `po_payments` will now also trigger this DB-side effect. Since unit tests use mocked Supabase clients, the trigger does not fire in test environments (it's a DB trigger, not application code). No test change needed for existing tests. The Migration Engineer should add a specific test for the notification-creation path using the real migration applied locally.

**Risk 3 — Edge function deploy: main dispatcher routing**

New functions added after initial deploy do NOT auto-appear until the edge runtime container is restarted and picks up the new directory. The deploy sequence is: (1) add `supabase/functions/qbo-export/index.ts` to the repo, (2) rebuild the edge runtime Docker image, (3) restart the container via Coolify. The `Dockerfile.edge-runtime` copies all function directories from `supabase/functions/` — adding a new directory is sufficient. No change to `main/index.ts` needed.

The `Dockerfile.edge-runtime` path: check `infra/Dockerfile.edge-runtime` (or equivalent). Confirm the COPY instruction copies `supabase/functions/` recursively. If using the standard pattern `COPY supabase/functions/ /home/deno/functions/`, it will pick up `qbo-export/` automatically.

**Risk 4 — Feature flag rollout safety (PostHog unreachable)**

The `useFeatureFlag` hook in Section 6 is designed fail-open: returns `true` (enabled) when PostHog is unreachable or uninitialized. This means non-pilot users on a PostHog outage would see the procurement workspace. Acceptable for v1 since: (a) the workspace is not dangerous to non-pilot users, and (b) failing closed would lock pilot users out. Operators who want strict enforcement can set `NEXT_PUBLIC_POSTHOG_ENABLE_IN_DEV=false` and ensure PostHog key is in prod env.

If strict gating is required, the flag default should be changed to fail-closed (return `false`). Document this decision in the Wave 3.4 dispatch brief and let Kody decide. The architect recommends fail-open for a workspace feature (vs. fail-open for a payment feature which should fail-closed).

**Risk 5 — studio_owner role presence in prod**

Migration 00022 seeds the `studio_owner` role into the `roles` table. The `user_roles` table entry for a specific user must be inserted manually or via a seed/admin operation. The role definition exists in prod if migration 00022 has been applied (it has, per Sprint 1 gate report confirming 00148 + 00149 applied cleanly, which require 00022 upstream).

However, Kody (`e01db20f`) needs the `studio_owner` role assigned in `user_roles`. Verify: `SELECT ur.id FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = 'e01db20f-87c6-45a6-bc18-84c68e0e7452' AND r.name = 'studio_owner';` — if no row returned, insert via admin SQL before testing the QBO export. The Wave 3.2 Edge Function Engineer's acceptance criteria should include: "qbo-export returns 403 for a user without studio_owner role, and 200 CSV for kody@kochaver.com."

**Risk 6 — QBO CSV character encoding: vendor names with commas, quotes, newlines**

Vendor names like `"Woodward & Sons"` and notes fields may contain commas, double-quotes, or newlines. RFC 4180 requires: (a) all fields must be double-quoted when any field in the row contains a comma, newline, or double-quote; (b) embedded double-quotes are escaped as `""`. The safest implementation: double-quote every field unconditionally, escape embedded `"` as `""`, replace embedded newlines (`\n`, `\r\n`) with ` ` (space) before quoting.

The `renderRow` function in the edge function must implement this:

```typescript
function csvField(value: string | null | undefined): string {
  const s = (value ?? '').toString().replace(/[\r\n]+/g, ' ');
  return `"${s.replace(/"/g, '""')}"`;
}

function renderRow(row: ExportRow): string {
  return [
    csvField(row.vendor_name),
    csvField(row.bill_date),
    csvField(row.due_date),
    csvField(row.bill_no),
    csvField(row.line_description),
    csvField(row.line_amount.toFixed(2)),
    csvField(row.account),
    csvField(row.payment_status),
    csvField(row.paid_date),
    csvField(row.project_name),
    csvField(humanizePattern(row.payment_pattern)),
  ].join(',');
}
```

**Risk 7 — Capture-to-slot scope: not breaking the extension write path**

The extension writes to `products` and `proposal_captures` via its own Supabase client. `useAssignProductToFfeSlot` only updates `project_ffe_items.product_id` — it does not touch `products` or `proposal_captures`. The extension's write path is fully independent.

The only risk is if Wave 3.3 Integration Engineer adds a "Send to project slot" button inside the extension's sidepanel. If so, the extension would call the Supabase client `.update({ product_id })` on `project_ffe_items` directly. This is safe because the RLS policy on `project_ffe_items` already guards: `EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.designer_id = auth.uid())`. The extension user is the same designer, so the update passes. No schema change needed.

**Risk 8 — `delivery_this_week` notification kind has no trigger in v1**

The `procurement_notification_kind` enum includes `delivery_this_week` but no trigger is defined for it in migration 00151. This is intentional — a weekly cron that scans `purchase_orders WHERE confirmed_eta BETWEEN NOW() AND NOW() + 7 days` would require pg_cron, which has the preload gotcha documented in `project_email_prod_deploy_gotchas.md` (issue 4). For v1, this kind is reserved in the enum but unused. Remove from UI rendering in the notification feed if it appears (it won't unless manually inserted). The Wave 3.2 Migration Engineer should add a `COMMENT ON` clarifying this.

---

## File Paths for Wave 3.2

### Create (new files)

- `supabase/migrations/00151_procurement_notifications.sql` — Migration Engineer A (lift Section 3 Part 1–7 verbatim)
- `supabase/functions/qbo-export/index.ts` — Edge Function Engineer (implement per Section 2)
- `apps/designer-portal/src/hooks/use-feature-flag.ts` — Component Builder (lift Section 6 verbatim)

### Modify (extend existing files)

- `packages/supabase/src/hooks/use-procurement.ts` — Migration Engineer B (append Section 3 hook stubs)
- `packages/supabase/src/hooks/use-permissions.ts` — Migration Engineer B (append `useIsStudioOwner()` from Section 4)
- `packages/supabase/src/hooks/index.ts` — Migration Engineer B (export new symbols: `useProcurementNotifications`, `useProcurementUnreadCount`, `useMarkNotificationRead`, `useMarkAllNotificationsRead`, `useIsStudioOwner`, `ProcurementNotification`, `ProcurementNotificationKind`)
- `apps/designer-portal/src/lib/analytics/events.ts` — Component Builder (append `procurementEvents` from Section 6)

### Reference (read, do not modify)

- `packages/supabase/src/hooks/use-project-v2.ts` — add `useAssignProductToFfeSlot` here (Wave 3.3)
- `supabase/migrations/00066_proposal_project_flow_v2.sql` — `project_ffe_items` column list; `product_id` exists at line 261
- `supabase/migrations/00130_proposal_captures.sql` — `consume_capture()` RPC; boundary for capture-to-proposal vs capture-to-slot
- `supabase/functions/main/index.ts` — dispatcher pattern (no change needed)
- `apps/designer-portal/src/config/navigation.ts` — ZONES array; add feature-flag gating in the rendering component, not here
- `apps/designer-portal/next.config.js` — CSP `connect-src` (lines 26–27); already covers `https://api.patina.cloud` for QBO function calls

---

## Hand-off Contract for Wave 3.2

**Edge Function Engineer:**
1. Create `supabase/functions/qbo-export/index.ts` per Section 2.
2. Test locally: invoke via `curl -X POST http://localhost:54321/functions/v1/qbo-export -H "Authorization: Bearer <JWT>" -d '{"startDate":"2026-04-01","endDate":"2026-04-30","includeDepositsPaid":true,"includeBalancesPaid":true,"includeOutstanding":true,"includePatinaCatalog":false}'`.
3. Verify: studio_owner user returns 200 CSV with correct rows; non-studio-owner user returns 403; missing date params return 400.
4. Verify: vendor names with `"` and `,` are correctly RFC-4180 quoted in output.
5. Verify: empty date range with valid flags returns header-only CSV (no rows).

**Migration Engineer A — Migration + Seed + Types:**
1. Create `supabase/migrations/00151_procurement_notifications.sql` from Section 3.
2. Apply via `supabase db reset`. Verify: table exists, 2 triggers present (`\df notify_payment_due notify_damage_claim_drafted`), RLS enabled.
3. Regenerate types via `pnpm db:generate` in `packages/supabase`.
4. Verify type-check: `pnpm --filter @patina/supabase type-check` exits 0.
5. Manual trigger test: UPDATE a `po_payments` row from `pending` to `due` in Supabase Studio → confirm notification row appears in `procurement_notifications`.
6. Manual trigger test: INSERT a `damage_claims` row with `state = 'drafted'` → confirm notification row appears.

**Migration Engineer B — Hook implementations:**
1. Append Section 3 hook stubs to `use-procurement.ts` and implement all 4 hooks.
2. Append `useIsStudioOwner()` to `use-permissions.ts`.
3. Export all new symbols from `index.ts`.
4. Unit tests: `useProcurementUnreadCount` returns 0 on error; `useMarkNotificationRead` invalidates correct query keys; `useIsStudioOwner` returns false when roles array is empty, true when studio_owner role present.
5. Verify: `pnpm --filter @patina/supabase type-check && pnpm --filter @patina/supabase test` exits 0.

**Component Builder — BookkeeperExportModal + Feature Flag hook:**
1. Create `apps/designer-portal/src/hooks/use-feature-flag.ts` from Section 6.
2. Append `procurementEvents` to `apps/designer-portal/src/lib/analytics/events.ts`.
3. Implement the `BookkeeperExportModal` component at `apps/designer-portal/src/components/portal/bookkeeper-export-modal.tsx`. Wire it to call the `qbo-export` edge function via `fetch()` (not via a Supabase hook — it is a direct HTTP call returning a blob). Use `@patina/design-system` Dialog primitive.
4. Add the "Export to QBO" CTA to the procurement subnav (guarded by `useIsStudioOwner()`).
5. Write Storybook story for the modal.

**Acceptance signal (joint):** `supabase db reset` clean with 00151 applied; `pnpm --filter @patina/supabase type-check` exits 0; `pnpm --filter @patina/supabase test` exits 0; QBO export curl returns valid RFC-4180 CSV; modal visible only when signed in as a studio_owner user.
