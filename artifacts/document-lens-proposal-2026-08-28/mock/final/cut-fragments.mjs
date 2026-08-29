#!/usr/bin/env node
// FC — the fragment cutter. Drives the fixed mock/final/index.html with
// Playwright and writes DOM SUBTREES (not screenshots) of twelve named
// states into mock/fragments/*.html for the deck build to inline.
//
// Chromium needs a real mach port, so this runs outside the sandbox.

import { chromium } from "@playwright/test";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const here = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.join(here, "index.html");
const page_url = "file://" + indexPath;
const FRAGMENTS = path.resolve(here, "..", "fragments");
fs.mkdirSync(FRAGMENTS, { recursive: true });

const VIEWPORT = { width: 1560, height: 1060 };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.error("PAGEERROR", e));
page.on("console", (m) => { if (m.type() === "error") console.error("CONSOLE ERROR", m.text()); });

await page.goto(page_url, { waitUntil: "load" });

async function settle() {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => window.__mockReady === true);
  await page.evaluate(() => window.__lensSettled());
  await page.waitForTimeout(300);
}

async function click(selector) {
  await page.locator(selector).click();
}

async function goRest() {
  await click('.devbtn[data-go="rest"]');
  await settle();
}

// ── CSS subsetting: walk the live stylesheets, keep only rules that match
// something inside the given root selector's subtree. @media/@supports
// wrappers are unwrapped (the fragment is a frozen, static snapshot — a
// reduced-motion capture wants its media-gated rules applied unconditionally,
// not re-gated); @keyframes/@font-face are dropped (fragments hold no
// animation and fonts are the deck's own).
async function collectScopedCSS(rootSelector, extraExclude) {
  return page.evaluate(({ rootSelector, extraExclude }) => {
    const root = document.querySelector(rootSelector);
    if (!root) return "";
    const els = [root, ...root.querySelectorAll("*")];
    const seenText = new Set();
    const out = [];

    function stripPseudo(sel) {
      return sel
        .replace(/::?(before|after|hover|focus-visible|focus-within|focus|active|placeholder|marker|selection|first-line|first-letter)\b(\([^)]*\))?/g, "")
        .trim();
    }

    function anyMatch(sel) {
      const s = stripPseudo(sel) || "*";
      try {
        for (const el of els) {
          if (el.nodeType === 1 && el.matches(s)) return true;
        }
      } catch (e) { /* invalid post-strip selector — skip */ }
      return false;
    }

    function walk(rule) {
      if (rule.type === CSSRule.STYLE_RULE) {
        const parts = rule.selectorText.split(",").map((s) => s.trim());
        const matched = parts.some(anyMatch);
        if (matched && !seenText.has(rule.cssText)) {
          seenText.add(rule.cssText);
          out.push(rule.cssText);
        }
      } else if (rule.type === CSSRule.MEDIA_RULE || rule.type === CSSRule.SUPPORTS_RULE) {
        for (const inner of rule.cssRules) walk(inner);
      }
      // KEYFRAMES_RULE, FONT_FACE_RULE, etc: skipped by design
    }

    for (const sheet of document.styleSheets) {
      let rules;
      try { rules = sheet.cssRules; } catch (e) { continue; }
      for (const r of rules) walk(r);
    }
    return out.join("\n");
  }, { rootSelector, extraExclude: extraExclude || [] });
}

// Strip the dev bar and any element carrying data-devonly from a cloned
// outerHTML string is unnecessary here because we always root the extraction
// at a subtree that never contains the dev bar (#stage's own children
// #frame-* and their descendants never include .devbar).
async function outerHTML(selector) {
  return page.locator(selector).evaluate((el) => el.outerHTML);
}

// A scrolled frame's outerHTML alone lies: `position:sticky` and native
// scrollTop are runtime facts, not DOM/CSS facts, so a static subtree dumped
// straight out of a scrolled frame renders as if scrollTop were 0 (sticky
// elements just sit in their normal flow slot with nothing to stick past).
// This reconstructs the correct crop by hand: read the sentinel/band's real
// geometry, delete the sentinel (it has scrolled fully out of frame), un-stick
// the band (it is now the first, pinned-looking child), and translateY the
// region stack that follows by (scrollTop - sentinelHeight) so the content
// that's actually inside the viewport at that scroll offset is what shows.
async function scrolledPaperHTML(frameSel, paperMeasureSel) {
  return page.evaluate(({ frameSel, paperMeasureSel }) => {
    const frame = document.querySelector(frameSel);
    const pm = document.querySelector(paperMeasureSel);
    const scrollTop = frame.scrollTop;
    const sentinel = pm.querySelector(".lens-sentinel");
    const band = pm.querySelector(".lens-band");
    const sentinelH = sentinel ? sentinel.offsetHeight : 0;
    const bandH = band ? band.offsetHeight : 0;
    const clone = pm.cloneNode(true);
    const cSentinel = clone.querySelector(".lens-sentinel");
    const cBand = clone.querySelector(".lens-band");
    if (cSentinel) cSentinel.remove();
    if (cBand) cBand.style.position = "static"; // was sticky; now the true first child
    const shift = Math.max(0, scrollTop - sentinelH);
    // Wrap every sibling after the band in a translated div.
    const wrap = document.createElement("div");
    wrap.setAttribute("style", `transform:translateY(-${shift}px)`);
    let node = cBand ? cBand.nextSibling : clone.firstChild;
    const toMove = [];
    while (node) { toMove.push(node); node = node.nextSibling; }
    toMove.forEach((n) => wrap.appendChild(n));
    clone.appendChild(wrap);
    return { html: clone.outerHTML, scrollTop, sentinelH, bandH, shift };
  }, { frameSel, paperMeasureSel });
}

// Same reconstruction, but mutates the LIVE page's paper-measure in place
// (destructive — call page.reload() afterward) so #frame-1440 .doc-shell's
// outerHTML picks up the crop, keeping the rail/margin siblings untouched
// and real.
async function applyScrollCropInPlace(frameSel, paperMeasureSel) {
  return page.evaluate(({ frameSel, paperMeasureSel }) => {
    const frame = document.querySelector(frameSel);
    const pm = document.querySelector(paperMeasureSel);
    const scrollTop = frame.scrollTop;
    const sentinel = pm.querySelector(".lens-sentinel");
    const band = pm.querySelector(".lens-band");
    const sentinelH = sentinel ? sentinel.offsetHeight : 0;
    if (sentinel) sentinel.remove();
    if (band) band.style.position = "static";
    const shift = Math.max(0, scrollTop - sentinelH);
    // The clip box establishes its own top edge right after the band (normal
    // flow) and overflow:hidden's it, so the translated content beneath can
    // never paint back up over the band regardless of DOM paint order —
    // band's own z-index is inert once it's position:static.
    const clip = document.createElement("div");
    clip.setAttribute("style", "overflow:hidden;position:relative;");
    const wrap = document.createElement("div");
    wrap.setAttribute("style", `transform:translateY(-${shift}px)`);
    let node = band ? band.nextSibling : pm.firstChild;
    const toMove = [];
    while (node) { toMove.push(node); node = node.nextSibling; }
    toMove.forEach((n) => wrap.appendChild(n));
    clip.appendChild(wrap);
    pm.appendChild(clip);
    return { scrollTop, sentinelH, shift };
  }, { frameSel, paperMeasureSel });
}

function escAsciiCheck(name, html) {
  const nonAscii = html.match(/[^\x00-\x7F]/g);
  if (nonAscii) {
    console.warn(`  ! ${name}: ${nonAscii.length} non-ascii chars survived (will be entity-folded at deck build)`);
  }
}

function writeFragment(name, { width, height, css, bodyHTML, caption }) {
  const cls = "frag-" + name;
  const out = [
    `<section class="mock-frame patina-mock" data-screen="${name}" data-width="${width}">`,
    `<div style="width:${width}px;height:${height}px" class="${cls}">`,
    `<style>`,
    `.${cls}{overflow:hidden;position:relative;background:var(--doc-paper,#FCFAF6);}`,
    css,
    `</style>`,
    bodyHTML,
    `</div>`,
    `<figcaption>${caption}</figcaption>`,
    `</section>`,
  ].join("\n");
  const file = path.join(FRAGMENTS, name + ".html");
  fs.writeFileSync(file, out, "utf8");
  const bytes = Buffer.byteLength(out, "utf8");
  console.log(`wrote  ${name}.html  ${width}x${height}  ${bytes}b`);
  escAsciiCheck(name, out);
  return { name, width, height, bytes };
}

const written = [];

// ─────────────────────────────────────────────────────────────────────────
// 1. lens-s0-1440 — the proposed document at scroll 0, lens open.
//    Cropped to the deck's 1300x980 column: the frame's doc-shell (rail |
//    paper | margin), no dev-bar, no frame-caption.
// ─────────────────────────────────────────────────────────────────────────
{
  await goRest();
  const css = await collectScopedCSS("#frame-1440 .doc-shell");
  const html = await outerHTML("#frame-1440 .doc-shell");
  written.push(writeFragment("lens-s0-1440", {
    width: 1300, height: 980, css, bodyHTML: html,
    caption: "The proposed document at scroll 0, lens open &mdash; rail, paper, margin, cropped to the deck column from the live 1440&times;900 frame.",
  }));
}

// ─────────────────────────────────────────────────────────────────────────
// 2. lens-s1-1440 — the seam / condensed state, scrolled.
// ─────────────────────────────────────────────────────────────────────────
{
  await click('.devbtn[data-go="condensed"]');
  await settle();
  const crop = await applyScrollCropInPlace("#frame-1440", "#frame-1440 .paper-measure");
  const css = await collectScopedCSS("#frame-1440 .doc-shell");
  const html = await outerHTML("#frame-1440 .doc-shell");
  written.push(writeFragment("lens-s1-1440", {
    width: 1300, height: 980, css, bodyHTML: html,
    caption: "The seam &mdash; scrolled to 400px, the lens line pinned closed at 56px, the rail's ladder distributing.",
  }));
  console.log("  crop lens-s1-1440:", crop);
  await page.reload({ waitUntil: "load" });
  await settle();
}

// ─────────────────────────────────────────────────────────────────────────
// 3. lens-s2-1440 — FF&E at full, neighbours yielded.
// ─────────────────────────────────────────────────────────────────────────
{
  await goRest();
  await click('.devbtn[data-go="ffe"]');
  await settle();
  const crop = await applyScrollCropInPlace("#frame-1440", "#frame-1440 .paper-measure");
  const css = await collectScopedCSS("#frame-1440 .doc-shell");
  const html = await outerHTML("#frame-1440 .doc-shell");
  written.push(writeFragment("lens-s2-1440", {
    width: 1300, height: 980, css, bodyHTML: html,
    caption: "FF&amp;E at <code>full</code>, its neighbours yielded to their condensed line &mdash; exactly one region carries the whole ledger.",
  }));
  console.log("  crop lens-s2-1440:", crop);
  await page.reload({ waitUntil: "load" });
  await settle();
}

// ─────────────────────────────────────────────────────────────────────────
// 6/7. spine-after-360 / header-after-720 — measured crops of the live rail
//      and the live paper's header organ, at rest.
// ─────────────────────────────────────────────────────────────────────────
{
  await goRest();
  const railW = await page.locator("#rail-1440").evaluate((el) => Math.round(el.getBoundingClientRect().width));
  const railCss = await collectScopedCSS("#rail-1440");
  const railHtml = await outerHTML("#rail-1440");
  written.push(writeFragment("spine-after-360", {
    width: railW, height: 360, css: railCss, bodyHTML: railHtml,
    caption: `The rail as the proposal makes it &mdash; ${railW}px, put-down, the seven-mark head, the running ladder. Top 360px of the live rail at rest.`,
  }));

  const paperW = await page.locator("#frame-1440 .paper-measure").evaluate((el) => Math.round(el.getBoundingClientRect().width));
  const headerCss = await collectScopedCSS("#frame-1440 .sentinel-lens-wrap, #frame-1440 #sentinel-1440, #frame-1440 .lens-band");
  // header-after: the sentinel (letterhead + ticket organ) plus the pinned
  // band plus whatever region content follows, cropped to 720px so the
  // "peace" reads against the same 720px budget as header-before.
  const headerRootSel = "#sentinel-1440";
  const sentinelParent = await page.evaluate((sel) => {
    const s = document.querySelector(sel);
    return s ? s.parentElement.className : null;
  }, headerRootSel);
  // Build the crop from the paper column: sentinel + lens band + first region.
  const paperColSel = "#frame-1440 .paper-measure";
  const css2 = await collectScopedCSS(paperColSel);
  const html2 = await outerHTML(paperColSel);
  written.push(writeFragment("header-after-720", {
    width: paperW, height: 720, css: css2, bodyHTML: html2,
    caption: `The header organ as the proposal makes it &mdash; ${paperW}px paper column, top 720px at rest: the letterhead, the 56/319px lens line, and the client-approvals head already in view.`,
  }));
}

// ─────────────────────────────────────────────────────────────────────────
// 11. lens-390 — the mobile form.
// ─────────────────────────────────────────────────────────────────────────
{
  await click('.devbtn[data-go="rest"]');
  await page.waitForTimeout(200);
  await click('.devbtn[data-go="w390"]');
  await settle();
  const css = await collectScopedCSS("#frame-390");
  const html = await outerHTML("#frame-390");
  written.push(writeFragment("lens-390", {
    width: 390, height: 844, css, bodyHTML: html,
    caption: "The mobile form, 390&times;844 &mdash; one column, the mobile bar in place of a rail.",
  }));
}

// ─────────────────────────────────────────────────────────────────────────
// 12. reduced-1440 — the reduced-motion register at the condensed state.
// ─────────────────────────────────────────────────────────────────────────
{
  await click('.devbtn[data-go="rest"]');
  await page.waitForTimeout(200);
  await click('.devbtn[data-go="reduced"]');
  await click('.devbtn[data-go="condensed"]');
  await settle();
  const crop = await applyScrollCropInPlace("#frame-1440", "#frame-1440 .paper-measure");
  const css = await collectScopedCSS("#frame-1440 .doc-shell");
  let html = await outerHTML("#frame-1440 .doc-shell");
  // data-motion lives on #stage, an ancestor outside this subtree; carry it
  // forward explicitly so the fragment documents which register this is,
  // even though a static picture cannot show a removed transition.
  html = html.replace(/^<div class="doc-shell">/, '<div class="doc-shell" data-motion="reduced">');
  written.push(writeFragment("reduced-1440", {
    width: 1300, height: 980, css, bodyHTML: html,
    caption: "The reduced-motion register at the condensed state &mdash; identical marks, zero transitions, <code>data-motion=\"reduced\"</code> (set on the stage, carried here for the record; a still picture cannot show an absent transition, so this frame is pixel-identical to <code>lens-s1-1440</code> by design &mdash; L-1's reduced form is \"printed instantly in place, same words, same terracotta, no crossfade\").",
  }));
  console.log("  crop reduced-1440:", crop);
}

// reset before shutting down
await click('.devbtn[data-go="rest"]');
await page.waitForTimeout(100);

await ctx.close();
await browser.close();

console.log("");
console.log("cut " + written.length + " fragments from the live mockup:");
written.forEach((w) => console.log("  " + w.name + "  " + w.width + "x" + w.height + "  " + w.bytes + "b"));
