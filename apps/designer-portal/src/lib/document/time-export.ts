/**
 * The bookkeeper's Friday (W5, HT-20) — a per-entry CSV built in the browser
 * from `time_entry_ledger` rows (00604), the same fact view the Hours sheet's
 * four scopes already read. Pure, dependency-free core — no React, no
 * network — same direction as
 * `components/document/rooms/library/import-parse.ts`; the column set and
 * escaping copy the proven `supabase/functions/qbo-export/index.ts` blob
 * pattern (the AP-side precedent; there is no AR/labour twin before this).
 *
 * Column order (fixed — a spreadsheet's first row is a contract):
 *   Member, Date, Project, Client, Activity, Billable, Duration (min), Rate,
 *   Rate Source, Rate Role, Amount, Billing State, Invoiced, Invoice #
 *
 * `notes` is deliberately absent (HT-36) — the ledger view itself carries no
 * such column, so there is nothing to leak.
 *
 * An internal row (W4: `project_id IS NULL`) carries no `project_name` — the
 * ledger's LEFT JOIN to `projects` leaves it NULL, and this module prints
 * that as an empty cell rather than inventing a label.
 *
 * `client_name` and `invoice_number` are not columns of `time_entry_ledger`
 * (no client, no invoice-number join lives there) — the caller (the Hours
 * sheet) supplies them per row, looked up from data it already reads
 * elsewhere (`@patina/supabase`'s `useClients`, and a small invoice-number
 * lookup scoped to the invoice ids the shown rows actually carry). Missing
 * either prints an empty cell rather than blocking the export.
 */

import type { TimeEntryLedgerRow } from "@patina/supabase";

import { timeRateProvenance } from "./authority-hours";

export interface TimeExportRow extends TimeEntryLedgerRow {
  /** The project's client/household name — not a ledger column; see above. */
  client_name?: string | null;
  /** The invoice's human number — not a ledger column; see above. */
  invoice_number?: string | null;
}

const CSV_HEADER = [
  "Member",
  "Date",
  "Project",
  "Client",
  "Activity",
  "Billable",
  "Duration (min)",
  "Rate",
  "Rate Source",
  "Rate Role",
  "Amount",
  "Billing State",
  "Invoiced",
  "Invoice #",
] as const;

/** RFC-4180 field: double-quote, escape embedded ", flatten newlines to
 *  spaces — ported verbatim from the qbo-export precedent so a bookkeeper
 *  opens the same shape twice. */
function csvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '""';
  const s = String(value).replace(/[\r\n]+/g, " ");
  return `"${s.replace(/"/g, '""')}"`;
}

/** Integer cents → plain decimal dollars ("14500" → "145.00"), no currency
 *  sigil — a bookkeeper's import column, not a display string. */
function centsToDollars(cents: number | null | undefined): string {
  return ((cents ?? 0) / 100).toFixed(2);
}

/** m6-r3 — a rate-pending hour (no rate card resolved yet) must never export
 *  a confident "0.00": that is a real ledger row whose Rate and Amount are
 *  simply not known yet, not a zero-cost hour. "pending" in both cells,
 *  matching the portal's own copy for the state (`time-capture.tsx`, HT-26).
 *
 *  M1-r4 — "pending" is the RATE's state, not the authorization's. An earlier
 *  round keyed this on `billing_state === "pending_authorization"`, which is a
 *  fully PRICED state (00601: "it now carries the studio rate and stays
 *  pending_authorization, so the row prints honestly") — so real, resolved
 *  money left the file as the word "pending" and the Amount column stopped
 *  summing to the ledger's total. The predicate is the portal's own canonical
 *  one (`timeRateProvenance` → `kind: "pending"`, i.e. billable, nothing
 *  priced it, and `rate_source === "none"`); a null `rate_source` is a
 *  pre-00600 legacy row carrying a real snapshot and is NOT pending. */
function isRatePending(row: TimeExportRow): boolean {
  // The fact view prints `resolved_rate_cents` (0 where nothing priced the
  // hour), not the entry column — the same mapping `ScopeEntryRow` makes.
  const provenance = timeRateProvenance(
    {
      hourly_rate_cents: row.resolved_rate_cents,
      rate_source: row.rate_source ?? null,
      rate_role: row.rate_role ?? null,
      billable: row.billable,
      billing_state: row.billing_state ?? null,
    },
    null,
  );
  return provenance.kind === "pending";
}

function csvRow(row: TimeExportRow): string {
  const ratePending = isRatePending(row);
  return [
    csvField(row.member_name ?? ""),
    csvField(row.day),
    csvField(row.project_name ?? ""),
    csvField(row.client_name ?? ""),
    csvField(row.activity ?? ""),
    csvField(row.billable ? "Yes" : "No"),
    csvField(row.duration_minutes ?? 0),
    csvField(ratePending ? "pending" : centsToDollars(row.resolved_rate_cents)),
    csvField(row.rate_source ?? ""),
    csvField(row.rate_role ?? ""),
    csvField(ratePending ? "pending" : centsToDollars(row.amount_cents)),
    csvField(row.billing_state ?? ""),
    csvField(row.invoice_id ? "Yes" : "No"),
    csvField(row.invoice_number ?? ""),
  ].join(",");
}

/** Build the full CSV text (header + one row per entry). CRLF line endings —
 *  the qbo-export precedent's convention, and the one every spreadsheet
 *  reads without translation. */
export function buildTimeExportCsv(rows: TimeExportRow[]): string {
  const header = CSV_HEADER.map((h) => csvField(h)).join(",");
  return [header, ...rows.map(csvRow)].join("\r\n").concat("\r\n");
}

/** Sum of the exported rows' amount_cents — the CSV's own reconciliation
 *  figure (Done-when: "the amounts sum to the ledger's total"). */
export function timeExportTotalCents(rows: TimeExportRow[]): number {
  return rows.reduce((sum, r) => sum + (r.amount_cents ?? 0), 0);
}

/** "patina-hours-studio-2026-09-12.csv" — same naming shape as
 *  qbo-export's `patina-vendor-bills-{date}.csv`. */
export function timeExportFilename(
  scopeLabel: string,
  dateISO?: string,
): string {
  const date = dateISO ?? new Date().toISOString().slice(0, 10);
  const safeScope =
    scopeLabel
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "hours";
  return `patina-hours-${safeScope}-${date}.csv`;
}

/** Trigger the browser's save-file dialog for a built CSV. Not called by any
 *  test — it is a thin DOM side effect, kept out of the pure builders above
 *  so they stay unit-testable without a DOM. */
export function downloadTimeExportCsv(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  // m3-r3 — deferred, matching the other three in-repo download helpers
  // (room-file-download.ts, export-board.ts, spec-pdf-client.ts): revoking
  // synchronously in a `finally` right after `.click()` races the browser's
  // own async hand-off to the save dialog/download manager on some
  // browsers, which can starve the download of its blob.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
