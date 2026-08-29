#!/usr/bin/env node
// Shoots mock/final/index.html (The Smart Lens) and prints the probes the
// gates ask for: external requests, box-shadow census, page errors, file size.
//
// Chromium needs a real mach port, so this one command runs outside the
// sandbox. Shots land in mock/final/shots/.

import { chromium } from "@playwright/test";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const here = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.join(here, "index.html");
const page_url = "file://" + indexPath;
const outDir = path.join(here, "shots");
fs.mkdirSync(outDir, { recursive: true });

// 1560 x 1060 holds the 1440 x 900 frame plus the dev bar at scale 1, so every
// shot is 1:1 with the drawn pixels.
const VIEWPORT = { width: 1560, height: 1060 };

const external = [];
const pageErrors = []; // console errors + unhandled rejections

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
const page = await ctx.newPage();

page.on("request", (r) => {
  const u = r.url();
  if (!u.startsWith("file://") && !u.startsWith("data:") && !u.startsWith("about:")) external.push(u);
});
page.on("console", (msg) => {
  if (msg.type() === "error") pageErrors.push("console.error: " + msg.text());
});
page.on("pageerror", (err) => {
  pageErrors.push("pageerror: " + String(err && err.message ? err.message : err));
});

await page.goto(page_url, { waitUntil: "load" });

// ── the deterministic wait, run before every capture ───────────────────────
async function settleAndShoot(name) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => window.__mockReady === true);
  await page.evaluate(() => window.__lensSettled());
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(outDir, name) });
  console.log("shot  " + name);
}

async function click(selector) {
  await page.locator(selector).click();
}

const shotsWritten = [];
function record(name) {
  shotsWritten.push(name);
}

// ── 1. rest ─────────────────────────────────────────────────────────────
await click('.devbtn[data-go="rest"]');
await settleAndShoot("rest.png");
record("rest.png");

// ── 2. condensed (#frame-1440 at scroll 400) ───────────────────────────
await click('.devbtn[data-go="condensed"]');
await settleAndShoot("condensed.png");
record("condensed.png");

// ── 3. region-in-focus (FF&E at full) ──────────────────────────────────
await click('.devbtn[data-go="rest"]');
await page.waitForTimeout(200);
await click('.devbtn[data-go="ffe"]');
await settleAndShoot("region-in-focus.png");
record("region-in-focus.png");

// ── 4. foot (#frame-1440 scrolled to its end) ──────────────────────────
await click('.devbtn[data-go="rest"]');
await page.waitForTimeout(200);
await page.evaluate(() => {
  const el = document.getElementById("frame-1440");
  el.scrollTop = el.scrollHeight - el.clientHeight;
  el.dispatchEvent(new Event("scroll"));
});
await page.waitForTimeout(100);
await settleAndShoot("foot.png");
record("foot.png");

// ── 5. 1280 ─────────────────────────────────────────────────────────────
await click('.devbtn[data-go="rest"]');
await page.waitForTimeout(200);
await click('.devbtn[data-go="w1280"]');
await settleAndShoot("1280.png");
record("1280.png");

// ── 6. 390 ──────────────────────────────────────────────────────────────
await click('.devbtn[data-go="rest"]');
await page.waitForTimeout(200);
await click('.devbtn[data-go="w390"]');
await settleAndShoot("390.png");
record("390.png");

// ── 7. reduced (data-motion="reduced") ─────────────────────────────────
await click('.devbtn[data-go="rest"]');
await page.waitForTimeout(200);
await click('.devbtn[data-go="reduced"]');
await settleAndShoot("reduced.png");
record("reduced.png");

// ── 8. slow-mid-transition (data-motion="slow", --motion-scale 4,
//      captured mid-transition so the mechanic is visible standing still) ──
await click('.devbtn[data-go="rest"]');
await page.waitForTimeout(200);
await click('.devbtn[data-go="slow"]');
await page.waitForTimeout(100);
// trigger the condensed-scroll transition -- the header collapse and the
// region density change both run CSS transitions scaled by --motion-scale:4
// (200-300ms base -> 800-1200ms), so a mid-flight screenshot 300ms in shows
// the mechanic actually interpolating, not the settled end state.
await click('.devbtn[data-go="condensed"]');
await page.waitForTimeout(300);
await page.screenshot({ path: path.join(outDir, "slow-mid-transition.png") });
console.log("shot  slow-mid-transition.png");
record("slow-mid-transition.png");

// reset motion + scroll before the shadow census so it reflects rest-state CSS
await click('.devbtn[data-go="rest"]');
await page.waitForTimeout(200);

// ── box-shadow census, WITH the ledger sheet open (elevation site 2 of 3) ──
await click('[data-open-sheet="sheet-standing-1440"]');
await page.waitForTimeout(600);

const shadowCensus = await page.evaluate(() => {
  const byClass = new Map();
  let dropShadowCount = 0;
  for (const el of document.querySelectorAll("*")) {
    if (!el.getClientRects().length) continue;
    const cs = getComputedStyle(el);
    if (cs.boxShadow && cs.boxShadow !== "none") {
      const cls = el.className && el.className.toString ? el.className.toString() : String(el.className);
      const key = el.tagName.toLowerCase() + (cls ? "." + cls.trim().replace(/\s+/g, ".") : "");
      const entry = byClass.get(key) || { count: 0, value: cs.boxShadow };
      entry.count += 1;
      byClass.set(key, entry);
    }
    if (cs.filter && cs.filter.indexOf("drop-shadow") !== -1) dropShadowCount += 1;
  }
  return { byClass: [...byClass.entries()], dropShadowCount };
});

await page.keyboard.press("Escape");
await page.waitForTimeout(300);
await click('.devbtn[data-go="rest"]');
await page.waitForTimeout(200);

await ctx.close();
await browser.close();

const bytes = fs.statSync(indexPath).size;

console.log("");
console.log("EXTERNAL REQUESTS: " + external.length);
if (external.length) external.forEach((u) => console.log("  " + u));
console.log("");
console.log("BOX-SHADOW CENSUS (drop-shadow filter count: " + shadowCensus.dropShadowCount + ", expected 0)");
for (const [cls, entry] of shadowCensus.byClass) {
  console.log("  " + cls + "  x" + entry.count + "  " + entry.value);
}
console.log("");
console.log("PAGE ERRORS: " + pageErrors.length);
pageErrors.forEach((e) => console.log("  " + e));
console.log("");
console.log("index.html bytes: " + bytes);
console.log("");
console.log("shots written: " + shotsWritten.join(", "));
