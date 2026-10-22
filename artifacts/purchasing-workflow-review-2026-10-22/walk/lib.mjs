import { chromium } from "@playwright/test";
export const BASE = "http://localhost:3400";
export const PROJECT = "50500000-0000-4000-8000-000000000002";
export const SCREENS = "/Users/kody/Code/patina-merged/artifacts/purchasing-workflow-review-2026-10-22/walk/screens";
export async function open(email = "us50-member@patina.dev", viewport = { width: 1440, height: 900 }) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  await page.addInitScript(() => { try { localStorage.setItem("help-system.welcome-shown.first-project-walkthrough", "1"); } catch {}
    const i = () => { const s = document.createElement("style"); s.textContent = ".tsqd-open-btn-container,.tsqd-main-panel{display:none!important}"; document.head?.appendChild(s); };
    document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", i) : i(); });
  await page.goto(BASE + "/auth/signin?callbackUrl=%2Fdesk", { waitUntil: "networkidle", timeout: 120000 });
  await page.getByRole("button", { name: /sign in with email|use email and password instead|use a password instead/i }).first().click({ timeout: 30000 });
  await page.getByLabel(/email/i).first().fill(email);
  await page.getByLabel(/password/i).first().fill("password123");
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL(/\/(desk|doc|unauthorized)/, { timeout: 120000 });
  return { browser, ctx, page };
}
export async function shot(page, name, full = true) { await page.screenshot({ path: `${SCREENS}/${name}.png`, fullPage: full }); console.log("shot", name); }
export async function dump(page, sel = "button, a, [role=button], h1, h2, h3") {
  const t = await page.$$eval(sel, els => els.filter(e => e.offsetParent !== null).map(e => (e.tagName + ":" + (e.getAttribute("aria-label") || e.innerText || "").trim().replace(/\s+/g, " ").slice(0, 70))).filter(x => x.length > 3));
  console.log([...new Set(t)].join("\n"));
}
export async function openLine(page, name) {
  await page.goto(`${BASE}/doc/${PROJECT}`, { waitUntil: "domcontentloaded" });
  const seam = page.getByRole("button", { name: /^Pieces \d+ lines?/i }).first();
  const ln = page.getByText(name, { exact: true }).first();
  await ln.or(seam).first().waitFor({ timeout: 90000 });
  if (!(await ln.isVisible())) await seam.click();
  await ln.click({ timeout: 30000 });
  await page.getByTestId("line-po-cell").waitFor({ timeout: 30000 });
  await page.waitForTimeout(1500);
}
export async function vshot(page, name, locator) { if (locator) await locator.first().scrollIntoViewIfNeeded().catch(()=>{}); await page.waitForTimeout(500); await shot(page, name, false); }
export async function txt(loc) { return (await loc.first().innerText().catch(()=>"(none)")).replace(/\n+/g," | "); }
