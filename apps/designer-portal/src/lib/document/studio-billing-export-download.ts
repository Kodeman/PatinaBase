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
 * Every read pages to the end by KEYSET — `.order('id')` with `id > lastId` —
 * and not by offset: a `.range(from, to)` window shifts under a concurrent
 * insert, so a row can be skipped or repeated at a page boundary, and these
 * primary keys are random uuids, so a shifted window is not even adjacent.
 * Paging stops on an EMPTY page and never on a short one: a server whose
 * `db-max-rows` is below our page size would otherwise end the read on page one
 * and truncate the file in silence — the exact omission this module exists to
 * prevent. Any failing read aborts the whole export and names the step: a
 * partial billing file that looks complete is worse than no file, and so is one
 * whose two money columns disagree, which is why an unsupported currency aborts
 * the same way.
 *
 * WRITE. SheetJS, lazy-imported exactly as the Library import sheet imports it
 * (`components/document/rooms/library/import-sheet.tsx:102`), so the ~400 KB
 * parser is not in the Accounts book's first load.
 */

import { createBrowserClient } from "@patina/supabase";

import {
  buildStudioBillingExport,
  studioBillingExportFilename,
  unsupportedCurrencyCodes,
  TWO_DECIMAL_CURRENCIES,
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

/** Rows asked for per page. PostgREST's default `db-max-rows` ceiling; a lower
 *  one just means more, smaller pages, because the loop stops on an empty page
 *  rather than on a short one. */
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
 *  fresh builder — a PostgREST query builder is single-use — and is handed the
 *  last id of the previous page as its cursor (`null` on the first). See the
 *  header for why the cursor is a key and not an offset, and why the loop ends
 *  on an empty page. */
async function pageAll(
  step: string,
  build: (afterId: string | null) => PromiseLike<PageResult>,
): Promise<AnyRecord[]> {
  const rows: AnyRecord[] = [];
  let cursor: string | null = null;
  for (;;) {
    const { data, error } = await build(cursor);
    if (error) throw new StudioBillingExportError(step, error.message);
    const page = data ?? [];
    if (page.length === 0) return rows;
    rows.push(...page);
    // Ascending by id, so the last row is the high-water mark and `id > cursor`
    // always advances — the loop cannot repeat a page. A row with no id to key
    // on cannot be paged past, and stopping beats spinning.
    const lastId = page[page.length - 1]?.id;
    if (typeof lastId !== "string") return rows;
    cursor = lastId;
  }
}

/** The keyset cursor. Applied BEFORE `.order()`/`.limit()` on purpose: those
 *  hand back a PostgREST TRANSFORM builder, which carries no filter methods. */
function afterId(query: AnyRecord, cursor: string | null): AnyRecord {
  return cursor === null ? query : query.gt("id", cursor);
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
  const invoices = (await pageAll("invoices", (cursor) =>
    afterId(
      supabase
        .from("invoices")
        .select(INVOICE_SELECT)
        .eq("studio_id", studioId),
      cursor,
    )
      .order("id")
      .limit(PAGE),
  )) as RawInvoiceRow[];

  // Before anything else is read: `*_decimal` divides the minor unit by 100, and
  // `invoices.currency` is TEXT with no CHECK (00014:353), so a 0- or 3-decimal
  // currency would make every decimal column in the file wrong while the minor
  // columns stayed exact. That is a file whose own two money columns disagree, so
  // it aborts with a named step exactly as a failing read does.
  const unsupported = unsupportedCurrencyCodes(invoices);
  if (unsupported.length > 0)
    throw new StudioBillingExportError(
      "the currency check",
      `this book holds ${unsupported.join(", ")}, and the export writes decimal money only for currencies with a 1/100 minor unit (${TWO_DECIMAL_CURRENCIES.join(", ")})`,
    );

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
      ...((await pageAll("invoice_line_items", (cursor) =>
        afterId(
          supabase
            .from("invoice_line_items")
            .select(
              "id, invoice_id, kind, milestone_id, ffe_item_id, description, quantity, unit_amount_cents, amount_cents, sort_order, created_at",
            )
            .in("invoice_id", ids),
          cursor,
        )
          .order("id")
          .limit(PAGE),
      )) as RawLineRow[]),
    );
    payments.push(
      ...((await pageAll("invoice_payments", (cursor) =>
        afterId(
          supabase
            .from("invoice_payments")
            .select(
              "id, invoice_id, amount_cents, surcharge_cents, method, status, reference, received_at, created_at, recorded_by, stripe_payment_intent_id, stripe_checkout_session_id",
            )
            .in("invoice_id", ids),
          cursor,
        )
          .order("id")
          .limit(PAGE),
      )) as RawPaymentRow[]),
    );
  }

  // 4. Projects: this studio's own, and ONLY those — the tenant leg is on this
  //    read too. `invoices.studio_id` is a snapshot of the ISSUING studio and
  //    need not equal the project's (00578:8730-8746 adopts an origin deposit
  //    onto a project without requiring them to match), and the file prints a
  //    project's name, its client and its payer. So a project this studio does
  //    not own is never FETCHED; what an included invoice names and this read
  //    did not return is COUNTED instead, from the ids themselves, and the
  //    manifest carries the figure. Counted, not read, is the whole disclosure.
  const projects = (await pageAll("projects", (cursor) =>
    afterId(
      supabase
        .from("projects")
        .select(PROJECT_SELECT)
        .eq("studio_id", studioId),
      cursor,
    )
      .order("id")
      .limit(PAGE),
  )) as RawProjectRow[];
  const seenProjectIds = new Set(projects.map((p) => p.id));
  const missingProjectIds = invoiceProjectIds.filter(
    (id) => !seenProjectIds.has(id),
  );
  // The figure is LOCAL: how many project ids an included invoice named that
  // this studio's own read did not return. Asking the DB to count those ids
  // instead returned 0 whenever RLS hid the foreign project from this viewer —
  // which is the usual case — so the disclosure read 0 while the invoices sheet
  // carried a project_id with a blank project_name. A disclosure that RLS can
  // silence is worse than none.
  const invoiceProjectsOutsideStudioCount = missingProjectIds.length;

  // 5. This studio's households — the only household rows the file may key on.
  const households = (await pageAll("client_households", (cursor) =>
    afterId(
      supabase
        .from("client_households")
        .select(
          "id, organization_id, designer_id, display_name, member_person_ids, co_threshold_cents, created_at",
        )
        .eq("organization_id", studioId),
      cursor,
    )
      .order("id")
      .limit(PAGE),
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
      (await pageAll("designer_clients", (cursor) =>
        afterId(
          supabase
            .from("designer_clients")
            .select(CLIENT_RECORD_SELECT)
            .in("designer_id", ids),
          cursor,
        )
          .order("id")
          .limit(PAGE),
      )) as RawClientRecordRow[],
    );
  }
  for (const ids of chunk(
    households.map((h) => h.id),
    IN_CHUNK,
  )) {
    noteClientRecords(
      (await pageAll("designer_clients (household)", (cursor) =>
        afterId(
          supabase
            .from("designer_clients")
            .select(CLIENT_RECORD_SELECT)
            .in("household_id", ids),
          cursor,
        )
          .order("id")
          .limit(PAGE),
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
    invoiceProjectsOutsideStudioCount,
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
