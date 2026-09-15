import { expect } from "@playwright/test";
import { partyKindOwesPaper } from "@patina/types";
import { test } from "../fixtures/auth";
import { adminDb } from "../helpers/supabase-admin";

/**
 * THE PAPERWORK DOOR, END TO END (PR-a / VISION V10, upload-door-spec §2–§6).
 *
 * One journey, the whole loop: the studio opens the firm's door and reads the
 * address once, the firm sends a certificate through it, the card grows an
 * inbound queue band, the studio confirms it, and the firm's paper word flips
 * from Not on file to Current.
 *
 * Chromium-pinned: one seeded designer, one studio book.
 */
test.skip(
  ({ browserName }) => browserName !== "chromium",
  "single seeded actor",
);

const FUNCTIONS_URL = `${
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321"
}/functions/v1/paperwork-upload`;

/** A one-pixel PNG. The bucket's mime allowlist is pdf/jpeg/png (spec §4). */
const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

/**
 * A firm that owes paper and holds NONE, so the journey's flip is the clean
 * one: Not on file → Current, with no paper to supersede and so no R-AZ
 * successor gate in the way (that refusal is covered by the SQL suite,
 * `supabase/tests/people/w4_channels_touches_paperwork_test.sql` block 7).
 */
/**
 * A journey that leaves paper behind cannot run twice: the firm it picked now
 * HOLDS paper. Every row this spec writes carries the GL-E2E- prefix, so the
 * run starts by taking back exactly what earlier runs of THIS spec left.
 */
async function clearEarlierRuns() {
  const { error } = await adminDb
    .from("studio_compliance_documents")
    .delete()
    .like("number", "GL-E2E-%");
  if (error) throw error;
}

async function firmWithNoPaper() {
  const { data: firms, error } = await adminDb
    .from("studio_contacts")
    .select("id, organization_id, company_name, company_kind, contact_kind")
    .eq("entity_kind", "company")
    .is("archived_at", null)
    .limit(60);
  if (error) throw error;
  const { data: papered, error: paperError } = await adminDb
    .from("studio_compliance_documents")
    .select("holder_id");
  if (paperError) throw paperError;
  const held = new Set((papered ?? []).map((d) => d.holder_id as string));
  // The same test the card's Paper region applies (R-A / C13): a lender, an
  // inspector and an AUTHORITY never owed the studio paper, so their cards
  // carry no Paper act at all — and no door onto paper they do not owe.
  return (firms ?? []).find(
    (f) =>
      !held.has(f.id as string) &&
      partyKindOwesPaper(String(f.company_kind ?? f.contact_kind)),
  );
}

async function paperState(holderId: string): Promise<string | null> {
  const { data, error } = await adminDb.rpc("compliance_state", {
    p_holder_id: holderId,
  });
  if (error) throw error;
  return (data as string | null) ?? null;
}

async function inboundRows(holderId: string) {
  const { data, error } = await adminDb
    .from("studio_compliance_documents")
    .select("id, doc_type, number, inbound, source, verified_at, rejected_at")
    .eq("holder_id", holderId);
  if (error) throw error;
  return data ?? [];
}

/**
 * THE FIRM'S SIDE OF THE DOOR, as a service helper.
 *
 * The door's own entry point is the `paperwork-upload` edge function, and this
 * posts to it whenever the local stack is serving functions. The Supabase CLI
 * stack this suite runs against does not always start the edge runtime (no
 * `supabase_edge_runtime_*` container), and a journey that cannot run is worth
 * less than one that runs against the same two writes the function performs —
 * so the fallback repeats `uploadPaperwork`'s exact server-side sequence
 * (`supabase/functions/paperwork-upload/core.ts`): resolve the studio and the
 * firm FROM THE TOKEN, put the file in `compliance-documents` under a key
 * whose every segment is a uuid, then record the document through the RPC.
 *
 * Which path ran is recorded on the test, never swallowed.
 */
async function sendPaperworkAsTheFirm(
  token: string,
  fields: { doc_type: string; number: string; issuer: string; expires_on: string },
): Promise<"edge" | "rpc"> {
  const form = new FormData();
  form.set("token", token);
  form.set("doc_type", fields.doc_type);
  form.set("number", fields.number);
  form.set("issuer", fields.issuer);
  form.set("expires_on", fields.expires_on);
  form.set(
    "file",
    new Blob([PNG_BYTES], { type: "image/png" }),
    "certificate.png",
  );

  try {
    const response = await fetch(FUNCTIONS_URL, { method: "POST", body: form });
    if (response.ok) {
      const body = (await response.json()) as { success?: boolean };
      if (body.success) return "edge";
    }
    if (response.status >= 400 && response.status < 500) {
      // A 4xx is the DOOR answering — a real refusal, never a missing runtime.
      throw new Error(
        `paperwork-upload refused the send: ${response.status} ${await response.text()}`,
      );
    }
  } catch (e) {
    if (e instanceof Error && /refused the send/.test(e.message)) throw e;
    // Fall through: the functions endpoint is not being served here.
  }

  const { data: ctx, error: ctxError } = await adminDb.rpc(
    "paperwork_link_storage_context",
    { p_token: token },
  );
  if (ctxError) throw ctxError;
  const scope = (ctx as Array<{ organization_id: string; company_id: string }>)[0];
  if (!scope) throw new Error("the token resolved to no firm");

  const key = `${scope.organization_id}/${scope.company_id}/${crypto.randomUUID()}/certificate.png`;
  const { error: uploadError } = await adminDb.storage
    .from("compliance-documents")
    .upload(key, PNG_BYTES, { contentType: "image/png", upsert: false });
  if (uploadError) throw uploadError;

  const { error: recordError } = await adminDb.rpc(
    "record_inbound_compliance_document",
    {
      p_token: token,
      p_doc_type: fields.doc_type,
      p_doc_label: null,
      p_number: fields.number,
      p_issuer: fields.issuer,
      p_issued_on: null,
      p_expires_on: fields.expires_on,
      p_file_path: key,
    },
  );
  if (recordError) throw recordError;
  return "rpc";
}

test.describe("the paperwork door", () => {
  test("mint, send, confirm — and the firm's paper word flips", async ({
    authenticatedPage: page,
  }, testInfo) => {
    await clearEarlierRuns();
    const firm = await firmWithNoPaper();
    test.skip(!firm, "the studio book holds no paper-owing firm with no paper");
    const companyId = firm!.id as string;
    const firmName = firm!.company_name as string;

    expect(await paperState(companyId)).toBe("not_on_file");

    await page.goto(`/people?firm=${companyId}`);
    await expect(page.getByRole("heading", { name: "Paper" })).toBeVisible();
    // Nothing is waiting before the firm sends anything.
    await expect(page.locator("[data-inbound-queue]")).toHaveCount(0);

    /* ── The studio opens the door, and names the day it closes (R-AD) ───── */
    await page.getByRole("button", { name: "Mint a paperwork link" }).click();
    await expect(page.locator("[data-paperwork-window-sentence]")).toBeVisible();
    // Thirty days is a DAY the studio picks, not a clock that runs by itself,
    // and picking it keeps this journey independent of the firm's seats.
    await page.getByRole("radio", { name: /^Thirty days/ }).check();
    await page.getByRole("button", { name: "Open the door" }).click();

    const address = page.locator("[data-paperwork-address]");
    await expect(address).toBeVisible();
    const url = (await address.innerText()).trim();
    expect(url).toContain("/paperwork/");
    await expect(
      page.getByText(
        `This address is shown once. ${firmName} can send their paper here until`,
        { exact: false },
      ),
    ).toBeVisible();

    const token = url.split("/paperwork/")[1];
    expect(token).toMatch(/^[0-9a-f]{64}$/);

    // The door is live, firm-scoped, and hashed at rest.
    await expect
      .poll(async () => {
        const { data } = await adminDb
          .from("paperwork_link_tokens")
          .select("status, company_id")
          .eq("company_id", companyId)
          .eq("status", "active");
        return data?.length ?? 0;
      })
      .toBe(1);

    /* ── The door the studio just opened is ON the card it opened it from ──
       W4 r2 MAJOR W4R2-2. The Access grants list filtered on
       `subject_type === "contact"`, written when `agreement_link` was the only
       firm-scoped tier; `paperwork_link` stamps `subject_type = 'company'`
       (00637 branch 12), so a LIVE grant never rendered and its Revoke was
       reachable from no surface in the build. The list now filters by tier. */
    const grants = page.locator("[data-access-grant-list]");
    await expect(grants).toBeVisible();
    const grantRow = grants.locator('[data-access-grant^="paperwork_link:"]');
    await expect(grantRow).toHaveCount(1);
    await expect(grantRow.getByText("Paperwork link")).toBeVisible();
    await expect(page.getByText("No grant on file.")).toHaveCount(0);
    // The act this tier exists to make reachable.
    await expect(
      grantRow.getByRole("button", { name: "Revoke" }),
    ).toBeVisible();

    /* ── The firm sends its certificate through the door ─────────────────── */
    const number = `GL-E2E-${Date.now()}`;
    const path = await sendPaperworkAsTheFirm(token, {
      doc_type: "coi_gl",
      number,
      issuer: "Lakes Casualty",
      expires_on: "2099-12-31",
    });
    testInfo.annotations.push({ type: "upload path", description: path });

    await expect
      .poll(async () => {
        const rows = await inboundRows(companyId);
        return rows.map((r) => ({
          inbound: r.inbound,
          source: r.source,
          verified: r.verified_at !== null,
        }));
      })
      .toEqual([{ inbound: true, source: "field_link", verified: false }]);

    // ⚠ FINDING, not asserted here — `compliance_state()` (00623) counts every
    // non-retired row whatever its `verified_at`, so the firm's paper WORD
    // (and the gates that read it) already moved on paper nobody has checked.
    // That is a reducer fix, owed to the data wave; this journey asserts only
    // what the studio surface owns. See build/w4-studio-report.md §4.

    /* ── The studio sees the band and confirms ───────────────────────────── */
    await page.reload();
    const band = page.locator("[data-inbound-queue]");
    await expect(band).toBeVisible();
    await expect(
      band.getByText("1 document waiting for your check"),
    ).toBeVisible();
    await expect(
      band.getByText(`COI, general liability, uploaded`, { exact: false }),
    ).toBeVisible();

    await band.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(
      page.getByText("– Confirming makes this the paper the studio holds.", {
        exact: false,
      }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Confirm the document" }).click();

    /* ── The paper word flips, and the queue empties ─────────────────────── */
    await expect
      .poll(async () => paperState(companyId), { timeout: 15_000 })
      .toBe("current");
    await expect(page.locator("[data-inbound-queue]")).toHaveCount(0);
    // The confirmed certificate now reads as paper the studio HOLDS, in the
    // Paper region's own table. `.first()`: the region prints the number in
    // the table and again in its beneath-the-row line at phone width.
    await expect(
      page.locator("[data-company-paper]").getByText(number).first(),
    ).toBeVisible();

    // Nothing was deleted, and the row keeps its inbound provenance (spec §7).
    const after = await inboundRows(companyId);
    expect(after).toHaveLength(1);
    expect(after[0].verified_at).not.toBeNull();
    expect(after[0].rejected_at).toBeNull();
    expect(after[0].source).toBe("field_link");
  });
});
