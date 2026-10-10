import { randomUUID } from "node:crypto";
import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { psqlAsUser, psqlRun, psqlScalar } from "../helpers/psql";
import { adminDb } from "../helpers/supabase-admin";
import { hideDevOverlays } from "../helpers/hide-dev-overlays";

/**
 * US-17 E1 (SQ-461) — the buying flows the Phase 0–2 walks never touched, and
 * one walk per Wave 1 fix. One test per flow, each on its own seeded job, so a
 * failure names its flow and leaves the others running:
 *
 *   (a) quote → apply; a client-signed line routes to "Open a change order";
 *   (b) a remedy recorded on a sent order, and an acknowledgment difference
 *       disputed (the exception waits on the maker);
 *   (c) the install manifest (goes, day, installer, state) and a punch item
 *       recorded, then resolved;
 *   (d) a memo sample due back: the sweep's notice, the Desk's need, returned;
 *   (e) a line billed as a 50% deposit, then its balance; the money cell reads
 *       both stages;
 *   R3  a released order edited afterwards needs release again;
 *   R4  two half-orders to one maker on one job: the second is held, with the
 *       group-total sentence on its new paper before save;
 *   R6  a held order's preview prints "Draft order" and takes no number;
 *   G5  a letter stuck in `sending` for 11 minutes offers Send again, and sends;
 *   G6  a shipped line with an open damage exception lists it in its unfold
 *       (the next-act reading's "Claim open" was retired by US-21 T-31).
 *
 * LOCAL STACK ONLY: psql.ts refuses a non-local Postgres. Preconditions and the
 * run line are in playwright.buying.config.ts (supabase reset; po-send and
 * procurement-draft-send served from this checkout with EMAIL_DEV_MODE=dry_run).
 *
 * Seeded state stands in for the earlier walks: orders already sent, lines
 * already delivered or shipped, and one authorization the client signed. The
 * release in R3 is the owner's release_purchase_order, called as the owner:
 * the paper's own release act always sends in the same click, so a released
 * order left unsent is reached through the RPC.
 */

const PASSWORD = "password123";
const OWNER_EMAIL = "buying3-owner@patina.dev";
const MEMBER_EMAIL = "buying3-member@patina.dev";
const CLIENT_EMAIL = "buying3-client@patina.dev";
const STUDIO_ID = "e2e00000-0000-4000-8000-000000017461";
const WELCOME_SHOWN_KEY = "help-system.welcome-shown.first-project-walkthrough";
const SITE_ADDRESS = "41 Lake Shore Rd, Madison, WI 53704";

// A fresh run per worker: a worker restarted after a failure seeds anew.
const RUN = randomUUID().slice(0, 8);
const id = () => randomUUID();
const q = (value: string) => `'${value.replace(/'/g, "''")}'`;

/** One job: a project, its maker and its lines. */
interface Job {
  projectId: string;
  projectName: string;
  vendorId: string;
  vendor: string;
  vendorEmail: string;
}
function job(tag: string, maker: string): Job {
  const slug = maker.toLowerCase().replace(/[^a-z]+/g, "");
  return {
    projectId: id(),
    projectName: `Buying walk P3 ${tag} ${RUN}`,
    vendorId: id(),
    vendor: `${maker} ${RUN}`,
    vendorEmail: `orders+${RUN}@${slug}.test`,
  };
}

const QUOTE = job("quote", "Hewn Works");
const QUOTE_LINE = { id: id(), name: `Oak dining table ${RUN}` };
const SIGNED_LINE = { id: id(), name: `Signed lounge chair ${RUN}` };

const CHANGE = job("change", "Alder Joinery");
const CHANGE_LINE = { id: id(), name: `Oak credenza ${RUN}` };
const CHANGE_PO = id();

const INSTALL = job("install", "Corbel Studio");
const INSTALL_LINE = { id: id(), name: `Plaster sconce ${RUN}` };
const INSTALL_PO = id();

const SAMPLE = job("sample", "Linwood Textiles");
const SAMPLE_LINE = { id: id(), name: `Linen drapery ${RUN}` };

const DEPOSIT = job("deposit", "Marlow Upholstery");
const DEPOSIT_LINE = { id: id(), name: `Slipper chair ${RUN}` };
const DEPOSIT_PO = id();

const R3 = job("r3", "Quarry Stone");
const R3_LINE = { id: id(), name: `Marble console ${RUN}` };

const R4 = job("r4", "Fenwick Lighting");
const R4_FIRST = { id: id(), name: `Brass pendant A ${RUN}` };
const R4_SECOND = { id: id(), name: `Brass pendant B ${RUN}` };

const R6 = job("r6", "Ostrander Rugs");
const R6_LINE = { id: id(), name: `Wool runner ${RUN}` };

const G5 = job("g5", "Pell Ironworks");
const G5_LINE = { id: id(), name: `Iron bench ${RUN}` };
const G5_PO = id();
const G5_DRAFT = id();

const G6 = job("g6", "Ridge Mirror Co");
const G6_LINE = { id: id(), name: `Arched mirror ${RUN}` };
const G6_PO = id();

const FINISH = "Natural oak";
const THEIR_FINISH = "Smoked oak";

async function ensureUser(
  email: string,
  fullName: string,
  role: "designer" | "homeowner" = "designer",
): Promise<string> {
  const existing = psqlScalar(
    `SELECT id FROM auth.users WHERE email = ${q(email)}`,
  );
  if (existing) return existing;
  const { data, error } = await adminDb.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: fullName, role },
  });
  if (error || !data.user)
    throw error ?? new Error(`createUser ${email} returned no user`);
  return data.user.id;
}

function projectSql(
  j: Job,
  ownerId: string,
  clientId: string,
  phase?: string,
): string {
  return `
INSERT INTO public.projects (id, name, designer_id, created_by, client_id, studio_id, status, site_address${phase ? ", current_phase" : ""})
VALUES (${q(j.projectId)}, ${q(j.projectName)}, ${q(ownerId)}, ${q(ownerId)}, ${q(clientId)}, ${q(STUDIO_ID)}, 'active', ${q(SITE_ADDRESS)}${phase ? `, ${q(phase)}` : ""});
INSERT INTO public.vendors (id, name, orders_email, contact_info)
VALUES (${q(j.vendorId)}, ${q(j.vendor)}, ${q(j.vendorEmail)}, jsonb_build_object('email', ${q(j.vendorEmail)}));`;
}

/** A selected line; `po` puts it on that order with `status`. */
function lineSql(
  j: Job,
  line: { id: string; name: string },
  opts: {
    unitCents: number;
    tradeCents: number;
    status?: string;
    po?: string;
    sort?: number;
  },
): string {
  const status = opts.status ?? "approved";
  return `
INSERT INTO public.project_ffe_items
  (id, project_id, name, item_type, status, quantity, design_disposition, assignment_scope,
   vendor_id, vendor_name, unit_price_cents, line_total_cents, trade_price_cents, sort_order, purchase_order_id)
VALUES (${q(line.id)}, ${q(j.projectId)}, ${q(line.name)}, 'fixed', ${q(status)}, 1, 'selected', 'throughout',
   ${q(j.vendorId)}, ${q(j.vendor)}, ${opts.unitCents}, ${opts.unitCents}, ${opts.tradeCents}, ${opts.sort ?? 1},
   ${opts.po ? q(opts.po) : "NULL"});`;
}

/** An order already sent to the maker (under the studio's release line). */
function poSql(
  j: Job,
  poId: string,
  ownerId: string,
  memberId: string,
  totalCents: number,
  status: "confirmed" | "shipped" | "delivered",
): string {
  return `
INSERT INTO public.purchase_orders
  (id, designer_id, project_id, vendor_id, payment_pattern, total_cents, status, created_by, sent_at)
VALUES (${q(poId)}, ${q(ownerId)}, ${q(j.projectId)}, ${q(j.vendorId)}, 'net_30', ${totalCents}, ${q(status)},
  ${q(memberId)}, now() - interval '2 days');`;
}

function seed(ownerId: string, memberId: string, clientId: string): void {
  const tourDone = q(
    JSON.stringify({ tours: { "desk-walkthrough": { completed: true } } }),
  );
  psqlRun(`
BEGIN;
INSERT INTO public.profiles (id, email, full_name, display_name, role, help_state)
VALUES (${q(ownerId)}, ${q(OWNER_EMAIL)}, 'Iris Owner', 'Iris Owner', 'designer', ${tourDone}::jsonb),
       (${q(memberId)}, ${q(MEMBER_EMAIL)}, 'Nell Member', 'Nell Member', 'designer', ${tourDone}::jsonb)
ON CONFLICT (id) DO UPDATE SET role = 'designer', full_name = EXCLUDED.full_name,
  display_name = EXCLUDED.display_name, help_state = EXCLUDED.help_state;

INSERT INTO public.user_roles (user_id, role_id)
SELECT ${q(ownerId)}, id FROM public.roles WHERE name IN ('independent_designer', 'studio_owner', 'app_user')
ON CONFLICT (user_id, role_id) DO NOTHING;
INSERT INTO public.user_roles (user_id, role_id)
SELECT ${q(memberId)}, id FROM public.roles WHERE name IN ('studio_designer', 'app_user')
ON CONFLICT (user_id, role_id) DO NOTHING;

-- The release gate (00710/00719): an order, or the job's open orders to one
-- maker together, at or over $5,000 waits for an owner.
INSERT INTO public.organizations
  (id, type, name, slug, status, address, release_threshold_cents, require_release_per_order)
VALUES (${q(STUDIO_ID)}, 'design_studio', 'Buying Walk Studio P3', 'buying-walk-studio-p3', 'active',
  '{"street":"9 Mill St","city":"Madison","state":"WI","zip":"53703","country":"US"}'::jsonb, 500000, false)
ON CONFLICT (id) DO UPDATE SET status = 'active', address = EXCLUDED.address,
  release_threshold_cents = 500000, require_release_per_order = false;

-- Once per studio: guard_org_membership_changes refuses a second owner insert.
INSERT INTO public.organization_members (user_id, organization_id, role, status, joined_at)
SELECT m.user_id, ${q(STUDIO_ID)}, m.role::public.member_role, 'active', now()
FROM (VALUES (${q(ownerId)}::uuid, 'owner'), (${q(memberId)}::uuid, 'member')) AS m(user_id, role)
WHERE NOT EXISTS (
  SELECT 1 FROM public.organization_members om WHERE om.organization_id = ${q(STUDIO_ID)}
);

INSERT INTO public.profiles (id, email, full_name, display_name, role)
VALUES (${q(clientId)}, ${q(CLIENT_EMAIL)}, 'Ada Client', 'Ada Client', 'homeowner')
ON CONFLICT (id) DO UPDATE SET role = 'homeowner', full_name = EXCLUDED.full_name;
INSERT INTO public.designer_clients (designer_id, client_id, client_email, status)
SELECT ${q(ownerId)}, ${q(clientId)}, ${q(CLIENT_EMAIL)}, 'active'
WHERE NOT EXISTS (
  SELECT 1 FROM public.designer_clients
  WHERE designer_id = ${q(ownerId)} AND client_id = ${q(clientId)} AND status = 'active'
);

-- (a) Two of Hewn's lines, the second on an authorization the client signed.
${projectSql(QUOTE, ownerId, clientId)}
${lineSql(QUOTE, QUOTE_LINE, { unitCents: 300000, tradeCents: 200000, sort: 1 })}
${lineSql(QUOTE, SIGNED_LINE, { unitCents: 250000, tradeCents: 150000, sort: 2 })}
WITH proposal AS (
  INSERT INTO public.proposals (project_id, designer_id, title, status, document_kind, commercial_state, total_amount, subtotal)
  VALUES (${q(QUOTE.projectId)}, ${q(ownerId)}, ${q(`Authorization No. 1 ${RUN}`)}, 'accepted',
    'furnishings_authorization', 'client_signed', 2500, 2500)
  RETURNING id
), document AS (
  INSERT INTO public.project_commercial_documents
    (project_id, proposal_id, document_kind, wave_name, is_origin, bound_at, executed_at, created_by)
  SELECT ${q(QUOTE.projectId)}, proposal.id, 'furnishings_authorization', 'Authorization No. 1', false, now(), NULL, ${q(ownerId)}
  FROM proposal
  RETURNING id
)
INSERT INTO public.furnishing_authorization_items
  (commercial_document_id, source_ffe_item_id, name, quantity, client_unit_price_cents, client_line_total_cents)
SELECT document.id, ${q(SIGNED_LINE.id)}, ${q(SIGNED_LINE.name)}, 1, 250000, 250000 FROM document;

-- (b) A sent order, unacknowledged; its line's finish is the ack's FINISH row.
${projectSql(CHANGE, ownerId, clientId)}
${poSql(CHANGE, CHANGE_PO, ownerId, memberId, 240000, "confirmed")}
${lineSql(CHANGE, CHANGE_LINE, { unitCents: 360000, tradeCents: 240000, status: "ordered", po: CHANGE_PO })}
INSERT INTO public.project_ffe_specs (ffe_item_id, finish) VALUES (${q(CHANGE_LINE.id)}, ${q(FINISH)})
ON CONFLICT (ffe_item_id) DO UPDATE SET finish = EXCLUDED.finish;

-- (c) The install stage: document_state reads current_phase 'installation' as
-- the install section; the sconce is delivered.
${projectSql(INSTALL, ownerId, clientId, "installation")}
${poSql(INSTALL, INSTALL_PO, ownerId, memberId, 90000, "delivered")}
${lineSql(INSTALL, INSTALL_LINE, { unitCents: 140000, tradeCents: 90000, status: "delivered", po: INSTALL_PO })}

-- (d) A line whose maker sends a memo sample. One phase on the schedule: an
-- unconfigured schedule's setup need (10.5) outranks the memo's (12.5) on
-- the job's Desk row.
${projectSql(SAMPLE, ownerId, clientId)}
INSERT INTO public.project_phases (project_id, name, status, sort_order, start_date, duration_weeks)
VALUES (${q(SAMPLE.projectId)}, 'Procurement', 'in_progress', 1, current_date - 7, 6);
${lineSql(SAMPLE, SAMPLE_LINE, { unitCents: 220000, tradeCents: 150000 })}

-- (e) A sent order; the client is billed for its line.
${projectSql(DEPOSIT, ownerId, clientId)}
${poSql(DEPOSIT, DEPOSIT_PO, ownerId, memberId, 250000, "confirmed")}
${lineSql(DEPOSIT, DEPOSIT_LINE, { unitCents: 400000, tradeCents: 250000, status: "ordered", po: DEPOSIT_PO })}

-- R3 / R6: one line over the $5,000 line each.
${projectSql(R3, ownerId, clientId)}
${lineSql(R3, R3_LINE, { unitCents: 900000, tradeCents: 600000 })}
${projectSql(R6, ownerId, clientId)}
${lineSql(R6, R6_LINE, { unitCents: 1000000, tradeCents: 700000 })}

-- R4: two $3,000 halves from one maker on one job.
${projectSql(R4, ownerId, clientId)}
${lineSql(R4, R4_FIRST, { unitCents: 450000, tradeCents: 300000, sort: 1 })}
${lineSql(R4, R4_SECOND, { unitCents: 450000, tradeCents: 300000, sort: 2 })}

-- G5: a sent order with a reply to the maker drafted for review.
${projectSql(G5, ownerId, clientId)}
${poSql(G5, G5_PO, ownerId, memberId, 180000, "confirmed")}
${lineSql(G5, G5_LINE, { unitCents: 270000, tradeCents: 180000, status: "ordered", po: G5_PO })}
INSERT INTO public.procurement_drafts
  (id, organization_id, project_id, kind, purchase_order_id, to_email, subject, body)
VALUES (${q(G5_DRAFT)}, ${q(STUDIO_ID)}, ${q(G5.projectId)}, 'ack_discrepancy_reply', ${q(G5_PO)},
  ${q(G5.vendorEmail)}, ${q(`Your acknowledgment ${RUN}`)}, 'The finish should read Raw iron, as ordered.');

-- G6: a shipped line with an open damage exception.
${projectSql(G6, ownerId, clientId)}
${poSql(G6, G6_PO, ownerId, memberId, 120000, "shipped")}
${lineSql(G6, G6_LINE, { unitCents: 180000, tradeCents: 120000, status: "shipped", po: G6_PO })}
INSERT INTO public.procurement_exceptions (organization_id, project_id, type, ffe_item_id, purchase_order_id, status)
VALUES (${q(STUDIO_ID)}, ${q(G6.projectId)}, 'damage', ${q(G6_LINE.id)}, ${q(G6_PO)}, 'open');
COMMIT;
`);
}

async function signIn(page: Page, email: string): Promise<void> {
  await page.addInitScript((key) => {
    try {
      window.localStorage.setItem(key, "1");
    } catch {
      /* localStorage may be unavailable */
    }
  }, WELCOME_SHOWN_KEY);
  await page.goto("/auth/signin?callbackUrl=%2Fdesk", {
    waitUntil: "networkidle",
    timeout: 60_000,
  });
  await page
    .getByRole("button", {
      name: /sign in with email|use email and password instead/i,
    })
    .first()
    .click({ timeout: 30_000 });
  await page.getByLabel(/email/i).first().fill(email);
  await page
    .getByLabel(/password/i)
    .first()
    .fill(PASSWORD);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL(/\/(desk|doc|unauthorized)/, { timeout: 60_000 });
  expect(page.url(), `${email} reaches the Desk`).not.toContain(
    "/unauthorized",
  );
}

async function shot(
  page: Page,
  testInfo: TestInfo,
  name: string,
): Promise<void> {
  await page.screenshot({
    path: testInfo.outputPath(`${name}.png`),
    fullPage: false,
  });
}

/** A line prints as its name, with " · ×N" when the quantity is over one. */
function lineLabel(name: string): RegExp {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped}( · ×\\d+)?$`);
}

/** Open a job's Document on the Project section, waiting for `line` to print. */
async function openDocument(page: Page, j: Job, line: string): Promise<void> {
  await page.goto(`/doc/${j.projectId}`, { waitUntil: "domcontentloaded" });
  const lineName = page.getByText(lineLabel(line)).first();
  const seam = page
    .getByRole("button", { name: /^Pieces \d+ lines?\b/i })
    .first();
  await expect(lineName.or(seam).first()).toBeVisible({ timeout: 90_000 });
  if (!(await lineName.isVisible())) await seam.click();
  await expect(lineName).toBeVisible({ timeout: 30_000 });
}

/** Open the Document and unfold a line. */
async function openLine(page: Page, j: Job, line: string): Promise<void> {
  await openDocument(page, j, line);
  await page.getByText(lineLabel(line)).first().click();
  await expect(page.getByTestId("line-po-cell")).toBeVisible({
    timeout: 30_000,
  });
}

/** Record every edge-function / RPC failure the page sees. */
function watchFailures(page: Page, failures: string[]): void {
  page.on("response", (response) => {
    const url = response.url();
    const watched =
      url.includes("/functions/v1/") || url.includes("/rest/v1/rpc/");
    if (!watched || response.ok() || response.request().method() === "OPTIONS")
      return;
    void response
      .text()
      .catch(() => "")
      .then((body) => {
        failures.push(
          `${response.status()} ${new URL(url).pathname} ${body.slice(0, 300)}`,
        );
      });
  });
}

/** `YYYY-MM-DD`, `days` from today, in local time (the inputs' own day). */
function ymd(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The line's PO, as the database holds it. */
function poOf(lineId: string): {
  id: string;
  status: string;
  sentAt: string;
  number: string;
} {
  const [poId = "", status = "", sentAt = "", number = ""] = psqlScalar(`
SELECT po.id || '|' || po.status || '|' || coalesce(po.sent_at::text, '') || '|' || coalesce(po.po_number, '')
FROM public.project_ffe_items item JOIN public.purchase_orders po ON po.id = item.purchase_order_id
WHERE item.id = ${q(lineId)}`).split("|");
  return { id: poId, status, sentAt, number };
}

/** The line's order paper, opened from the line. */
async function openPaper(page: Page, j: Job, line: string) {
  await openLine(page, j, line);
  const order = page
    .getByRole("button", { name: "Order", exact: true })
    .first();
  await expect(order).toBeEnabled({ timeout: 30_000 });
  await order.click();
  const paper = page.getByRole("dialog", { name: "The order paper" });
  await expect(paper).toBeVisible();
  // The ship-to choices load after the paper opens: the job site.
  await paper
    .getByRole("group", { name: "Ship to" })
    .getByRole("radio", { name: /The job site/ })
    .check({ timeout: 20_000 });
  return paper;
}

/**
 * An existing unsent order's paper, from the Orders book the job opens: its
 * Ledger page, the job's lens. A member's held order is a ledger row ("open
 * →"); the held-for-release section lists only what the seat may release.
 */
async function openOrdersBookPaper(
  page: Page,
  j: Job,
  line: string,
  act: "send →" | "open →",
) {
  await openDocument(page, j, line);
  await page.getByRole("button", { name: "Brief a vendor" }).click();
  const pages = page.getByRole("navigation", { name: "Orders book pages" });
  await expect(pages).toBeVisible({ timeout: 30_000 });
  await pages.getByRole("button", { name: "Ledger", exact: true }).click();
  // Rows sit under their maker's heading; a row names its job.
  await page
    .locator("[data-orders-po-row]")
    .filter({ hasText: j.projectName })
    .getByRole("button", { name: act })
    .first()
    .click({ timeout: 30_000 });
  const paper = page.getByRole("dialog", {
    name: /order paper|Purchase order/,
  });
  await expect(paper).toBeVisible({ timeout: 30_000 });
  return paper;
}

/** The text of a PDF, every page joined. */
async function pdfText(bytes: Buffer): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
  const pages: string[] = [];
  for (let n = 1; n <= doc.numPages; n += 1) {
    const content = await (await doc.getPage(n)).getTextContent();
    pages.push(
      content.items.map((item) => ("str" in item ? item.str : "")).join(" "),
    );
  }
  return pages.join("\n");
}

// A missing control fails its step, not the whole flow's budget.
test.use({ actionTimeout: 45_000 });

test.describe("Studio buying Phase 3 — coverage walk", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "one seeded walk");

  let ownerId = "";
  let memberId = "";

  test.beforeAll(async () => {
    ownerId = await ensureUser(OWNER_EMAIL, "Iris Owner");
    memberId = await ensureUser(MEMBER_EMAIL, "Nell Member");
    const clientId = await ensureUser(CLIENT_EMAIL, "Ada Client", "homeowner");
    seed(ownerId, memberId, clientId);
    expect(
      psqlScalar(
        `SELECT role FROM public.organization_members
         WHERE organization_id = ${q(STUDIO_ID)} AND user_id = ${q(memberId)}`,
      ),
    ).toBe("member");
    expect(
      psqlScalar(
        `SELECT public.ffe_line_authorization_state(${q(SIGNED_LINE.id)})`,
      ),
      "the signed line sits on a client-signed authorization",
    ).toBe("client_signed");
  });

  test("(a) quote → apply; a client-signed line routes to a change order", async ({
    page,
  }, testInfo) => {
    test.setTimeout(300_000);
    const failures: string[] = [];
    watchFailures(page, failures);
    await hideDevOverlays(page);
    await signIn(page, MEMBER_EMAIL);

    await openLine(page, QUOTE, QUOTE_LINE.name);
    let quoteCell = page.getByTestId("line-quote-cell");
    await expect(quoteCell).toContainText("No quote recorded");
    await quoteCell.getByRole("button", { name: "Record a quote…" }).click();
    const sheet = page.getByTestId("record-quote-sheet");
    await expect(sheet).toBeVisible({ timeout: 30_000 });
    // One quote prices both of Hewn's lines; the opened line comes ticked.
    await sheet
      .getByRole("checkbox", { name: SIGNED_LINE.name })
      .check({ timeout: 30_000 });
    await sheet.getByLabel(`Unit trade · ${QUOTE_LINE.name}`).fill("1840");
    await sheet.getByLabel(`Lead time in weeks · ${QUOTE_LINE.name}`).fill("8");
    await sheet.getByLabel(`Unit trade · ${SIGNED_LINE.name}`).fill("1500");
    await sheet
      .getByLabel(`Lead time in weeks · ${SIGNED_LINE.name}`)
      .fill("6");
    await shot(page, testInfo, "a1-record-quote");
    await sheet.getByRole("button", { name: "Record the quote" }).click();
    await expect(sheet.getByRole("status")).toHaveText(
      "Quote recorded. It reads on each line it prices.",
      { timeout: 30_000 },
    );
    expect(
      psqlScalar(`
SELECT string_agg(ql.unit_trade_cents || ':' || ql.lead_time_weeks, ',' ORDER BY ql.unit_trade_cents)
FROM public.vendor_quotes vq JOIN public.vendor_quote_lines ql ON ql.quote_id = vq.id
WHERE vq.project_id = ${q(QUOTE.projectId)}`),
      "one quote, two lines",
    ).toBe("150000:6,184000:8");
    await sheet.getByRole("button", { name: "Done" }).click();

    // Use this price: trade only, the client price stays.
    quoteCell = page.getByTestId("line-quote-cell");
    await expect(quoteCell).toContainText("8 weeks lead", { timeout: 30_000 });
    await quoteCell.getByRole("button", { name: "Use this price" }).click();
    await expect(quoteCell).toContainText("trade cost is the quoted $1,840", {
      timeout: 30_000,
    });
    expect(
      psqlScalar(
        `SELECT trade_price_cents || '|' || unit_price_cents FROM public.project_ffe_items WHERE id = ${q(QUOTE_LINE.id)}`,
      ),
    ).toBe("184000|300000");
    await shot(page, testInfo, "a2-quote-applied");

    // The signed line: the apply is refused and routed, never retried.
    await openLine(page, QUOTE, SIGNED_LINE.name);
    quoteCell = page.getByTestId("line-quote-cell");
    await quoteCell
      .getByRole("button", { name: "Use this price" })
      .click({ timeout: 30_000 });
    await expect(quoteCell.getByRole("alert")).toHaveText(
      "The client signed for this line, so a new price is a change order they approve first.",
      { timeout: 30_000 },
    );
    await expect(
      quoteCell.getByRole("button", { name: "Open a change order" }),
    ).toBeVisible();
    expect(
      psqlScalar(
        `SELECT trade_price_cents FROM public.project_ffe_items WHERE id = ${q(SIGNED_LINE.id)}`,
      ),
      "the refused apply writes nothing",
    ).toBe("150000");
    await shot(page, testInfo, "a3-change-order-required");

    expect(
      failures.filter(
        (f) =>
          !(
            f.includes("apply_vendor_quote_to_lines") &&
            f.includes("change_order_required")
          ),
      ),
      "edge-function / RPC failures seen by the page",
    ).toEqual([]);
  });

  test("(b) a remedy on a sent order; an acknowledgment difference disputed", async ({
    page,
  }, testInfo) => {
    test.setTimeout(300_000);
    const failures: string[] = [];
    watchFailures(page, failures);
    await hideDevOverlays(page);
    await signIn(page, MEMBER_EMAIL);

    // The acknowledgment comes back with one finish difference.
    await openLine(page, CHANGE, CHANGE_LINE.name);
    const ackCheck = page.getByTestId("line-next-act").getByTestId("ack-check");
    await expect(ackCheck).toBeVisible({ timeout: 30_000 });
    await ackCheck.getByPlaceholder("NA-2026-…").fill(`AJ-${RUN}`);
    const finish = ackCheck.getByLabel(
      `${CHANGE_LINE.name} · finish, they confirmed`,
    );
    await expect(finish).toHaveValue(FINISH, { timeout: 20_000 });
    await finish.fill(THEIR_FINISH);
    await ackCheck
      .getByRole("button", { name: "Log it with 1 difference" })
      .click();
    const poCell = page.getByTestId("line-po-cell");
    await expect(poCell.getByTestId("po-ack-stamp")).toHaveText(
      "Acknowledged · 1 difference",
      { timeout: 30_000 },
    );

    // Dispute: the maker's value is refused; the exception waits on the maker.
    const ackRecord = poCell.getByTestId("ack-record");
    await expect(ackRecord).toBeVisible({ timeout: 30_000 });
    await shot(page, testInfo, "b1-ack-difference");
    await ackRecord.getByRole("button", { name: "Dispute" }).click();
    await expect(
      ackRecord.getByText(
        "Disputed. The reply to the maker is drafted for your review; nothing is sent until you send it.",
      ),
    ).toBeVisible({ timeout: 30_000 });
    expect(
      psqlScalar(`
SELECT l.verdict || '|' || e.status
FROM public.po_acknowledgments a
JOIN public.po_ack_lines l ON l.ack_id = a.id
JOIN public.procurement_exceptions e ON e.purchase_order_id = a.purchase_order_id AND e.type = 'ack_discrepancy'
WHERE a.purchase_order_id = ${q(CHANGE_PO)} AND l.field = 'finish'`),
      "the line is disputed and the ack exception waits on the maker",
    ).toBe("disputed|awaiting_vendor");
    expect(
      Number(
        psqlScalar(`
SELECT count(*) FROM public.procurement_drafts
WHERE purchase_order_id = ${q(CHANGE_PO)} AND kind = 'ack_discrepancy_reply' AND status = 'awaiting_review'`),
      ),
      "the reply to the maker waits in draft review, unsent",
    ).toBeGreaterThan(0);
    await shot(page, testInfo, "b2-disputed");

    // The change order: a remedy, kept on the sent order's record.
    await poCell.getByRole("button", { name: "Change this order…" }).click();
    const change = page.getByTestId("po-change-sheet");
    await expect(change).toBeVisible({ timeout: 30_000 });
    await change.getByRole("radio", { name: /^Remedy/ }).check();
    await change
      .getByPlaceholder("Backordered to March; the client chose to wait…")
      .fill("The maker refinishes the top to the ordered oak.");
    await expect(change.getByTestId("po-change-held")).toHaveCount(0);
    await change.getByRole("button", { name: "Record the change" }).click();
    await expect(change.getByRole("status")).toHaveText(
      "Kept on the PO’s change history.",
      { timeout: 30_000 },
    );
    expect(
      psqlScalar(`
SELECT change_kind || '|' || project_ffe_item_id FROM public.purchase_order_changes
WHERE purchase_order_id = ${q(CHANGE_PO)}`),
    ).toBe(`remedy|${CHANGE_LINE.id}`);
    expect(
      poOf(CHANGE_LINE.id).status,
      "a remedy leaves the order standing",
    ).toBe("confirmed");
    await shot(page, testInfo, "b3-remedy-recorded");

    expect(failures, "edge-function / RPC failures seen by the page").toEqual(
      [],
    );
  });

  test("(c) install manifest and a punch item, recorded then resolved", async ({
    page,
  }, testInfo) => {
    test.setTimeout(300_000);
    const failures: string[] = [];
    watchFailures(page, failures);
    await hideDevOverlays(page);
    await signIn(page, MEMBER_EMAIL);

    await page.goto(`/doc/${INSTALL.projectId}`, {
      waitUntil: "domcontentloaded",
    });
    const manifest = page.getByTestId("install-manifest");
    await expect(manifest).toBeVisible({ timeout: 90_000 });
    const row = manifest
      .getByTestId("install-manifest-line")
      .filter({ hasText: INSTALL_LINE.name });
    await expect(row).toHaveCount(1);
    const installOn = ymd(3);
    await row
      .getByLabel(`Where ${INSTALL_LINE.name} goes`)
      .fill("Hall, north wall");
    await row
      .getByLabel(`Install day for ${INSTALL_LINE.name}`)
      .fill(installOn);
    await row
      .getByLabel(`Installer for ${INSTALL_LINE.name}`)
      .fill("Hollis crew");
    await row
      .getByLabel(`Install state for ${INSTALL_LINE.name}`)
      .selectOption("on_site");
    await shot(page, testInfo, "c1-manifest-filled");
    await row.getByRole("button", { name: "Save", exact: true }).click();
    await expect
      .poll(
        () =>
          psqlScalar(`
SELECT room_location || '|' || install_on || '|' || installer_name || '|' || state
FROM public.install_manifest_items WHERE ffe_item_id = ${q(INSTALL_LINE.id)}`),
        { timeout: 30_000 },
      )
      .toBe(`Hall, north wall|${installOn}|Hollis crew|on_site`);
    // Saved: the row re-reads its record, nothing left to save.
    await expect(
      row.getByRole("button", { name: "Save", exact: true }),
    ).toHaveCount(0, {
      timeout: 30_000,
    });
    await expect(row.getByLabel(`Where ${INSTALL_LINE.name} goes`)).toHaveValue(
      "Hall, north wall",
    );

    // A punch item: a note and a due day, recorded, then resolved.
    const dueOn = ymd(5);
    await row.getByRole("button", { name: "Punch", exact: true }).click();
    await row
      .getByLabel(`Punch note for ${INSTALL_LINE.name}`)
      .fill("Touch up the plaster at the back plate");
    await row.getByLabel("Punch due on").fill(dueOn);
    await row.getByRole("button", { name: "Record it" }).click();
    const punch = row
      .getByTestId("install-punch-item")
      .filter({ hasText: "Touch up the plaster at the back plate" });
    await expect(punch).toHaveCount(1, { timeout: 30_000 });
    expect(
      psqlScalar(`
SELECT due_on || '|' || (resolved_at IS NULL)
FROM public.install_punch_items WHERE ffe_item_id = ${q(INSTALL_LINE.id)}`),
    ).toBe(`${dueOn}|true`);
    await shot(page, testInfo, "c2-punch-recorded");
    await punch.getByRole("button", { name: "Resolve" }).click();
    await expect(punch).toContainText("resolved", { timeout: 30_000 });
    await expect(punch.getByRole("button", { name: "Resolve" })).toHaveCount(0);
    expect(
      psqlScalar(`
SELECT (resolved_at IS NOT NULL) || '|' || (resolved_by = ${q(memberId)})
FROM public.install_punch_items WHERE ffe_item_id = ${q(INSTALL_LINE.id)}`),
    ).toBe("true|true");
    await shot(page, testInfo, "c3-punch-resolved");

    expect(failures, "edge-function / RPC failures seen by the page").toEqual(
      [],
    );
  });

  test("(d) a memo sample due back: the sweep's notice, the Desk's need, returned", async ({
    page,
  }, testInfo) => {
    test.setTimeout(300_000);
    const failures: string[] = [];
    watchFailures(page, failures);
    await hideDevOverlays(page);
    // The owner leads the job: the memo notice and the Desk need are hers.
    await signIn(page, OWNER_EMAIL);

    const returnBy = ymd(1);
    await openLine(page, SAMPLE, SAMPLE_LINE.name);
    const samples = page.getByTestId("line-samples");
    await samples
      .getByRole("button", { name: "Request a sample" })
      .click({ timeout: 30_000 });
    const form = samples.getByTestId("request-sample-form");
    await expect(form.getByLabel("Sample kind")).toHaveValue("memo");
    await form.getByLabel("Description").fill("Linen memo, 18 in");
    await form.getByLabel("Return by").fill(returnBy);
    await shot(page, testInfo, "d1-request-sample");
    await form.getByRole("button", { name: "Record it" }).click();
    await expect(samples.getByTestId("line-sample")).toHaveCount(1, {
      timeout: 30_000,
    });
    const sampleId = psqlScalar(`
SELECT id FROM public.sample_requests
WHERE ffe_item_id = ${q(SAMPLE_LINE.id)} AND kind = 'memo' AND return_by = ${q(returnBy)}
  AND vendor_id = ${q(SAMPLE.vendorId)}`);
    expect(sampleId, "the memo is recorded against the line's maker").not.toBe(
      "",
    );

    // The clock sweep notices the return-by date.
    psqlRun("SELECT public.sweep_procurement_clocks();");
    expect(
      psqlScalar(`
SELECT count(*) FROM public.procurement_notifications
WHERE kind = 'memo_return_due' AND subject_sample_id = ${q(sampleId)} AND user_id = ${q(ownerId)}`),
      "the sweep notifies the project lead",
    ).toBe("1");

    await page.goto("/desk", { waitUntil: "domcontentloaded" });
    await expect(
      page
        .getByText(new RegExp(`^Memo from ${SAMPLE.vendor} — return by `))
        .first(),
    ).toBeVisible({ timeout: 90_000 });
    await shot(page, testInfo, "d2-desk-memo-return");

    // Mark returned, on the line.
    await openLine(page, SAMPLE, SAMPLE_LINE.name);
    const sample = page.getByTestId("line-samples").getByTestId("line-sample");
    await sample.getByRole("button", { name: "Mark returned" }).click({
      timeout: 30_000,
    });
    const returned = sample.getByTestId("mark-returned-form");
    await expect(returned.getByLabel("Returned on")).toHaveValue(ymd(0));
    await returned.getByLabel("Return tracking").fill(`1Z${RUN}`);
    await returned.getByRole("button", { name: "Save", exact: true }).click();
    await expect(
      sample.getByRole("button", { name: "Mark returned" }),
    ).toHaveCount(0, {
      timeout: 30_000,
    });
    expect(
      psqlScalar(`
SELECT status || '|' || returned_on || '|' || return_tracking
FROM public.sample_requests WHERE id = ${q(sampleId)}`),
    ).toBe(`returned|${ymd(0)}|1Z${RUN}`);
    await shot(page, testInfo, "d3-sample-returned");

    expect(failures, "edge-function / RPC failures seen by the page").toEqual(
      [],
    );
  });

  test("(e) a deposit, then its balance; the money cell reads both stages", async ({
    page,
  }, testInfo) => {
    test.setTimeout(300_000);
    const failures: string[] = [];
    watchFailures(page, failures);
    await hideDevOverlays(page);
    await signIn(page, MEMBER_EMAIL);

    const stages = () =>
      psqlScalar(`
SELECT coalesce(string_agg(li.billing_stage || ':' || coalesce(li.billing_stage_pct::int::text, '') || ':' || li.amount_cents,
  ',' ORDER BY CASE li.billing_stage WHEN 'deposit' THEN 0 ELSE 1 END), '')
FROM public.invoice_line_items li JOIN public.invoices i ON i.id = li.invoice_id AND i.status <> 'void'
WHERE li.ffe_item_id = ${q(DEPOSIT_LINE.id)}`);

    // Bill the line as a deposit of 50%.
    await openLine(page, DEPOSIT, DEPOSIT_LINE.name);
    await page
      .getByRole("button", { name: "Bill", exact: true })
      .first()
      .click();
    await page
      .getByRole("radio", { name: "as a deposit of" })
      .check({ timeout: 30_000 });
    await page.getByLabel("Deposit percent").fill("50");
    await shot(page, testInfo, "e1-composer-deposit");
    await page.getByRole("button", { name: "Draft the invoice" }).click();
    await expect.poll(stages, { timeout: 30_000 }).toBe("deposit:50:200000");

    // The composer again: the balance is offered, ticked; draft it.
    await openLine(page, DEPOSIT, DEPOSIT_LINE.name);
    await page
      .getByRole("button", { name: "Bill", exact: true })
      .first()
      .click();
    const balances = page.getByTestId("composer-balances");
    await expect(balances).toBeVisible({ timeout: 30_000 });
    const balance = balances.getByRole("checkbox", {
      name: new RegExp(DEPOSIT_LINE.name),
    });
    await expect(balance).toBeChecked();
    await expect(balances).toContainText(/\$2,000/);
    await shot(page, testInfo, "e2-composer-balance");
    await page.getByRole("button", { name: "Draft the invoice" }).click();
    await expect
      .poll(stages, { timeout: 30_000 })
      .toBe("deposit:50:200000,balance::200000");

    // The line's money cell reads both stages.
    await openLine(page, DEPOSIT, DEPOSIT_LINE.name);
    await expect(
      page.getByTestId("line-money-out-cell").getByTestId("money-out-fronting"),
    ).toHaveText("Client deposit in draft · balance in draft", {
      timeout: 30_000,
    });
    await shot(page, testInfo, "e3-money-cell-stages");

    expect(failures, "edge-function / RPC failures seen by the page").toEqual(
      [],
    );
  });

  test("R3 · a released order edited afterwards needs release again", async ({
    page,
  }, testInfo) => {
    test.setTimeout(300_000);
    const failures: string[] = [];
    watchFailures(page, failures);
    await hideDevOverlays(page);
    await signIn(page, MEMBER_EMAIL);

    // The member holds the $6,000 order.
    let paper = await openPaper(page, R3, R3_LINE.name);
    await paper
      .getByRole("button", { name: "Hold for release · $6,000", exact: true })
      .click({ timeout: 30_000 });
    await expect
      .poll(() => poOf(R3_LINE.id).status, { timeout: 30_000 })
      .toBe("held_for_release");
    const poId = poOf(R3_LINE.id).id;
    await paper.getByRole("button", { name: "Done" }).click();
    await expect(paper).toBeHidden();

    // The owner releases it (release_purchase_order, as the owner); unsent.
    psqlAsUser(ownerId, `SELECT public.release_purchase_order(${q(poId)});`);
    expect(
      psqlScalar(`
SELECT po.status || '|' || (po.released_fingerprint IS NOT NULL) || '|' || (public.po_release_state(po.id)->>'cleared')
FROM public.purchase_orders po WHERE po.id = ${q(poId)}`),
      "released: a draft again, its content fingerprinted, cleared to send",
    ).toBe("draft|true|true");

    // The member edits the released paper: a note to the maker.
    paper = await openOrdersBookPaper(page, R3, R3_LINE.name, "send →");
    await expect(
      paper.locator("[data-order-paper-release-reason]"),
    ).toHaveCount(0);
    const note = paper.getByLabel(`Note to ${R3.vendor}`);
    await note.fill("Please crate the top separately.");
    await note.press("Tab");
    await expect
      .poll(
        () =>
          psqlScalar(
            `SELECT coalesce(vendor_note, '') || '|' || coalesce(public.po_release_state(id)->>'reason', '') FROM public.purchase_orders WHERE id = ${q(poId)}`,
          ),
        { timeout: 30_000 },
      )
      .toBe("Please crate the top separately.|changed");

    // Reopened (the Document reloads), the paper says so and holds again.
    paper = await openOrdersBookPaper(page, R3, R3_LINE.name, "send →");
    await expect(paper.locator("[data-order-paper-release-reason]")).toHaveText(
      "Changed since release — needs release again",
      { timeout: 30_000 },
    );
    await expect(
      paper.getByRole("button", {
        name: "Hold for release · $6,000",
        exact: true,
      }),
    ).toBeVisible();
    await shot(page, testInfo, "r3-needs-release-again");
    expect(poOf(R3_LINE.id).sentAt, "nothing went to the maker").toBe("");

    expect(failures, "edge-function / RPC failures seen by the page").toEqual(
      [],
    );
  });

  test("R4 · two half-orders to one maker on one job: the second is held", async ({
    page,
  }, testInfo) => {
    test.setTimeout(300_000);
    const failures: string[] = [];
    watchFailures(page, failures);
    await hideDevOverlays(page);
    await signIn(page, MEMBER_EMAIL);

    // The first half, under the line, sends.
    let paper = await openPaper(page, R4, R4_FIRST.name);
    const sendResponse = page.waitForResponse(
      (r) =>
        r.url().includes("/functions/v1/po-send") &&
        (r.request().postData() ?? "").includes('"send"'),
    );
    await paper
      .getByRole("button", {
        name: `Send to ${R4.vendor} · $3,000`,
        exact: true,
      })
      .click({ timeout: 30_000 });
    const sent = await sendResponse;
    expect(sent.status(), `po-send: ${await sent.text().catch(() => "")}`).toBe(
      200,
    );
    await expect
      .poll(() => poOf(R4_FIRST.id).sentAt, { timeout: 30_000 })
      .not.toBe("");
    await paper.getByRole("button", { name: "Done" }).click();
    await expect(paper).toBeHidden();

    // The second half: the new, unsaved paper reads the job's group
    // (po_release_preview, 00726) before anything is saved.
    paper = await openPaper(page, R4, R4_SECOND.name);
    await expect(paper.locator("[data-order-paper-release-reason]")).toHaveText(
      `With your other open orders to ${R4.vendor} on this job, this comes to $6,000 — over the studio's release line ($5,000).`,
      { timeout: 30_000 },
    );
    const hold = paper.getByRole("button", {
      name: "Hold for release · $3,000",
      exact: true,
    });
    await expect(hold).toBeVisible();
    await expect(
      paper.getByRole("button", { name: /^Send to / }),
      "a member over the group line has no send",
    ).toHaveCount(0);
    await shot(page, testInfo, "r4-second-half-held");
    await hold.click();
    await expect
      .poll(() => poOf(R4_SECOND.id).status, { timeout: 30_000 })
      .toBe("held_for_release");
    expect(poOf(R4_SECOND.id).sentAt, "nothing went to the maker").toBe("");

    expect(failures, "edge-function / RPC failures seen by the page").toEqual(
      [],
    );
  });

  test("R6 · a held order previews as a draft order and takes no number", async ({
    page,
  }, testInfo) => {
    test.setTimeout(300_000);
    const failures: string[] = [];
    watchFailures(page, failures);
    await hideDevOverlays(page);
    await signIn(page, MEMBER_EMAIL);

    let paper = await openPaper(page, R6, R6_LINE.name);
    await paper
      .getByRole("button", { name: "Hold for release · $7,000", exact: true })
      .click({ timeout: 30_000 });
    await expect
      .poll(() => poOf(R6_LINE.id).status, { timeout: 30_000 })
      .toBe("held_for_release");
    const poId = poOf(R6_LINE.id).id;
    await paper.getByRole("button", { name: "Done" }).click();
    await expect(paper).toBeHidden();

    // The held paper, from the Orders book: its PDF.
    paper = await openOrdersBookPaper(page, R6, R6_LINE.name, "open →");
    const previewResponse = page.waitForResponse(
      (r) =>
        r.url().includes("/functions/v1/po-send") &&
        (r.request().postData() ?? "").includes('"preview"'),
    );
    await paper
      .getByRole("button", { name: "See the PDF" })
      .click({ timeout: 30_000 });
    const preview = await previewResponse;
    const body = await preview.json().catch(() => ({}));
    expect(preview.status(), `po-send preview: ${JSON.stringify(body)}`).toBe(
      200,
    );
    expect(body).toMatchObject({ ok: true, poNumber: null, emailSent: false });
    expect(body.documentPath).toBe(`${R6.projectId}/po-preview-${poId}.pdf`);
    await expect(page.getByTitle("Purchase order PDF")).toBeVisible({
      timeout: 30_000,
    });
    await shot(page, testInfo, "r6-draft-preview");

    // Served functions sign against the stack's internal host (kong:8000).
    const pdf = await page.request.get(
      String(body.signedUrl).replace(
        /^https?:\/\/kong:8000/,
        "http://127.0.0.1:54321",
      ),
    );
    expect(pdf.ok(), "the signed preview downloads").toBe(true);
    expect(await pdfText(await pdf.body())).toContain("Draft order");
    expect(
      psqlScalar(`
SELECT status || '|' || coalesce(po_number, '') || '|' || coalesce(po_document_path, '')
FROM public.purchase_orders WHERE id = ${q(poId)}`),
      "held, unnumbered, no document path",
    ).toBe("held_for_release||");

    expect(failures, "edge-function / RPC failures seen by the page").toEqual(
      [],
    );
  });

  test("G5 · a letter stuck sending for 11 minutes: Send again sends it", async ({
    page,
  }, testInfo) => {
    test.setTimeout(300_000);
    const failures: string[] = [];
    watchFailures(page, failures);
    await hideDevOverlays(page);
    await signIn(page, MEMBER_EMAIL);

    // A send that claimed the draft and never finished (the trigger would
    // stamp updated_at now; the stamp is the claim time, so set it past it).
    psqlRun(`
BEGIN;
SET LOCAL session_replication_role = replica;
UPDATE public.procurement_drafts
SET status = 'sending', updated_at = now() - interval '11 minutes'
WHERE id = ${q(G5_DRAFT)};
COMMIT;`);

    await openLine(page, G5, G5_LINE.name);
    const reply = page
      .getByTestId("line-po-cell")
      .getByRole("region", { name: "Reply to the maker, drafted" });
    await expect(reply.getByRole("status")).toHaveText(/^Sending since /, {
      timeout: 30_000,
    });
    const again = reply.getByRole("button", { name: "Send again" });
    await expect(again).toBeVisible();
    await shot(page, testInfo, "g5-sending-stalled");
    const draftSend = page.waitForResponse((r) =>
      r.url().includes("/functions/v1/procurement-draft-send"),
    );
    await again.click();
    const draftSent = await draftSend;
    const draftBody = await draftSent.json().catch(() => ({}));
    expect(
      draftSent.status(),
      `procurement-draft-send: ${JSON.stringify(draftBody)}`,
    ).toBe(200);
    await expect(reply.getByRole("status")).toHaveText(
      `Sent to ${G5.vendorEmail}.`,
      { timeout: 30_000 },
    );
    await expect
      .poll(
        () =>
          psqlScalar(
            `SELECT status || '|' || (sent_at IS NOT NULL) FROM public.procurement_drafts WHERE id = ${q(G5_DRAFT)}`,
          ),
        { timeout: 20_000 },
      )
      .toBe("sent|true");
    await shot(page, testInfo, "g5-sent-again");

    expect(failures, "edge-function / RPC failures seen by the page").toEqual(
      [],
    );
  });

  test("G6 · a shipped line with an open damage exception carries it in its unfold", async ({
    page,
  }, testInfo) => {
    test.setTimeout(300_000);
    const failures: string[] = [];
    watchFailures(page, failures);
    await hideDevOverlays(page);
    await signIn(page, MEMBER_EMAIL);

    // The next-act reading that printed "Claim open" was retired with the
    // US-21 T-31 overview; the line's own unfold still lists the exception.
    await openLine(page, G6, G6_LINE.name);
    const damageRow = page
      .getByTestId("line-exceptions")
      .getByTestId("exception-row")
      .filter({ hasText: /^Damage/ });
    await expect(damageRow).toHaveCount(1, { timeout: 30_000 });
    await shot(page, testInfo, "g6-claim-open");

    expect(failures, "edge-function / RPC failures seen by the page").toEqual(
      [],
    );
  });
});
