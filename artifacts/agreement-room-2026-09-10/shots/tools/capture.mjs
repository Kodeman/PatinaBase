// Current-state capture for the Agreement room (/drafting/<proposalId>).
// P0 of the "Agreement Room, Reconsidered" design-review program.
//
// Usage:
//   PROPOSAL_ID=<uuid> node capture.mjs
//
// Requires: designer portal running (production build) on http://localhost:3000
// Requires: playwright resolvable from the repo's pnpm store.

import path from "node:path";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(
  require.resolve("playwright", {
    paths: ["/Users/kody/Code/patina-merged/node_modules/.pnpm/playwright@1.58.2/node_modules"],
  }),
);

const PROPOSAL_ID = process.env.PROPOSAL_ID;
if (!PROPOSAL_ID) {
  console.error("PROPOSAL_ID env var required");
  process.exit(1);
}

const OUT_DIR = "/Users/kody/Code/patina-merged/artifacts/agreement-room-2026-09-10/shots/current";
fs.mkdirSync(OUT_DIR, { recursive: true });

const BASE = "http://localhost:3000";
const WIDTHS = [1440, 1024, 390];
const WELCOME_SHOWN_KEY = "help-system.welcome-shown.first-project-walkthrough";

const log = [];
function record(entry) {
  log.push(entry);
  console.log(JSON.stringify(entry));
}

async function signIn(page) {
  await page.goto(`${BASE}/auth/signin?callbackUrl=%2Fdesk`, {
    timeout: 30_000,
    waitUntil: "networkidle",
  });
  const disclosure = page.getByRole("button", {
    name: /sign in with email|use email and password instead/i,
  });
  await disclosure.first().waitFor({ state: "visible", timeout: 15_000 });
  await disclosure.first().click();

  const emailInput = page.getByLabel(/email/i).first();
  await emailInput.waitFor({ state: "visible", timeout: 10_000 });
  await emailInput.fill("designer@patina.dev");

  const passwordInput = page.getByLabel(/password/i).first();
  await passwordInput.fill("password123");

  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL(
    /\/(desk|doc|people|library|rooms|room|drafting|compose|preferences|unauthorized)/,
    { timeout: 60_000 },
  );
}

async function shot(page, name, width) {
  const file = path.join(OUT_DIR, `${name}-${width}.png`);
  await page.screenshot({ path: file, fullPage: true });
  record({ file, width, ok: true });
  return file;
}

async function runForWidth(browser, width) {
  const context = await browser.newContext({
    viewport: { width, height: 900 },
    deviceScaleFactor: 2,
  });
  await context.addInitScript((key) => {
    try {
      window.localStorage.setItem(key, "1");
    } catch {
      /* ignore */
    }
  }, WELCOME_SHOWN_KEY);

  const page = await context.newPage();

  try {
    await signIn(page);
  } catch (err) {
    record({ width, step: "signin", ok: false, error: String(err) });
    await context.close();
    return;
  }

  try {
    await page.goto(`${BASE}/drafting/${PROPOSAL_ID}`, {
      waitUntil: "networkidle",
      timeout: 45_000,
    });
  } catch (err) {
    record({ width, step: "goto-drafting", ok: false, error: String(err) });
  }

  // Wait for the nine standard parts to materialize (rail shows "Services"
  // and "Terms" among others).
  const rail = page.getByRole("navigation", { name: "Agreement parts" });
  // parts-rail.tsx renders three buttons per row: "Reorder <title>" (drag
  // handle, aria-label), the select button (NO aria-label — its accessible
  // name is its own text content), and "Part options for <title>"
  // (aria-label). All three substring-match the title, so selecting by
  // getByRole(name) alone is ambiguous — filter on the un-labelled button.
  function railRow(title) {
    return rail
      .locator("li")
      .filter({ hasText: title })
      .locator("button:not([aria-label])")
      .first();
  }
  try {
    await railRow("Services").waitFor({ state: "visible", timeout: 30_000 });
  } catch (err) {
    record({ width, step: "wait-for-rail", ok: false, error: String(err) });
  }

  // Situation 1: resting.
  try {
    await page.waitForTimeout(500);
    await shot(page, "resting", width);
  } catch (err) {
    record({ width, step: "resting", ok: false, error: String(err) });
  }

  // Situation 2: a clause part (Services) mid-edit.
  try {
    await railRow("Services").click();
    await page.waitForTimeout(300);
    const body = page.getByLabel("Body").or(page.locator("textarea")).first();
    await body.waitFor({ state: "visible", timeout: 10_000 });
    await body.click();
    await body.fill(
      "Middle West Studio will provide interior design services for the Okonkwo house, including concept development, space planning, and specification of finishes, fixtures, and furnishings across the principal living areas.",
    );
    await page.waitForTimeout(300);
    await shot(page, "clause-editing", width);
  } catch (err) {
    record({ width, step: "clause-editing", ok: false, error: String(err) });
  }

  // Situation 3: a money part (Retainer) selected, fee-floor blocker visible.
  try {
    await railRow("Retainer").click();
    await page.waitForTimeout(300);
    await shot(page, "money-part-fee-floor", width);
  } catch (err) {
    record({ width, step: "money-part-fee-floor", ok: false, error: String(err) });
  }

  // Situation 4: "Preview client copy" sheet open.
  try {
    const previewBtn = page.getByRole("button", { name: "Preview client copy" });
    await previewBtn.click();
    await page.waitForTimeout(500);
    await shot(page, "preview-sheet", width);
    // Close via Escape (doc-sheet.tsx:299-306) — clicking the close button
    // by role/name is ambiguous: both the real close control (aria-label
    // "Put back · Esc") and the full-screen backdrop (aria-label "Close
    // sheet backdrop") substring-match "close", and the backdrop's centre
    // point sits BEHIND the dialog panel, so a click there times out
    // intercepted. Escape is unambiguous and doc-sheet.tsx listens for it
    // whenever this panel is the top modal.
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  } catch (err) {
    record({ width, step: "preview-sheet", ok: false, error: String(err) });
  }

  // Situation 5: "Review & send" sheet open.
  try {
    const reviewBtn = page.getByRole("button", { name: /review.*send/i }).first();
    await reviewBtn.click();
    await page.waitForTimeout(500);
    await shot(page, "review-and-send-sheet", width);
    // Same reasoning as the preview sheet above: Escape, not a role/name
    // click, to sidestep the backdrop-vs-real-close-control ambiguity.
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  } catch (err) {
    record({ width, step: "review-and-send-sheet", ok: false, error: String(err) });
  }

  // Situation 6: LAST — "Return to the seven facets" (discards parts).
  try {
    const returnBtn = page.getByRole("button", { name: "Return to the seven facets" });
    await returnBtn.click();
    await page.waitForTimeout(1000);
    await shot(page, "seven-facets-after-return", width);
  } catch (err) {
    record({ width, step: "seven-facets-after-return", ok: false, error: String(err) });
  }

  await context.close();
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of WIDTHS) {
      await runForWidth(browser, width);
    }
  } finally {
    await browser.close();
  }
  fs.writeFileSync(
    path.join(OUT_DIR, "..", "capture-log.json"),
    JSON.stringify(log, null, 2),
  );
}

main().catch((err) => {
  console.error("CAPTURE_FAILED:", err);
  process.exit(1);
});
