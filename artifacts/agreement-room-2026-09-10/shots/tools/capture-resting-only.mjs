// Recapture "resting" at 1024 and 390 on a FRESH, never-edited proposal.
//
// The main capture.mjs run reuses one proposal across all three width
// sessions; by the time the 1024/390 sessions open the room, an earlier
// session's Review & send step has already called persist(), which
// projects the edited Services body into proposal_service_terms — so the
// next materialize_standard_parts (1024/390's fresh page load) rebuilds
// Services pre-filled with that edited text, not the pristine seed. This
// script seeds a brand-new proposal and takes ONLY the two "resting"
// screenshots, before touching anything else, so 1024/390 resting is
// truly first-open.
//
// Usage: PROPOSAL_ID=<uuid> node capture-resting-only.mjs

import path from "node:path";
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

async function captureAt(browser, width) {
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
  await signIn(page);
  await page.goto(`${BASE}/drafting/${PROPOSAL_ID}`, {
    waitUntil: "networkidle",
    timeout: 45_000,
  });
  const rail = page.getByRole("navigation", { name: "Agreement parts" });
  await rail
    .locator("li")
    .filter({ hasText: "Services" })
    .locator("button:not([aria-label])")
    .first()
    .waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(500);
  const file = path.join(OUT_DIR, `resting-${width}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(JSON.stringify({ file, width, ok: true }));
  await context.close();
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    await captureAt(browser, 1024);
    await captureAt(browser, 390);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("CAPTURE_FAILED:", err);
  process.exit(1);
});
