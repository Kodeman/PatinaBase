#!/usr/bin/env node
// Simulates the Claude Artifact host: a blank page whose <body> has already
// finished loading, into which our file's content is inserted AFTER load —
// then its <script> blocks are re-executed the way a real host does (new
// script elements with the same text, appended — innerHTML-inserted <script>
// text never runs on its own).
//
// Run from mock/final (via the node_modules symlink to the designer-portal
// workspace) so `@playwright/test` resolves, and unsandboxed since Chromium
// needs a real mach port:
//
//   cd /Users/kody/Code/patina-merged/artifacts/document-lens-proposal-2026-08-28/mock/final
//   node host-sim.mjs
//
import { chromium } from "@playwright/test";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const here = path.dirname(fileURLToPath(import.meta.url));
const filePath = path.join(here, "index.html");
const outDir = path.join(here, "shots");
fs.mkdirSync(outDir, { recursive: true });

const html = fs.readFileSync(filePath, "utf8");

const HOST_SHELL =
  "<!doctype html><html><head><style>*,*::before,*::after{box-sizing:border-box}body{margin:0}</style></head><body></body></html>";

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1560, height: 1060 } });

  const consoleErrors = [];
  const pageErrors = [];
  const externalRequests = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => {
    pageErrors.push(err && err.stack ? err.stack : String(err));
  });
  page.on("request", (req) => {
    const u = req.url();
    if (!u.startsWith("about:") && !u.startsWith("data:")) externalRequests.push(u);
  });

  // 1. Blank host page, load it, wait for load.
  await page.setContent(HOST_SHELL, { waitUntil: "load" });

  // 2. AFTER load, insert our content into <body> via innerHTML-style insertion.
  //    This is the same call a host makes: insertAdjacentHTML parses markup
  //    and CSS but leaves any <script> text inert (never executed).
  const insertResult = await page.evaluate((fileHtml) => {
    document.body.insertAdjacentHTML("beforeend", fileHtml);
    // Report what's visible right after markup insertion, before any script
    // re-execution — this tells us whether static markup + CSS alone paints.
    // R-04: these selectors are THIS mockup's, not the Life Review's. The whole
    // point of the pre-script snapshot is C.1's static-first promise -- markup
    // plus CSS alone must paint the REST STATE -- so it asserts that promise
    // instead of reporting nulls for ids that live in another artifact.
    const stage = document.getElementById("stage");
    const frame = document.getElementById("frame-1440");
    const lens = document.getElementById("lens-1440");
    const regions = frame ? Array.from(frame.querySelectorAll(".region")) : [];
    const firstHead = frame ? frame.querySelector(".region .rh-name") : null;
    const density = regions.map((r) => r.getAttribute("data-region") + "=" + r.getAttribute("data-density"));
    const full = regions.filter((r) => r.getAttribute("data-density") === "full");
    const headY = firstHead && frame
      ? Math.round(firstHead.getBoundingClientRect().top - frame.getBoundingClientRect().top)
      : null;
    const out = {
      bodyChildCount: document.body.children.length,
      bodyChildTags: Array.from(document.body.children).map((c) => c.tagName),
      titleText: document.title,
      scriptTags: document.querySelectorAll("script").length,
      stageExists: !!stage,
      stageMotion: stage ? stage.getAttribute("data-motion") : null,
      frameExists: !!frame,
      frameCount: document.querySelectorAll(".frame").length,
      frameLensState: frame ? frame.getAttribute("data-lens-state") : null,
      frameReadingIndex: frame ? frame.getAttribute("data-reading-index") : null,
      frameComputedBg: frame ? getComputedStyle(frame).backgroundColor : null,
      lensExists: !!lens,
      lensOpen: lens ? lens.getAttribute("data-lens-open") : null,
      regionCount: regions.length,
      density: density.join(" "),
      exactlyOneFull: full.length === 1,
      firstFull: full.length ? full[0].getAttribute("data-region") : null,
      firstRegionHeadYInFrame: headY,
      ffeRows: frame ? frame.querySelectorAll(".ffe-row").length : 0,
      catalogCrops: frame ? frame.querySelectorAll(".thumb.is-catalog").length : 0,
    };
    // the static-first gate: with no script run at all, three frames stand, the
    // band is open, exactly one region is full, and the first region head is
    // where SC1 says it is.
    out.staticPaintOK = !!(
      out.stageExists && out.frameExists && out.frameCount === 3 && out.lensExists &&
      out.lensOpen === "true" && out.regionCount === 6 && out.exactlyOneFull &&
      out.firstFull === "approvals" && out.frameLensState === "rest" &&
      out.frameReadingIndex === "approvals" &&
      typeof headY === "number" && headY > 0 && headY <= 405
    );
    return out;
  }, html);

  // 2b. Screenshot BEFORE any script re-execution, to see whether static
  //     markup + CSS alone (i.e. if the host never ran our script at all)
  //     paints anything.
  await page.screenshot({ path: path.join(outDir, "host-sim-prescript.png") });

  // 3. Re-execute every <script> block the way a real host does: create new
  //    script elements with the same text content and append them (this DOES
  //    execute, unlike the inert innerHTML-inserted originals).
  const execResult = await page.evaluate(() => {
    const originals = Array.from(document.querySelectorAll("script"));
    const errors = [];
    for (const orig of originals) {
      try {
        const s = document.createElement("script");
        // Copy attributes (there are none of interest here — no src/type quirks).
        for (const attr of orig.attributes) s.setAttribute(attr.name, attr.value);
        s.textContent = orig.textContent;
        orig.parentNode.replaceChild(s, orig);
      } catch (e) {
        errors.push(String(e));
      }
    }
    return { reExecuted: originals.length, errors };
  });

  // Give any rAF/setTimeout-driven init a moment to settle.
  await page.waitForTimeout(400);

  const finalState = await page.evaluate(() => {
    const stage = document.getElementById("stage");
    const frame = document.getElementById("frame-1440");
    const lens = document.getElementById("lens-1440");
    const rail = document.getElementById("rail-1440");
    const cs = frame ? getComputedStyle(frame) : null;
    return {
      mockReady: window.__mockReady === true,
      mockError: window.__mockError || null,
      lensSettledExposed: typeof window.__lensSettled === "function",
      stageMotion: stage ? stage.getAttribute("data-motion") : null,
      frameLensState: frame ? frame.getAttribute("data-lens-state") : null,
      frameRect: frame ? frame.getBoundingClientRect() : null,
      frameTransform: cs ? cs.transform : null,
      lensOpen: lens ? lens.getAttribute("data-lens-open") : null,
      lensHeight: lens ? getComputedStyle(lens).getPropertyValue("--lens-height").trim() : null,
      railReadingIndex: rail ? rail.getAttribute("data-reading-index") : null,
      bodyBackground: getComputedStyle(document.body).backgroundColor,
    };
  });

  await page.screenshot({ path: path.join(outDir, "host-sim.png") });

  await browser.close();

  console.log("=== host-sim result ===");
  console.log("staticPaintOK:", insertResult.staticPaintOK);
  console.log("insertResult:", JSON.stringify(insertResult, null, 2));
  console.log("execResult:", JSON.stringify(execResult, null, 2));
  console.log("finalState:", JSON.stringify(finalState, null, 2));
  console.log("consoleErrors:", JSON.stringify(consoleErrors, null, 2));
  console.log("pageErrors:", JSON.stringify(pageErrors, null, 2));
  console.log(
    "externalRequests:",
    JSON.stringify(externalRequests.filter((u) => !u.startsWith("file:")), null, 2)
  );
}

main().catch((e) => {
  console.error("host-sim FAILED:", e);
  process.exit(1);
});
