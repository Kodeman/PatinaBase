// Supplementary capture: the "Review & send" sheet at 1024 and 390.
//
// RoomShell hides its action slot below 1180px
// (room-shell.tsx:155 `hidden min-[1180px]:block`), so "Review & send" has
// no on-page trigger at 1024/390 — there is no UI path to open the sheet
// starting from those widths. This opens it at 1440 (where the trigger is
// visible) and then resizes the SAME page down to 1024 and 390, capturing
// the sheet's own responsive reflow. This is a different mechanism than the
// other five situations (which are triggered natively at each width) —
// noted in shots/README.md.
//
// Usage: PROPOSAL_ID=<uuid> node capture-send-sheet-resize.mjs

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
const BASE = "http://localhost:3000";
const WELCOME_SHOWN_KEY = "help-system.welcome-shown.first-project-walkthrough";

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

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
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

  await signIn(page);
  await page.goto(`${BASE}/drafting/${PROPOSAL_ID}`, {
    waitUntil: "networkidle",
    timeout: 45_000,
  });

  const rail = page.getByRole("navigation", { name: "Agreement parts" });
  function railRow(title) {
    return rail
      .locator("li")
      .filter({ hasText: title })
      .locator("button:not([aria-label])")
      .first();
  }
  await railRow("Services").waitFor({ state: "visible", timeout: 30_000 });

  const reviewBtn = page.getByRole("button", { name: /review.*send/i }).first();
  await reviewBtn.click();
  await page.waitForTimeout(500);

  for (const width of [1024, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(400);
    const file = path.join(OUT_DIR, `review-and-send-sheet-${width}.png`);
    await page.screenshot({ path: file, fullPage: true });
    console.log(JSON.stringify({ file, width, ok: true }));
  }

  await browser.close();
}

main().catch((err) => {
  console.error("CAPTURE_FAILED:", err);
  process.exit(1);
});
