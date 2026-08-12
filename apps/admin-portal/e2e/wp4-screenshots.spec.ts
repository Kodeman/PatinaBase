/**
 * WP4 screenshot pass — Rail A's own operator surfaces (DECISIONS I124).
 *
 * The BOH fulfillment surfaces adopted the R7 grammar additively: a 12px
 * current-position stamp + next gate appended to the queue row's meta line,
 * and a collapsed "Lifecycle" disclosure on each Order Workbench PO line.
 * Shots land in docs/design/workflow-alignment/screenshots/wp4/.
 *
 * LOCAL STACK ONLY. Requires the sanctioned BOH band-coverage fixtures:
 *   psql "$SUPABASE_DB_URL" -f scripts/seed-fulfillment-fixtures.sql
 * which walks intake → split → transmitted → acknowledged → shipped →
 * delivered through the real 00353 RPCs (no side doors, spec §12).
 *
 * Not a gate: this spec produces artifacts.
 */
import { test, expect, type Page } from "@playwright/test";

const SHOT_DIR = "../../docs/design/workflow-alignment/screenshots/wp4";
const ADMIN_EMAIL = "admin@patina.dev";
const ADMIN_PASSWORD = "password123";

test.describe.configure({ mode: "serial" });
test.skip(({ browserName }) => browserName !== "chromium", "screenshot pass");

async function signInAsAdmin(page: Page) {
  await page.goto("/auth/signin");
  await page.waitForLoadState("domcontentloaded");
  await page
    .getByRole("button", {
      name: /sign in with email|use email and password instead/i,
    })
    .first()
    .click();
  // Two email inputs live on this pane after the disclosure opens: the
  // email-first one-time-code field, and the password panel's own. The panel's
  // is the LAST, and its password field is the signal that it has mounted.
  await page
    .locator('input[type="password"]')
    .first()
    .waitFor({ state: "visible", timeout: 15_000 });
  await page.locator('input[type="email"]').last().fill(ADMIN_EMAIL);
  await page.locator('input[type="password"]').first().fill(ADMIN_PASSWORD);
  await page
    .getByRole("button", { name: /^sign in$/i })
    .first()
    .click();
  await page.waitForURL((u) => !u.pathname.includes("/auth/signin"), {
    timeout: 30_000,
  });
}

test.beforeEach(async ({ page }) => {
  await signInAsAdmin(page);
});

test("the queue-row glance — position and next gate, appended", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/fulfillment");
  await expect(page.getByTestId("queue-bands")).toBeVisible({
    timeout: 30_000,
  });

  // The glance is additive: it never replaces the operational verb or the
  // derived_status word, and it renders nothing on the two overrides
  // (needs_mapping / exception) that are not chain states at all.
  const glance = page.getByTestId("lifecycle-glance");
  await expect(glance.first()).toBeVisible({ timeout: 15_000 });
  await expect(
    page.getByTestId("lifecycle-glance-next-gate").first(),
  ).toBeVisible();

  await page.screenshot({ path: `${SHOT_DIR}/boh-queue-desktop.png` });

  const bands = page.getByTestId("queue-bands");
  await bands.screenshot({ path: `${SHOT_DIR}/boh-queue-glance-rows.png` });
});

test("the line-detail trail — the Workbench PO line disclosure", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.goto("/fulfillment");
  await expect(page.getByTestId("queue-bands")).toBeVisible({
    timeout: 30_000,
  });

  // The in-transit fixture: its one line has walked the chain as far as
  // `shipped`, so the trail reads settled behind it and dashed ahead.
  await page
    .getByTestId("queue-row")
    .filter({ hasText: "Ashford" })
    .first()
    .click();
  const line = page.getByTestId("wb-po-line").first();
  await expect(line).toBeVisible({ timeout: 30_000 });

  // The disclosure is a SIBLING of the line row, not a descendant: it sits
  // outside the draggable row's ref so opening it can never read as a drag.
  const disclosure = page.getByTestId("wb-po-line-lifecycle").first();
  await disclosure.locator("summary").click();
  const trail = disclosure.locator("[data-trail-step]").first();
  await expect(trail).toBeVisible();

  // Top-align so the card clears any bar painted at the foot of the window.
  await disclosure.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await page
    .getByTestId("wb-po-card")
    .first()
    .screenshot({
      path: `${SHOT_DIR}/boh-line-detail-trail-desktop.png`,
    });
});
