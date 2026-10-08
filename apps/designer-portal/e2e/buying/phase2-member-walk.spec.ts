import { randomUUID } from "node:crypto";
import {
  test,
  expect,
  type Browser,
  type Page,
  type TestInfo,
} from "@playwright/test";
import { psqlRun, psqlScalar } from "../helpers/psql";
import { adminDb } from "../helpers/supabase-admin";
import { hideDevOverlays } from "../helpers/hide-dev-overlays";

/**
 * US-16 Phase 2 (SQ-435) — the buying walk past the send, as a NON-OWNER
 * member, with one owner hand:
 *
 *   1. the order paper for vendor A (2 × $6,240 = $12,480, over the studio's
 *      $5,000 release threshold) ends in "Hold for release · $12,480"; held;
 *   2. the OWNER's Desk names it; she releases it from the paper and po-send
 *      sends it;
 *   3. the member checks the acknowledgment with one finish difference: the
 *      stamp reads "1 difference", the reply to the maker waits in draft
 *      review, and Send goes through procurement-draft-send;
 *   4. a partial shipment (1 of 2) and a freight rider billed at cost;
 *   5. the one that arrived is received damaged; the claim is tracked as an
 *      exception and reads its clock sentence;
 *   6. the second is backordered; the substitution offers the alternate and
 *      "Ask the client" drafts the client's decision;
 *   7. the flea-market find is recorded as a purchase; its line is ordered;
 *   8. "Bill 1 unbilled purchase" and "Bill 1 unbilled rider" each draft an
 *      invoice line at cost;
 *   9. the Pieces overview's head carries its acts (US-21 T-31 retired the
 *      next-act reading).
 *
 * Mail: procurement-draft-send goes through _shared/send-email.ts (Resend
 * HTTPS); with EMAIL_DEV_MODE=dry_run it logs the letter and reports it
 * delivered. Nothing in that path reaches Mailpit (see e2e/helpers/mailpit.ts),
 * so the walk proves the send by the function's 200 and the draft's `sent`
 * stamp, not by a caught message.
 *
 * LOCAL STACK ONLY: psql.ts refuses a non-local Postgres. Preconditions and
 * the run line are in playwright.buying.config.ts.
 *
 * Stand-ins outside the product code, as in Phase 1: `/api/media/assets` (the
 * portal's proxy to the media service the local stack does not run) answers
 * the inspection photo with an asset id and writes the svc_media row the
 * service would.
 */

const PASSWORD = "password123";
const OWNER_EMAIL = "buying2-owner@patina.dev";
const CLIENT_EMAIL = "buying2-client@patina.dev";
const MEMBER_EMAIL = "buying2-member@patina.dev";
const STUDIO_ID = "e2e00000-0000-4000-8000-000000016435";
const WELCOME_SHOWN_KEY = "help-system.welcome-shown.first-project-walkthrough";
const SITE_ADDRESS = "18 Orchard Way, Madison, WI 53705";

const RUN = randomUUID().slice(0, 8);
const PROJECT_ID = randomUUID();
const VENDOR_A_ID = randomUUID();
const VENDOR_B_ID = randomUUID();
const WORKROOM_ID = randomUUID();
const MILL_ID = randomUUID();
const LINE_A_ID = randomUUID();
const FRAME_ID = randomUUID();
const FABRIC_ID = randomUUID();
const FIND_ID = randomUUID();
const ALT_ID = randomUUID();
const STUB_ASSET_ID = randomUUID();
const PROJECT_NAME = `Buying walk P2 ${RUN}`;
const VENDOR_A = `Hale Furniture ${RUN}`;
const VENDOR_B = `Rattan House ${RUN}`;
const WORKROOM = `Hollis Workroom ${RUN}`;
const MILL = `Maren Mills ${RUN}`;
const VENDOR_A_EMAIL = `orders+${RUN}@hale.test`;
const LINE_A = `Walnut sideboard ${RUN}`;
const FRAME = `Channel-back sofa ${RUN}`;
const FABRIC = `COM velvet ${RUN}`;
const FIND = `Flea-market mirror ${RUN}`;
const ALT = `Rattan sideboard ${RUN}`;
const FINISH = "Natural walnut";
const THEIR_FINISH = "Smoked walnut";
const VENDOR_PO = `HF-${RUN}`;
const FIND_PAYEE = "Kane County Flea Market";
const FIND_PAID = "340.00";
const RIDER_ESTIMATE = "380.00";
/** A 1×1 PNG: the inspection photo. */
const PNG_1X1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const q = (value: string) => `'${value.replace(/'/g, "''")}'`;

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

function seed(ownerId: string, memberId: string, clientId: string): void {
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

-- The release gate (00710): an order at or over $5,000 waits for an owner.
INSERT INTO public.organizations
  (id, type, name, slug, status, address, release_threshold_cents, require_release_per_order)
VALUES (${q(STUDIO_ID)}, 'design_studio', 'Buying Walk Studio P2', 'buying-walk-studio-p2', 'active',
  '{"street":"7 Loom St","city":"Madison","state":"WI","zip":"53703","country":"US"}'::jsonb, 500000, false)
ON CONFLICT (id) DO UPDATE SET status = 'active', address = EXCLUDED.address,
  release_threshold_cents = 500000, require_release_per_order = false;

-- Once per studio: guard_org_membership_changes refuses a second owner insert.
INSERT INTO public.organization_members (user_id, organization_id, role, status, joined_at)
SELECT m.user_id, ${q(STUDIO_ID)}, m.role::public.member_role, 'active', now()
FROM (VALUES (${q(ownerId)}::uuid, 'owner'), (${q(memberId)}::uuid, 'member')) AS m(user_id, role)
WHERE NOT EXISTS (
  SELECT 1 FROM public.organization_members om WHERE om.organization_id = ${q(STUDIO_ID)}
);

-- The client a substitution asks (request_substitution_approval needs an
-- active designer_clients relationship for the project's designer + client).
INSERT INTO public.profiles (id, email, full_name, display_name, role)
VALUES (${q(clientId)}, ${q(CLIENT_EMAIL)}, 'Cora Client', 'Cora Client', 'homeowner')
ON CONFLICT (id) DO UPDATE SET role = 'homeowner', full_name = EXCLUDED.full_name;
INSERT INTO public.designer_clients (designer_id, client_id, client_email, status)
SELECT ${q(ownerId)}, ${q(clientId)}, ${q(CLIENT_EMAIL)}, 'active'
WHERE NOT EXISTS (
  SELECT 1 FROM public.designer_clients
  WHERE designer_id = ${q(ownerId)} AND client_id = ${q(clientId)} AND status = 'active'
);

INSERT INTO public.projects (id, name, designer_id, created_by, client_id, studio_id, status, site_address)
VALUES (${q(PROJECT_ID)}, ${q(PROJECT_NAME)}, ${q(ownerId)}, ${q(ownerId)}, ${q(clientId)}, ${q(STUDIO_ID)}, 'active', ${q(SITE_ADDRESS)});

INSERT INTO public.vendors (id, name, orders_email, contact_info, default_payment_terms)
VALUES (${q(VENDOR_A_ID)}, ${q(VENDOR_A)}, ${q(VENDOR_A_EMAIL)}, jsonb_build_object('email', ${q(VENDOR_A_EMAIL)}), 'fifty_fifty'),
       (${q(VENDOR_B_ID)}, ${q(VENDOR_B)}, ${q(`orders+${RUN}@rattan.test`)}, jsonb_build_object('email', ${q(`orders+${RUN}@rattan.test`)}), NULL),
       (${q(WORKROOM_ID)}, ${q(WORKROOM)}, ${q(`work+${RUN}@hollis.test`)}, jsonb_build_object('email', ${q(`work+${RUN}@hollis.test`)}), NULL),
       (${q(MILL_ID)}, ${q(MILL)}, ${q(`mill+${RUN}@maren.test`)}, jsonb_build_object('email', ${q(`mill+${RUN}@maren.test`)}), NULL);

-- Distinct sort_order keeps the lines still under next dev's StrictMode
-- (phase1-member-walk.spec.ts explains).
INSERT INTO public.project_ffe_items
  (id, project_id, name, item_type, status, quantity, design_disposition, assignment_scope,
   vendor_id, vendor_name, unit_price_cents, line_total_cents, trade_price_cents, sort_order)
VALUES
  -- Vendor A's order: 2 × $6,240 trade = $12,480.
  (${q(LINE_A_ID)}, ${q(PROJECT_ID)}, ${q(LINE_A)}, 'fixed', 'approved', 2, 'selected', 'throughout',
   ${q(VENDOR_A_ID)}, ${q(VENDOR_A)}, 936000, 1872000, 624000, 1),
  -- The COM pair: the workroom's frame, and the mill's fabric that covers it.
  (${q(FRAME_ID)}, ${q(PROJECT_ID)}, ${q(FRAME)}, 'fixed', 'approved', 1, 'selected', 'throughout',
   ${q(WORKROOM_ID)}, ${q(WORKROOM)}, 720000, 720000, 480000, 2),
  (${q(FABRIC_ID)}, ${q(PROJECT_ID)}, ${q(FABRIC)}, 'fixed', 'approved', 1, 'selected', 'throughout',
   ${q(MILL_ID)}, ${q(MILL)}, 180000, 180000, 120000, 3),
  -- The find: no maker, bought on the spot.
  (${q(FIND_ID)}, ${q(PROJECT_ID)}, ${q(FIND)}, 'fixed', 'approved', 1, 'selected', 'throughout',
   NULL, NULL, 52000, 52000, NULL, 4);

-- The alternate the substitution offers, on line A's selection thread (a
-- thread with an alternate holds exactly one selected row).
INSERT INTO public.project_ffe_items
  (id, project_id, name, item_type, status, quantity, design_disposition, assignment_scope,
   vendor_id, vendor_name, unit_price_cents, line_total_cents, trade_price_cents, sort_order,
   selection_thread_id)
SELECT ${q(ALT_ID)}, ${q(PROJECT_ID)}, ${q(ALT)}, 'fixed', 'approved', 2, 'alternate', 'throughout',
   ${q(VENDOR_B_ID)}, ${q(VENDOR_B)}, 700000, 1400000, 480000, 5, selection_thread_id
FROM public.project_ffe_items WHERE id = ${q(LINE_A_ID)};

-- link_ffe_pair's write, made directly (the table is RPC-only for users).
UPDATE public.project_ffe_items SET parent_ffe_item_id = ${q(FRAME_ID)} WHERE id = ${q(FABRIC_ID)};

-- Line A's finish: the acknowledgment check's FINISH row. A line's spec row
-- is created with the line, so it is updated, not inserted.
INSERT INTO public.project_ffe_specs (ffe_item_id, finish) VALUES (${q(LINE_A_ID)}, ${q(FINISH)})
ON CONFLICT (ffe_item_id) DO UPDATE SET finish = EXCLUDED.finish;
COMMIT;
`);
}

/** Vendor A's PO, as the database holds it: `id|status|sent_at`. */
function poRow(): { id: string; status: string; sentAt: string } {
  const [id = "", status = "", sentAt = ""] = psqlScalar(`
SELECT po.id || '|' || po.status || '|' || coalesce(po.sent_at::text, '')
FROM public.project_ffe_items item JOIN public.purchase_orders po ON po.id = item.purchase_order_id
WHERE item.id = ${q(LINE_A_ID)}`).split("|");
  return { id, status, sentAt };
}

function lineStatus(id: string): string {
  return psqlScalar(
    `SELECT status FROM public.project_ffe_items WHERE id = ${q(id)}`,
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

/** Open the Document on the Project section, waiting for line A to print. */
async function openDocument(page: Page): Promise<void> {
  await page.goto(`/doc/${PROJECT_ID}`, { waitUntil: "domcontentloaded" });
  const lineName = page.getByText(lineLabel(LINE_A)).first();
  const seam = page
    .getByRole("button", { name: /^Pieces \d+ lines?\b/i })
    .first();
  await expect(lineName.or(seam).first()).toBeVisible({ timeout: 90_000 });
  if (!(await lineName.isVisible())) await seam.click();
  await expect(lineName).toBeVisible({ timeout: 30_000 });
}

/** Open the Document and unfold a line (room reading). */
async function openLine(page: Page, name: string = LINE_A): Promise<void> {
  await openDocument(page);
  await page.getByText(lineLabel(name)).first().click();
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

async function ownerPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await hideDevOverlays(page);
  await signIn(page, OWNER_EMAIL);
  return page;
}

test.describe.configure({ mode: "serial" });
// A missing control fails its step, not the whole walk's 15-minute budget.
test.use({ actionTimeout: 45_000 });

test.describe("Studio buying Phase 2 — the member walk past the send", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "one seeded walk");

  let ownerId = "";
  let memberId = "";

  test.beforeAll(async () => {
    ownerId = await ensureUser(OWNER_EMAIL, "Opal Owner");
    memberId = await ensureUser(MEMBER_EMAIL, "Mara Member");
    const clientId = await ensureUser(CLIENT_EMAIL, "Cora Client", "homeowner");
    seed(ownerId, memberId, clientId);
    expect(
      psqlScalar(
        `SELECT role FROM public.organization_members
         WHERE organization_id = ${q(STUDIO_ID)} AND user_id = ${q(memberId)}`,
      ),
    ).toBe("member");
    expect(
      psqlScalar(
        `SELECT release_threshold_cents FROM public.organizations WHERE id = ${q(STUDIO_ID)}`,
      ),
    ).toBe("500000");
  });

  test("hold → owner releases → ack with a difference → reply sent → partial shipment + rider → damage → substitution → purchase → billed at cost → pieces overview", async ({
    page,
    browser,
  }, testInfo) => {
    test.setTimeout(900_000);
    const failures: string[] = [];
    watchFailures(page, failures);
    await page.route("**/api/media/assets", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
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

    // ── 1. The order paper: over the threshold, the member holds it. ───────
    await openLine(page);
    const order = page
      .getByRole("button", { name: "Order", exact: true })
      .first();
    await expect(order).toBeEnabled({ timeout: 30_000 });
    await order.click();
    let paper = page.getByRole("dialog", { name: "The order paper" });
    await expect(paper).toBeVisible();
    const hold = paper.getByRole("button", {
      name: "Hold for release · $12,480",
      exact: true,
    });
    await expect(hold).toBeVisible({ timeout: 30_000 });
    await expect(
      paper.getByRole("button", { name: /^Send to / }),
      "a member over the threshold has no send",
    ).toHaveCount(0);
    await expect(paper.locator("[data-order-paper-consequence]")).toHaveText(
      `Opal or an admin releases it before it goes to ${VENDOR_A}.`,
    );
    // The ship-to choices load after the paper opens: wait for the job site.
    await paper
      .getByRole("group", { name: "Ship to" })
      .getByRole("radio", { name: /The job site/ })
      .check({ timeout: 20_000 });
    await shot(page, testInfo, "01-paper-hold-for-release");
    await hold.click();
    await expect(paper.locator("[data-order-paper-record]")).toContainText(
      `Opal or an admin releases it before it goes to ${VENDOR_A}.`,
      { timeout: 30_000 },
    );
    await expect.poll(() => poRow().status, { timeout: 20_000 }).toBe(
      "held_for_release",
    );
    const poId = poRow().id;
    expect(poRow().sentAt, "nothing went to the vendor").toBe("");
    expect(
      psqlScalar(
        `SELECT held_by::text || '|' || public.po_is_sendable(id) FROM public.purchase_orders WHERE id = ${q(poId)}`,
      ),
      "held by the member; po-send's sendable guard refuses it",
    ).toBe(`${memberId}|false`);
    await shot(page, testInfo, "02-paper-held");
    await paper.getByRole("button", { name: "Done" }).click();
    await expect(paper).toBeHidden();

    // ── 2. The owner: the Desk names it; she releases it and it sends. ─────
    const owner = await ownerPage(browser);
    watchFailures(owner, failures);
    await expect(
      owner
        .getByText(`Release Mara's order to ${VENDOR_A} · $12,480`)
        .first(),
    ).toBeVisible({ timeout: 90_000 });
    await shot(owner, testInfo, "03-owner-desk-release-need");
    // The need's act opens the Orders ledger, where the held row opens the paper.
    await owner
      .getByRole("button", { name: `Release — ${PROJECT_NAME}`, exact: true })
      .click();
    const heldSection = owner.locator("[data-orders-held-for-release]");
    await expect(heldSection).toBeVisible({ timeout: 30_000 });
    await expect(heldSection.locator("[data-orders-held-row]")).toContainText(
      VENDOR_A,
    );
    await shot(owner, testInfo, "03b-owner-orders-held");
    await heldSection.getByRole("button", { name: "open →" }).first().click();
    paper = owner.getByRole("dialog", { name: /order paper|Purchase order/ });
    await expect(paper).toBeVisible({ timeout: 30_000 });
    await expect(paper.locator("[data-order-paper-held-record]")).toContainText(
      "Held for release",
      { timeout: 30_000 },
    );
    const release = paper.getByRole("button", {
      name: `Release to ${VENDOR_A} · $12,480`,
      exact: true,
    });
    await expect(release).toBeVisible({ timeout: 30_000 });
    await shot(owner, testInfo, "04-owner-paper-release");
    const sendResponse = owner.waitForResponse(
      (r) =>
        r.url().includes("/functions/v1/po-send") &&
        (r.request().postData() ?? "").includes('"send"'),
    );
    await release.click();
    const sent = await sendResponse;
    const sentBody = await sent.json().catch(() => ({}));
    expect(sent.status(), `po-send: ${JSON.stringify(sentBody)}`).toBe(200);
    expect(sentBody).toMatchObject({ ok: true, emailSent: true });
    await expect(paper.getByText(`Sent to ${VENDOR_A_EMAIL} · `)).toBeVisible({
      timeout: 20_000,
    });
    expect(
      psqlScalar(
        `SELECT released_by::text || '|' || (sent_at IS NOT NULL) FROM public.purchase_orders WHERE id = ${q(poId)}`,
      ),
    ).toBe(`${ownerId}|true`);
    await shot(owner, testInfo, "05-owner-released-sent");
    await owner.context().close();

    // ── 3. The ack check, one finish difference; the reply is drafted. ─────
    await openLine(page);
    const nextAct = page.getByTestId("line-next-act");
    const ackCheck = nextAct.getByTestId("ack-check");
    await expect(ackCheck).toBeVisible({ timeout: 30_000 });
    await ackCheck.getByPlaceholder("NA-2026-…").fill(VENDOR_PO);
    const finish = ackCheck.getByLabel(`${LINE_A} · finish, they confirmed`);
    await expect(finish).toHaveValue(FINISH, { timeout: 20_000 });
    await finish.fill(THEIR_FINISH);
    await expect(ackCheck.getByTestId("ack-check-summary")).toHaveText(
      "1 difference. Silence on a wrong acknowledgment counts as accepting it.",
    );
    await shot(page, testInfo, "06-ack-check-one-difference");
    await ackCheck
      .getByRole("button", { name: "Log it with 1 difference" })
      .click();
    // The status sentence is transient: once the ack lands the next act moves
    // on. The durable proof is the PO's stamp and the drafted reply below.
    const poCell = page.getByTestId("line-po-cell");
    await expect(poCell.getByTestId("po-ack-stamp")).toHaveText(
      "Acknowledged · 1 difference",
      { timeout: 30_000 },
    );
    const reply = poCell.getByRole("region", {
      name: "Reply to the maker, drafted",
    });
    await expect(reply).toBeVisible({ timeout: 30_000 });
    await expect(reply.getByTestId("draft-recipient")).toContainText(
      VENDOR_A_EMAIL,
    );
    await shot(page, testInfo, "07-ack-stamp-reply-drafted");
    const draftSend = page.waitForResponse((r) =>
      r.url().includes("/functions/v1/procurement-draft-send"),
    );
    await reply.getByRole("button", { name: "Send", exact: true }).click();
    const draftSent = await draftSend;
    const draftBody = await draftSent.json().catch(() => ({}));
    expect(
      draftSent.status(),
      `procurement-draft-send: ${JSON.stringify(draftBody)}`,
    ).toBe(200);
    expect(draftBody).toMatchObject({ ok: true });
    await expect(reply.getByRole("status")).toHaveText(
      `Sent to ${VENDOR_A_EMAIL}.`,
      { timeout: 20_000 },
    );
    // Drafts go awaiting_review → sending → sent (00718); poll past "sending".
    await expect
      .poll(
        () =>
          psqlScalar(
            `SELECT status || '|' || to_email FROM public.procurement_drafts WHERE id = ${q(draftBody.draftId)}`,
          ),
        { timeout: 20_000 },
      )
      .toBe(`sent|${VENDOR_A_EMAIL}`);
    await shot(page, testInfo, "08-reply-sent");

    // ── 4. A partial shipment (1 of 2), and a freight rider at cost. ───────
    await openLine(page);
    const movement = page.getByTestId("line-movement-cell");
    await movement
      .getByRole("button", { name: "Record a shipment" })
      .click({ timeout: 30_000 });
    const shipForm = movement.getByTestId("record-shipment-form");
    await shipForm
      .getByLabel(`${LINE_A} pieces shipped`)
      .fill("1", { timeout: 30_000 });
    await shipForm.getByLabel("Shipment carrier").fill("Estes");
    await shipForm.getByRole("button", { name: "Save as shipped" }).click();
    await expect(shipForm).toBeHidden({ timeout: 30_000 });
    await expect(
      movement.getByRole("list", { name: "Shipments" }),
    ).toContainText("Estes", { timeout: 20_000 });
    expect(
      psqlScalar(`
SELECT count(*) || '|' || sum(l.qty)
FROM public.po_shipments s JOIN public.po_shipment_lines l ON l.shipment_id = s.id
WHERE s.purchase_order_id = ${q(poId)}`),
      "one shipment, one of the two pieces",
    ).toBe("1|1");

    await poCell
      .getByRole("button", { name: "+ freight, crating, receiving…" })
      .click();
    const riderForm = poCell.locator("[data-rider-add]");
    await expect(riderForm.getByLabel("Rider")).toHaveValue("freight");
    await riderForm.getByLabel("Estimate").fill(RIDER_ESTIMATE);
    await expect(
      riderForm.getByRole("checkbox", { name: "Bill the client" }),
    ).toBeChecked();
    await expect(riderForm.getByLabel("Billing rule")).toHaveValue("at_cost");
    await riderForm.getByRole("button", { name: "Add the freight" }).click();
    await expect(poCell.locator('[data-rider="freight"]')).toBeVisible({
      timeout: 20_000,
    });
    expect(
      psqlScalar(`
SELECT kind || '|' || estimate_cents || '|' || billable_to_client || '|' || billing_rule
FROM public.po_cost_lines WHERE purchase_order_id = ${q(poId)}`),
    ).toBe("freight|38000|true|at_cost");
    await shot(page, testInfo, "09-partial-shipment-freight-rider");

    // ── 5. Receive the one that came, damaged; the exception's clock. ──────
    await openLine(page);
    await page.getByRole("button", { name: "Log inspection" }).first().click({
      timeout: 30_000,
    });
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
    await drawer
      .getByRole("button", { name: "Log inspection" })
      .click({ timeout: 20_000 });
    await expect(drawer).toBeHidden({ timeout: 30_000 });
    await expect
      .poll(
        () =>
          psqlScalar(`
SELECT count(*) FROM public.damage_claims c
JOIN public.receiving_inspections i ON i.id = c.receiving_inspection_id
WHERE i.purchase_order_id = ${q(poId)}`),
        { timeout: 20_000 },
      )
      .toBe("1");

    await openLine(page);
    const exceptions = page.getByTestId("line-exceptions");
    await exceptions
      .getByRole("button", { name: "Track it" })
      .click({ timeout: 30_000 });
    const damageRow = exceptions
      .getByTestId("exception-row")
      .filter({ hasText: /^Damage/ });
    await expect(damageRow).toHaveCount(1, { timeout: 30_000 });
    const [clockDue = "", clockBasis = ""] = psqlScalar(`
SELECT coalesce(clock_due_on::text, '') || '|' || coalesce(clock_basis, '')
FROM public.procurement_exceptions WHERE ffe_item_id = ${q(LINE_A_ID)} AND type = 'damage'`).split(
      "|",
    );
    expect(clockDue, "the damage exception carries its clock").not.toBe("");
    const clock = damageRow.getByTestId("exception-clock");
    await expect(clock).toHaveText(/^(By|Was due) /);
    if (clockBasis) await expect(clock).toContainText(clockBasis);
    await shot(page, testInfo, "10-damage-exception-clock");

    // ── 6. The second piece is backordered: substitute, ask the client. ────
    await exceptions.getByRole("button", { name: "Something’s wrong…" }).click();
    const wrong = page.getByRole("dialog", {
      name: `Something’s wrong · ${LINE_A}`,
    });
    await expect(wrong).toBeVisible();
    await wrong.getByRole("radio", { name: /^Backorder/ }).check();
    await wrong.getByRole("button", { name: "Open the exception" }).click();
    await expect(wrong).toBeHidden({ timeout: 30_000 });
    const backorderRow = exceptions
      .getByTestId("exception-row")
      .filter({ hasText: /^Backorder/ });
    await expect(backorderRow).toHaveCount(1, { timeout: 30_000 });
    await backorderRow.getByRole("button", { name: "Choose a path" }).click();
    const pathSheet = page.getByTestId("exception-path-sheet");
    await expect(pathSheet).toBeVisible();
    // Choosing Substitute swaps the path radios for the substitution flow, so
    // the radio is gone the moment it takes: click, not check.
    await pathSheet.getByRole("radio", { name: /^Substitute/ }).click();
    const substitution = pathSheet.getByTestId("substitution-flow");
    await expect(substitution).toHaveAttribute("data-stage", "pick");
    const alternate = substitution
      .getByTestId("substitution-alternate")
      .filter({ hasText: ALT });
    await expect(alternate).toHaveCount(1);
    await alternate.getByRole("checkbox").check();
    await shot(page, testInfo, "11-substitution-pick-alternate");
    await substitution.getByRole("button", { name: "Ask the client" }).click();
    await expect(substitution).toHaveAttribute("data-stage", "release", {
      timeout: 30_000,
    });
    await expect(substitution).toContainText(
      "The question is drafted. Release it to the client when you are ready.",
    );
    expect(
      psqlScalar(`
SELECT d.status FROM public.procurement_exceptions e
JOIN public.client_decisions d ON d.id = e.client_decision_id
WHERE e.ffe_item_id = ${q(LINE_A_ID)} AND e.type = 'backorder'`),
      "the client's decision is a draft, not released",
    ).toBe("draft");
    await shot(page, testInfo, "12-substitution-decision-drafted");
    await page.keyboard.press("Escape");

    // ── 7. The find, recorded as a purchase; its line is ordered. ──────────
    await openDocument(page);
    await page.getByRole("button", { name: "Add a line" }).first().click();
    await page.getByRole("button", { name: /^Bought it already/ }).click();
    const purchase = page.getByTestId("purchase-record-form");
    await expect(purchase).toBeVisible({ timeout: 30_000 });
    await purchase.getByRole("button", { name: "Find", exact: true }).click();
    await purchase.getByPlaceholder("Pair of table lamps").fill(FIND);
    await purchase.getByPlaceholder("CB2 · Chicago").fill(FIND_PAYEE);
    await purchase.getByLabel("Amount paid").fill(FIND_PAID);
    await purchase.getByLabel("Line", { exact: true }).selectOption(FIND_ID);
    const billPurchase = purchase.getByRole("checkbox", {
      name: "Bill the client, at cost, on its own line",
    });
    if (!(await billPurchase.isChecked())) await billPurchase.check();
    await shot(page, testInfo, "13-purchase-find");
    await purchase
      .getByRole("button", { name: "Record the buy · $340.00" })
      .click();
    await expect.poll(() => lineStatus(FIND_ID), { timeout: 30_000 }).toBe(
      "ordered",
    );
    expect(
      psqlScalar(`
SELECT kind || '|' || amount_cents || '|' || billable_to_client || '|' || status
FROM public.studio_purchases WHERE ffe_item_id = ${q(FIND_ID)}`),
    ).toBe("one_off|34000|true|recorded");
    await page.keyboard.press("Escape");

    // ── 8. Purchases and riders billed at cost, each on its own line. ──────
    await openDocument(page);
    await page
      .getByRole("button", { name: "Bill 1 unbilled purchase" })
      .first()
      .click({ timeout: 30_000 });
    let composer = page.getByTestId("composer-purchases");
    await expect(composer).toBeVisible({ timeout: 30_000 });
    await expect(composer.getByLabel(`Bill ${FIND}`, { exact: true })).toBeChecked();
    await expect(composer).toContainText("cost $340.00");
    await shot(page, testInfo, "14-composer-purchase-at-cost");
    await page.getByRole("button", { name: "Draft the invoice" }).click();
    await expect
      .poll(
        () =>
          psqlScalar(`
SELECT li.amount_cents || '|' || (li.metadata->>'costCents')
FROM public.studio_purchases p JOIN public.invoice_line_items li ON li.id = p.invoice_line_id
WHERE p.ffe_item_id = ${q(FIND_ID)}`),
        { timeout: 30_000 },
      )
      .toBe("34000|34000");

    await openDocument(page);
    await page
      .getByRole("button", { name: "Bill 1 unbilled rider" })
      .first()
      .click({ timeout: 30_000 });
    composer = page.getByTestId("composer-riders");
    await expect(composer).toBeVisible({ timeout: 30_000 });
    await expect(composer).toContainText("cost $380.00");
    await shot(page, testInfo, "15-composer-rider-at-cost");
    await page.getByRole("button", { name: "Draft the invoice" }).click();
    await expect
      .poll(
        () =>
          psqlScalar(`
SELECT li.amount_cents || '|' || (li.metadata->>'costCents')
FROM public.po_cost_lines c JOIN public.invoice_line_items li ON li.id = c.invoice_line_id
WHERE c.purchase_order_id = ${q(poId)}`),
        { timeout: 30_000 },
      )
      .toBe("38000|38000");

    // ── 9. The Pieces overview's head (US-21 T-31). ────────────────────────
    // The next-act reading this step once read was retired with the T-31
    // overview. Its head carries the acts: Work the pieces (this Document's
    // Build room), Add to the job, Release, Record a change.
    await openDocument(page);
    const head = page.locator('[data-region-head="ffe"]').first();
    await head.scrollIntoViewIfNeeded({ timeout: 30_000 });
    await expect(
      head.locator('[data-action-key="work-the-pieces"]'),
    ).toHaveAttribute("href", `/doc/${PROJECT_ID}/pieces?lens=rough`, {
      timeout: 30_000,
    });
    await expect(
      head.locator('[data-action-key="open-add-to-project"]'),
    ).toContainText("Add to the job");
    // Release is not asserted: with `delivery-procurement` on and a release
    // offered, it moves to the Delivery table head (`releaseInHead`).
    await expect(
      head.locator('[data-action-key="record-a-change-pieces-head"]'),
    ).toContainText("Record a change");
    await shot(page, testInfo, "16-pieces-overview-head");

    expect(failures, "edge-function / RPC failures seen by the pages").toEqual(
      [],
    );
  });
});
