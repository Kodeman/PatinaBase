/**
 * THE STUDIO'S BILLING REGISTER, AS ONE FILE (P3 · "The second house" Wave 2).
 *
 * Pure, dependency-free core — no React, no network, no DOM, no SheetJS — the
 * same shape `time-export.ts` (HT-20, the hours CSV) took, and for the same
 * reason: the row builder is the part that must be provable. The fetch and the
 * workbook write live in `studio-billing-export-download.ts`.
 *
 * WHAT IT RETURNS. Five sheets: `invoices` (header rows), `invoice_lines`,
 * `payments`, `clients` (with the household relationship keys), and `manifest`.
 * One .xlsx rather than a zip of CSVs because `xlsx` (SheetJS) is ALREADY a
 * designer-portal dependency, lazy-imported by the Library import sheet — a zip
 * writer is not, and P3 adds no dependency.
 *
 * ── THE TENANT LEG, AND WHY THE BUILDER FILTERS TOO ──────────────────────
 * The co-member RLS on invoices is `is_studio_comember(designer_id)` (00316,
 * swept 00584) — MEMBER-scoped, not tenant-scoped. A member who also works for
 * a second studio makes every one of that second studio's invoices readable
 * here (the hole 00632:30-37 names, and took the tenant leg beside the
 * predicate for exactly this reason). The fetch therefore carries
 * `.eq('studio_id', studioId)`; this builder ALSO drops every row whose
 * studio_id is not the export's studio, and COUNTS what it dropped. Two legs,
 * because one of them is a query string a later edit can lose, and a
 * cross-studio row in a studio's own billing file is the release-failing
 * defect.
 *
 * `designer_clients` has no studio column at all, so the clients sheet cannot
 * be filtered on one. A client record earns its place only through an
 * UNAMBIGUOUS studio authorization path — an included (studio-stamped) invoice
 * names it as payer, a project of this studio names it as client, or its
 * household belongs to this studio (`client_households.organization_id`). A
 * co-member's roster rows for her OTHER studios reach none of those and are
 * excluded, not swept in by union; the manifest says how many.
 *
 * A PROJECT is the other place a foreign row can arrive, and it is not enough to
 * drop the foreign INVOICES: an invoice of this studio may itself NAME a project
 * of another one (00578:8730-8746 adopts an origin deposit onto a project
 * without requiring the studios to match). So the lookup table this builder
 * dereferences for a project's name, its client and its payer holds ONLY this
 * studio's projects, and a foreign one is counted — by the caller's head-only
 * query and by this builder — and never named. The same reasoning reaches the
 * 00588 payer ladder's last step, which is the one step no payer id anchors:
 * see the divergence note on `resolveInvoicePayerName`.
 *
 * ── THE 00318/00513 DISCLOSURE ───────────────────────────────────────────
 * `invoices.studio_id` is nullable: numbering falls back to the per-designer
 * `invoice_counters` "only when an invoice has no studio (a project without a
 * studio)" (00513 header; the column arrived in 00318). Those rows carry no
 * tenant stamp, so a studio-scoped export cannot honestly claim them — and
 * silently omitting them is exactly the "silent omission" that fails release.
 * The caller counts them and the manifest discloses the figure.
 *
 * ── COLUMN NAMES (R-SH6) ─────────────────────────────────────────────────
 * The names are chosen so a QuickBooks Online import mapping can be ADDED
 * LATER as a second sheet without renaming anything here: every field a QBO
 * invoice import asks for has a column whose name will not have to move
 * (invoice_number, client_name, issue_date, due_date, payment_terms_days,
 * currency, memo, tax_rate, description, quantity, unit_amount_decimal,
 * amount_decimal). Whether she re-keys at all is asked at the sit-down; NO
 * QuickBooks sheet is written now.
 *
 * Money is carried TWICE on purpose: `*_minor` is the integer minor unit the
 * database holds and the figure that reconciles exactly; `*_decimal` is the
 * same money as a number a bookkeeper can sum and an importer can read.
 * Timestamps are the stored UTC ISO-8601 instants; `issue_date` / `due_date`
 * are stored calendar dates. Nothing is re-zoned here — a snapshot that moved
 * a received date by a timezone would not reconcile against the book.
 *
 * `internal_notes` (invoices) and `notes` (client records) are deliberately
 * absent: neither is needed to interpret a bill, and this file leaves the
 * studio.
 */

import { sanitizeSpreadsheetCell } from "@/components/document/rooms/library/import-parse";

/** A cell: a number stays numeric so the sheet sums it; text is text; `null`
 *  is an empty cell and is what the manifest counts as a missing value. */
export type SheetCell = string | number | null;

export interface BillingExportSheet {
  name: string;
  header: readonly string[];
  rows: SheetCell[][];
}

// ═══════════════════════════════════════════════════════════════════════════
// RAW ROWS — exactly the projections the fetch selects, nothing wider. Local
// types (not `@patina/supabase`'s `Invoice`) because this module is the proof
// surface and must stay importable with no package build behind it.
// ═══════════════════════════════════════════════════════════════════════════

export interface RawProfileRef {
  id: string;
  full_name: string | null;
  display_name?: string | null;
  email: string | null;
}

export interface RawInvoiceRow {
  id: string;
  /** NULL on a studio-less invoice (00318/00513) — excluded and disclosed. */
  studio_id: string | null;
  designer_id: string;
  client_id: string | null;
  project_id: string | null;
  invoice_number: string | null;
  title: string | null;
  status: string | null;
  currency: string | null;
  issue_date: string | null;
  due_date: string | null;
  payment_terms_days: number | null;
  subtotal_cents: number | null;
  tax_rate: number | null;
  tax_cents: number | null;
  total_cents: number | null;
  amount_paid_cents: number | null;
  memo: string | null;
  sent_at: string | null;
  paid_at: string | null;
  voided_at: string | null;
  created_at: string | null;
  client?: RawProfileRef | null;
  designer?: RawProfileRef | null;
}

export interface RawLineRow {
  id: string;
  invoice_id: string;
  kind: string | null;
  milestone_id: string | null;
  ffe_item_id: string | null;
  description: string | null;
  quantity: number | null;
  unit_amount_cents: number | null;
  amount_cents: number | null;
  sort_order: number | null;
  created_at: string | null;
}

export interface RawPaymentRow {
  id: string;
  invoice_id: string;
  amount_cents: number | null;
  surcharge_cents?: number | null;
  method: string | null;
  status: string | null;
  reference: string | null;
  received_at: string | null;
  created_at: string | null;
  recorded_by: string | null;
  stripe_payment_intent_id: string | null;
  stripe_checkout_session_id: string | null;
}

export interface RawProjectRow {
  id: string;
  name: string | null;
  studio_id: string | null;
  client_id: string | null;
  client?: RawProfileRef | null;
}

export interface RawClientRecordRow {
  id: string;
  designer_id: string;
  client_id: string | null;
  household_id: string | null;
  client_name: string | null;
  client_email: string | null;
  client_phone: string | null;
  status: string | null;
  source: string | null;
  created_at: string | null;
  updated_at: string | null;
  client?: RawProfileRef | null;
  designer?: RawProfileRef | null;
}

export interface RawHouseholdRow {
  id: string;
  organization_id: string | null;
  designer_id: string | null;
  display_name: string | null;
  member_person_ids: string[] | null;
  co_threshold_cents: number | null;
  created_at: string | null;
}

export interface StudioBillingSource {
  studioId: string;
  studioName: string | null;
  /** The dated snapshot. One instant for the whole file, taken by the caller. */
  snapshotAt: string;
  /** As fetched. Rows for another studio, or for none, are dropped here. */
  invoices: RawInvoiceRow[];
  lines: RawLineRow[];
  payments: RawPaymentRow[];
  projects: RawProjectRow[];
  /** The union of the invoice designers' rosters plus this studio's households
   *  — filtered to an authorized path below, never exported whole. */
  clientRecords: RawClientRecordRow[];
  households: RawHouseholdRow[];
  /** `invoices` rows readable under co-member RLS whose studio_id IS NULL. */
  nullStudioInvoiceCount: number;
  /** …and whose studio_id names a DIFFERENT studio. */
  otherStudioInvoiceCount: number;
  /** A head-only count of the projects an INCLUDED invoice names that this
   *  studio's own projects read did not return — another studio's, or none's.
   *  The rows are never fetched (that read carries the tenant leg), so this
   *  figure is the whole disclosure. */
  invoiceProjectsOutsideStudioCount: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// COLUMNS — the first row of a spreadsheet is a contract; these do not move.
// ═══════════════════════════════════════════════════════════════════════════

export const INVOICE_COLUMNS = [
  "invoice_id",
  "invoice_number",
  "status",
  "payment_status",
  "currency",
  "issue_date",
  "due_date",
  "payment_terms_days",
  "subtotal_minor",
  "subtotal_decimal",
  "tax_rate",
  "tax_minor",
  "tax_decimal",
  "total_minor",
  "total_decimal",
  "amount_paid_minor",
  "amount_paid_decimal",
  "collected_minor",
  "collected_decimal",
  "pending_minor",
  "failed_minor",
  "refunded_minor",
  "requires_refund_minor",
  "balance_minor",
  "balance_decimal",
  "credit_minor",
  "client_id",
  "client_name",
  "household_id",
  "household_name",
  "project_id",
  "project_name",
  "studio_id",
  "designer_id",
  "designer_name",
  "title",
  "memo",
  "sent_at",
  "paid_at",
  "voided_at",
  "created_at",
] as const;

export const INVOICE_LINE_COLUMNS = [
  "line_id",
  "invoice_id",
  "invoice_number",
  "sort_order",
  "kind",
  "description",
  "quantity",
  "unit_amount_minor",
  "unit_amount_decimal",
  "amount_minor",
  "amount_decimal",
  "currency",
  "milestone_id",
  "ffe_item_id",
  "created_at",
] as const;

export const PAYMENT_COLUMNS = [
  "payment_id",
  "invoice_id",
  "invoice_number",
  "payment_status",
  "is_collected",
  "method",
  "amount_minor",
  "amount_decimal",
  "surcharge_minor",
  "surcharge_decimal",
  "currency",
  "received_at",
  "created_at",
  "reference",
  "recorded_by",
  "stripe_payment_intent_id",
  "stripe_checkout_session_id",
  "client_id",
  "household_id",
  "project_id",
] as const;

export const CLIENT_COLUMNS = [
  "client_record_id",
  "client_id",
  "client_name",
  "client_email",
  "client_phone",
  "lifecycle_status",
  "source",
  "household_id",
  "household_name",
  "household_member_count",
  "household_threshold_minor",
  "household_threshold_decimal",
  "designer_id",
  "designer_name",
  "studio_authorization_path",
  "created_at",
  "updated_at",
] as const;

export const MANIFEST_COLUMNS = ["section", "key", "value"] as const;

// ═══════════════════════════════════════════════════════════════════════════
// CELL HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/** A text cell. `null`/blank stays `null` (an empty cell the manifest counts),
 *  and a leading formula sigil is neutralised by the repo's own guard — a
 *  household a studio named `=HYPERLINK(...)` must not execute when the
 *  bookkeeper opens the file. */
function text(value: string | null | undefined): SheetCell {
  if (value === null || value === undefined) return null;
  const flat = String(value).replace(/[\r\n]+/g, " ");
  const guarded = sanitizeSpreadsheetCell(flat);
  return guarded === "" ? null : guarded;
}

/** Integer minor units, exactly as stored. Absent reads as 0 only where 0 is
 *  the column's real default (money counters are NOT NULL in the schema). */
function minor(cents: number | null | undefined): number {
  return Math.trunc(cents ?? 0);
}

/** The same money as a decimal number, rounded to two places. */
function decimal(cents: number | null | undefined): number {
  return Math.round(cents ?? 0) / 100;
}

/**
 * The currencies whose minor unit is 1/100 of the major one — the only ones
 * `decimal()` can divide by 100 and be right.
 *
 * `invoices.currency` is `TEXT NOT NULL DEFAULT 'USD'` with no CHECK
 * (00014:353, 00178), so nothing in the schema stops a JPY (0-decimal) or KWD
 * (3-decimal) row from being written; on such a row every `*_decimal` column
 * would be wrong by a factor of 100 or 10 while the `*_minor` columns stayed
 * exact. The export therefore ABORTS on one rather than shipping a bookkeeper a
 * file whose two money columns disagree.
 */
export const TWO_DECIMAL_CURRENCIES = ["USD", "CAD", "EUR", "GBP"] as const;

const TWO_DECIMAL_SET: ReadonlySet<string> = new Set(TWO_DECIMAL_CURRENCIES);

/**
 * The distinct currency codes in these rows that `decimal()` cannot honestly
 * convert, in the order first seen. Empty means the file's `*_decimal` columns
 * are sound. A blank/absent code is the column's own `'USD'` default.
 */
export function unsupportedCurrencyCodes(
  rows: readonly Pick<RawInvoiceRow, "currency">[],
): string[] {
  const bad: string[] = [];
  for (const row of rows) {
    const code = (trimmed(row.currency) ?? "USD").toUpperCase();
    if (!TWO_DECIMAL_SET.has(code) && !bad.includes(code)) bad.push(code);
  }
  return bad;
}

function trimmed(value: string | null | undefined): string | null {
  const s = (value ?? "").trim();
  return s === "" ? null : s;
}

// ═══════════════════════════════════════════════════════════════════════════
// THE PAYER NAME — 00588's ladder
// ═══════════════════════════════════════════════════════════════════════════

/**
 * WHOSE BILL IT IS, by the ladder 00588 shipped.
 *
 * ANCHOR CORRECTION. The brief says to call the 00588 derivation rather than
 * re-state it. It has no callable home: 00588 wrote the ladder into
 * `resolve_invoice_link(text, boolean)` and
 * `resolve_invoice_link_for_checkout(text)` — both keyed on a `/pay/<token>`
 * bearer token (hashed at rest since 00636), both `service_role`-only on
 * EXECUTE, one of them VOLATILE because it bumps `view_count`, and both
 * answering NULL for a draft. There is no designer-side function, view or
 * column that carries it (checked: every `Functions` entry in
 * `packages/supabase/src/database.types.ts` matching invoice/payer/household;
 * `grep` for a payer derivation across every portal and package source tree).
 * Adding an RPC would mean a new SECURITY DEFINER function on a live money
 * rail, outside this ticket's declared scope and against its own "RLS stays
 * untouched" boundary — and every input the ladder reads is already readable
 * here under RLS. So it is PORTED, step for step, from
 * `00588_invoice_link_household_name.sql:159-221`, and the steps are numbered
 * to match that file so the two cannot drift unnoticed.
 *
 * Why it matters at all: without it the Client cell blanks on exactly the
 * invoices this export exists for — a studio invoice (`project_id IS NULL`)
 * whose payer household holds a profile with no `full_name` and a roster row
 * carrying only an email. That is the shape 00588 was written for, in
 * production, at Middle West Studio.
 */
export function resolveInvoicePayerName(
  invoice: Pick<RawInvoiceRow, "client_id" | "designer_id" | "client">,
  project: RawProjectRow | null,
  rosterByDesigner: Map<string, RawClientRecordRow[]>,
  profileById: Map<string, RawProfileRef>,
  /** The households THIS studio owns — step 4's tenant leg; see step 4. */
  studioHouseholdIds: ReadonlySet<string>,
): string | null {
  // 00588:161 — the payer is the invoice's own client, else the project's.
  const payerId = invoice.client_id ?? project?.client_id ?? null;
  const roster = rosterByDesigner.get(invoice.designer_id) ?? [];

  if (payerId) {
    const profile = profileById.get(payerId) ?? invoice.client ?? null;
    // 1 (00588:164-167) — the payer's own profile.
    const own =
      trimmed(profile?.full_name) ?? trimmed(profile?.display_name ?? null);
    if (own) return own;

    // 2 (00588:179-189) — the payer's OWN roster row, keyed on the payer and
    // ordered active-before-lead then created_at then id, with the blank test
    // in the filter and NOT after it: a blank-named row must not be picked and
    // then discarded, hiding a sibling row that does carry a name.
    const payerRows = payerRosterRows(roster, payerId);
    const rosterName = payerRows
      .map((r) => trimmed(r.client_name))
      .find((n): n is string => n !== null);
    if (rosterName) return rosterName;

    // 3 (00588:193-201) — the household email. A studio names a household by
    // the address it entered and nothing else; printing that beats an
    // unaddressed row.
    const rosterEmail = payerRows
      .map((r) => trimmed(r.client_email))
      .find((e): e is string => e !== null);
    if (rosterEmail) return rosterEmail;

    // 3b (00588:203-207) — the payer profile's own email.
    return trimmed(profile?.email ?? null);
  }

  // 4 (00588:211-220) — no payer at all (a project invoice whose project
  // carries no client). Resolves only when the designer's roster holds
  // EXACTLY ONE named email-only row; `HAVING count(*) = 1` over the named
  // rows, so two candidates name nobody rather than guess.
  //
  // THE ONE DELIBERATE DIVERGENCE FROM 00588. There the candidate set is the
  // designer's WHOLE roster, and there that is correct: `resolve_invoice_link`
  // answers for a single invoice behind a single bearer token, where designer
  // scope IS the boundary. Here the boundary is the STUDIO, and a co-member's
  // roster carries her other studios' rows too (00316/00584 is member-scoped) —
  // every step above is anchored by a payer id this studio's own invoice or
  // project named, but step 4 has no payer to anchor it. Unfiltered it prints
  // ANOTHER studio's household name into this studio's file: the very row the
  // clients sheet below refuses for having no studio authorization path. So a
  // candidate must also carry a household this studio owns.
  const named = roster
    .filter(
      (r) =>
        r.client_id === null &&
        r.household_id !== null &&
        studioHouseholdIds.has(r.household_id),
    )
    .map((r) => trimmed(r.client_name))
    .filter((n): n is string => n !== null);
  return named.length === 1 ? named[0] : null;
}

/** 00588's ORDER BY for a payer's roster rows: the active row wins, `id`
 *  breaks the tie a single transaction timestamp leaves undecided. A payer can
 *  hold more than one row — 00331 re-scoped the unique index so the lead row a
 *  household was promoted from survives beside the active one. */
function payerRosterRows(
  roster: RawClientRecordRow[],
  payerId: string,
): RawClientRecordRow[] {
  return roster
    .filter((r) => r.client_id === payerId)
    .sort(
      (a, b) =>
        Number(b.status !== "lead") - Number(a.status !== "lead") ||
        (a.created_at ?? "").localeCompare(b.created_at ?? "") ||
        a.id.localeCompare(b.id),
    );
}

/** The display name for a CLIENT RECORD row (the clients sheet), same
 *  precedence as the payer ladder applied to one row. */
function clientRecordName(row: RawClientRecordRow): string | null {
  return (
    trimmed(row.client_name) ??
    trimmed(row.client?.full_name) ??
    trimmed(row.client?.display_name ?? null) ??
    trimmed(row.client_email) ??
    trimmed(row.client?.email ?? null)
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PAYMENT STANDING — failed and refunded never read as collected
// ═══════════════════════════════════════════════════════════════════════════

export type PaymentStanding =
  | "none"
  | "pending"
  | "failed"
  | "collected"
  | "part_collected"
  | "refunded"
  | "requires_refund";

export interface PaymentSums {
  collected: number;
  pending: number;
  failed: number;
  refunded: number;
  requiresRefund: number;
}

function sumPayments(rows: RawPaymentRow[]): PaymentSums {
  const sums: PaymentSums = {
    collected: 0,
    pending: 0,
    failed: 0,
    refunded: 0,
    requiresRefund: 0,
  };
  for (const p of rows) {
    const cents = minor(p.amount_cents);
    switch (p.status) {
      case "succeeded":
        sums.collected += cents;
        break;
      case "pending":
        sums.pending += cents;
        break;
      case "failed":
        sums.failed += cents;
        break;
      case "refunded":
        sums.refunded += cents;
        break;
      case "requires_refund":
        sums.requiresRefund += cents;
        break;
      default:
        break;
    }
  }
  return sums;
}

/**
 * One word for an invoice's money, with a DELIBERATE precedence:
 * `requires_refund` and `refunded` are tested BEFORE the collected sum, so an
 * invoice with money owed back never reads `collected`. 00588's own sheet
 * takes the same direction ("pay.payable is false while a requires_refund row
 * stands"). Nothing is hidden by the choice: `collected_minor`,
 * `refunded_minor`, `failed_minor`, `pending_minor` and
 * `requires_refund_minor` carry every figure separately on the same row.
 */
export function invoicePaymentStanding(
  sums: PaymentSums,
  totalCents: number,
): PaymentStanding {
  if (sums.requiresRefund > 0) return "requires_refund";
  if (sums.refunded > 0) return "refunded";
  if (sums.collected > 0) {
    return totalCents > 0 && sums.collected >= totalCents
      ? "collected"
      : "part_collected";
  }
  if (sums.pending > 0) return "pending";
  if (sums.failed > 0) return "failed";
  return "none";
}

// ═══════════════════════════════════════════════════════════════════════════
// THE MANIFEST
// ═══════════════════════════════════════════════════════════════════════════

export interface ManifestEntry {
  section: string;
  key: string;
  value: string | number;
}

export interface StudioBillingManifest {
  snapshotAt: string;
  studioId: string;
  studioName: string | null;
  counts: Record<string, number>;
  exclusions: {
    invoicesNullStudio: number;
    invoicesOtherStudio: number;
    invoicesOtherStudioInFetchedRows: number;
    invoicesNullStudioInFetchedRows: number;
    clientRecordsNoStudioPath: number;
    linesOrphaned: number;
    paymentsOrphaned: number;
    /** Foreign project rows that still reached the builder, dropped here. */
    projectsForeignStudio: number;
    /** …and the caller's head-only count of the same class, never fetched. */
    projectsNamedByInvoiceOutsideStudio: number;
  };
  reconciliation: {
    totalBilledMinor: number;
    /** …with voided and draft invoices taken out. */
    totalBilledLiveMinor: number;
    voidedOrDraftBilledMinor: number;
    voidedOrDraftInvoices: number;
    collectedMinor: number;
    amountPaidCounterMinor: number;
    /** Signed: negative is a credit. `creditMinor` carries it unsigned. */
    balanceMinor: number;
    creditMinor: number;
    invoicesWherePaidCounterDisagrees: number;
  };
  missingValues: { sheet: string; column: string; missing: number }[];
  entries: ManifestEntry[];
}

export interface StudioBillingExport {
  sheets: BillingExportSheet[];
  manifest: StudioBillingManifest;
}

// ═══════════════════════════════════════════════════════════════════════════
// THE BUILDER
// ═══════════════════════════════════════════════════════════════════════════

export function buildStudioBillingExport(
  source: StudioBillingSource,
): StudioBillingExport {
  const { studioId } = source;

  // ── 1. The tenant leg, applied again here (see the header). ────────────
  const invoices = source.invoices.filter((i) => i.studio_id === studioId);
  const invoicesNullStudioInFetchedRows = source.invoices.filter(
    (i) => i.studio_id === null || i.studio_id === undefined,
  ).length;
  const invoicesOtherStudioInFetchedRows =
    source.invoices.length - invoices.length - invoicesNullStudioInFetchedRows;

  invoices.sort(
    (a, b) =>
      (a.created_at ?? "").localeCompare(b.created_at ?? "") ||
      a.id.localeCompare(b.id),
  );

  const invoiceIds = new Set(invoices.map((i) => i.id));
  const invoiceById = new Map(invoices.map((i) => [i.id, i]));
  const invoiceNumberById = new Map(
    invoices.map((i) => [i.id, trimmed(i.invoice_number)]),
  );
  const currencyById = new Map(
    invoices.map((i) => [i.id, trimmed(i.currency)]),
  );

  // ── 2. Children reach the file only through an included invoice. ───────
  const lines = source.lines.filter((l) => invoiceIds.has(l.invoice_id));
  const linesOrphaned = source.lines.length - lines.length;
  const payments = source.payments.filter((p) => invoiceIds.has(p.invoice_id));
  const paymentsOrphaned = source.payments.length - payments.length;

  lines.sort(
    (a, b) =>
      a.invoice_id.localeCompare(b.invoice_id) ||
      (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
      a.id.localeCompare(b.id),
  );
  payments.sort(
    (a, b) =>
      a.invoice_id.localeCompare(b.invoice_id) ||
      (a.received_at ?? a.created_at ?? "").localeCompare(
        b.received_at ?? b.created_at ?? "",
      ) ||
      a.id.localeCompare(b.id),
  );

  const paymentsByInvoice = new Map<string, RawPaymentRow[]>();
  for (const p of payments) {
    const bucket = paymentsByInvoice.get(p.invoice_id);
    if (bucket) bucket.push(p);
    else paymentsByInvoice.set(p.invoice_id, [p]);
  }

  // ── 3. Lookups. ───────────────────────────────────────────────────────
  // THE TENANT LEG ON PROJECTS. A studio's own invoice can name a project of
  // ANOTHER studio: `set_invoice_studio_id` makes `invoices.studio_id`
  // immutable once set (00578:8750-8757), but its origin-deposit adoption
  // (00578:8730-8746) moves a project-less invoice onto `agreement.project_id`
  // without requiring that project's studio to match, and a later project move
  // does the same. So `projectById` holds ONLY this studio's projects. A foreign
  // project is COUNTED and then unreachable — nothing downstream can dereference
  // it for a name, a client or a payer, and so neither the `project_name` cell
  // nor a clients-sheet row can carry another studio's house.
  const studioProjects = source.projects.filter(
    (p) => p.studio_id === studioId,
  );
  const projectsForeignStudio = source.projects.length - studioProjects.length;
  const projectById = new Map(studioProjects.map((p) => [p.id, p]));

  const householdById = new Map(
    source.households
      .filter((h) => h.organization_id === studioId)
      .map((h) => [h.id, h]),
  );
  const studioHouseholdIds: ReadonlySet<string> = new Set(householdById.keys());

  // Seeded from the DESIGNER-ROSTER UNION as well as this studio's own invoices
  // and projects: `source.clientRecords` is unfiltered by studio (see the header
  // and step 6 of the fetch), so this map can hold a profile whose only roster
  // row sits in a co-member's other-studio engagement. Safe because the map has
  // exactly ONE read (:431), keyed on a payer id this studio's own invoice or
  // project named — a profile no such id points at is never written. A second
  // read keyed on anything else would have to carry its own tenant leg.
  const profileById = new Map<string, RawProfileRef>();
  const noteProfile = (p: RawProfileRef | null | undefined) => {
    if (p?.id && !profileById.has(p.id)) profileById.set(p.id, p);
  };
  invoices.forEach((i) => noteProfile(i.client));
  studioProjects.forEach((p) => noteProfile(p.client));
  source.clientRecords.forEach((c) => noteProfile(c.client));

  const rosterByDesigner = new Map<string, RawClientRecordRow[]>();
  for (const row of source.clientRecords) {
    const bucket = rosterByDesigner.get(row.designer_id);
    if (bucket) bucket.push(row);
    else rosterByDesigner.set(row.designer_id, [row]);
  }

  // ── 4. The authorized client set (see the header). ─────────────────────
  //  · payer of an included, studio-stamped invoice
  //  · client of a project this studio owns
  //  · member of a household this studio owns
  const invoicePayerIds = new Set<string>();
  for (const inv of invoices) {
    const payer =
      inv.client_id ?? projectById.get(inv.project_id ?? "")?.client_id;
    if (payer) invoicePayerIds.add(payer);
  }
  const studioProjectClientIds = new Set<string>();
  for (const p of studioProjects) {
    if (p.client_id) studioProjectClientIds.add(p.client_id);
  }

  const authorizationPath = (
    row: RawClientRecordRow,
  ): "studio_invoice" | "studio_project" | "studio_household" | null => {
    if (row.client_id && invoicePayerIds.has(row.client_id))
      return "studio_invoice";
    if (row.client_id && studioProjectClientIds.has(row.client_id))
      return "studio_project";
    if (row.household_id && householdById.has(row.household_id))
      return "studio_household";
    return null;
  };

  const clientRows: { row: RawClientRecordRow; path: string }[] = [];
  let clientRecordsNoStudioPath = 0;
  for (const row of source.clientRecords) {
    const path = authorizationPath(row);
    if (path) clientRows.push({ row, path });
    else clientRecordsNoStudioPath += 1;
  }
  clientRows.sort(
    (a, b) =>
      (clientRecordName(a.row) ?? "").localeCompare(
        clientRecordName(b.row) ?? "",
      ) || a.row.id.localeCompare(b.row.id),
  );

  /** The payer's roster row that carries a household THIS studio owns — the
   *  same 00588 ordering, without the name test (a household key, not a name). */
  const payerHousehold = (
    designerId: string,
    payerId: string | null,
  ): RawHouseholdRow | null => {
    if (!payerId) return null;
    const rows = payerRosterRows(
      rosterByDesigner.get(designerId) ?? [],
      payerId,
    );
    for (const r of rows) {
      const household = r.household_id
        ? householdById.get(r.household_id)
        : null;
      if (household) return household;
    }
    return null;
  };

  // ── 5. invoices ────────────────────────────────────────────────────────
  let totalBilledMinor = 0;
  let totalBilledLiveMinor = 0;
  let voidedOrDraftBilledMinor = 0;
  let voidedOrDraftInvoices = 0;
  let collectedMinor = 0;
  let amountPaidCounterMinor = 0;
  let balanceMinor = 0;
  let creditMinor = 0;
  let invoicesWherePaidCounterDisagrees = 0;

  const invoiceRows: SheetCell[][] = invoices.map((inv) => {
    const project = inv.project_id
      ? (projectById.get(inv.project_id) ?? null)
      : null;
    const sums = sumPayments(paymentsByInvoice.get(inv.id) ?? []);
    const totalCents = minor(inv.total_cents);
    const paidCents = minor(inv.amount_paid_cents);
    // SIGNED, and a negative balance is a CREDIT — money the studio holds
    // beyond what it billed. `Math.max(total - paid, 0)` read that as 0 and the
    // overpayment then appeared in no column at all. `credit_minor` carries the
    // same figure unsigned, so neither a sum down the balance column nor a
    // search for credits can miss it.
    const balance = totalCents - paidCents;
    const credit = balance < 0 ? -balance : 0;
    // 00178:36 — status is one of draft/sent/partially_paid/paid/void.
    const voidedOrDraft =
      inv.status === "void" || inv.status === "draft" || Boolean(inv.voided_at);
    const payerId = inv.client_id ?? project?.client_id ?? null;
    const household = payerHousehold(inv.designer_id, payerId);

    totalBilledMinor += totalCents;
    if (voidedOrDraft) {
      voidedOrDraftBilledMinor += totalCents;
      voidedOrDraftInvoices += 1;
    } else totalBilledLiveMinor += totalCents;
    collectedMinor += sums.collected;
    amountPaidCounterMinor += paidCents;
    balanceMinor += balance;
    creditMinor += credit;
    if (sums.collected !== paidCents) invoicesWherePaidCounterDisagrees += 1;

    return [
      text(inv.id),
      text(inv.invoice_number),
      text(inv.status),
      text(invoicePaymentStanding(sums, totalCents)),
      text(inv.currency),
      text(inv.issue_date),
      text(inv.due_date),
      inv.payment_terms_days ?? null,
      minor(inv.subtotal_cents),
      decimal(inv.subtotal_cents),
      inv.tax_rate ?? null,
      minor(inv.tax_cents),
      decimal(inv.tax_cents),
      totalCents,
      decimal(totalCents),
      paidCents,
      decimal(paidCents),
      sums.collected,
      decimal(sums.collected),
      sums.pending,
      sums.failed,
      sums.refunded,
      sums.requiresRefund,
      balance,
      decimal(balance),
      credit,
      text(inv.client_id),
      text(
        resolveInvoicePayerName(
          inv,
          project,
          rosterByDesigner,
          profileById,
          studioHouseholdIds,
        ),
      ),
      text(household?.id ?? null),
      text(household?.display_name ?? null),
      text(inv.project_id),
      text(project?.name ?? null),
      text(inv.studio_id),
      text(inv.designer_id),
      text(
        trimmed(inv.designer?.full_name) ??
          trimmed(inv.designer?.display_name ?? null),
      ),
      text(inv.title),
      text(inv.memo),
      text(inv.sent_at),
      text(inv.paid_at),
      text(inv.voided_at),
      text(inv.created_at),
    ];
  });

  // ── 6. invoice_lines ───────────────────────────────────────────────────
  const lineRows: SheetCell[][] = lines.map((l) => [
    text(l.id),
    text(l.invoice_id),
    text(invoiceNumberById.get(l.invoice_id) ?? null),
    l.sort_order ?? null,
    text(l.kind),
    text(l.description),
    l.quantity ?? null,
    minor(l.unit_amount_cents),
    decimal(l.unit_amount_cents),
    minor(l.amount_cents),
    decimal(l.amount_cents),
    text(currencyById.get(l.invoice_id) ?? null),
    text(l.milestone_id),
    text(l.ffe_item_id),
    text(l.created_at),
  ]);

  // ── 7. payments ────────────────────────────────────────────────────────
  const paymentRows: SheetCell[][] = payments.map((p) => {
    const inv = invoiceById.get(p.invoice_id) ?? null;
    const project = inv?.project_id
      ? (projectById.get(inv.project_id) ?? null)
      : null;
    const payerId = inv ? (inv.client_id ?? project?.client_id ?? null) : null;
    const household = inv ? payerHousehold(inv.designer_id, payerId) : null;
    return [
      text(p.id),
      text(p.invoice_id),
      text(invoiceNumberById.get(p.invoice_id) ?? null),
      text(p.status),
      p.status === "succeeded" ? "Yes" : "No",
      text(p.method),
      minor(p.amount_cents),
      decimal(p.amount_cents),
      minor(p.surcharge_cents),
      decimal(p.surcharge_cents),
      text(currencyById.get(p.invoice_id) ?? null),
      text(p.received_at),
      text(p.created_at),
      text(p.reference),
      text(p.recorded_by),
      text(p.stripe_payment_intent_id),
      text(p.stripe_checkout_session_id),
      text(payerId),
      text(household?.id ?? null),
      text(inv?.project_id ?? null),
    ];
  });

  // ── 8. clients ─────────────────────────────────────────────────────────
  const clientSheetRows: SheetCell[][] = clientRows.map(({ row, path }) => {
    const household = row.household_id
      ? (householdById.get(row.household_id) ?? null)
      : null;
    return [
      text(row.id),
      text(row.client_id),
      text(clientRecordName(row)),
      text(trimmed(row.client_email) ?? trimmed(row.client?.email ?? null)),
      text(row.client_phone),
      text(row.status),
      text(row.source),
      text(household?.id ?? null),
      text(household?.display_name ?? null),
      household ? (household.member_person_ids ?? []).length : null,
      household?.co_threshold_cents ?? null,
      household?.co_threshold_cents == null
        ? null
        : decimal(household.co_threshold_cents),
      text(row.designer_id),
      text(
        trimmed(row.designer?.full_name) ??
          trimmed(row.designer?.display_name ?? null),
      ),
      text(path),
      text(row.created_at),
      text(row.updated_at),
    ];
  });

  // ── 9. The manifest. ──────────────────────────────────────────────────
  const dataSheets: BillingExportSheet[] = [
    { name: "invoices", header: INVOICE_COLUMNS, rows: invoiceRows },
    { name: "invoice_lines", header: INVOICE_LINE_COLUMNS, rows: lineRows },
    { name: "payments", header: PAYMENT_COLUMNS, rows: paymentRows },
    { name: "clients", header: CLIENT_COLUMNS, rows: clientSheetRows },
  ];

  const manifest = buildManifest(
    source,
    dataSheets,
    {
      invoicesNullStudio: source.nullStudioInvoiceCount,
      invoicesOtherStudio: source.otherStudioInvoiceCount,
      invoicesNullStudioInFetchedRows,
      invoicesOtherStudioInFetchedRows,
      clientRecordsNoStudioPath,
      linesOrphaned,
      paymentsOrphaned,
      projectsForeignStudio,
      projectsNamedByInvoiceOutsideStudio:
        source.invoiceProjectsOutsideStudioCount,
    },
    {
      totalBilledMinor,
      totalBilledLiveMinor,
      voidedOrDraftBilledMinor,
      voidedOrDraftInvoices,
      collectedMinor,
      amountPaidCounterMinor,
      balanceMinor,
      creditMinor,
      invoicesWherePaidCounterDisagrees,
    },
  );

  return {
    sheets: [
      ...dataSheets,
      {
        name: "manifest",
        header: MANIFEST_COLUMNS,
        // Through the same guard every other sheet's text goes through. The
        // manifest is not a sheet of stored values — `studio_name` is the
        // studio's own free text — and a cell that arrives here raw executes
        // when the bookkeeper opens the file, on the one sheet she reads first.
        rows: manifest.entries.map((e) => [
          text(e.section),
          text(e.key),
          typeof e.value === "string" ? text(e.value) : e.value,
        ]),
      },
    ],
    manifest,
  };
}

function buildManifest(
  source: StudioBillingSource,
  dataSheets: BillingExportSheet[],
  exclusions: StudioBillingManifest["exclusions"],
  reconciliation: StudioBillingManifest["reconciliation"],
): StudioBillingManifest {
  const counts: Record<string, number> = {};
  for (const sheet of dataSheets) counts[sheet.name] = sheet.rows.length;

  const missingValues: StudioBillingManifest["missingValues"] = [];
  for (const sheet of dataSheets) {
    sheet.header.forEach((column, index) => {
      let missing = 0;
      for (const row of sheet.rows) {
        const cell = row[index];
        if (cell === null || cell === undefined || cell === "") missing += 1;
      }
      missingValues.push({ sheet: sheet.name, column, missing });
    });
  }

  const entries: ManifestEntry[] = [
    { section: "report", key: "title", value: "Patina studio billing export" },
    {
      section: "report",
      key: "sheets",
      value: "invoices, invoice_lines, payments, clients, manifest",
    },
    { section: "report", key: "snapshot_at", value: source.snapshotAt },
    {
      section: "report",
      key: "snapshot_date",
      value: source.snapshotAt.slice(0, 10),
    },
    {
      section: "report",
      key: "money_units",
      value:
        "every *_minor column is integer minor units as stored; *_decimal is the same money as a number",
    },
    {
      section: "report",
      key: "money_balance",
      value:
        "balance_minor is SIGNED (total_minor - amount_paid_minor), so a negative balance is a credit the studio is holding; credit_minor carries that same figure unsigned and is 0 on every other row",
    },
    {
      section: "report",
      key: "currency",
      value:
        "every *_decimal column is the *_minor figure divided by 100; the export refuses to write a file holding a currency whose minor unit is not 1/100 (USD, CAD, EUR and GBP are accepted) rather than print two money columns that disagree",
    },
    {
      section: "report",
      key: "timestamps",
      value:
        "UTC ISO-8601 as stored; issue_date and due_date are stored calendar dates",
    },
    { section: "scope", key: "studio_id", value: source.studioId },
    { section: "scope", key: "studio_name", value: source.studioName ?? "" },
    {
      section: "scope",
      key: "rule",
      value:
        "invoices.studio_id = studio_id — the tenant leg on top of the co-member RLS (00316/00584), which is member-scoped, not tenant-scoped (00632:30-37)",
    },
    {
      section: "scope",
      key: "includes",
      value:
        "studio invoices with no project (project_id IS NULL, 00571) alongside project invoices; drafts and voided invoices are included and labelled",
    },
    {
      section: "scope",
      key: "clients_rule",
      value:
        "a client record is included only through an unambiguous studio authorization path: payer of an included invoice, client of a project of this studio, or member of a household of this studio",
    },
    {
      section: "scope",
      key: "not_included",
      value:
        "no FF&E or schedule export, no QuickBooks mapping sheet, no whole-studio archive; invoices.internal_notes and client notes are withheld",
    },
  ];

  for (const sheet of dataSheets)
    entries.push({
      section: "counts",
      key: `${sheet.name}_rows`,
      value: counts[sheet.name],
    });

  entries.push(
    {
      section: "exclusions",
      key: "invoices_with_null_studio_id",
      value: exclusions.invoicesNullStudio,
    },
    {
      section: "exclusions",
      key: "invoices_with_null_studio_id_note",
      value:
        "readable by this viewer under co-member RLS but carrying no tenant stamp (00318 added the column; 00513: numbering falls back to the per-designer counter only when an invoice has no studio) — excluded from this studio-scoped file",
    },
    {
      section: "exclusions",
      key: "invoices_of_another_studio",
      value: exclusions.invoicesOtherStudio,
    },
    {
      section: "exclusions",
      key: "invoices_of_another_studio_note",
      value:
        "readable here because is_studio_comember() matches any shared organization — never written to this file",
    },
    {
      section: "exclusions",
      key: "fetched_rows_dropped_null_studio",
      value: exclusions.invoicesNullStudioInFetchedRows,
    },
    {
      section: "exclusions",
      key: "fetched_rows_dropped_other_studio",
      value: exclusions.invoicesOtherStudioInFetchedRows,
    },
    {
      section: "exclusions",
      key: "client_records_without_studio_path",
      value: exclusions.clientRecordsNoStudioPath,
    },
    {
      section: "exclusions",
      key: "invoice_lines_without_included_invoice",
      value: exclusions.linesOrphaned,
    },
    {
      section: "exclusions",
      key: "payments_without_included_invoice",
      value: exclusions.paymentsOrphaned,
    },
    {
      section: "exclusions",
      key: "projects_read_naming_another_studio",
      value: exclusions.projectsForeignStudio,
    },
    {
      section: "exclusions",
      key: "projects_named_by_an_invoice_outside_this_studio",
      value: exclusions.projectsNamedByInvoiceOutsideStudio,
    },
    {
      section: "exclusions",
      key: "projects_naming_another_studio_note",
      value:
        "an invoice of this studio can name a project of another one, or of none (00578:8730-8746 adopts an origin deposit onto a project without requiring the studios to match) — such a project's name, client and payer are never written to this file; only the count is",
    },
    {
      section: "reconciliation",
      key: "total_billed_minor",
      value: reconciliation.totalBilledMinor,
    },
    {
      section: "reconciliation",
      key: "total_billed_excluding_void_draft_minor",
      value: reconciliation.totalBilledLiveMinor,
    },
    {
      section: "reconciliation",
      key: "voided_or_draft_billed_minor",
      value: reconciliation.voidedOrDraftBilledMinor,
    },
    {
      section: "reconciliation",
      key: "voided_or_draft_invoices",
      value: reconciliation.voidedOrDraftInvoices,
    },
    {
      section: "reconciliation",
      key: "total_billed_note",
      value:
        "total_billed_minor counts EVERY invoice in the file — drafts and voided ones included, each labelled in the status column — and total_billed_excluding_void_draft_minor + voided_or_draft_billed_minor = total_billed_minor",
    },
    {
      section: "reconciliation",
      key: "collected_minor_from_payment_rows",
      value: reconciliation.collectedMinor,
    },
    {
      section: "reconciliation",
      key: "amount_paid_minor_from_invoice_counters",
      value: reconciliation.amountPaidCounterMinor,
    },
    {
      section: "reconciliation",
      key: "balance_minor",
      value: reconciliation.balanceMinor,
    },
    {
      section: "reconciliation",
      key: "credit_minor",
      value: reconciliation.creditMinor,
    },
    {
      section: "reconciliation",
      key: "balance_note",
      value:
        "balance_minor is the SIGNED sum down the invoices sheet, so total_billed_minor - amount_paid_minor_from_invoice_counters = balance_minor exactly; balance_minor, collected_minor_from_payment_rows and amount_paid_minor_from_invoice_counters each COUNT voided and draft invoices, and the invoices sheet's status column is the filter that excludes them — a receivable figure that leaves them out is a sum down that sheet filtered on status; credit_minor is not a part of balance_minor but the overpayment the studio holds on its books, the per-invoice amounts paid beyond the total summed unsigned, so what is still owed to the studio is balance_minor + credit_minor",
    },
    {
      section: "reconciliation",
      key: "invoices_where_the_two_disagree",
      value: reconciliation.invoicesWherePaidCounterDisagrees,
    },
    {
      section: "reconciliation",
      key: "note",
      value:
        "collected counts succeeded payment rows only; pending, failed, refunded and requires_refund money is carried in its own column and never as collected",
    },
  );

  for (const mv of missingValues)
    entries.push({
      section: "missing_values",
      key: `${mv.sheet}.${mv.column}`,
      value: mv.missing,
    });

  return {
    snapshotAt: source.snapshotAt,
    studioId: source.studioId,
    studioName: source.studioName,
    counts,
    exclusions,
    reconciliation,
    missingValues,
    entries,
  };
}

/** The manifest as plain text — the same rows the manifest sheet prints, for a
 *  record that does not need a spreadsheet to read. */
export function studioBillingManifestText(
  manifest: StudioBillingManifest,
): string {
  const lines: string[] = [];
  let section = "";
  for (const entry of manifest.entries) {
    if (entry.section !== section) {
      section = entry.section;
      lines.push("", `[${section}]`);
    }
    lines.push(`${entry.key} = ${entry.value}`);
  }
  return lines.join("\n").trimStart().concat("\n");
}

/** "patina-studio-billing-middle-west-studio-2026-09-23.xlsx" — the same
 *  naming shape `timeExportFilename` uses. */
export function studioBillingExportFilename(
  studioName: string | null | undefined,
  dateISO?: string,
): string {
  const date = dateISO ?? new Date().toISOString().slice(0, 10);
  const slug =
    (studioName ?? "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "studio";
  return `patina-studio-billing-${slug}-${date}.xlsx`;
}
