/**
 * THE READ AND THE WRITE for the studio billing export (P3) — everything
 * `studio-billing-export.ts` deliberately is not: the network, and the .xlsx.
 *
 * READ. Under the viewer's own JWT, so the server decides what she may see:
 * the co-member RLS (00316/00584) authorizes, and `.eq('studio_id', studioId)`
 * narrows it to ONE tenant, because that RLS is member-scoped and a member with
 * a second studio reads that studio's invoices too (00632:30-37). Browser row
 * selection is never the authorization — it is the second leg on top of it.
 *
 * Every read pages to the end (`.range()`, ordered by a stable key: PostgREST
 * caps a page at 1000 rows and an export that stopped at the cap would be a
 * silent omission). Any failing read aborts the whole export and names the step
 * — a partial billing file that looks complete is worse than no file.
 *
 * WRITE. SheetJS, lazy-imported exactly as the Library import sheet imports it
 * (`components/document/rooms/library/import-sheet.tsx:102`), so the ~400 KB
 * parser is not in the Accounts book's first load.
 */

import { createBrowserClient } from "@patina/supabase";

import {
  buildStudioBillingExport,
  studioBillingExportFilename,
  type BillingExportSheet,
  type RawClientRecordRow,
  type RawHouseholdRow,
  type RawInvoiceRow,
  type RawLineRow,
  type RawPaymentRow,
  type RawProjectRow,
  type StudioBillingExport,
} from "./studio-billing-export";

type AnyRecord = any;

const getSupabase = () => createBrowserClient() as AnyRecord;

/** PostgREST's own page ceiling. */
const PAGE = 1000;
/** Ids per `.in(...)` — a URL, not a statement, so the list is chunked. */
const IN_CHUNK = 150;

/** A named read failure. The Accounts book prints the step so a support
 *  question has something to act on. */
export class StudioBillingExportError extends Error {
  readonly step: string;
  constructor(step: string, message: string) {
    super(message);
    this.name = "StudioBillingExportError";
    this.step = step;
  }
}

type PageResult = {
  data: AnyRecord[] | null;
  error: { message: string } | null;
};

/** Read every page of one query. `build` is called per page so each page is a
 *  fresh builder — a PostgREST query builder is single-use. */
async function pageAll(
  step: string,
  build: (from: number, to: number) => PromiseLike<PageResult>,
): Promise<AnyRecord[]> {
  const rows: AnyRecord[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new StudioBillingExportError(step, error.message);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

function chunk<T>(values: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < values.length; i += size)
    out.push(values.slice(i, i + size));
  return out;
}

async function countOnly(
  step: string,
  build: () => PromiseLike<{
    count: number | null;
    error: { message: string } | null;
  }>,
): Promise<number> {
  const { count, error } = await build();
  if (error) throw new StudioBillingExportError(step, error.message);
  return count ?? 0;
}

const INVOICE_SELECT = `
  id, studio_id, designer_id, client_id, project_id, invoice_number, title,
  status, currency, issue_date, due_date, payment_terms_days, subtotal_cents,
  tax_rate, tax_cents, total_cents, amount_paid_cents, memo, sent_at, paid_at,
  voided_at, created_at,
  client:profiles!invoices_client_id_fkey(id, full_name, display_name, email),
  designer:profiles!invoices_designer_id_fkey(id, full_name, display_name, email)
`;

const CLIENT_RECORD_SELECT = `
  id, designer_id, client_id, household_id, client_name, client_email,
  client_phone, status, source, created_at, updated_at,
  client:profiles!client_id(id, full_name, display_name, email),
  designer:profiles!designer_clients_designer_id_fkey(id, full_name, display_name, email)
`;

const PROJECT_SELECT = `
  id, name, studio_id, client_id,
  client:profiles!projects_client_id_fkey(id, full_name, display_name, email)
`;

/**
 * Every row this studio's billing file is built from, at one snapshot.
 * `snapshotAt` is taken once here so the manifest's instant is the instant the
 * reads began.
 */
export async function fetchStudioBillingExport(
  studioId: string,
  studioName: string | null,
): Promise<StudioBillingExport> {
  const supabase = getSupabase();
  const snapshotAt = new Date().toISOString();

  // 1. The invoices — the tenant leg, and the only door the children come
  //    through. Ordered by a stable key so the pages do not overlap or skip.
  const invoices = (await pageAll("invoices", (from, to) =>
    supabase
      .from("invoices")
      .select(INVOICE_SELECT)
      .eq("studio_id", studioId)
      .order("id")
      .range(from, to),
  )) as RawInvoiceRow[];

  // 2. The two disclosures. Counted, never read: they are not this studio's
  //    rows, and the manifest owes the studio the figures, not the data.
  const nullStudioInvoiceCount = await countOnly("invoices (null studio)", () =>
    supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .is("studio_id", null),
  );
  const otherStudioInvoiceCount = await countOnly(
    "invoices (other studio)",
    () =>
      supabase
        .from("invoices")
        .select("id", { count: "exact", head: true })
        .not("studio_id", "is", null)
        .neq("studio_id", studioId),
  );

  const invoiceIds = invoices.map((i) => i.id);
  const designerIds = [...new Set(invoices.map((i) => i.designer_id))];
  const invoiceProjectIds = [
    ...new Set(
      invoices.map((i) => i.project_id).filter((id): id is string => !!id),
    ),
  ];

  // 3. Lines and payments, keyed on the included invoices only.
  const lines: RawLineRow[] = [];
  const payments: RawPaymentRow[] = [];
  for (const ids of chunk(invoiceIds, IN_CHUNK)) {
    lines.push(
      ...((await pageAll("invoice_line_items", (from, to) =>
        supabase
          .from("invoice_line_items")
          .select(
            "id, invoice_id, kind, milestone_id, ffe_item_id, description, quantity, unit_amount_cents, amount_cents, sort_order, created_at",
          )
          .in("invoice_id", ids)
          .order("id")
          .range(from, to),
      )) as RawLineRow[]),
    );
    payments.push(
      ...((await pageAll("invoice_payments", (from, to) =>
        supabase
          .from("invoice_payments")
          .select(
            "id, invoice_id, amount_cents, surcharge_cents, method, status, reference, received_at, created_at, recorded_by, stripe_payment_intent_id, stripe_checkout_session_id",
          )
          .in("invoice_id", ids)
          .order("id")
          .range(from, to),
      )) as RawPaymentRow[]),
    );
  }

  // 4. Projects: this studio's own (a client of one is an authorization path),
  //    plus any project an included invoice names that the first read missed —
  //    `invoices.studio_id` is a snapshot of the ISSUING studio and need not
  //    equal the project's, and the file must still be able to print the
  //    project's name. The builder counts any that name another studio.
  const projects = (await pageAll("projects", (from, to) =>
    supabase
      .from("projects")
      .select(PROJECT_SELECT)
      .eq("studio_id", studioId)
      .order("id")
      .range(from, to),
  )) as RawProjectRow[];
  const seenProjectIds = new Set(projects.map((p) => p.id));
  const missingProjectIds = invoiceProjectIds.filter(
    (id) => !seenProjectIds.has(id),
  );
  for (const ids of chunk(missingProjectIds, IN_CHUNK)) {
    projects.push(
      ...((await pageAll("projects (named by an invoice)", (from, to) =>
        supabase
          .from("projects")
          .select(PROJECT_SELECT)
          .in("id", ids)
          .order("id")
          .range(from, to),
      )) as RawProjectRow[]),
    );
  }

  // 5. This studio's households — the only household rows the file may key on.
  const households = (await pageAll("client_households", (from, to) =>
    supabase
      .from("client_households")
      .select(
        "id, organization_id, designer_id, display_name, member_person_ids, co_threshold_cents, created_at",
      )
      .eq("organization_id", studioId)
      .order("id")
      .range(from, to),
  )) as RawHouseholdRow[];

  // 6. Client records. `designer_clients` has no studio column, so the read is
  //    the union of the invoice designers' rosters (which the co-member RLS
  //    already exposes) plus this studio's household rows — and the BUILDER
  //    then keeps only the rows with an unambiguous studio authorization path
  //    and discloses how many it dropped. The wide read is what makes that
  //    disclosure a measured figure rather than a claim.
  const clientRecordById = new Map<string, RawClientRecordRow>();
  const noteClientRecords = (rows: RawClientRecordRow[]) => {
    for (const row of rows) clientRecordById.set(row.id, row);
  };
  for (const ids of chunk(designerIds, IN_CHUNK)) {
    noteClientRecords(
      (await pageAll("designer_clients", (from, to) =>
        supabase
          .from("designer_clients")
          .select(CLIENT_RECORD_SELECT)
          .in("designer_id", ids)
          .order("id")
          .range(from, to),
      )) as RawClientRecordRow[],
    );
  }
  for (const ids of chunk(
    households.map((h) => h.id),
    IN_CHUNK,
  )) {
    noteClientRecords(
      (await pageAll("designer_clients (household)", (from, to) =>
        supabase
          .from("designer_clients")
          .select(CLIENT_RECORD_SELECT)
          .in("household_id", ids)
          .order("id")
          .range(from, to),
      )) as RawClientRecordRow[],
    );
  }

  return buildStudioBillingExport({
    studioId,
    studioName,
    snapshotAt,
    invoices,
    lines,
    payments,
    projects,
    clientRecords: [...clientRecordById.values()],
    households,
    nullStudioInvoiceCount,
    otherStudioInvoiceCount,
  });
}

/** Sheets → one .xlsx. Lazy SheetJS; `type: 'array'` hands back an
 *  ArrayBuffer. */
export async function buildStudioBillingWorkbook(
  sheets: BillingExportSheet[],
): Promise<ArrayBuffer> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const aoa = [[...sheet.header], ...sheet.rows];
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet(aoa),
      sheet.name,
    );
  }
  return XLSX.write(workbook, {
    bookType: "xlsx",
    type: "array",
  }) as ArrayBuffer;
}

/** Trigger the browser's save dialog. Deferred revoke for the reason
 *  `time-export.ts` documents: revoking synchronously races the hand-off. */
export function saveStudioBillingWorkbook(
  bytes: ArrayBuffer,
  filename: string,
): void {
  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** The whole act: read, build, write, save. Returns the manifest so the caller
 *  can say what left the studio. */
export async function downloadStudioBillingExport(
  studioId: string,
  studioName: string | null,
): Promise<StudioBillingExport> {
  const built = await fetchStudioBillingExport(studioId, studioName);
  const bytes = await buildStudioBillingWorkbook(built.sheets);
  saveStudioBillingWorkbook(
    bytes,
    studioBillingExportFilename(
      studioName,
      built.manifest.snapshotAt.slice(0, 10),
    ),
  );
  return built;
}
