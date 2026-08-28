#!/usr/bin/env node
// Shoots mock/final/index.html and prints the probes the gates ask for.
//
// Run it from apps/designer-portal so `@playwright/test` resolves through the
// workspace's own node_modules (this folder has none of its own):
//
//   cd /Users/kody/Code/patina-merged/apps/designer-portal
//   node ../../artifacts/document-life-directions-2026-08-28/mock/final/shoot-final.mjs
//
// Chromium needs a real mach port, so this one command runs outside the
// sandbox. Shots land in mock/final/shots/.

import { chromium } from "@playwright/test";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const here = path.dirname(fileURLToPath(import.meta.url));
const page_url = "file://" + path.join(here, "index.html");
const outDir = path.join(here, "shots");
fs.mkdirSync(outDir, { recursive: true });

// 1560 x 1060 holds the 1440 x 900 frame plus the dev bar at scale 1, so every
// shot is 1:1 with the drawn pixels.
const VIEWPORT = { width: 1560, height: 1060 };

const external = [];

async function newPage(browser, opts = {}) {
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2, ...opts });
  const page = await ctx.newPage();
  page.on("request", (r) => {
    const u = r.url();
    if (!u.startsWith("file://") && !u.startsWith("data:") && !u.startsWith("about:")) external.push(u);
  });
  await page.goto(page_url, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => window.__mockReady === true);
  await page.waitForTimeout(700); // the settle stagger + the stamp wipe
  return { ctx, page };
}

const shadowCount = (page) =>
  page.evaluate(() => {
    let n = 0;
    for (const el of document.querySelectorAll("*")) {
      // only what is actually on screen: both drawers live in the DOM, one hidden
      if (!el.getClientRects().length) continue;
      if (getComputedStyle(el).boxShadow !== "none") n += 1;
    }
    return n;
  });

// the wash opens from the pointer: two moves so the hover state registers,
// then 300ms -- past the 260ms sweep -- before the shutter.
const hoverRow = async (page, selector) => {
  const box = await page.locator(selector).first().boundingBox();
  await page.mouse.move(box.x + box.width * 0.30, box.y + box.height / 2);
  await page.mouse.move(box.x + box.width * 0.32, box.y + box.height / 2 + 1);
  await page.waitForTimeout(300);
  return box;
};

const shot = async (page, name) => {
  await page.locator("#frame").screenshot({ path: path.join(outDir, name) });
  console.log("shot  " + name);
};

const browser = await chromium.launch();
const probe = {};

// ── the four lit states ───────────────────────────────────────────────────
{
  const { ctx, page } = await newPage(browser);

  probe.fonts = await page.evaluate(() =>
    [...new Set([...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family))].sort(),
  );
  // R10: 112 was the markup count across three screens, not a tab order. What
  // matters is what Tab can actually reach in the state being looked at.
  const reachable = () =>
    page.evaluate(
      () =>
        [...document.querySelectorAll("#frame button, #frame a[href], #frame input")].filter(
          (el) => el.getClientRects().length && !el.closest("[aria-hidden='true']"),
        ).length,
    );
  probe.markupButtons = await page.evaluate(
    () => document.querySelectorAll("#frame button, #frame a[href], #frame input").length,
  );
  probe.focusables_desk = await reachable();

  probe.shadows_desk = await shadowCount(page);
  await shot(page, "final-desk-1440.png");

  // R43: the studio contents live below the desk's fold, and the dotted leader
  // out to each SHEET / arrow tag is the device that makes them a contents
  // page rather than three lists. One shot so the leader can be seen.
  await page.evaluate(() => {
    const s = document.querySelector("#screen-desk .scroll");
    s.scrollTop = document.querySelector("#screen-desk .studio").offsetTop - 40;
  });
  await page.waitForTimeout(250);
  await shot(page, "final-desk-contents-1440.png");
  await page.evaluate(() => (document.querySelector("#screen-desk .scroll").scrollTop = 0));
  await page.waitForTimeout(200);

  // the hover wash on the roster -- the Vandersteen line, its Project pigment
  // at 8% over the cream, captured after the 260ms sweep has run out.
  await page.evaluate(() => {
    const s = document.querySelector("#screen-desk .scroll");
    s.scrollTop = document.querySelector("#screen-desk .mv-project").offsetTop - 300;
  });
  await page.waitForTimeout(250);
  await hoverRow(page, "#screen-desk .mv-project .job-line");
  probe.wash_desk = await page.evaluate(() => {
    const w = document.querySelector("#screen-desk .mv-project .job-line .row-wash");
    const c = getComputedStyle(w);
    return { bg: c.backgroundColor, clip: c.clipPath, dur: c.transitionDuration };
  });
  await shot(page, "final-desk-hover-1440.png");
  await page.mouse.move(4, 4);
  await page.waitForTimeout(300);
  await page.evaluate(() => (document.querySelector("#screen-desk .scroll").scrollTop = 0));
  await page.waitForTimeout(200);

  // desk → document, by the act the click map names
  await page.locator("#screen-desk .job-line button.job-name[data-open-doc]").click();
  await page.waitForTimeout(600);
  probe.shadows_doc = await shadowCount(page);
  probe.focusables_doc = await reachable();
  await page.evaluate(() => (document.getElementById("doc-col").scrollTop = 0));
  await shot(page, "final-document-1440.png");

  await page.evaluate(() => {
    const col = document.getElementById("doc-col");
    col.scrollTop = document.getElementById("fold-pieces").offsetTop - 24;
  });
  await page.waitForTimeout(250);
  await shot(page, "final-document-ffe-1440.png");

  // the same wash on an FF&E line -- the ordered dining set, clay at 8% over
  // the paper, with the 48px crop beside it
  await hoverRow(page, "#ffe-po");
  probe.wash_ffe = await page.evaluate(() => {
    const w = document.querySelector("#ffe-po .row-wash");
    const c = getComputedStyle(w);
    return { bg: c.backgroundColor, clip: c.clipPath, dur: c.transitionDuration };
  });
  await shot(page, "final-ffe-hover-1440.png");
  await page.mouse.move(4, 4);
  await page.waitForTimeout(300);

  // put down, then open the Orders ledger from the drawer
  // R11: the sheet's shadow count depends on where it was opened FROM -- the
  // document's two margin chips stay rendered under the scrim.
  await page.locator("#screen-doc .drawer [data-open-sheet]").click();
  await page.waitForTimeout(600);
  probe.shadows_sheet_from_doc = await shadowCount(page);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  await page.locator("[data-put-down]").click();
  await page.waitForTimeout(400);
  await page.locator("#screen-desk .drawer [data-open-sheet]").click();
  await page.waitForTimeout(600);
  probe.shadows_sheet = await shadowCount(page);
  probe.focusables_sheet = await reachable();
  await shot(page, "final-sheet-1440.png");

  probe.overflow = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll("#frame .scroll, #frame .doc-col, #frame .spine, #frame .margin, #frame .ledger-sheet")) {
      if (el.scrollWidth > el.clientWidth + 1) out.push(el.className + " " + el.scrollWidth + ">" + el.clientWidth);
    }
    const f = document.getElementById("frame");
    if (f.scrollWidth > f.clientWidth + 1) out.push("frame " + f.scrollWidth + ">" + f.clientWidth);
    return out;
  });

  await ctx.close();
}

// ── R31: the roster settles ONCE per page load ────────────────────────────
// `.screen { display: none }` cancels a running CSS animation and replays it
// when the element is shown again, so any class left on the lines re-settles
// sixteen rows on every return to the desk. Measured 50ms after each switch.
{
  const { ctx, page } = await newPage(browser);
  const running = () =>
    page.evaluate(() =>
      [...document.querySelectorAll(".job-line")]
        .flatMap((l) => l.getAnimations().map((a) => a.animationName || "transition"))
        .filter((n) => n === "settle").length,
    );
  probe.settle_boot_class = await page.evaluate(() => document.querySelectorAll(".job-line.settling").length);
  probe.settle_after_put_down = await (async () => {
    await page.locator("#screen-desk .job-line button.job-name[data-open-doc]").click();
    await page.waitForTimeout(500);
    await page.locator("[data-put-down]").click();
    await page.waitForTimeout(50);
    return running();
  })();
  probe.settle_after_sheet_close = await (async () => {
    await page.waitForTimeout(400);
    await page.locator('#screen-desk .drawer [data-open-sheet]').click();
    await page.waitForTimeout(400);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(50);
    return running();
  })();
  probe.settle_after_390_toggle = await (async () => {
    await page.waitForTimeout(400);
    await page.locator('.devbtn[data-go="m390"]').click();
    await page.waitForTimeout(400);
    await page.locator('.devbtn[data-go="desk"]').click();
    await page.waitForTimeout(50);
    return running();
  })();
  probe.settle_class_left = await page.evaluate(() => document.querySelectorAll(".job-line.settling").length);
  await ctx.close();
}

// ── 390 ───────────────────────────────────────────────────────────────────
{
  const { ctx, page } = await newPage(browser);
  await page.locator('.devbtn[data-go="m390"]').click();
  await page.waitForTimeout(600);
  await shot(page, "final-desk-390.png");
  probe.focusables_390 = await page.evaluate(
    () =>
      [...document.querySelectorAll("#frame button, #frame a[href], #frame input")].filter(
        (el) => el.getClientRects().length && !el.closest("[aria-hidden='true']"),
      ).length,
  );
  probe.overflow390 = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll("#frame .scroll")) {
      if (el.scrollWidth > el.clientWidth + 1) out.push(el.className + " " + el.scrollWidth + ">" + el.clientWidth);
    }
    return out;
  });
  await ctx.close();
}

// ── reduced motion ────────────────────────────────────────────────────────
{
  const { ctx, page } = await newPage(browser, { reducedMotion: "reduce" });
  await shot(page, "final-desk-1440-reduced.png");
  await ctx.close();
}

await browser.close();

console.log("");
console.log("fonts loaded          " + probe.fonts.join(", "));
console.log("box-shadow · desk     " + probe.shadows_desk + "  (expected 1 — the drawer)");
console.log("box-shadow · document " + probe.shadows_doc + "  (expected 3 — the drawer + 2 margin chips)");
console.log("box-shadow · sheet from the desk      " + probe.shadows_sheet + "  (expected 2 — the drawer + the ledger sheet)");
console.log("box-shadow · sheet from the document  " + probe.shadows_sheet_from_doc + "  (expected 4 — + the 2 margin chips under the scrim)");
console.log("external requests     " + (external.length ? external.join(", ") : "none"));
console.log("horizontal overflow   " + (probe.overflow.length ? probe.overflow.join(" | ") : "none"));
console.log("horizontal overflow @390  " + (probe.overflow390.length ? probe.overflow390.join(" | ") : "none"));
console.log("buttons in #frame markup (three screens, one of them hidden)  " + probe.markupButtons);
console.log("reachable · desk " + probe.focusables_desk + "  · document " + probe.focusables_doc + "  · Orders sheet " + probe.focusables_sheet + "  · 390 " + probe.focusables_390);
console.log("");
console.log("wash · roster (Vandersteen)  " + probe.wash_desk.bg + "  clip " + probe.wash_desk.clip + "  " + probe.wash_desk.dur);
console.log("wash · FF&E (dining set)     " + probe.wash_ffe.bg + "  clip " + probe.wash_ffe.clip + "  " + probe.wash_ffe.dur);
console.log("");
console.log("settle · lines carrying .settling on first paint       " + probe.settle_boot_class + "  (expected 16 — it settles once)");
console.log("settle animations RUNNING 50ms after PUT DOWN          " + probe.settle_after_put_down + "  (expected 0)");
console.log("settle animations RUNNING 50ms after the sheet closes  " + probe.settle_after_sheet_close + "  (expected 0)");
console.log("settle animations RUNNING 50ms after 390 -> desk       " + probe.settle_after_390_toggle + "  (expected 0)");
console.log("lines still carrying .settling at the end              " + probe.settle_class_left + "  (expected 0)");
