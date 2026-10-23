// SQ-1801 re-walk helpers. Playwright is resolved by absolute path (the walk worktree has no node_modules).
import { createRequire } from "node:module";
const require = createRequire("/Users/kody/Code/patina-merged/apps/designer-portal/package.json");
const { chromium } = require("@playwright/test");
export const BASE = "http://localhost:3400";
export const PROJECT = "50500000-0000-4000-8000-000000000002";
export const SCREENS = "/Users/kody/.claude/sidequest/projects/patina-merged-5f06cee3/verification/SQ-1801";
export const VP = { 1440: { width: 1440, height: 900 }, 390: { width: 390, height: 844 } };
export async function open(email = "us50-member@patina.dev", w = 1440) {
  const browser = await chromium.launch({ channel: "chromium" });
  const ctx = await browser.newContext({ viewport: VP[w] });
  const page = await ctx.newPage();
  const errs = [];
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 200)); });
  page.on("pageerror", (e) => errs.push("pageerror " + String(e).slice(0, 200)));
  page.errs = errs;
  await page.addInitScript(() => { try { localStorage.setItem("help-system.welcome-shown.first-project-walkthrough", "1"); } catch {}
    const i = () => { const s = document.createElement("style"); s.textContent = ".tsqd-open-btn-container,.tsqd-main-panel{display:none!important}"; document.head?.appendChild(s); };
    document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", i) : i(); });
  await page.goto(BASE + "/auth/signin?callbackUrl=%2Fdesk", { waitUntil: "networkidle", timeout: 120000 });
  await page.getByRole("button", { name: /sign in with email|use email and password instead|use a password instead/i }).first().click({ timeout: 30000 });
  await page.getByLabel(/email/i).first().fill(email);
  await page.getByLabel(/password/i).first().fill("password123");
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL(/\/(desk|doc|unauthorized)/, { timeout: 120000 });
  const pdf = await page.evaluate(() => navigator.pdfViewerEnabled);
  console.log("pdfViewerEnabled", pdf);
  return { browser, ctx, page };
}
export async function shot(page, name, full = false) { await page.waitForTimeout(400); await page.screenshot({ path: `${SCREENS}/${name}.png`, fullPage: full }); console.log("shot", name); }
export async function txt(loc) { return (await loc.first().innerText().catch(() => "(none)")).replace(/\n+/g, " | "); }
export async function body(page, n = 1500) { return (await page.innerText("body")).replace(/\n+/g, " | ").slice(0, n); }
export async function dump(page, sel = "button, a, [role=button], h1, h2, h3") {
  const t = await page.$$eval(sel, els => els.filter(e => e.offsetParent !== null).map(e => (e.tagName + ":" + (e.getAttribute("aria-label") || e.innerText || "").trim().replace(/\s+/g, " ").slice(0, 80))).filter(x => x.length > 3));
  console.log([...new Set(t)].join("\n"));
}
export async function overflow(page) { return page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth })); }
export async function gotoPieces(page, w) {
  await page.goto(`${BASE}/doc/${PROJECT}`, { waitUntil: "domcontentloaded" });
  const seam = page.getByRole("button", { name: /Pieces & purchasing/i }).or(page.getByRole("link", { name: /Pieces & purchasing/i })).first();
  const contents = page.getByRole("button", { name: /Open project contents/i }).first();
  await seam.or(contents).first().waitFor({ timeout: 90000 });
  if (w === 1440) await seam.click({ timeout: 30000 }).catch(() => console.log("pieces click failed"));
  else {
    await contents.click();
    await page.waitForTimeout(800);
    await page.getByRole("dialog").getByRole("button", { name: /Pieces & purchasing/i }).first().click({ timeout: 30000 });
  }
  await page.waitForTimeout(3000);
}
export async function openLine(page, name, w = 1440) {
  await gotoPieces(page, w);
  const ln = page.getByRole("button", { name: new RegExp(name.replace(/[()]/g, "\\$&")) }).first();
  await ln.waitFor({ timeout: 60000 });
  await ln.click({ timeout: 30000 });
  await page.getByTestId("line-po-cell").waitFor({ timeout: 30000 });
  await page.waitForTimeout(1500);
}
