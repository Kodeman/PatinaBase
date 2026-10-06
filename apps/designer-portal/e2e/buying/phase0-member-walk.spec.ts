import { randomUUID } from "node:crypto";
import {
  test,
  expect,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test";
import { psqlRow, psqlRun, psqlScalar } from "../helpers/psql";
import { adminDb } from "../helpers/supabase-admin";
import { hideDevOverlays } from "../helpers/hide-dev-overlays";

/**
 * US-16 Phase 0 (SQ-400) — the buying walk as a NON-OWNER studio member:
 * readiness → Order with Assistant (ship-to required) → PO created →
 * PoPreview note + Send (po-send, served locally) → log the ack inline → ETA →
 * In production → Shipped → receive → Mark installed. Plus: the Orders book
 * opened from the project wears the project lens.
 *
 * LOCAL STACK ONLY: psql.ts refuses a non-local Postgres and the config pins
 * the dev server to 127.0.0.1:54321. Preconditions and the run line are in
 * playwright.buying.config.ts (reset, functions served with
 * EMAIL_DEV_MODE=dry_run so the vendor email never leaves the machine).
 *
 * Seeds in beforeAll: a studio with an owner and a second member (role
 * `member`), a project the owner owns inside that studio with a job-site
 * address, and one selected line with a vendor (orders email on the reserved
 * .test domain) and a client price. The users and the studio are reused across
 * runs; the project, vendor and line are fresh per run so a rerun never
 * inherits a half-walked PO.
 */

const PASSWORD = "password123";
const OWNER_EMAIL = "buying-owner@patina.dev";
const MEMBER_EMAIL = "buying-member@patina.dev";
const STUDIO_ID = "e2e00000-0000-4000-8000-000000016400";
const SITE_ADDRESS = "40 Lakeview Rd, Madison, WI 53704";
const WELCOME_SHOWN_KEY = "help-system.welcome-shown.first-project-walkthrough";

const RUN = randomUUID().slice(0, 8);
const PROJECT_ID = randomUUID();
const VENDOR_ID = randomUUID();
const LINE_ID = randomUUID();
const PROJECT_NAME = `Buying walk ${RUN}`;
const VENDOR_NAME = `Bench Works ${RUN}`;
const VENDOR_EMAIL = `orders+${RUN}@benchworks.test`;
const LINE_NAME = `Walnut bench ${RUN}`;
const VENDOR_PO = `BW-${RUN}`;
const NOTE = `Please confirm the walnut finish (${RUN}).`;

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
VALUES (${q(ownerId)}, ${q(OWNER_EMAIL)}, 'Olive Owner', 'Olive Owner', 'designer', ${tourDone}::jsonb),
       (${q(memberId)}, ${q(MEMBER_EMAIL)}, 'Milo Member', 'Milo Member', 'designer', ${tourDone}::jsonb)
ON CONFLICT (id) DO UPDATE SET role = 'designer', full_name = EXCLUDED.full_name,
  display_name = EXCLUDED.display_name, help_state = EXCLUDED.help_state;

INSERT INTO public.user_roles (user_id, role_id)
SELECT ${q(ownerId)}, id FROM public.roles WHERE name IN ('independent_designer', 'studio_owner', 'app_user')
ON CONFLICT (user_id, role_id) DO NOTHING;
INSERT INTO public.user_roles (user_id, role_id)
SELECT ${q(memberId)}, id FROM public.roles WHERE name IN ('studio_designer', 'app_user')
ON CONFLICT (user_id, role_id) DO NOTHING;

INSERT INTO public.organizations (id, type, name, slug, status, address)
VALUES (${q(STUDIO_ID)}, 'design_studio', 'Buying Walk Studio', 'buying-walk-studio', 'active',
  '{"street":"12 Bench St","city":"Madison","state":"WI","zip":"53703","country":"US"}'::jsonb)
ON CONFLICT (id) DO UPDATE SET status = 'active', address = EXCLUDED.address;

-- Once per studio: guard_org_membership_changes refuses a second owner
-- insert before ON CONFLICT is even consulted.
INSERT INTO public.organization_members (user_id, organization_id, role, status, joined_at)
SELECT m.user_id, ${q(STUDIO_ID)}, m.role::public.member_role, 'active', now()
FROM (VALUES (${q(ownerId)}::uuid, 'owner'), (${q(memberId)}::uuid, 'member')) AS m(user_id, role)
WHERE NOT EXISTS (
  SELECT 1 FROM public.organization_members om WHERE om.organization_id = ${q(STUDIO_ID)}
);

INSERT INTO public.projects (id, name, designer_id, created_by, studio_id, status, site_address)
VALUES (${q(PROJECT_ID)}, ${q(PROJECT_NAME)}, ${q(ownerId)}, ${q(ownerId)}, ${q(STUDIO_ID)}, 'active', ${q(SITE_ADDRESS)});

INSERT INTO public.vendors (id, name, orders_email, contact_info)
VALUES (${q(VENDOR_ID)}, ${q(VENDOR_NAME)}, ${q(VENDOR_EMAIL)}, jsonb_build_object('email', ${q(VENDOR_EMAIL)}));

INSERT INTO public.project_ffe_items
  (id, project_id, name, item_type, status, quantity, design_disposition, assignment_scope,
   vendor_id, vendor_name, unit_price_cents, trade_price_cents)
VALUES (${q(LINE_ID)}, ${q(PROJECT_ID)}, ${q(LINE_NAME)}, 'fixed', 'approved', 1, 'selected', 'throughout',
   ${q(VENDOR_ID)}, ${q(VENDOR_NAME)}, 180000, 120000);
COMMIT;
`);
}

/** The PO on the seeded line, read as the database holds it. */
function poState(): {
  id: string;
  status: string;
  sentAt: string;
  ackAt: string;
  eta: string;
  shipTo: string;
} {
  const [id = "", status = "", sentAt = "", ackAt = "", eta = "", shipTo = ""] =
    psqlRow(`
SELECT po.id, po.status, coalesce(po.sent_at::text, ''), coalesce(po.acknowledged_at::text, ''),
       coalesce(po.confirmed_eta::text, ''), coalesce(po.ship_to, '')
FROM public.project_ffe_items item JOIN public.purchase_orders po ON po.id = item.purchase_order_id
WHERE item.id = ${q(LINE_ID)}`);
  return { id, status, sentAt, ackAt, eta, shipTo };
}

function lineStatus(): string {
  return psqlScalar(
    `SELECT status FROM public.project_ffe_items WHERE id = ${q(LINE_ID)}`,
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

/** Open the Document and unfold the seeded line. */
async function openLine(page: Page): Promise<Locator> {
  await page.goto(`/doc/${PROJECT_ID}`, { waitUntil: "domcontentloaded" });
  const lineName = page.getByText(LINE_NAME, { exact: true }).first();
  const seam = page
    .getByRole("button", { name: /^Pieces \d+ lines?$/i })
    .first();
  await expect(lineName.or(seam).first()).toBeVisible({ timeout: 90_000 });
  if (!(await lineName.isVisible())) await seam.click();
  await lineName.click();
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

test.describe.configure({ mode: "serial" });

test.describe("Studio buying Phase 0 — the non-owner member walk", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "one seeded walk");

  let memberId = "";

  test.beforeAll(async () => {
    const ownerId = await ensureUser(OWNER_EMAIL, "Olive Owner");
    memberId = await ensureUser(MEMBER_EMAIL, "Milo Member");
    seed(ownerId, memberId);
    // The walk's premise: the member is not the owner, and is an active member.
    expect(
      psqlScalar(
        `SELECT designer_id FROM public.projects WHERE id = ${q(PROJECT_ID)}`,
      ),
    ).toBe(ownerId);
    expect(memberId).not.toBe(ownerId);
  });

  test("create PO → ship-to → send → ack → ETA → advance → receive → install", async ({
    page,
  }, testInfo) => {
    test.setTimeout(420_000);
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
    await hideDevOverlays(page);
    await signIn(page, MEMBER_EMAIL);

    // 1–2. The Document; the line unfold reads ready.
    let poCell = await openLine(page);
    await expect(page.getByTestId("line-order-readiness")).toHaveCount(0);
    const order = page
      .getByRole("button", { name: "Order with Assistant" })
      .first();
    await expect(order).toBeEnabled({ timeout: 30_000 });
    await expect(poCell).toContainText("Not yet ordered");
    await shot(page, testInfo, "01-line-ready");

    // 3. Order with Assistant; Details requires a ship-to.
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
    const confirm = assistant.getByRole("button", {
      name: /^Confirm 1 ordered$/,
    });
    await confirm.click();
    await expect(assistant.getByRole("alert")).toContainText(
      "Choose where this ships.",
    );
    expect(poState().id, "no PO without a ship-to").toBe("");
    await shipTo.getByRole("radio", { name: /The job site/ }).check();
    await shot(page, testInfo, "02-details-ship-to");

    // 4. Create the PO; the Created step sends through PoPreview.
    await confirm.click();
    await expect(assistant.getByText("Purchase order created")).toBeVisible({
      timeout: 30_000,
    });
    const created = poState();
    expect(created.status).toBe("draft");
    expect(created.shipTo).toBe(SITE_ADDRESS);
    await assistant.getByRole("button", { name: "Review and send" }).click();
    const preview = page.getByRole("dialog", {
      name: "Purchase order preview",
    });
    await expect(preview).toBeVisible();
    await expect(preview.getByTitle("Purchase order PDF")).toBeVisible({
      timeout: 60_000,
    });
    await expect(preview).toContainText(`to ${VENDOR_EMAIL}`);
    await preview.getByLabel("Note to the vendor").fill(NOTE);
    await shot(page, testInfo, "03-po-preview");
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
      recipient: VENDOR_EMAIL,
      emailSent: true,
    });
    await expect(preview).toBeHidden({ timeout: 20_000 });
    await expect(
      assistant.getByRole("button", { name: "Resend to vendor" }),
    ).toBeVisible();
    expect(poState().sentAt).not.toBe("");
    await assistant.getByRole("button", { name: "Done" }).click();
    await expect(assistant).toBeHidden();

    // 5. Log the ack (the line's lifted next act), then set the ETA.
    poCell = page.getByTestId("line-po-cell");
    const nextAct = page.getByTestId("line-next-act");
    await expect(poCell).toContainText("awaiting acknowledgment", {
      timeout: 30_000,
    });
    await nextAct.getByPlaceholder("NA-2026-…").fill(VENDOR_PO);
    await nextAct.getByRole("button", { name: "Log acknowledgment" }).click();
    await expect(poCell).toContainText(/Acknowledged|acknowledged/, {
      timeout: 30_000,
    });
    await expect
      .poll(() => poState().status, { timeout: 20_000 })
      .toBe("confirmed");
    expect(poState().ackAt).not.toBe("");
    await expect(
      nextAct.getByRole("button", { name: "Confirmed ETA" }),
    ).toHaveCount(0, { timeout: 30_000 });
    const eta = isoDaysFromToday(3);
    const etaTrigger = page.getByRole("button", { name: "Confirmed ETA" });
    await expect(etaTrigger).toHaveCount(1);
    await pickDay(page, etaTrigger, eta);
    await expect(page.getByText(/eta updated — arrives ~/)).toBeVisible({
      timeout: 20_000,
    });
    await expect.poll(() => poState().eta, { timeout: 20_000 }).toBe(eta);
    await shot(page, testInfo, "04-acked-eta");

    // 6. Mark in production, then Mark shipped; the line follows the PO.
    await page
      .getByRole("button", { name: "Mark in production", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Mark shipped", exact: true }),
    ).toBeVisible({ timeout: 20_000 });
    await expect
      .poll(() => poState().status, { timeout: 20_000 })
      .toBe("in_production");
    await expect.poll(lineStatus, { timeout: 20_000 }).toBe("production");
    await page.getByRole("button", { name: "Mark shipped", exact: true }).click();
    await expect
      .poll(() => poState().status, { timeout: 20_000 })
      .toBe("shipped");
    await expect.poll(lineStatus, { timeout: 20_000 }).toBe("shipped");
    await expect(
      page.getByText("Shipped", { exact: true }).first(),
    ).toBeVisible({ timeout: 20_000 });
    await shot(page, testInfo, "05-shipped");

    // The Orders book opened from the project wears the project lens.
    await page.getByRole("button", { name: "Brief a vendor" }).click();
    const pages = page.getByRole("navigation", { name: "Orders book pages" });
    await expect(pages).toBeVisible({ timeout: 30_000 });
    await pages.getByRole("button", { name: "Receiving", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "all projects" }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("project ·").first()).toBeVisible();
    await shot(page, testInfo, "06-orders-receiving-project-lens");

    // 7. Receive: the inspection drawer the Receiving book mounts, from the
    // line (the book's queue lists delivered POs only; a shipped PO is
    // received from its line's "Log inspection").
    poCell = await openLine(page);
    await page.getByRole("button", { name: "Log inspection" }).first().click();
    const drawer = page.getByRole("dialog", { name: /^Log inspection for / });
    await expect(drawer).toBeVisible();
    await drawer
      .getByRole("button", { name: "Log inspection" })
      .click({ timeout: 20_000 });
    await expect(drawer).toBeHidden({ timeout: 30_000 });
    await expect
      .poll(() => poState().status, { timeout: 20_000 })
      .toBe("delivered");
    await expect.poll(lineStatus, { timeout: 20_000 }).toBe("delivered");

    // 8–9. Mark installed; the line reads installed.
    const install = page.getByRole("button", { name: "Mark installed" });
    await expect(install).toBeVisible({ timeout: 30_000 });
    await shot(page, testInfo, "07-delivered");
    await install.click();
    await expect.poll(lineStatus, { timeout: 20_000 }).toBe("installed");
    await expect(
      page.getByText("Installed", { exact: true }).first(),
    ).toBeVisible({ timeout: 30_000 });
    await shot(page, testInfo, "08-installed");

    expect(failures, "edge-function / RPC failures seen by the page").toEqual(
      [],
    );
  });
});
