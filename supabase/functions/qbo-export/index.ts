// QBO Bookkeeper Export — Sprint 3 / Wave 3.2
//
// Generates a QuickBooks Online "Bills" import CSV for the authenticated
// studio_owner. One row per po_payments event (deposit + balance +
// each milestone = separate rows).
//
// Per Wave 3.1 architect dossier §2.
//
// Auth model:
//   1. Caller JWT verified via supabase.auth.getUser(callerJwt).
//   2. studio_owner role verified via user_roles join.
//   3. Data read with service-role client (v1 RLS for studio_owner is inert),
//      explicitly scoped by `purchase_orders.designer_id = caller.id`.
//
// Request body (POST JSON):
//   {
//     dateStart:           "YYYY-MM-DD"  // inclusive — required
//     dateEnd:             "YYYY-MM-DD"  // inclusive — required
//     includePaid:         boolean       // covers deposits + balances/milestones paid
//     includeOutstanding:  boolean       // covers pending/due payments
//     includePatinaCatalog: boolean
//     projectIds?:         string[]
//     vendorIds?:          string[]
//     preview?:            boolean       // if true, return JSON stats only (no CSV body)
//
//     // dossier-shape aliases also accepted:
//     startDate?:          "YYYY-MM-DD"
//     endDate?:            "YYYY-MM-DD"
//     includeDepositsPaid?: boolean
//     includeBalancesPaid?: boolean
//   }
//
// Response (download mode):
//   200 OK
//   Content-Type: text/csv; charset=utf-8
//   Content-Disposition: attachment; filename="patina-vendor-bills-{YYYY-MM-DD}.csv"
//   X-Patina-Transaction-Count, X-Patina-Vendor-Count, X-Patina-Total-Cents,
//   X-Patina-Paid-Count, X-Patina-Paid-Cents,
//   X-Patina-Outstanding-Count, X-Patina-Outstanding-Cents
//
// Response (preview mode):
//   200 OK
//   Content-Type: application/json
//   { transactionCount, vendorCount, totalCents,
//     paidCount, paidCents, outstandingCount, outstandingCents }

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ExportParams {
  dateStart: string;
  dateEnd: string;
  includeDepositsPaid: boolean;
  includeBalancesPaid: boolean;
  includeOutstanding: boolean;
  includePatinaCatalog: boolean;
  projectIds: string[];
  vendorIds: string[];
  preview: boolean;
}

interface PaymentRow {
  id: string;
  kind: "deposit" | "balance" | "milestone";
  amount_cents: number;
  due_date: string | null;
  paid_date: string | null;
  state: "pending" | "due" | "paid";
  label: string | null;
  sort_order: number;
  purchase_order: {
    id: string;
    vendor_po_number: string | null;
    payment_pattern: string;
    is_patina_catalog: boolean;
    created_at: string;
    designer_id: string;
    vendor_id: string;
    project_id: string;
    vendor: { id: string; name: string } | null;
    project: { id: string; name: string } | null;
  };
}

interface ExportRow {
  vendor_name: string;
  bill_date: string;
  due_date: string;
  bill_no: string;
  line_description: string;
  line_amount: number;
  account: string;
  payment_status: "Paid" | "Unpaid";
  paid_date: string;
  project_name: string;
  payment_pattern: string;
  // sort keys (not emitted)
  _vendor_sort: string;
  _bill_no_sort: string;
  _kind_rank: number;
  _sort_order: number;
}

interface PreviewStats {
  transactionCount: number;
  vendorCount: number;
  totalCents: number;
  paidCount: number;
  paidCents: number;
  outstandingCount: number;
  outstandingCents: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CSV_HEADER =
  "Vendor,Bill Date,Due Date,Bill No.,Line Description,Line Amount,Account,Payment Status,Paid Date,Project,Payment Pattern";

const ACCOUNT_DEFAULT = "Cost of Goods Sold";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function csvResponse(csv: string, dateStart: string, stats: PreviewStats): Response {
  const filename = `patina-vendor-bills-${dateStart}.csv`;
  return new Response(csv, {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "X-Patina-Transaction-Count": String(stats.transactionCount),
      "X-Patina-Vendor-Count": String(stats.vendorCount),
      "X-Patina-Total-Cents": String(stats.totalCents),
      "X-Patina-Paid-Count": String(stats.paidCount),
      "X-Patina-Paid-Cents": String(stats.paidCents),
      "X-Patina-Outstanding-Count": String(stats.outstandingCount),
      "X-Patina-Outstanding-Cents": String(stats.outstandingCents),
      // Expose custom headers to browser JS so the modal can read them.
      "Access-Control-Expose-Headers":
        "X-Patina-Transaction-Count, X-Patina-Vendor-Count, X-Patina-Total-Cents, X-Patina-Paid-Count, X-Patina-Paid-Cents, X-Patina-Outstanding-Count, X-Patina-Outstanding-Cents, Content-Disposition",
    },
  });
}

/** RFC-4180 field: double-quote, escape embedded ", flatten newlines to spaces. */
function csvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '""';
  const s = String(value).replace(/[\r\n]+/g, " ");
  return `"${s.replace(/"/g, '""')}"`;
}

/** Render the payment_pattern enum as a human-readable label for the CSV. */
function humanizePattern(p: string | null | undefined): string {
  switch (p) {
    case "fifty_fifty":
      return "50/50";
    case "thirty_seventy":
      return "30/70";
    case "full_upfront":
      return "Full Upfront";
    case "net_30":
      return "NET-30";
    case "custom_milestones":
      return "Custom Milestones";
    default:
      return p ?? "";
  }
}

function kindRank(k: string): number {
  switch (k) {
    case "deposit":
      return 0;
    case "balance":
      return 1;
    default:
      return 2;
  }
}

function isValidDate(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

/** Parse and normalize the request body, accepting both task-brief + dossier shapes. */
function parseParams(raw: Record<string, unknown>): ExportParams | { error: string } {
  // Accept either dateStart/dateEnd (task brief) or startDate/endDate (dossier).
  const dateStart =
    (raw.dateStart as string | undefined) ?? (raw.startDate as string | undefined);
  const dateEnd =
    (raw.dateEnd as string | undefined) ?? (raw.endDate as string | undefined);

  if (!isValidDate(dateStart)) {
    return { error: "dateStart (YYYY-MM-DD) is required" };
  }
  if (!isValidDate(dateEnd)) {
    return { error: "dateEnd (YYYY-MM-DD) is required" };
  }

  // Task brief uses includePaid (lumped); dossier uses includeDepositsPaid +
  // includeBalancesPaid (split). If only includePaid is provided, fan it out
  // to both. If split flags are provided, they take precedence.
  let includeDepositsPaid: boolean;
  let includeBalancesPaid: boolean;
  if (typeof raw.includeDepositsPaid === "boolean" || typeof raw.includeBalancesPaid === "boolean") {
    includeDepositsPaid = raw.includeDepositsPaid === true;
    includeBalancesPaid = raw.includeBalancesPaid === true;
  } else {
    const lumped = raw.includePaid === true;
    includeDepositsPaid = lumped;
    includeBalancesPaid = lumped;
  }

  const includeOutstanding = raw.includeOutstanding === true;
  const includePatinaCatalog = raw.includePatinaCatalog === true;

  const projectIds = Array.isArray(raw.projectIds)
    ? (raw.projectIds as unknown[]).filter((x): x is string => typeof x === "string")
    : [];
  const vendorIds = Array.isArray(raw.vendorIds)
    ? (raw.vendorIds as unknown[]).filter((x): x is string => typeof x === "string")
    : [];

  const preview = raw.preview === true;

  return {
    dateStart,
    dateEnd,
    includeDepositsPaid,
    includeBalancesPaid,
    includeOutstanding,
    includePatinaCatalog,
    projectIds,
    vendorIds,
    preview,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Data fetch
//
// We pull every payment row whose parent PO belongs to the caller, with the
// vendor + project joined, then apply the three include-bucket filters in
// TypeScript. This keeps the query simple and avoids a new RPC migration.
// The result set is small in v1 (single-designer scope; bookkeeper exports
// run weekly to monthly).
// ─────────────────────────────────────────────────────────────────────────────

async function fetchExportRows(
  svc: SupabaseClient,
  callerId: string,
  params: ExportParams
): Promise<ExportRow[]> {
  // Pre-filter payments by their parent PO designer_id at the DB level via
  // a nested filter on the joined `purchase_order.designer_id`. PostgREST
  // supports filtering by joined columns via the `purchase_order.<col>` path.
  //
  // We fetch a wide window: any payment whose PO was created on or before
  // dateEnd. The TypeScript filter below applies the three include-buckets.
  let query = svc
    .from("po_payments")
    .select(
      `
      id,
      kind,
      amount_cents,
      due_date,
      paid_date,
      state,
      label,
      sort_order,
      purchase_order:purchase_orders!po_payments_purchase_order_id_fkey(
        id,
        vendor_po_number,
        payment_pattern,
        is_patina_catalog,
        created_at,
        designer_id,
        vendor_id,
        project_id,
        vendor:vendors!purchase_orders_vendor_id_fkey(id, name),
        project:projects!purchase_orders_project_id_fkey(id, name)
      )
    `
    )
    .eq("purchase_order.designer_id", callerId);

  if (params.projectIds.length > 0) {
    query = query.in("purchase_order.project_id", params.projectIds);
  }
  if (params.vendorIds.length > 0) {
    query = query.in("purchase_order.vendor_id", params.vendorIds);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Query failed: ${error.message}`);
  }

  const rows = (data ?? []) as unknown as PaymentRow[];

  // Drop any rows where the inner join didn't materialize (e.g. PO scoped
  // out by RLS or designer_id mismatch). PostgREST returns null for missing
  // joined rows when using nested resource embedding.
  const owned = rows.filter(
    (r) => r.purchase_order && r.purchase_order.designer_id === callerId
  );

  // Apply the three include-buckets per §1 of the dossier.
  const start = params.dateStart;
  const end = params.dateEnd;

  const matchesIncludeBucket = (r: PaymentRow): boolean => {
    // Deposits paid in period.
    if (
      params.includeDepositsPaid &&
      r.kind === "deposit" &&
      r.state === "paid" &&
      r.paid_date !== null &&
      r.paid_date >= start &&
      r.paid_date <= end
    ) {
      return true;
    }
    // Balances/milestones paid in period.
    if (
      params.includeBalancesPaid &&
      (r.kind === "balance" || r.kind === "milestone") &&
      r.state === "paid" &&
      r.paid_date !== null &&
      r.paid_date >= start &&
      r.paid_date <= end
    ) {
      return true;
    }
    // Outstanding payments (anchored on PO created_at).
    if (
      params.includeOutstanding &&
      (r.state === "due" || r.state === "pending")
    ) {
      const poCreated = r.purchase_order.created_at.slice(0, 10);
      if (poCreated >= start && poCreated <= end) {
        return true;
      }
    }
    return false;
  };

  const filtered = owned
    .filter((r) => {
      if (!params.includePatinaCatalog && r.purchase_order.is_patina_catalog) {
        return false;
      }
      return matchesIncludeBucket(r);
    })
    .map<ExportRow>((r) => {
      const vendorName = r.purchase_order.vendor?.name ?? "";
      const projectName = r.purchase_order.project?.name ?? "";
      const billDate = r.purchase_order.created_at.slice(0, 10);
      const billNo =
        r.purchase_order.vendor_po_number && r.purchase_order.vendor_po_number.trim() !== ""
          ? r.purchase_order.vendor_po_number
          : r.purchase_order.id;

      let lineDescription: string;
      if (r.kind === "deposit") {
        lineDescription = `Deposit — ${projectName}`;
      } else if (r.kind === "balance") {
        lineDescription = `Balance — ${projectName}`;
      } else {
        const labelPart = r.label ? `${r.label} ` : "";
        lineDescription = `Milestone ${labelPart}— ${projectName}`;
      }
      // Truncate at QBO's 4000-char line description limit.
      if (lineDescription.length > 4000) {
        lineDescription = lineDescription.slice(0, 4000);
      }

      return {
        vendor_name: vendorName,
        bill_date: billDate,
        due_date: r.due_date ?? "",
        bill_no: billNo,
        line_description: lineDescription,
        line_amount: r.amount_cents / 100,
        account: ACCOUNT_DEFAULT,
        payment_status: r.state === "paid" ? "Paid" : "Unpaid",
        paid_date: r.paid_date ?? "",
        project_name: projectName,
        payment_pattern: r.purchase_order.payment_pattern,
        _vendor_sort: vendorName.toLowerCase(),
        _bill_no_sort: billNo,
        _kind_rank: kindRank(r.kind),
        _sort_order: r.sort_order,
      };
    });

  // Stable sort: vendor, bill_date, bill_no, kind_rank (deposit→balance→milestone), sort_order.
  filtered.sort((a, b) => {
    if (a._vendor_sort !== b._vendor_sort) return a._vendor_sort < b._vendor_sort ? -1 : 1;
    if (a.bill_date !== b.bill_date) return a.bill_date < b.bill_date ? -1 : 1;
    if (a._bill_no_sort !== b._bill_no_sort)
      return a._bill_no_sort < b._bill_no_sort ? -1 : 1;
    if (a._kind_rank !== b._kind_rank) return a._kind_rank - b._kind_rank;
    return a._sort_order - b._sort_order;
  });

  return filtered;
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
  ].join(",");
}

function computeStats(rows: ExportRow[]): PreviewStats {
  const vendors = new Set<string>();
  let totalCents = 0;
  let paidCount = 0;
  let paidCents = 0;
  let outstandingCount = 0;
  let outstandingCents = 0;

  for (const r of rows) {
    vendors.add(r._vendor_sort);
    const cents = Math.round(r.line_amount * 100);
    totalCents += cents;
    if (r.payment_status === "Paid") {
      paidCount += 1;
      paidCents += cents;
    } else {
      outstandingCount += 1;
      outstandingCents += cents;
    }
  }

  return {
    transactionCount: rows.length,
    vendorCount: vendors.size,
    totalCents,
    paidCount,
    paidCents,
    outstandingCount,
    outstandingCents,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  // 1. Auth header.
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return jsonResponse({ error: "Missing authorization" }, 401);
  }
  const callerJwt = authHeader.slice(7).trim();
  if (!callerJwt) {
    return jsonResponse({ error: "Missing authorization" }, 401);
  }

  // 2. Service-role client.
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Server misconfigured (missing env)" }, 500);
  }
  const svc = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 3. Resolve caller from JWT.
  const { data: userResult, error: authError } = await svc.auth.getUser(callerJwt);
  if (authError || !userResult?.user) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }
  const callerId = userResult.user.id;

  // 4. Verify studio_owner role via user_roles → roles.
  const { data: roleRows, error: roleError } = await svc
    .from("user_roles")
    .select("role:roles(name)")
    .eq("user_id", callerId);
  if (roleError) {
    return jsonResponse({ error: `Role lookup failed: ${roleError.message}` }, 500);
  }
  const hasStudioOwner = (roleRows ?? []).some((r: unknown) => {
    const rr = r as { role?: { name?: string } | { name?: string }[] | null };
    if (Array.isArray(rr.role)) {
      return rr.role.some((rel) => rel?.name === "studio_owner");
    }
    return rr.role?.name === "studio_owner";
  });
  if (!hasStudioOwner) {
    return jsonResponse({ error: "Forbidden: studio_owner role required" }, 403);
  }

  // 5. Parse body.
  let rawBody: Record<string, unknown>;
  try {
    rawBody = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }
  const parsed = parseParams(rawBody);
  if ("error" in parsed) {
    return jsonResponse({ error: parsed.error }, 400);
  }
  const params = parsed;

  // 6. Short-circuit: no include flags → empty result.
  if (
    !params.includeDepositsPaid &&
    !params.includeBalancesPaid &&
    !params.includeOutstanding
  ) {
    const emptyStats: PreviewStats = {
      transactionCount: 0,
      vendorCount: 0,
      totalCents: 0,
      paidCount: 0,
      paidCents: 0,
      outstandingCount: 0,
      outstandingCents: 0,
    };
    if (params.preview) {
      return jsonResponse(emptyStats);
    }
    return csvResponse(CSV_HEADER + "\n", params.dateStart, emptyStats);
  }

  // 7. Fetch rows.
  let rows: ExportRow[];
  try {
    rows = await fetchExportRows(svc, callerId, params);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse({ error: msg }, 500);
  }

  const stats = computeStats(rows);

  // 8. Preview mode → JSON.
  if (params.preview) {
    return jsonResponse(stats);
  }

  // 9. CSV mode → download.
  const body = [CSV_HEADER, ...rows.map(renderRow)].join("\n") + "\n";
  return csvResponse(body, params.dateStart, stats);
});
