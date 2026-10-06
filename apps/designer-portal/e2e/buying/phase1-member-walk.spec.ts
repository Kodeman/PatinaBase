import { randomUUID } from "node:crypto";
import {
  test,
  expect,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test";
import { psqlAsUser, psqlRow, psqlRun, psqlScalar } from "../helpers/psql";
import { adminDb } from "../helpers/supabase-admin";
import { hideDevOverlays } from "../helpers/hide-dev-overlays";

/**
 * US-16 Phase 1 (SQ-417) — the buying walk as a NON-OWNER studio member:
 * read by maker (margin shown: the studio default is `everyone`) → the six-cell
 * unfold → Order with Assistant (the studio account's terms and 50% deposit
 * prefilled; the default receiver listed first, nothing preselected) → Send
 * (po-send served locally, to the account's orders inbox) → ack → in
 * production → carrier + tracking → shipped → the studio vendor account card
 * → receive one line damaged, noted on the BOL, with a photo → the claim
 * clock sentence → record a partial deposit (stays due), then the remainder
 * (the balance falls due) → the Desk's payment_due act → the owner restricts
 * margin and the member's maker reading drops the margin columns.
 *
 * LOCAL STACK ONLY: psql.ts refuses a non-local Postgres and the config pins
 * the dev server to 127.0.0.1:54321. Preconditions and the run line are in
 * playwright.buying.config.ts (reset, functions served with
 * EMAIL_DEV_MODE=dry_run so the vendor email never leaves the machine).
 *
 * Two stand-ins, both outside the product code:
 *   - the 14:00 UTC `po-payments-due-daily` cron is run once, from its own
 *     cron.job command, so the deposit dated today falls due mid-walk;
 *   - `/api/media/assets` (the portal's proxy to the media service, which the
 *     local stack does not run) answers the photo upload with a fresh asset
 *     id and writes the svc_media.media_assets row the service would (READY,
 *     CLEAN, the member's, this project's, tagged receiving), so the
 *     inspection RPC's asset check runs for real.
 *
 * Seeds in beforeAll: a studio of its own (not Phase 0's, so the margin
 * setting this walk changes never reaches that walk) with an owner and a
 * member, a default receiver, and per run: a project the owner leads, vendor A
 * with a studio account (account number, 50/50 at 50% deposit, 3-day claims
 * window, orders inbox override), vendor B, and three selected lines — one
 * per vendor and one with no maker yet.
 */

const PASSWORD = "password123";
const OWNER_EMAIL = "buying1-owner@patina.dev";
const MEMBER_EMAIL = "buying1-member@patina.dev";
const STUDIO_ID = "e2e00000-0000-4000-8000-000000016417";
const RECEIVER_ID = "e2e00000-0000-4000-8000-0000001641a1";
const RECEIVER_LABEL = "Northside Receiving";
const SITE_ADDRESS = "40 Lakeview Rd, Madison, WI 53704";
const WELCOME_SHOWN_KEY = "help-system.welcome-shown.first-project-walkthrough";

const RUN = randomUUID().slice(0, 8);
const PROJECT_ID = randomUUID();
const VENDOR_A_ID = randomUUID();
const VENDOR_B_ID = randomUUID();
const LINE_A_ID = randomUUID();
const LINE_B_ID = randomUUID();
const LINE_C_ID = randomUUID();
const PROJECT_NAME = `Buying walk P1 ${RUN}`;
const VENDOR_A = `Ashwood Joinery ${RUN}`;
const VENDOR_B = `Birchline ${RUN}`;
const VENDOR_A_EMAIL = `orders+${RUN}@ashwood.test`;
const VENDOR_A_INBOX = `studio-desk+${RUN}@ashwood.test`;
const VENDOR_B_EMAIL = `orders+${RUN}@birchline.test`;
const ACCOUNT_NUMBER = `AJ-${RUN}`;
const LINE_A = `Oak sideboard ${RUN}`;
const LINE_B = `Linen sofa ${RUN}`;
const LINE_C = `Brass sconce ${RUN}`;
const VENDOR_PO = `AJ-PO-${RUN}`;
const CARRIER = "UPS";
const TRACKING = `1Z${RUN.toUpperCase()}0001`;
const STUB_ASSET_ID = randomUUID();
/** A 1×1 PNG: the inspection photo. */
const PNG_1X1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
// Line A: trade $1,200.00, client $1,800.00 → the 50% deposit is $600.00.
const DEPOSIT = "600.00";
const PARTIAL = "200.00";
const REMAINDER = "400.00";
/** The unfold's money reads in whole dollars (fmtUsd): "600.00" → "$600". */
const usd = (amount: string) => `$${Number(amount).toLocaleString("en-US")}`;

const q = (value: string) => `'${value.replace(/'/g, "''")}'`;

async function ensureUser(email: string, fullName: string): Promise<string> {
  const existing = psqlScalar(
    `SELECT id FROM auth.users WHERE email = ${q(email)}`,
  );
  if (existing) return existing;
  const { data, error } = await adminDb.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: fullName, role: "designer" },
  });
  if (error || !data.user)
    throw error ?? new Error(`createUser ${email} returned no user`);
  return data.user.id;
}

function seed(ownerId: string, memberId: string): void {
  const tourDone = q(
    JSON.stringify({ tours: { "desk-walkthrough": { completed: true } } }),
  );
  psqlRun(`
BEGIN;
INSERT INTO public.profiles (id, email, full_name, display_name, role, help_state)
VALUES (${q(ownerId)}, ${q(OWNER_EMAIL)}, 'Opal Owner', 'Opal Owner', 'designer', ${tourDone}::jsonb),
       (${q(memberId)}, ${q(MEMBER_EMAIL)}, 'Mara Member', 'Mara Member', 'designer', ${tourDone}::jsonb)
ON CONFLICT (id) DO UPDATE SET role = 'designer', full_name = EXCLUDED.full_name,
  display_name = EXCLUDED.display_name, help_state = EXCLUDED.help_state;

INSERT INTO public.user_roles (user_id, role_id)
SELECT ${q(ownerId)}, id FROM public.roles WHERE name IN ('independent_designer', 'studio_owner', 'app_user')
ON CONFLICT (user_id, role_id) DO NOTHING;
INSERT INTO public.user_roles (user_id, role_id)
SELECT ${q(memberId)}, id FROM public.roles WHERE name IN ('studio_designer', 'app_user')
ON CONFLICT (user_id, role_id) DO NOTHING;

-- margin_visibility back to the default every run: this walk ends restricted.
INSERT INTO public.organizations (id, type, name, slug, status, address, margin_visibility)
VALUES (${q(STUDIO_ID)}, 'design_studio', 'Buying Walk Studio P1', 'buying-walk-studio-p1', 'active',
  '{"street":"12 Bench St","city":"Madison","state":"WI","zip":"53703","country":"US"}'::jsonb, 'everyone')
ON CONFLICT (id) DO UPDATE SET status = 'active', address = EXCLUDED.address,
  margin_visibility = 'everyone';

-- Once per studio: guard_org_membership_changes refuses a second owner
-- insert before ON CONFLICT is even consulted.
INSERT INTO public.organization_members (user_id, organization_id, role, status, joined_at)
SELECT m.user_id, ${q(STUDIO_ID)}, m.role::public.member_role, 'active', now()
FROM (VALUES (${q(ownerId)}::uuid, 'owner'), (${q(memberId)}::uuid, 'member')) AS m(user_id, role)
WHERE NOT EXISTS (
  SELECT 1 FROM public.organization_members om WHERE om.organization_id = ${q(STUDIO_ID)}
);

-- The studio's default receiver, once per studio (one default per studio).
INSERT INTO public.studio_locations (id, organization_id, kind, label, address, is_default_receiver)
VALUES (${q(RECEIVER_ID)}, ${q(STUDIO_ID)}, 'receiver', ${q(RECEIVER_LABEL)},
  '{"street":"900 Dock Ln","city":"Madison","state":"WI","zip":"53716","country":"US"}'::jsonb, true)
ON CONFLICT (id) DO UPDATE SET archived_at = NULL, is_default_receiver = true,
  label = EXCLUDED.label, address = EXCLUDED.address;

INSERT INTO public.projects (id, name, designer_id, created_by, studio_id, status, site_address)
VALUES (${q(PROJECT_ID)}, ${q(PROJECT_NAME)}, ${q(ownerId)}, ${q(ownerId)}, ${q(STUDIO_ID)}, 'active', ${q(SITE_ADDRESS)});

-- Vendor A's shared default is 30/70: the Assistant opening on 50/50 at 50%
-- proves the studio account, not the vendor row, set the terms.
INSERT INTO public.vendors (id, name, orders_email, contact_info, default_payment_terms)
VALUES (${q(VENDOR_A_ID)}, ${q(VENDOR_A)}, ${q(VENDOR_A_EMAIL)}, jsonb_build_object('email', ${q(VENDOR_A_EMAIL)}), 'thirty_seventy'),
       (${q(VENDOR_B_ID)}, ${q(VENDOR_B)}, ${q(VENDOR_B_EMAIL)}, jsonb_build_object('email', ${q(VENDOR_B_EMAIL)}), NULL);

INSERT INTO public.studio_vendor_accounts
  (organization_id, vendor_id, account_status, account_number, payment_pattern, deposit_pct,
   claims_window_days, orders_email_override, created_by, updated_by)
VALUES (${q(STUDIO_ID)}, ${q(VENDOR_A_ID)}, 'active', ${q(ACCOUNT_NUMBER)}, 'fifty_fifty', 50,
   3, ${q(VENDOR_A_INBOX)}, ${q(ownerId)}, ${q(ownerId)});

-- Distinct sort_order: the line query orders by sort_order alone, so tied
-- rows come back in heap order and an ordered line (rewritten tuple) jumps
-- position. Under next dev's StrictMode that keyed move double-invokes the
-- unfold's effects and the Order Assistant's reset effect sends it back to
-- Review. Production has no double-invoke; the seed just keeps lines still.
INSERT INTO public.project_ffe_items
  (id, project_id, name, item_type, status, quantity, design_disposition, assignment_scope,
   vendor_id, vendor_name, unit_price_cents, line_total_cents, trade_price_cents, sort_order)
VALUES (${q(LINE_A_ID)}, ${q(PROJECT_ID)}, ${q(LINE_A)}, 'fixed', 'approved', 1, 'selected', 'throughout',
   ${q(VENDOR_A_ID)}, ${q(VENDOR_A)}, 180000, 180000, 120000, 1),
       (${q(LINE_B_ID)}, ${q(PROJECT_ID)}, ${q(LINE_B)}, 'fixed', 'approved', 1, 'selected', 'throughout',
   ${q(VENDOR_B_ID)}, ${q(VENDOR_B)}, 90000, 90000, 60000, 2),
       (${q(LINE_C_ID)}, ${q(PROJECT_ID)}, ${q(LINE_C)}, 'fixed', 'approved', 1, 'selected', 'throughout',
   NULL, NULL, 40000, 40000, NULL, 3);
COMMIT;
`);
}

interface PoRow {
  id: string;
  status: string;
  sentAt: string;
  pattern: string;
  shipTo: string;
  shipToLocation: string;
  carrier: string;
  tracking: string;
  shippedOn: string;
  deliveredDate: string;
}

/** Vendor A's PO, read as the database holds it. */
function poState(): PoRow {
  const [
    id = "",
    status = "",
    sentAt = "",
    pattern = "",
    shipTo = "",
    shipToLocation = "",
    carrier = "",
    tracking = "",
    shippedOn = "",
    deliveredDate = "",
  ] = psqlRow(`
SELECT po.id, po.status, coalesce(po.sent_at::text, ''), po.payment_pattern::text,
       -- the location snapshot is multi-line; psqlRow reads one line
       replace(coalesce(po.ship_to, ''), E'\\n', ' / '), coalesce(po.ship_to_location_id::text, ''),
       coalesce(po.carrier, ''), coalesce(po.tracking_number, ''),
       coalesce(po.shipped_on::text, ''), coalesce(po.delivered_date::text, '')
FROM public.project_ffe_items item JOIN public.purchase_orders po ON po.id = item.purchase_order_id
WHERE item.id = ${q(LINE_A_ID)}`);
  return {
    id,
    status,
    sentAt,
    pattern,
    shipTo,
    shipToLocation,
    carrier,
    tracking,
    shippedOn,
    deliveredDate,
  };
}

/** One scheduled row of the PO: `state|amount_cents`. */
function paymentRow(poId: string, kind: "deposit" | "balance"): string {
  return psqlScalar(
    `SELECT state || '|' || amount_cents FROM public.po_payments
     WHERE purchase_order_id = ${q(poId)} AND kind = ${q(kind)}`,
  );
}

function lineStatus(): string {
  return psqlScalar(
    `SELECT status FROM public.project_ffe_items WHERE id = ${q(LINE_A_ID)}`,
  );
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
  const disclosure = page.getByRole("button", {
    name: /sign in with email|use email and password instead/i,
  });
  await disclosure.first().click({ timeout: 30_000 });
  await page.getByLabel(/email/i).first().fill(email);
  await page
    .getByLabel(/password/i)
    .first()
    .fill(PASSWORD);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL(/\/(desk|doc|unauthorized)/, { timeout: 60_000 });
  expect(
    page.url(),
    "the member reaches the Desk, not /unauthorized",
  ).not.toContain("/unauthorized");
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

/** Open the Document on the Project section, waiting for line A to print. */
async function openDocument(page: Page): Promise<void> {
  await page.goto(`/doc/${PROJECT_ID}`, { waitUntil: "domcontentloaded" });
  const lineName = page.getByText(LINE_A, { exact: true }).first();
  const seam = page
    // "Pieces 3 lines", or "… · 1 damaged Oct 6" once a receipt is damaged.
    .getByRole("button", { name: /^Pieces \d+ lines?\b/i })
    .first();
  await expect(lineName.or(seam).first()).toBeVisible({ timeout: 90_000 });
  if (!(await lineName.isVisible())) await seam.click();
  await expect(lineName).toBeVisible({ timeout: 30_000 });
}

/** Switch the Project section to "read by maker"; returns its body. */
async function readByMaker(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: "Read by maker" }).click();
  const body = page.locator('[data-ffe-reading-body="maker"]');
  await expect(body).toBeVisible({ timeout: 30_000 });
  return body;
}

/** Open the Document and unfold line A (room reading). */
async function openLine(page: Page): Promise<Locator> {
  await openDocument(page);
  await page.getByText(LINE_A, { exact: true }).first().click();
  const poCell = page.getByTestId("line-po-cell");
  await expect(poCell).toBeVisible({ timeout: 30_000 });
  return poCell;
}

/** Pick a day in a DateTextInput's Folio popover. */
async function pickDay(
  page: Page,
  trigger: Locator,
  iso: string,
): Promise<void> {
  await trigger.click();
  const cell = page.locator(`[data-folio-cell="${iso}"]`);
  for (let i = 0; i < 3 && !(await cell.isVisible()); i++) {
    await page.getByRole("button", { name: "Next month" }).click();
  }
  await cell.click();
  await page.getByRole("button", { name: "Set", exact: true }).click();
}

function isoDaysFromToday(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The claim clock's day words, as claim-clock.tsx prints them ("Fri 9 October"). */
function clockDay(ymd: string): string {
  const [y, m, d] = ymd.slice(0, 10).split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "short" }).format(
    date,
  );
  const dayMonth = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
  }).format(date);
  return `${weekday} ${dayMonth}`;
}

test.describe.configure({ mode: "serial" });

test.describe("Studio buying Phase 1 — the non-owner member walk", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "one seeded walk");

  let ownerId = "";
  let memberId = "";

  test.beforeAll(async () => {
    ownerId = await ensureUser(OWNER_EMAIL, "Opal Owner");
    memberId = await ensureUser(MEMBER_EMAIL, "Mara Member");
    seed(ownerId, memberId);
    // The walk's premise: the member is not the owner, holds a member seat,
    // and the studio shows margin to everyone.
    expect(
      psqlScalar(
        `SELECT designer_id FROM public.projects WHERE id = ${q(PROJECT_ID)}`,
      ),
    ).toBe(ownerId);
    expect(
      psqlScalar(
        `SELECT role FROM public.organization_members
         WHERE organization_id = ${q(STUDIO_ID)} AND user_id = ${q(memberId)}`,
      ),
    ).toBe("member");
    expect(
      psqlScalar(
        `SELECT margin_visibility FROM public.organizations WHERE id = ${q(STUDIO_ID)}`,
      ),
    ).toBe("everyone");
  });

  test("by maker → order (account terms, receiver) → send → tracking → receive damaged → claim clock → pay → margin restricted", async ({
    page,
  }, testInfo) => {
    test.setTimeout(600_000);
    const failures: string[] = [];
    page.on("response", (response) => {
      const url = response.url();
      const watched =
        url.includes("/functions/v1/") || url.includes("/rest/v1/rpc/");
      if (
        !watched ||
        response.ok() ||
        response.request().method() === "OPTIONS"
      )
        return;
      void response
        .text()
        .catch(() => "")
        .then((body) =>
          failures.push(
            `${response.status()} ${new URL(url).pathname} ${body.slice(0, 300)}`,
          ),
        );
    });
    // The media service is not part of the local stack; see the header.
    await page.route("**/api/media/assets", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      // The row the media service writes once an upload is stored and
      // scanned: the receiving RPC checks it is READY, CLEAN, the actor's,
      // this project's, and tagged receiving.
      psqlRun(`
INSERT INTO svc_media.media_assets
  (id, kind, raw_key, status, scan_status, mime_type, permissions, tags, uploaded_by, project_id)
VALUES (${q(STUB_ASSET_ID)}, 'IMAGE', ${q(`e2e/${STUB_ASSET_ID}.png`)}, 'READY', 'CLEAN', 'image/png',
  jsonb_build_object('projectId', ${q(PROJECT_ID)}), ARRAY['receiving'], ${q(memberId)}, ${q(PROJECT_ID)})
ON CONFLICT (id) DO NOTHING;`);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { assetId: STUB_ASSET_ID } }),
      });
    });
    // ...and the signed download URL the inspection photo strip asks for.
    await page.route("**/api/media/assets/*/download", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: { downloadUrl: `data:image/png;base64,${PNG_1X1}` },
        }),
      }),
    );
    await hideDevOverlays(page);
    await signIn(page, MEMBER_EMAIL);

    // 1. Read by maker: vendor A, vendor B, "No maker yet"; margin shows.
    await openDocument(page);
    let maker = await readByMaker(page);
    const groupHeads = maker.getByRole("rowheader");
    await expect(groupHeads.filter({ hasText: VENDOR_A })).toHaveCount(1);
    await expect(groupHeads.filter({ hasText: VENDOR_B })).toHaveCount(1);
    await expect(
      groupHeads.filter({ hasText: /^No maker yet · 1$/ }),
    ).toHaveCount(1);
    await expect(
      maker.getByRole("columnheader", { name: "Client price" }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      maker.getByRole("columnheader", { name: "Markup" }),
    ).toBeVisible();
    // Line A: trade $1,200, client $1,800, markup 50%.
    const groupA = maker.locator(`[data-maker-group="${VENDOR_A_ID}"]`);
    await expect(groupA).toContainText("$1,800");
    await expect(groupA).toContainText("50%");
    await shot(page, testInfo, "01-read-by-maker-margin");

    // 2. The unfold, opened from the maker reading: six cells.
    await maker.getByRole("button", { name: LINE_A, exact: true }).click();
    for (const cell of [
      "line-buy-cell",
      "line-quote-cell",
      "line-po-cell",
      "line-movement-cell",
      "line-receiving-cell",
      "line-money-out-cell",
    ]) {
      await expect(page.getByTestId(cell), cell).toBeVisible({
        timeout: 30_000,
      });
    }
    await shot(page, testInfo, "02-unfold-six-cells");

    // 3. Order with Assistant: the account's terms and deposit; the receiver
    // first in the ship-to list, nothing preselected. From the room reading;
    // the maker-reading order path has its own test below (SQ-444).
    await openLine(page);
    const order = page
      .getByRole("button", { name: "Order with Assistant" })
      .first();
    await expect(order).toBeEnabled({ timeout: 30_000 });
    await order.click();
    const assistant = page.getByRole("dialog", { name: /Order Assistant for/ });
    await expect(assistant).toBeVisible();
    const shipTo = assistant.getByRole("group", { name: "Ship to" });
    for (let step = 0; step < 4 && !(await shipTo.isVisible()); step++) {
      const next = assistant.getByRole("button", {
        name: /^(Continue|Proceed anyway)$/,
      });
      await next.click();
      await expect(next.or(shipTo).first()).toBeVisible({ timeout: 20_000 });
    }
    await expect(shipTo).toBeVisible();
    const terms = assistant.getByLabel("Terms");
    await expect(terms).toHaveValue("fifty_fifty", { timeout: 20_000 });
    await expect(terms.locator("option:checked")).toHaveText(
      "50% deposit / 50% before ship (Studio account)",
    );
    const depositAmount = assistant.getByLabel("Deposit amount");
    await expect(depositAmount).toHaveValue(DEPOSIT, { timeout: 20_000 });
    // Dated today, so the day's po-payments-due-daily run makes it due.
    await assistant.getByLabel("Deposit due").fill(isoDaysFromToday(0));

    const radios = shipTo.getByRole("radio");
    await expect(radios.first()).toBeVisible();
    const firstLabel = shipTo.locator("label").first();
    await expect(firstLabel).toContainText(RECEIVER_LABEL);
    await expect(firstLabel).toContainText("Default receiver");
    const radioCount = await radios.count();
    expect(
      radioCount,
      "receiver, studio, job site, somewhere else",
    ).toBeGreaterThanOrEqual(4);
    for (let i = 0; i < radioCount; i++) {
      await expect(
        radios.nth(i),
        `ship-to option ${i} unchecked`,
      ).not.toBeChecked();
    }
    const confirm = assistant.getByRole("button", {
      name: /^Confirm 1 ordered$/,
    });
    await confirm.click();
    await expect(assistant.getByRole("alert")).toContainText(
      "Choose where this ships.",
    );
    expect(poState().id, "no PO without a ship-to").toBe("");
    await radios.first().check();
    await shot(page, testInfo, "03-details-account-terms-receiver");

    // 4. Create, then Send through PoPreview to the account's orders inbox.
    await confirm.click();
    await expect(assistant.getByText("Purchase order created")).toBeVisible({
      timeout: 30_000,
    });
    const created = poState();
    expect(created.status).toBe("draft");
    expect(created.pattern).toBe("fifty_fifty");
    // The location is saved right after the create (set_..._ship_to_location).
    await expect
      .poll(() => poState().shipToLocation, { timeout: 20_000 })
      .toBe(RECEIVER_ID);
    expect(poState().shipTo).toBe(
      `${RECEIVER_LABEL} / 900 Dock Ln / Madison, WI 53716`,
    );
    expect(paymentRow(created.id, "deposit")).toBe("pending|60000");
    expect(paymentRow(created.id, "balance")).toBe("pending|60000");
    await assistant.getByRole("button", { name: "Review and send" }).click();
    const preview = page.getByRole("dialog", {
      name: "Purchase order preview",
    });
    await expect(preview).toBeVisible();
    await expect(preview.getByTitle("Purchase order PDF")).toBeVisible({
      timeout: 60_000,
    });
    await expect(preview).toContainText(`Sends to ${VENDOR_A_INBOX}`, {
      timeout: 20_000,
    });
    await shot(page, testInfo, "04-po-preview-account-inbox");
    const sendResponse = page.waitForResponse(
      (r) =>
        r.url().includes("/functions/v1/po-send") &&
        (r.request().postData() ?? "").includes('"send"'),
    );
    await preview.getByRole("button", { name: "Send to vendor" }).click();
    const sent = await sendResponse;
    const sentBody = await sent.json().catch(() => ({}));
    expect(sent.status(), `po-send send: ${JSON.stringify(sentBody)}`).toBe(
      200,
    );
    expect(sentBody).toMatchObject({
      ok: true,
      recipient: VENDOR_A_INBOX,
      emailSent: true,
    });
    await expect(preview).toBeHidden({ timeout: 20_000 });
    expect(poState().sentAt).not.toBe("");
    await assistant.getByRole("button", { name: "Done" }).click();
    await expect(assistant).toBeHidden();

    // Ack, ETA, in production (the road to the tracking edit).
    let poCell = page.getByTestId("line-po-cell");
    const nextAct = page.getByTestId("line-next-act");
    await expect(poCell).toContainText("awaiting acknowledgment", {
      timeout: 30_000,
    });
    await nextAct.getByPlaceholder("NA-2026-…").fill(VENDOR_PO);
    await nextAct.getByRole("button", { name: "Log acknowledgment" }).click();
    await expect
      .poll(() => poState().status, { timeout: 20_000 })
      .toBe("confirmed");
    const etaTrigger = page.getByRole("button", { name: "Confirmed ETA" });
    await expect(etaTrigger).toHaveCount(1, { timeout: 30_000 });
    await pickDay(page, etaTrigger, isoDaysFromToday(3));
    await expect(page.getByText(/eta updated — arrives ~/)).toBeVisible({
      timeout: 20_000,
    });
    await page
      .getByRole("button", { name: "Mark in production", exact: true })
      .click();
    await expect
      .poll(() => poState().status, { timeout: 20_000 })
      .toBe("in_production");

    // 5. Carrier and tracking in the Movement cell, then Mark shipped.
    const movement = page.getByTestId("line-movement-cell");
    await movement.getByRole("button", { name: "Add tracking" }).click();
    const tracking = movement.getByTestId("line-movement-tracking");
    await tracking.getByLabel("carrier").fill(CARRIER);
    await tracking.getByLabel("tracking").fill(TRACKING);
    await tracking.getByRole("button", { name: "Save tracking" }).click();
    await expect(
      tracking.getByRole("link", { name: TRACKING }),
    ).toHaveAttribute(
      "href",
      new RegExp(`ups\\.com/track\\?tracknum=${TRACKING}`),
      {
        timeout: 20_000,
      },
    );
    await expect(tracking).toContainText(CARRIER);
    await expect
      .poll(() => poState().tracking, { timeout: 20_000 })
      .toBe(TRACKING);
    expect(poState().carrier).toBe(CARRIER);
    await page
      .getByRole("button", { name: "Mark shipped", exact: true })
      .click();
    await expect
      .poll(() => poState().status, { timeout: 20_000 })
      .toBe("shipped");
    await expect.poll(lineStatus, { timeout: 20_000 }).toBe("shipped");
    expect(poState().shippedOn, "shipping stamps shipped_on").not.toBe("");
    await expect(tracking).toContainText(/Shipped \d/, { timeout: 20_000 });
    await shot(page, testInfo, "05-tracking-shipped");

    // The studio vendor account card, from the Orders book's vendor page.
    await page.getByRole("button", { name: "Brief a vendor" }).click();
    await expect(
      page.getByRole("navigation", { name: "Orders book pages" }),
    ).toBeVisible({ timeout: 30_000 });
    const card = page.locator("[data-vendor-account]");
    if (!(await card.isVisible())) {
      await page
        .getByRole("button", { name: VENDOR_A, exact: true })
        .first()
        .click({ timeout: 30_000 });
    }
    // "Brief a vendor" lands on the Thread page; the account lives on Terms.
    if (!(await card.isVisible())) {
      await page
        .getByRole("button", { name: /^Terms · / })
        .first()
        .click({ timeout: 30_000 });
    }
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(card).toContainText(ACCOUNT_NUMBER);
    await expect(card).toContainText("50% deposit");
    await expect(card).toContainText("vendor 3 days");
    await expect(card).toContainText(VENDOR_A_INBOX);
    await shot(page, testInfo, "06-vendor-account-card");

    // 6. Receive: one line damaged, noted on the BOL, with a photo.
    poCell = await openLine(page);
    await page.getByRole("button", { name: "Log inspection" }).first().click();
    const drawer = page.getByRole("dialog", { name: /^Log inspection for / });
    await expect(drawer).toBeVisible();
    await drawer.getByRole("button", { name: /^Damaged/ }).click();
    await drawer.getByLabel(`Condition of ${LINE_A}`).selectOption("damaged");
    await drawer.getByLabel("Noted on the BOL").check();
    await drawer.locator('input[type="file"]').setInputFiles({
      name: "corner-split.png",
      mimeType: "image/png",
      buffer: Buffer.from(PNG_1X1, "base64"),
    });
    await expect(
      drawer.getByRole("list", { name: "Photos to attach" }).getByRole("img"),
    ).toHaveCount(1, { timeout: 20_000 });
    await shot(page, testInfo, "07-inspection-damaged-bol-photo");
    await drawer
      .getByRole("button", { name: "Log inspection" })
      .click({ timeout: 20_000 });
    await expect(drawer).toBeHidden({ timeout: 30_000 });
    // Every outcome stamps delivered_date (the truck came); only a clean one
    // advances the PO to delivered (00665), so a damaged receipt stays shipped.
    await expect
      .poll(() => poState().deliveredDate, { timeout: 20_000 })
      .not.toBe("");
    expect(poState().status).toBe("shipped");
    const poId = poState().id;
    expect(
      psqlScalar(`
SELECT l.condition || '|' || l.noted_on_bol
FROM public.receiving_inspection_lines l
JOIN public.receiving_inspections i ON i.id = l.inspection_id
WHERE i.purchase_order_id = ${q(poId)} AND l.ffe_item_id = ${q(LINE_A_ID)}`),
    ).toBe("damaged|true");
    expect(
      psqlScalar(`
SELECT ${q(STUB_ASSET_ID)}::uuid = ANY (photo_asset_ids)
FROM public.receiving_inspections WHERE purchase_order_id = ${q(poId)}`),
    ).toBe("t");
    expect(
      psqlScalar(`
SELECT count(*) FROM public.damage_claims c
JOIN public.receiving_inspections i ON i.id = c.receiving_inspection_id
WHERE i.purchase_order_id = ${q(poId)} AND c.state = 'drafted'`),
    ).toBe("1");

    // The claim sentence, dated from the account's 3-day window.
    const deadline = psqlScalar(
      `SELECT vendor_deadline::text FROM public.procurement_claim_deadline(${q(poId)})`,
    );
    expect(deadline, "the PO has a claim deadline").not.toBe("");
    const clock = page.getByTestId("claim-clock");
    await expect(clock).toHaveText(
      `${VENDOR_A} wants written notice by ${clockDay(deadline)} (72 hours from delivery, per the ${VENDOR_A} account).`,
      { timeout: 30_000 },
    );
    await shot(page, testInfo, "08-claim-clock");

    // 7. Money out. The day's po-payments-due-daily run makes the deposit
    // due (its own cron.job command, run once).
    const cronCommand = psqlScalar(
      `SELECT command FROM cron.job WHERE jobname = 'po-payments-due-daily'`,
    );
    expect(cronCommand).toContain("SET state = 'due'");
    psqlRun(cronCommand);
    expect(paymentRow(poId, "deposit")).toBe("due|60000");

    poCell = await openLine(page);
    const moneyOut = page.getByTestId("line-money-out-cell");
    await expect(moneyOut).toContainText(`Deposit ${usd(DEPOSIT)} · due`, {
      timeout: 30_000,
    });
    // A studio-lane PO, and the member is not its payer: no Pay now.
    await expect(moneyOut.getByRole("button", { name: /Pay now/ })).toHaveCount(
      0,
    );

    await moneyOut
      .getByRole("button", { name: "Record payment · Deposit" })
      .click();
    let form = moneyOut.getByTestId("record-payment-form");
    await expect(form.getByLabel("Amount paid")).toHaveValue(DEPOSIT);
    await form.getByLabel("Amount paid").fill(PARTIAL);
    await form.getByLabel("Paid with").selectOption("kind:check");
    await form.getByLabel("Reference").fill(`chk ${RUN}-1`);
    await form
      .getByRole("button", { name: `Record the deposit · ${usd(PARTIAL)}` })
      .click();
    await expect(form).toBeHidden({ timeout: 20_000 });
    await expect(moneyOut).toContainText(
      `Deposit ${usd(DEPOSIT)} · paid ${usd(PARTIAL)} of ${usd(DEPOSIT)} · due`,
      { timeout: 20_000 },
    );
    expect(paymentRow(poId, "deposit"), "a partial payment stays due").toBe(
      "due|60000",
    );
    expect(paymentRow(poId, "balance")).toBe("pending|60000");
    await shot(page, testInfo, "09-partial-deposit");

    await moneyOut
      .getByRole("button", { name: "Record payment · Deposit" })
      .click();
    form = moneyOut.getByTestId("record-payment-form");
    await expect(form.getByLabel("Amount paid")).toHaveValue(REMAINDER);
    await form.getByLabel("Paid with").selectOption("kind:check");
    await form.getByLabel("Reference").fill(`chk ${RUN}-2`);
    await form
      .getByRole("button", { name: `Record the deposit · ${usd(REMAINDER)}` })
      .click();
    await expect(form).toBeHidden({ timeout: 20_000 });
    await expect
      .poll(() => paymentRow(poId, "deposit"), { timeout: 20_000 })
      .toBe("paid|60000");
    // The deposit paid on a shipped 50/50 PO: the balance falls due.
    await expect
      .poll(() => paymentRow(poId, "balance"), { timeout: 20_000 })
      .toBe("due|60000");
    await expect(moneyOut).toContainText(/Deposit \$600 · paid \d/, {
      timeout: 20_000,
    });
    await expect(moneyOut).toContainText("Balance $600 · due", {
      timeout: 20_000,
    });
    await expect(moneyOut.getByTestId("vendor-payment-record")).toHaveCount(2);
    await shot(page, testInfo, "10-deposit-paid-balance-due");

    // The Desk's payment_due act: the balance to vendor A.
    await page.goto("/desk", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByText(new RegExp(`Balance to ${VENDOR_A}`)).first(),
    ).toBeVisible({ timeout: 90_000 });
    await shot(page, testInfo, "11-desk-payment-due");

    // 8. The member cannot restrict margin; the owner can.
    expect(() =>
      psqlAsUser(
        memberId,
        `SELECT public.set_studio_margin_visibility(${q(STUDIO_ID)}, 'owners_admins');`,
      ),
    ).toThrow(/only an owner or admin/);
    psqlAsUser(
      ownerId,
      `SELECT public.set_studio_margin_visibility(${q(STUDIO_ID)}, 'owners_admins');`,
    );
    expect(
      psqlScalar(
        `SELECT margin_visibility FROM public.organizations WHERE id = ${q(STUDIO_ID)}`,
      ),
    ).toBe("owners_admins");

    await openDocument(page);
    maker = await readByMaker(page);
    await expect(
      maker.getByRole("columnheader", { name: "Trade cost" }),
    ).toBeVisible();
    await expect(
      maker.getByRole("columnheader", { name: "Client price" }),
    ).toHaveCount(0);
    await expect(
      maker.getByRole("columnheader", { name: "Markup" }),
    ).toHaveCount(0);
    await expect(
      maker.locator(`[data-maker-group="${VENDOR_A_ID}"]`),
    ).not.toContainText("$1,800");
    await shot(page, testInfo, "12-margin-hidden-for-member");

    expect(failures, "edge-function / RPC failures seen by the page").toEqual(
      [],
    );
  });

  // SQ-444 regression: in the maker reading a line moves onto its new PO when
  // the PO is created; the unfold (and the Order Assistant in it) must stay
  // mounted through "Review and send". Vendor B's line, which the walk above
  // never orders.
  test("orders from the by-maker reading through Send", async ({ page }) => {
    test.setTimeout(300_000);
    await hideDevOverlays(page);
    await signIn(page, MEMBER_EMAIL);
    await openDocument(page);
    const maker = await readByMaker(page);
    await maker.getByRole("button", { name: LINE_B, exact: true }).click();
    const order = page
      .getByRole("button", { name: "Order with Assistant" })
      .first();
    await expect(order).toBeEnabled({ timeout: 30_000 });
    await order.click();
    const assistant = page.getByRole("dialog", { name: /Order Assistant for/ });
    await expect(assistant).toBeVisible();
    const shipTo = assistant.getByRole("group", { name: "Ship to" });
    for (let step = 0; step < 4 && !(await shipTo.isVisible()); step++) {
      const next = assistant.getByRole("button", {
        name: /^(Continue|Proceed anyway)$/,
      });
      await next.click();
      await expect(next.or(shipTo).first()).toBeVisible({ timeout: 20_000 });
    }
    await shipTo.getByRole("radio").first().check();
    await assistant
      .getByRole("button", { name: /^Confirm 1 ordered$/ })
      .click();
    await expect(assistant.getByText("Purchase order created")).toBeVisible({
      timeout: 30_000,
    });
    // The Assistant must survive the line moving into its PO's group.
    await expect(assistant).toBeVisible();
    await assistant.getByRole("button", { name: "Review and send" }).click();
    const preview = page.getByRole("dialog", {
      name: "Purchase order preview",
    });
    await expect(preview.getByTitle("Purchase order PDF")).toBeVisible({
      timeout: 60_000,
    });
    await expect(preview).toContainText(`Sends to ${VENDOR_B_EMAIL}`);
    const sendResponse = page.waitForResponse(
      (r) =>
        r.url().includes("/functions/v1/po-send") &&
        (r.request().postData() ?? "").includes('"send"'),
    );
    await preview.getByRole("button", { name: "Send to vendor" }).click();
    const sent = await sendResponse;
    expect(sent.status()).toBe(200);
    await expect(preview).toBeHidden({ timeout: 20_000 });
    expect(
      psqlScalar(`
SELECT po.sent_at IS NOT NULL
FROM public.project_ffe_items item JOIN public.purchase_orders po ON po.id = item.purchase_order_id
WHERE item.id = ${q(LINE_B_ID)}`),
    ).toBe("t");
  });
});
